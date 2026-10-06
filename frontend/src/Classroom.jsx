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

// Calculate normalized Levenshtein distance (0.0 = identical, 1.0 = completely different)
const wordSimilarity = (w1, w2) => {
  if (!w1 || !w2) return 1.0;
  if (w1 === w2) return 0.0;
  const len1 = w1.length;
  const len2 = w2.length;
  const dp = Array.from({ length: len1 + 1 }, () => new Int16Array(len2 + 1));
  for (let i = 0; i <= len1; i++) dp[i][0] = i;
  for (let j = 0; j <= len2; j++) dp[0][j] = j;
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = w1[i - 1] === w2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 0.0 : dp[len1][len2] / maxLen;
};

// Needleman-Wunsch Alignment (NWA) - Global Sequence Alignment for Real-time Classroom Reading
const needlemanWunschAlign = (targetWords, spokenWords) => {
  const m = targetWords.length;
  const n = spokenWords.length;
  if (m === 0 || n === 0) {
    return {
      lastWordAligned: false,
      lastWordMatched: false,
      alignedMatches: 0,
      totalTarget: m,
      alignRatio: 0,
      targetToSpoken: {}
    };
  }

  const MATCH = 5.0;
  const MISMATCH = -2.0;
  const GAP = -2.0;

  const score = Array.from({ length: m + 1 }, () => new Float32Array(n + 1));
  const pointers = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(''));

  for (let i = 0; i <= m; i++) {
    score[i][0] = GAP * i;
    pointers[i][0] = 'U';
  }
  for (let j = 0; j <= n; j++) {
    score[0][j] = GAP * j;
    pointers[0][j] = 'L';
  }
  pointers[0][0] = '';

  for (let i = 1; i <= m; i++) {
    const tWord = targetWords[i - 1];
    for (let j = 1; j <= n; j++) {
      const sWord = spokenWords[j - 1];
      let matchScore;
      if (tWord === sWord || isWordMatch(tWord, sWord)) {
        matchScore = score[i - 1][j - 1] + MATCH;
      } else {
        const dist = wordSimilarity(tWord, sWord);
        if (dist <= 0.4) {
          matchScore = score[i - 1][j - 1] + (MATCH * (1.0 - dist));
        } else {
          matchScore = score[i - 1][j - 1] + MISMATCH;
        }
      }

      const delScore = score[i - 1][j] + GAP;
      const insScore = score[i][j - 1] + GAP;

      let best = matchScore;
      let ptr = 'D';
      if (delScore > best) {
        best = delScore;
        ptr = 'U';
      }
      if (insScore > best) {
        best = insScore;
        ptr = 'L';
      }

      score[i][j] = best;
      pointers[i][j] = ptr;
    }
  }

  // Backtrack from bottom-right (m, n) to origin (0, 0)
  let i = m, j = n;
  const targetToSpoken = {};
  let alignedMatches = 0;

  while (i > 0 || j > 0) {
    const ptr = pointers[i][j];
    if (ptr === 'D') {
      const tWord = targetWords[i - 1];
      const sWord = spokenWords[j - 1];
      targetToSpoken[i - 1] = sWord;
      if (tWord === sWord || isWordMatch(tWord, sWord) || wordSimilarity(tWord, sWord) <= 0.45) {
        alignedMatches++;
      }
      i--;
      j--;
    } else if (ptr === 'U') {
      targetToSpoken[i - 1] = null;
      i--;
    } else {
      // 'L'
      j--;
    }
  }

  const lastTargetIdx = m - 1;
  const lastTargetWord = targetWords[lastTargetIdx];
  const lastSpokenAligned = targetToSpoken[lastTargetIdx];

  const recentSpoken = spokenWords.slice(-4);
  const lastWordMatchedRecent = recentSpoken.some(sWord =>
    sWord === lastTargetWord ||
    isWordMatch(lastTargetWord, sWord) ||
    wordSimilarity(lastTargetWord, sWord) <= 0.45 ||
    (lastTargetWord.length >= 3 && sWord.length >= 3 &&
      (sWord.startsWith(lastTargetWord.slice(0, 3)) || lastTargetWord.startsWith(sWord.slice(0, 3))) &&
      Math.abs(lastTargetWord.length - sWord.length) <= 3) ||
    (lastTargetWord.length >= 3 && sWord.length >= 3 &&
      (sWord.includes(lastTargetWord) || lastTargetWord.includes(sWord)))
  );

  const lastWordMatched = !!(
    (lastSpokenAligned &&
      (lastSpokenAligned === lastTargetWord ||
        isWordMatch(lastTargetWord, lastSpokenAligned) ||
        wordSimilarity(lastTargetWord, lastSpokenAligned) <= 0.45)) ||
    lastWordMatchedRecent
  );

  const alignRatio = alignedMatches / m;

  // The passage reading is completed if:
  // 1. The last target word is matched on the NWA alignment path or uttered at the end
  // 2. The student has read through a substantial part of the passage
  const isSatisfied = lastWordMatched && (
    m <= 2 ? (alignedMatches >= Math.max(1, m)) :
      m <= 5 ? (alignedMatches >= Math.max(2, m - 2)) :
        m <= 10 ? (alignRatio >= 0.50 || spokenWords.length >= Math.max(2, m - 3)) :
          (alignRatio >= 0.45 || spokenWords.length >= Math.floor(m * 0.45))
  );

  return {
    lastWordAligned: isSatisfied,
    lastWordMatched,
    alignedMatches,
    totalTarget: m,
    alignRatio,
    targetToSpoken
  };
};

// Dedicated checker: Checks if the last word of target passage matches or at least matches a bit
const checkLastWordMatch = (targetWords, spokenWords, alignRatio = 0) => {
  if (!targetWords || targetWords.length === 0 || !spokenWords || spokenWords.length === 0) {
    return false;
  }
  const m = targetWords.length;
  const n = spokenWords.length;
  const lastTarget = targetWords[m - 1];
  if (!lastTarget) return false;

  // The reader must have progressed into the passage before matching the last word
  const minSpokenCount = m <= 3 ? 1 : m <= 10 ? Math.max(2, Math.floor(m * 0.4)) : Math.max(4, Math.floor(m * 0.35));
  if (n < minSpokenCount && alignRatio < 0.25) {
    return false;
  }

  // Inspect the trailing spoken words (up to last 4 words)
  const candidateSpoken = spokenWords.slice(-4);
  for (const sWord of candidateSpoken) {
    if (!sWord) continue;
    if (sWord === lastTarget) return true;
    if (isWordMatch(lastTarget, sWord)) return true;

    // Fuzzy similarity (Levenshtein distance <= 0.45, or distance <= 2 for words >= 4)
    if (wordSimilarity(lastTarget, sWord) <= 0.45) return true;

    // Substring or prefix match for words >= 3 characters (e.g., "bata" vs "batang", "araw" vs "kaarawan")
    if (lastTarget.length >= 3 && sWord.length >= 3) {
      if (sWord.startsWith(lastTarget.slice(0, 3)) || lastTarget.startsWith(sWord.slice(0, 3))) {
        if (Math.abs(lastTarget.length - sWord.length) <= 3) return true;
      }
      if (sWord.includes(lastTarget) || lastTarget.includes(sWord)) return true;
    }
  }

  return false;
};

