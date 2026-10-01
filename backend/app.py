from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import os
import sys
from collections import Counter
import database

# Initialize SQLite database for Teacher Portal and Classroom Mode
database.init_db()

# Apply Linux-specific ffmpeg paths only if running on a POSIX (Linux/Mac) system
if os.name == 'posix':
    os.environ["PATH"] += os.pathsep + "/usr/bin"

import re
import uuid
import numpy as np
import torch
import librosa
import soundfile as sf
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
from pydub import AudioSegment, effects

if os.name == 'posix':
    AudioSegment.converter = "/usr/bin/ffmpeg"

from concurrent.futures import ThreadPoolExecutor

import smtplib
import base64
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from dotenv import load_dotenv

load_dotenv(override=True)

class SafeStream:
    def __init__(self, original_stream):
        self.original_stream = original_stream

    def write(self, data):
        try:
            if self.original_stream:
                self.original_stream.write(data)
                self.original_stream.flush()
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

def check_is_synonym(w1, w2):
    if not w1 or not w2:
        return False
    w1_low = str(w1).lower().strip()
    w2_low = str(w2).lower().strip()
    for pair in SYNONYM_PAIRS:
        pair_low = {str(p).lower().strip() for p in pair}
        if w1_low in pair_low and w2_low in pair_low:
            return True
    return False

app = Flask(__name__)
CORS(app)

from error_handlers import register_error_handlers
register_error_handlers(app)

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp_audio')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

import time
import threading

def cleanup_temp_audio_daemon():
    while True:
        try:
            now = time.time()
            for filename in os.listdir(UPLOAD_FOLDER):
                filepath = os.path.join(UPLOAD_FOLDER, filename)
                if os.path.isfile(filepath):
                    # Check if older than 5 minutes (300 seconds)
                    if now - os.path.getmtime(filepath) > 300:
                        try:
                            os.remove(filepath)
                            print(f"[CLEANUP] Deleted old temp file: {filename}")
                        except:
                            pass
        except Exception as e:
            print(f"[CLEANUP ERROR] {e}")
        time.sleep(60)

# Start background cleanup daemon
cleanup_thread = threading.Thread(target=cleanup_temp_audio_daemon, daemon=True)
cleanup_thread.start()

_executor = ThreadPoolExecutor(max_workers=2)

# =================================================================
# 1. ACOUSTIC MODEL: WAV2VEC 2.0 (FILIPINO TRANSFORMER MODEL)
# -----------------------------------------------------------------
# - Pretrained Model: "Khalsuu/filipino-wav2vec2-l-xls-r-300m-official"
# - Optimization: PyTorch Dynamic 8-bit Quantization (torch.qint8)
#   Halves RAM memory footprint and accelerates CPU inference to
#   enable near real-time processing on standard school computers.
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
# AUDIO PREPROCESSING & WAV CONVERSION
# =================================================================
def convert_webm_to_wav(webm_path, wav_path):
    # Load WebM compressed audio recording captured from React browser
    audio = AudioSegment.from_file(webm_path, format="webm")
    # Resample to 16,000 Hz single-channel mono PCM required by Wav2Vec 2.0
    audio = audio.set_frame_rate(16000).set_channels(1)
    # Export clean 16kHz WAV file to disk
    audio.export(wav_path, format="wav")

def preprocess_audio(input_wav_path, output_wav_path):
    # Load raw WAV segment
    audio_seg = AudioSegment.from_wav(input_wav_path)
    # Apply dynamic range normalization with 0.1 headroom to prevent clipping
    normalized = effects.normalize(audio_seg, headroom=0.1)
    # Ensure exact 16kHz mono audio formatting
    normalized = normalized.set_frame_rate(16000).set_channels(1)
    # Save normalized WAV file
    normalized.export(output_wav_path, format="wav")

    # Load normalized audio into float array using librosa at 16kHz
    speech, sr = librosa.load(output_wav_path, sr=16000)
    
    # Apply spectral gating noise reduction to remove background classroom hum
    import noisereduce as nr
    reduced_noise_speech = nr.reduce_noise(y=speech, sr=sr, prop_decrease=0.5)
    
    # We preserve natural pauses and quiet trailing consonants (e.g. 'r' in 'lugar')
    trimmed = reduced_noise_speech

    # Write cleaned speech array back to output WAV file
    sf.write(output_wav_path, trimmed, sr)
    # Return total elapsed audio duration in seconds
    return librosa.get_duration(y=trimmed, sr=sr)

# =================================================================
# 2. ACOUSTIC TRANSCRIPTION ENGINE (WAV2VEC 2.0 CTC DECODING)
# =================================================================
def transcribe_wav2vec(wav_path):
    # Step 1: Load 16kHz audio waveform as a 1D float array using Librosa
    speech_array, _ = librosa.load(wav_path, sr=16000)
    # Step 2: Convert audio waveform into PyTorch tensor with padding for transformer input
    inputs = w2v_processor(speech_array, sampling_rate=16000, return_tensors="pt", padding=True)
    # Step 3: Run forward pass through quantized Wav2Vec 2.0 model (no gradient tracking)
    with torch.no_grad():
        logits = w2v_model(inputs.input_values).logits
    # Step 4: Extract highest probability token ID per frame via argmax (CTC greedy decode)
    predicted_ids = torch.argmax(logits, dim=-1)
    # Step 5: Decode predicted token IDs into recognized Tagalog text string
    return w2v_processor.batch_decode(predicted_ids)[0]

TAGALOG_BASIC_NUMBERS = {
    0: 'sero', 1: 'isa', 2: 'dalawa', 3: 'tatlo', 4: 'apat', 5: 'lima',
    6: 'anim', 7: 'pito', 8: 'walo', 9: 'siyam', 10: 'sampu',
    11: 'labing-isa', 12: 'labindalawa', 13: 'labintatlo', 14: 'labing-apat',
    15: 'labinlima', 16: 'labing-anim', 17: 'labimpito', 18: 'labingwalo', 19: 'labinsiyam',
    20: 'dalawampu', 30: 'tatlumpu', 40: 'apatnapu', 50: 'limampu',
    60: 'animnapu', 70: 'pitumpu', 80: 'walumpu', 90: 'siyamnapu',
    100: 'sandaan', 1000: 'sanlibo'
}

TAGALOG_ORDINALS = {
    1: 'una', 2: 'pangalawa', 3: 'pangatlo', 4: 'pang-apat', 5: 'panlima',
    6: 'pang-anim', 7: 'pampito', 8: 'pangwalo', 9: 'pansiyam', 10: 'pansampu'
}

