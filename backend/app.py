from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import sys
import re
import numpy as np
import torch
import librosa
import soundfile as sf
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
from pydub import AudioSegment, effects
from faster_whisper import WhisperModel
from concurrent.futures import ThreadPoolExecutor

class SafeStream:
    def __init__(self, original_stream):
        self.original_stream = original_stream

    def write(self, data):
        try:
            if self.original_stream:
                self.original_stream.write(data)
        except OSError as e:
            if e.errno != 22:  # Swallow [Errno 22] Invalid argument
                raise
        except Exception:
            pass

    def flush(self):
        try:
            if self.original_stream:
                self.original_stream.flush()
        except OSError as e:
            if e.errno != 22:  # Swallow [Errno 22] Invalid argument
                raise
        except Exception:
            pass

    def __getattr__(self, name):
        return getattr(self.original_stream, name)

sys.stdout = SafeStream(sys.stdout)
sys.stderr = SafeStream(sys.stderr)


# IMPORT OUR SMART DICTIONARIES
from nlp_config import SYNONYM_PAIRS, ENCLITIC_Y_BASES, TAGALOG_PARTICLES

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp_audio')
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
    trimmed, _ = librosa.effects.trim(speech, top_db=25)

    if len(trimmed) < int(0.5 * sr):
        trimmed = speech

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
        vad_parameters=dict(min_silence_duration_ms=1000)
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
    text = re.sub(r"(\w+)['’`]y\b",  r"\1 ay", text)
    text = re.sub(r"(\w+)['’`]t\b",  r"\1 at", text)
    text = re.sub(r"(\w+)['’`]ng\b", r"\1 ng", text)
    text = re.sub(r"(\w+)['’`]m\b",  r"\1 mo", text)
    text = re.sub(r"(\w)[-\u2010-\u2015\ufe63\uff0d](\w)", r"\1\2", text)
    text = re.sub(r'[^a-z0-9\s]', '', text)

    return text.split()


def find_phonetic_target_match(fused_word, target_set):
    """Check if fused_word phonetically matches any word in target_set.
    Returns the matching target word, or None if no match found.
    Used as a fallback when exact-match fusion fails, to catch
    vowel-shifted fusions (e.g. 'omaga' matching 'umaga')."""
    for t_word in target_set:
        if is_correct_pronunciation(t_word, fused_word):
            return t_word
    return None

