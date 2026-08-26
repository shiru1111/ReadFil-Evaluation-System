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
from nlp_config import SYNONYM_PAIRS, ENCLITIC_Y_BASES, TAGALOG_PARTICLES, EXPERT_CORRECTIONS

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
print("Wav2Vec 2.0 loaded and quantized.\n")

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
    # Increased top_db to 35 (from 25) to make trimming less aggressive 
    # and prevent cutting off soft plosives like 'b'
    trimmed, _ = librosa.effects.trim(speech, top_db=35)

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
    optimized = []
    i = 0
    
    while i < len(spoken_words):
        current = spoken_words[i]

        # P0: SYNONYM SNAPPER
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

        # P0.1: SINGLE WORD PHONETIC SNAP
        # If the spoken word phonetically matches a target word perfectly, snap it to the target.
        # This fixes display issues where the model hears 'pakuran' instead of 'bakuran',
        # preventing it from showing the incorrect spelling in the UI.
        if current not in target_set:
            phonetic_match = None
            for t_word in target_set:
                if is_correct_pronunciation(t_word, current):
                    # Do not auto-correct if it's a vowel shift or stutter
                    if not has_vowel_shift(t_word.lower(), current.lower()) and not is_stutter(t_word.lower(), current.lower()):
                        phonetic_match = t_word
                        break
            
            if phonetic_match:
                optimized.append(phonetic_match)
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
                            # Ensure it doesn't just phonetically match one of the single words
                            if any(is_correct_pronunciation(tw, current) for tw in t_sub):
                                continue
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
            if not is_nxt_target and current not in target_set:
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

        # P2.5: Multi-word phonetic fuse (up to 4 words)
        # Handle cases where a long word is split into 3-4 fragments (e.g. "mapag", "t", "t", "bay")
        if current not in target_set:
            fused_found = False
            for N in range(4, 1, -1):
                if i + N <= len(spoken_words):
                    fusedN = "".join(spoken_words[i:i+N])
                    if fusedN in target_set:
                        optimized.append(fusedN)
                        i += N
                        fused_found = True
                        break
                    fusedN_target = find_phonetic_target_match(fusedN, target_set)
                    if fusedN_target is not None:
                        # Prevent swallowing valid target words for a fuzzy phonetic match
                        contains_target = any(
                            (w in target_set or any(w in pair and any(s in target_set for s in pair) for pair in SYNONYM_PAIRS))
                            for w in spoken_words[i+1 : i+N]
                        )
                        if contains_target:
                            continue
                        
                        optimized.append(fusedN)  # keep spoken form for penalty detection
                        i += N
                        fused_found = True
                        break
            if fused_found:
                continue

        # P3: 3-word fuse
        if i < len(spoken_words) - 2:
            fused3 = current + spoken_words[i + 1] + spoken_words[i + 2]
            if fused3 in target_set:
                optimized.append(fused3)
                i += 3
                continue
            # Vowel-shifted 3-word fuse: e.g. "to"+"mo"+"long" → "tomolong" matches "tumulong"
            if current not in target_set:
                fused3_target = find_phonetic_target_match(fused3, target_set)
                if fused3_target is not None:
                    # Prevent swallowing valid target words
                    contains_target = any(
                        (w in target_set or any(w in pair and any(s in target_set for s in pair) for pair in SYNONYM_PAIRS))
                        for w in (spoken_words[i+1], spoken_words[i+2])
                    )
                    if not contains_target:
                        optimized.append(fused3)  # keep spoken form for penalty detection
                        i += 3
                        continue

        # P4: fused "at" prefix
        if current not in target_set and current.startswith('at') and len(current) > 4 and find_phonetic_target_match(current, target_set) is None:
            spoken_words = spoken_words[:i] + ['at', current[2:]] + spoken_words[i+1:]
            continue

        # P5: particle prefix split
        if current not in target_set and len(current) > 4 and find_phonetic_target_match(current, target_set) is None:
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
                        spoken_words = spoken_words[:i] + [particle, remainder] + spoken_words[i+1:]
                        split_done = True
                        break
            if split_done:
                continue

        # P6: all-cut split
        if current not in target_set and len(current) > 3 and find_phonetic_target_match(current, target_set) is None:
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
                    spoken_words = spoken_words[:i] + [p1, p2] + spoken_words[i+1:]
                    split_done = True
                    break
            if split_done:
                continue

        # P6b: exact boundary shift (fixes "sakalinga anib" -> "sakaling aanib")
        if i < len(spoken_words) - 1:
            nxt = spoken_words[i + 1]
            if current not in target_set and nxt not in target_set:
                # Try shifting 1 letter right
                shift1_c = current[:-1]
                shift1_n = current[-1:] + nxt if current else nxt
                if shift1_c in target_set and shift1_n in target_set:
                    optimized.extend([shift1_c, shift1_n])
                    i += 2
                    continue
                # Try shifting 2 letters right (e.g. 'ng')
                if len(current) > 2:
                    shift2_c = current[:-2]
                    shift2_n = current[-2:] + nxt
                    if shift2_c in target_set and shift2_n in target_set:
                        optimized.extend([shift2_c, shift2_n])
                        i += 2
                        continue
                # Try shifting 1 letter left
                shiftL1_c = current + (nxt[:1] if nxt else '')
                shiftL1_n = nxt[1:] if nxt else ''
                if shiftL1_c in target_set and shiftL1_n in target_set:
                    optimized.extend([shiftL1_c, shiftL1_n])
                    i += 2
                    continue
                # Try shifting 2 letters left
                if len(nxt) > 2:
                    shiftL2_c = current + nxt[:2]
                    shiftL2_n = nxt[2:]
                    if shiftL2_c in target_set and shiftL2_n in target_set:
                        optimized.extend([shiftL2_c, shiftL2_n])
                        i += 2
                        continue

        # P7: phrase snapper — fuzzy 2-word match
        if i < len(spoken_words) - 1:
            fused_spoken = current + spoken_words[i + 1]
            matched = False
            for j in range(len(target_words) - 1):
                fused_target = target_words[j] + target_words[j + 1]
                if abs(len(fused_target) - len(fused_spoken)) <= 2:
                    if modified_levenshtein(fused_target, fused_spoken) <= 0.12:
                        # ONLY snap if there is NO standard Tagalog vowel shift
                        # AND the consonant skeleton matches
                        if not has_vowel_shift(fused_target, fused_spoken) and letters_are_subset_of(fused_target, fused_spoken):
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
    w = w.replace('q', 'k')
    return w