def int_to_tagalog(n):
    if n in TAGALOG_BASIC_NUMBERS:
        return TAGALOG_BASIC_NUMBERS[n]
    if 21 <= n <= 99:
        tens = (n // 10) * 10
        rem = n % 10
        if rem == 0:
            return TAGALOG_BASIC_NUMBERS.get(tens, str(n))
        tens_word = TAGALOG_BASIC_NUMBERS.get(tens, '')
        rem_word = TAGALOG_BASIC_NUMBERS.get(rem, '')
        return f"{tens_word}'t {rem_word}"
    if 100 <= n <= 999:
        hundreds = n // 100
        rem = n % 100
        h_str = 'sandaan' if hundreds == 1 else f"{TAGALOG_BASIC_NUMBERS.get(hundreds, str(hundreds))} daan"
        if rem == 0:
            return h_str
        return f"{h_str} at {int_to_tagalog(rem)}"
    return str(n)

def normalize_tagalog_numbers(text, target_words=None):
    """
    Converts numbers and digits into Tagalog words so STT outputs like '6', '2', '1'
    are never kept as digits, but converted to 'anim', 'dalawa', 'isa', etc.
    """
    if not text:
        return text

    target_set = set(target_words) if target_words else set()

    # English ordinals: 1st, 2nd, 3rd, 4th...
    def repl_eng_ord(m):
        n = int(m.group(1))
        if n in TAGALOG_ORDINALS:
            return TAGALOG_ORDINALS[n]
        return f"ika-{int_to_tagalog(n)}"
    text = re.sub(r'\b(\d+)(?:st|nd|rd|th)\b', repl_eng_ord, text, flags=re.IGNORECASE)

    # ika-X: ika-6, ika-2
    def repl_ika(m):
        n = int(m.group(1))
        return f"ika-{int_to_tagalog(n)}"
    text = re.sub(r'\bika-(\d+)\b', repl_ika, text, flags=re.IGNORECASE)

    # pang-X: pang-2, pang-6
    def repl_pang(m):
        n = int(m.group(1))
        if n in TAGALOG_ORDINALS:
            return TAGALOG_ORDINALS[n]
        return f"pang-{int_to_tagalog(n)}"
    text = re.sub(r'\bpang-(\d+)\b', repl_pang, text, flags=re.IGNORECASE)

    # Digits with ligature: 2ng -> dalawang, 1ng -> isang
    def repl_num_ng(m):
        n = int(m.group(1))
        w = int_to_tagalog(n)
        if w.endswith(('a', 'e', 'i', 'o', 'u')):
            return w + 'ng'
        return w + ' na'
    text = re.sub(r'\b(\d+)ng\b', repl_num_ng, text, flags=re.IGNORECASE)

    # Standalone digits: 6 -> anim, 2 -> dalawa, 1 -> isa
    def repl_digit(m):
        n = int(m.group(1))
        w = int_to_tagalog(n)
        if target_set and w not in target_set:
            alt_candidates = [TAGALOG_BASIC_NUMBERS.get(n)]
            for cand in alt_candidates:
                if cand and cand in target_set:
                    return cand
        return w

    text = re.sub(r'\b(\d+)\b', repl_digit, text)
    return text

def transcribe_resend(wav_path, target_words=None):
    """
    Transcribes audio using Resend Cloud Speech-to-Text API.
    Used exclusively for Moderate and Expert reading levels.
    """
    api_key = os.getenv("Resend_api_key") or os.getenv("RESEND_API_KEY")
    if not api_key:
        print("[TOKEN AVAILABILITY] Notice: Resend_api_key not configured. Gracefully falling back to local quantized Wav2Vec 2.0.")
        return None
    try:
        from resend_stt import ResendSTTClient, CreateTranscriptionConfig
        client = ResendSTTClient(api_key=api_key)
        config = CreateTranscriptionConfig(language_hints=["tl"])
        transcription = client.stt.transcribe(file=wav_path, config=config)
        client.stt.wait(transcription.id)
        transcript = client.stt.get_transcript(transcription.id)
        text = transcript.text.strip() if transcript and transcript.text else ""
        text = normalize_tagalog_numbers(text, target_words)
        print(f"[RESEND] Cloud transcription OK: '{text}'")
        return text
    except Exception as e:
        print(f"[TOKEN AVAILABILITY] Cloud STT token warning or API unreachable: {e}. Gracefully falling back to local quantized Wav2Vec 2.0.")
        return None

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
                        concat_contracted = concat_target.replace("walanang", "walang").replace("walangnang", "walang").replace("naay", "nay")
                        
                        if concat_target == current or concat_contracted == current:
                            score = 2
                        elif is_correct_pronunciation(concat_target, current) or is_correct_pronunciation(concat_contracted, current):
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
        if current not in target_set and current.endswith('y') and len(current) > 3:
            base = current[:-1]
            if base in ENCLITIC_Y_BASES or base in target_set:
                optimized.extend([base, 'ay'])
                i += 1
                continue

        # P2: 2-word fuse
        if i < len(spoken_words) - 1:
            nxt = spoken_words[i + 1]
            
            # Enclitic-y reconstruction (e.g. "sila" + "ay" -> "silay")
            if nxt == 'ay' and (current + 'y') in target_set:
                optimized.append(current + 'y')
                i += 2
                continue
                
            # Ligature / suffix fuse: e.g. "mahihi" + "ng" -> "mahihinang"
            if nxt in ['ng', 'ang'] and current not in target_set:
                matched_lig = None
                for tw in target_set:
                    if tw.endswith('ng') and (tw.startswith(current) or is_subsequence(current, tw)):
                        if len(tw) - len(current) <= 4:
                            matched_lig = tw
                            break
                if matched_lig:
                    optimized.append(matched_lig)
                    i += 2
                    continue
                
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
        # Handle cases where a long compound word is split into 2-4 fragments (e.g. "na", "walang", "saycay" -> "nawalangsaysay")
        fused_found = False
        for N in range(4, 1, -1):
            if i + N <= len(spoken_words):
                fusedN = "".join(spoken_words[i:i+N])
                fusedN_norm = fusedN.replace('c', 's')
                if fusedN in target_set or fusedN_norm in target_set:
                    matched_w = fusedN if fusedN in target_set else fusedN_norm
                    optimized.append(matched_w)
                    i += N
                    fused_found = True
                    break
                if current not in target_set:
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
                    p1 = particle
                    p2 = current[len(particle):]
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



def is_any_vowel_shift(word1, word2):
    """
    Detects vowel shifting across ALL vowels (a, e, i, o, u).
    Returns True if word1 and word2 are identical except for one or more vowels.
    E.g. 'binatang' vs 'benatang' (i <-> e)
         'desisyon' vs 'disisyon' (e <-> i)
         'umaga' vs 'omaga' (u <-> o)
         'kamote' vs 'kamoti' (e <-> i)
         'masarap' vs 'masurup' (a <-> u)
    """
    if not word1 or not word2:
        return False
    w1 = phonetic_normalize(word1)
    w2 = phonetic_normalize(word2)
    if w1 == w2:
        return False
        
    if len(w1) == len(w2):
        diffs = 0
        for c1, c2 in zip(w1, w2):
            if c1 != c2:
                if c1 in VOWELS and c2 in VOWELS:
                    diffs += 1
                else:
                    return False
        return diffs > 0
        
    s1 = consonant_skeleton(w1)
    s2 = consonant_skeleton(w2)
    return (s1 == s2 and s1 != "" and w1 != w2)

def is_pure_vowel_shift(word1, word2):
    """
    Checks if word1 and word2 differ ONLY by valid Tagalog vowel shifts:
    e <-> i and o <-> u
    """
    if not word1 or not word2:
        return False
    w1 = re.sub(r'[^a-z0-9]', '', str(word1).lower())
    w2 = re.sub(r'[^a-z0-9]', '', str(word2).lower())
    if w1 == w2:
        return False
    if len(w1) != len(w2):
        return False
    diff_count = 0
    for c1, c2 in zip(w1, w2):
        if c1 != c2:
            is_valid_shift = (c1 in ('e', 'i') and c2 in ('e', 'i')) or \
                             (c1 in ('o', 'u') and c2 in ('o', 'u'))
            if not is_valid_shift:
                return False
            diff_count += 1
    return diff_count > 0

def is_correct_pronunciation(target, spoken):
    if not target or not spoken:
        return False
    t_lower = str(target).lower().strip()
    s_lower = str(spoken).lower().strip()
    if t_lower == s_lower:
        return True
    if check_is_synonym(t_lower, s_lower):
        return True
    t_norm = phonetic_normalize(target)
    s_norm = phonetic_normalize(spoken)
    if t_norm == s_norm:
        return True
    # Pure vowel shifts (strictly e <-> i and o <-> u) are valid Tagalog pronunciations and should NOT flag as error:
    if is_pure_vowel_shift(target, spoken):
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

def align_chars_nw(s1, s2):
    """
    Needleman-Wunsch character-level alignment prioritizing vowel-to-vowel alignment.
    Returns list of tuples (c1, c2) where c1 from s1 (or '-') and c2 from s2 (or '-').
    """
    m, n = len(s1), len(s2)
    dp = [[0.0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1): dp[i][0] = -1.0 * i
    for j in range(n + 1): dp[0][j] = -1.0 * j
    
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            c1, c2 = s1[i - 1], s2[j - 1]
            if c1 == c2:
                match = dp[i - 1][j - 1] + 2.0
            elif c1 in 'aeiou' and c2 in 'aeiou':
                match = dp[i - 1][j - 1] + 1.0  # Vowel match preference
            else:
                match = dp[i - 1][j - 1] - 1.0
            delete = dp[i - 1][j] - 1.0
            insert = dp[i][j - 1] - 1.0
            dp[i][j] = max(match, delete, insert)
            
    i, j = m, n
    aligned = []
    while i > 0 or j > 0:
        c1 = s1[i - 1] if i > 0 else '-'
        c2 = s2[j - 1] if j > 0 else '-'
        
        if i > 0 and j > 0:
            score = 2.0 if c1 == c2 else (1.0 if c1 in 'aeiou' and c2 in 'aeiou' else -1.0)
            if abs(dp[i][j] - (dp[i - 1][j - 1] + score)) < 1e-6:
                aligned.append((c1, c2))
                i -= 1; j -= 1
                continue
        if i > 0 and abs(dp[i][j] - (dp[i - 1][j] - 1.0)) < 1e-6:
            aligned.append((c1, '-'))
            i -= 1
        else:
            aligned.append(('-', c2))
            j -= 1
            
    aligned.reverse()
    return aligned

def transfer_vowel_shifts_from_w2v(target_word, resend_word, w2v_word):
    """
    Checks Wav2Vec letter-by-letter against target word. If Wav2Vec heard a vowel shifting
    (e.g., 'senro' has 'e' instead of 'i' in 'sino', or 'detro' has 'e' instead of 'i' in 'dito'),
    transfers that vowel directly into the Resend word.
    """
    if not target_word or not resend_word or not w2v_word:
        return resend_word
        
    t = target_word.lower()
    s = resend_word.lower()
    w = w2v_word.lower()

    # Consonant gate: Ensure w2v has compatible consonants with target
    # Prevents completely different/unrelated words from transferring vowels
    t_consonants = [c for c in t if c not in 'aeiou']
    w_consonants = [c for c in w if c not in 'aeiou']
    if t_consonants:
        common_cons = sum(1 for c in t_consonants if c in w_consonants)
        if (common_cons / len(t_consonants)) < 0.5:
            return resend_word
    
    # 1. Align target to w2v letter-by-letter
    t_w_aligned = align_chars_nw(t, w)
    
    # Map target char index -> w2v shifted vowel (strictly (e, i) and (o, u) only)
    t_idx = 0
    t_to_w2v_vowels = {}
    for c_t, c_w in t_w_aligned:
        if c_t != '-':
            is_allowed_shift = (c_t in ('e', 'i') and c_w in ('e', 'i')) or (c_t in ('o', 'u') and c_w in ('o', 'u'))
            if is_allowed_shift and c_t != c_w:
                t_to_w2v_vowels[t_idx] = c_w
            t_idx += 1
            
    if not t_to_w2v_vowels:
        return resend_word
        
    # 2. Align target to resend letter-by-letter
    t_s_aligned = align_chars_nw(t, s)
    
    # Map target char index -> resend char index
    t_idx = 0
    s_idx = 0
    t_to_s_idx = {}
    for c_t, c_s in t_s_aligned:
        curr_t = t_idx if c_t != '-' else None
        curr_s = s_idx if c_s != '-' else None
        if curr_t is not None and curr_s is not None:
            t_to_s_idx[curr_t] = curr_s
        if c_t != '-': t_idx += 1
        if c_s != '-': s_idx += 1
        
    # 3. Apply w2v vowel shift to resend word, preserving original casing
    s_chars = list(resend_word)
    for t_i, w2v_vowel in t_to_w2v_vowels.items():
        if t_i in t_to_s_idx:
            s_i = t_to_s_idx[t_i]
            orig_c = s_chars[s_i]
            if orig_c.isupper():
                s_chars[s_i] = w2v_vowel.upper()
            else:
                s_chars[s_i] = w2v_vowel.lower()
            
    return "".join(s_chars)

def normalize_vowels(s):
    return s.replace('e', 'i').replace('o', 'u')

def clean_word_chars(w):
    if not w:
        return ""
    w = str(w).lower()
    w = re.sub(r"[-'\u2010-\u2015\ufe63\uff0d’‘`]", '', w)
    return w

def resend_lacks_letter_and_w2v_has_it(target, resend, w2v):
    """
    Checks if Resend is lacking letters from the target text (e.g. dropped '-ng'
    ligature or trailing/leading letters like 'pito' vs 'pitong'), but Wav2Vec
    captured those missing letters.
    """
    if not target or not resend or not w2v:
        return False

    t_raw = clean_word_chars(target)
    s_raw = clean_word_chars(resend)
    w_raw = clean_word_chars(w2v)

    if s_raw == t_raw:
        return False
    if len(s_raw) >= len(t_raw):
        return False

    t_v = normalize_vowels(t_raw)
    s_v = normalize_vowels(s_raw)
    w_v = normalize_vowels(w_raw)

    is_lacking = False
    diff_len = len(t_raw) - len(s_raw)

    # 1. Trailing ligature -ng, -g, or -n (e.g. pito -> pitong, ibon -> ibong)
    if (s_raw + 'ng' == t_raw or s_raw + 'g' == t_raw or s_raw + 'n' == t_raw or
        s_v + 'ng' == t_v or s_v + 'g' == t_v or s_v + 'n' == t_v):
        is_lacking = True
    # 2. Target starts with resend (missing suffix of up to 3 chars)
    elif (t_raw.startswith(s_raw) or t_v.startswith(s_v)) and diff_len <= 3:
        is_lacking = True
    # 3. Target ends with resend (missing prefix of up to 3 chars)
    elif (t_raw.endswith(s_raw) or t_v.endswith(s_v)) and diff_len <= 3:
        is_lacking = True
    # 4. Target contains resend as subsequence (missing up to 2 chars inside)
    elif (is_subsequence(s_raw, t_raw) or is_subsequence(s_v, t_v)) and diff_len <= 2:
        is_lacking = True

    if not is_lacking:
        return False

    # Check if Wav2Vec actually has the target word or the missing letter(s)
    # A) Exact or vowel-normalized match with target
    if w_raw == t_raw or w_v == t_v:
        return True

    # B) Especially trailing 'ng': target has 'ng', resend lacks 'ng', and w2v has 'ng'
    if t_raw.endswith('ng') and not s_raw.endswith('ng') and w_raw.endswith('ng') and len(w_raw) > len(s_raw):
        return True

    # C) Missing trailing suffix captured by w2v
    if t_raw.startswith(s_raw):
        missing_suffix = t_raw[len(s_raw):]
        if w_raw.endswith(missing_suffix) and len(w_raw) > len(s_raw):
            return True

    return False

def should_append_trailing_s_from_w2v(target_word, current_word, w2v_word):
    """
    If Wav2Vec acoustically captured a trailing 's' at the end of the word,
    append it even if it doesn't match the target text (e.g. target='nanginginig',
    resend='nanginginig', w2v='nanhghjinigs' -> 'nanginginigs').
    """
    if not current_word or not w2v_word:
        return False

    # If the current word already ends with 's', nothing to add
    if current_word.lower().endswith('s'):
        return False

    # If target text naturally ends with 's' (e.g. 'beses', 'Atenas', 'tapos', 'nais'),
    # the target word already has 's', so do not append another 's'
    if target_word and target_word.lower().endswith('s'):
        return False

    w2v_clean = w2v_word.lower().strip()
    if len(w2v_clean) >= 2 and w2v_clean.endswith('s'):
        t_clean = target_word.lower().strip() if target_word else ""
        c_clean = current_word.lower().strip()

        # Check if w2v shares prefix with target or current word
        prefix_t = t_clean[:2] if len(t_clean) >= 2 else t_clean
        prefix_c = c_clean[:2] if len(c_clean) >= 2 else c_clean

        if (prefix_t and w2v_clean.startswith(prefix_t)) or (prefix_c and w2v_clean.startswith(prefix_c)):
            return True

        # Check stem distance to ensure w2v is referring to the same word
        w2v_stem = w2v_clean[:-1]
        if t_clean and modified_levenshtein(w2v_stem, t_clean) <= 0.45:
            return True
        if c_clean and modified_levenshtein(w2v_stem, c_clean) <= 0.45:
            return True

    return False

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


def get_model_consensus_word(target_word, w1, w2, w3):
    """
    Checks all models one-by-one, letter-by-letter.
    If 2 or more models agree on a word or on specific letters of that word,
    use the consensus agreed upon by the models (e.g. if both w1 and w3 have 'ginalot',
    it will automatically use 'ginalot' and not 'ginamot').
    """
    if not w1 and not w2 and not w3:
        return target_word or ""
        
    t_lower = target_word.lower() if target_word else ""
    w1_lower = w1.lower() if w1 else ""
    w2_lower = w2.lower() if w2 else ""
    w3_lower = w3.lower() if w3 else ""
    
    # 1. Full word agreement among at least 2 models
    valid_words = [w for w in [w1_lower, w2_lower, w3_lower] if w]
    counts = Counter(valid_words)
    for word, count in counts.most_common():
        if count >= 2:
            return word
            
    # 2. Letter-by-letter check across all 3 models aligned against target
    al1 = [s for t, s in align_chars(t_lower, w1_lower)] if w1_lower else ['-'] * len(t_lower)
    al2 = [s for t, s in align_chars(t_lower, w2_lower)] if w2_lower else ['-'] * len(t_lower)
    al3 = [s for t, s in align_chars(t_lower, w3_lower)] if w3_lower else ['-'] * len(t_lower)
    
    res_chars = []
    for i in range(len(t_lower)):
        chars_at_i = [c for c in [al1[i], al2[i], al3[i]] if c != '-']
        if chars_at_i:
            c_counts = Counter(chars_at_i)
            top_char, count = c_counts.most_common(1)[0]
            if count >= 2:
                res_chars.append(top_char)
            else:
                res_chars.append(al1[i] if al1[i] != '-' else (al3[i] if al3[i] != '-' else t_lower[i]))
        else:
            res_chars.append(t_lower[i])
            
    return "".join(res_chars)


def modified_levenshtein(word1, word2):
    """
    MODIFIED LEVENSHTEIN DISTANCE (MLD) - "The Phonics Expert"
    ----------------------------------------------------------
    Panel Explanation:
    Standard Levenshtein treats every letter substitution equally (cost = 1.0).
    However, Filipino phonology naturally exhibits regional accent variations
    (e.g., Bisaya and Batangueño interchanging e/i and o/u, or d/r allophones).
    
    This function acts as 'The Phonics Expert':
    - Exact letter match: Cost 0.0 (no penalty)
    - Filipino accent / vowel shift: Cost 0.3 (lenient penalty)
    - Genuine error / gibberish: Cost 1.0 (strict penalty)
    
    Returns: A normalized distance from 0.0 (identical) to 1.0 (completely different),
    which 'The Lead Teacher' (Needleman-Wunsch) uses with a 0.4 threshold.
    """
    # Step 1: Pre-clean and phonetically standardize both words
    w1 = phonetic_normalize(word1)
    w2 = phonetic_normalize(word2)
    m, n = len(w1), len(w2)

    # Step 2: Setup Dynamic Programming (DP) letter-by-letter grid
    # dp[i][j] stores the minimum edit cost between w1[0..i-1] and w2[0..j-1]
    dp = [[0.0] * (n + 1) for _ in range(m + 1)]

    # Step 3: Base cases - cost of deleting or inserting letters
    for i in range(m + 1): dp[i][0] = float(i)  # Deletions
    for j in range(n + 1): dp[0][j] = float(j)  # Insertions

    # Step 4: Fill the DP matrix letter by letter
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if w1[i - 1] == w2[j - 1]:
                # Exact match: Cost 0.0 (no penalty)
                dp[i][j] = dp[i - 1][j - 1]
            else:
                c1, c2 = w1[i - 1], w2[j - 1]
                
                # Check for regional Filipino vowel shifts (e.g., e <-> i, o <-> u)
                # Commonly heard in Bisaya and Batangueño regional accents
                is_vowel_shift = (c1 == 'e' and c2 == 'i') or (c1 == 'i' and c2 == 'e') or \
                                 (c1 == 'o' and c2 == 'u') or (c1 == 'u' and c2 == 'o')
                
                # Check for Filipino consonant/allophonic variations (e.g., d <-> r, l <-> r, p <-> b)
                is_consonant_shift = (c1 == 'd' and c2 == 'r') or (c1 == 'r' and c2 == 'd') or \
                                     (c1 == 'l' and c2 == 'r') or (c1 == 'r' and c2 == 'l') or \
                                     (c1 == 'p' and c2 == 'b') or (c1 == 'b' and c2 == 'p')
                
                # Assign penalty: lenient for dialectal accents, strict for errors
                if is_vowel_shift or is_consonant_shift:
                    cost = 0.3  # Lenient penalty for valid Filipino phonetic variations
                else:
                    cost = 1.0  # Strict penalty for genuine mispronunciation or gibberish
                
                # Step 5: Pick the cheapest path (Insertion, Deletion, or Substitution)
                dp[i][j] = min(
                    dp[i - 1][j] + 1.0,         # Deletion
                    dp[i][j - 1] + 1.0,         # Insertion
                    dp[i - 1][j - 1] + cost     # Substitution (lenient 0.3 or strict 1.0)
                )

    # Step 6: Normalize by dividing total penalty by the length of the longer word
    # Produces a normalized distance: 0.0 = perfect match, 1.0 = completely different
    max_len = max(len(w1), len(w2))
    if max_len == 0: return 0.0
    return dp[m][n] / float(max_len)



# =================================================================
# 2. NEEDLEMAN-WUNSCH ALGORITHM (NWA) - GLOBAL SEQUENCE ALIGNMENT
# -----------------------------------------------------------------
# - Role: "Macro / Sentence-Level Structural Alignment"
# - Purpose: Prevents cascading alignment errors when a student
#   skips a word (omission/deletion) or inserts filler words.
# - Recurrence: F(i, j) = max[ F(i-1,j-1)+S(xi,yj), F(i-1,j)+d, F(i,j-1)+d ]
# - Pointers:
#     'D' (Diagonal) = Word match or phonetic substitution
#     'U' (Up)       = Omission / Deletion (word skipped by reader)
#     'L' (Left)     = Insertion (extra/filler word spoken by reader)
# =================================================================
def needleman_wunsch_alignment(target_words, spoken_words, vowel_shifted_targets=None):
    # Alignment scoring weights
    MATCH    =  5.0   # Reward score awarded for exact or close phonetic match
    MISMATCH = -2.0   # Penalty score assessed for completely unaligned word substitution
    GAP      = -2.0   # Penalty score assessed for structural omission or insertion

    # Get sequence lengths
    m, n = len(target_words), len(spoken_words)
    # Initialize DP score grid of size (m+1) x (n+1) with float zeros
    score    = [[0.0]  * (n + 1) for _ in range(m + 1)]
    # Initialize directional pointers grid ('D'=Diagonal, 'U'=Up, 'L'=Left)
    pointers = [[None] * (n + 1) for _ in range(m + 1)]

    # Base case: Initialize first column (deletions/omissions) with cumulative gap penalties
    for i in range(m + 1):
        score[i][0]    = GAP * i
        pointers[i][0] = 'U'  # Up pointer represents word skipped by reader
    # Base case: Initialize first row (insertions) with cumulative gap penalties
    for j in range(n + 1):
        score[0][j]    = GAP * j
        pointers[0][j] = 'L'  # Left pointer represents extra filler word inserted by reader
    pointers[0][0] = None

    # Step 1: Populate the 2D Dynamic Programming alignment matrix
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            t_w = target_words[i - 1]  # Target word at index i-1
            s_w = spoken_words[j - 1]  # Spoken word at index j-1
            t_low = t_w.lower()
            s_low = s_w.lower()
            w1_norm = phonetic_normalize(t_w)
            w2_norm = phonetic_normalize(s_w)
            # Check for zero phonetic distance (exact match, Tagalog synonym, or identical phonetics)
            is_zero_dist = (t_low == s_low) or check_is_synonym(t_low, s_low) or (w1_norm == w2_norm)

            if is_zero_dist:
                match_score = score[i - 1][j - 1] + MATCH  # Full match score
            else:
                # Calculate character-level Modified Levenshtein Distance (MLD)
                dist = modified_levenshtein(t_w, s_w)
                # If phonetic difference is within threshold (<= 0.4) or a recognized accent shift:
                if is_stutter(t_w, s_w) or has_vowel_shift(t_w, s_w) or dist <= 0.4:
                    match_score = score[i - 1][j - 1] + (MATCH * (1.0 - dist))  # Proportional match score
                else:
                    match_score = score[i - 1][j - 1] + MISMATCH  # Substitution penalty

            # Calculate gap scores for vertical (deletion) and horizontal (insertion) transitions
            delete_score = score[i - 1][j] + GAP
            insert_score = score[i][j - 1] + GAP
            # Select the optimal alignment path score using recurrence formula
            best_score   = max(match_score, delete_score, insert_score)
            score[i][j]  = best_score

            # Record directional pointer for optimal backtracking
            if best_score == match_score: pointers[i][j] = 'D'       # Diagonal: align pair
            elif best_score == delete_score: pointers[i][j] = 'U'    # Up: omission
            else: pointers[i][j] = 'L'                               # Left: insertion

    # Step 2: Backtrack from bottom-right F(m, n) to origin F(0, 0)
    i, j = m, n
    errors = 0
    correct_words = 0

    while i > 0 or j > 0:
        if pointers[i][j] == 'D':
            # Diagonal step: Inspect pronunciation accuracy of the aligned pair
            is_correct = is_correct_pronunciation(target_words[i - 1], spoken_words[j - 1])
            if vowel_shifted_targets and (i - 1) in vowel_shifted_targets:
                is_correct = False
                
            if is_correct:
                correct_words += 1  # Valid pronunciation or accepted regional dialect
            else:
                errors += 1         # Genuine mispronunciation / substitution error
            i -= 1; j -= 1
        elif pointers[i][j] == 'U':
            errors += 1; i -= 1     # Up step: Omission error (student skipped a word)
        elif pointers[i][j] == 'L':
            errors += 1; j -= 1     # Left step: Insertion error (student added a word)

    # Return total correct words and total reading errors
    return correct_words, errors

def get_alignment_mapping(target_words, spoken_words):
    # Alignment scoring weights for global sequence matching
    MATCH    =  5.0   # Reward score for phonetic or exact match
    MISMATCH = -2.0   # Penalty score for differing words
    GAP      = -2.0   # Penalty score for omission (deletion) or insertion

    # Get word counts of target reference text and spoken transcript
    m, n = len(target_words), len(spoken_words)
    # Initialize DP score matrix of dimensions (m+1) x (n+1) with 0.0
    score    = [[0.0]  * (n + 1) for _ in range(m + 1)]
    # Initialize pointer matrix to store backtrack directions ('D', 'U', 'L')
    pointers = [[None] * (n + 1) for _ in range(m + 1)]

    # Base case: Initialize first column with cumulative gap penalties for target word omissions
    for i in range(m + 1):
        score[i][0]    = GAP * i
        pointers[i][0] = 'U'  # Up pointer = student omitted this target word
    # Base case: Initialize first row with cumulative gap penalties for spoken insertions
    for j in range(n + 1):
        score[0][j]    = GAP * j
        pointers[0][j] = 'L'  # Left pointer = student inserted an extra word
    pointers[0][0] = None     # Origin cell has no prior pointer

    # Populate 2D DP matrix using optimal alignment recurrence formula
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            # Calculate phonetic distance between current target word and spoken word via MLD
            dist = modified_levenshtein(target_words[i - 1], spoken_words[j - 1])
            # Case 1: Check if pronunciation is acceptable (exact, synonym, or dialectal variation)
            if is_correct_pronunciation(target_words[i - 1], spoken_words[j - 1]):
                match_score = score[i - 1][j - 1] + (MATCH * (1.0 - dist))
            # Case 2: Partial credit for stutters or valid Tagalog regional vowel shifts
            elif is_stutter(target_words[i - 1], spoken_words[j - 1]) or has_vowel_shift(target_words[i - 1], spoken_words[j - 1]):
                match_score = score[i - 1][j - 1] + (MATCH * 0.5)
            # Case 3: Complete mismatch / substitution
            else:
                match_score = score[i - 1][j - 1] + MISMATCH
            # Calculate gap scores for vertical deletion and horizontal insertion
            delete_score = score[i - 1][j] + GAP
            insert_score = score[i][j - 1] + GAP
            # Determine maximum score among diagonal, up, and left transitions
            best_score   = max(match_score, delete_score, insert_score)
            score[i][j]  = best_score

            # Save directional pointer according to the winning transition path
            if best_score == match_score: pointers[i][j] = 'D'       # Diagonal: align target to spoken
            elif best_score == delete_score: pointers[i][j] = 'U'    # Up: target word was omitted
            else: pointers[i][j] = 'L'                               # Left: spoken word was inserted

    # Trace back from bottom-right (m, n) to construct bidirectional word index mappings
    i, j = m, n
    spoken_to_target = {}  # Maps spoken word index -> target word index
    target_to_spoken = {}  # Maps target word index -> spoken word string

    while i > 0 or j > 0:
        if pointers[i][j] == 'D':
            # Diagonal: spoken word j-1 corresponds to target word i-1
            spoken_to_target[j - 1] = i - 1
            target_to_spoken[i - 1] = spoken_words[j - 1]
            i -= 1; j -= 1
        elif pointers[i][j] == 'U':
            # Up: target word i-1 was skipped by the student (omission)
            target_to_spoken[i - 1] = None
            i -= 1
        elif pointers[i][j] == 'L':
            # Left: spoken word j-1 was an extra word inserted by the student
            spoken_to_target[j - 1] = None
            j -= 1

    # Return bidirectional alignment index dictionaries
    return spoken_to_target, target_to_spoken



def has_vowel_shift(word1, word2):
    # Lengths of both input words for DP character matrix
    m, n = len(word1), len(word2)
    # Initialize DP matrix for character-level edit distance
    dp = [[0.0] * (n + 1) for _ in range(m + 1)]
    # Matrix tracking whether a regional vowel shift occurred on the optimal edit path
    has_v_shift = [[False] * (n + 1) for _ in range(m + 1)]

    # Base case initialization for deletions and insertions
    for i in range(m + 1): dp[i][0] = float(i)
    for j in range(n + 1): dp[0][j] = float(j)

    # Fill DP matrix comparing characters of word1 against word2
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if word1[i - 1] == word2[j - 1]:
                # Exact character match: carry forward previous cost and shift state
                dp[i][j] = dp[i - 1][j - 1]
                has_v_shift[i][j] = has_v_shift[i - 1][j - 1]
            else:
                c1, c2 = word1[i - 1], word2[j - 1]
                vowels = {'a', 'e', 'i', 'o', 'u'}
                # Check for vowel shift (e.g. Bisaya/Batangueno interchangeable vowels: e<->i, o<->u)
                is_vowel_shift = (c1 in vowels and c2 in vowels and c1 != c2)
                # Check for accepted Tagalog dialectal consonant shifts (d<->r, l<->r, c<->k)
                is_consonant_shift = (c1 == 'd' and c2 == 'r') or (c1 == 'r' and c2 == 'd') or \
                                     (c1 == 'l' and c2 == 'r') or (c1 == 'r' and c2 == 'l') or \
                                     (c1 == 'c' and c2 == 'k') or (c1 == 'k' and c2 == 'c')
                
                # Assign lower cost of 0.3 for valid regional dialect shifts vs 1.0 for general errors
                cost = 0.3 if (is_vowel_shift or is_consonant_shift) else 1.0
                
                # Calculate cost for deletion, insertion, and substitution
                d_val = dp[i - 1][j] + 1.0
                i_val = dp[i][j - 1] + 1.0
                s_val = dp[i - 1][j - 1] + cost
                
                # Find minimum edit cost transition
                best = min(d_val, i_val, s_val)
                dp[i][j] = best
                
                # Update shift tracking boolean based on which transition won
                if best == s_val:
                    has_v_shift[i][j] = has_v_shift[i - 1][j - 1] or is_vowel_shift
                elif best == d_val:
                    has_v_shift[i][j] = has_v_shift[i - 1][j]
                else:
                    has_v_shift[i][j] = has_v_shift[i][j - 1]
                    
    # Return true if any regional vowel shift occurred on the optimal character path
    return has_v_shift[m][n]

def has_omission(target, spoken):
    if not target or not spoken:
        return False
    t_norm = phonetic_normalize(target)
    s_norm = phonetic_normalize(spoken)
    
    if len(s_norm) < len(t_norm):
        it = iter(t_norm)
        if all(c in it for c in s_norm):
            return True
    return False




import re

def normalize_vowels(word):
    word = word.lower()
    word = word.replace('o', 'u')
    word = word.replace('e', 'i')
    return word

def reduce_word(word):
    prev = ''
    while word != prev:
        prev = word
        for length in range(4, 0, -1):
            pattern = r'(.{' + str(length) + r'})(\1)+'
            word = re.sub(pattern, r'\1', word)
    return word

def is_stutter(target, spoken):
    if not target or not spoken:
        return False
    t_norm = normalize_vowels(phonetic_normalize(target))
    s_norm = normalize_vowels(phonetic_normalize(spoken))
    
    if len(s_norm) <= len(t_norm) or s_norm == t_norm:
        return False
        
    return reduce_word(s_norm) == reduce_word(t_norm)

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
            target_chars = set(normalize_vowels(phonetic_normalize(target_word)))
            
            # Forward check
            j = idx + 1
            while j < n and spoken_to_target.get(j) is None:
                adj_word = merged[j]
                adj_chars = set(normalize_vowels(phonetic_normalize(adj_word)))
                if adj_chars.issubset(target_chars) and len(adj_word) <= 5:
                    merged[idx] = merged[idx] + adj_word
                    to_remove.add(j)
                    j += 1
                else:
                    break
                    
            # Backward check
            j = idx - 1
            while j >= 0 and spoken_to_target.get(j) is None and j not in to_remove:
                adj_word = merged[j]
                adj_chars = set(normalize_vowels(phonetic_normalize(adj_word)))
                if adj_chars.issubset(target_chars) and len(adj_word) <= 5:
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
        
    m, n = len(target_str), len(spoken_str)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1): dp[i][0] = i
    for j in range(n + 1): dp[0][j] = j
    
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if target_str[i - 1] == spoken_str[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + 1)
                
    i, j = m, n
    aligned = []
    while i > 0 or j > 0:
        if i > 0 and j > 0 and (target_str[i - 1] == spoken_str[j - 1] or dp[i][j] == dp[i - 1][j - 1] + 1):
            aligned.append((target_str[i - 1], spoken_str[j - 1]))
            i -= 1; j -= 1
        elif i > 0 and (j == 0 or dp[i][j] == dp[i - 1][j] + 1):
            aligned.append((target_str[i - 1], '-'))
            i -= 1
        else:
            aligned.append(('-', spoken_str[j - 1]))
            j -= 1
            
    aligned.reverse()
    
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
            
        t_lower = t_word.lower()
        s_lower = s_word.lower()
        
        dist_ratio = modified_levenshtein(t_lower, s_lower)
        raw_dist = dist_ratio * max(len(t_lower), len(s_lower))
        max_dist = max(2, len(t_word) // 3)
        
        is_stutter_case = is_stutter(t_lower, s_lower)
        is_vowel_shift_case = has_vowel_shift(t_lower, s_lower)
        is_omission_case = has_omission(t_lower, s_lower) or (len(s_lower) < len(t_lower) and set(s_lower).issubset(set(t_lower)))
        is_insertion_case = len(s_lower) > len(t_lower) and set(t_lower).issubset(set(s_lower))
        
        if is_stutter_case or is_vowel_shift_case or is_omission_case or is_insertion_case:
            adjusted_words.append(s_lower)
        elif raw_dist <= max_dist or is_correct_pronunciation(t_lower, s_lower):
            adjusted_words.append(t_lower)
        else:
            adjusted_words.append(s_lower)
            
    return " ".join(adjusted_words)

def iq_adjust_wav2vec3(target_words, raw_transcription):
    """
    Advanced wav2vec 3 logic: Highly accurate detection of vowel shifts,
    stutters, and specifically deletions of letters in words.
    """
    target_str = "".join(target_words).lower()
    spoken_str = raw_transcription.replace(" ", "").lower()
    
    if not spoken_str:
        return raw_transcription
        
    # We need an alignment that preserves insertions (t_char == '-')
    m, n = len(target_str), len(spoken_str)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1): dp[i][0] = i
    for j in range(n + 1): dp[0][j] = j
    
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if target_str[i - 1] == spoken_str[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + 1)
                
    i, j = m, n
    aligned = []
    while i > 0 or j > 0:
        if i > 0 and j > 0 and (target_str[i - 1] == spoken_str[j - 1] or dp[i][j] == dp[i - 1][j - 1] + 1):
            aligned.append((target_str[i - 1], spoken_str[j - 1]))
            i -= 1; j -= 1
        elif i > 0 and (j == 0 or dp[i][j] == dp[i - 1][j] + 1):
            aligned.append((target_str[i - 1], '-'))
            i -= 1
        else:
            aligned.append(('-', spoken_str[j - 1]))
            j -= 1
            
    aligned.reverse()
    
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
            
        t_lower = t_word.lower()
        s_lower = s_word.lower()
        
        # Exact match or standard orthographic equivalent (c vs s, hyphens, apostrophes)
        t_norm = phonetic_normalize(t_lower)
        s_norm = phonetic_normalize(s_lower)
        c_s_match = (t_lower.replace('c', 's') == s_lower.replace('c', 's'))
        
        if t_lower == s_lower or t_norm == s_norm or c_s_match:
            adjusted_words.append(t_lower)
            continue
            
        # Vowel shifting (combined with wav2vec 2): legitimate regional accent shift (e<->i, o<->u)
        is_pure_vowel = is_pure_vowel_shift(t_lower, s_lower)
        
        # Disfluencies / acoustic errors (like wav2vec 1):
        # Stuttering, insertion, deletion, and consonant/general substitutions
        is_stutter_case = is_stutter(t_lower, s_lower)
        is_insertion_case = (len(s_lower) > len(t_lower))
        is_deletion_case = (len(s_lower) < len(t_lower))
        is_substitution_case = (len(s_lower) == len(t_lower) and not is_pure_vowel)
        
        # Wav2Vec 3 strictly preserves all disfluencies/acoustic errors (DO NOT auto-correct)
        # while recognizing pure vowel shifts like wav2vec 2
        if is_stutter_case or is_insertion_case or is_deletion_case or is_substitution_case or is_pure_vowel:
            adjusted_words.append(s_lower)
        else:
            adjusted_words.append(s_lower)
            
    return " ".join(adjusted_words)

def score_candidate(target_words, raw_transcription, level=None):
    spoken   = clean_text(raw_transcription)
    if level and level.lower() == 'beginner':
        optimized = spoken
    else:
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
        elif idx < len(target_tokens) and target_tokens[idx] and target_tokens[idx][0].isupper():
            trans_words[idx] = trans_words[idx].capitalize()
            
    return " ".join(trans_words)

def dedup_expert_fragment_doublings(final_opt, fused_spoken_to_target, target_words):
    """
    Expert mode deduplication: Prevents fragmented acoustic pieces (e.g. 'na', 'walang')
    from lingering in front of or behind an aligned target compound word (e.g. 'Nawalang-saysay'),
    which causes duplicated phrases like 'na walang Nawalang-saysay'.
    """
    if not final_opt:
        return final_opt
        
    t_clean_list = [t.lower().replace('c', 's').replace('-', '').replace("'", "") for t in target_words]
    target_clean_set = set(t_clean_list)
    to_remove_indices = set()
    
    # Pass 1: Alignment-based removal of unaligned fragments adjacent to aligned target words
    for idx_spoken, idx_target in fused_spoken_to_target.items():
        if idx_target is not None and idx_target < len(t_clean_list):
            t_clean = t_clean_list[idx_target]
            
            # Check backward unaligned insertions
            back_words = []
            back_indices = []
            j = idx_spoken - 1
            while j >= 0 and fused_spoken_to_target.get(j) is None:
                back_words.insert(0, final_opt[j].lower())
                back_indices.insert(0, j)
                j -= 1
                
            if back_words:
                for start_k in range(len(back_words)):
                    sub_joined = ''.join(back_words[start_k:]).replace('c', 's').replace('-', '').replace("'", "")
                    if t_clean.startswith(sub_joined) and len(sub_joined) >= 2:
                        for r_idx in back_indices[start_k:]:
                            to_remove_indices.add(r_idx)
                        break

            # Check forward unaligned insertions
            fwd_words = []
            fwd_indices = []
            j = idx_spoken + 1
            while j < len(final_opt) and fused_spoken_to_target.get(j) is None:
                fwd_words.append(final_opt[j].lower())
                fwd_indices.append(j)
                j += 1
                
            if fwd_words:
                for end_k in range(len(fwd_words), 0, -1):
                    sub_joined = ''.join(fwd_words[:end_k]).replace('c', 's').replace('-', '').replace("'", "")
                    if t_clean.endswith(sub_joined) and len(sub_joined) >= 1:
                        for r_idx in fwd_indices[:end_k]:
                            to_remove_indices.add(r_idx)
                        break

    temp_opt = [final_opt[i] for i in range(len(final_opt)) if i not in to_remove_indices]
    
    # Pass 2: Sequential prefix/compound duplicate safety scan
    clean_words = [w.lower().replace('c', 's').replace('-', '').replace("'", "") for w in temp_opt]
    final_result = []
    i = 0
    while i < len(temp_opt):
        # Check 2-word compound prefix doubling: e.g. ['na', 'walang', 'Nawalang-saysay']
        if i + 2 < len(temp_opt):
            two_joined = clean_words[i] + clean_words[i+1]
            next_word = clean_words[i+2]
            if next_word in target_clean_set and next_word.startswith(two_joined) and len(two_joined) >= 3:
                i += 2
                continue
                
        # Check 1-word prefix doubling: e.g. ['nawalang', 'Nawalang-saysay']
        if i + 1 < len(temp_opt):
            one_word = clean_words[i]
            next_word = clean_words[i+1]
            if next_word in target_clean_set and next_word.startswith(one_word) and len(one_word) >= 4:
                i += 1
                continue
                
        final_result.append(temp_opt[i])
        i += 1
        
    return final_result

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

    req_id = str(uuid.uuid4())
    webm_path      = os.path.join(UPLOAD_FOLDER, f"{req_id}.webm")
    wav_raw_path   = os.path.join(UPLOAD_FOLDER, f"{req_id}_raw.wav")
    wav_clean_path = os.path.join(UPLOAD_FOLDER, f"{req_id}_clean.wav")
    audio_file.save(webm_path)
    import sys, traceback as _tb

    try:
        print(f"[DEBUG] webm saved, size={os.path.getsize(webm_path)}")
        convert_webm_to_wav(webm_path, wav_raw_path)
        print(f"[DEBUG] webm->wav OK, size={os.path.getsize(wav_raw_path)}")
        duration_seconds = preprocess_audio(wav_raw_path, wav_clean_path)
        print(f"[DEBUG] preprocess OK, duration={duration_seconds}")

        level = request.form.get('level', '')
        safe_level = level.lower() if level else ''
        target_words = clean_text(target_text)

        # =============================================================
        # BRANCH 1: MODERATE, EXPERT & CLASSROOM -> RESEND CLOUD STT WITH WAV2VEC FALLBACK
        # =============================================================
        if safe_level in ['moderate', 'expert', 'classroom'] or 'classroom' in safe_level or 'grade' in safe_level:
            print(f"[EVALUATION] {level.upper()} mode active: using Resend Cloud STT...")
            resend_raw = transcribe_resend(wav_clean_path, target_words)
            
            # Fallback only if Resend fails or returns empty
            if not resend_raw or not resend_raw.strip():
                print(f"[EVALUATION] Resend unavailable or empty, falling back to local Wav2Vec...")
                active_raw = transcribe_wav2vec(wav_clean_path)
                active_raw = normalize_tagalog_numbers(active_raw, target_words)
                resend_used = False
            else:
                active_raw = resend_raw
                resend_used = True

            if not active_raw.strip():
                return jsonify({
                    "error": "No speech detected. Please speak clearly into the microphone.",
                    "status": "empty"
                }), 400

            active_raw = normalize_tagalog_numbers(active_raw, target_words)

            w2v_expert_raw = ""
            if safe_level in ['moderate', 'expert']:
                try:
                    w2v_expert_raw = transcribe_wav2vec(wav_clean_path)
                    print(f"[WAV2VEC] Acoustic check OK: '{w2v_expert_raw}'")
                except Exception as e:
                    print(f"[WAV2VEC] Acoustic transcription error: {e}")

            if safe_level == 'expert':
                for wrong, right in EXPERT_CORRECTIONS.items():
                    active_raw = active_raw.replace(wrong, right)

            # Auto-convert only if on the reference target text:
            target_lower_str = " ".join(target_words).lower()
            if 'tiyago' in target_lower_str:
                active_raw = re.sub(r'\btiago\b', 'Tiyago', active_raw, flags=re.IGNORECASE)
                if w2v_expert_raw:
                    w2v_expert_raw = re.sub(r'\btiago\b', 'tiyago', w2v_expert_raw, flags=re.IGNORECASE)
            if 'atenas' in target_lower_str:
                active_raw = re.sub(r'\b(?:athinas|atinas)\b', 'Atenas', active_raw, flags=re.IGNORECASE)
                if w2v_expert_raw:
                    w2v_expert_raw = re.sub(r'\b(?:athinas|atinas)\b', 'atenas', w2v_expert_raw, flags=re.IGNORECASE)
            if 'kasama' in target_lower_str:
                active_raw = re.sub(r'\bkkasamama\b', 'kasama', active_raw, flags=re.IGNORECASE)
                if w2v_expert_raw:
                    w2v_expert_raw = re.sub(r'\bkkasamama\b', 'kasama', w2v_expert_raw, flags=re.IGNORECASE)

            spoken_words = clean_text(active_raw)
            if safe_level == 'expert':
                opt_words = list(spoken_words)
            else:
                opt_words = fix_segmentation_errors(target_words, spoken_words)
            cleaned_opt = merge_syllable_hallucinations_and_stutters(opt_words, target_words)

            spoken_to_target, target_to_spoken = get_alignment_mapping(target_words, cleaned_opt)

            target_to_w2v = {}
            if w2v_expert_raw and w2v_expert_raw.strip():
                w2v_words = clean_text(w2v_expert_raw)
                _, target_to_w2v = get_alignment_mapping(target_words, w2v_words)

            # In Expert mode: Check if Resend matches target text or if the user spoke gibberish
            if safe_level == 'expert' and w2v_expert_raw and w2v_expert_raw.strip():
                # Check if Resend shares ANY matching letters with target text
                target_chars_all = set("".join(target_words).lower())
                resend_chars_all = set("".join(cleaned_opt).lower())
                has_any_common_char = bool(target_chars_all & resend_chars_all)

                resend_has_matched_letters = any(
                    idx_t is not None and bool(set(target_words[idx_t].lower()) & set(cleaned_opt[idx_s].lower()))
                    for idx_s, idx_t in spoken_to_target.items()
                ) or has_any_common_char

                # Only use Wav2Vec if Resend is completely unmatched (no matching letters at all / 99%+ different)
                if not resend_has_matched_letters:
                    print(f"[EXPERT] Resend has no matching letters on target text (complete mismatch). Using Wav2Vec to display gibberish!")
                    active_raw = w2v_expert_raw
                    spoken_words = clean_text(active_raw)
                    cleaned_opt = spoken_words
                    spoken_to_target, target_to_spoken = get_alignment_mapping(target_words, cleaned_opt)
                else:
                    # Resend has matching letters: keep Resend!
                    # 1) Transfer acoustic vowel shifts letter-by-letter from Wav2Vec
                    for idx_spoken, idx_target in spoken_to_target.items():
                        if idx_target is not None and idx_target in target_to_w2v:
                            w2v_word = target_to_w2v[idx_target]
                            if w2v_word:
                                target_word = target_words[idx_target]
                                resend_word = cleaned_opt[idx_spoken]
                                transferred = transfer_vowel_shifts_from_w2v(target_word, resend_word, w2v_word)
                                if transferred != resend_word:
                                    print(f"[EXPERT VOWEL SHIFT] Word '{target_word}': Resend='{resend_word}', W2V='{w2v_word}' -> Transferred='{transferred}'")
                                    cleaned_opt[idx_spoken] = transferred

            final_opt = list(cleaned_opt)

            for idx_spoken, idx_target in spoken_to_target.items():
                if idx_target is not None:
                    target_word = target_words[idx_target]
                    w_spoken = cleaned_opt[idx_spoken]
                    t_lower = target_word.lower()
                    s_lower = w_spoken.lower()

                    is_synonym = check_is_synonym(t_lower, s_lower)
                    c_s_match = (t_lower.replace('c', 's') == s_lower.replace('c', 's'))
                    is_exact = (phonetic_normalize(t_lower) == phonetic_normalize(s_lower))
                    is_vowel = is_any_vowel_shift(t_lower, s_lower)

                    # 1. NLP configuration (SYNONYM_PAIRS), c/s equivalence, or exact match have highest priority
                    if is_synonym or c_s_match or is_exact:
                        final_opt[idx_spoken] = target_word
                    # 2. Do NOT auto-correct vowel shifts! Keep the spoken form (e.g. 'benatang', 'seno', 'deto', 'ne', 'seya')
                    # so vowel shiftings are accurately detected and flagged!
                    elif is_vowel:
                        final_opt[idx_spoken] = w_spoken
                    else:
                        # 3. If Resend lacks a letter for the target text, but Wav2Vec has it, USE Wav2Vec!
                        # E.g., target="pitong", Resend="pito", Wav2Vec="pitong" -> Use "pitong" (especially trailing 'ng')
                        w2v_word = target_to_w2v.get(idx_target) if target_to_w2v else None
                        if w2v_word and resend_lacks_letter_and_w2v_has_it(target_word, w_spoken, w2v_word):
                            recovered_word = target_word if phonetic_normalize(w2v_word.lower()) == phonetic_normalize(t_lower) else w2v_word
                            print(f"[RECOVER LACKING LETTER] Target='{target_word}': Resend='{w_spoken}', W2V='{w2v_word}' -> Using '{recovered_word}'")
                            final_opt[idx_spoken] = recovered_word
                        else:
                            # 4. If the spoken word shares ANY letters with the target word (e.g., 'delemonyo' vs 'demonyo',
                            # or 'ipinagpapatuloy' vs 'ipinagpatuloy'), still use Resend!
                            # Only fall back to Wav2Vec if every letter of the word on Resend
                            # does not match the target word at all (complete mismatch / gibberish).
                            has_matched_letter = bool(set(t_lower) & set(s_lower))
                            if has_matched_letter:
                                final_opt[idx_spoken] = w_spoken
                            else:
                                if w2v_word:
                                    final_opt[idx_spoken] = w2v_word
                                else:
                                    final_opt[idx_spoken] = w_spoken

                    # 5. If Wav2Vec acoustically captured a trailing 's' at the end of the word, append it!
                    # E.g. target="nanginginig", Resend="nanginginig", Wav2Vec="nanhghjinigs" -> Used="nanginginigs"
                    w2v_word = target_to_w2v.get(idx_target) if target_to_w2v else None
                    if w2v_word and should_append_trailing_s_from_w2v(target_word, final_opt[idx_spoken], w2v_word):
                        s_char = 'S' if final_opt[idx_spoken].isupper() else 's'
                        print(f"[ACOUSTIC TRAILING S] Target='{target_word}': Resend/Base='{final_opt[idx_spoken]}', W2V='{w2v_word}' -> Appended '{s_char}' => '{final_opt[idx_spoken] + s_char}'")
                        final_opt[idx_spoken] = final_opt[idx_spoken] + s_char

            if safe_level == 'expert':
                final_opt = dedup_expert_fragment_doublings(final_opt, spoken_to_target, target_words)

            fused_transcription = " ".join(final_opt)
            fused_transcription = match_original_casing_and_punctuation(target_text, fused_transcription)

            detected_stutters = detect_stutters(final_opt, target_words)
            _, final_errors = needleman_wunsch_alignment(target_words, final_opt, None)
            best_errors = final_errors

            # -------------------------------------------------------------
            # PHIL-IRI CORE FORMULAS: READING ACCURACY RATE (RAR) & WCPM
            # -------------------------------------------------------------
            total_target_words = len(target_words)
            final_correct_count = max(0, total_target_words - best_errors)
            # Accuracy Rate (%) = ((Total Target Words - Errors) / Total Target Words) * 100
            accuracy_rate = (final_correct_count / total_target_words * 100.0) if total_target_words > 0 else 0.0

            # WCPM = (Total Correct Words / Duration in Seconds) * 60
            duration_minutes = duration_seconds / 60.0
            wcpm = (final_correct_count / duration_minutes) if duration_minutes > 0 else 0.0

            print(f"\n{'='*70}")
            print(f" TARGET         : {target_text}")
            if resend_used:
                print(f" RESEND (raw)   : {active_raw}")
            else:
                print(f" WAV2VEC (raw)  : {active_raw} (fallback)")
            if safe_level in ['moderate', 'expert'] and w2v_expert_raw and w2v_expert_raw.strip():
                print(f" WAV2VEC (raw)  : {w2v_expert_raw}")
            print(f" USED           : {fused_transcription}")
            print(f" SCORE          : Accuracy: {round(accuracy_rate,2)}% | WCPM: {round(wcpm,2)}")
            print(f" CORRECT        : {final_correct_count} / {total_target_words}")
            print(f" DURATION       : {round(duration_seconds, 2)} seconds")
            print(f"{'='*70}\n")

        # =============================================================
        # BRANCH 2: BEGINNER MODE -> WAV2VEC 1.0 ONLY (LOCAL, STRICT)
        # =============================================================
        else:
            # Step 1: Run local acoustic transcription through quantized Wav2Vec 2.0
            wav2vec_raw = transcribe_wav2vec(wav_clean_path)
            # Step 2: Validate that speech was captured; return 400 if silent/empty
            if not wav2vec_raw.strip():
                return jsonify({
                    "error": "No speech detected. Please speak clearly into the microphone.",
                    "status": "empty"
                }), 400

            # Step 3: Candidate raw string initialization
            iq_wav2vec_raw = wav2vec_raw
            # Step 4: Perform multi-variant scoring to identify optimal reading alignment
            w2v_acc, w2v_correct, w2v_errors, w2v_opt = score_candidate(target_words, iq_wav2vec_raw, level)
            # Step 5: Merge repeated stutter syllables and acoustic hallucinations
            cleaned_opt = merge_syllable_hallucinations_and_stutters(w2v_opt, target_words)
            # Step 6: Derive bidirectional word alignment mapping (spoken to target indices)
            fused_spoken_to_target_1, _ = get_alignment_mapping(target_words, cleaned_opt)

            # Step 7: Create final candidate word list initialized from cleaned transcript
            final_opt = list(cleaned_opt)
            # Step 8: Apply linguistic normalization across aligned word pairs
            for idx_spoken, idx_target in fused_spoken_to_target_1.items():
                if idx_target is not None:
                    target_word = target_words[idx_target]
                    w1 = cleaned_opt[idx_spoken]
                    t_lower = target_word.lower()
                    w1_lower = w1.lower()
                    # Check phonetic equivalence, Tagalog synonym dictionary, or 'c' vs 's'
                    w1_exact = (phonetic_normalize(t_lower) == phonetic_normalize(w1_lower))
                    is_synonym = check_is_synonym(t_lower, w1_lower)
                    c_s_match = (w1_lower.replace('c', 's') == t_lower.replace('c', 's'))

                    # If linguistically valid, normalize to target casing; otherwise preserve spoken token
                    if is_synonym or c_s_match or w1_exact:
                        final_opt[idx_spoken] = target_word
                    else:
                        final_opt[idx_spoken] = w1

            # Step 9: Reconstruct full sentence string and match original target casing & punctuation
            fused_transcription = " ".join(final_opt)
            fused_transcription = match_original_casing_and_punctuation(target_text, fused_transcription)

            # Step 10: Detect disfluencies (stutters / false starts)
            detected_stutters = detect_stutters(final_opt, target_words)
            # Step 11: Execute global Needleman-Wunsch sequence alignment to count reading miscues
            _, final_errors = needleman_wunsch_alignment(target_words, final_opt, None)
            best_errors = final_errors

            # -------------------------------------------------------------
            # PHIL-IRI CORE FORMULAS: READING ACCURACY RATE (RAR) & WCPM
            # -------------------------------------------------------------
            # Total target words in passage
            total_target_words = len(target_words)
            # Correct words count = total target words minus verified reading errors (clamped at 0)
            final_correct_count = max(0, total_target_words - best_errors)
            # Accuracy Rate (%) = ((Total Target Words - Errors) / Total Target Words) * 100
            accuracy_rate = (final_correct_count / total_target_words * 100.0) if total_target_words > 0 else 0.0

            # WCPM = (Total Correct Words / Duration in Seconds) * 60
            duration_minutes = duration_seconds / 60.0
            wcpm = (final_correct_count / duration_minutes) if duration_minutes > 0 else 0.0

            # Diagnostic logging for console observation
            print(f"\n{'='*70}")
            print(f" TARGET         : {target_text}")
            print(f" WAV2VEC (raw)  : {wav2vec_raw}")
            print(f" USED           : {fused_transcription}")
            print(f" SCORE          : Accuracy: {round(accuracy_rate,2)}% | WCPM: {round(wcpm,2)}")
            print(f" CORRECT        : {final_correct_count} / {total_target_words}")
            print(f" DURATION       : {round(duration_seconds, 2)} seconds")
            print(f"{'='*70}\n")

        # Step 12: Generate detailed step-by-step trace for simulation matrix & UI visualization
        trace_data, _, _, _ = get_simulation_trace(target_words, final_opt)

        # Assemble comprehensive evaluation payload conforming to Phil-IRI specifications
        total_spoken_tokens = len(clean_text(fused_transcription))
        evaluation_record = {
            "target_text":        target_text,
            "transcription":      fused_transcription,
            "spoken_text":        fused_transcription,
            "accuracy_rate":      round(accuracy_rate, 2),
            "wcpm":               round(wcpm, 2),
            "errors_detected":    best_errors,
            "correct_words":      final_correct_count,
            "total_target_words": total_target_words,
            "total_spoken_words": total_spoken_tokens,
            "duration_seconds":   round(duration_seconds, 3),
            "model_used":         "RESEND" if locals().get('resend_used', False) else "WAV2VEC",
            "stutter_words":      detected_stutters,
            "trace":              trace_data,
            "status":             "success"
        }

        # Return JSON payload with 200 OK HTTP status code
        return jsonify(evaluation_record), 200

    except Exception as e:
        import traceback
        err_log = os.path.join(UPLOAD_FOLDER, "debug_error.log")
        with open(err_log, "w") as f:
            traceback.print_exc(file=f)
        traceback.print_exc()
        print(f"Error during processing: {e}")
        return jsonify({"error": str(e)}), 500

    finally:
        # Audio files are now kept in temp_audio for 5 minutes for debugging
        # and are automatically cleaned up by the cleanup_temp_audio_daemon thread.
        pass

def get_simulation_trace(target_words, spoken_words):
    # Set alignment scoring weights for global sequence trace
    MATCH    =  5.0   # Reward for word match
    MISMATCH = -2.0   # Penalty for substitution
    GAP      = -2.0   # Penalty for omission / insertion

    # Get sequence lengths
    m, n = len(target_words), len(spoken_words)
    # Initialize DP score grid of size (m+1) x (n+1)
    score    = [[0.0]  * (n + 1) for _ in range(m + 1)]
    # Initialize pointer tracking grid ('D'=Diagonal, 'U'=Up, 'L'=Left)
    pointers = [[None] * (n + 1) for _ in range(m + 1)]

    # Initialize column 0 with cumulative omission gap penalties
    for i in range(m + 1):
        score[i][0]    = GAP * i
        pointers[i][0] = 'U'
    # Initialize row 0 with cumulative insertion gap penalties
    for j in range(n + 1):
        score[0][j]    = GAP * j
        pointers[0][j] = 'L'
    pointers[0][0] = None

    # Step 1: Compute alignment score grid
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            t_w = target_words[i - 1]
            s_w = spoken_words[j - 1]
            t_low = t_w.lower()
            s_low = s_w.lower()
            w1_norm = phonetic_normalize(t_w)
            w2_norm = phonetic_normalize(s_w)
            # Evaluate zero phonetic distance (exact match, Tagalog synonym, or identical phonetics)
            is_zero_dist = (t_low == s_low) or check_is_synonym(t_low, s_low) or (w1_norm == w2_norm)

            if is_zero_dist:
                match_score = score[i - 1][j - 1] + MATCH
            else:
                # Calculate character-level edit distance via MLD
                dist = modified_levenshtein(t_w, s_w)
                if is_stutter(t_w, s_w) or has_vowel_shift(t_w, s_w) or dist <= 0.4:
                    match_score = score[i - 1][j - 1] + (MATCH * (1.0 - dist))
                else:
                    match_score = score[i - 1][j - 1] + MISMATCH

            delete_score = score[i - 1][j] + GAP
            insert_score = score[i][j - 1] + GAP
            best_score   = max(match_score, delete_score, insert_score)
            score[i][j]  = best_score

            # Save optimal directional transition pointer
            if best_score == match_score: pointers[i][j] = 'D'
            elif best_score == delete_score: pointers[i][j] = 'U'
            else: pointers[i][j] = 'L'

    # Step 2: Backtrack from (m, n) to origin to assemble step-by-step trace
    i, j = m, n
    trace = []
    
    while i > 0 or j > 0:
        if pointers[i][j] == 'D':
            # Diagonal: Aligned target word and spoken word
            t_word = target_words[i - 1]
            s_word = spoken_words[j - 1]
            t_low = t_word.lower()
            s_low = s_word.lower()
            w1_norm = phonetic_normalize(t_word)
            w2_norm = phonetic_normalize(s_word)
            is_zero_dist = (t_low == s_low) or check_is_synonym(t_low, s_low) or (w1_norm == w2_norm)
            is_v_shift = is_pure_vowel_shift(t_word, s_word)

            if is_zero_dist:
                raw_dist = 0.0
                is_correct = True
                step_type = "match"
            elif is_v_shift:
                dist = modified_levenshtein(t_word, s_word)
                max_len = max(len(w1_norm), len(w2_norm))
                raw_dist = round(dist * max_len, 1)
                # Pure vowel shift (strictly e<->i and o<->u) is classified as correct (accent variation)
                is_correct = True
                step_type = "match"
            else:
                dist = modified_levenshtein(t_word, s_word)
                max_len = max(len(w1_norm), len(w2_norm))
                raw_dist = round(dist * max_len, 1)
                # Genuine phonetic mismatch is flagged as a substitution error
                is_correct = False
                step_type = "substitution"

            # Record step dictionary in trace
            trace.append({
                "type": step_type,
                "target": t_word,
                "spoken": s_word,
                "distance": raw_dist,
                "is_correct": is_correct,
                "is_vowel_shift": is_v_shift
            })
            i -= 1; j -= 1
        elif pointers[i][j] == 'U':
            # Up step: Target word was skipped by student (omission/deletion)
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
            # Left step: Spoken word was an extra word inserted by student (insertion)
            s_word = spoken_words[j - 1]
            trace.append({
                "type": "insertion",
                "target": "-",
                "spoken": s_word,
                "distance": 1.0,
                "is_correct": False
            })
            j -= 1
            
    # Reverse trace list so that it runs chronologically from sentence start to finish
    trace.reverse()
    
    # Calculate aggregate metrics across trace steps
    errors = sum(1 for step in trace if not step["is_correct"] and step["target"] != "-")
    insertions = sum(1 for step in trace if step["type"] == "insertion")
    total_errors = errors + insertions
    
    # Calculate total correct words clamped at 0
    correct_words = max(0, len(target_words) - total_errors)
    # Detect stutter words for display badges
    stutter_words = detect_stutters(spoken_words, target_words)
    # Return 4-tuple of trace results
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

# (The main block will be removed from here and moved to the end)

@app.route('/api/email', methods=['POST'])
def send_certificate_email():
    try:
        data = request.json
        recipient_email = data.get('email')
        name = data.get('name', 'User')
        level = data.get('level', 'Evaluation')
        score = data.get('score', 'N/A')
        image_data = data.get('image_data')

        if not recipient_email or not image_data:
            return jsonify({"error": "Missing email or image data"}), 400

        sender_email = os.getenv("EMAIL_SENDER")
        sender_password = os.getenv("EMAIL_APP_PASSWORD")

        if not sender_email or not sender_password:
            return jsonify({"error": "Server email credentials not configured in .env"}), 500

        # Decode base64 image
        # image_data looks like "data:image/png;base64,iVBORw0KGgo..."
        if "," in image_data:
            base64_str = image_data.split(",")[1]
        else:
            base64_str = image_data

        img_bytes = base64.b64decode(base64_str)

        # Setup email
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = recipient_email
        msg['Subject'] = f"Your ReadFil Tagalog Reading Certificate - {level} Level"

        body = f"""
        <html>
            <body>
                <h2>Congratulations, {name}!</h2>
                <p>Attached is your official certificate for completing the <strong>{level} Level</strong> evaluation.</p>
                <p>Your composite score is: <strong>{score}</strong>.</p>
                <p>Thank you for using ReadFil!</p>
            </body>
        </html>
        """
        msg.attach(MIMEText(body, 'html'))

        # Attach image
        image = MIMEImage(img_bytes, name="ReadFil_Certificate.png")
        msg.attach(image)

        # Send via Gmail SMTP
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(sender_email, sender_password)
        server.send_message(msg)
        server.quit()

        return jsonify({"message": "Email sent successfully!"}), 200

    except Exception as e:
        print(f"[ERROR] Failed to send email: {e}")
        return jsonify({"error": str(e)}), 500

# =================================================================
# CLASSROOM MODE & TEACHER PORTAL API ENDPOINTS (SQLITE PERSISTED)
# =================================================================

# 1. Teacher Authentication & Password Recovery
@app.route('/api/teacher/register', methods=['POST'])
def teacher_register():
    data = request.json or {}
    name = data.get('name', '').strip()
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    email = data.get('email', '').strip()
    security_question = data.get('security_question', '').strip()
    security_answer = data.get('security_answer', '').strip()

    if not all([name, username, password, email, security_question, security_answer]):
        return jsonify({"success": False, "error": "All fields are required."}), 400

    result = database.register_teacher(name, username, password, email, security_question, security_answer)
    status_code = 200 if result.get('success') else 400
    return jsonify(result), status_code

@app.route('/api/teacher/login', methods=['POST'])
def teacher_login():
    data = request.json or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    if not username or not password:
        return jsonify({"success": False, "error": "Username and password are required."}), 400

    result = database.authenticate_teacher(username, password)
    status_code = 200 if result.get('success') else 401
    return jsonify(result), status_code

@app.route('/api/teacher/security-question/<username>', methods=['GET'])
def teacher_security_question(username):
    result = database.get_teacher_security_question(username)
    status_code = 200 if result.get('success') else 404
    return jsonify(result), status_code

@app.route('/api/teacher/forgot-password/reset', methods=['POST'])
def teacher_forgot_password_reset():
    data = request.json or {}
    username = data.get('username', '').strip()
    security_answer = data.get('security_answer', '').strip()
    new_password = data.get('new_password', '').strip()

    if not all([username, security_answer, new_password]):
        return jsonify({"success": False, "error": "Username, security answer, and new password are required."}), 400

    result = database.verify_and_reset_password(username, security_answer, new_password)
    status_code = 200 if result.get('success') else 400
    return jsonify(result), status_code

# 2. Custom Passages (Teacher)
@app.route('/api/teacher/passages', methods=['GET', 'POST'])
def teacher_passages():
    if request.method == 'GET':
        teacher_id = request.args.get('teacher_id', type=int)
        if not teacher_id:
            return jsonify({"error": "teacher_id query parameter required"}), 400
        passages = database.get_teacher_passages(teacher_id)
        return jsonify({"passages": passages}), 200

    elif request.method == 'POST':
        data = request.json or {}
        teacher_id = data.get('teacher_id')
        title = data.get('title', '').strip()
        content = data.get('content', '').strip()
        grade_level = data.get('grade_level', 'General').strip()
        timer_seconds = data.get('timer_seconds', 60)
        is_active = bool(data.get('is_active', False))

        if not teacher_id or not title or not content:
            return jsonify({"error": "teacher_id, title, and content are required"}), 400

        result = database.create_passage(teacher_id, title, content, grade_level, timer_seconds, is_active)
        return jsonify(result), 200 if result.get('success') else 400

@app.route('/api/teacher/passages/<int:passage_id>', methods=['PUT', 'DELETE'])
def teacher_passage_detail(passage_id):
    if request.method == 'PUT':
        data = request.json or {}
        teacher_id = data.get('teacher_id')
        title = data.get('title', '').strip()
        content = data.get('content', '').strip()
        grade_level = data.get('grade_level', 'General').strip()
        timer_seconds = data.get('timer_seconds', 60)

        if not teacher_id or not title or not content:
            return jsonify({"error": "teacher_id, title, and content are required"}), 400

        result = database.update_passage(passage_id, teacher_id, title, content, grade_level, timer_seconds)
        return jsonify(result), 200 if result.get('success') else 400

    elif request.method == 'DELETE':
        teacher_id = request.args.get('teacher_id', type=int)
        if not teacher_id:
            return jsonify({"error": "teacher_id query parameter required"}), 400
        result = database.delete_passage(passage_id, teacher_id)
        return jsonify(result), 200 if result.get('success') else 400

@app.route('/api/teacher/passages/<int:passage_id>/activate', methods=['POST'])
def teacher_activate_passage(passage_id):
    data = request.json or {}
    teacher_id = data.get('teacher_id')
    if not teacher_id:
        return jsonify({"error": "teacher_id required"}), 400
    result = database.activate_passage(passage_id, teacher_id)
    return jsonify(result), 200 if result.get('success') else 400

@app.route('/api/teacher/set-global-timer', methods=['POST'])
def teacher_set_global_timer():
    data = request.json or {}
    teacher_id = data.get('teacher_id')
    timer_seconds = data.get('timer_seconds')
    if not teacher_id or timer_seconds is None:
        return jsonify({"error": "teacher_id and timer_seconds required"}), 400
    try:
        timer_int = max(5, int(timer_seconds))
        result = database.update_all_passages_timer(teacher_id, timer_int)
        return jsonify(result), 200 if result.get('success') else 400
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/api/teacher/passages/<int:passage_id>/toggle-active', methods=['POST'])
def teacher_toggle_passage_active(passage_id):
    data = request.json or {}
    teacher_id = data.get('teacher_id')
    if not teacher_id:
        return jsonify({"error": "teacher_id required"}), 400
    result = database.toggle_passage_active(passage_id, teacher_id)
    return jsonify(result), 200 if result.get('success') else 400

@app.route('/api/teacher/passages/set-active-set', methods=['POST'])
def teacher_set_active_passages_set():
    data = request.json or {}
    teacher_id = data.get('teacher_id')
    passage_ids = data.get('passage_ids', [])
    if not teacher_id:
        return jsonify({"error": "teacher_id required"}), 400
    result = database.set_active_passages(teacher_id, passage_ids)
    return jsonify(result), 200 if result.get('success') else 400

# 3. Public Classroom Mode Endpoint (Student Reads Active Passage Set)
@app.route('/api/classroom/active-passages', methods=['GET'])
def classroom_active_passages():
    teacher_id = request.args.get('teacher_id', type=int)
    passages = database.get_active_passages(teacher_id)
    return jsonify({"passages": passages}), 200

@app.route('/api/classroom/active-passage', methods=['GET'])
def classroom_active_passage():
    teacher_id = request.args.get('teacher_id', type=int)
    passages = database.get_active_passages(teacher_id)
    if not passages:
        return jsonify({"error": "No active passage found. Please contact your teacher."}), 404
    first_passage = dict(passages[0])
    first_passage["passages"] = passages
    first_passage["total_passages"] = len(passages)
    return jsonify(first_passage), 200

# 4. Student Results Logging & Monitoring
@app.route('/api/classroom/submit-result', methods=['POST'])
def classroom_submit_result():
    data = request.json or {}
    teacher_id = data.get('teacher_id')
    passage_id = data.get('passage_id')
    student_name = data.get('student_name', 'Student').strip()
    passage_title = data.get('passage_title', '').strip()
    accuracy_rate = data.get('accuracy_rate', 0.0)
    wcpm = data.get('wcpm', 0.0)
    composite_score = data.get('composite_score', 0.0)
    reading_level = data.get('reading_level', 'Instructional')
    duration_seconds = data.get('duration_seconds')
    if duration_seconds is None:
        duration_seconds = data.get('reading_time_seconds', 0.0)
    correct_words = data.get('correct_words', 0)
    total_target_words = data.get('total_target_words', 0)
    errors_detected = data.get('errors_detected', 0)
    stutter_words = data.get('stutter_words', [])
    trace_json = data.get('trace', [])

    if not teacher_id:
        # Fallback to active passage teacher_id if not provided
        act = database.get_active_passage()
        teacher_id = act['teacher_id'] if act else 1

    result = database.save_student_result(
        teacher_id=teacher_id,
        passage_id=passage_id,
        student_name=student_name,
        passage_title=passage_title,
        accuracy_rate=accuracy_rate,
        wcpm=wcpm,
        composite_score=composite_score,
        reading_level=reading_level,
        duration_seconds=duration_seconds,
        correct_words=correct_words,
        total_target_words=total_target_words,
        errors_detected=errors_detected,
        stutter_words=stutter_words,
        trace_json=trace_json
    )
    return jsonify(result), 200 if result.get('success') else 400

@app.route('/api/teacher/records', methods=['GET'])
def teacher_records():
    teacher_id = request.args.get('teacher_id', type=int)
    search = request.args.get('search', type=str)
    if not teacher_id:
        return jsonify({"error": "teacher_id parameter required"}), 400
    records = database.get_teacher_student_results(teacher_id, search)
    return jsonify({"records": records}), 200

@app.route('/api/teacher/records/export', methods=['GET'])
def teacher_records_export():
    teacher_id = request.args.get('teacher_id', type=int)
    if not teacher_id:
        return jsonify({"error": "teacher_id parameter required"}), 400
    csv_content = database.export_teacher_results_to_csv(teacher_id)
    return Response(
        csv_content,
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=readfil_class_records_teacher_{teacher_id}.csv"}
    )

# 5. Token Availability & Health Check
@app.route('/api/system/token-status', methods=['GET'])
def system_token_status():
    api_key = os.getenv("Resend_api_key") or os.getenv("RESEND_API_KEY")
    has_key = bool(api_key and len(api_key.strip()) > 10)
    return jsonify({
        "cloud_stt_configured": has_key,
        "mode": "HYBRID_CLOUD_LOCAL" if has_key else "LOCAL_WAV2VEC_ONLY",
        "local_w2v_status": "ONLINE (Quantized 8-bit)",
        "fallback_available": True
    }), 200

if __name__ == '__main__':
    print("Starting Flask server...")
    app.run(host='0.0.0.0', port=5000, debug=True)

