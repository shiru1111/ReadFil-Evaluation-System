import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from './contexts/LanguageContext';
import SoundWaveBackground from './components/SoundWaveBackground';
import { beginnerPassages, moderatePassages, expertPassages } from './data/passages';

const API_BASE = import.meta.env.VITE_API_URL || '';

// System Phil-IRI Passage Catalog
const systemPassageCatalog = [
  ...beginnerPassages.map((p, idx) => ({
    id: `beg-${idx}`,
    category: 'Beginner',
    level: 'Beginner (Grade 1-3)',
    grade: 'Grade 3',
    title: p.text.split(' ').slice(0, 4).join(' ') + (p.text.split(' ').length > 4 ? '...' : ''),
    content: p.text,
    source: p.source || 'Phil-IRI Oral Reading Manual'
  })),
  ...moderatePassages.map((p, idx) => ({
    id: `mod-${idx}`,
    category: 'Moderate',
    level: 'Moderate (Grade 4-6)',
    grade: 'Grade 5',
    title: p.text.split(' ').slice(0, 5).join(' ') + (p.text.split(' ').length > 5 ? '...' : ''),
    content: p.text,
    source: p.source || 'Phil-IRI Oral Reading Manual'
  })),
  ...expertPassages.map((p, idx) => ({
    id: `exp-${idx}`,
    category: 'Expert',
    level: 'Expert (Grade 7+)',
    grade: 'Grade 7',
    title: p.source ? p.source.split(' ni ')[0] : (p.text.split(' ').slice(0, 4).join(' ') + '...'),
    content: p.text,
    source: p.source || 'Classical Tagalog Literature'
  }))
];

