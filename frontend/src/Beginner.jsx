import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { beginnerPassages } from './data/passages'; // NEW IMPORT
import { useLanguage } from './contexts/LanguageContext';
import SoundWaveBackground from './components/SoundWaveBackground';

// Helper to tokenize and normalize words for live satisfaction matching
const tokenizeWords = (text) => {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
};

// Check if two words phonetically or semantically match in Filipino reading
const isWordMatch = (w1, w2) => {
  if (!w1 || !w2) return false;
  if (w1 === w2) return true;

  // Common Filipino shorthand / contractions / variants
  if ((w1 === 'mga' && w2 === 'manga') || (w1 === 'manga' && w2 === 'mga')) return true;
  if ((w1 === 'ng' && w2 === 'nang') || (w1 === 'nang' && w2 === 'ng')) return true;
  if ((w1 === 'may' && w2 === 'mayroon') || (w1 === 'mayroon' && w2 === 'may')) return true;
  if ((w1 === 'dyan' && w2 === 'diyan') || (w1 === 'diyan' && w2 === 'dyan')) return true;
  if ((w1 === 'doon' && w2 === 'dun') || (w1 === 'dun' && w2 === 'doon')) return true;

  // Normalize Tagalog vowel shifts (o <-> u, e <-> i)
  const n1 = w1.replace(/o/g, 'u').replace(/e/g, 'i');
  const n2 = w2.replace(/o/g, 'u').replace(/e/g, 'i');
  if (n1 === n2) return true;

  // Prefix / stem match for words >= 4 letters
  if (w1.length >= 4 && w2.length >= 4) {
    if (w1.startsWith(w2.slice(0, -1)) || w2.startsWith(w1.slice(0, -1))) return true;
    if (w1.slice(0, 4) === w2.slice(0, 4)) return true;
  }

  // Levenshtein distance <= 1 for words >= 4 letters
  if (Math.abs(w1.length - w2.length) <= 1 && w1.length >= 4) {
    let diff = 0;
    let i = 0, j = 0;
    while (i < n1.length && j < n2.length) {
      if (n1[i] !== n2[j]) {
        diff++;
        if (diff > 1) break;
        if (n1.length > n2.length) i++;
        else if (n2.length > n1.length) j++;
        else { i++; j++; }
      } else {
        i++; j++;
      }
    }
    if (diff <= 1) return true;
  }

  return false;
};

// Check if the live spoken transcript satisfies all or nearly all words of the passage
const checkWordsSatisfied = (targetText, spokenText) => {
  const targetWords = tokenizeWords(targetText);
  const spokenWords = tokenizeWords(spokenText);

  if (targetWords.length === 0 || spokenWords.length === 0) {
    return { satisfied: false, matchCount: 0, totalTarget: targetWords.length, matchRatio: 0 };
  }

  // 1. Sequential matching with 4-word lookahead
  let targetIdx = 0;
  let matchCount = 0;

  for (let sIdx = 0; sIdx < spokenWords.length; sIdx++) {
    const sWord = spokenWords[sIdx];
    let matchedAhead = -1;
    for (let lookahead = 0; lookahead <= 4; lookahead++) {
      const checkIdx = targetIdx + lookahead;
      if (checkIdx < targetWords.length && isWordMatch(sWord, targetWords[checkIdx])) {
        matchedAhead = checkIdx;
        break;
      }
    }

    if (matchedAhead !== -1) {
      matchCount++;
      targetIdx = matchedAhead + 1;
    }
  }

  // 2. Bag-of-words coverage matching
  let bagMatchCount = 0;
  const usedSpoken = new Set();
  for (let t = 0; t < targetWords.length; t++) {
    for (let s = 0; s < spokenWords.length; s++) {
      if (!usedSpoken.has(s) && isWordMatch(targetWords[t], spokenWords[s])) {
        bagMatchCount++;
        usedSpoken.add(s);
        break;
      }
    }
  }

  const seqRatio = matchCount / targetWords.length;
  const bagRatio = bagMatchCount / targetWords.length;
  const bestRatio = Math.max(seqRatio, bagRatio);
  const reachedNearEnd = targetIdx >= Math.max(1, targetWords.length - 2);

  // Satisfied if reached near end and matched at least 58%, or overall matched >= 75%
  const satisfied = (reachedNearEnd && bestRatio >= 0.58) || bestRatio >= 0.75;

  return {
    satisfied,
    matchCount: Math.max(matchCount, bagMatchCount),
    totalTarget: targetWords.length,
    matchRatio: bestRatio
  };
};