# PRE-PROCESSOR: Fix STT Segmentation Errors
# =================================================================
def fix_segmentation_errors(target_words, spoken_words):
    target_set = set(target_words)
    optimized  = []
    i = 0

    while i < len(spoken_words):
        current = spoken_words[i]

        # P0: SYNONYM SNAPPER — runs FIRST so synonym matches (e.g. kanyang→kaniyang)
        # take priority over any splitting rules that might incorrectly break the word.
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

        # P0.5: RUN-ON MULTI-WORD SPLIT
        # If the spoken word is a concatenation of 2 to 4 consecutive target words,
        # split it into those individual target words. E.g. "pasiflorante" -> "pa", "si", "florante"
        if current not in target_set and len(current) > 3:
            best_match_score = -1
            best_k = -1
            best_N = -1
            target_est = i * (len(target_words) / len(spoken_words)) if len(spoken_words) > 0 else 0

            for k in range(len(target_words)):
                for N in range(2, 5):  # 2 to 4 words
                    if k + N <= len(target_words):
                        t_sub = target_words[k : k + N]
                        concat_target = "".join(t_sub)
                        
                        if concat_target == current:
                            score = 2
                        elif is_correct_pronunciation(concat_target, current):
                            score = 1
                        else:
                            continue
                            
                        is_better = False
                        if score > best_match_score:
                            is_better = True
                        elif score == best_match_score:
                            prev_dist = abs(best_k - target_est)
                            curr_dist = abs(k - target_est)
                            if curr_dist < prev_dist:
                                is_better = True
                                
                        if is_better:
                            best_match_score = score
                            best_k = k
                            best_N = N
                            
            if best_match_score != -1:
                optimized.extend(target_words[best_k : best_k + best_N])
                i += 1
                continue

        # P1: enclitic-y
        if current.endswith('y') and len(current) > 3:
            base = current[:-1]
            if base in ENCLITIC_Y_BASES or base in target_set:
                optimized.extend([base, 'ay'])
                i += 1
                continue

        # P2: 2-word fuse
        if i < len(spoken_words) - 1:
            nxt = spoken_words[i + 1]
            fused2 = current + nxt
            if fused2 in target_set:
                optimized.append(fused2)
                i += 2
                continue
            # Vowel-shifted fuse: e.g. "o"+"maga" → "omaga" matches "umaga"
            # Do not swallow nxt if it is a target word or a synonym of a target word
            is_nxt_target = (nxt in target_set or 
                             any(nxt in pair and any(s in target_set for s in pair) for pair in SYNONYM_PAIRS))
            if not is_nxt_target:
                fused2_target = find_phonetic_target_match(fused2, target_set)
                if fused2_target is not None:
                    optimized.append(fused2)  # keep spoken form for penalty detection
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
                # Vowel-shifted overlap fuse
                # Do not swallow nxt if it is a target word or a synonym of a target word
                is_nxt_target = (nxt in target_set or 
                                 any(nxt in pair and any(s in target_set for s in pair) for pair in SYNONYM_PAIRS))
                if not is_nxt_target:
                    overlap_target = find_phonetic_target_match(overlap, target_set)
                    if overlap_target is not None:
                        optimized.append(overlap)  # keep spoken form
                        i += 2
                        continue



        # P3: 3-word fuse
        if i < len(spoken_words) - 2:
            fused3 = current + spoken_words[i + 1] + spoken_words[i + 2]
            if fused3 in target_set:
                optimized.append(fused3)
                i += 3
                continue
            # Vowel-shifted 3-word fuse: e.g. "to"+"mo"+"long" → "tomolong" matches "tumulong"
            fused3_target = find_phonetic_target_match(fused3, target_set)
            if fused3_target is not None:
                optimized.append(fused3)  # keep spoken form for penalty detection
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
                    matched_target = None
                    if remainder in target_set:
                        matched_target = remainder
                    else:
                        for t_word in target_set:
                            if is_correct_pronunciation(t_word, remainder):
                                matched_target = t_word
                                break
                    if matched_target is not None:
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
                p1_match = None
                p2_match = None
                
                if p1 in target_set:
                    p1_match = p1
                else:
                    for t_word in target_set:
                        if is_correct_pronunciation(t_word, p1):
                            p1_match = t_word
                            break
                            
                if p2 in target_set:
                    p2_match = p2
                else:
                    for t_word in target_set:
                        if is_correct_pronunciation(t_word, p2):
                            p2_match = t_word
                            break
                            
                if p1_match is not None and p2_match is not None:
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
                if abs(len(fused_target) - len(fused_spoken)) <= 2:
                    if modified_levenshtein(fused_target, fused_spoken) <= 0.15:
                        # ONLY snap if there is NO standard Tagalog vowel shift
                        if not has_vowel_shift(fused_target, fused_spoken):
                            optimized.extend([target_words[j], target_words[j + 1]])
                            i += 2
                            matched = True
                            break
            if matched:
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
    # Collapse duplicate consonants (e.g., kk -> k, ll -> l, tt -> t, pp -> p, mm -> m, nn -> n, etc.)
    w = re.sub(r'([b-df-hj-np-tv-z])\1+', r'\1', w)

    # Normalize Tagalog dipthong vowels and phonetic variations:
    w = w.replace('y', 'i')
    w = w.replace('w', 'o')
    w = w.replace('ch', 'ts')
    w = w.replace('j', 'dy')
    w = w.replace('sh', 'sy')
    w = w.replace('f', 'p')
    w = w.replace('v', 'b')
    w = w.replace('z', 's')
    w = w.replace('c', 'k')  # 'c' is usually 'k' in Tagalog phonetics (e.g. kochi -> kotsi)
    return w

