from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import re
import numpy as np
import torch
import librosa
import soundfile as sf
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
from pydub import AudioSegment, effects
from faster_whisper import WhisperModel
from concurrent.futures import ThreadPoolExecutor

# IMPORT OUR SMART DICTIONARIES
from nlp_config import SYNONYM_PAIRS, ENCLITIC_Y_BASES, TAGALOG_PARTICLES

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'temp_audio'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

_executor = ThreadPoolExecutor(max_workers=2)

# =================================================================
# LOAD MODELS
# =================================================================
print("Loading Wav2Vec 2.0 (Filipino Acoustic Model)...")
W2V_MODEL_NAME = "Khalsuu/filipino-wav2vec2-l-xls-r-300m-official"
w2v_processor  = Wav2Vec2Processor.from_pretrained(W2V_MODEL_NAME)
_w2v_model_raw = Wav2Vec2ForCTC.from_pretrained(W2V_MODEL_NAME)

w2v_model = torch.quantization.quantize_dynamic(
    _w2v_model_raw, {torch.nn.Linear}, dtype=torch.qint8
)
w2v_model.eval()
print("Wav2Vec 2.0 loaded and quantized.")

print("Loading faster-whisper (base)...")
whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
print("Both models loaded. Dual-pipeline ready.\n")

# =================================================================
# AUDIO PREPROCESSING
# =================================================================
def convert_webm_to_wav(webm_path, wav_path):
    audio = AudioSegment.from_file(webm_path, format="webm")
    audio = audio.set_frame_rate(16000).set_channels(1)
    audio.export(wav_path, format="wav")

def preprocess_audio(input_wav_path, output_wav_path):
    audio_seg = AudioSegment.from_wav(input_wav_path)
    normalized = effects.normalize(audio_seg, headroom=0.1)
    normalized = normalized.set_frame_rate(16000).set_channels(1)
    normalized.export(output_wav_path, format="wav")

    speech, sr = librosa.load(output_wav_path, sr=16000)
    pre_emphasized = np.append(speech[0], speech[1:] - 0.97 * speech[:-1])
    trimmed, _ = librosa.effects.trim(pre_emphasized, top_db=25)

    if len(trimmed) < int(0.5 * sr):
        trimmed = pre_emphasized

    sf.write(output_wav_path, trimmed, sr)
    return librosa.get_duration(y=trimmed, sr=sr)

# =================================================================
# TRANSCRIPTION
# =================================================================
def transcribe_wav2vec(wav_path):
    speech_array, _ = librosa.load(wav_path, sr=16000)
    inputs = w2v_processor(speech_array, sampling_rate=16000, return_tensors="pt", padding=True)
    with torch.no_grad():
        logits = w2v_model(inputs.input_values).logits
    predicted_ids = torch.argmax(logits, dim=-1)
    return w2v_processor.batch_decode(predicted_ids)[0]

def transcribe_whisper(wav_path):
    segments, _ = whisper_model.transcribe(
        wav_path, language="tl", beam_size=3, vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=300)
    )
    return " ".join(seg.text.strip() for seg in segments)

# =================================================================
# TEXT NORMALIZATION
# =================================================================
def clean_text(text):
    """
    CLEANED: No hardcoded dictionaries here! Just pure punctuation stripping.
    """
    if not text:
        return []

    text = str(text).lower()
    text = re.sub(r"(\w+)'y\b",  r"\1 ay", text)
    text = re.sub(r"(\w+)'t\b",  r"\1 at", text)
    text = re.sub(r"(\w+)'ng\b", r"\1 ng", text)
    text = re.sub(r"(\w+)'m\b",  r"\1 mo", text)
    text = re.sub(r'(\w)-(\w)', r'\1\2', text)
    text = re.sub(r'[^a-z0-9\s]', '', text)

    return text.split()

