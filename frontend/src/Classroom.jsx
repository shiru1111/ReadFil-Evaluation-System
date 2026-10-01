import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from './contexts/LanguageContext';
import SoundWaveBackground from './components/SoundWaveBackground';

const API_BASE = import.meta.env.VITE_API_URL || '';

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

export default function Classroom() {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const navigate = useNavigate();

  // Multi-Passage Assessment State
  const [passagesList, setPassagesList] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activePassage, setActivePassage] = useState(null);
  const [isLoadingPassages, setIsLoadingPassages] = useState(true);
  const [passageError, setPassageError] = useState(null);

  // Multi-Passage Evaluation State
  const [evalResults, setEvalResults] = useState([]);
  const [isBetweenPassages, setIsBetweenPassages] = useState(false);
  const [lastPassageSummary, setLastPassageSummary] = useState(null);

  // Classroom Gate (PIN Protection) State
  const [isGateUnlocked, setIsGateUnlocked] = useState(() => {
    return sessionStorage.getItem('readfil_classroom_unlocked') === 'true';
  });
  const [pinInput, setPinInput] = useState(() => {
    return sessionStorage.getItem('readfil_classroom_pin') || '';
  });
  const [gateStudentName, setGateStudentName] = useState(() => {
    return localStorage.getItem('user_firstName') || '';
  });
  const [gateTeacher, setGateTeacher] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('readfil_classroom_teacher')) || null;
    } catch {
      return null;
    }
  });
  const [gateError, setGateError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Student Info State (for in-room assessment)
  const [studentName, setStudentName] = useState(() => {
    return localStorage.getItem('user_firstName') || '';
  });
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [tempName, setTempName] = useState('');

  // Assessment & Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [countdownValue, setCountdownValue] = useState(3);
  const [timeLeft, setTimeLeft] = useState(60);
  const [totalTimerDuration, setTotalTimerDuration] = useState(60);
  const [isSilenceError, setIsSilenceError] = useState(false);
  const [isSatisfiedCompleted, setIsSatisfiedCompleted] = useState(false);
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState(0);

  // Media & Recognition Refs
  const countdownTimerRef = useRef(null);
  const isRecordingRef = useRef(false);
  const recognitionRef = useRef(null);
  const autoStopTimeoutRef = useRef(null);
  const autoAdvanceTimerRef = useRef(null);
  const lastSoundTimeRef = useRef(Date.now());
  const soundDetectedRef = useRef(false);
  const speechDurationMsRef = useRef(0);
  const hasTriggeredAutoStopRef = useRef(false);
  const silenceCheckIntervalRef = useRef(null);
  const lastSpeechMatchRatioRef = useRef(0);
  const isSatisfiedRef = useRef(false);

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

  // 1. Fetch Active Passages from Teacher
  const loadPassages = async (manual = false) => {
    const teacherId = gateTeacher?.id || sessionStorage.getItem('readfil_classroom_teacher_id');
    if (!teacherId) return;

    if (manual) setIsRefreshing(true);
    try {
      const res = await fetch(`${API_BASE}/api/classroom/active-passages?teacher_id=${teacherId}`);
      if (!res.ok) {
        throw new Error(isEn
          ? "Could not reach classroom assessment service."
          : "Hindi maabot ang serbisyo ng silid-aralan."
        );
      }
      const data = await res.json();
      const list = (data.passages && data.passages.length > 0) ? data.passages : [];

      setPassagesList(list);
      setLastSyncTime(new Date());

      if (list.length > 0) {
        setCurrentIndex(0);
        setActivePassage(list[0]);
        const duration = parseInt(list[0].timer_seconds, 10) || 60;
        setTotalTimerDuration(duration);
        setTimeLeft(duration);
        setPassageError(null);
      } else {
        setActivePassage(null);
        setPassageError(null);
      }
    } catch (err) {
      console.error("Error fetching classroom passages:", err);
      if (manual) {
        setPassageError(err.message || (isEn ? "Failed to refresh passages." : "Bigo sa pag-refresh ng mga talata."));
      }
    } finally {
      if (manual) {
        setTimeout(() => setIsRefreshing(false), 400);
      }
      setIsLoadingPassages(false);
    }
  };

  // 1a. Initial load on mount if gate is already unlocked
  useEffect(() => {
    if (!isGateUnlocked) {
      setIsLoadingPassages(false);
      return;
    }
    loadPassages(false);
  }, [isGateUnlocked]);

  // 1b. Auto-sync polling every 5s while waiting for teacher to activate a passage
  useEffect(() => {
    if (!isGateUnlocked || passagesList.length > 0 || isRecording) return;

    const interval = setInterval(() => {
      loadPassages(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [isGateUnlocked, passagesList.length, isRecording]);

  // Handle PIN verification at the Classroom Gate door
  const handleVerifyAndEnter = async (e) => {
    e.preventDefault();
    const cleanPin = pinInput.trim();
    const cleanName = gateStudentName.trim();

    if (!cleanPin || cleanPin.length < 6) {
      setGateError(isEn ? "Please enter a valid 6-digit Classroom PIN." : "Pakilagay ang wastong 6-digit Classroom PIN.");
      return;
    }
    if (!cleanName) {
      setGateError(isEn ? "Please enter your full name." : "Pakilagay ang iyong buong pangalan.");
      return;
    }

    setIsVerifying(true);
    setGateError('');
    try {
      const res = await fetch(`${API_BASE}/api/classroom/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: cleanPin })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || (isEn ? "Invalid Classroom PIN. Please ask your teacher." : "Maling Classroom PIN. Hingin sa iyong guro ang tamang code."));
      }

      const list = (data.passages && data.passages.length > 0) ? data.passages : [];

      // Save verified session for this teacher exclusively
      sessionStorage.setItem('readfil_classroom_unlocked', 'true');
      sessionStorage.setItem('readfil_classroom_pin', cleanPin);
      sessionStorage.setItem('readfil_classroom_teacher', JSON.stringify(data.teacher));
      sessionStorage.setItem('readfil_classroom_teacher_id', data.teacher.id.toString());
      localStorage.setItem('user_firstName', cleanName);

      setStudentName(cleanName);
      setGateTeacher(data.teacher);
      setPassagesList(list);
      setIsGateUnlocked(true);
      setLastSyncTime(new Date());
      setGateError('');

      if (list.length > 0) {
        setCurrentIndex(0);
        setActivePassage(list[0]);
        const duration = parseInt(list[0].timer_seconds, 10) || 60;
        setTotalTimerDuration(duration);
        setTimeLeft(duration);
        setPassageError(null);
      } else {
        setActivePassage(null);
        setPassageError(null);
      }
    } catch (err) {
      setGateError(err.message);
    } finally {
      setIsVerifying(false);
      setIsLoadingPassages(false);
    }
  };

  // Exit/Leave room handler
  const handleLeaveRoom = () => {
    const confirmLeave = isEn
      ? "Are you sure you want to leave this classroom session?"
      : "Sigurado ka bang nais mong lumabas sa sesyon ng klase?";
    if (window.confirm(confirmLeave)) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      setIsRecording(false);
      sessionStorage.removeItem('readfil_classroom_unlocked');
      sessionStorage.removeItem('readfil_classroom_pin');
      sessionStorage.removeItem('readfil_classroom_teacher');
      sessionStorage.removeItem('readfil_classroom_teacher_id');
      setIsGateUnlocked(false);
      setGateTeacher(null);
      setPassagesList([]);
      setActivePassage(null);
      setGateError('');
      setPassageError(null);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      if (autoStopTimeoutRef.current) clearTimeout(autoStopTimeoutRef.current);
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
      if (silenceCheckIntervalRef.current) clearInterval(silenceCheckIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Hands-free auto-advance countdown between assessment passages
  useEffect(() => {
    if (isBetweenPassages && autoAdvanceCountdown > 0) {
      autoAdvanceTimerRef.current = setTimeout(() => {
        setAutoAdvanceCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(autoAdvanceTimerRef.current);
    } else if (isBetweenPassages && autoAdvanceCountdown === 0 && lastPassageSummary) {
      handleProceedToNextPassage();
    }
  }, [isBetweenPassages, autoAdvanceCountdown, lastPassageSummary]);

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

      // Track voice activity for silence detection
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const val = (dataArray[i] - 128) / 128.0;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / bufferLength);
      if (rms > 0.032) {
        lastSoundTimeRef.current = Date.now();
        soundDetectedRef.current = true;
      }

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

  // Smart Hands-Free Auto-Stop Trigger
  const triggerAutoStop = (reason = "completed", delayMs = 300) => {
    if (hasTriggeredAutoStopRef.current || !isRecordingRef.current) return;
    hasTriggeredAutoStopRef.current = true;
    isSatisfiedRef.current = true;
    setIsSatisfiedCompleted(true);
    console.log(`[AUTO-STOP TRIGGERED] Reason: ${reason}. Finalizing audio in ${delayMs}ms...`);

    if (autoStopTimeoutRef.current) clearTimeout(autoStopTimeoutRef.current);
    autoStopTimeoutRef.current = setTimeout(() => {
      if (isRecordingRef.current) {
        stopRecording();
      }
    }, delayMs);
  };

  // 2. Start Assessment Recording for Current Passage
  const startRecording = async () => {
    if (!studentName.trim()) {
      setIsNameModalOpen(true);
      return;
    }

    try {
      setIsSilenceError(false);
      setIsSatisfiedCompleted(false);
      audioChunksRef.current = [];
      lastSoundTimeRef.current = Date.now();
      soundDetectedRef.current = false;
      speechDurationMsRef.current = 0;
      hasTriggeredAutoStopRef.current = false;
      lastSpeechMatchRatioRef.current = 0;
      isSatisfiedRef.current = false;
      isRecordingRef.current = true;

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

      // Live Speech Recognition: Auto-stops as soon as words are satisfied
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch (e) {}
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
            const check = checkWordsSatisfied(activePassage?.content, totalSpoken);
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
          recognitionRef.current = recognition;
        } catch (e) {
          console.warn("SpeechRecognition init error, using duration timer:", e);
        }
      }

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

        // Buffer: Give student at least 1.8 seconds after clicking/starting before evaluating silence
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

      // Start Countdown Timer: Fallback limit if speech doesn't stop or is ongoing
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

  // 3-2-1 Countdown before assessment reading starts (matching Easy / Beginner UI)
  useEffect(() => {
    if (isCountingDown && countdownValue > 0) {
      countdownTimerRef.current = setTimeout(() => {
        setCountdownValue((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(countdownTimerRef.current);
    } else if (isCountingDown && countdownValue === 0) {
      countdownTimerRef.current = setTimeout(() => {
        setIsCountingDown(false);
        startRecording();
      }, 500);
      return () => clearTimeout(countdownTimerRef.current);
    }
  }, [isCountingDown, countdownValue]);

  // Toggle recording matching Easy / Beginner UI mechanics
  const toggleRecording = () => {
    if (isProcessing || isCountingDown) return;
    if (isRecording) {
      stopRecording();
    } else {
      if (!studentName.trim()) {
        setIsNameModalOpen(true);
        return;
      }
      setIsSilenceError(false);
      audioChunksRef.current = [];
      setIsCountingDown(true);
      setCountdownValue(3);
    }
  };

  // 3. Stop Recording
  const stopRecording = () => {
    if (isProcessing) return;
    isRecordingRef.current = false;

    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current);
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
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

  // 4. Send Audio to Backend for Evaluation & Logging
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

      // Calculate Phil-IRI scores for this passage
      const targetWcpm = 150;
      const accRate = parseFloat(result.accuracy_rate) || 0;
      const readWcpm = parseFloat(result.wcpm) || 0;
      const accScore = accRate * 0.5;
      const fluScore = Math.min((readWcpm / targetWcpm) * 50, 50);
      const composite = Math.round(accScore + fluScore);
      let philIriLevel = "Frustration";
      if (composite >= 90) philIriLevel = "Independent";
      else if (composite >= 75) philIriLevel = "Instructional";

      const passageEvalData = {
        passage_id: activePassage.id,
        passage_title: activePassage.title,
        content: activePassage.content,
        elapsedSeconds,
        accuracy_rate: accRate,
        wcpm: readWcpm,
        composite_score: composite,
        reading_level: philIriLevel,
        correct_words: result.correct_words || 0,
        total_target_words: result.total_target_words || activePassage.content.trim().split(/\s+/).length,
        errors_detected: result.errors_detected || 0,
        stutter_words: result.stutter_words || [],
        spoken_text: spokenTranscript,
        transcription: spokenTranscript,
        target_text: activePassage.content,
        trace: result.trace || [],
        raw_result: result
      };

      const updatedResults = [...evalResults, passageEvalData];
      setEvalResults(updatedResults);

      const hasNextPassage = currentIndex < passagesList.length - 1;

      if (hasNextPassage) {
        // Show Interstitial Transition to next passage in set
        const nextPassage = passagesList[currentIndex + 1];
        setLastPassageSummary({
          index: currentIndex,
          title: activePassage.title,
          accuracy: accRate,
          wcpm: readWcpm,
          correct: passageEvalData.correct_words,
          total: passageEvalData.total_target_words,
          nextTitle: nextPassage.title,
          nextTimer: nextPassage.timer_seconds || 10
        });
        setIsBetweenPassages(true);
        setAutoAdvanceCountdown(4); // Hands-free: auto-advances to next passage in 4s!
      } else {
        // All Passages in the set are complete!
        // Calculate consolidated aggregate scores across the entire assessment set:
        const totalPassages = updatedResults.length;
        const avgAccuracy = Math.round(
          updatedResults.reduce((sum, r) => sum + r.accuracy_rate, 0) / totalPassages
        );
        const avgWcpm = Math.round(
          updatedResults.reduce((sum, r) => sum + r.wcpm, 0) / totalPassages
        );
        const totalElapsed = updatedResults.reduce((sum, r) => sum + r.elapsedSeconds, 0);
        const totalCorrect = updatedResults.reduce((sum, r) => sum + r.correct_words, 0);
        const totalTarget = updatedResults.reduce((sum, r) => sum + r.total_target_words, 0);
        const totalErrors = updatedResults.reduce((sum, r) => sum + r.errors_detected, 0);

        const allStutters = Array.from(new Set(updatedResults.flatMap(r => r.stutter_words || [])));
        const allTraces = updatedResults.flatMap(r => r.trace || []);

        const overallAccScore = avgAccuracy * 0.5;
        const overallFluScore = Math.min((avgWcpm / targetWcpm) * 50, 50);
        const overallComposite = Math.round(overallAccScore + overallFluScore);
        let overallPhilIri = "Frustration";
        if (overallComposite >= 90) overallPhilIri = "Independent";
        else if (overallComposite >= 75) overallPhilIri = "Instructional";

        const setPassageTitle = totalPassages > 1
          ? `Set (${totalPassages} Passages): ${updatedResults.map(r => r.passage_title).join(' • ')}`
          : updatedResults[0].passage_title;

        // Save Consolidated Student Result to SQLite Database for the Teacher
        try {
          await fetch(`${API_BASE}/api/classroom/submit-result`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              teacher_id: gateTeacher?.id || Number(sessionStorage.getItem('readfil_classroom_teacher_id')) || activePassage?.teacher_id,
              passage_id: activePassage?.id,
              student_name: studentName,
              passage_title: setPassageTitle,
              duration_seconds: totalElapsed,
              accuracy_rate: avgAccuracy,
              wcpm: avgWcpm,
              composite_score: overallComposite,
              reading_level: overallPhilIri,
              total_target_words: totalTarget,
              correct_words: totalCorrect,
              errors_detected: totalErrors,
              stutter_words: allStutters,
              trace: allTraces
            })
          });
        } catch (logErr) {
          console.warn("Could not save to teacher classroom database:", logErr);
        }

        // Format reading_logs array so Results.jsx can render each passage nicely
        const logsForResults = updatedResults.map((r, idx) => ({
          target_text: r.target_text,
          transcription: r.transcription || r.spoken_text,
          spoken_text: r.spoken_text,
          accuracy_rate: r.accuracy_rate,
          wcpm: r.wcpm,
          correct_words: r.correct_words,
          total_target_words: r.total_target_words,
          errors_detected: r.errors_detected,
          stutter_words: r.stutter_words,
          trace: r.trace,
          level: `Classroom Passage #${idx + 1}: ${r.passage_title}`
        }));

        // Save to localStorage for standard Results.jsx view
        localStorage.setItem('user_firstName', studentName);
        localStorage.setItem('final_accuracy', avgAccuracy.toString());
        localStorage.setItem('final_wcpm', avgWcpm.toString());
        localStorage.setItem('evaluated_level', totalPassages > 1
          ? `Classroom Assessment (${totalPassages} Passages)`
          : `Classroom - ${activePassage.title}`
        );
        localStorage.setItem('reading_logs', JSON.stringify(logsForResults));

        // Redirect to Results Page
        navigate('/results');
      }

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

  // Proceed to next passage in the active set (Hands-free continuous start)
  const handleProceedToNextPassage = () => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
    }
    const nextIdx = currentIndex + 1;
    if (nextIdx < passagesList.length) {
      const nextPassage = passagesList[nextIdx];
      setCurrentIndex(nextIdx);
      setActivePassage(nextPassage);
      const duration = parseInt(nextPassage.timer_seconds, 10) || 60;
      setTotalTimerDuration(duration);
      setTimeLeft(duration);
      setIsBetweenPassages(false);
      setLastPassageSummary(null);
      setIsSilenceError(false);
      setIsSatisfiedCompleted(false);

      // Hands-free continuous start: automatically starts 3-2-1 countdown for next passage!
      setIsCountingDown(true);
      setCountdownValue(3);
    }
  };

  const handleSaveStudentName = (e) => {
    e.preventDefault();
    if (!tempName.trim()) return;
    setStudentName(tempName.trim());
    localStorage.setItem('user_firstName', tempName.trim());
    setIsNameModalOpen(false);
  };

  // -------------------------------------------------------------
  // RENDER: CLASSROOM ACCESS GATE (THE DOOR BEFORE ENTERING)
  // -------------------------------------------------------------
  if (!isGateUnlocked) {
    return (
      <div className="min-h-screen bg-slate-50/70 text-slate-900 font-sans relative overflow-x-hidden flex flex-col justify-between">
        <SoundWaveBackground opacity={0.08} />

        {/* Top Header */}
        <header className="relative z-20 border-b border-gray-200/80 bg-white/80 backdrop-blur-md px-6 sm:px-12 py-4 flex justify-between items-center shadow-sm">
          <div className="flex items-center space-x-3">
            <Link to="/" className="text-2xl font-black text-[#0096FF] tracking-tight hover:opacity-90">
              ReadFil
            </Link>
            <span className="text-xs uppercase px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold tracking-wider">
              {isEn ? "Classroom Access Gate" : "Pinto ng Silid-Aralan"}
            </span>
          </div>

          <Link
            to="/"
            className="text-xs uppercase font-bold text-gray-500 hover:text-slate-900 px-3.5 py-1.5 rounded-xl border border-gray-200 hover:border-gray-300 bg-white transition-all shadow-sm flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {isEn ? "Back to Home" : "Bumalik sa Home"}
          </Link>
        </header>

        {/* Center Gate Card */}
        <main className="relative z-20 max-w-lg mx-auto w-full px-4 py-10 flex-1 flex items-center justify-center">
          <div className="w-full bg-white border border-gray-200/90 rounded-3xl p-8 sm:p-10 shadow-2xl shadow-blue-500/10 text-center">
            
            {/* Animated Icon Badge */}
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-[#0096FF] to-blue-600 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-500/25 text-white">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2">
              {isEn ? "Enter Classroom" : "Pumasok sa Silid-Aralan"}
            </h1>
            <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto leading-relaxed">
              {isEn
                ? "Enter your Teacher's 6-Digit PIN and your Name to unlock today's assigned reading assessment."
                : "Ilagay ang 6-Digit PIN mula sa iyong guro at ang iyong pangalan upang buksan ang pagsusulit sa pagbasa."}
            </p>

            {gateError && (
              <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-600 text-sm font-semibold flex items-center gap-3 text-left">
                <svg className="w-5 h-5 flex-shrink-0 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{gateError}</span>
              </div>
            )}

            <form onSubmit={handleVerifyAndEnter} className="space-y-5 text-left">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-2">
                  {isEn ? "Classroom 6-Digit PIN" : "6-Digit PIN ng Silid-Aralan"}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    pattern="[0-9]*"
                    inputMode="numeric"
                    value={pinInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                      setPinInput(val);
                      if (gateError) setGateError('');
                    }}
                    placeholder="e.g. 849201"
                    className="w-full text-center tracking-[0.35em] font-mono text-2xl font-black px-4 py-3.5 bg-gray-50 border-2 border-gray-300 rounded-2xl text-slate-900 placeholder-gray-300 focus:outline-none focus:border-[#0096FF] focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all shadow-inner"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5 text-center">
                  {isEn ? "Ask your teacher for today's active 6-digit PIN." : "Hingin sa iyong guro ang aktibong 6-digit PIN para sa araw na ito."}
                </p>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-2">
                  {isEn ? "Student Full Name" : "Buong Pangalan ng Mag-aaral"}
                </label>
                <input
                  type="text"
                  required
                  value={gateStudentName}
                  onChange={(e) => {
                    setGateStudentName(e.target.value);
                    if (gateError) setGateError('');
                  }}
                  placeholder={isEn ? "e.g. Juan Dela Cruz" : "hal. Juan Dela Cruz"}
                  className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-300 rounded-2xl text-slate-900 placeholder-gray-400 focus:outline-none focus:border-[#0096FF] focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all text-base font-semibold"
                />
              </div>

              <button
                type="submit"
                disabled={isVerifying || pinInput.length < 6 || !gateStudentName.trim()}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-[#0096FF] hover:from-blue-700 hover:to-blue-600 text-white font-extrabold rounded-2xl shadow-xl shadow-blue-500/25 flex items-center justify-center gap-2 text-base transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none mt-2"
              >
                {isVerifying ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>{isEn ? "Verifying PIN..." : "Sinusuri ang PIN..."}</span>
                  </>
                ) : (
                  <>
                    <span>{isEn ? "Enter Classroom" : "Pumasok sa Silid-Aralan"}</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>
            </form>

          </div>
        </main>

        {/* Footer */}
        <footer className="relative z-20 py-4 text-center text-xs text-gray-500 border-t border-gray-200">
          ReadFil Classroom Reading Evaluation &bull; Teacher Gate Protection
        </footer>
      </div>
    );
  }

  // Loading Screen
  if (isLoadingPassages) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 border-4 border-[#0096FF] border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-xl font-bold text-slate-900">
          {isEn ? "Fetching classroom reading assignment from teacher..." : "Kinukuha ang takdang talata mula sa guro..."}
        </h2>
        <p className="text-gray-500 text-sm mt-1">Connecting to Classroom Assessment Service</p>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: CLASSROOM WAITING ROOM (TEACHER HAS NO ACTIVE PASSAGES YET)
  // -------------------------------------------------------------
  if (isGateUnlocked && (!activePassage || passagesList.length === 0)) {
    return (
      <div className="min-h-screen bg-slate-50/70 text-slate-900 font-sans relative overflow-x-hidden flex flex-col justify-between">
        <SoundWaveBackground opacity={0.08} />

        {/* Top Header */}
        <header className="relative z-20 border-b border-gray-200/80 bg-white/80 backdrop-blur-md px-6 sm:px-12 py-4 flex justify-between items-center shadow-sm">
          <div className="flex items-center space-x-3">
            <Link to="/" className="text-2xl font-black text-[#0096FF] tracking-tight hover:opacity-90">
              ReadFil
            </Link>
            <span className="text-xs uppercase px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold tracking-wider">
              {isEn ? "Classroom Mode" : "Modo ng Silid-Aralan"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{isEn ? "Room Connected" : "Konektado sa Silid"}</span>
            </div>
            <button
              onClick={handleLeaveRoom}
              className="text-xs uppercase font-bold text-gray-500 hover:text-red-600 px-3.5 py-1.5 rounded-xl border border-gray-200 hover:border-red-200 bg-white transition-all shadow-sm flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {isEn ? "Leave Room" : "Lumabas"}
            </button>
          </div>
        </header>

        {/* Center Card */}
        <main className="relative z-20 max-w-xl mx-auto w-full px-4 py-8 flex-1 flex items-center justify-center">
          <div className="w-full bg-white border border-gray-200/90 rounded-3xl p-8 sm:p-10 shadow-2xl shadow-blue-500/10 text-center">
            
            {/* Teacher & Room Pill */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-200/80 text-xs font-bold text-blue-900 mb-6 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping"></span>
              <span>
                {isEn ? "Teacher:" : "Guro:"} {gateTeacher?.name || 'Assigned Teacher'}
              </span>
              <span className="text-blue-300">•</span>
              <span className="font-mono text-blue-600 font-black">
                PIN: {sessionStorage.getItem('readfil_classroom_pin') || pinInput}
              </span>
            </div>

            {/* Waiting Icon / Visual Badge */}
            <div className="w-20 h-20 rounded-3xl bg-amber-50 border-2 border-amber-200 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-amber-500/10 text-amber-500">
              <svg className="w-10 h-10 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-3">
              {isEn ? "No Reading Passage Assigned Yet" : "Walang Babasahin sa Kasalukuyan"}
            </h1>

            <p className="text-gray-600 text-sm sm:text-base mb-6 max-w-md mx-auto leading-relaxed">
              {isEn ? (
                <>
                  Hello <strong className="text-slate-900">{studentName || 'Student'}</strong>! You are in{" "}
                  <strong className="text-[#0096FF]">{gateTeacher?.name || 'your teacher'}</strong>&apos;s classroom. Your teacher has not selected or activated a reading passage yet.
                </>
              ) : (
                <>
                  Kumusta <strong className="text-slate-900">{studentName || 'Mag-aaral'}</strong>! Nasa silid-aralan ka na ni{" "}
                  <strong className="text-[#0096FF]">{gateTeacher?.name || 'iyong guro'}</strong>. Wala pang napiling aktibong babasahin ang iyong guro sa ngayon.
                </>
              )}
            </p>

            {/* Waiting status pill */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 mb-6 text-xs text-slate-600 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
                <span>
                  {isEn
                    ? "Waiting for teacher to activate a passage..."
                    : "Naghihintay sa guro na magtalaga ng babasahin..."}
                </span>
              </div>
              <span className="text-[11px] text-gray-400 font-mono">
                {lastSyncTime
                  ? `${isEn ? 'Checked' : 'Sinuri'}: ${lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                  : (isEn ? 'Auto-syncing' : 'Kusang sumusuri')}
              </span>
            </div>

            {passageError && (
              <div className="mb-6 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-semibold text-left">
                {passageError}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={() => loadPassages(true)}
                disabled={isRefreshing}
                className="flex-1 py-3.5 px-6 bg-gradient-to-r from-blue-600 to-[#0096FF] hover:from-blue-700 hover:to-blue-600 text-white font-extrabold rounded-2xl shadow-xl shadow-blue-500/25 flex items-center justify-center gap-2 text-sm transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
              >
                <svg
                  className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>
                  {isRefreshing
                    ? (isEn ? "Checking..." : "Sinusuri...")
                    : (isEn ? "Refresh / Check Again" : "Suriin Muli")}
                </span>
              </button>

              <button
                type="button"
                onClick={handleLeaveRoom}
                className="py-3.5 px-6 bg-gray-100 hover:bg-gray-200 text-slate-700 font-bold rounded-2xl border border-gray-200 transition-all text-sm"
              >
                {isEn ? "Leave Classroom" : "Lumabas sa Silid"}
              </button>
            </div>

            <p className="text-[11px] text-gray-400 mt-4">
              {isEn
                ? "This page automatically re-checks every few seconds. Once your teacher assigns a passage, it will appear here immediately."
                : "Kusang sumusuri ang pahinang ito tuwing ilang segundo. Kapag nagtalaga na ang iyong guro, awtomatiko itong lalabas dito."}
            </p>

          </div>
        </main>

        {/* Footer */}
        <footer className="relative z-20 py-4 text-center text-xs text-gray-500 border-t border-gray-200">
          ReadFil Classroom Reading Evaluation &bull; Connected to {gateTeacher?.name || 'Teacher'}
        </footer>
      </div>
    );
  }

  // General Error Screen (if not in waiting room)
  if (passageError) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white border border-red-200 p-8 rounded-3xl max-w-lg shadow-xl shadow-red-50/50">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-3">
            {isEn ? "Assessment Error" : "May Suliranin sa Pagsusulit"}
          </h2>
          <p className="text-gray-600 mb-6 text-base leading-relaxed">
            {passageError}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => loadPassages(true)} className="px-6 py-3 bg-[#0096FF] text-white font-bold rounded-2xl hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/25">
              {isEn ? "Retry" : "Subukan Muli"}
            </button>
            <button onClick={handleLeaveRoom} className="px-6 py-3 bg-gray-100 text-slate-800 font-bold rounded-2xl hover:bg-gray-200 transition-colors border border-gray-200">
              {isEn ? "Back to Gate" : "Bumalik sa Pinto"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Timer Color logic
  const timerPercentage = totalTimerDuration > 0 ? (timeLeft / totalTimerDuration) * 100 : 0;
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
          {passagesList.length > 1 && (
            <span className="hidden sm:inline-flex text-xs font-bold text-slate-700 bg-gray-100 border border-gray-200 px-3 py-0.5 rounded-full">
              {isEn ? `Passage ${currentIndex + 1} of ${passagesList.length}` : `Talata ${currentIndex + 1} sa ${passagesList.length}`}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          {gateTeacher?.name && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-800">
              <span className="text-[10px] text-gray-500 uppercase">{isEn ? "Teacher:" : "Guro:"}</span>
              <span className="font-bold">{gateTeacher.name}</span>
            </div>
          )}
          {pinInput && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gray-100 border border-gray-200 text-xs font-mono font-bold text-gray-700">
              <span className="text-[10px] text-gray-400 font-sans uppercase">PIN:</span>
              <span className="tracking-wider">{pinInput}</span>
            </div>
          )}
          <button
            onClick={() => { setTempName(studentName); setIsNameModalOpen(true); }}
            className="flex items-center space-x-2 text-sm bg-white hover:bg-gray-50 px-3.5 py-1.5 rounded-full border border-gray-200 shadow-sm transition-colors"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-gray-500 font-medium">{isEn ? "Student:" : "Mag-aaral:"}</span>
            <span className="font-bold text-slate-800 truncate max-w-[130px]">{studentName || (isEn ? "Set Name" : "Magtakda ng Pangalan")}</span>
          </button>

          <button
            onClick={handleLeaveRoom}
            className="text-xs uppercase font-bold text-red-600 hover:text-white hover:bg-red-600 px-3 py-1.5 rounded-lg border border-red-200 transition-all shadow-sm"
          >
            {isEn ? "Leave Room" : "Lumabas"}
          </button>
        </div>
      </header>

      {/* Main Reading Container */}
      <main className="relative z-20 max-w-4xl mx-auto px-4 sm:px-6 pt-6 pb-28 sm:pb-36">
        
        {/* Multi-Passage Sequence Progress Bar */}
        {passagesList.length > 1 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                {isEn ? "Assessment Progress:" : "Progreso sa Pagsusulit:"}
              </span>
              <span className="text-sm font-extrabold text-[#0096FF]">
                {currentIndex + 1} / {passagesList.length}
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {passagesList.map((p, idx) => {
                const isDone = idx < currentIndex;
                const isCurrent = idx === currentIndex;
                return (
                  <div
                    key={p.id || idx}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                      isDone
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : isCurrent
                        ? 'bg-blue-50 text-[#0096FF] border border-blue-200 ring-2 ring-blue-500/20'
                        : 'bg-gray-50 text-gray-400 border border-gray-200'
                    }`}
                  >
                    <span>#{idx + 1}</span>
                    <span className="truncate max-w-[90px]">{p.title}</span>
                    {isDone && (
                      <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/>
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Title Header */}
        <div className="text-center mb-8">
          <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
            <span className="text-xs font-bold text-[#0096FF] uppercase bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
              {activePassage.grade_level || "Classroom"}
            </span>
            <span className="text-xs text-gray-500 bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">
              {isEn ? "Assigned by:" : "Itinalaga ni:"} <strong className="text-slate-700">{activePassage.teacher_name || (isEn ? "Teacher" : "Guro")}</strong>
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
            {activePassage.title}
          </h1>
          <p className="text-gray-600 text-sm sm:text-base">
            {isEn ? "Read the passage aloud clearly when recording begins." : "Basahin nang malinaw ang talata kapag nagsimula na ang pagre-record."}
          </p>
        </div>

        {/* Reading Material Card - Matching Easy / Beginner UI */}
        <div className="bg-white/90 backdrop-blur-md p-5 sm:p-10 rounded-2xl sm:rounded-[2rem] shadow-xl shadow-sky-100/50 border border-white/80 mb-8 relative">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-[#0096FF]">
              {isEn ? "Reading Material" : "Materyal sa Pagbasa"}
            </h2>
            <span className="text-sm font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
              {currentIndex + 1} / {passagesList.length}
            </span>
          </div>

          <div className="p-5 pb-20 sm:p-8 sm:pb-16 bg-gray-50 rounded-xl border border-gray-200 min-h-[160px] flex flex-col items-center justify-center relative">
            {isCountingDown && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-sm rounded-xl">
                <span className="text-6xl sm:text-8xl font-black text-[#0096FF] animate-pulse">
                  {countdownValue > 0 ? countdownValue : 'Go!'}
                </span>
              </div>
            )}

            <p className={`text-xl sm:text-2xl leading-relaxed text-center font-medium text-black transition-all duration-300 ${!isRecording && !isProcessing ? 'blur-sm select-none' : ''}`}>
              "{activePassage.content}"
            </p>

            {activePassage.source && (
              <span className={`mt-6 text-sm text-gray-400 italic transition-all duration-300 ${!isRecording && !isProcessing ? 'blur-sm select-none' : ''}`}>
                {isEn ? "Source: " : "Pinagmulan: "} {activePassage.source}
              </span>
            )}

            {/* Timer pill in bottom-right matching Easy / Beginner UI */}
            <div className={`absolute bottom-4 right-6 flex items-center gap-2 font-mono font-bold bg-white px-3.5 py-1.5 rounded-full border shadow-sm text-sm transition-all ${
              isTimeCritical && isRecording
                ? 'border-red-300 text-red-600 animate-pulse'
                : 'border-gray-200 text-gray-600'
            }`}>
              <svg className={`w-4 h-4 ${isTimeCritical && isRecording ? 'text-red-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span>{timeLeft}s</span>
            </div>
          </div>
        </div>

        {/* Hidden Canvas for Visualizer Audio Processing */}
        <canvas ref={canvasRef} className="hidden" width={400} height={40} />

        {/* Mic Control - Matching Easy / Beginner UI */}
        <div className="flex flex-col items-center justify-center my-3">
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                ) : isRecording ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                )}
              </svg>
            </button>
          </div>

          <p className={`mt-4 font-bold text-lg text-center min-h-[1.75rem] transition-colors ${
            isSatisfiedCompleted
              ? 'text-emerald-600 font-extrabold animate-pulse'
              : isRecording 
              ? 'text-red-500' 
              : isProcessing 
              ? 'text-[#0096FF] animate-pulse' 
              : isCountingDown
              ? 'text-[#0096FF]'
              : isSilenceError 
              ? 'text-red-600' 
              : 'text-gray-500'
          }`}>
            {isSatisfiedCompleted
              ? (isEn ? "All words completed! Finalizing evaluation..." : "Kusang natapos ang pagbasa! Isinusumite...")
              : isRecording 
              ? (isEn ? "Reading in progress... (Auto-stops when finished)" : "Kasalukuyang nagbabasa... (Kusang hihinto pagkatapos)")
              : isProcessing 
              ? (isEn ? "Evaluating reading via ASR engine..." : "Sinusuri ng ASR engine ang iyong pagbasa...")
              : isCountingDown
              ? (isEn ? "Get ready..." : "Humanda...")
              : isSilenceError 
              ? (isEn ? "No speech detected. Click mic to try again." : "Walang boses na narinig. Pindutin muli ang mic.")
              : (isEn ? "Click the microphone to begin reading" : "Pindutin ang mikropono upang simulan ang pagbasa")}
          </p>

          {isSilenceError && (
            <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2 shadow-sm max-w-md">
              <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              <span>{isEn ? "Please speak clearly into your microphone." : "Pakisuyong magsalita nang malinaw sa mikropono."}</span>
            </div>
          )}
        </div>
      </main>

      {/* Interstitial Modal Between Passages */}
      {isBetweenPassages && lastPassageSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-200 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-200">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div className="text-xs uppercase font-extrabold tracking-wider text-emerald-600 mb-1">
              {isEn
                ? `Passage ${lastPassageSummary.index + 1} of ${passagesList.length} Complete`
                : `Natapos ang Talata ${lastPassageSummary.index + 1} sa ${passagesList.length}`}
            </div>

            <h3 className="text-2xl font-black text-slate-900 mb-4">
              {lastPassageSummary.title}
            </h3>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-3 gap-3 bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-6">
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400">Accuracy</span>
                <div className="text-xl font-black text-[#0096FF]">{Math.round(lastPassageSummary.accuracy)}%</div>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400">WCPM</span>
                <div className="text-xl font-black text-slate-800">{Math.round(lastPassageSummary.wcpm)}</div>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400">Words</span>
                <div className="text-xl font-black text-slate-800">{lastPassageSummary.correct}/{lastPassageSummary.total}</div>
              </div>
            </div>

            {/* Next Passage Preview */}
            <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 mb-6 text-left">
              <div className="text-xs font-bold text-[#0096FF] uppercase mb-1">
                {isEn ? "Up Next in Assessment Set:" : "Susunod sa Pagsusulit:"}
              </div>
              <div className="text-base font-bold text-slate-900">
                {lastPassageSummary.nextTitle}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {isEn ? `Timer limit: ${lastPassageSummary.nextTimer} seconds` : `Takdang oras: ${lastPassageSummary.nextTimer} segundo`}
              </div>
            </div>

            {/* Hands-Free Auto-Advance Countdown Notice */}
            <div className="flex items-center justify-center gap-2 mb-5 text-sm font-bold text-[#0096FF] bg-blue-50 px-4 py-2.5 rounded-2xl border border-blue-200 shadow-sm animate-pulse">
              <svg className="w-4 h-4 animate-spin text-[#0096FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>
                {isEn
                  ? `Auto-advancing to next passage in ${autoAdvanceCountdown}s...`
                  : `Kusang lilipat sa susunod na talata sa loob ng ${autoAdvanceCountdown}s...`}
              </span>
            </div>

            <button
              onClick={handleProceedToNextPassage}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-[#0096FF] hover:from-blue-700 hover:to-blue-600 text-white font-black text-base rounded-2xl shadow-lg shadow-blue-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <span>
                {isEn
                  ? `Proceed Now to Passage ${currentIndex + 2} of ${passagesList.length}`
                  : `Magpatuloy Agad sa Talata ${currentIndex + 2} sa ${passagesList.length}`}
              </span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>
      )}

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