def is_correct_pronunciation(target, spoken):
    if not target or not spoken:
        return False
    t_norm = phonetic_normalize(target)
    s_norm = phonetic_normalize(spoken)
    if t_norm == s_norm:
        return True
    dist = modified_levenshtein(target, spoken)
    # Strict phonetic approximation limits (e.g., allowing "bbe" -> "bibe" but not "palalaka" -> "palaka")
    if dist <= 0.25 and abs(len(target) - len(spoken)) <= 1:
        return True
    return False

def align_chars(target, spoken):
    m, n = len(target), len(spoken)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1): dp[i][0] = i
    for j in range(n + 1): dp[0][j] = j
    
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if target[i - 1] == spoken[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + 1)
                
    i, j = m, n
    aligned = []
    while i > 0 or j > 0:
        if i > 0 and j > 0 and (target[i - 1] == spoken[j - 1] or dp[i][j] == dp[i - 1][j - 1] + 1):
            aligned.append((target[i - 1], spoken[j - 1]))
            i -= 1; j -= 1
        elif i > 0 and (j == 0 or dp[i][j] == dp[i - 1][j] + 1):
            aligned.append((target[i - 1], '-'))
            i -= 1
        else:
            aligned.append(('-', spoken[j - 1]))
            j -= 1
            
    aligned.reverse()
    
    result = []
    for t_char, s_char in aligned:
        if t_char != '-':
            result.append((t_char, s_char))
            
    while len(result) < len(target):
        result.append((target[len(result)], '-'))
        
    return result

def repair_word(target_word, w2v_word, whi_word):
    if not w2v_word:
        return whi_word
    if not whi_word:
        return w2v_word
        
    if w2v_word == target_word or is_correct_pronunciation(target_word, w2v_word):
        return w2v_word
    
    # EXTRA-SYLLABLE GUARD: if the winner has significantly more
    # characters than the target, the student genuinely spoke extra
    # content — keep the winner's word, don't override it.
    if len(w2v_word) > len(target_word) + 1:
        return w2v_word
    
    if whi_word == target_word or is_correct_pronunciation(target_word, whi_word):
        return whi_word

    w2v_align = align_chars(target_word, w2v_word)
    whi_align = align_chars(target_word, whi_word)
    
    reconstructed = []
    for (t_char, w_char), (_, h_char) in zip(w2v_align, whi_align):
        # CONSENSUS: if both models agree on this character, trust them
        # even when it differs from the target.
        if w_char == h_char and w_char != '-':
            reconstructed.append(w_char)
        elif w_char == t_char:
            reconstructed.append(w_char)
        elif h_char == t_char:
            reconstructed.append(h_char)
        else:
            if w_char != '-':
                reconstructed.append(w_char)
            elif h_char != '-':
                reconstructed.append(h_char)
                
    return "".join(reconstructed)

def both_have_vowel_shift(target, spoken, other):
    if not target or not spoken or not other:
        return False
    s_align = align_chars(target, spoken)
    o_align = align_chars(target, other)
    for (t_char1, s_char), (_, o_char) in zip(s_align, o_align):
        if t_char1 == 'u' and s_char == 'o' and o_char == 'o':
            return True
        if t_char1 == 'i' and s_char == 'e' and o_char == 'e':
            return True
    return False

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



def needleman_wunsch_alignment(target_words, spoken_words, vowel_shifted_targets=None):
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
            is_correct = is_correct_pronunciation(target_words[i - 1], spoken_words[j - 1])
            if vowel_shifted_targets and (i - 1) in vowel_shifted_targets:
                is_correct = False
            
            if is_correct:
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
            is_correct = is_correct_pronunciation(target_words[i - 1], spoken_words[j - 1])
            if vowel_shifted_targets and (i - 1) in vowel_shifted_targets:
                is_correct = False
                
            if is_correct:
                correct_words += 1
            else:
                errors += 1
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
            if is_correct_pronunciation(target_words[i - 1], spoken_words[j - 1]):
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