# =================================================================
# PRE-PROCESSOR: Fix STT Segmentation Errors
# =================================================================
def fix_segmentation_errors(target_words, spoken_words):
    target_set = set(target_words)
    optimized  = []
    i = 0

    while i < len(spoken_words):
        current = spoken_words[i]

        # P1: enclitic-y
        if current.endswith('y') and len(current) > 3:
            base = current[:-1]
            if base in ENCLITIC_Y_BASES or base in target_set:
                optimized.extend([base, 'ay'])
                i += 1
                continue

        # P2: 2-word fuse
        if i < len(spoken_words) - 1:
            fused2 = current + spoken_words[i + 1]
            if fused2 in target_set:
                optimized.append(fused2)
                i += 2
                continue

        # P2b: overlap fuse
        if i < len(spoken_words) - 1:
            nxt = spoken_words[i + 1]
            if current and nxt and current[-1] == nxt[0]:
                overlap = current + nxt[1:]
                if overlap in target_set:
                    optimized.append(overlap)
                    i += 2
                    continue

        # P3: 3-word fuse
        if i < len(spoken_words) - 2:
            fused3 = current + spoken_words[i + 1] + spoken_words[i + 2]
            if fused3 in target_set:
                optimized.append(fused3)
                i += 3
                continue

        # P4: fused "at" prefix
        if current not in target_set and current.startswith('at') and len(current) > 4:
            optimized.extend(['at', current[2:]])
            i += 1
            continue

        # P5: particle prefix split
        if current not in target_set and len(current) > 4:
            split_done = False
            for particle in TAGALOG_PARTICLES:
                if current.startswith(particle) and len(current) > len(particle) + 2:
                    remainder = current[len(particle):]
                    if remainder in target_set:
                        optimized.extend([particle, remainder])
                        split_done = True
                        break
            if split_done:
                i += 1
                continue

        # P6: all-cut split
        if current not in target_set and len(current) > 3:
            split_done = False
            for cut in range(1, len(current)):
                p1, p2 = current[:cut], current[cut:]
                if p1 in target_set and p2 in target_set:
                    optimized.extend([p1, p2])
                    split_done = True
                    break
            if split_done:
                i += 1
                continue

        # P7: phrase snapper — fuzzy 2-word match
        if i < len(spoken_words) - 1:
            fused_spoken = current + spoken_words[i + 1]
            matched = False
            for j in range(len(target_words) - 1):
                fused_target = target_words[j] + target_words[j + 1]
                if len(fused_target) == len(fused_spoken):
                    if modified_levenshtein(fused_target, fused_spoken) <= 0.15:
                        # ONLY snap if there is NO standard Tagalog vowel shift
                        if not has_vowel_shift(fused_target, fused_spoken):
                            optimized.extend([target_words[j], target_words[j + 1]])
                            i += 2
                            matched = True
                            break
            if matched:
                continue
                
        # P8: TWO-WAY SYNONYM SNAPPER (Imported from nlp_config.py)
        if current not in target_set:
            word_snapped = False
            for pair in SYNONYM_PAIRS:
                if current in pair:
                    for syn in pair:
                        if syn != current and syn in target_set:
                            optimized.append(syn)
                            word_snapped = True
                            break
                if word_snapped:
                    break
            
            if word_snapped:
                i += 1
                continue

        optimized.append(current)
        i += 1

    return optimized

# =================================================================
# SCORING ALGORITHMS
# =================================================================
def phonetic_normalize(word):
    if not word:
        return ""
    w = word.lower()
    # Normalize common Tagalog/Spanish/English phonetic variations:
    w = w.replace('ch', 'ts')
    w = w.replace('j', 'dy')
    w = w.replace('sh', 'sy')
    w = w.replace('f', 'p')
    w = w.replace('v', 'b')
    w = w.replace('z', 's')
    w = w.replace('c', 'k')  # 'c' is usually 'k' in Tagalog phonetics (e.g. kochi -> kotsi)
    return w

