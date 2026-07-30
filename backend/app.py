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

        # Sprint 3: Parallel thread execution
        future_w2v     = _executor.submit(transcribe_wav2vec, wav_clean_path)
        future_whisper = _executor.submit(transcribe_whisper, wav_clean_path)

        wav2vec_raw = future_w2v.result() 
        whisper_raw = future_whisper.result() 

        if not wav2vec_raw.strip() and not whisper_raw.strip():
            return jsonify({
                "error": "No speech detected. Please speak clearly into the microphone.",
                "status": "empty"
            }), 400

        # Sprint 3: Dynamic Model Selector Logic
        # Simplistic selection: Prefer wav2vec unless it's empty, otherwise whisper
        if wav2vec_raw.strip():
            best_transcription = wav2vec_raw
            winner = "WAV2VEC"
        else:
            best_transcription = whisper_raw
            winner = "WHISPER"

        print(f"\n{'='*70}")
        print(f" TARGET         : {target_text}")
        print(f" WAV2VEC (raw)  : {wav2vec_raw}")
        print(f" WHISPER  (raw) : {whisper_raw}")
        print(f" SELECTED       : {best_transcription}")
        print(f" DURATION       : {round(duration_seconds, 2)} seconds")
        print(f"{'='*70}\n")

        evaluation_record = {
            "target_text":      target_text,
            "transcription":    best_transcription,
            "wav2vec_raw":      wav2vec_raw,
            "whisper_raw":      whisper_raw,
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