export default function TeacherPortal() {
  const { language } = useLanguage();
  const isEn = language === 'en';

  // Authentication State
  const [teacher, setTeacher] = useState(() => {
    const saved = localStorage.getItem('readfil_teacher');
    return saved ? JSON.parse(saved) : null;
  });

  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register' | 'forgot'
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  // Login Form
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register Form
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regSecurityQuestion, setRegSecurityQuestion] = useState(
    isEn ? 'What is the name of your favorite teacher?' : 'Ano ang pangalan ng paborito mong guro?'
  );
  const [regSecurityAnswer, setRegSecurityAnswer] = useState('');

  // Forgot Password Form
  const [forgotStep, setForgotStep] = useState(1); // 1: enter username, 2: answer question
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotSecurityQuestion, setForgotSecurityQuestion] = useState('');
  const [forgotSecurityAnswer, setForgotSecurityAnswer] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');

  // Dashboard Active Tab: 'passages' | 'students'
  const [activeTab, setActiveTab] = useState('passages');

  // Global / Default Timer Duration for Teacher
  const [globalTimerDuration, setGlobalTimerDuration] = useState(() => {
    return parseInt(localStorage.getItem('readfil_teacher_default_timer'), 10) || 10;
  });
  const [globalTimerSaving, setGlobalTimerSaving] = useState(false);
  const [globalTimerFeedback, setGlobalTimerFeedback] = useState('');

  // Passages State
  const [passages, setPassages] = useState([]);
  const [isPassageModalOpen, setIsPassageModalOpen] = useState(false);
  const [editingPassage, setEditingPassage] = useState(null);
  const [passageTitle, setPassageTitle] = useState('');
  const [passageContent, setPassageContent] = useState('');
  const [passageGrade, setPassageGrade] = useState('Grade 4');
  const [passageTimer, setPassageTimer] = useState(() => {
    return parseInt(localStorage.getItem('readfil_teacher_default_timer'), 10) || 10;
  });
  const [passageSaving, setPassageSaving] = useState(false);

  // Passage Bank Modal State (Choose from our passages)
  const [isPassageBankModalOpen, setIsPassageBankModalOpen] = useState(false);
  const [bankCategory, setBankCategory] = useState('all');
  const [bankSearch, setBankSearch] = useState('');
  const [bankImportingId, setBankImportingId] = useState(null);

  // Student Records State
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null); // for detail modal

  // System Token Status
  const [tokenStatus, setTokenStatus] = useState(null);

  // Load Passages and Records on Login
  useEffect(() => {
    if (teacher && teacher.id) {
      fetchPassages();
      fetchRecords();
      fetchTokenStatus();
    }
  }, [teacher]);

  const fetchTokenStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/system/token-status`);
      if (res.ok) {
        const data = await res.json();
        setTokenStatus(data);
      }
    } catch (e) {
      console.warn("Could not check token status:", e);
    }
  };

  const fetchPassages = async () => {
    if (!teacher) return;
    try {
      const res = await fetch(`${API_BASE}/api/teacher/passages?teacher_id=${teacher.id}`);
      if (res.ok) {
        const data = await res.json();
        const list = data.passages || [];
        setPassages(list);
        // If there's an active passage with timer, use it as baseline
        const active = list.find(p => p.is_active);
        if (active && active.timer_seconds && !localStorage.getItem('readfil_teacher_default_timer')) {
          setGlobalTimerDuration(active.timer_seconds);
        }
      }
    } catch (err) {
      console.error("Error fetching passages:", err);
    }
  };

  const fetchRecords = async (query = '') => {
    if (!teacher) return;
    try {
      setRecordsLoading(true);
      const url = query
        ? `${API_BASE}/api/teacher/records?teacher_id=${teacher.id}&search=${encodeURIComponent(query)}`
        : `${API_BASE}/api/teacher/records?teacher_id=${teacher.id}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      }
    } catch (err) {
      console.error("Error fetching student records:", err);
    } finally {
      setRecordsLoading(false);
    }
  };

  // Handle Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${API_BASE}/api/teacher/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || (isEn ? "Invalid username or password." : "Maling username o password."));
      }
      setTeacher(data.teacher);
      localStorage.setItem('readfil_teacher', JSON.stringify(data.teacher));
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Register
  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    setAuthSuccess('');
    try {
      const res = await fetch(`${API_BASE}/api/teacher/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName,
          username: regUsername,
          email: regEmail,
          password: regPassword,
          security_question: regSecurityQuestion,
          security_answer: regSecurityAnswer
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || (isEn ? "Registration failed." : "Nabigo ang pagpaparehistro."));
      }
      setAuthSuccess(isEn ? "Account registered successfully! You can now log in." : "Matagumpay na narehistro ang account! Maaari ka nang mag-login.");
      setAuthMode('login');
      setLoginUsername(regUsername);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Forgot Password - Step 1
  const handleForgotStep1 = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${API_BASE}/api/teacher/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: forgotUsername })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || (isEn ? "Username not found." : "Hindi nahanap ang username."));
      }
      setForgotSecurityQuestion(data.security_question);
      setForgotStep(2);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Forgot Password - Step 2
  const handleForgotStep2 = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${API_BASE}/api/teacher/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: forgotUsername,
          security_answer: forgotSecurityAnswer,
          new_password: forgotNewPassword
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || (isEn ? "Verification failed." : "Nabigo ang beripikasyon."));
      }
      setAuthSuccess(isEn ? "Password reset successfully! Please log in." : "Matagumpay na nabago ang password! Pakisuyong mag-login.");
      setAuthMode('login');
      setForgotStep(1);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Logout
  const handleLogout = () => {
    setTeacher(null);
    localStorage.removeItem('readfil_teacher');
  };

  // Apply Global Custom Duration across all passages
  const handleApplyGlobalTimer = async () => {
    if (!teacher) return;
    const duration = Math.max(5, parseInt(globalTimerDuration, 10) || 10);
    setGlobalTimerSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/teacher/set-global-timer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacher_id: teacher.id,
          timer_seconds: duration
        })
      });
      if (res.ok) {
        localStorage.setItem('readfil_teacher_default_timer', duration.toString());
        setPassageTimer(duration);
        setGlobalTimerFeedback(
          isEn ? `Applied ${duration}s duration to all passages!` : `Inilapat ang ${duration}s tagal sa lahat ng talata!`
        );
        setTimeout(() => setGlobalTimerFeedback(''), 4000);
        fetchPassages();
      }
    } catch (err) {
      console.error("Error setting global timer:", err);
    } finally {
      setGlobalTimerSaving(false);
    }
  };

  // Create or Update Passage
  const handleSavePassage = async (e) => {
    e.preventDefault();
    if (!passageTitle.trim() || !passageContent.trim()) return;

    const timerVal = Math.max(5, parseInt(passageTimer, 10) || 10);

    setPassageSaving(true);
    try {
      if (editingPassage) {
        const res = await fetch(`${API_BASE}/api/teacher/passages/${editingPassage.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teacher_id: teacher.id,
            title: passageTitle,
            content: passageContent,
            grade_level: passageGrade,
            timer_seconds: timerVal
          })
        });
        if (!res.ok) throw new Error(isEn ? "Failed to update passage." : "Hindi ma-update ang talata.");
      } else {
        const res = await fetch(`${API_BASE}/api/teacher/passages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teacher_id: teacher.id,
            title: passageTitle,
            content: passageContent,
            grade_level: passageGrade,
            timer_seconds: timerVal,
            is_active: passages.length === 0
          })
        });
        if (!res.ok) throw new Error(isEn ? "Failed to save new passage." : "Hindi ma-save ang bagong talata.");
      }

      setIsPassageModalOpen(false);
      setEditingPassage(null);
      setPassageTitle('');
      setPassageContent('');
      fetchPassages();
    } catch (err) {
      alert(err.message);
    } finally {
      setPassageSaving(false);
    }
  };

  // Set Passage as Active for Classroom Mode
  const handleActivatePassage = async (passageId) => {
    try {
      const res = await fetch(`${API_BASE}/api/teacher/passages/${passageId}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_id: teacher.id })
      });
      if (res.ok) {
        fetchPassages();
      }
    } catch (err) {
      console.error("Error activating passage:", err);
    }
  };

  // Delete Passage
  const handleDeletePassage = async (passageId) => {
    const confirmMsg = isEn
      ? "Are you sure you want to delete this passage?"
      : "Sigurado ka bang nais mong tanggalin ang talatang ito?";
    if (!window.confirm(confirmMsg)) return;
    try {
      const res = await fetch(`${API_BASE}/api/teacher/passages/${passageId}?teacher_id=${teacher.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchPassages();
      }
    } catch (err) {
      console.error("Error deleting passage:", err);
    }
  };

  // Import Passage from built-in repository (Choose from our passages)
  const handleImportFromBank = async (item) => {
    if (!teacher) return;
    setBankImportingId(item.id);
    try {
      const timerVal = Math.max(5, parseInt(globalTimerDuration, 10) || 10);
      const res = await fetch(`${API_BASE}/api/teacher/passages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacher_id: teacher.id,
          title: item.title,
          content: item.content,
          grade_level: item.grade || 'General',
          timer_seconds: timerVal,
          is_active: passages.length === 0
        })
      });
      if (res.ok) {
        fetchPassages();
        setIsPassageBankModalOpen(false);
      }
    } catch (err) {
      console.error("Error importing passage from bank:", err);
    } finally {
      setBankImportingId(null);
    }
  };

  // Open Edit Modal
  const openEditModal = (p) => {
    setEditingPassage(p);
    setPassageTitle(p.title);
    setPassageContent(p.content);
    setPassageGrade(p.grade_level || 'Grade 4');
    setPassageTimer(p.timer_seconds || parseInt(globalTimerDuration, 10) || 10);
    setIsPassageModalOpen(true);
  };

  // Open Create Modal
  const openCreateModal = () => {
    setEditingPassage(null);
    setPassageTitle('');
    setPassageContent('');
    setPassageGrade('Grade 4');
    setPassageTimer(parseInt(globalTimerDuration, 10) || 10);
    setIsPassageModalOpen(true);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!teacher) return;
    window.open(`${API_BASE}/api/teacher/records/export?teacher_id=${teacher.id}`, '_blank');
  };

  // Filter System Passages in Bank Modal
  const filteredBankPassages = systemPassageCatalog.filter(p => {
    const matchesCategory = bankCategory === 'all' || p.category === bankCategory;
    const matchesSearch = !bankSearch.trim() ||
      p.title.toLowerCase().includes(bankSearch.toLowerCase()) ||
      p.content.toLowerCase().includes(bankSearch.toLowerCase()) ||
      p.source.toLowerCase().includes(bankSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Calculate Student Stats
  const totalStudents = records.length;
  const avgAccuracy = totalStudents > 0
    ? Math.round(records.reduce((acc, r) => acc + (parseFloat(r.accuracy_rate) || 0), 0) / totalStudents)
    : 0;
  const avgWcpm = totalStudents > 0
    ? Math.round(records.reduce((acc, r) => acc + (parseFloat(r.wcpm) || 0), 0) / totalStudents)
    : 0;
  const independentCount = records.filter(r => r.reading_level === 'Independent').length;
  const instructionalCount = records.filter(r => r.reading_level === 'Instructional').length;
  const frustrationCount = records.filter(r => r.reading_level === 'Frustration').length;

  // -------------------------------------------------------------
  // RENDER: NOT LOGGED IN (AUTH FORMS)
  // -------------------------------------------------------------
  if (!teacher) {
    return (
      <div className="min-h-screen bg-slate-50/60 text-slate-900 font-sans relative flex flex-col justify-between">
        <SoundWaveBackground opacity={0.08} />

        {/* Top Bar */}
        <header className="relative z-20 border-b border-gray-200 bg-white/80 backdrop-blur-md px-6 sm:px-12 py-4 flex justify-between items-center shadow-sm">
          <Link to="/" className="text-2xl font-black text-[#0096FF] tracking-tight hover:opacity-90">
            ReadFil
          </Link>
          <Link to="/" className="text-xs uppercase font-bold text-gray-600 hover:text-slate-900 px-3.5 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 bg-white transition-all shadow-sm">
            {isEn ? "Return to Home" : "Bumalik sa Simula"}
          </Link>
        </header>

        {/* Auth Card */}
        <main className="relative z-20 flex-grow flex items-center justify-center p-4 sm:p-6 my-8">
          <div className="bg-white border border-gray-200/90 rounded-3xl p-6 sm:p-10 max-w-md w-full shadow-xl shadow-blue-50/50 backdrop-blur-md">
            <div className="text-center mb-8">
              <div className="w-14 h-14 bg-gradient-to-tr from-[#0096FF] to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-blue-500/20">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                </svg>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {isEn ? "Teacher Portal" : "Portal ng Guro"}
              </h1>
              <p className="text-gray-500 text-sm mt-1">Classroom Monitoring & Passage Management</p>
            </div>

            {/* Error / Success Notifications */}
            {authError && (
              <div className="mb-6 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                {authError}
              </div>
            )}
            {authSuccess && (
              <div className="mb-6 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
                {authSuccess}
              </div>
            )}

            {/* TAB SELECTOR: LOGIN / REGISTER */}
            {authMode !== 'forgot' && (
              <div className="flex bg-gray-100 p-1 rounded-2xl border border-gray-200 mb-6">
                <button
                  onClick={() => { setAuthMode('login'); setAuthError(''); }}
                  className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${
                    authMode === 'login' ? 'bg-white text-[#0096FF] shadow-sm' : 'text-gray-500 hover:text-slate-900'
                  }`}
                >
                  {isEn ? "Log In" : "Mag-Login"}
                </button>
                <button
                  onClick={() => { setAuthMode('register'); setAuthError(''); }}
                  className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${
                    authMode === 'register' ? 'bg-white text-[#0096FF] shadow-sm' : 'text-gray-500 hover:text-slate-900'
                  }`}
                >
                  {isEn ? "Register" : "Magrehistro"}
                </button>
              </div>
            )}

            {/* 1. LOGIN FORM */}
            {authMode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                    {isEn ? "Username" : "Username"}
                  </label>
                  <input
                    type="text"
                    required
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="e.g. teacher"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-slate-900 placeholder-gray-400 focus:outline-none focus:border-[#0096FF] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                    {isEn ? "Password" : "Password"}
                  </label>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-slate-900 placeholder-gray-400 focus:outline-none focus:border-[#0096FF] focus:bg-white"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setAuthMode('forgot'); setForgotStep(1); setAuthError(''); }}
                    className="text-xs text-gray-500 hover:text-[#0096FF] transition-colors"
                  >
                    {isEn ? "Forgot Password?" : "Nakalimutan ang Password?"}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-[#0096FF] hover:from-blue-700 hover:to-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
                >
                  {authLoading ? (isEn ? "Authenticating..." : "Sumusuri...") : (isEn ? "Sign In to Portal" : "Mag-sign In sa Portal")}
                </button>
              </form>
            )}

            {/* 2. REGISTER FORM */}
            {authMode === 'register' && (
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    {isEn ? "Full Name" : "Buong Pangalan"}
                  </label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="e.g. Maria Santos"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-slate-900 placeholder-gray-400 focus:outline-none focus:border-[#0096FF] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    {isEn ? "Username" : "Username"}
                  </label>
                  <input
                    type="text"
                    required
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="e.g. teacher_maria"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-slate-900 placeholder-gray-400 focus:outline-none focus:border-[#0096FF] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    {isEn ? "Email" : "Email"}
                  </label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="teacher@school.edu.ph"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-slate-900 placeholder-gray-400 focus:outline-none focus:border-[#0096FF] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    {isEn ? "Password" : "Password"}
                  </label>
                  <input
                    type="password"
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-slate-900 placeholder-gray-400 focus:outline-none focus:border-[#0096FF] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    {isEn ? "Security Question (For Password Recovery)" : "Tanong sa Seguridad (Para sa Pagbawi)"}
                  </label>
                  <select
                    value={regSecurityQuestion}
                    onChange={(e) => setRegSecurityQuestion(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-slate-900 text-xs focus:outline-none focus:border-[#0096FF] focus:bg-white"
                  >
                    <option value={isEn ? "What is the name of your favorite teacher?" : "Ano ang pangalan ng paborito mong guro?"}>
                      {isEn ? "What is the name of your favorite teacher?" : "Ano ang pangalan ng paborito mong guro?"}
                    </option>
                    <option value={isEn ? "What was the name of your first elementary school?" : "Ano ang pangalan ng iyong unang mababang paaralan?"}>
                      {isEn ? "What was the name of your first elementary school?" : "Ano ang pangalan ng iyong unang mababang paaralan?"}
                    </option>
                    <option value={isEn ? "What is your favorite subject?" : "Ano ang paborito mong asignatura?"}>
                      {isEn ? "What is your favorite subject?" : "Ano ang paborito mong asignatura?"}
                    </option>
                    <option value={isEn ? "What is your favorite color?" : "Ano ang paborito mong kulay?"}>
                      {isEn ? "What is your favorite color?" : "Ano ang paborito mong kulay?"}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    {isEn ? "Answer" : "Sagot sa Tanong"}
                  </label>
                  <input
                    type="text"
                    required
                    value={regSecurityAnswer}
                    onChange={(e) => setRegSecurityAnswer(e.target.value)}
                    placeholder={isEn ? "Type your security answer..." : "Ilagay ang iyong sagot..."}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-slate-900 placeholder-gray-400 focus:outline-none focus:border-[#0096FF] focus:bg-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-[#0096FF] hover:from-blue-700 hover:to-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
                >
                  {authLoading ? (isEn ? "Registering..." : "Nirerehistro...") : (isEn ? "Create Teacher Account" : "Gumawa ng Teacher Account")}
                </button>
              </form>
            )}

            {/* 3. FORGOT PASSWORD FLOW */}
            {authMode === 'forgot' && (
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  {isEn ? "Recover Password" : "I-recover ang Password"}
                </h3>
                <p className="text-gray-500 text-xs mb-4">
                  {forgotStep === 1
                    ? (isEn ? "Enter your username to retrieve your registered security question." : "Ilagay ang iyong username upang makuha ang iyong tanong sa seguridad.")
                    : (isEn ? "Answer your security question to set a new password." : "Sagutin ang iyong tanong sa seguridad upang makapag-set ng bagong password.")}
                </p>

                {forgotStep === 1 ? (
                  <form onSubmit={handleForgotStep1} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">Username</label>
                      <input
                        type="text"
                        required
                        value={forgotUsername}
                        onChange={(e) => setForgotUsername(e.target.value)}
                        placeholder={isEn ? "Type your username..." : "I-type ang iyong username..."}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-slate-900 placeholder-gray-400 focus:outline-none focus:border-[#0096FF] focus:bg-white"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setAuthMode('login'); setAuthError(''); }}
                        className="w-1/3 py-3 rounded-xl border border-gray-300 text-gray-700 font-bold text-sm hover:bg-gray-100"
                      >
                        {isEn ? "Back" : "Bumalik"}
                      </button>
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-2/3 py-3 bg-[#0096FF] hover:bg-blue-600 text-white font-bold rounded-xl transition-colors disabled:opacity-50 text-sm shadow-md shadow-blue-500/20"
                      >
                        {authLoading ? (isEn ? "Verifying..." : "Sinusuri...") : (isEn ? "Continue" : "Ipagpatuloy")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleForgotStep2} className="space-y-4">
                    <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
                      <strong>{isEn ? "Question:" : "Tanong:"}</strong> {forgotSecurityQuestion}
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                        {isEn ? "Your Answer" : "Iyong Sagot"}
                      </label>
                      <input
                        type="text"
                        required
                        value={forgotSecurityAnswer}
                        onChange={(e) => setForgotSecurityAnswer(e.target.value)}
                        placeholder={isEn ? "Type your answer..." : "I-type ang iyong sagot..."}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-slate-900 placeholder-gray-400 focus:outline-none focus:border-[#0096FF] focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                        {isEn ? "New Password" : "Bagong Password"}
                      </label>
                      <input
                        type="password"
                        required
                        value={forgotNewPassword}
                        onChange={(e) => setForgotNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-slate-900 placeholder-gray-400 focus:outline-none focus:border-[#0096FF] focus:bg-white"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setForgotStep(1)}
                        className="w-1/3 py-3 rounded-xl border border-gray-300 text-gray-700 font-bold text-sm hover:bg-gray-100"
                      >
                        {isEn ? "Back" : "Bumalik"}
                      </button>
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-2/3 py-3 bg-[#0096FF] hover:bg-blue-600 text-white font-bold rounded-xl transition-colors disabled:opacity-50 text-sm shadow-md shadow-blue-500/20"
                      >
                        {authLoading ? (isEn ? "Resetting..." : "Inilalapat...") : (isEn ? "Reset Password" : "I-reset ang Password")}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </main>

        <footer className="relative z-20 py-4 text-center text-xs text-gray-500 border-t border-gray-200">
          ReadFil Classroom Monitoring & Assessment System &bull; SQLite Persistence
        </footer>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: LOGGED IN TEACHER DASHBOARD
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-50/60 text-slate-900 font-sans relative overflow-x-hidden">
      <SoundWaveBackground opacity={0.08} />

      {/* Top Navbar */}
      <header className="relative z-20 border-b border-gray-200 bg-white/85 backdrop-blur-md px-6 sm:px-12 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center space-x-4">
          <Link to="/" className="text-2xl font-black text-[#0096FF] tracking-tight hover:opacity-90">
            ReadFil
          </Link>
          <span className="text-xs uppercase font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            {isEn ? "Teacher Portal" : "Portal ng Guro"}
          </span>
          {tokenStatus && (
            <span className="hidden lg:inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              {tokenStatus.cloud_stt_configured ? (isEn ? "Cloud STT Online (Token Active)" : "Cloud STT Online (Token Aktibo)") : (isEn ? "Local Wav2Vec Mode" : "Local Wav2Vec Mode")}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-gray-500">{isEn ? "Logged in as:" : "Naka-login bilang:"}</div>
            <div className="text-sm font-bold text-slate-800">{teacher.name}</div>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs uppercase font-bold text-red-600 hover:text-white hover:bg-red-600 px-3.5 py-2 rounded-xl border border-red-200 transition-all shadow-sm"
          >
            {isEn ? "Log Out" : "Mag-Logout"}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-20 max-w-7xl mx-auto px-4 sm:px-8 py-8">
        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 mb-8 gap-2">
          <button
            onClick={() => setActiveTab('passages')}
            className={`flex items-center gap-2 px-6 py-3 font-bold text-sm sm:text-base border-b-2 transition-all ${
              activeTab === 'passages'
                ? 'border-[#0096FF] text-[#0096FF] bg-blue-50/70 rounded-t-xl'
                : 'border-transparent text-gray-500 hover:text-slate-900'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            {isEn ? `Passage Management (${passages.length})` : `Pamamahala ng Talata (${passages.length})`}
          </button>

          <button
            onClick={() => setActiveTab('students')}
            className={`flex items-center gap-2 px-6 py-3 font-bold text-sm sm:text-base border-b-2 transition-all ${
              activeTab === 'students'
                ? 'border-[#0096FF] text-[#0096FF] bg-blue-50/70 rounded-t-xl'
                : 'border-transparent text-gray-500 hover:text-slate-900'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
            </svg>
            {isEn ? `Student Records (${records.length})` : `Talaan ng mga Mag-aaral (${records.length})`}
          </button>
        </div>

        {/* -------------------------------------------------------------
            TAB 1: PASSAGES MANAGER
            ------------------------------------------------------------- */}
        {activeTab === 'passages' && (
          <div>
            {/* Header with Title and Action Buttons */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-900">
                  {isEn ? "Reading Passages" : "Mga Talata sa Pagbasa"}
                </h2>
                <p className="text-gray-500 text-sm">
                  {isEn
                    ? "Manage your set of custom passages or choose from our validated Phil-IRI passage repository."
                    : "Pamahalaan ang iyong mga talata o pumili mula sa opisyal na repository ng Phil-IRI."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setIsPassageBankModalOpen(true)}
                  className="px-5 py-3 bg-white hover:bg-gray-50 text-[#0096FF] border border-[#0096FF]/30 font-bold rounded-2xl shadow-sm flex items-center gap-2 transition-transform hover:scale-[1.02]"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                  </svg>
                  {isEn ? "Choose from Passage Bank" : "Pumili sa Bangko ng Talata"}
                </button>

                <button
                  onClick={openCreateModal}
                  className="px-6 py-3 bg-[#0096FF] hover:bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/20 flex items-center gap-2 transition-transform hover:scale-[1.02]"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/>
                  </svg>
                  {isEn ? "Add Custom Passage" : "Magdagdag ng Talata"}
                </button>
              </div>
            </div>

            {/* Custom Duration & Universal Timer Control Banner */}
            <div className="bg-white border border-gray-200 rounded-3xl p-5 sm:p-6 mb-8 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-blue-50 text-[#0096FF] flex items-center justify-center flex-shrink-0 border border-blue-100">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div className="text-base font-bold text-slate-900">
                    {isEn ? "Class Assessment Timer Duration" : "Oras ng Pagsusulit para sa Klase"}
                  </div>
                  <div className="text-xs text-gray-500">
                    {isEn
                      ? "Set a custom duration (e.g. 10s) and apply it to every passage in your class set."
                      : "Magtakda ng pasadyang tagal (hal. 10s) at ilapat sa bawat talata sa iyong klase."}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="flex items-center bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 focus-within:border-[#0096FF] focus-within:bg-white shadow-inner">
                  <input
                    type="number"
                    min="5"
                    max="600"
                    value={globalTimerDuration}
                    onChange={(e) => setGlobalTimerDuration(e.target.value)}
                    className="w-16 text-center font-black text-slate-900 bg-transparent focus:outline-none text-base"
                  />
                  <span className="text-xs font-bold text-gray-500 ml-1">sec</span>
                </div>

                <button
                  onClick={handleApplyGlobalTimer}
                  disabled={globalTimerSaving}
                  className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-[#0096FF] hover:from-blue-700 hover:to-blue-600 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-blue-500/20 whitespace-nowrap disabled:opacity-50"
                >
                  {globalTimerSaving
                    ? (isEn ? "Applying..." : "Inilalapat...")
                    : (isEn ? "Apply to All Passages" : "Ilapat sa Lahat ng Talata")}
                </button>

                {globalTimerFeedback && (
                  <span className="text-xs font-bold text-emerald-600 whitespace-nowrap animate-pulse">
                    {globalTimerFeedback}
                  </span>
                )}
              </div>
            </div>

            {/* Passage Cards Grid */}
            {passages.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-3xl p-12 text-center shadow-sm">
                <div className="w-16 h-16 bg-gray-100 text-gray-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  {isEn ? "No Saved Passages" : "Walang Naka-save na Talata"}
                </h3>
                <p className="text-gray-500 text-sm mb-6">
                  {isEn ? "Get started by choosing a passage from our Phil-IRI repository or creating a custom one." : "Magsimula sa pamamagitan ng pagpili ng talata mula sa repository o paggawa ng bago."}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={() => setIsPassageBankModalOpen(true)}
                    className="px-6 py-2.5 bg-white border border-[#0096FF] text-[#0096FF] font-bold rounded-xl text-sm shadow-sm"
                  >
                    {isEn ? "Choose from Passage Bank" : "Pumili sa Bangko ng Talata"}
                  </button>
                  <button
                    onClick={openCreateModal}
                    className="px-6 py-2.5 bg-[#0096FF] text-white font-bold rounded-xl text-sm shadow-md shadow-blue-500/20"
                  >
                    {isEn ? "Create Custom Passage" : "Gumawa ng Bagong Talata"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {passages.map((p) => {
                  const wordCount = p.content.trim().split(/\s+/).length;
                  return (
                    <div
                      key={p.id}
                      className={`relative bg-white border rounded-3xl p-6 shadow-sm hover:shadow-md flex flex-col justify-between transition-all ${
                        p.is_active
                          ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/15 shadow-emerald-500/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div>
                        {/* Header Badges */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className="text-xs font-bold text-[#0096FF] uppercase bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-100">
                            {p.grade_level || "General"}
                          </span>
                          {p.is_active ? (
                            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                              {isEn ? "ACTIVE FOR CLASS" : "AKTIBO SA KLASE"}
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-gray-400">
                              {isEn ? "Inactive" : "Hindi Aktibo"}
                            </span>
                          )}
                        </div>

                        <h3 className="text-xl font-bold text-slate-900 mb-2 tracking-tight">{p.title}</h3>
                        <p className="text-slate-600 text-sm line-clamp-3 mb-4 leading-relaxed font-serif">
                          {p.content}
                        </p>

                        <div className="flex items-center gap-4 text-xs text-gray-500 mb-6 pb-4 border-b border-gray-100">
                          <span className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <strong>{p.timer_seconds || 60}s</strong> {isEn ? "timer" : "oras"}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <strong>{wordCount}</strong> {isEn ? "words" : "salita"}
                          </span>
                        </div>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="flex flex-col gap-2">
                        {!p.is_active && (
                          <button
                            onClick={() => handleActivatePassage(p.id)}
                            className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            {isEn ? "Set as Active for Class" : "Gawing Aktibo para sa Klase"}
                          </button>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditModal(p)}
                            className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-slate-700 font-bold rounded-xl text-xs transition-colors border border-gray-200"
                          >
                            {isEn ? "Edit" : "I-edit"}
                          </button>
                          <button
                            onClick={() => handleDeletePassage(p.id)}
                            className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold rounded-xl text-xs transition-colors"
                          >
                            {isEn ? "Delete" : "Tanggalin"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------------------
            TAB 2: STUDENT MONITORING & RECORDS
            ------------------------------------------------------------- */}
        {activeTab === 'students' && (
          <div>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm">
                <span className="text-xs uppercase font-bold text-gray-500">
                  {isEn ? "Total Assessments" : "Kabuuang Pagsusuri"}
                </span>
                <div className="text-3xl font-black text-slate-900 mt-1">{totalStudents}</div>
                <div className="text-[11px] text-gray-400 mt-1">
                  {isEn ? "logged student records" : "mga naitalang resulta"}
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm">
                <span className="text-xs uppercase font-bold text-gray-500">
                  {isEn ? "Average Accuracy" : "Karaniwang Accuracy"}
                </span>
                <div className="text-3xl font-black text-[#0096FF] mt-1">{avgAccuracy}%</div>
                <div className="text-[11px] text-gray-400 mt-1">Reading Accuracy Rate</div>
              </div>

              <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm">
                <span className="text-xs uppercase font-bold text-gray-500">
                  {isEn ? "Average WCPM" : "Karaniwang WCPM"}
                </span>
                <div className="text-3xl font-black text-blue-600 mt-1">{avgWcpm}</div>
                <div className="text-[11px] text-gray-400 mt-1">Words Correct / Minute</div>
              </div>

              <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
                <span className="text-xs uppercase font-bold text-gray-500">
                  {isEn ? "Phil-IRI Level" : "Phil-IRI Antas"}
                </span>
                <div className="flex gap-2 text-xs font-bold mt-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">{independentCount} Ind</span>
                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">{instructionalCount} Ins</span>
                  <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">{frustrationCount} Fru</span>
                </div>
              </div>
            </div>

            {/* Filter & Export Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder={isEn ? "Search by student name..." : "Maghanap ayon sa pangalan ng mag-aaral..."}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    fetchRecords(e.target.value);
                  }}
                  className="w-full px-4 py-2.5 pl-10 bg-white border border-gray-200 rounded-2xl text-sm text-slate-900 placeholder-gray-400 focus:outline-none focus:border-[#0096FF] shadow-sm"
                />
                <svg className="w-5 h-5 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
              </div>

              <button
                onClick={handleExportCSV}
                disabled={records.length === 0}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                {isEn ? "Export to Excel / CSV" : "I-export sa Excel / CSV"}
              </button>
            </div>

            {/* Records Table */}
            <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase font-bold tracking-wider">
                      <th className="py-4 px-6">{isEn ? "Student" : "Mag-aaral"}</th>
                      <th className="py-4 px-6">{isEn ? "Passage" : "Babasahin"}</th>
                      <th className="py-4 px-6">Accuracy</th>
                      <th className="py-4 px-6">WCPM</th>
                      <th className="py-4 px-6">Composite</th>
                      <th className="py-4 px-6">{isEn ? "Level (Phil-IRI)" : "Antas (Phil-IRI)"}</th>
                      <th className="py-4 px-6">{isEn ? "Date" : "Petsa"}</th>
                      <th className="py-4 px-6 text-center">{isEn ? "Action" : "Aksyon"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {records.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="py-12 text-center text-gray-400 font-medium">
                          {recordsLoading
                            ? (isEn ? "Retrieving records..." : "Kinukuha ang talaan...")
                            : (isEn ? "No student results found." : "Walang nahanap na resulta ng mag-aaral.")}
                        </td>
                      </tr>
                    ) : (
                      records.map((r) => {
                        let levelBadge = 'bg-gray-100 text-gray-700 border border-gray-200';
                        if (r.reading_level === 'Independent') levelBadge = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
                        else if (r.reading_level === 'Instructional') levelBadge = 'bg-amber-50 text-amber-700 border border-amber-200';
                        else if (r.reading_level === 'Frustration') levelBadge = 'bg-red-50 text-red-700 border border-red-200';

                        return (
                          <tr key={r.id} className="hover:bg-blue-50/40 transition-colors">
                            <td className="py-4 px-6 font-bold text-slate-900">{r.student_name}</td>
                            <td className="py-4 px-6 text-slate-700">{r.passage_title}</td>
                            <td className="py-4 px-6 font-mono font-bold text-[#0096FF]">{r.accuracy_rate}%</td>
                            <td className="py-4 px-6 font-mono font-bold text-slate-800">{r.wcpm}</td>
                            <td className="py-4 px-6 font-mono text-slate-600">{r.composite_score}</td>
                            <td className="py-4 px-6">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${levelBadge}`}>
                                {r.reading_level}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-xs text-gray-500">
                              {new Date(r.timestamp).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="py-4 px-6 text-center">
                              <button
                                onClick={() => setSelectedRecord(r)}
                                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#0096FF] font-bold rounded-lg text-xs transition-colors border border-blue-200"
                              >
                                {isEn ? "Details" : "Detalye"}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* -------------------------------------------------------------
          MODAL: CHOOSE FROM SYSTEM PASSAGE BANK
          ------------------------------------------------------------- */}
      {isPassageBankModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 max-w-4xl w-full shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-start mb-4 pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-2xl font-black text-slate-900">
                  {isEn ? "Phil-IRI Reading Passage Bank" : "Bangko ng mga Talata sa Pagbasa"}
                </h3>
                <p className="text-gray-500 text-sm mt-0.5">
                  {isEn
                    ? "Select any verified reading passage to add to your classroom assignments set."
                    : "Pumili ng anumang napatunayang talata upang idagdag sa iyong klase."}
                </p>
              </div>
              <button
                onClick={() => setIsPassageBankModalOpen(false)}
                className="p-2 text-gray-400 hover:text-slate-900 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Filter Tabs and Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center mb-6">
              <div className="flex bg-gray-100 p-1 rounded-2xl border border-gray-200 gap-1 overflow-x-auto">
                {['all', 'Beginner', 'Moderate', 'Expert'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setBankCategory(cat)}
                    className={`px-4 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      bankCategory === cat
                        ? 'bg-white text-[#0096FF] shadow-sm'
                        : 'text-gray-600 hover:text-slate-900'
                    }`}
                  >
                    {cat === 'all' ? (isEn ? 'All Levels' : 'Lahat ng Antas') : cat}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 sm:max-w-xs">
                <input
                  type="text"
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                  placeholder={isEn ? "Search passages..." : "Maghanap ng talata..."}
                  className="w-full px-3.5 py-2 pl-9 bg-gray-50 border border-gray-300 rounded-xl text-xs text-slate-900 placeholder-gray-400 focus:outline-none focus:border-[#0096FF] focus:bg-white"
                />
                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
              </div>
            </div>

            {/* Passages List */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pr-2">
              {filteredBankPassages.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  {isEn ? "No passages match your filter." : "Walang nahanap na talata na tumutugma sa filter."}
                </div>
              ) : (
                filteredBankPassages.map((item) => {
                  const words = item.content.trim().split(/\s+/).length;
                  return (
                    <div
                      key={item.id}
                      className="bg-gray-50/70 border border-gray-200 rounded-2xl p-4 sm:p-5 hover:border-blue-300 transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[11px] font-bold text-[#0096FF] bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                            {item.level}
                          </span>
                          <span className="text-xs text-gray-400">&bull;</span>
                          <span className="text-xs text-gray-500">{item.source}</span>
                          <span className="text-xs text-gray-400">&bull;</span>
                          <span className="text-xs font-semibold text-gray-600">{words} {isEn ? "words" : "salita"}</span>
                        </div>
                        <h4 className="text-base font-bold text-slate-900 mb-1">{item.title}</h4>
                        <p className="text-slate-600 text-xs line-clamp-2 leading-relaxed font-serif">
                          {item.content}
                        </p>
                      </div>

                      <button
                        onClick={() => handleImportFromBank(item)}
                        disabled={bankImportingId === item.id}
                        className="px-4 py-2.5 bg-[#0096FF] hover:bg-blue-600 text-white font-bold rounded-xl text-xs whitespace-nowrap shadow-sm transition-all hover:scale-[1.02] disabled:opacity-50"
                      >
                        {bankImportingId === item.id
                          ? (isEn ? "Adding..." : "Idinadagdag...")
                          : (isEn ? "Add to My Passages" : "Idagdag sa Aking Talata")}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-4 mt-4 border-t border-gray-200 text-right">
              <button
                onClick={() => setIsPassageBankModalOpen(false)}
                className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-slate-700 font-bold rounded-full text-xs transition-colors"
              >
                {isEn ? "Close" : "Isara"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          MODAL: ADD / EDIT PASSAGE
          ------------------------------------------------------------- */}
      {isPassageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-black text-slate-900 mb-1">
              {editingPassage
                ? (isEn ? "Edit Passage" : "I-edit ang Talata")
                : (isEn ? "Add New Passage" : "Magdagdag ng Bagong Talata")}
            </h3>
            <p className="text-gray-500 text-sm mb-6">
              {isEn
                ? "Set the title, content, and custom reading duration for your class assessment."
                : "Itakda ang pamagat, nilalaman, at takdang oras ng pagbasa para sa iyong klase."}
            </p>

            {/* Quick Fill Dropdown from Passage Bank */}
            {!editingPassage && (
              <div className="mb-5 p-3.5 bg-blue-50/60 border border-blue-100 rounded-2xl">
                <label className="block text-xs font-bold text-[#0096FF] uppercase tracking-wider mb-1.5">
                  {isEn ? "Quick Fill from Passage Bank (Optional):" : "Mabilisang Pili mula sa Bangko ng Talata:"}
                </label>
                <select
                  onChange={(e) => {
                    const selected = systemPassageCatalog.find(p => p.id === e.target.value);
                    if (selected) {
                      setPassageTitle(selected.title);
                      setPassageContent(selected.content);
                      setPassageGrade(selected.grade);
                    }
                  }}
                  className="w-full px-3 py-2 bg-white border border-blue-200 rounded-xl text-slate-800 text-xs focus:outline-none focus:border-[#0096FF]"
                  defaultValue=""
                >
                  <option value="" disabled>{isEn ? "-- Select a passage to auto-fill --" : "-- Pumili ng talata upang i-autofill --"}</option>
                  <optgroup label={isEn ? "Beginner (Grade 1-3)" : "Baguhan (Baitang 1-3)"}>
                    {systemPassageCatalog.filter(p => p.category === 'Beginner').slice(0, 15).map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </optgroup>
                  <optgroup label={isEn ? "Moderate (Grade 4-6)" : "Katamtaman (Baitang 4-6)"}>
                    {systemPassageCatalog.filter(p => p.category === 'Moderate').slice(0, 15).map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </optgroup>
                  <optgroup label={isEn ? "Expert (Grade 7+)" : "Eksperto (Baitang 7+)"}>
                    {systemPassageCatalog.filter(p => p.category === 'Expert').slice(0, 15).map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            )}

            <form onSubmit={handleSavePassage} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  {isEn ? "Passage Title" : "Pamagat ng Talata"}
                </label>
                <input
                  type="text"
                  required
                  value={passageTitle}
                  onChange={(e) => setPassageTitle(e.target.value)}
                  placeholder={isEn ? "e.g. The Honest Farmer" : "Hal. Ang Masipag na Magsasaka"}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-slate-900 placeholder-gray-400 focus:outline-none focus:border-[#0096FF] focus:bg-white text-sm font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                    {isEn ? "Grade Level" : "Baitang / Antas"}
                  </label>
                  <select
                    value={passageGrade}
                    onChange={(e) => setPassageGrade(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#0096FF] focus:bg-white"
                  >
                    <option value="Grade 4">Grade 4</option>
                    <option value="Grade 5">Grade 5</option>
                    <option value="Grade 6">Grade 6</option>
                    <option value="Grade 7">Grade 7</option>
                    <option value="General">{isEn ? "General" : "Pangkalahatan (General)"}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                    {isEn ? "Reading Timer (Seconds)" : "Oras ng Pagbasa (Segundo)"}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="5"
                      max="600"
                      required
                      value={passageTimer}
                      onChange={(e) => setPassageTimer(e.target.value)}
                      placeholder="e.g. 10"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-slate-900 text-sm font-bold focus:outline-none focus:border-[#0096FF] focus:bg-white"
                    />
                    <span className="absolute right-4 top-3 text-xs text-gray-400 font-semibold">sec</span>
                  </div>
                  {/* Quick Preset Buttons */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {[10, 15, 20, 30, 45, 60, 90].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPassageTimer(preset)}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition-colors ${
                          parseInt(passageTimer, 10) === preset
                            ? 'bg-[#0096FF] text-white border-[#0096FF]'
                            : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        {preset}s
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  {isEn ? "Passage Content (Tagalog)" : "Nilalaman ng Babasahing Talata (Tagalog)"}
                </label>
                <textarea
                  required
                  rows={6}
                  value={passageContent}
                  onChange={(e) => setPassageContent(e.target.value)}
                  placeholder={isEn ? "Type or paste the complete reading paragraph here..." : "I-type o i-paste ang buong talata dito..."}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-slate-900 placeholder-gray-400 focus:outline-none focus:border-[#0096FF] focus:bg-white leading-relaxed font-serif text-sm"
                ></textarea>
                <div className="text-right text-[11px] text-gray-400 mt-1">
                  {isEn ? "Word Count:" : "Bilang ng Salita:"} {passageContent.trim() ? passageContent.trim().split(/\s+/).length : 0}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsPassageModalOpen(false)}
                  className="px-5 py-2.5 rounded-full text-gray-500 hover:text-slate-900 font-bold text-sm"
                >
                  {isEn ? "Cancel" : "Kanselahin"}
                </button>
                <button
                  type="submit"
                  disabled={passageSaving}
                  className="px-6 py-2.5 bg-[#0096FF] hover:bg-blue-600 text-white font-bold rounded-full text-sm transition-colors disabled:opacity-50 shadow-md shadow-blue-500/20"
                >
                  {passageSaving ? (isEn ? "Saving..." : "Inililigtas...") : (isEn ? "Save Passage" : "I-save ang Talata")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          MODAL: STUDENT MISCUE BREAKDOWN
          ------------------------------------------------------------- */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6 pb-4 border-b border-gray-200">
              <div>
                <span className="text-xs uppercase font-bold text-gray-500">
                  {isEn ? "Detailed Student Evaluation" : "Detalyadong Pagsusuri ng Mag-aaral"}
                </span>
                <h3 className="text-2xl font-black text-slate-900">{selectedRecord.student_name}</h3>
                <p className="text-sm text-[#0096FF] font-medium">{selectedRecord.passage_title}</p>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="p-2 text-gray-400 hover:text-slate-900 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Score Grid */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200 text-center">
                <span className="text-[10px] uppercase font-bold text-gray-500">Accuracy</span>
                <div className="text-xl font-black text-[#0096FF]">{selectedRecord.accuracy_rate}%</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200 text-center">
                <span className="text-[10px] uppercase font-bold text-gray-500">WCPM</span>
                <div className="text-xl font-black text-slate-900">{selectedRecord.wcpm}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200 text-center">
                <span className="text-[10px] uppercase font-bold text-gray-500">
                  {isEn ? "Correct Words" : "Tamang Salita"}
                </span>
                <div className="text-xl font-black text-emerald-600">{selectedRecord.correct_words} / {selectedRecord.total_target_words}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200 text-center">
                <span className="text-[10px] uppercase font-bold text-gray-500">
                  {isEn ? "Total Miscues" : "Mga Miscue"}
                </span>
                <div className="text-xl font-black text-red-600">{selectedRecord.errors_detected}</div>
              </div>
            </div>

            {/* Stutter Badges */}
            {selectedRecord.stutter_words && selectedRecord.stutter_words.length > 0 && (
              <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200">
                <span className="text-xs font-bold text-amber-800 block mb-2">
                  {isEn ? "Detected Disfluencies / Repetitions:" : "Natukoy na Utal / Pag-uulit (Disfluencies):"}
                </span>
                <div className="flex flex-wrap gap-2">
                  {selectedRecord.stutter_words.map((w, i) => (
                    <span key={i} className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg text-xs font-mono font-bold border border-amber-200">
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Step-by-Step Alignment Trace */}
            {selectedRecord.trace_json && selectedRecord.trace_json.length > 0 && (
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-3">
                  {isEn ? "Word-by-Word Analysis (Needleman-Wunsch Alignment & MLD):" : "Pagsusuri sa Bawat Salita (Needleman-Wunsch Alignment & MLD):"}
                </span>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                  {selectedRecord.trace_json.map((step, idx) => {
                    let badge = 'bg-emerald-50 border-emerald-200 text-emerald-800';
                    let label = isEn ? 'CORRECT' : 'TAMA';

                    if (step.is_vowel_shift) {
                      badge = 'bg-blue-50 border-blue-200 text-blue-800';
                      label = 'DIALECT VOWEL SHIFT';
                    } else if (step.type === 'substitution') {
                      badge = 'bg-red-50 border-red-200 text-red-800';
                      label = 'MISPRONUNCIATION';
                    } else if (step.type === 'deletion') {
                      badge = 'bg-amber-50 border-amber-200 text-amber-800';
                      label = isEn ? 'OMISSION (SKIPPED)' : 'OMISSION (LINAKTAWAN)';
                    } else if (step.type === 'insertion') {
                      badge = 'bg-purple-50 border-purple-200 text-purple-800';
                      label = isEn ? 'INSERTION (ADDED)' : 'INSERTION (DAGDAG)';
                    }

                    return (
                      <div key={idx} className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${badge}`}>
                        <div>
                          <strong className="text-slate-900">Target:</strong> {step.target || "-"} &bull; <strong className="text-slate-900">{isEn ? "Spoken:" : "Binigkas:"}</strong> {step.spoken || "-"}
                        </div>
                        <span className="font-mono font-bold text-[10px] uppercase px-2 py-0.5 rounded bg-white/80 border border-current">
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-gray-200 text-right">
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-slate-800 font-bold rounded-full text-xs transition-colors"
              >
                {isEn ? "Close" : "Isara"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