def modified_levenshtein(word1, word2):
    w1 = phonetic_normalize(word1)
    w2 = phonetic_normalize(word2)
    m, n = len(w1), len(w2)
    dp = [[0.0] * (n + 1) for _ in range(m + 1)]

    for i in range(m + 1): dp[i][0] = float(i)
    for j in range(n + 1): dp[0][j] = float(j)

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if w1[i - 1] == w2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                c1, c2 = w1[i - 1], w2[j - 1]
                
                # Check for standard Tagalog vowel shifts (e.g., e <-> i, o <-> u)
                # which are common regional accent variations (such as Bisaya or Batangueño)
                is_vowel_shift = (c1 == 'e' and c2 == 'i') or (c1 == 'i' and c2 == 'e') or \
                                 (c1 == 'o' and c2 == 'u') or (c1 == 'u' and c2 == 'o')
                
                # Check for other Tagalog consonant/phonetic variations
                is_consonant_shift = (c1 == 'd' and c2 == 'r') or (c1 == 'r' and c2 == 'd') or \
                                     (c1 == 'l' and c2 == 'r') or (c1 == 'r' and c2 == 'l')
                
                if is_vowel_shift or is_consonant_shift:
                    cost = 0.3  # Apply minimum penalization for valid Tagalog phonetic shifts
                else:
                    cost = 1.0  # Apply standard substitution penalty for general mismatches
                dp[i][j] = min(
                    dp[i - 1][j] + 1.0,
                    dp[i][j - 1] + 1.0,
                    dp[i - 1][j - 1] + cost
                )

    max_len = max(len(w1), len(w2))
    if max_len == 0: return 0.0
    return dp[m][n] / float(max_len)

def needleman_wunsch_alignment(target_words, spoken_words):
    MATCH    =  5.0
    MISMATCH = -2.0
    GAP      = -2.0

    m, n = len(target_words), len(spoken_words)
    score    = [[0.0]  * (n + 1) for _ in range(m + 1)]
    pointers = [[None] * (n + 1) for _ in range(m + 1)]

    for i in range(m + 1):
        score[i][0]    = GAP * i
        pointers[i][0] = 'U'
    for j in range(n + 1):
        score[0][j]    = GAP * j
        pointers[0][j] = 'L'
    pointers[0][0] = None

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            dist = modified_levenshtein(target_words[i - 1], spoken_words[j - 1])
            if dist <= 0.55:
                match_score = score[i - 1][j - 1] + (MATCH * (1.0 - dist))
            else:
                match_score = score[i - 1][j - 1] + MISMATCH
            delete_score = score[i - 1][j] + GAP
            insert_score = score[i][j - 1] + GAP
            best_score   = max(match_score, delete_score, insert_score)
            score[i][j]  = best_score

            if best_score == match_score: pointers[i][j] = 'D'
            elif best_score == delete_score: pointers[i][j] = 'U'
            else: pointers[i][j] = 'L'

    i, j = m, n
    errors = 0
    correct_words = 0

    while i > 0 or j > 0:
        if pointers[i][j] == 'D':
            dist = modified_levenshtein(target_words[i - 1], spoken_words[j - 1])
            if dist <= 0.55: correct_words += 1
            else: errors += 1
            i -= 1; j -= 1
        elif pointers[i][j] == 'U':
            errors += 1; i -= 1
        elif pointers[i][j] == 'L':
            errors += 1; j -= 1

    return correct_words, errors

def get_alignment_mapping(target_words, spoken_words):
    MATCH    =  5.0
    MISMATCH = -2.0
    GAP      = -2.0

    m, n = len(target_words), len(spoken_words)
    score    = [[0.0]  * (n + 1) for _ in range(m + 1)]
    pointers = [[None] * (n + 1) for _ in range(m + 1)]

    for i in range(m + 1):
        score[i][0]    = GAP * i
        pointers[i][0] = 'U'
    for j in range(n + 1):
        score[0][j]    = GAP * j
        pointers[0][j] = 'L'
    pointers[0][0] = None

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            dist = modified_levenshtein(target_words[i - 1], spoken_words[j - 1])
            if dist <= 0.55:
                match_score = score[i - 1][j - 1] + (MATCH * (1.0 - dist))
            else:
                match_score = score[i - 1][j - 1] + MISMATCH
            delete_score = score[i - 1][j] + GAP
            insert_score = score[i][j - 1] + GAP
            best_score   = max(match_score, delete_score, insert_score)
            score[i][j]  = best_score

            if best_score == match_score: pointers[i][j] = 'D'
            elif best_score == delete_score: pointers[i][j] = 'U'
            else: pointers[i][j] = 'L'

    i, j = m, n
    spoken_to_target = {}
    target_to_spoken = {}

    while i > 0 or j > 0:
        if pointers[i][j] == 'D':
            spoken_to_target[j - 1] = i - 1
            target_to_spoken[i - 1] = spoken_words[j - 1]
            i -= 1; j -= 1
        elif pointers[i][j] == 'U':
            target_to_spoken[i - 1] = None
            i -= 1
        elif pointers[i][j] == 'L':
            spoken_to_target[j - 1] = None
            j -= 1

    return spoken_to_target, target_to_spoken