# =================================================================
# CONSONANT SKELETON UTILITIES — Letter-level verification
# =================================================================
VOWELS = set('aeiou')

# Single-character phonetic normalization for known Tagalog equivalences.
# Does NOT treat e≡i or o≡u — those are vowel shifts, not equivalences.
CHAR_NORM = {'y': 'i', 'w': 'o', 'f': 'p', 'v': 'b', 'z': 's', 'c': 'k', 'q': 'k'}

def normalize_char(ch):
    """Normalize a single character using known Tagalog phonetic equivalences.
    y→i, w→o, f→p, v→b, z→s, c→k, q→k.  Does NOT normalize e→i or o→u."""
    return CHAR_NORM.get(ch, ch)

def consonant_skeleton(word):
    """Extract the ordered consonant sequence from a word.
    E.g. 'palaka' -> 'plk', 'papaka' -> 'ppk', 'pakak' -> 'pkk'
    Uses phonetic normalization so f/v/c etc. are folded."""
    if not word:
        return ""
    w = phonetic_normalize(word)
    return "".join(ch for ch in w if ch not in VOWELS and ch.isalpha())

def is_subsequence(needle, haystack):
    """Check if 'needle' is a subsequence of 'haystack'.
    E.g. 'plk' is a subsequence of 'plk' (True)
         'plk' is NOT a subsequence of 'ppk' (False — no 'l')"""
    it = iter(haystack)
    return all(ch in it for ch in needle)