def models_same_letters(w2v_words, whi_words):
    """
    Returns True when both models produced the exact same character sequence,
    regardless of where they placed spaces (e.g. 'simila' vs 'si mila').
    """
    w2v_chars = "".join(w2v_words)
    whi_chars = "".join(whi_words)
    return w2v_chars == whi_chars


def letter_level_merge_models(target_words, w2v_words, whi_words):
    """
    Both models produced the same character sequence (only spacing differs).
    This function resolves the best word-segmentation WITHOUT changing any
    spoken character.

    Rule: the spoken letters are treated as ground-truth of what the speaker
    said.  We NEVER substitute a target character for a spoken one.
    If both models heard "nakikita" and the target is "nakita", the returned
    token list will contain "nakikita" — the scorer then marks it as an error.

    Segmentation strategy:
      1. Both models share the same char-string S (spaces stripped).
      2. If len(S) == len(target chars): slice S at target word boundaries.
         Each slice is the spoken syllables for that position — characters
         unchanged, only spacing re-inserted at target boundaries.
      3. Otherwise (insertion/deletion): keep whichever model's word-list
         aligns more correct words against the target.
    """
    agreed_str = "".join(w2v_words)   # == "".join(whi_words) by definition
    target_str = "".join(target_words)

    if len(agreed_str) == len(target_str):
        # Slice at target word boundaries — spoken chars preserved exactly.
        result = []
        pos = 0
        for tw in target_words:
            result.append(agreed_str[pos : pos + len(tw)])
            pos += len(tw)
        return result

    # Lengths differ — pick the model segmentation that aligns better.
    w2v_correct, _ = needleman_wunsch_alignment(target_words, w2v_words)
    whi_correct, _ = needleman_wunsch_alignment(target_words, whi_words)

    return list(w2v_words) if w2v_correct >= whi_correct else list(whi_words)


def deduplicate_whisper_hallucinations(fused_opt, other_opt, target_words):
    spoken_to_target, _ = get_alignment_mapping(target_words, fused_opt)
    target_set = set(target_words)
    
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
                    
                    if (is_prefix or is_suffix) and ins_word not in target_set:
                        to_remove.add(idx)
                        break
                        
    cleaned_opt = [fused_opt[i] for i in range(n) if i not in to_remove]
    return cleaned_opt

def merge_syllable_hallucinations_and_stutters(spoken_words, target_words):
    spoken_to_target, _ = get_alignment_mapping(target_words, spoken_words)
    
    merged = list(spoken_words)
    to_remove = set()
    n = len(spoken_words)
    
    for idx in range(n):
        if spoken_to_target.get(idx) is not None:
            target_idx = spoken_to_target[idx]
            target_word = target_words[target_idx]
            target_chars = set(phonetic_normalize(target_word))
            
            # Forward check
            j = idx + 1
            while j < n and spoken_to_target.get(j) is None:
                adj_word = merged[j]
                adj_chars = set(phonetic_normalize(adj_word))
                if adj_chars.issubset(target_chars) and len(adj_word) <= 4:
                    merged[idx] = merged[idx] + adj_word
                    to_remove.add(j)
                    j += 1
                else:
                    break
                    
            # Backward check
            j = idx - 1
            while j >= 0 and spoken_to_target.get(j) is None and j not in to_remove:
                adj_word = merged[j]
                adj_chars = set(phonetic_normalize(adj_word))
                if adj_chars.issubset(target_chars) and len(adj_word) <= 4:
                    merged[idx] = adj_word + merged[idx]
                    to_remove.add(j)
                    j -= 1
                else:
                    break
                    
    cleaned = [merged[i] for i in range(n) if i not in to_remove]
    return cleaned