def fuse_best_with_other(target_words, best_opt, other_opt):
    best_spoken_to_target, best_target_to_spoken = get_alignment_mapping(target_words, best_opt)
    other_spoken_to_target, other_target_to_spoken = get_alignment_mapping(target_words, other_opt)
    
    fused_opt = list(best_opt)
    
    for idx_best, target_idx in best_spoken_to_target.items():
        if target_idx is not None:
            target_word = target_words[target_idx]
            best_word = best_opt[idx_best]
            
            if best_word != target_word:
                other_word = other_target_to_spoken.get(target_idx)
                if other_word is not None:
                    dist_best = modified_levenshtein(target_word, best_word)
                    dist_other = modified_levenshtein(target_word, other_word)
                    
                    import re
                    def contains_double_consonant(w):
                        return bool(re.search(r'([b-df-hj-np-tv-z])\1', w.lower()))
                        
                    is_better = False
                    if dist_other < dist_best:
                        is_better = True
                    elif dist_other == dist_best:
                        # Tie-breaker: If best_word has double consonants not present in target, but other_word does not
                        if contains_double_consonant(best_word) and not contains_double_consonant(other_word) and not contains_double_consonant(target_word):
                            is_better = True
                            
                    if is_better:
                        fused_opt[idx_best] = other_word
                        print(f"[Fusion Correction] Replacing '{best_word}' with '{other_word}' for target '{target_word}'")
                        
    return fused_opt

def has_vowel_shift(word1, word2):
    m, n = len(word1), len(word2)
    dp = [[0.0] * (n + 1) for _ in range(m + 1)]
    has_v_shift = [[False] * (n + 1) for _ in range(m + 1)]

    for i in range(m + 1): dp[i][0] = float(i)
    for j in range(n + 1): dp[0][j] = float(j)

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if word1[i - 1] == word2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
                has_v_shift[i][j] = has_v_shift[i - 1][j - 1]
            else:
                c1, c2 = word1[i - 1], word2[j - 1]
                is_vowel_shift = (c1 == 'e' and c2 == 'i') or (c1 == 'i' and c2 == 'e') or \
                                 (c1 == 'o' and c2 == 'u') or (c1 == 'u' and c2 == 'o')
                is_consonant_shift = (c1 == 'd' and c2 == 'r') or (c1 == 'r' and c2 == 'd') or \
                                     (c1 == 'l' and c2 == 'r') or (c1 == 'r' and c2 == 'l') or \
                                     (c1 == 'c' and c2 == 'k') or (c1 == 'k' and c2 == 'c')
                
                cost = 0.3 if (is_vowel_shift or is_consonant_shift) else 1.0
                
                d_val = dp[i - 1][j] + 1.0
                i_val = dp[i][j - 1] + 1.0
                s_val = dp[i - 1][j - 1] + cost
                
                best = min(d_val, i_val, s_val)
                dp[i][j] = best
                
                if best == s_val:
                    has_v_shift[i][j] = has_v_shift[i - 1][j - 1] or is_vowel_shift
                elif best == d_val:
                    has_v_shift[i][j] = has_v_shift[i - 1][j]
                else:
                    has_v_shift[i][j] = has_v_shift[i][j - 1]
                    
    return has_v_shift[m][n]

def is_pure_vowel_shift(word1, word2):
    if len(word1) != len(word2):
        return False
    diff_count = 0
    for c1, c2 in zip(word1, word2):
        if c1 != c2:
            is_vowel_shift = (c1 == 'e' and c2 == 'i') or (c1 == 'i' and c2 == 'e') or \
                             (c1 == 'o' and c2 == 'u') or (c1 == 'u' and c2 == 'o')
            if not is_vowel_shift:
                return False
            diff_count += 1
    return diff_count > 0