def letters_are_subset_of(target, spoken):
    """Check if the consonant skeleton of the target word is a subsequence
    of the spoken word's consonant skeleton.  This verifies the student
    actually produced the key consonant phonemes of the target word.
    
    E.g. target='palaka' skeleton='plk', spoken='papaka' skeleton='ppk'
         -> 'plk' is NOT a subsequence of 'ppk' -> False  (missing 'l')
    E.g. target='palaka' skeleton='plk', spoken='palaka' skeleton='plk'
         -> 'plk' IS a subsequence of 'plk' -> True
    """
    t_skel = consonant_skeleton(target).replace('p', 'b')
    s_skel = consonant_skeleton(spoken).replace('p', 'b')
    if is_subsequence(t_skel, s_skel):
        return True
        
    # Fallback: STT often drops vowels between identical consonants (e.g. ti-ti -> tt -> t).
    # Collapse consecutive identical consonants in both skeletons and try again.
    import re
    t_skel_collapsed = re.sub(r'(.)\1+', r'\1', t_skel)
    s_skel_collapsed = re.sub(r'(.)\1+', r'\1', s_skel)
    return is_subsequence(t_skel_collapsed, s_skel_collapsed)



def is_correct_pronunciation(target, spoken):
    if not target or not spoken:
        return False
    t_norm = phonetic_normalize(target)
    s_norm = phonetic_normalize(spoken)
    if t_norm == s_norm:
        return True
    # Consonant skeleton gate: if the spoken word is missing key consonants
    # from the target, it cannot be a correct pronunciation.
    if not letters_are_subset_of(target, spoken):
        return False
    dist = modified_levenshtein(target, spoken)
    # Strict phonetic approximation — 0.15 threshold prevents borderline
    # mismatches like o↔a in 5-char words (1/5=0.20) from passing.
    if dist <= 0.15 and abs(len(target) - len(spoken)) <= 1:
        return True
        
    # Forgiving threshold for long words (often victims of vowel-dropping by STT)
    # e.g., mapagtitibay -> mapagttbay
    if len(target) >= 7 and dist <= 0.30 and abs(len(target) - len(spoken)) <= 3:
        if target[:3].lower() == spoken[:3].lower():
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

def is_vowel(c):
    return c.lower() in 'aeiou'

def models_agree_on_letter(target, w2v_word, whi_word):
    print(f"\n[LETTER CHECK] Target: '{target}', Spoken: '{w2v_word}'")
    w2v_align = align_chars(target, w2v_word) if w2v_word else [(c, '-') for c in target]
    whi_align = align_chars(target, whi_word) if whi_word else [(c, '-') for c in target]
    
    w2v_target_aligned = [s for t, s in w2v_align if t != '-']
    whi_target_aligned = [s for t, s in whi_align if t != '-']
    
    for i in range(len(target)):
        t_char = target[i].lower()
        w_char = w2v_target_aligned[i] if i < len(w2v_target_aligned) else '-'
        h_char = whi_target_aligned[i] if i < len(whi_target_aligned) else '-'
        
        if is_vowel(t_char):
            if not is_vowel(w_char) and not is_vowel(h_char):
                print(f"  [{i}] '{t_char}' vs '{w_char}' -> REJECTED (Vowel Shift Failed)")
                return False
            else:
                print(f"  [{i}] '{t_char}' vs '{w_char}' -> PASSED (Vowel Shift / Match)")
        else:
            norm_t = normalize_char(t_char)
            norm_w = normalize_char(w_char) if w_char != '-' else '-'
            norm_h = normalize_char(h_char) if h_char != '-' else '-'
            
            # Allow p and b to match interchangeably due to common acoustic confusion
            w_matches = (norm_w == norm_t) or (norm_w == 'p' and norm_t == 'b') or (norm_w == 'b' and norm_t == 'p')
            h_matches = (norm_h == norm_t) or (norm_h == 'p' and norm_t == 'b') or (norm_h == 'b' and norm_t == 'p')
            
            if not w_matches and not h_matches:
                print(f"  [{i}] '{t_char}' vs '{w_char}' -> REJECTED (Consonant Mismatch)")
                return False
            else:
                print(f"  [{i}] '{t_char}' vs '{w_char}' -> PASSED (Consonant Match)")
                
    print(f"  => ALL LETTERS PASSED")
    return True


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
                                     (c1 == 'l' and c2 == 'r') or (c1 == 'r' and c2 == 'l') or \
                                     (c1 == 'p' and c2 == 'b') or (c1 == 'b' and c2 == 'p')
                
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
            elif is_stutter(target_words[i - 1], spoken_words[j - 1]) or has_vowel_shift(target_words[i - 1], spoken_words[j - 1]):
                match_score = score[i - 1][j - 1] + (MATCH * 0.5)
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
            elif is_stutter(target_words[i - 1], spoken_words[j - 1]) or has_vowel_shift(target_words[i - 1], spoken_words[j - 1]):
                match_score = score[i - 1][j - 1] + (MATCH * 0.5)
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
                vowels = {'a', 'e', 'i', 'o', 'u'}
                is_vowel_shift = (c1 in vowels and c2 in vowels and c1 != c2)
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




