import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from './contexts/LanguageContext';
import SoundWaveBackground from './components/SoundWaveBackground';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function Classroom() {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const navigate = useNavigate();

  // Active Passage State
  const [activePassage, setActivePassage] = useState(null);
  const [isLoadingPassage, setIsLoadingPassage] = useState(true);
  const [passageError, setPassageError] = useState(null);

  // Student Info State
  const [studentName, setStudentName] = useState(() => {
    return localStorage.getItem('user_firstName') || '';
  });
  const [isNameModalOpen, setIsNameModalOpen] = useState(() => {
    return !localStorage.getItem('user_firstName');
  });
  const [tempName, setTempName] = useState('');

  // Assessment & Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [totalTimerDuration, setTotalTimerDuration] = useState(60);
  const [isSilenceError, setIsSilenceError] = useState(false);

  // Media Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const startTimeRef = useRef(null);

  // 1. Fetch Active Passage on Mount
  useEffect(() => {
    const fetchActivePassage = async () => {
      try {
        setIsLoadingPassage(true);
        const res = await fetch(`${API_BASE}/api/classroom/active-passage`);
        if (!res.ok) {
          throw new Error(isEn
            ? "No active reading passage assigned. Please contact your teacher."
            : "Walang aktibong talata sa kasalukuyan. Makipag-ugnayan sa iyong guro."
          );
        }
        const data = await res.json();
        setActivePassage(data);
        const duration = parseInt(data.timer_seconds, 10) || 60;
        setTotalTimerDuration(duration);
        setTimeLeft(duration);
      } catch (err) {
        console.error("Error fetching classroom passage:", err);
        setPassageError(err.message || (isEn ? "Failed to load classroom reading passage." : "Hindi ma-load ang talata sa klase."));
      } finally {
        setIsLoadingPassage(false);
      }
    };

    fetchActivePassage();
  }, [isEn]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Waveform visualization
  const drawWaveform = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const renderFrame = () => {
      animationRef.current = requestAnimationFrame(renderFrame);
      analyserRef.current.getByteTimeDomainData(dataArray);

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0096FF';
      ctx.beginPath();

      const sliceWidth = (canvas.width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    renderFrame();
  };

  // 2. Start Assessment Recording
  const startRecording = async () => {
    if (!studentName.trim()) {
      setIsNameModalOpen(true);
      return;
    }

    try {
      setIsSilenceError(false);
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      streamRef.current = stream;

      // Audio Context for Visualizer
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      drawWaveform();

      // Recorder setup
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = '';
        }
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        handleRecordingStopped();
      };

      recorder.start(100);
      setIsRecording(true);
      startTimeRef.current = Date.now();

      // Start Countdown Timer
      setTimeLeft(totalTimerDuration);
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current);
            stopRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

    } catch (err) {
      console.error("Microphone access error:", err);
      alert(isEn
        ? "Microphone access is required to take the reading assessment. Please grant permission."
        : "Kinakailangan ang mikropono para sa pagsusulit sa pagbasa. Pakibigay ang pahintulot."
      );
    }
  };

  // 3. Stop Recording
  const stopRecording = () => {
    if (isProcessing) return;
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setIsRecording(false);
    setIsProcessing(true);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // 4. Send Audio to Backend for Evaluation & Classroom Logging
  const handleRecordingStopped = async () => {
    // Stop microphone tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    if (audioChunksRef.current.length === 0) {
      setIsSilenceError(true);
      setIsProcessing(false);
      return;
    }

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - (startTimeRef.current || Date.now())) / 1000));

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'classroom_assessment.webm');
      formData.append('target_text', activePassage.content);
      formData.append('time_taken', elapsedSeconds.toString());
      formData.append('level', 'Classroom');

      const response = await fetch(`${API_BASE}/api/evaluate`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.status === 'empty') {
          setIsSilenceError(true);
          setIsProcessing(false);
          audioChunksRef.current = [];
          return;
        }
        throw new Error(result.error || (isEn ? "Failed to evaluate speech." : "Bigo sa pagsusuri ng boses."));
      }

      // Check if transcription returned is empty
      const spokenTranscript = (result.transcription || result.spoken_text || '').trim();
      if (!spokenTranscript && result.accuracy_rate === 0) {
        setIsSilenceError(true);
        setIsProcessing(false);
        audioChunksRef.current = [];
        return;
      }

      // Calculate Phil-IRI scores matching Results.jsx standard
      const targetWcpm = 150;
      const accRate = parseFloat(result.accuracy_rate) || 0;
      const readWcpm = parseFloat(result.wcpm) || 0;
      const accScore = accRate * 0.5;
      const fluScore = Math.min((readWcpm / targetWcpm) * 50, 50);
      const composite = Math.round(accScore + fluScore);
      let philIriLevel = "Frustration";
      if (composite >= 90) philIriLevel = "Independent";
      else if (composite >= 75) philIriLevel = "Instructional";

      // Save Student Result to SQLite Database for the Teacher
      try {
        await fetch(`${API_BASE}/api/classroom/submit-result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            passage_id: activePassage.id,
            student_name: studentName,
            reading_time_seconds: elapsedSeconds,
            accuracy_rate: accRate,
            wcpm: readWcpm,
            composite_score: composite,
            reading_level: philIriLevel,
            total_target_words: result.total_target_words || activePassage.content.trim().split(/\s+/).length,
            correct_words: result.correct_words || 0,
            errors_detected: result.errors_detected || 0,
            stutter_words: result.stutter_words || [],
            spoken_text: spokenTranscript,
            trace: result.trace || []
          })
        });
      } catch (logErr) {
        console.warn("Could not save to teacher classroom database:", logErr);
      }

      // Save to localStorage for standard Results.jsx view
      localStorage.setItem('user_firstName', studentName);
      localStorage.setItem('final_accuracy', accRate.toString());
      localStorage.setItem('final_wcpm', readWcpm.toString());
      localStorage.setItem('evaluated_level', `Classroom - ${activePassage.title}`);
      localStorage.setItem('reading_logs', JSON.stringify([result]));

      // Redirect to Results Page
      navigate('/results');

    } catch (err) {
      console.error("Evaluation error:", err);
      alert(isEn
        ? "An error occurred while evaluating your reading. Please try again."
        : "May naganap na error habang sinusuri ang iyong pagbasa. Subukan muli."
      );
    } finally {
      setIsProcessing(false);
      audioChunksRef.current = [];
    }
  };

  const handleSaveStudentName = (e) => {
    e.preventDefault();
    if (!tempName.trim()) return;
    setStudentName(tempName.trim());
    localStorage.setItem('user_firstName', tempName.trim());
    setIsNameModalOpen(false);
  };

  // Loading Screen
  if (isLoadingPassage) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 border-4 border-[#0096FF] border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-xl font-bold text-slate-900">
          {isEn ? "Fetching active reading passage from teacher..." : "Kinukuha ang aktibong talata mula sa guro..."}
        </h2>
        <p className="text-gray-500 text-sm mt-1">Connecting to Classroom Assessment Service</p>
      </div>
    );
  }

  // Error Screen
  if (passageError || !activePassage) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white border border-red-200 p-8 rounded-3xl max-w-lg shadow-xl shadow-red-50/50">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">!</div>
          <h2 className="text-2xl font-black text-slate-900 mb-3">
            {isEn ? "No Active Passage" : "Walang Aktibong Talata"}
          </h2>
          <p className="text-gray-600 mb-6 text-base leading-relaxed">
            {passageError || (isEn
              ? "There is no active reading passage assigned currently. Please contact your teacher to set an active passage in the Teacher Portal."
              : "Walang itinalagang aktibong talata sa kasalukuyan. Makipag-ugnayan sa iyong guro upang i-set ang aktibong babasahin sa Teacher Portal."
            )}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/" className="px-6 py-3 bg-gray-100 text-slate-800 font-bold rounded-full hover:bg-gray-200 transition-colors border border-gray-200">
              {isEn ? "Return to Home" : "Bumalik sa Simula"}
            </Link>
            <Link to="/teacher" className="px-6 py-3 bg-[#0096FF] text-white font-bold rounded-full hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/25">
              {isEn ? "Go to Teacher Portal" : "Pumunta sa Teacher Portal"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Timer Color logic
  const timerPercentage = (timeLeft / totalTimerDuration) * 100;
  const isTimeCritical = timeLeft <= 10;

  return (
    <div className="min-h-screen bg-slate-50/60 text-slate-900 font-sans relative overflow-x-hidden">
      <SoundWaveBackground opacity={0.08} />

      {/* Top Header */}
      <header className="relative z-20 border-b border-gray-200/80 bg-white/80 backdrop-blur-md px-6 sm:px-12 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center space-x-3">
          <Link to="/" className="text-2xl font-black text-[#0096FF] tracking-tight hover:opacity-90">
            ReadFil
          </Link>
          <span className="text-xs uppercase px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold tracking-wider">
            {isEn ? "Classroom Mode" : "Modo ng Klase"}
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={() => { setTempName(studentName); setIsNameModalOpen(true); }}
            className="flex items-center space-x-2 text-sm bg-white hover:bg-gray-50 px-3.5 py-1.5 rounded-full border border-gray-200 shadow-sm transition-colors"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-gray-500 font-medium">{isEn ? "Student:" : "Mag-aaral:"}</span>
            <span className="font-bold text-slate-800 truncate max-w-[130px]">{studentName || (isEn ? "Set Name" : "Magtakda ng Pangalan")}</span>
          </button>

          <Link
            to="/"
            className="text-xs uppercase font-bold text-gray-500 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 bg-white transition-all shadow-sm"
          >
            {isEn ? "Exit" : "Lumabas"}
          </Link>
        </div>
      </header>

      {/* Main Reading Container */}
      <main className="relative z-20 max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Assignment Card Header */}
        <div className="bg-white border border-gray-200/90 rounded-3xl p-6 sm:p-8 shadow-xl shadow-blue-50/50 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-bold text-[#0096FF] uppercase tracking-wider bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-100">
                  {activePassage.grade_level || "General"}
                </span>
                <span className="text-xs text-gray-500">
                  {isEn ? "Assigned by:" : "Itinalaga ni:"} <strong className="text-slate-700">{activePassage.teacher_name || (isEn ? "Teacher" : "Guro")}</strong>
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {activePassage.title}
              </h1>
            </div>

            {/* Countdown Timer Display */}
            <div className={`flex items-center gap-3 px-5 py-2.5 rounded-2xl border transition-all ${
              isTimeCritical
                ? 'bg-red-50 border-red-200 text-red-600 animate-pulse'
                : 'bg-blue-50 border-blue-200 text-[#0096FF]'
            }`}>
              <div className="flex flex-col text-right">
                <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">{isEn ? "Time Limit" : "Takdang Oras"}</span>
                <span className="font-mono text-2xl font-black leading-none">{timeLeft}s</span>
              </div>
              <div className="w-10 h-10 rounded-full border-2 border-current flex items-center justify-center font-bold text-xs">
                {Math.round(timerPercentage)}%
              </div>
            </div>
          </div>

          {/* Passage Reading Text */}
          <div className="pt-6 sm:pt-8">
            <p className="text-xl sm:text-2xl leading-relaxed sm:leading-loose text-slate-800 font-serif selection:bg-[#0096FF] selection:text-white text-justify">
              {activePassage.content}
            </p>
          </div>
        </div>

        {/* Recording Visualizer & Action Bar */}
        <div className="bg-white border border-gray-200/90 rounded-3xl p-6 sm:p-8 shadow-xl shadow-blue-50/50">
          {/* Live Audio Visualizer Canvas */}
          <div className="relative w-full h-24 bg-slate-50 rounded-2xl overflow-hidden mb-6 border border-gray-200 flex items-center justify-center">
            <canvas ref={canvasRef} className="w-full h-full" width={800} height={96} />
            {!isRecording && !isProcessing && (
              <div className="absolute text-gray-400 text-sm font-medium flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-300"></span>
                {isEn ? "Microphone ready. Press Start Reading to begin." : "Nakahanda ang mikropono. Pindutin ang Simulan ang Pagbasa upang magsimula."}
              </div>
            )}
            {isRecording && (
              <div className="absolute top-3 right-4 flex items-center gap-2 bg-red-50 border border-red-200 px-3 py-1 rounded-full text-red-600 text-xs font-bold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                {isEn ? "RECORDING" : "NAGRE-RECORD"}
              </div>
            )}
            {isProcessing && (
              <div className="absolute inset-0 bg-white/90 flex items-center justify-center gap-3 text-[#0096FF] font-bold">
                <div className="w-5 h-5 border-2 border-[#0096FF] border-t-transparent rounded-full animate-spin"></div>
                {isEn ? "Evaluating speech via ASR engine..." : "Sinusuri ng ASR engine ang iyong pagbasa..."}
              </div>
            )}
          </div>

          {/* Silence error notification */}
          {isSilenceError && (
            <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <strong>{isEn ? "No speech detected." : "Walang boses na narinig."}</strong> {isEn
                  ? "Please speak clearly and close to the microphone before time expires."
                  : "Pakisuyong magsalita nang malinaw at malapit sa mikropono bago matapos ang oras."}
              </div>
            </div>
          )}

          {/* Action Button */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={isProcessing}
                className="w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-blue-600 to-[#0096FF] hover:from-blue-700 hover:to-blue-600 text-white font-black text-lg rounded-full shadow-lg shadow-blue-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
                {isEn ? `Start Reading (${totalTimerDuration}s)` : `Simulan ang Pagbasa (${totalTimerDuration}s)`}
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="w-full sm:w-auto px-10 py-4 bg-red-600 hover:bg-red-700 text-white font-black text-lg rounded-full shadow-lg shadow-red-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 animate-pulse"
              >
                <div className="w-4 h-4 bg-white rounded-sm"></div>
                {isEn ? `Finish & Evaluate (${timeLeft}s left)` : `Tapusin at I-evaluate (${timeLeft}s natitira)`}
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Student Name Modal */}
      {isNameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-black text-slate-900 mb-2">
              {isEn ? "Student Name" : "Pangalan ng Mag-aaral"}
            </h3>
            <p className="text-gray-500 text-sm mb-6">
              {isEn
                ? "Enter your full name so your teacher can track and record your oral reading assessment results."
                : "Ilagay ang iyong buong pangalan upang maitala ng iyong guro ang resulta ng iyong pagsusulit sa pagbasa."}
            </p>

            <form onSubmit={handleSaveStudentName}>
              <div className="mb-6">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
                  {isEn ? "Full Name (e.g. Juan Dela Cruz)" : "Buong Pangalan (Hal. Juan Dela Cruz)"}
                </label>
                <input
                  type="text"
                  required
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  placeholder={isEn ? "Type your name..." : "I-type ang iyong pangalan..."}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-slate-900 placeholder-gray-400 focus:outline-none focus:border-[#0096FF] focus:bg-white focus:ring-1 focus:ring-[#0096FF]"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 justify-end">
                {studentName && (
                  <button
                    type="button"
                    onClick={() => setIsNameModalOpen(false)}
                    className="px-5 py-2.5 rounded-full text-gray-500 hover:text-slate-900 font-bold text-sm"
                  >
                    {isEn ? "Cancel" : "Kanselahin"}
                  </button>
                )}
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#0096FF] hover:bg-blue-600 text-white font-bold rounded-full text-sm transition-colors shadow-md shadow-blue-500/25"
                >
                  {isEn ? "Save & Continue" : "I-save at Magpatuloy"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