// Play gentle completion chime on auto-stop so student is immediately notified
const playCompletionChime = () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Note 1: C5 (523.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.22);

    // Note 2: E5 (659.25 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, now + 0.10);
    gain2.gain.setValueAtTime(0.15, now + 0.10);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.10);
    osc2.stop(now + 0.35);
  } catch (e) {
    console.warn("Could not play completion chime:", e);
  }
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
  const isShort = targetWords.length <= 10;
  // Must reach the actual end of the text
  const reachedEnd = isShort
    ? targetIdx >= targetWords.length
    : targetIdx >= Math.max(1, targetWords.length - 2);

  // Satisfied strictly when reaching the end of the passage:
  // Short passage (<= 10 words): must reach end AND bestRatio >= 0.75
  // Long passage (> 10 words): must reach near end AND bestRatio >= 0.80
  const satisfied = isShort
    ? (reachedEnd && bestRatio >= 0.75)
    : (reachedEnd && bestRatio >= 0.80);

  return {
    satisfied,
    matchCount: Math.max(matchCount, bagMatchCount),
    totalTarget: targetWords.length,
    matchRatio: bestRatio
  };
};

// Gets passage duration: strictly respects teacher's configured timer from database
const getSafePassageDuration = (passage) => {
  if (!passage) return 60;
  const savedTimer = parseInt(passage.timer_seconds, 10);
  if (savedTimer && savedTimer > 0) {
    return savedTimer;
  }
  const content = passage.content || passage.text || '';
  const wordCount = tokenizeWords(content).length;
  return Math.max(20, Math.ceil(wordCount * 2.5));
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
  const [classroomSettings, setClassroomSettings] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('readfil_classroom_settings')) || null;
    } catch {
      return null;
    }
  });
  const [isPinResetModalOpen, setIsPinResetModalOpen] = useState(false);
  const [pinResetMessage, setPinResetMessage] = useState('');

  // Student Info State (for in-room assessment)
  const [studentName, setStudentName] = useState(() => {
    return localStorage.getItem('user_firstName') || '';
  });
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
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
  const lastWordSpokenTimeRef = useRef(null);
  const highestMatchRatioRef = useRef(0);
  const recognizedWordsCountRef = useRef(0);
  const soundDetectedRef = useRef(false);
  const speechDurationMsRef = useRef(0);
  const hasTriggeredAutoStopRef = useRef(false);
  const silenceCheckIntervalRef = useRef(null);
  const lastSpeechMatchRatioRef = useRef(0);
  const isSatisfiedRef = useRef(false);
  const lastWordMatchedRef = useRef(false);
  const endTimeRef = useRef(null);
  const noiseFloorRef = useRef(0.02);
  const hasSpokenRef = useRef(false);

  // Multi-Passage Execution Refs to eliminate stale closures in intervals & async transitions
  const currentIndexRef = useRef(0);
  const activePassageRef = useRef(null);
  const passagesListRef = useRef([]);
  const evalResultsRef = useRef([]);
  const isBetweenPassagesRef = useRef(false);
  const isCountingDownRef = useRef(false);
  const isProcessingRef = useRef(false);
  const totalTimerDurationRef = useRef(60);

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

  // Single-Line Multi-Passage Automatic Horizontal Sliding Refs & Bounds
  const passageScrollContainerRef = useRef(null);
  const activePillRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollBounds = () => {
    const el = passageScrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
  };

  // Automatically slide the single-line track so the active passage is always centered & visible
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activePillRef.current && passageScrollContainerRef.current) {
        activePillRef.current.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest'
        });
      }
      checkScrollBounds();
    }, 100);
    return () => clearTimeout(timer);
  }, [currentIndex, passagesList.length]);

  useEffect(() => {
    const el = passageScrollContainerRef.current;
    if (el) {
      el.addEventListener('scroll', checkScrollBounds, { passive: true });
      window.addEventListener('resize', checkScrollBounds);
      checkScrollBounds();
      return () => {
        el.removeEventListener('scroll', checkScrollBounds);
        window.removeEventListener('resize', checkScrollBounds);
      };
    }
  }, [passagesList.length]);

  const handleManualSlide = (direction) => {
    if (!passageScrollContainerRef.current) return;
    const scrollAmount = 260;
    passageScrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
    setTimeout(checkScrollBounds, 350);
  };


  // Strictly terminate and kick out device if teacher regenerated/reset the PIN
  const handleStrictLogoutPinReset = (msg) => {
    isRecordingRef.current = false;
    isCountingDownRef.current = false;
    isBetweenPassagesRef.current = false;
    isProcessingRef.current = false;
    currentIndexRef.current = 0;
    activePassageRef.current = null;
    passagesListRef.current = [];
    evalResultsRef.current = [];

    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) { }
    }
    if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    if (autoStopTimeoutRef.current) clearTimeout(autoStopTimeoutRef.current);
    if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
    if (silenceCheckIntervalRef.current) clearInterval(silenceCheckIntervalRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }

    sessionStorage.removeItem('readfil_classroom_unlocked');
    sessionStorage.removeItem('readfil_classroom_pin');
    sessionStorage.removeItem('readfil_classroom_teacher');
    sessionStorage.removeItem('readfil_classroom_teacher_id');
    sessionStorage.removeItem('readfil_classroom_settings');

    setIsGateUnlocked(false);
    setGateTeacher(null);
    setClassroomSettings(null);
    setPassagesList([]);
    setActivePassage(null);
    setPinInput('');
    setIsBetweenPassages(false);
    setIsProcessing(false);
    setIsCountingDown(false);

    setPinResetMessage(msg || (isEn
      ? "The teacher has generated a new Classroom PIN. All devices connected to the previous PIN have been strictly logged out. Please request the new PIN from your teacher."
      : "Bumuo ang guro ng bagong Classroom PIN. Lahat ng kagamitang nakakonekta sa lumang PIN ay sapilitang inilabas. Hingin sa iyong guro ang bagong PIN."));
    setIsPinResetModalOpen(true);
  };

  // 1. Fetch Active Passages from Teacher
  const loadPassages = async (manual = false) => {
    // If student is currently reading or assessment has progressed, abort reload so we never clobber an active assessment!
    if (currentIndexRef.current > 0 || evalResultsRef.current.length > 0 || isRecordingRef.current) {
      if (manual) setIsRefreshing(false);
      return;
    }

    const teacherId = gateTeacher?.id || sessionStorage.getItem('readfil_classroom_teacher_id');
    const storedPin = sessionStorage.getItem('readfil_classroom_pin');
    if (!teacherId) return;

    if (manual) setIsRefreshing(true);
    try {
      const pinParam = storedPin ? `&pin=${encodeURIComponent(storedPin)}` : '';
      const res = await fetch(`${API_BASE}/api/classroom/active-passages?teacher_id=${teacherId}${pinParam}`);
      if (res.status === 403) {
        const errData = await res.json();
        handleStrictLogoutPinReset(errData.error);
        return;
      }
      if (!res.ok) {
        throw new Error(isEn
          ? "Could not reach classroom assessment service."
          : "Hindi maabot ang serbisyo ng silid-aralan."
        );
      }
      const data = await res.json();
      if (data.pin_invalidated) {
        handleStrictLogoutPinReset(data.error);
        return;
      }
      let list = (data.passages && data.passages.length > 0) ? data.passages : [];

      if (data.settings) {
        sessionStorage.setItem('readfil_classroom_settings', JSON.stringify(data.settings));
        localStorage.setItem('readfil_auto_send_email', data.settings.auto_send_email ? 'true' : 'false');
        setClassroomSettings(data.settings);
        if (data.settings.shuffle_passages && list.length > 1 && evalResultsRef.current.length === 0 && !isRecordingRef.current) {
          list = [...list].sort(() => Math.random() - 0.5);
        }
      }

      setPassagesList(list);
      passagesListRef.current = list;
      setLastSyncTime(new Date());

      if (list.length > 0) {
        currentIndexRef.current = 0;
        setCurrentIndex(0);
        activePassageRef.current = list[0];
        setActivePassage(list[0]);
        const duration = getSafePassageDuration(list[0]);
        totalTimerDurationRef.current = duration;
        setTotalTimerDuration(duration);
        setTimeLeft(duration);
        setPassageError(null);
      } else {
        activePassageRef.current = null;
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
    // If arriving from Results with "Test Again (New Student)", force a fresh student name prompt
    if (sessionStorage.getItem('classroom_prompt_new_student') === 'true') {
      sessionStorage.removeItem('classroom_prompt_new_student');
      setStudentName('');
      setGateStudentName('');
      setTempName('');
      localStorage.removeItem('user_firstName');
      localStorage.removeItem('user_lastName');
      setIsNameModalOpen(true);
      currentIndexRef.current = 0;
      setCurrentIndex(0);
      evalResultsRef.current = [];
      setEvalResults([]);
      isBetweenPassagesRef.current = false;
      setIsBetweenPassages(false);
      setLastPassageSummary(null);
      if (passagesListRef.current.length > 0) {
        const first = passagesListRef.current[0];
        activePassageRef.current = first;
        setActivePassage(first);
        const duration = getSafePassageDuration(first);
        totalTimerDurationRef.current = duration;
        setTotalTimerDuration(duration);
        setTimeLeft(duration);
      }
    }

    if (!isGateUnlocked) {
      setIsLoadingPassages(false);
      return;
    }
    // Only load if passagesList is not yet populated
    if (passagesListRef.current.length === 0) {
      loadPassages(false);
    }
  }, [isGateUnlocked]);

  // 1b. Real-time background sync & strict PIN invalidation heartbeat
  useEffect(() => {
    if (!isGateUnlocked) return;

    const interval = setInterval(async () => {
      const teacherId = gateTeacher?.id || sessionStorage.getItem('readfil_classroom_teacher_id');
      const storedPin = sessionStorage.getItem('readfil_classroom_pin');

      if (!teacherId || !storedPin) {
        handleStrictLogoutPinReset();
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/classroom/verify-session?teacher_id=${teacherId}&pin=${encodeURIComponent(storedPin)}`);
        if (res.status === 403) {
          const data = await res.json();
          handleStrictLogoutPinReset(data.error);
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (data.pin_invalidated || !data.valid) {
            handleStrictLogoutPinReset(data.error);
            return;
          }
          if (data.settings) {
            sessionStorage.setItem('readfil_classroom_settings', JSON.stringify(data.settings));
            setClassroomSettings(data.settings);
          }

          // CRITICAL FIX: NEVER overwrite activePassage or passagesList during test execution!
          // Heartbeat verifies PIN validity. It must NEVER reset or revert passages once an assessment
          // has started, countdown is active, review is showing, or student has advanced to Passage 2+!
          const isAssessmentActiveOrAdvanced =
            isRecordingRef.current ||
            isCountingDownRef.current ||
            isBetweenPassagesRef.current ||
            isProcessingRef.current ||
            evalResultsRef.current.length > 0 ||
            currentIndexRef.current > 0;

          // Only sync initial passages if the student currently has ZERO passages loaded (waiting room)
          if (passagesListRef.current.length === 0 && !isAssessmentActiveOrAdvanced) {
            if (Array.isArray(data.passages) && data.passages.length > 0) {
              let list = data.passages;
              if (data.settings?.shuffle_passages && list.length > 1) {
                list = [...list].sort(() => Math.random() - 0.5);
              }
              passagesListRef.current = list;
              setPassagesList(list);
              currentIndexRef.current = 0;
              setCurrentIndex(0);
              activePassageRef.current = list[0];
              setActivePassage(list[0]);
              const duration = getSafePassageDuration(list[0]);
              totalTimerDurationRef.current = duration;
              setTotalTimerDuration(duration);
              setTimeLeft(duration);
              setPassageError(null);
            }
          }
        }
      } catch (err) {
        // tolerate momentary network disconnect
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isGateUnlocked, gateTeacher]);

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

      let list = (data.passages && data.passages.length > 0) ? data.passages : [];

      if (data.settings) {
        sessionStorage.setItem('readfil_classroom_settings', JSON.stringify(data.settings));
        localStorage.setItem('readfil_auto_send_email', data.settings.auto_send_email ? 'true' : 'false');
        setClassroomSettings(data.settings);
        if (data.settings.shuffle_passages && list.length > 1) {
          list = [...list].sort(() => Math.random() - 0.5);
        }
      }

      // Save verified session for this teacher exclusively
      sessionStorage.setItem('readfil_classroom_unlocked', 'true');
      sessionStorage.setItem('readfil_classroom_pin', cleanPin);
      sessionStorage.setItem('readfil_classroom_teacher', JSON.stringify(data.teacher));
      sessionStorage.setItem('readfil_classroom_teacher_id', data.teacher.id.toString());
      if (data.teacher?.email) {
        sessionStorage.setItem('readfil_classroom_teacher_email', data.teacher.email);
        localStorage.setItem('readfil_classroom_teacher_email', data.teacher.email);
        localStorage.setItem('user_email', data.teacher.email);
      }
      localStorage.setItem('user_firstName', cleanName);

      setStudentName(cleanName);
      setGateTeacher(data.teacher);
      passagesListRef.current = list;
      setPassagesList(list);
      setIsGateUnlocked(true);
      setLastSyncTime(new Date());
      setGateError('');

      if (list.length > 0) {
        const rawG = list[0]?.grade_level || '';
        const gNum = parseInt(String(rawG).replace(/\D/g, ''), 10);
        let sLevel = "Elementary";
        if (!isNaN(gNum)) {
          sLevel = gNum >= 7 ? "High School" : "Elementary";
        } else if (String(rawG).toLowerCase().includes('high') || String(rawG).toLowerCase().includes('expert')) {
          sLevel = "High School";
        }
        sessionStorage.setItem('readfil_classroom_school_level', sLevel);
        localStorage.setItem('classroom_school_level', sLevel);

        currentIndexRef.current = 0;
        setCurrentIndex(0);
        activePassageRef.current = list[0];
        setActivePassage(list[0]);
        const duration = getSafePassageDuration(list[0]);
        totalTimerDurationRef.current = duration;
        setTotalTimerDuration(duration);
        setTimeLeft(duration);
        setPassageError(null);
      } else {
        activePassageRef.current = null;
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
    setIsLeaveModalOpen(true);
  };

  const confirmLeaveRoom = () => {
    setIsLeaveModalOpen(false);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    isRecordingRef.current = false;
    isCountingDownRef.current = false;
    isBetweenPassagesRef.current = false;
    isProcessingRef.current = false;
    currentIndexRef.current = 0;
    activePassageRef.current = null;
    passagesListRef.current = [];
    evalResultsRef.current = [];

    setIsRecording(false);
    sessionStorage.removeItem('readfil_classroom_unlocked');
    sessionStorage.removeItem('readfil_classroom_pin');
    sessionStorage.removeItem('readfil_classroom_teacher');
    sessionStorage.removeItem('readfil_classroom_teacher_id');
    sessionStorage.removeItem('readfil_classroom_settings');
    setIsGateUnlocked(false);
    setGateTeacher(null);
    setClassroomSettings(null);
    setPassagesList([]);
    setActivePassage(null);
    setGateError('');
    setPassageError(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      isCountingDownRef.current = false;
      isBetweenPassagesRef.current = false;
      isProcessingRef.current = false;
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      if (autoStopTimeoutRef.current) clearTimeout(autoStopTimeoutRef.current);
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
      if (silenceCheckIntervalRef.current) clearInterval(silenceCheckIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) { }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Hands-free auto-advance countdown between assessment passages (respects teacher settings)
  useEffect(() => {
    const isAuto = classroomSettings ? classroomSettings.auto_continue === true : false;
    if (!isAuto) {
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
      setAutoAdvanceCountdown(0);
      return;
    }

    if (isBetweenPassages && autoAdvanceCountdown > 0) {
      autoAdvanceTimerRef.current = setTimeout(() => {
        setAutoAdvanceCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(autoAdvanceTimerRef.current);
    } else if (isBetweenPassages && autoAdvanceCountdown === 0 && lastPassageSummary) {
      handleProceedToNextPassage();
    }
  }, [isBetweenPassages, autoAdvanceCountdown, lastPassageSummary, classroomSettings]);

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

  // Smart Hands-Free Auto-Stop Trigger (with acoustic capture margin so final letter is never cut)
  const triggerAutoStop = (reason = "completed", delayMs = 450) => {
    if (hasTriggeredAutoStopRef.current || !isRecordingRef.current) return;
    hasTriggeredAutoStopRef.current = true;
    isSatisfiedRef.current = true;
    setIsSatisfiedCompleted(true);
    if (!endTimeRef.current) {
      endTimeRef.current = Date.now();
    }
    console.log(`[AUTO-STOP TRIGGERED] Reason: ${reason}. Finalizing audio with safe acoustic margin (${delayMs}ms)...`);

    // Play completion chime so student has instant audible notification that they are done
    playCompletionChime();

    // Immediately stop and freeze the countdown timer so no extra seconds tick away
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (delayMs <= 0) {
      if (isRecordingRef.current) {
        stopRecording();
      }
    } else {
      if (autoStopTimeoutRef.current) clearTimeout(autoStopTimeoutRef.current);
      autoStopTimeoutRef.current = setTimeout(() => {
        if (isRecordingRef.current) {
          stopRecording();
        }
      }, delayMs);
    }
  };

  // 2. Start Assessment Recording for Current Passage
  const startRecording = async () => {
    if (!studentName.trim()) {
      setIsNameModalOpen(true);
      return;
    }

    const currentPassage = activePassageRef.current || activePassage;
    if (!currentPassage) return;

    try {
      setIsSilenceError(false);
      setIsSatisfiedCompleted(false);
      audioChunksRef.current = [];
      lastSoundTimeRef.current = Date.now();
      lastWordSpokenTimeRef.current = null;
      highestMatchRatioRef.current = 0;
      recognizedWordsCountRef.current = 0;
      soundDetectedRef.current = false;
      hasSpokenRef.current = false;
      speechDurationMsRef.current = 0;
      hasTriggeredAutoStopRef.current = false;
      lastSpeechMatchRatioRef.current = 0;
      isSatisfiedRef.current = false;
      lastWordMatchedRef.current = false;
      noiseFloorRef.current = 0.02;
      endTimeRef.current = null;
      isRecordingRef.current = true;
      isCountingDownRef.current = false;

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

      // Live Speech Recognition: Auto-stops as soon as last word aligns on NWA
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch (e) { }
          }
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          // Set to 'fil-PH' by default for Chrome on Windows
          recognition.lang = 'fil-PH';

          recognition.onresult = (event) => {
            if (hasTriggeredAutoStopRef.current || !isRecordingRef.current) return;

            let finalTranscript = '';
            let interimTranscript = '';
            for (let i = 0; i < event.results.length; i++) {
              const piece = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                finalTranscript += piece + ' ';
              } else {
                interimTranscript += piece + ' ';
              }
            }

            const totalSpoken = (finalTranscript + ' ' + interimTranscript).trim();
            const passageNow = activePassageRef.current || activePassage;
            const targetWords = tokenizeWords(passageNow?.content);
            const spokenWords = tokenizeWords(totalSpoken);

            if (spokenWords.length > 0) {
              const now = Date.now();
              lastWordSpokenTimeRef.current = now;
              lastSoundTimeRef.current = now;
              hasSpokenRef.current = true;
              recognizedWordsCountRef.current = spokenWords.length;
            }

            // Execute Needleman-Wunsch Alignment (NWA)
            const nwa = needlemanWunschAlign(targetWords, spokenWords);
            lastSpeechMatchRatioRef.current = nwa.alignRatio;
            if (nwa.alignRatio > highestMatchRatioRef.current) {
              highestMatchRatioRef.current = nwa.alignRatio;
            }

            // Dedicated checker: Check if last word of target passage matches or at least matches a bit
            const lastWordHit = checkLastWordMatch(targetWords, spokenWords, nwa.alignRatio);
            if (lastWordHit || nwa.lastWordMatched || nwa.lastWordAligned) {
              lastWordMatchedRef.current = true;
              isSatisfiedRef.current = true;
            }

            // Secondary live satisfaction fallback matching Easy / Beginner UI
            const check = checkWordsSatisfied(passageNow?.content, totalSpoken);
            if (check.matchRatio > highestMatchRatioRef.current) {
              highestMatchRatioRef.current = check.matchRatio;
            }
            if (check.satisfied) {
              lastWordMatchedRef.current = true;
              isSatisfiedRef.current = true;
            }
          };

          recognition.onerror = (e) => {
            console.warn("[SpeechRecognition] event error:", e.error);
            // Fallback gracefully if fil-PH is not available on non-Chrome browsers
            if (e.error === 'language-not-supported' && recognition.lang === 'fil-PH') {
              try {
                recognition.lang = 'tl-PH';
                recognition.start();
              } catch (err) { }
            }
          };

          recognition.onend = () => {
            if (isRecordingRef.current && !hasTriggeredAutoStopRef.current) {
              try {
                recognition.start();
              } catch (err) { }
            }
          };

          recognition.start();
          recognitionRef.current = recognition;
        } catch (e) {
          console.warn("SpeechRecognition init error, using duration timer:", e);
        }
      }

      // High-Frequency Voice Activity & Silence Detection (checks every 60ms)
      if (silenceCheckIntervalRef.current) clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = setInterval(() => {
        if (!isRecordingRef.current || hasTriggeredAutoStopRef.current) return;

        const now = Date.now();
        const recordingAgeMs = now - (startTimeRef.current || now);

        // Sample audio level
        let currentRms = 0;
        if (analyserRef.current) {
          const bufferLength = analyserRef.current.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          analyserRef.current.getByteTimeDomainData(dataArray);

          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            const val = (dataArray[i] - 128) / 128.0;
            sum += val * val;
          }
          currentRms = Math.sqrt(sum / bufferLength);

          // Calibrate ambient noise floor during initial 300ms, then use adaptive tracker
          if (recordingAgeMs < 300) {
            noiseFloorRef.current = Math.max(0.005, Math.min(0.035, currentRms * 1.1));
          } else {
            if (currentRms < noiseFloorRef.current) {
              noiseFloorRef.current = (noiseFloorRef.current * 0.95) + (currentRms * 0.05);
            } else {
              noiseFloorRef.current = (noiseFloorRef.current * 0.99) + (currentRms * 0.01);
            }
          }

          // Dynamic speech activity threshold: sensitive enough to capture quiet and normal readers (0.016 min)
          const speechThreshold = Math.max(0.016, noiseFloorRef.current * 1.5);
          if (currentRms > speechThreshold) {
            lastSoundTimeRef.current = now;
            soundDetectedRef.current = true;
            hasSpokenRef.current = true;
            speechDurationMsRef.current += 60;
          }
        }

        const passageNow = activePassageRef.current || activePassage;
        const targetWords = tokenizeWords(passageNow?.content);
        const targetCount = targetWords.length;
        const isShortPassage = targetCount <= 10;

        // Buffer: 800ms minimum recording time to allow initial microphone capture
        if (recordingAgeMs < 800) return;
        const isLastWordDone = isSatisfiedRef.current || lastWordMatchedRef.current;
        if (!isLastWordDone && recordingAgeMs < (isShortPassage ? 1200 : 2200)) return;

        const silenceElapsedMs = now - lastSoundTimeRef.current;
        const totalVoiceMs = speechDurationMsRef.current;
        const matchRatio = Math.max(lastSpeechMatchRatioRef.current, highestMatchRatioRef.current);
        const studentHasSpoken = hasSpokenRef.current || totalVoiceMs >= 100 || recognizedWordsCountRef.current > 0;

        // Case 1: Fast Auto-Stop when Last Word Matched (or matched a bit)
        // If the student uttered/matched the last word, stop much faster after brief acoustic silence (500ms)
        if (isLastWordDone && silenceElapsedMs >= 500) {
          triggerAutoStop("last_word_matched_fast", 150);
          return;
        }

        // Case 2: High overall match fallback (reader completed >= 75% of text, silence >= 1.8s)
        if (matchRatio >= 0.75 && silenceElapsedMs >= 1800) {
          triggerAutoStop("high_match_completed", 200);
          return;
        }

        // Case 3: Dead air on UNFINISHED passage (last word NOT matched, student stopped reading)
        // 5 seconds waiting before it stops
        const deadAirThreshold = 5000;
        if (studentHasSpoken && silenceElapsedMs >= deadAirThreshold) {
          triggerAutoStop("dead_air_silence_ahead", 200);
          return;
        }

        // Case 4: Initial Dead Air (Student hasn't spoken anything at all from the start)
        const initialDeadAirThreshold = 5000;
        if (!studentHasSpoken && recordingAgeMs >= initialDeadAirThreshold && silenceElapsedMs >= initialDeadAirThreshold) {
          triggerAutoStop("initial_dead_air_silence", 200);
          return;
        }
      }, 60);

      // Start Countdown Timer: Fallback limit if speech doesn't stop or is ongoing
      const passageDuration = getSafePassageDuration(currentPassage);
      totalTimerDurationRef.current = passageDuration;
      setTotalTimerDuration(passageDuration);
      setTimeLeft(passageDuration);
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
        isCountingDownRef.current = false;
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
      isCountingDownRef.current = true;
      setIsCountingDown(true);
      setCountdownValue(3);
    }
  };

  // 3. Stop Recording
  const stopRecording = () => {
    if (isProcessingRef.current) return;
    isRecordingRef.current = false;

    if (!endTimeRef.current) {
      endTimeRef.current = Date.now();
    }

    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current);
      autoStopTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) { }
      recognitionRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setIsRecording(false);
    isProcessingRef.current = true;
    setIsProcessing(true);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // 4. Send Audio to Backend for Evaluation & Logging
  const handleRecordingStopped = async () => {
    // Stop microphone tracks immediately so no residual sound is captured
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    const currentPassage = activePassageRef.current || activePassage;
    const currentIdx = currentIndexRef.current;
    const list = passagesListRef.current.length > 0 ? passagesListRef.current : passagesList;

    if (!currentPassage || audioChunksRef.current.length === 0) {
      setIsSilenceError(true);
      isProcessingRef.current = false;
      setIsProcessing(false);
      return;
    }

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const endT = endTimeRef.current || Date.now();
    const startT = startTimeRef.current || endT;
    const rawElapsed = (endT - startT) / 1000;
    // Calculate actual elapsed reading duration:
    // If student stopped reading and was caught by inactivity/silence (2.0s - 2.5s wait),
    // deduct the waiting window so their WCPM is calculated strictly on their actual speaking time!
    let elapsedSeconds;
    if (lastWordSpokenTimeRef.current && lastWordSpokenTimeRef.current > startT) {
      // True reading time from start to when last word was spoken, plus 0.45s acoustic padding for final phoneme
      const activeSpeakingTime = ((lastWordSpokenTimeRef.current - startT) / 1000) + 0.45;
      elapsedSeconds = Math.max(0.5, parseFloat(Math.min(rawElapsed, activeSpeakingTime).toFixed(2)));
    } else {
      const silenceDeduction = (!isSatisfiedRef.current && rawElapsed > 2.8) ? 2.0 : (rawElapsed > 1.2 ? 0.35 : 0);
      elapsedSeconds = Math.max(0.5, parseFloat((rawElapsed - silenceDeduction).toFixed(2)));
    }

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'classroom_assessment.webm');
      formData.append('target_text', currentPassage.content);
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
          isProcessingRef.current = false;
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
        isProcessingRef.current = false;
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

      const actualDuration = result.duration_seconds && result.duration_seconds > 0
        ? parseFloat(result.duration_seconds)
        : parseFloat(elapsedSeconds);

      const passageEvalData = {
        passage_id: currentPassage.id,
        passage_title: currentPassage.title,
        content: currentPassage.content,
        elapsedSeconds: actualDuration,
        duration_seconds: actualDuration,
        accuracy_rate: accRate,
        wcpm: readWcpm,
        composite_score: composite,
        reading_level: philIriLevel,
        correct_words: result.correct_words || 0,
        total_target_words: result.total_target_words || currentPassage.content.trim().split(/\s+/).length,
        errors_detected: result.errors_detected || 0,
        stutter_words: result.stutter_words || [],
        spoken_text: spokenTranscript,
        transcription: spokenTranscript,
        target_text: currentPassage.content,
        trace: result.trace || [],
        raw_result: result
      };

      const updatedResults = [...evalResultsRef.current, passageEvalData];
      evalResultsRef.current = updatedResults;
      setEvalResults(updatedResults);

      const hasNextPassage = currentIdx < list.length - 1;

      if (hasNextPassage) {
        // Show Interstitial Transition to next passage in set
        const nextPassage = list[currentIdx + 1];
        setLastPassageSummary({
          index: currentIdx,
          title: currentPassage.title,
          accuracy: accRate,
          wcpm: readWcpm,
          correct: passageEvalData.correct_words,
          total: passageEvalData.total_target_words,
          nextTitle: nextPassage.title,
          nextTimer: getSafePassageDuration(nextPassage)
        });
        isBetweenPassagesRef.current = true;
        setIsBetweenPassages(true);
        let currentSettings = classroomSettings;
        try {
          const stored = JSON.parse(sessionStorage.getItem('readfil_classroom_settings'));
          if (stored) currentSettings = stored;
        } catch (e) {}

        const autoContinueEnabled = currentSettings ? currentSettings.auto_continue === true : false;
        const countdownSec = Number(currentSettings?.auto_continue_countdown) || 4;
        setAutoAdvanceCountdown(autoContinueEnabled ? countdownSec : 0);
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
        const totalElapsed = parseFloat(
          updatedResults.reduce((sum, r) => sum + (r.duration_seconds || r.elapsedSeconds), 0).toFixed(2)
        );
        const totalCorrect = updatedResults.reduce((sum, r) => sum + r.correct_words, 0);
        const totalTarget = updatedResults.reduce((sum, r) => sum + r.total_target_words, 0);
        const totalErrors = updatedResults.reduce((sum, r) => sum + r.errors_detected, 0);

        const allStutters = Array.from(new Set(updatedResults.flatMap(r => r.stutter_words || [])));
        const allTraces = updatedResults.flatMap((r, pIdx) => (r.trace || []).map(step => ({
          ...step,
          passage_index: pIdx + 1,
          passage_title: r.passage_title,
          passage_accuracy: r.accuracy_rate,
          passage_wcpm: r.wcpm,
          passage_correct: r.correct_words,
          passage_total: r.total_target_words,
          passage_errors: r.errors_detected,
          passage_stutters: r.stutter_words || []
        })));

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
          const submitRes = await fetch(`${API_BASE}/api/classroom/submit-result`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              teacher_id: gateTeacher?.id || Number(sessionStorage.getItem('readfil_classroom_teacher_id')) || currentPassage?.teacher_id,
              pin: sessionStorage.getItem('readfil_classroom_pin') || '',
              passage_id: currentPassage?.id,
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

          if (submitRes.status === 403) {
            const submitData = await submitRes.json();
            handleStrictLogoutPinReset(submitData.error);
            return;
          }

          if (submitRes.ok) {
            const submitData = await submitRes.json();
            if (submitData?.teacher_email) {
              sessionStorage.setItem('readfil_classroom_teacher_email', submitData.teacher_email);
              localStorage.setItem('readfil_classroom_teacher_email', submitData.teacher_email);
              localStorage.setItem('user_email', submitData.teacher_email);
            }
          }
        } catch (logErr) {
          console.warn("Could not save to teacher classroom database:", logErr);
        }

        // Format reading_logs array so Results.jsx can render each passage nicely with duration_seconds
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
          duration_seconds: r.duration_seconds || r.elapsedSeconds,
          level: `Classroom Passage #${idx + 1}: ${r.passage_title}`
        }));

        // Determine whether this classroom assessment is Elementary (<= 6) or High School (>= 7)
        const activeOrFirstPassage = (passagesListRef.current && passagesListRef.current[0]) || activePassage;
        const rawGrade = activeOrFirstPassage?.grade_level || '';
        const gradeNum = parseInt(String(rawGrade).replace(/\D/g, ''), 10);
        let schoolLevel = "Elementary";
        if (!isNaN(gradeNum)) {
          schoolLevel = gradeNum >= 7 ? "High School" : "Elementary";
        } else if (String(rawGrade).toLowerCase().includes('high') || String(rawGrade).toLowerCase().includes('expert')) {
          schoolLevel = "High School";
        }
        localStorage.setItem('classroom_school_level', schoolLevel);
        localStorage.setItem('classroom_grade_level', rawGrade);

        // Save to localStorage for standard Results.jsx view
        localStorage.setItem('user_firstName', studentName);
        localStorage.setItem('final_accuracy', avgAccuracy.toString());
        localStorage.setItem('final_wcpm', avgWcpm.toString());
        localStorage.setItem('evaluated_level', 'Classroom');
        localStorage.setItem('reading_logs', JSON.stringify(logsForResults));
        localStorage.setItem('is_classroom_session', 'true');
        localStorage.setItem('readfil_auto_send_email', classroomSettings?.auto_send_email ? 'true' : 'false');

        // Ensure teacher email is retained in localStorage for certificate email dispatch
        const finalTeacherEmail = gateTeacher?.email ||
                                  sessionStorage.getItem('readfil_classroom_teacher_email') ||
                                  localStorage.getItem('readfil_classroom_teacher_email');
        if (finalTeacherEmail) {
          localStorage.setItem('readfil_classroom_teacher_email', finalTeacherEmail);
          localStorage.setItem('user_email', finalTeacherEmail);
        }

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
      isProcessingRef.current = false;
      setIsProcessing(false);
      audioChunksRef.current = [];
    }
  };

  // Proceed to next passage in the active set (Hands-free continuous start)
  const handleProceedToNextPassage = () => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    setAutoAdvanceCountdown(0);
    const list = passagesListRef.current.length > 0 ? passagesListRef.current : passagesList;
    const nextIdx = currentIndexRef.current + 1;
    if (nextIdx < list.length) {
      const nextPassage = list[nextIdx];
      currentIndexRef.current = nextIdx;
      setCurrentIndex(nextIdx);
      activePassageRef.current = nextPassage;
      setActivePassage(nextPassage);
      const duration = getSafePassageDuration(nextPassage);
      totalTimerDurationRef.current = duration;
      setTotalTimerDuration(duration);
      setTimeLeft(duration);
      isBetweenPassagesRef.current = false;
      setIsBetweenPassages(false);
      setLastPassageSummary(null);
      setIsSilenceError(false);
      setIsSatisfiedCompleted(false);

      // Hands-free continuous start: automatically starts 3-2-1 countdown for next passage!
      isCountingDownRef.current = true;
      setIsCountingDown(true);
      setCountdownValue(3);
    }
  };

  const handleSaveStudentName = (e) => {
    e.preventDefault();
    if (!tempName.trim()) return;
    const clean = tempName.trim();
    setStudentName(clean);
    setGateStudentName(clean);
    localStorage.setItem('user_firstName', clean);
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
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
          <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 mb-6 shadow-sm shadow-blue-500/5 relative overflow-hidden transition-all">
            
            {/* Header: Label, Progress Counter & Track */}
            <div className="flex items-center justify-between gap-3 mb-3 px-1">
              <div className="flex items-center gap-2 sm:gap-2.5">
                <div className="w-2 h-2 rounded-full bg-[#0096FF] animate-pulse flex-shrink-0"></div>
                <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-slate-500">
                  {isEn ? "Assessment Progress" : "Progreso sa Pagsusulit"}
                </span>
                <span className="text-[11px] sm:text-xs font-black text-[#0096FF] bg-blue-50 border border-blue-200/90 px-2 sm:px-2.5 py-0.5 rounded-full shadow-sm">
                  {currentIndex + 1} / {passagesList.length}
                </span>
              </div>

              {/* Progress Percentage & Animated Micro-Bar */}
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-xs font-bold text-slate-700 font-mono">
                  {Math.round(((currentIndex + 1) / passagesList.length) * 100)}%
                </span>
                <div className="w-20 sm:w-36 bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/80 p-[1px] flex-shrink-0">
                  <div 
                    className="bg-gradient-to-r from-[#0096FF] to-blue-600 h-full rounded-full transition-all duration-500 ease-out shadow-sm"
                    style={{ width: `${Math.round(((currentIndex + 1) / passagesList.length) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Strictly ONE LINE ONLY with Auto-Slide, Side Fade Masks & Floating Controls */}
            <div className="relative flex items-center w-full group">
              
              {/* Left Subtle Edge Fade Mask */}
              {canScrollLeft && (
                <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 sm:w-12 bg-gradient-to-r from-white via-white/80 to-transparent z-10 transition-opacity duration-300" />
              )}

              {/* Floating Left Slide Button */}
              {canScrollLeft && (
                <button
                  type="button"
                  onClick={() => handleManualSlide('left')}
                  className="absolute left-1 z-20 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/95 backdrop-blur-md border border-slate-200 text-slate-600 hover:text-[#0096FF] hover:border-blue-200 shadow-md flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                  title={isEn ? "Slide left" : "I-slide pakaliwa"}
                  aria-label="Slide left"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}

              {/* One line only horizontal scroll track */}
              <div 
                ref={passageScrollContainerRef}
                className="flex items-center gap-2 overflow-x-auto py-1 px-1 sm:px-2 max-w-full flex-nowrap whitespace-nowrap no-scrollbar scroll-smooth w-full"
              >
                {passagesList.map((p, idx) => {
                  const isDone = idx < currentIndex;
                  const isCurrent = idx === currentIndex;
                  return (
                    <div
                      key={p.id || idx}
                      ref={isCurrent ? activePillRef : null}
                      className={`flex-shrink-0 whitespace-nowrap flex items-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-xl sm:rounded-2xl text-xs font-bold transition-all select-none ${
                        isDone
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/90 shadow-sm'
                          : isCurrent
                            ? 'bg-gradient-to-r from-blue-600 to-[#0096FF] text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-400/40 font-extrabold scale-[1.02]'
                            : 'bg-slate-50 text-slate-500 border border-slate-200/80 hover:bg-slate-100 hover:text-slate-700'
                      }`}
                    >
                      {/* Pill Badge */}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono font-bold ${
                        isCurrent 
                          ? 'bg-white/20 text-white' 
                          : isDone 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-slate-200 text-slate-600'
                      }`}>
                        #{idx + 1}
                      </span>

                      {/* Active indicator dot */}
                      {isCurrent && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping flex-shrink-0"></span>
                      )}

                      {/* Title */}
                      <span className="truncate max-w-[110px] sm:max-w-[150px] md:max-w-[180px]">
                        {p.title}
                      </span>

                      {/* Done Checkmark */}
                      {isDone && (
                        <div className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Right Subtle Edge Fade Mask */}
              {canScrollRight && (
                <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 sm:w-12 bg-gradient-to-l from-white via-white/80 to-transparent z-10 transition-opacity duration-300" />
              )}

              {/* Floating Right Slide Button */}
              {canScrollRight && (
                <button
                  type="button"
                  onClick={() => handleManualSlide('right')}
                  className="absolute right-1 z-20 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/95 backdrop-blur-md border border-slate-200 text-slate-600 hover:text-[#0096FF] hover:border-blue-200 shadow-md flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                  title={isEn ? "Slide right" : "I-slide pakanan"}
                  aria-label="Slide right"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}

            </div>
          </div>
        )}

        {/* Assignment Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
          <span className="text-xs font-bold text-[#0096FF] uppercase bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
            {activePassage?.grade_level || "Classroom"}
          </span>
          <span className="text-xs text-gray-500 bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">
            {isEn ? "Assigned by:" : "Itinalaga ni:"} <strong className="text-slate-700">{activePassage?.teacher_name || (isEn ? "Teacher" : "Guro")}</strong>
          </span>
        </div>

        {/* Reading Material Card - Matching Easy / Beginner UI */}
        <div className="bg-white/90 backdrop-blur-md p-4 sm:p-10 rounded-2xl sm:rounded-[2rem] shadow-xl shadow-sky-100/50 border border-white/80 mb-8 relative">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-[#0096FF]">
              {isEn ? "Reading Material" : "Materyal sa Pagbasa"}
            </h2>
            <span className="text-sm font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
              {currentIndex + 1} / {passagesList.length}
            </span>
          </div>

          <div className="p-4 pb-20 sm:p-8 sm:pb-16 bg-gray-50 rounded-xl border border-gray-200 min-h-[160px] flex flex-col items-center justify-center relative">
            {isCountingDown && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-sm rounded-xl">
                <span className="text-6xl sm:text-8xl font-black text-[#0096FF] animate-pulse">
                  {countdownValue > 0 ? countdownValue : 'Go!'}
                </span>
              </div>
            )}

            <p className={`text-lg sm:text-2xl leading-relaxed text-center font-medium text-black transition-all duration-300 ${!isRecording && !isProcessing ? 'blur-sm select-none' : ''}`}>
              "{activePassage?.content || ''}"
            </p>

            {activePassage?.source && (
              <span className={`mt-6 text-sm text-gray-400 italic transition-all duration-300 ${!isRecording && !isProcessing ? 'blur-sm select-none' : ''}`}>
                {isEn ? "Source: " : "Pinagmulan: "} {activePassage.source}
              </span>
            )}

            {/* Timer pill in bottom-right matching Easy / Beginner UI */}
            <div className={`absolute bottom-3 right-4 sm:bottom-4 sm:right-6 flex items-center gap-2 font-mono font-bold bg-white px-3.5 py-1.5 rounded-full border shadow-sm text-sm transition-all ${isTimeCritical && isRecording
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

        {/* Prominent Visual Completion Notification Banner */}
        {isSatisfiedCompleted && (
          <div className="w-full max-w-xl mx-auto mb-6 px-6 py-4 bg-emerald-500 text-white font-extrabold text-base sm:text-lg rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/30 animate-pulse border-2 border-emerald-400">
            <svg className="w-7 h-7 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
            </svg>
            <span>{isEn ? "Reading completed! Finalizing evaluation..." : "Tapos na ang pagbasa! Isinusumite ang marka..."}</span>
          </div>
        )}

        {/* Quick Finish Button while recording so reader can immediately finish in 0ms on demand */}
        {isRecording && !isSatisfiedCompleted && (
          <div className="flex justify-center mb-4">
            <button
              onClick={() => triggerAutoStop("manual_done_button", 0)}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm uppercase tracking-wider rounded-full shadow-lg shadow-emerald-600/30 flex items-center gap-2 transform active:scale-95 transition-all hover:scale-105 border border-emerald-400/40"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>{isEn ? "I'm Done Reading" : "Tapos Na Ako Magbasa"}</span>
            </button>
          </div>
        )}

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
              className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transform transition-all hover:scale-105 relative z-10 ${isSatisfiedCompleted
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

          <p className={`mt-4 font-bold text-lg text-center min-h-[1.75rem] transition-colors ${isSatisfiedCompleted
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
                  ? (isEn ? "Evaluating reading..." : "Sinusuri ang iyong pagbasa...")
                  : isCountingDown
                    ? (isEn ? "Get ready..." : "Humanda...")
                    : isSilenceError
                      ? (isEn ? "No speech detected. Click mic to try again." : "Walang boses na narinig. Pindutin muli ang mic.")
                      : (isEn ? "Click the microphone to begin reading" : "Pindutin ang mikropono upang simulan ang pagbasa")}
          </p>

          {isSilenceError && (
            <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2 shadow-sm max-w-md">
              <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{isEn ? "Please speak clearly into your microphone." : "Pakisuyong magsalita nang malinaw sa mikropono."}</span>
            </div>
          )}
        </div>
      </main>

      {/* Interstitial Modal Between Passages */}
      {isBetweenPassages && lastPassageSummary && (
        <div 
          onClick={handleProceedToNextPassage}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-200 text-center cursor-default"
          >
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

            {/* Auto-Advance Notice or Manual Continue Button */}
            {classroomSettings?.auto_continue === true && autoAdvanceCountdown > 0 ? (
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
            ) : (
              <div className="flex items-center justify-center gap-2 mb-5 text-sm font-semibold text-slate-600 bg-gray-50 px-4 py-2.5 rounded-2xl border border-gray-200 shadow-sm">
                <span>
                  {isEn
                    ? "Review your reading score above, then click Proceed to continue."
                    : "Suriin ang iyong marka sa itaas, pagkatapos ay pindutin ang Magpatuloy."}
                </span>
              </div>
            )}

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
        <div 
          onClick={() => setIsNameModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200 relative cursor-default"
          >
            {/* Close Button X */}
            <button
              type="button"
              onClick={() => setIsNameModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

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

      {/* Leave Classroom Confirmation Modal */}
      {isLeaveModalOpen && (
        <div 
          onClick={() => setIsLeaveModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl shadow-slate-900/25 animate-in zoom-in-95 duration-200 text-center relative overflow-hidden cursor-default"
          >
            {/* Close Button X */}
            <button
              type="button"
              onClick={() => setIsLeaveModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-sm bg-rose-50 border border-rose-100 text-rose-600">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>

            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mb-2">
              {isEn ? "Leave Classroom?" : "Lumabas sa Silid-Aralan?"}
            </h3>

            <p className="text-gray-600 text-sm leading-relaxed mb-6 max-w-sm mx-auto">
              {isEn
                ? "Are you sure you want to leave this classroom session? Any unsubmitted reading will be stopped."
                : "Sigurado ka bang nais mong lumabas sa sesyon ng klase? Mahihinto ang anumang hindi pa naipasang pagbasa."}
            </p>

            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => setIsLeaveModalOpen(false)}
                className="flex-1 py-3 px-5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-slate-700 font-bold text-sm transition-all active:scale-[0.98]"
              >
                {isEn ? "Cancel" : "Kanselahin"}
              </button>

              <button
                type="button"
                onClick={confirmLeaveRoom}
                className="flex-1 py-3 px-5 rounded-2xl text-white font-extrabold text-sm shadow-lg shadow-rose-500/25 bg-rose-600 hover:bg-rose-700 transition-all hover:scale-[1.01] active:scale-[0.98]"
              >
                {isEn ? "Leave Room" : "Lumabas"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Strict PIN Reset / Invalidation Modal */}
      {isPinResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white border border-rose-200 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl shadow-rose-900/20 animate-in zoom-in-95 duration-200 text-center relative overflow-hidden">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-sm bg-rose-50 border border-rose-200 text-rose-600">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m0 0v2m0-2h2m-2 0H10m7-7a5 5 0 10-10 0v2h10V8z" />
              </svg>
            </div>

            <div className="text-xs uppercase font-extrabold tracking-wider text-rose-600 mb-1">
              {isEn ? "Session Terminated" : "Pinasarang Sesyon"}
            </div>

            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mb-2">
              {isEn ? "Classroom PIN Reset" : "Na-reset ang Classroom PIN"}
            </h3>

            <p className="text-gray-600 text-sm leading-relaxed mb-6 max-w-sm mx-auto">
              {pinResetMessage}
            </p>

            <button
              type="button"
              onClick={() => {
                setIsPinResetModalOpen(false);
                setPinResetMessage('');
              }}
              className="w-full py-3.5 px-6 rounded-2xl text-white font-extrabold text-sm shadow-lg shadow-blue-500/25 bg-[#0096FF] hover:bg-blue-600 transition-all hover:scale-[1.01] active:scale-[0.98]"
            >
              {isEn ? "Enter New Classroom PIN" : "Maglagay ng Bagong PIN"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
