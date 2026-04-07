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
    """
    Removes punctuation, converts to lowercase, and NORMALIZES Tagalog quirks.
    This stops the AI from penalizing the user for reading 'mga' as 'manga'.
    """
    if not text:
        return []
        
    text = str(text).lower()
    text = re.sub(r'[^a-z0-9\s]', '', text)
    words = text.split()
    
    normalized_words = []
    for w in words:
        if w == 'mga':
            normalized_words.append('manga')
        elif w == 'ng':
            normalized_words.append('nang')
        elif w == 'nang':
            normalized_words.append('nang') # Keep it consistent
        else:
            normalized_words.append(w)
            
    return normalized_words

def modified_levenshtein(word1, word2):
    """
    Calculates phonetic distance. 
    Returns a percentage of error between 0.0 (perfect) and 1.0 (completely different).
    """
    m, n = len(word1), len(word2)
    dp = [[0.0] * (n + 1) for _ in range(m + 1)]
    
    for i in range(m + 1):
        dp[i][0] = float(i)
    for j in range(n + 1):
        dp[0][j] = float(j)
        
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if word1[i-1] == word2[j-1]:
                dp[i][j] = dp[i-1][j-1]
            else:
                char1, char2 = word1[i-1], word2[j-1]
                # Forgive common Tagalog vowel shifts and soft consonant swaps
                if (char1 in 'ei' and char2 in 'ei') or (char1 in 'ou' and char2 in 'ou') or (char1 in 'dr' and char2 in 'dr'):
                    cost = 0.3  # Very small penalty
                else:
                    cost = 1.0  # Standard penalty
                    
                dp[i][j] = min(dp[i-1][j] + 1.0,         
                               dp[i][j-1] + 1.0,         
                               dp[i-1][j-1] + cost)      
                               
    max_len = max(len(word1), len(word2))
    if max_len == 0:
        return 0.0
    return dp[m][n] / float(max_len)

def needleman_wunsch_alignment(target_words, spoken_words):
    """
    RELAXED global sequence alignment.
    Allows for AI misspellings and focuses on conversational fluency.
    """
    MATCH = 5.0
    MISMATCH = -2.0 # Relaxed penalty so one wrong word doesn't break the sentence
    GAP = -2.0
    
    m, n = len(target_words), len(spoken_words)
    score = [[0.0] * (n + 1) for _ in range(m + 1)]
    pointers = [[None] * (n + 1) for _ in range(m + 1)]
    
    for i in range(m + 1):
        score[i][0] = GAP * i
        pointers[i][0] = 'U' 
    for j in range(n + 1):
        score[0][j] = GAP * j
        pointers[0][j] = 'L' 
        
    pointers[0][0] = None
    
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            dist = modified_levenshtein(target_words[i-1], spoken_words[j-1])
            
            # ---> RELAXED THRESHOLD: We now accept words up to 55% incorrect spelling 
            # to account for the AI mishearing you, as long as it's phonetically close.
            if dist <= 0.55: 
                match_score = score[i-1][j-1] + (MATCH * (1.0 - dist))
            else:
                match_score = score[i-1][j-1] + MISMATCH
                
            delete_score = score[i-1][j] + GAP
            insert_score = score[i][j-1] + GAP
            
            best_score = max(match_score, delete_score, insert_score)
            score[i][j] = best_score
            
            if best_score == match_score:
                pointers[i][j] = 'D'
            elif best_score == delete_score:
                pointers[i][j] = 'U'
            else:
                pointers[i][j] = 'L'
                
    i, j = m, n
    errors = 0
    correct_words = 0
    
    while i > 0 or j > 0:
        if pointers[i][j] == 'D':
            dist = modified_levenshtein(target_words[i-1], spoken_words[j-1])
            # Again, relaxed threshold here for the final count
            if dist <= 0.55:
                correct_words += 1
            else:
                errors += 1 
            i -= 1
            j -= 1
        elif pointers[i][j] == 'U':
            errors += 1 
            i -= 1
        elif pointers[i][j] == 'L':
            errors += 1 
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
        
# Calculate Final Metrics using strict Phil-IRI rubrics
        total_target_words = len(target_words)
        
        # Standard Formula: Correct Words = Total Target - Errors (Insertions + Deletions + Substitutions)
        # We cap it at 0 so heavy misreaders don't get negative scores
        final_correct_count = max(0, total_target_words - errors)
        
        accuracy_rate = 0.0
        if total_target_words > 0:
            accuracy_rate = (final_correct_count / total_target_words) * 100.0
            
        duration_minutes = duration_seconds / 60.0
        wcpm = 0.0
        if duration_minutes > 0:
            wcpm = final_correct_count / duration_minutes
            
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