def deduplicate_whisper_hallucinations(fused_opt, other_opt, target_words):
    spoken_to_target, _ = get_alignment_mapping(target_words, fused_opt)
    
    to_remove = set()
    n = len(fused_opt)
    
    for idx in range(n):
        if spoken_to_target.get(idx) is None:
            for adj_idx in [idx - 1, idx + 1]:
                if 0 <= adj_idx < n and spoken_to_target.get(adj_idx) is not None:
                    ins_word = fused_opt[idx]
                    match_word = fused_opt[adj_idx]
                    
                    is_prefix = match_word.startswith(ins_word) and len(ins_word) >= 3
                    is_suffix = match_word.endswith(ins_word) and len(ins_word) >= 3
                    
                    if is_prefix or is_suffix:
                        other_has_both_adjacent = False
                        for o_idx in range(len(other_opt) - 1):
                            if (other_opt[o_idx] == ins_word and other_opt[o_idx + 1] == match_word) or \
                               (other_opt[o_idx] == match_word and other_opt[o_idx + 1] == ins_word):
                                other_has_both_adjacent = True
                                break
                        
                        if not other_has_both_adjacent:
                            ins_in_other = ins_word in other_opt
                            match_in_other = match_word in other_opt
                            
                            if ins_in_other and not match_in_other:
                                to_remove.add(adj_idx)
                            elif match_in_other and not ins_in_other:
                                to_remove.add(idx)
                            else:
                                to_remove.add(idx)
                                
    cleaned_opt = [fused_opt[i] for i in range(n) if i not in to_remove]
    return cleaned_opt

def score_candidate(target_words, raw_transcription):
    spoken   = clean_text(raw_transcription)
    optimized = fix_segmentation_errors(target_words, spoken)
    correct, errors = needleman_wunsch_alignment(target_words, optimized)
    total    = len(target_words)
    fc       = max(0, total - errors)
    accuracy = (fc / total * 100.0) if total > 0 else 0.0
    return accuracy, fc, errors, optimized