def score_candidate(target_words, raw_transcription):
    spoken   = clean_text(raw_transcription)
    optimized = fix_segmentation_errors(target_words, spoken)
    correct, errors = needleman_wunsch_alignment(target_words, optimized)
    total    = len(target_words)
    fc       = max(0, total - errors)
    accuracy = (fc / total * 100.0) if total > 0 else 0.0
    return accuracy, fc, errors, optimized

def reconstruct_contractions(target_text, transcription):
    dash_apos = r"['’`]"
    contractions = re.findall(rf"\b\w+{dash_apos}(?:y|t|ng|m)\b", target_text)
    
    for contract in contractions:
        c_lower = contract.lower()
        apos_match = re.search(dash_apos, c_lower)
        if not apos_match:
            continue
        apos_idx = apos_match.start()
        base = c_lower[:apos_idx]
        suffix = c_lower[apos_idx+1:]
        
        if suffix == "y":
            expanded = base + " ay"
        elif suffix == "t":
            expanded = base + " at"
        elif suffix == "ng":
            expanded = base + " ng"
        elif suffix == "m":
            expanded = base + " mo"
        else:
            continue
            
        pattern = re.compile(rf"\b{re.escape(expanded)}\b", re.IGNORECASE)
        transcription = pattern.sub(contract, transcription)
        
    return transcription

