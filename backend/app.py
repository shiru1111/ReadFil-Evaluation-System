from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import torch
import librosa
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
from pydub import AudioSegment
import re
from pymongo import MongoClient  # <--- Imported MongoClient

app = Flask(__name__)
CORS(app)

# <--- MongoDB Connection Setup --->
# REPLACE "YOUR_MONGODB_ATLAS_URI_HERE" with your actual connection string from MongoDB Atlas
client = MongoClient("mongodb+srv://admin:pH36VCD12S9BG5CS@readfil.j1thrv3.mongodb.net/?appName=READFIL")
db = client['readfil_database'] 
evaluations_collection = db['evaluations'] 
# <--------------------------------->

UPLOAD_FOLDER = 'temp_audio'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

print("Loading Wav2Vec 2.0 Tagalog Model... Please wait.")
MODEL_NAME = "Khalsuu/filipino-wav2vec2-l-xls-r-300m-official"
processor = Wav2Vec2Processor.from_pretrained(MODEL_NAME)
model = Wav2Vec2ForCTC.from_pretrained(MODEL_NAME)
print("Model loaded successfully!")

def convert_webm_to_wav(webm_path, wav_path):
    audio = AudioSegment.from_file(webm_path, format="webm")
    audio = audio.set_frame_rate(16000).set_channels(1)
    audio.export(wav_path, format="wav")

def transcribe_audio(wav_path):
    speech_array, sampling_rate = librosa.load(wav_path, sr=16000)
    inputs = processor(speech_array, sampling_rate=16000, return_tensors="pt", padding=True)
    with torch.no_grad():
        logits = model(inputs.input_values).logits
    predicted_ids = torch.argmax(logits, dim=-1)
    transcription = processor.batch_decode(predicted_ids)[0]
    return transcription, librosa.get_duration(y=speech_array, sr=16000)

def clean_text(text):
    """Removes punctuation and converts to lowercase for accurate mathematical comparison."""
    text = text.lower()
    return re.sub(r'[^a-z0-9\s]', '', text).split()

def modified_levenshtein(word1, word2):
    """
    Modified Levenshtein Distance calibrated to local phonetic theory.
    Reduces penalty for common Tagalog vowel shifts (e/i, o/u).
    """
    m, n = len(word1), len(word2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
        
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if word1[i-1] == word2[j-1]:
                cost = 0
            else:
                # Custom Tagalog Phonetic Rules
                char1, char2 = word1[i-1], word2[j-1]
                if (char1 in 'ei' and char2 in 'ei') or (char1 in 'ou' and char2 in 'ou'):
                    cost = 0.5  # Reduced penalty for valid regional vowel shifts
                else:
                    cost = 1.0  # Standard penalty for full mismatches
                    
            dp[i][j] = min(dp[i-1][j] + 1,       # Deletion
                           dp[i][j-1] + 1,       # Insertion
                           dp[i-1][j-1] + cost)  # Substitution
                           
    # Convert distance to a percentage of error for the specific word
    max_len = max(len(word1), len(word2))
    if max_len == 0:
        return 0
    return dp[m][n] / max_len

def needleman_wunsch_alignment(target_words, spoken_words):
    """
    Global sequence alignment to track insertions and deletions.
    Uses manuscript parameters: Match +5, Mismatch -4, Gap -1.
    """
    MATCH = 5
    MISMATCH = -4
    GAP = -1
    
    m, n = len(target_words), len(spoken_words)
    score = [[0] * (n + 1) for _ in range(m + 1)]
    
    for i in range(m + 1):
        score[i][0] = GAP * i
    for j in range(n + 1):
        score[0][j] = GAP * j
        
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            # Check for exact match or use MLD for slight phonetic variations
            dist = modified_levenshtein(target_words[i-1], spoken_words[j-1])
            if dist == 0:
                match_score = score[i-1][j-1] + MATCH
            elif dist < 0.4: # Allow minor phonetic shifts to pass as partial matches
                match_score = score[i-1][j-1] + (MATCH * (1 - dist))
            else:
                match_score = score[i-1][j-1] + MISMATCH
                
            delete_score = score[i-1][j] + GAP
            insert_score = score[i][j-1] + GAP
            score[i][j] = max(match_score, delete_score, insert_score)
            
    # Traceback to calculate final errors
    align_target, align_spoken = [], []
    i, j = m, n
    errors = 0
    correct_words = 0
    
    while i > 0 or j > 0:
        if i > 0 and j > 0:
            dist = modified_levenshtein(target_words[i-1], spoken_words[j-1])
            is_match = dist < 0.4
        else:
            is_match = False

        if i > 0 and j > 0 and score[i][j] == score[i-1][j-1] + (MATCH if dist == 0 else (MATCH * (1 - dist) if is_match else MISMATCH)):
            align_target.append(target_words[i-1])
            align_spoken.append(spoken_words[j-1])
            if is_match:
                correct_words += 1
            else:
                errors += 1
            i -= 1
            j -= 1
        elif i > 0 and score[i][j] == score[i-1][j] + GAP:
            align_target.append(target_words[i-1])
            align_spoken.append("-")
            errors += 1 # Deletion error
            i -= 1
        else:
            align_target.append("-")
            align_spoken.append(spoken_words[j-1])
            errors += 1 # Insertion error
            j -= 1
            
    return correct_words, errors

@app.route('/api/evaluate', methods=['POST'])
def evaluate_audio():
    if 'audio' not in request.files or 'target_text' not in request.form:
        return jsonify({"error": "Missing audio file or target text"}), 400
        
    audio_file = request.files['audio']
    target_text = request.form['target_text']
    
    if audio_file.filename == '':
        return jsonify({"error": "Empty audio file received"}), 400
        
    webm_path = os.path.join(UPLOAD_FOLDER, "latest_recording.webm")
    wav_path = os.path.join(UPLOAD_FOLDER, "latest_recording.wav")
    audio_file.save(webm_path)
    
    try:
        # Convert and Transcribe
        convert_webm_to_wav(webm_path, wav_path)
        transcription, duration_seconds = transcribe_audio(wav_path)
        
        # Prepare text for mathematical alignment
        target_words = clean_text(target_text)
        spoken_words = clean_text(transcription)
        
        # Execute Dual-Algorithm Framework
        correct_words, errors = needleman_wunsch_alignment(target_words, spoken_words)
        
        # Calculate Final Metrics
        total_target_words = len(target_words)
        accuracy_rate = 0
        if total_target_words > 0:
            accuracy_rate = max(0, ((total_target_words - errors) / total_target_words) * 100)
            
        duration_minutes = duration_seconds / 60.0
        wcpm = 0
        if duration_minutes > 0:
            wcpm = max(0, correct_words / duration_minutes)
            
        # <--- NEW: MongoDB Database Insertion --->
        evaluation_record = {
            "target_text": target_text,
            "transcription": transcription,
            "accuracy_rate": round(accuracy_rate, 2),
            "wcpm": round(wcpm, 2),
            "errors_detected": errors,
            "status": "success"
        }
        
        # This securely inserts the data into your MongoDB cluster
        evaluations_collection.insert_one(evaluation_record)
        # <--------------------------------------->
        
        # Return the data to the React Frontend (Notice we removed _id to avoid JSON serialization errors)
        evaluation_record.pop('_id', None)
        return jsonify(evaluation_record), 200
        
    except Exception as e:
        print(f"Error during processing: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)