# =================================================================
# API ENDPOINT
# =================================================================
@app.route('/api/evaluate', methods=['POST'])
def evaluate_audio():
    if 'audio' not in request.files or 'target_text' not in request.form:
        return jsonify({"error": "Missing audio file or target text"}), 400

    audio_file  = request.files['audio']
    target_text = request.form['target_text']

    if audio_file.filename == '':
        return jsonify({"error": "Empty audio file received"}), 400

    webm_path      = os.path.join(UPLOAD_FOLDER, "latest_recording.webm")
    wav_raw_path   = os.path.join(UPLOAD_FOLDER, "latest_recording_raw.wav")
    wav_clean_path = os.path.join(UPLOAD_FOLDER, "latest_recording_clean.wav")
    audio_file.save(webm_path)

    try:
        convert_webm_to_wav(webm_path, wav_raw_path)
        duration_seconds = preprocess_audio(wav_raw_path, wav_clean_path)

        future_w2v     = _executor.submit(transcribe_wav2vec, wav_clean_path)
        future_whisper = _executor.submit(transcribe_whisper, wav_clean_path)

        wav2vec_raw = future_w2v.result() 
        whisper_raw = future_whisper.result() 

        # Check if no audio/speech was transcribed (empty or silent audio)
        if not wav2vec_raw.strip() and not whisper_raw.strip():
            return jsonify({
                "error": "No speech detected. Please speak clearly into the microphone.",
                "status": "empty"
            }), 400

        target_words = clean_text(target_text)

        w2v_acc, w2v_correct, w2v_errors, w2v_opt = score_candidate(target_words, wav2vec_raw)
        whi_acc, whi_correct, whi_errors, whi_opt = score_candidate(target_words, whisper_raw)

        # -------------------------------------------------------------
        # STEP 5: TIE-BREAKER LOGIC
        # If accuracies are tied, calculate exact character-level phonetic closeness.
        # -------------------------------------------------------------
        if w2v_acc > whi_acc:
            winner, best_acc, best_correct, best_errors, best_opt = \
                "WAV2VEC", w2v_acc, w2v_correct, w2v_errors, w2v_opt
            other_opt = whi_opt
                
        elif whi_acc > w2v_acc:
            winner, best_acc, best_correct, best_errors, best_opt = \
                "WHISPER", whi_acc, whi_correct, whi_errors, whi_opt
            other_opt = w2v_opt
                
        else: # IT'S A TIE
            # Combine arrays into strings for a pure character-level assessment
            target_str = "".join(target_words)
            w2v_str = "".join(w2v_opt)
            whi_str = "".join(whi_opt)
            
            # The model with the lower Levenshtein distance to the target string wins
            w2v_distance = modified_levenshtein(target_str, w2v_str)
            whi_distance = modified_levenshtein(target_str, whi_str)
            
            if w2v_distance < whi_distance:
                winner, best_acc, best_correct, best_errors, best_opt = \
                    "WAV2VEC (Tie-Breaker)", w2v_acc, w2v_correct, w2v_errors, w2v_opt
                other_opt = whi_opt
            else:
                winner, best_acc, best_correct, best_errors, best_opt = \
                    "WHISPER (Tie-Breaker)", whi_acc, whi_correct, whi_errors, whi_opt
                other_opt = w2v_opt

        # Apply word-level alignment fusion to correct spelling/words using the losing candidate if it is a closer match
        fused_opt = fuse_best_with_other(target_words, best_opt, other_opt)

        # Deduplicate Whisper hallucinations/repetitions (e.g. natu natutuhan -> natu, or nakapanggagamot mot -> nakapanggagamot)
        fused_opt = deduplicate_whisper_hallucinations(fused_opt, other_opt, target_words)

        # Get alignment mapping to identify words that align to target words and are graded correct (distance <= 0.55)
        fused_spoken_to_target, _ = get_alignment_mapping(target_words, fused_opt)
        
        # Snap correct spoken words to their exact target spellings to prevent visual frontend highlights
        final_opt = list(fused_opt)
        for idx_spoken, idx_target in fused_spoken_to_target.items():
            if idx_target is not None:
                target_word = target_words[idx_target]
                spoken_word = fused_opt[idx_spoken]
                
                # Check distance (using the phonetically aware modified_levenshtein)
                dist = modified_levenshtein(target_word, spoken_word)
                if dist <= 0.25:
                    # Allow snapping if length difference is at most 1 character (handles missing/extra letters like bbe/bbi)
                    if abs(len(target_word) - len(spoken_word)) <= 1:
                        final_opt[idx_spoken] = target_word

        fused_transcription = " ".join(final_opt)

        # Recalculate errors on the final snapped/corrected output
        _, final_errors = needleman_wunsch_alignment(target_words, final_opt)
        best_errors = final_errors

        total_target_words  = len(target_words)
        final_correct_count = max(0, total_target_words - best_errors)

        accuracy_rate = 0.0
        if total_target_words > 0:
            accuracy_rate = (final_correct_count / total_target_words) * 100.0

        duration_minutes = duration_seconds / 60.0
        wcpm = 0.0
        if duration_minutes > 0:
            wcpm = final_correct_count / duration_minutes

# Terminal dashboard
            print(f"\n{'='*70}")
            print(f" TARGET         : {target_text}")
            print(f" WAV2VEC (raw)  : {wav2vec_raw}")
            print(f" WHISPER  (raw) : {whisper_raw}")
            print(f" WAV2VEC score  : {w2v_acc:.1f}%  ({w2v_errors} errors)")
            print(f" WHISPER  score : {whi_acc:.1f}%  ({whi_errors} errors)")
            print(f" USED           : {fused_transcription}")
            print(f" SCORE          : Accuracy: {round(accuracy_rate,2)}% | WCPM: {round(wcpm,2)}")
            print(f" CORRECT        : {final_correct_count} / {total_target_words}")
            
            # ---> ADD THIS LINE RIGHT HERE <---
            print(f" DURATION       : {round(duration_seconds, 2)} seconds") 
            
            print(f"{'='*70}\n")

        evaluation_record = {
            "target_text":      target_text,
            "transcription":    fused_transcription,
            "accuracy_rate":    round(accuracy_rate, 2),
            "wcpm":             round(wcpm, 2),
            "errors_detected":  best_errors,
            "correct_words":    final_correct_count,
            "duration_seconds": round(duration_seconds, 3),
            "model_used":       winner,
            "status":           "success"
        }

        return jsonify(evaluation_record), 200

    except Exception as e:
        print(f"Error during processing: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)