def match_original_casing_and_punctuation(target_text, transcription):
    import re
    dash_apos = r"[-'\u2010-\u2015\ufe63\uff0d’‘`]"
    
    # Find all tokens in target text, including hyphens and apostrophes
    target_tokens = re.findall(rf"\b\w+(?:{dash_apos}\w+)*\b", target_text)
    
    # Create a mapping of clean -> original
    token_map = {}
    for token in target_tokens:
        clean = re.sub(dash_apos, "", token).lower()
        if clean not in token_map:
            token_map[clean] = token
            
    # Split transcription into words
    trans_words = transcription.split()
    for idx, word in enumerate(trans_words):
        clean_trans = re.sub(dash_apos, "", word).lower()
        if clean_trans in token_map:
            trans_words[idx] = token_map[clean_trans]
            
    return " ".join(trans_words)

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
    import sys, traceback as _tb

    try:
        print(f"[DEBUG] webm saved, size={os.path.getsize(webm_path)}")
        convert_webm_to_wav(webm_path, wav_raw_path)
        print(f"[DEBUG] webm->wav OK, size={os.path.getsize(wav_raw_path)}")
        duration_seconds = preprocess_audio(wav_raw_path, wav_clean_path)
        print(f"[DEBUG] preprocess OK, duration={duration_seconds}")

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
        # ------------------------------------------------------------------
        # SAME-LETTER DETECTION: if both models produced the exact same
        # character sequence (ignoring spaces) do a letter-level merge so
        # we exploit every correct character from either model instead of
        # blindly picking one.
        # ------------------------------------------------------------------
        if models_same_letters(w2v_opt, whi_opt):
            merged_opt = letter_level_merge_models(target_words, w2v_opt, whi_opt)
            mrg_acc, mrg_correct, mrg_errors, mrg_opt = score_candidate(target_words, " ".join(merged_opt))
            winner        = "MERGED (same-letters)"
            best_acc      = mrg_acc
            best_correct  = mrg_correct
            best_errors   = mrg_errors
            best_opt      = mrg_opt
            other_opt     = w2v_opt   # keep w2v as the "other" for repair stage

        elif w2v_acc > whi_acc:
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

        # Deduplicate Whisper hallucinations/repetitions (e.g. natu natutuhan -> natu, or nakapanggagamot mot -> nakapanggagamot)
        cleaned_opt = deduplicate_whisper_hallucinations(best_opt, other_opt, target_words)

        # Merge adjacent short syllable stutters/insertions that belong to the same matched word
        cleaned_opt = merge_syllable_hallucinations_and_stutters(cleaned_opt, target_words)

        # Get alignment mapping to identify words that align to target words
        fused_spoken_to_target, winner_target_to_spoken = get_alignment_mapping(target_words, cleaned_opt)
        
        # Get target_to_spoken mapping for the other candidate to enable character-level repair
        _, other_target_to_spoken = get_alignment_mapping(target_words, other_opt)
        
        # Identify indices where both models had a vowel shift (so they shouldn't snap/grade correct)
        vowel_shifted_targets = set()
        for idx_target, target_word in enumerate(target_words):
            win_word = winner_target_to_spoken.get(idx_target)
            oth_word = other_target_to_spoken.get(idx_target)
            if win_word and oth_word:
                if both_have_vowel_shift(target_word, win_word, oth_word):
                    vowel_shifted_targets.add(idx_target)
        
        # Snap correct spoken words to their exact target spellings to prevent visual frontend highlights
        final_opt = list(cleaned_opt)
        for idx_spoken, idx_target in fused_spoken_to_target.items():
            if idx_target is not None:
                target_word = target_words[idx_target]
                spoken_word = cleaned_opt[idx_spoken]
                other_word = other_target_to_spoken.get(idx_target)
                
                # CONSENSUS GUARD: If both models agree on the same word
                # (phonetically identical), the student truly said that —
                # do NOT snap or repair it toward the target.
                if other_word and phonetic_normalize(spoken_word) == phonetic_normalize(other_word):
                    # Both models heard the same thing — trust them.
                    # Only snap if spoken literally/phonetically IS the target,
                    # not merely "close enough" (strict model consensus).
                    if (spoken_word.lower() == target_word.lower()
                        or phonetic_normalize(spoken_word) == phonetic_normalize(target_word)):
                        final_opt[idx_spoken] = target_word
                    # Otherwise keep the spoken word untouched (both models agree)
                    continue
                
                # Check if correct as is
                if is_correct_pronunciation(target_word, spoken_word) and idx_target not in vowel_shifted_targets:
                    final_opt[idx_spoken] = target_word
                else:
                    # Try to repair using the other model's aligned token
                    if other_word:
                        repaired = repair_word(target_word, spoken_word, other_word)
                        if is_correct_pronunciation(target_word, repaired) and idx_target not in vowel_shifted_targets:
                            final_opt[idx_spoken] = target_word
                        else:
                            final_opt[idx_spoken] = repaired

        fused_transcription = " ".join(final_opt)
        # Reconstruct Tagalog contractions (like animo'y) if they were expanded during cleaning
        fused_transcription = reconstruct_contractions(target_text, fused_transcription)
        # Match original casing, hyphens, and apostrophes from the target reference
        fused_transcription = match_original_casing_and_punctuation(target_text, fused_transcription)

        # Recalculate errors on the final snapped/corrected output
        _, final_errors = needleman_wunsch_alignment(target_words, final_opt, vowel_shifted_targets)
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

        # Terminal dashboard — always printed after every evaluation
        print(f"\n{'='*70}")
        print(f" TARGET         : {target_text}")
        print(f" WAV2VEC (raw)  : {wav2vec_raw}")
        print(f" WHISPER  (raw) : {whisper_raw}")
        print(f" WAV2VEC score  : {w2v_acc:.1f}%  ({w2v_errors} errors)")
        print(f" WHISPER  score : {whi_acc:.1f}%  ({whi_errors} errors)")
        print(f" USED           : {fused_transcription}")
        print(f" SCORE          : Accuracy: {round(accuracy_rate,2)}% | WCPM: {round(wcpm,2)}")
        print(f" CORRECT        : {final_correct_count} / {total_target_words}")
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
        import traceback
        err_log = os.path.join(UPLOAD_FOLDER, "debug_error.log")
        with open(err_log, "w") as f:
            traceback.print_exc(file=f)
        traceback.print_exc()
        print(f"Error during processing: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, use_reloader=False, port=5000)