def is_stutter(target, spoken):
    if not target or not spoken:
        return False
    t_norm = phonetic_normalize(target).lower()
    s_norm = phonetic_normalize(spoken).lower()
    
    if len(s_norm) <= len(t_norm) or s_norm == t_norm:
        return False

    def is_repeated_syllable(chunk, base_word):
        # If the chunk is in the base word, it's a direct stutter (e.g. 'ba' in 'bata')
        if chunk in base_word:
            return True
        # If it's a repeated syllable like 'baba' for 'bata'
        # We check if chunk is just a smaller substring repeated
        for i in range(1, len(chunk) // 2 + 1):
            if len(chunk) % i == 0:
                sub = chunk[:i]
                if sub * (len(chunk) // i) == chunk and sub in base_word:
                    return True
        return False
        
    # Check for prefix stutter (e.g., 'ba' + 'bata' -> 'babata', 'baba' + 'bata')
    if s_norm.endswith(t_norm):
        prefix = s_norm[:-len(t_norm)]
        if is_repeated_syllable(prefix, t_norm):
            return True
            
    # Check for suffix stutter (e.g., 'bata' + 'ta' -> 'batata')
    if s_norm.startswith(t_norm):
        suffix = s_norm[len(t_norm):]
        if is_repeated_syllable(suffix, t_norm):
            return True

    # Check for internal stutter (e.g., 'mapagtititibay' -> 'mapagtitibay')
    diff_len = len(s_norm) - len(t_norm)
    if diff_len > 0:
        for i in range(1, len(s_norm) - diff_len):
            chunk = s_norm[i:i+diff_len]
            remaining = s_norm[:i] + s_norm[i+diff_len:]
            if remaining == t_norm and is_repeated_syllable(chunk, t_norm):
                return True
                
    return False

def detect_stutters(final_opt, target_words):
    stutter_words = []
    spoken_to_target, _ = get_alignment_mapping(target_words, final_opt)
    
    for idx, s_word in enumerate(final_opt):
        t_idx = spoken_to_target.get(idx)
        
        # Scenario 1: It aligns to a target word but is a stuttered version of it
        if t_idx is not None:
            t_word = target_words[t_idx]
            if is_stutter(t_word, s_word):
                stutter_words.append(s_word)
        # Scenario 2: It's an insertion adjacent to a target word
        else:
            is_adjacent_stutter = False
            for adj_idx in [idx - 1, idx + 1]:
                if 0 <= adj_idx < len(final_opt):
                    adj_t_idx = spoken_to_target.get(adj_idx)
                    if adj_t_idx is not None:
                        t_word = target_words[adj_t_idx]
                        t_norm = phonetic_normalize(t_word)
                        s_norm = phonetic_normalize(s_word)
                        # If the insertion is just a syllable that exists in the target word
                        if len(s_norm) <= len(t_norm) and s_norm in t_norm:
                            stutter_words.append(s_word)
                            is_adjacent_stutter = True
                            break
            # If not a pure syllable, check if it's a full stutter block classified as insertion
            if not is_adjacent_stutter:
                for adj_idx in [idx - 1, idx + 1]:
                    if 0 <= adj_idx < len(final_opt):
                        adj_t_idx = spoken_to_target.get(adj_idx)
                        if adj_t_idx is not None:
                            t_word = target_words[adj_t_idx]
                            if is_stutter(t_word, s_word):
                                stutter_words.append(s_word)
                                break
                                
    return list(set(stutter_words))

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

def iq_adjust_wav2vec2(target_words, raw_transcription):
    """
    Intelligent re-segmentation and correction for wav2vec 2.
    Strips spaces from both target and spoken, aligns letter-by-letter,
    re-segments the spoken text based on target word boundaries,
    and snaps to target if the difference is small.
    """
    target_str = "".join(target_words).lower()
    spoken_str = raw_transcription.replace(" ", "").lower()
    
    if not spoken_str:
        return raw_transcription
        
    aligned = align_chars(target_str, spoken_str)
    
    t_word_char_lists = [[] for _ in target_words]
    insertions_between = [[] for _ in range(len(target_words) + 1)]
    
    current_t_idx = 0
    chars_seen = 0
    
    for t_char, s_char in aligned:
        if t_char == '-':
            if s_char != '-':
                if chars_seen == 0:
                    insertions_between[current_t_idx].append(s_char)
                else:
                    if current_t_idx < len(target_words):
                        t_word_char_lists[current_t_idx].append(s_char)
        else:
            if current_t_idx < len(target_words):
                if s_char != '-':
                    t_word_char_lists[current_t_idx].append(s_char)
                chars_seen += 1
                if chars_seen == len(target_words[current_t_idx]):
                    current_t_idx += 1
                    chars_seen = 0

    final_spoken_for_target = ["".join(chars) for chars in t_word_char_lists]
    
    if target_words:
        final_spoken_for_target[0] = "".join(insertions_between[0]) + final_spoken_for_target[0]
        
    for i in range(1, len(target_words)):
        ins_str = "".join(insertions_between[i])
        if not ins_str:
            continue
            
        left_t = target_words[i-1].lower()
        left_s = final_spoken_for_target[i-1].lower()
        right_t = target_words[i].lower()
        right_s = final_spoken_for_target[i].lower()
        
        cand_left = left_s + ins_str
        cand_right = ins_str + right_s
        
        if is_stutter(left_t, cand_left) and not is_stutter(right_t, cand_right):
            final_spoken_for_target[i-1] = cand_left
        elif is_stutter(right_t, cand_right) and not is_stutter(left_t, cand_left):
            final_spoken_for_target[i] = cand_right
        else:
            final_spoken_for_target[i-1] = cand_left
            
    if target_words and insertions_between[-1]:
        final_spoken_for_target[-1] = final_spoken_for_target[-1] + "".join(insertions_between[-1])

    adjusted_words = []
    for t_word, s_word in zip(target_words, final_spoken_for_target):
        if not s_word:
            continue
            
        dist_ratio = modified_levenshtein(t_word.lower(), s_word.lower())
        raw_dist = dist_ratio * max(len(t_word.lower()), len(s_word.lower()))
        max_dist = max(2, len(t_word) // 3)
        
        is_stutter_case = is_stutter(t_word.lower(), s_word.lower())
        is_vowel_shift_case = has_vowel_shift(t_word.lower(), s_word.lower())
        
        if is_stutter_case or is_vowel_shift_case:
            adjusted_words.append(s_word)
        elif raw_dist <= max_dist or is_correct_pronunciation(t_word, s_word):
            adjusted_words.append(t_word)
        else:
            adjusted_words.append(s_word)
            
    return " ".join(adjusted_words)

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

        wav2vec_raw = transcribe_wav2vec(wav_clean_path)
        wav2vec_2_raw = transcribe_wav2vec(wav_clean_path)

        level = request.form.get('level', '')
        if level == 'Expert':
            for wrong, right in EXPERT_CORRECTIONS.items():
                wav2vec_raw = wav2vec_raw.replace(wrong, right)
                wav2vec_2_raw = wav2vec_2_raw.replace(wrong, right)

        # Check if no audio/speech was transcribed (empty or silent audio)
        if not wav2vec_raw.strip() and not wav2vec_2_raw.strip():
            return jsonify({
                "error": "No speech detected. Please speak clearly into the microphone.",
                "status": "empty"
            }), 400

        target_words = clean_text(target_text)

        w2v_acc, w2v_correct, w2v_errors, w2v_opt = score_candidate(target_words, wav2vec_raw)
        
        # Apply IQ Adjustment to wav2vec 2
        iq_wav2vec_2_raw = iq_adjust_wav2vec2(target_words, wav2vec_2_raw)
        w2v_2_acc, w2v_2_correct, w2v_2_errors, w2v_2_opt = score_candidate(target_words, iq_wav2vec_2_raw)

        # Merge adjacent short syllable stutters/insertions that belong to the same matched word
        cleaned_opt = merge_syllable_hallucinations_and_stutters(w2v_opt, target_words)
        cleaned_opt_2 = merge_syllable_hallucinations_and_stutters(w2v_2_opt, target_words)

        # Get alignment mapping to identify words that align to target words
        fused_spoken_to_target_1, target_to_spoken_1 = get_alignment_mapping(target_words, cleaned_opt)
        fused_spoken_to_target_2, target_to_spoken_2 = get_alignment_mapping(target_words, cleaned_opt_2)
        
        # Build the final sequence based on wav2vec 1's physical sequence, but upgrading words word-by-word
        final_opt = list(cleaned_opt)
        
        for idx_spoken, idx_target in fused_spoken_to_target_1.items():
            if idx_target is not None:
                target_word = target_words[idx_target]
                w1 = cleaned_opt[idx_spoken]
                
                # Find what wav2vec 2 heard for this same target word
                w2 = target_to_spoken_2.get(idx_target)
                
                t_lower = target_word.lower()
                w1_lower = w1.lower()
                w2_lower = w2.lower() if w2 else ""
                
                # 1. Check for stutters in either model (priority: do not tolerate/hide stutters)
                if is_stutter(t_lower, w1_lower):
                    final_opt[idx_spoken] = w1
                    continue
                if w2 and is_stutter(t_lower, w2_lower):
                    final_opt[idx_spoken] = w2
                    continue
                    
                # 2. Check for vowel shifts in either model (priority: do not tolerate/hide vowel shifts)
                if has_vowel_shift(t_lower, w1_lower):
                    final_opt[idx_spoken] = w1
                    continue
                if w2 and has_vowel_shift(t_lower, w2_lower):
                    final_opt[idx_spoken] = w2
                    continue
                    
                # 3. If neither is a stutter/vowel shift, check if either is a perfect phonetic match
                w1_correct = is_correct_pronunciation(target_word, w1)
                w2_correct = is_correct_pronunciation(target_word, w2) if w2 else False
                
                if w1_correct and not w2_correct:
                    final_opt[idx_spoken] = target_word
                elif w2_correct and not w1_correct:
                    final_opt[idx_spoken] = target_word
                elif w1_correct and w2_correct:
                    final_opt[idx_spoken] = target_word
                else:
                    # 4. Both are errors (not stutters/vowel shifts). Pick the one with the closer edit distance.
                    dist1 = modified_levenshtein(t_lower, w1_lower)
                    dist2 = modified_levenshtein(t_lower, w2_lower) if w2 else float('inf')
                    
                    if dist2 < dist1 and w2:
                        final_opt[idx_spoken] = w2
                    else:
                        final_opt[idx_spoken] = w1

        fused_transcription = " ".join(final_opt)
        # Match original casing, hyphens, and apostrophes from the target reference
        fused_transcription = match_original_casing_and_punctuation(target_text, fused_transcription)
        
        detected_stutters = detect_stutters(final_opt, target_words)

        # Recalculate errors on the final snapped/corrected output
        _, final_errors = needleman_wunsch_alignment(target_words, final_opt, None)
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
        print(f" WAV2VEC 2 (raw): {iq_wav2vec_2_raw}")
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
            "model_used":       "WAV2VEC",
            "stutter_words":    detected_stutters,
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

def get_simulation_trace(target_words, spoken_words):
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
            elif is_stutter(target_words[i - 1], spoken_words[j - 1]) or has_vowel_shift(target_words[i - 1], spoken_words[j - 1]):
                match_score = score[i - 1][j - 1] + (MATCH * 0.5)
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
    trace = []
    
    while i > 0 or j > 0:
        if pointers[i][j] == 'D':
            t_word = target_words[i - 1]
            s_word = spoken_words[j - 1]
            dist = modified_levenshtein(t_word, s_word)
            is_correct = is_correct_pronunciation(t_word, s_word)
            trace.append({
                "type": "match" if is_correct else "substitution",
                "target": t_word,
                "spoken": s_word,
                "distance": round(dist, 2),
                "is_correct": is_correct
            })
            i -= 1; j -= 1
        elif pointers[i][j] == 'U':
            t_word = target_words[i - 1]
            trace.append({
                "type": "deletion",
                "target": t_word,
                "spoken": "-",
                "distance": 1.0,
                "is_correct": False
            })
            i -= 1
        elif pointers[i][j] == 'L':
            s_word = spoken_words[j - 1]
            trace.append({
                "type": "insertion",
                "target": "-",
                "spoken": s_word,
                "distance": 1.0,
                "is_correct": False
            })
            j -= 1
            
    trace.reverse()
    
    errors = sum(1 for step in trace if not step["is_correct"] and step["target"] != "-")
    insertions = sum(1 for step in trace if step["type"] == "insertion")
    total_errors = errors + insertions
    
    correct_words = max(0, len(target_words) - total_errors)
    stutter_words = detect_stutters(spoken_words, target_words)
    return trace, correct_words, total_errors, stutter_words

@app.route('/api/simulate', methods=['POST'])
def simulate():
    try:
        data = request.json
        if not data or 'passages' not in data:
            return jsonify({"error": "Missing passages array"}), 400

        passages = data['passages']
        if not isinstance(passages, list) or len(passages) == 0:
            return jsonify({"error": "Passages must be a non-empty array"}), 400

        total_correct = 0
        total_target = 0
        total_duration = 0.0
        
        results_list = []

        for p in passages:
            t_text = p.get('target_text', '')
            s_text = p.get('spoken_text', '')
            dur = float(p.get('duration', 3.0))

            t_words = clean_text(t_text)
            s_words = clean_text(s_text)
            
            if not t_words:
                continue

            if not s_words:
                results_list.append({
                    "target_text": t_text,
                    "spoken_text": s_text,
                    "trace": [],
                    "accuracy": 0,
                    "wcpm": 0,
                    "total_target_words": len(t_words),
                    "correct_words": 0,
                    "duration": dur,
                    "stutter_words": []
                })
                total_target += len(t_words)
                total_duration += dur
                continue

            trace, correct_words, total_errors, stutter_words = get_simulation_trace(t_words, s_words)

            acc = (correct_words / len(t_words)) * 100.0 if len(t_words) > 0 else 0.0
            acc = max(0.0, min(100.0, acc))
            
            wcpm = (correct_words / dur) * 60.0 if dur > 0 else 0.0
            
            results_list.append({
                "target_text": t_text,
                "spoken_text": s_text,
                "trace": trace,
                "accuracy": round(acc, 2),
                "wcpm": round(wcpm, 2),
                "total_target_words": len(t_words),
                "correct_words": correct_words,
                "duration": dur,
                "stutter_words": stutter_words
            })
            
            total_correct += correct_words
            total_target += len(t_words)
            total_duration += dur

        if total_target == 0:
            return jsonify({"error": "No valid target text found in passages"}), 400

        overall_acc = (total_correct / total_target) * 100.0 if total_target > 0 else 0.0
        overall_acc = max(0.0, min(100.0, overall_acc))
        
        overall_wcpm = (total_correct / total_duration) * 60.0 if total_duration > 0 else 0.0
        speed_score = min((overall_wcpm / 150.0) * 100.0, 100.0)
        
        overall_composite = (overall_acc * 0.5) + (speed_score * 0.5)

        return jsonify({
            "passages": results_list,
            "overall_accuracy": round(overall_acc, 2),
            "overall_wcpm": round(overall_wcpm, 2),
            "overall_composite_score": round(overall_composite, 2),
            "total_target_words": total_target,
            "total_correct_words": total_correct,
            "total_duration": total_duration
        }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, use_reloader=False, port=5000)