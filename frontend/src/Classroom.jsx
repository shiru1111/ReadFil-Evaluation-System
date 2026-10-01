import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from './contexts/LanguageContext';
import SoundWaveBackground from './components/SoundWaveBackground';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function Classroom() {
  const { t } = useLanguage();
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
          throw new Error("Walang aktibong talata sa kasalukuyan. Makipag-ugnayan sa iyong guro.");
        }
        const data = await res.json();
        setActivePassage(data);
        const duration = parseInt(data.timer_seconds, 10) || 60;
        setTotalTimerDuration(duration);
        setTimeLeft(duration);
      } catch (err) {
        console.error("Error fetching classroom passage:", err);
        setPassageError(err.message || "Failed to load classroom reading passage.");
      } finally {
        setIsLoadingPassage(false);
      }
    };

    fetchActivePassage();
  }, []);

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

      ctx.fillStyle = '#0f172a';
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

  // 2. Start Recording
  const startRecording = async () => {
    if (!studentName.trim()) {
      setIsNameModalOpen(true);
      return;
    }

    setIsSilenceError(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 2048;

      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        sendAudioForEvaluation();
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      startTimeRef.current = Date.now();
      setTimeLeft(totalTimerDuration);
      drawWaveform();

      // Countdown Timer
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
      alert("Mangyaring pahintulutan ang mikropono (microphone permissions) upang makapagbasa.");
    }
  };

  // 3. Stop Recording
  const stopRecording = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
  };

  // 4. Send Audio to Server and Log to SQLite Database
  const sendAudioForEvaluation = async () => {
    if (audioChunksRef.current.length === 0) return;
    setIsProcessing(true);

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', audioBlob, 'classroom_recording.webm');
    formData.append('target_text', activePassage.content);
    formData.append('level', 'expert'); // Uses high-precision Tagalog ASR engine

    try {
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
        throw new Error(result.error || "Nabigo ang pagsusuri sa audio.");
      }

      console.log("Classroom Evaluation Result:", result);

      // Compute Phil-IRI Composite Score
      const normWcpm = Math.min(100, (result.wcpm / 150) * 100);
      const compositeScore = Math.round((result.accuracy_rate * 0.5) + (normWcpm * 0.5));
      let readingLevel = 'Instructional';
      if (compositeScore >= 90) readingLevel = 'Independent';
      else if (compositeScore < 75) readingLevel = 'Frustration';

      // Log student result to SQLite database for Teacher Portal
      try {
        await fetch(`${API_BASE}/api/classroom/submit-result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teacher_id: activePassage.teacher_id,
            passage_id: activePassage.id,
            student_name: studentName,
            passage_title: activePassage.title,
            accuracy_rate: result.accuracy_rate,
            wcpm: result.wcpm,
            composite_score: compositeScore,
            reading_level: readingLevel,
            duration_seconds: result.duration_seconds,
            correct_words: result.correct_words,
            total_target_words: result.target_text.split(/\s+/).length,
            errors_detected: result.errors_detected,
            stutter_words: result.stutter_words || [],
            trace: result.trace || []
          })
        });
      } catch (logErr) {
        console.warn("Could not save to teacher classroom database:", logErr);
      }

      // Save to localStorage for standard Results.jsx view
      localStorage.setItem('user_firstName', studentName);
      localStorage.setItem('final_accuracy', result.accuracy_rate.toString());
      localStorage.setItem('final_wcpm', result.wcpm.toString());
      localStorage.setItem('evaluated_level', `Classroom - ${activePassage.title}`);
      localStorage.setItem('reading_logs', JSON.stringify([result]));

      // Redirect to Results Page
      navigate('/results');

    } catch (err) {
      console.error("Evaluation error:", err);
      alert("May naganap na error habang sinusuri ang iyong pagbasa. Subukan muli.");
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
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 border-4 border-[#0096FF] border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-xl font-bold">Kinukuha ang aktibong talata mula sa guro...</h2>
        <p className="text-gray-400 text-sm mt-1">Connecting to Classroom Assessment Service</p>
      </div>
    );
  }

  // Error Screen
  if (passageError || !activePassage) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-500/10 border border-red-500/30 p-8 rounded-3xl max-w-lg">
          <div className="w-16 h-16 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">!</div>
          <h2 className="text-2xl font-black mb-3">Walang Aktibong Talata</h2>
          <p className="text-gray-300 mb-6 text-base leading-relaxed">
            {passageError || "Walang itinalagang aktibong talata sa kasalukuyan. Makipag-ugnayan sa iyong guro upang i-set ang aktibong babasahin sa Teacher Portal."}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/" className="px-6 py-3 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-colors">
              Bumalik sa Simula
            </Link>
            <Link to="/teacher" className="px-6 py-3 bg-[#0096FF] text-white font-bold rounded-full hover:bg-blue-600 transition-colors">
              Pumunta sa Teacher Portal
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
    <div className="min-h-screen bg-slate-950 text-white font-sans relative overflow-x-hidden">
      <SoundWaveBackground opacity={0.12} />

      {/* Top Header */}
      <header className="relative z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-6 sm:px-12 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <Link to="/" className="text-2xl font-black text-[#0096FF] tracking-tight hover:opacity-90">
            ReadFil
          </Link>
          <span className="text-xs uppercase px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold tracking-wider">
            Classroom Mode
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={() => { setTempName(studentName); setIsNameModalOpen(true); }}
            className="flex items-center space-x-2 text-sm bg-slate-800/80 hover:bg-slate-800 px-3.5 py-1.5 rounded-full border border-slate-700 transition-colors"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span className="text-gray-300 font-medium">Mag-aaral:</span>
            <span className="font-bold text-white truncate max-w-[130px]">{studentName || "Magtakda ng Pangalan"}</span>
          </button>

          <Link
            to="/"
            className="text-xs uppercase font-bold text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 transition-all"
          >
            Lumabas
          </Link>
        </div>
      </header>

      {/* Main Reading Container */}
      <main className="relative z-20 max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Assignment Card Header */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-bold text-[#0096FF] uppercase tracking-wider bg-[#0096FF]/10 px-2.5 py-0.5 rounded-md border border-[#0096FF]/20">
                  {activePassage.grade_level || "General"}
                </span>
                <span className="text-xs text-slate-400">
                  Itinalaga ni: <strong className="text-slate-200">{activePassage.teacher_name || "Guro"}</strong>
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {activePassage.title}
              </h1>
            </div>

            {/* Countdown Timer Display */}
            <div className={`flex items-center gap-3 px-5 py-2.5 rounded-2xl border transition-all ${
              isTimeCritical
                ? 'bg-red-500/20 border-red-500/40 text-red-300 animate-pulse'
                : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
            }`}>
              <div className="flex flex-col text-right">
                <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Takdang Oras</span>
                <span className="font-mono text-2xl font-black leading-none">{timeLeft}s</span>
              </div>
              <div className="w-10 h-10 rounded-full border-2 border-current flex items-center justify-center font-bold text-xs">
                {Math.round(timerPercentage)}%
              </div>
            </div>
          </div>

          {/* Passage Reading Text */}
          <div className="pt-6 sm:pt-8">
            <p className="text-xl sm:text-2xl leading-relaxed sm:leading-loose text-slate-200 font-serif selection:bg-[#0096FF] selection:text-white text-justify">
              {activePassage.content}
            </p>
          </div>
        </div>

        {/* Recording Visualizer & Action Bar */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm">
          {/* Live Audio Visualizer Canvas */}
          <div className="relative w-full h-24 bg-slate-950 rounded-2xl overflow-hidden mb-6 border border-slate-800 flex items-center justify-center">
            <canvas ref={canvasRef} className="w-full h-full" width={800} height={96} />
            {!isRecording && !isProcessing && (
              <div className="absolute text-slate-500 text-sm font-medium flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-700"></span>
                Nakahanda ang mikropono. Pindutin ang Simulan ang Pagbasa upang magsimula.
              </div>
            )}
            {isRecording && (
              <div className="absolute top-3 right-4 flex items-center gap-2 bg-red-500/20 border border-red-500/40 px-3 py-1 rounded-full text-red-400 text-xs font-bold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                NAGRE-RECORD
              </div>
            )}
            {isProcessing && (
              <div className="absolute inset-0 bg-slate-950/90 flex items-center justify-center gap-3 text-blue-400 font-bold">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                Sinusuri ng ASR engine ang iyong pagbasa...
              </div>
            )}
          </div>

          {/* Silence error notification */}
          {isSilenceError && (
            <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <strong>Walang boses na narinig.</strong> Pakisuyong magsalita nang malinaw at malapit sa mikropono bago matapos ang oras.
              </div>
            </div>
          )}

          {/* Action Button */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={isProcessing}
                className="w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-[#0096FF] to-[#005FA3] hover:from-blue-500 hover:to-blue-700 text-white font-black text-lg rounded-full shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
                Simulan ang Pagbasa ({totalTimerDuration}s)
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="w-full sm:w-auto px-10 py-4 bg-red-600 hover:bg-red-700 text-white font-black text-lg rounded-full shadow-lg shadow-red-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 animate-pulse"
              >
                <div className="w-4 h-4 bg-white rounded-sm"></div>
                Tapusin at I-evaluate ({timeLeft}s natitira)
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Student Name Modal */}
      {isNameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-black text-white mb-2">Pangalan ng Mag-aaral</h3>
            <p className="text-slate-400 text-sm mb-6">
              Ilagay ang iyong buong pangalan upang maitala ng iyong guro ang resulta ng iyong pagsusulit sa pagbasa.
            </p>

            <form onSubmit={handleSaveStudentName}>
              <div className="mb-6">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Buong Pangalan (Hal. Juan Dela Cruz)
                </label>
                <input
                  type="text"
                  required
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  placeholder="I-type ang iyong pangalan..."
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#0096FF] focus:ring-1 focus:ring-[#0096FF]"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 justify-end">
                {studentName && (
                  <button
                    type="button"
                    onClick={() => setIsNameModalOpen(false)}
                    className="px-5 py-2.5 rounded-full text-slate-400 hover:text-white font-bold text-sm"
                  >
                    Kanselahin
                  </button>
                )}
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#0096FF] hover:bg-blue-600 text-white font-bold rounded-full text-sm transition-colors"
                >
                  I-save at Magpatuloy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