export default function Beginner() {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const navigate = useNavigate();

  const [isTestReady, setIsTestReady] = useState(() => {
    return localStorage.getItem('beginner_isTestReady') === 'true';
  });
  const [currentIndex, setCurrentIndex] = useState(() => {
    const saved = localStorage.getItem('beginner_currentIndex');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [testPassages, setTestPassages] = useState(() => {
    const saved = localStorage.getItem('beginner_passages');
    return saved ? JSON.parse(saved) : [];
  });

  // Updated Mic Test States
  const [micStatus, setMicStatus] = useState('idle');
  const [testAudioUrl, setTestAudioUrl] = useState(null);

  // Actual Test States
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSilence, setIsSilence] = useState(false);
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [countdownValue, setCountdownValue] = useState(0);
  const [isSatisfiedCompleted, setIsSatisfiedCompleted] = useState(false);

  // Memory to store all 25 passages so the Results page can read them
  const [phaseScores, setPhaseScores] = useState([]);

  // Refs for the ACTUAL evaluation recording
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const stopTimeoutRef = useRef(null);
  const speechRecRef = useRef(null);
  const autoStopTimeoutRef = useRef(null);
  const isRecordingRef = useRef(false);
  const lastSoundTimeRef = useRef(Date.now());
  const soundDetectedRef = useRef(false);
  const speechDurationMsRef = useRef(0);
  const hasTriggeredAutoStopRef = useRef(false);
  const silenceCheckIntervalRef = useRef(null);
  const lastSpeechMatchRatioRef = useRef(0);
  const isSatisfiedRef = useRef(false);
  const startTimeRef = useRef(null);

  // Refs for the MIC TEST phase
  const testRecorderRef = useRef(null);
  const testChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const streamRef = useRef(null);
  const currentTextRef = useRef("");

  useEffect(() => {
    if (testPassages.length === 0) {
      // NOW USING THE IMPORTED DATA FROM passages.jsx
      const shuffled = [...beginnerPassages];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const selected = shuffled.slice(0, 1);
      setTestPassages(selected);
      localStorage.setItem('beginner_passages', JSON.stringify(selected));
    }
  }, [testPassages.length]);

  useEffect(() => {
    localStorage.setItem('beginner_currentIndex', currentIndex.toString());
  }, [currentIndex]);

  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (silenceCheckIntervalRef.current) clearInterval(silenceCheckIntervalRef.current);
      if (autoStopTimeoutRef.current) clearTimeout(autoStopTimeoutRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
      if (speechRecRef.current) {
        try { speechRecRef.current.abort(); } catch (e) {}
      }
    };
  }, []);

  useEffect(() => {
    let timer;
    if (isRecording) {
      timer = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timer);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  const stopRecording = () => {
    if (isProcessing) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    setIsProcessing(true);

    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current);
    }
    if (speechRecRef.current) {
      try { speechRecRef.current.abort(); } catch (e) {}
      speechRecRef.current = null;
    }

    stopTimeoutRef.current = setTimeout(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    }, 200);
  };

  const triggerAutoStop = (reason = "completed", delayMs = 300) => {
    if (hasTriggeredAutoStopRef.current || !isRecordingRef.current) return;
    hasTriggeredAutoStopRef.current = true;
    isSatisfiedRef.current = true;
    setIsSatisfiedCompleted(true);
    console.log(`[AUTO-STOP TRIGGERED] Beginner Reason: ${reason}. Finalizing audio in ${delayMs}ms...`);

    if (autoStopTimeoutRef.current) clearTimeout(autoStopTimeoutRef.current);
    autoStopTimeoutRef.current = setTimeout(() => {
      stopRecording();
    }, delayMs);
  };

  useEffect(() => {
    if (isCountingDown && countdownValue > 0) {
      const timer = setTimeout(() => setCountdownValue(countdownValue - 1), 1000);
      return () => clearTimeout(timer);
    } else if (isCountingDown && countdownValue === 0) {
      setIsCountingDown(false);

      const startRecording = async () => {
        if (!mediaRecorderRef.current) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            mediaRecorderRef.current.ondataavailable = (event) => {
              if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };
            mediaRecorderRef.current.onstop = sendAudioToServer;

            // Connect AnalyserNode for audio-reactive background during actual test
            try {
              if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
              }
              if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
              }
              const analyser = audioContextRef.current.createAnalyser();
              analyser.fftSize = 256;
              analyser.smoothingTimeConstant = 0.8;
              const source = audioContextRef.current.createMediaStreamSource(stream);
              source.connect(analyser);
              analyserRef.current = analyser;
            } catch (e) {
              console.warn("Could not attach audio analyser:", e);
            }
          } catch (err) {
            console.error("Microphone access denied:", err);
            alert("Microphone connection lost. Please allow access.");
            setIsTestReady(false);
            return;
          }
        }
        if (mediaRecorderRef.current.state === 'inactive') {
          mediaRecorderRef.current.start();
        }
        isRecordingRef.current = true;
        hasTriggeredAutoStopRef.current = false;
        isSatisfiedRef.current = false;
        speechDurationMsRef.current = 0;
        lastSpeechMatchRatioRef.current = 0;
        lastSoundTimeRef.current = Date.now();
        soundDetectedRef.current = false;
        startTimeRef.current = Date.now();
        setIsRecording(true);
        setElapsedTime(0);
        setIsSatisfiedCompleted(false);

        // Smart Silence Detection & Voice Activity Auto-Stop
        // Checks every 100ms via Web Audio API AnalyserNode
        if (silenceCheckIntervalRef.current) clearInterval(silenceCheckIntervalRef.current);
        silenceCheckIntervalRef.current = setInterval(() => {
          if (!isRecordingRef.current || hasTriggeredAutoStopRef.current) return;

          const now = Date.now();
          const recordingAgeMs = now - (startTimeRef.current || now);

          // Sample audio level
          if (analyserRef.current) {
            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyserRef.current.getByteTimeDomainData(dataArray);

            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
              const val = (dataArray[i] - 128) / 128.0;
              sum += val * val;
            }
            const rms = Math.sqrt(sum / bufferLength);

            // Threshold for human speech activity
            if (rms > 0.032) {
              lastSoundTimeRef.current = now;
              soundDetectedRef.current = true;
              speechDurationMsRef.current += 100;
            }
          }

          // Buffer: Give student at least 1.8 seconds after starting before evaluating silence
          if (recordingAgeMs < 1800) return;

          const silenceElapsedMs = now - lastSoundTimeRef.current;
          const totalVoiceMs = speechDurationMsRef.current;
          const matchRatio = lastSpeechMatchRatioRef.current;

          // Auto-stop 1: Words are satisfied by speech recognizer
          if (isSatisfiedRef.current) {
            triggerAutoStop("words_satisfied", 250);
            return;
          }

          // Auto-stop 2: High word match (>= 60%) + brief pause (>= 900ms)
          if (matchRatio >= 0.60 && silenceElapsedMs >= 900) {
            triggerAutoStop("high_match_silence", 200);
            return;
          }

          // Auto-stop 3: Partial match (>= 35%) + pause (>= 1300ms)
          if (matchRatio >= 0.35 && silenceElapsedMs >= 1300) {
            triggerAutoStop("partial_match_silence", 200);
            return;
          }

          // Auto-stop 4: Finished reading by voice activity!
          // Student spoke for >= 1200ms and has now stopped talking for >= 1700ms
          if (totalVoiceMs >= 1200 && silenceElapsedMs >= 1700) {
            triggerAutoStop("voice_activity_completed", 200);
            return;
          }
        }, 100);

        // Web Speech Recognition for hands-free auto-stop when satisfied
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          try {
            if (speechRecRef.current) {
              try { speechRecRef.current.abort(); } catch (e) {}
            }
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            try {
              recognition.lang = 'tl-PH';
            } catch (e) {
              recognition.lang = 'fil-PH';
            }

            let accumulatedSpoken = '';

            recognition.onresult = (event) => {
              if (hasTriggeredAutoStopRef.current || !isRecordingRef.current) return;

              let currentInterim = '';
              for (let i = event.resultIndex; i < event.results.length; i++) {
                const trans = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                  accumulatedSpoken += ' ' + trans;
                } else {
                  currentInterim += ' ' + trans;
                }
              }

              const totalSpoken = (accumulatedSpoken + ' ' + currentInterim).trim();
              const check = checkWordsSatisfied(currentTextRef.current, totalSpoken);
              lastSpeechMatchRatioRef.current = check.matchRatio;

              if (check.satisfied && !hasTriggeredAutoStopRef.current) {
                triggerAutoStop("words_satisfied", 300);
              }
            };

            recognition.onerror = (e) => {
              console.warn("[SpeechRecognition] warning:", e.error);
              if (e.error === 'language-not-supported' && recognition.lang === 'tl-PH') {
                try {
                  recognition.lang = 'fil-PH';
                } catch (err) {}
              }
            };

            recognition.onend = () => {
              if (isRecordingRef.current && !hasTriggeredAutoStopRef.current) {
                try {
                  recognition.start();
                } catch (err) {}
              }
            };

            recognition.start();
            speechRecRef.current = recognition;
          } catch (e) {
            console.warn("SpeechRecognition init error:", e);
          }
        }
      };

      startRecording();
    }
  }, [isCountingDown, countdownValue]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  useEffect(() => {
    currentTextRef.current = testPassages[currentIndex]?.text || "";
  }, [currentIndex, testPassages]);

  const drawWaveform = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteTimeDomainData(dataArray);

      ctx.fillStyle = '#f9fafb';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0096FF';
      ctx.beginPath();

      const sliceWidth = canvas.width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };
    draw();
  };

  const handleMicTestToggle = async () => {
    if (micStatus === 'idle' || micStatus === 'playback_ready') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        analyserRef.current.fftSize = 2048;

        testRecorderRef.current = new MediaRecorder(stream);
        testChunksRef.current = [];

        testRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) testChunksRef.current.push(event.data);
        };

        testRecorderRef.current.onstop = () => {
          const audioBlob = new Blob(testChunksRef.current, { type: 'audio/webm' });
          const audioUrl = URL.createObjectURL(audioBlob);
          setTestAudioUrl(audioUrl);
        };

        testRecorderRef.current.start();
        setMicStatus('recording_test');
        drawWaveform();

      } catch (err) {
        console.error("Microphone access denied:", err);
        alert("Please allow microphone permissions in your browser to proceed.");
      }
    } else if (micStatus === 'recording_test') {
      testRecorderRef.current.stop();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setMicStatus('playback_ready');
    }
  };

  const sendAudioToServer = async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', audioBlob, 'latest_recording.webm');

    const targetText = currentTextRef.current;
    formData.append('target_text', targetText);

    try {
      const response = await fetch((import.meta.env.VITE_API_URL || '') + '/api/evaluate', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      if (!response.ok) {
        if (result.status === 'empty') {
          setIsSilence(true);
          setIsProcessing(false);
          audioChunksRef.current = [];
          return;
        }
        throw new Error(result.error || "Evaluation failed");
      }

      console.log("Server Evaluation Results:", result);
      setPhaseScores(prev => [...prev, result]);
      setHasRecorded(true);

    } catch (error) {
      console.error("Error sending audio to server:", error);
      alert("An error occurred during evaluation. Please try again.");
    } finally {
      setIsProcessing(false);
    }
    audioChunksRef.current = [];
  };

  const startActualTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = sendAudioToServer;

      // Connect AnalyserNode for audio-reactive background
      try {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyser);
        analyserRef.current = analyser;
      } catch (e) {
        console.warn("Could not attach audio analyser:", e);
      }

      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());

      setIsTestReady(true);
      localStorage.setItem('beginner_isTestReady', 'true');
    } catch (err) {
      alert("Microphone connection lost. Please allow access.");
    }
  };


  const toggleRecording = () => {
    if (isProcessing || isCountingDown) return;
    if (isRecording) {
      stopRecording();
    } else {
      setIsSilence(false);
      setIsSatisfiedCompleted(false);
      audioChunksRef.current = [];
      setHasRecorded(false);
      setIsCountingDown(true);
      setCountdownValue(3);
    }
  };

  const handleReturnHomeClick = (e) => {
    e.preventDefault();
    setShowConfirmModal(true);
  };

  const confirmReturnHome = () => {
    localStorage.removeItem('beginner_passages');
    localStorage.removeItem('beginner_currentIndex');
    localStorage.removeItem('beginner_isTestReady');
    localStorage.removeItem('user_firstName');
    localStorage.removeItem('user_lastName');
    localStorage.removeItem('user_email');
    navigate('/');
  };

  const nextPassage = () => {
    if (currentIndex < testPassages.length - 1) {
      setCurrentIndex((prevIndex) => prevIndex + 1);
      setIsRecording(false);
      setHasRecorded(false);
      setIsSilence(false);
    } else {
      let totalAccuracy = 0;
      let totalWcpm = 0;

      if (phaseScores.length > 0) {
        totalAccuracy = phaseScores.reduce((sum, item) => sum + item.accuracy_rate, 0) / phaseScores.length;
        totalWcpm = phaseScores.reduce((sum, item) => sum + item.wcpm, 0) / phaseScores.length;
      }

      localStorage.setItem('evaluated_level', 'Beginner');
      localStorage.setItem('final_accuracy', totalAccuracy);
      localStorage.setItem('final_wcpm', totalWcpm);

      localStorage.setItem('reading_logs', JSON.stringify(phaseScores));

      localStorage.removeItem('beginner_passages');
      localStorage.removeItem('beginner_currentIndex');
      localStorage.removeItem('beginner_isTestReady');

      navigate('/results');
    }
  };

  if (testPassages.length === 0) return null;

  return (
    <div className="min-h-screen bg-transparent text-black font-sans relative overflow-x-hidden">
      {/* Audio-Reactive Waving Background */}
      <SoundWaveBackground analyserRef={analyserRef} isRecording={isRecording || micStatus === 'recording_test'} />

      <nav className="w-full bg-white/75 backdrop-blur-md shadow-sm border-b border-white/50 px-4 sm:px-10 lg:px-20 py-4 sm:py-5 flex justify-between items-center relative z-10">
        <div className="text-xl sm:text-2xl font-black tracking-tight text-[#0096FF]">ReadFil</div>
        <a href="/" onClick={handleReturnHomeClick} className="font-semibold text-xs sm:text-sm uppercase tracking-wide hover:text-[#0096FF] transition-colors cursor-pointer">
          {t("nav.return_home")}
        </a>
      </nav>

      {!isTestReady ? (
        <main className="max-w-3xl mx-auto pt-20 sm:pt-32 px-4 sm:px-10 pb-12 sm:pb-20 text-center relative z-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold mb-4">{t("eval.mic_check")}</h1>
          <p className="text-gray-600 text-base sm:text-lg mb-8 sm:mb-12">{t("eval.verify_audio")}</p>

          <div className="bg-white/90 backdrop-blur-md p-5 sm:p-10 rounded-2xl sm:rounded-[2rem] shadow-xl shadow-sky-100/50 border border-white/80 flex flex-col items-center">

            <div className="w-full h-32 bg-gray-50 rounded-xl border border-gray-200 mb-8 overflow-hidden flex items-center justify-center">
              {micStatus === 'idle' && <p className="text-gray-400 font-medium">{t("eval.waveform_placeholder")}</p>}
              <canvas
                ref={canvasRef}
                width="600"
                height="128"
                className={`w-full h-full ${micStatus === 'idle' ? 'hidden' : 'block'}`}
              />
            </div>

            <p className="text-xl font-medium text-gray-700 mb-8">
              {micStatus === 'idle' ? t("eval.click_mic") :
                micStatus === 'recording_test' ? t("eval.recording_test") :
                  t("eval.test_complete")}
            </p>

            <div className="flex flex-col items-center gap-6">
              {micStatus !== 'playback_ready' ? (
                <div className="relative flex items-center justify-center">
                  {micStatus === 'recording_test' && (
                    <>
                      <span className="absolute w-32 h-32 rounded-full bg-red-400/30 animate-ping pointer-events-none"></span>
                      <span className="absolute w-28 h-28 rounded-full bg-[#0096FF]/20 animate-pulse pointer-events-none"></span>
                    </>
                  )}
                  <button
                    onClick={handleMicTestToggle}
                    className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transform transition-all relative z-10 ${micStatus === 'recording_test' ? 'bg-red-500 hover:bg-red-600 animate-pulse scale-110' : 'bg-black hover:bg-gray-800 hover:scale-105'
                      }`}
                  >
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {micStatus === 'recording_test' ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path>
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                    )}
                  </svg>
                </button>
              </div>
              ) : (
                <div className="flex flex-col items-center gap-6 w-full">
                  <audio src={testAudioUrl} controls className="w-full max-w-md" />
                  <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                    <button
                      onClick={() => { setMicStatus('idle'); setTestAudioUrl(null); }}
                      className="w-full sm:w-auto px-6 py-3 rounded-full font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors text-center"
                    >
                      {t("eval.retest_mic")}
                    </button>
                    <button
                      onClick={startActualTest}
                      className="w-full sm:w-auto bg-[#0096FF] hover:bg-[#8ACEFF] text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all transform hover:-translate-y-1 text-center"
                    >
                      {t("eval.proceed_eval")}
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </main>
      ) : (
        <main className="max-w-4xl mx-auto pt-12 sm:pt-20 px-4 sm:px-10 pb-12 sm:pb-20 relative z-10">
          <div className="text-center mb-8 sm:mb-12">
            <h1 className="text-3xl sm:text-4xl font-extrabold mb-4">{t("eval.beg_eval_title")}</h1>
            <p className="text-gray-600 text-base sm:text-lg">{t("eval.read_text")}</p>
          </div>

          <div className="bg-white/90 backdrop-blur-md p-5 sm:p-10 rounded-2xl sm:rounded-[2rem] shadow-xl shadow-sky-100/50 border border-white/80 mb-6 sm:mb-10 relative">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-[#0096FF]">{t("eval.reading_material")}</h2>
              <span className="text-sm font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                {currentIndex + 1} / {testPassages.length}
              </span>
            </div>

            <div className="p-5 pb-20 sm:p-8 sm:pb-12 bg-gray-50 rounded-xl border border-gray-200 min-h-[150px] flex flex-col items-center justify-center relative">
              {isCountingDown && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 backdrop-blur-sm rounded-xl">
                  <span className="text-6xl sm:text-8xl font-black text-[#0096FF] animate-pulse">
                    {countdownValue > 0 ? countdownValue : 'Go!'}
                  </span>
                </div>
              )}
              <p className={`text-xl sm:text-2xl leading-relaxed text-center font-medium text-black transition-all duration-300 ${!isRecording && !hasRecorded && !isProcessing ? 'blur-sm select-none' : ''}`}>
                "{testPassages[currentIndex]?.text}"
              </p>
              <span className={`mt-6 text-sm text-gray-400 italic transition-all duration-300 ${!isRecording && !hasRecorded && !isProcessing ? 'blur-sm select-none' : ''}`}>
                {t("eval.source")} {testPassages[currentIndex]?.source}
              </span>

              <div className="absolute bottom-4 right-6 flex items-center gap-2 text-gray-600 font-mono font-bold bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                {formatTime(elapsedTime)}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center">
            {!hasRecorded && (
              <div className="relative flex items-center justify-center w-36 h-36">
                {isRecording && (
                  <>
                    <span className={`absolute inset-0 rounded-full animate-ping pointer-events-none ${isSatisfiedCompleted ? 'bg-emerald-400/40' : 'bg-red-400/30'}`}></span>
                    <span className={`absolute w-28 h-28 rounded-full animate-pulse pointer-events-none ${isSatisfiedCompleted ? 'bg-emerald-500/30' : 'bg-[#0096FF]/20'}`}></span>
                  </>
                )}
                <button
                  onClick={toggleRecording}
                  disabled={isProcessing || isCountingDown}
                  className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transform transition-all hover:scale-105 relative z-10 ${
                    isSatisfiedCompleted
                      ? 'bg-emerald-500 scale-105 shadow-emerald-500/40'
                      : isRecording
                      ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                      : 'bg-black hover:bg-gray-800'
                  } ${(isProcessing || isCountingDown) ? 'opacity-50 cursor-not-allowed hover:scale-100' : ''}`}
                >
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {isSatisfiedCompleted ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                    ) : isRecording ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path>
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                    )}
                  </svg>
                </button>
              </div>
            )}

            <p className={`mt-4 font-bold text-lg text-center min-h-[1.75rem] transition-colors ${
              isSatisfiedCompleted
                ? 'text-emerald-600 font-extrabold animate-pulse'
                : isRecording
                ? 'text-red-500'
                : isProcessing
                ? 'text-[#0096FF] animate-pulse'
                : isSilence
                ? 'text-red-600'
                : 'text-gray-500'
            }`}>
              {isSatisfiedCompleted
                ? (isEn ? "All words completed! Finalizing evaluation..." : "Kusang natapos ang pagbasa! Isinusumite...")
                : isRecording
                ? (isEn ? "Reading in progress... (Auto-stops when finished)" : "Kasalukuyang nagbabasa... (Kusang hihinto pagkatapos)")
                : isProcessing
                ? t("eval.processing")
                : isSilence
                ? t("eval.no_speech")
                : (hasRecorded ? t("eval.graded") : t("eval.click_begin"))}
            </p>

            {hasRecorded && !isProcessing && (
              <button
                onClick={nextPassage}
                className="mt-8 bg-[#0096FF] text-white font-bold py-4 px-10 rounded-full shadow-lg hover:bg-blue-600 transition-all transform hover:-translate-y-1"
              >
                {currentIndex < testPassages.length - 1 ? t("eval.next_passage") : t("eval.finish_test")}
              </button>
            )}
          </div>
        </main>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-2xl sm:rounded-[2rem] shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in duration-200">
            <div className="p-6 sm:p-8 pb-4 sm:pb-6 border-b border-gray-100">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-2xl sm:text-3xl font-extrabold text-black">{t("return_modal.title")}</h3>
                <button onClick={() => setShowConfirmModal(false)} className="text-gray-400 hover:text-gray-800 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
              <p className="text-sm sm:text-base text-gray-500">{t("return_modal.leave_test_alt")}</p>
            </div>
            <div className="p-6 sm:p-8 text-center">
              <p className="text-base sm:text-lg text-gray-700 font-medium mb-6 sm:mb-8">{t("return_modal.reset_progress_alt")}</p>
              <div className="flex gap-4">
                <button type="button" onClick={() => setShowConfirmModal(false)} className="w-1/2 px-6 py-4 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">{t("return_modal.cancel")}</button>
                <button type="button" onClick={confirmReturnHome} className="w-1/2 px-6 py-4 rounded-xl font-bold text-white bg-black hover:bg-gray-800 transition-all transform hover:-translate-y-1 shadow-lg">{t("return_modal.proceed")}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
