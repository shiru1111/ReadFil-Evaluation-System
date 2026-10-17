from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import sys
import numpy as np
import torch
import librosa
import soundfile as sf
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
from pydub import AudioSegment, effects
from faster_whisper import WhisperModel
from concurrent.futures import ThreadPoolExecutor
import re

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

import uuid
from scoring_engine import (
    select_best_model,
    calculate_full_evaluation,
    get_proficiency_level,
    needleman_wunsch_alignment,
    clean_text
)

# =================================================================
# AUDIO PREPROCESSING (FR-004, FR-005, FR-006)
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
    # FR-006: 30dB silence trimming using Librosa
    trimmed, _ = librosa.effects.trim(speech, top_db=30)

    if len(trimmed) < int(0.5 * sr):
        trimmed = speech

    sf.write(output_wav_path, trimmed, sr)
    return librosa.get_duration(y=trimmed, sr=sr)

# =================================================================
# TRANSCRIPTION (FR-007, FR-008, FR-009)
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
# API ENDPOINT (Sprints 4, 5, 6 / FR-010 to FR-016)
# =================================================================
@app.route('/api/evaluate', methods=['POST'])
def evaluate_audio():
    if 'audio' not in request.files or 'target_text' not in request.form:
        return jsonify({"error": "Missing audio file or target text"}), 400

    audio_file  = request.files['audio']
    target_text = request.form['target_text'].strip()

    if audio_file.filename == '':
        return jsonify({"error": "Empty audio file received"}), 400

    # Thread-safe unique temporary files per assessment session
    session_id     = str(uuid.uuid4())
    webm_path      = os.path.join(UPLOAD_FOLDER, f"{session_id}.webm")
    wav_raw_path   = os.path.join(UPLOAD_FOLDER, f"{session_id}_raw.wav")
    wav_clean_path = os.path.join(UPLOAD_FOLDER, f"{session_id}_clean.wav")
    audio_file.save(webm_path)

    try:
        convert_webm_to_wav(webm_path, wav_raw_path)
        duration_seconds = preprocess_audio(wav_raw_path, wav_clean_path)

        # Sprint 5: Edge case handling for extremely short audio (< 0.5s)
        if duration_seconds < 0.5:
            return jsonify({
                "error": "Audio is too short for reliable transcription.",
                "status": "error"
            }), 400

        # Sprint 3: Parallel dual-model execution via ThreadPoolExecutor
        future_w2v     = _executor.submit(transcribe_wav2vec, wav_clean_path)
        future_whisper = _executor.submit(transcribe_whisper, wav_clean_path)

        wav2vec_raw = future_w2v.result() 
        whisper_raw = future_whisper.result() 

        # Sprint 5: Handle completely empty transcripts from silent or uninterpretable audio
        if not wav2vec_raw.strip() and not whisper_raw.strip():
            return jsonify({
                "error": "No speech could be transcribed. The audio might be too noisy or completely silent.",
                "status": "empty"
            }), 400

        # Sprint 3 & 6: Dynamic Model Selector using Needleman-Wunsch Alignment
        best_eval, winner, best_transcription = select_best_model(
            target_text, wav2vec_raw, whisper_raw, duration_seconds
        )

        if not best_eval:
            return jsonify({
                "error": "Unable to evaluate speech alignment.",
                "status": "empty"
            }), 400

        print(f"\n{'='*70}")
        print(f" TARGET         : {target_text}")
        print(f" WAV2VEC (raw)  : {wav2vec_raw}")
        print(f" WHISPER (raw)  : {whisper_raw}")
        print(f" SELECTED MODEL : {winner}")
        print(f" SELECTED TEXT  : {best_transcription}")
        print(f" DURATION       : {round(duration_seconds, 2)} seconds")
        print(f" WCPM           : {best_eval['wcpm']}")
        print(f" ACCURACY       : {best_eval['accuracy']}%")
        print(f" PROFICIENCY    : {best_eval['proficiency_level']}")
        print(f" COMPOSITE SCORE: {best_eval['composite_score']}")
        print(f" PHRASES        : {len(best_eval['phrase_breakdown'])} phrase(s)")
        print(f"{'='*70}\n")

        evaluation_record = {
            "target_text":        target_text,
            "transcription":      best_transcription,
            "wav2vec_raw":        wav2vec_raw,
            "whisper_raw":        whisper_raw,
            "duration_seconds":   round(duration_seconds, 3),
            "model_used":         winner,
            "wcpm":               best_eval["wcpm"],
            "accuracy":           best_eval["accuracy"],
            "proficiency_level":  best_eval["proficiency_level"],
            "composite_score":    best_eval["composite_score"],
            "total_target_words": best_eval["total_target_words"],
            "correct_words":      best_eval["correct_words"],
            "errors":             best_eval["errors"],
            "substitutions":      best_eval["substitutions"],
            "deletions":          best_eval["deletions"],
            "insertions":         best_eval["insertions"],
            "alignment_tokens":   best_eval["alignment_tokens"],
            "phrase_breakdown":   best_eval["phrase_breakdown"],
            "status":             "success"
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
    finally:
        # Cleanup temporary files to prevent disk accumulation
        for fpath in (webm_path, wav_raw_path, wav_clean_path):
            try:
                if os.path.exists(fpath):
                    os.remove(fpath)
            except Exception:
                pass

if __name__ == '__main__':
    app.run(debug=True, use_reloader=False, port=5000)