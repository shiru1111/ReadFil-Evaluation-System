import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from './contexts/LanguageContext';
import SoundWaveBackground from './components/SoundWaveBackground';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function TeacherPortal() {
  const { t } = useLanguage();

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
  const [regSecurityQuestion, setRegSecurityQuestion] = useState('Ano ang pangalan ng paborito mong guro?');
  const [regSecurityAnswer, setRegSecurityAnswer] = useState('');

  // Forgot Password Form
  const [forgotStep, setForgotStep] = useState(1); // 1: enter username, 2: answer question
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotSecurityQuestion, setForgotSecurityQuestion] = useState('');
  const [forgotSecurityAnswer, setForgotSecurityAnswer] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');

  // Dashboard Active Tab: 'passages' | 'students'
  const [activeTab, setActiveTab] = useState('passages');

  // Passages State
  const [passages, setPassages] = useState([]);
  const [isPassageModalOpen, setIsPassageModalOpen] = useState(false);
  const [editingPassage, setEditingPassage] = useState(null);
  const [passageTitle, setPassageTitle] = useState('');
  const [passageContent, setPassageContent] = useState('');
  const [passageGrade, setPassageGrade] = useState('Grade 4');
  const [passageTimer, setPassageTimer] = useState(60);
  const [passageSaving, setPassageSaving] = useState(false);

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
        setPassages(data.passages || []);
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
        throw new Error(data.error || "Maling username o password.");
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
        throw new Error(data.error || "Hindi ma-proseso ang pagrehistro.");
      }
      setAuthSuccess("Matagumpay na nakarehistro! Maaari ka nang mag-login gamit ang iyong account.");
      setAuthMode('login');
      setLoginUsername(regUsername);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Forgot Password - Step 1: Query security question
  const handleForgotStep1 = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${API_BASE}/api/teacher/security-question/${encodeURIComponent(forgotUsername)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Hindi nahanap ang username.");
      }
      setForgotSecurityQuestion(data.security_question);
      setForgotStep(2);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Forgot Password - Step 2: Reset password
  const handleForgotStep2 = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${API_BASE}/api/teacher/forgot-password/reset`, {
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
        throw new Error(data.error || "Hindi maitakda ang bagong password.");
      }
      setAuthSuccess("Matagumpay na napalitan ang iyong password! Maaari ka nang mag-login.");
      setAuthMode('login');
      setLoginUsername(forgotUsername);
      setForgotStep(1);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('readfil_teacher');
    setTeacher(null);
  };

  // Save / Update Custom Passage
  const handleSavePassage = async (e) => {
    e.preventDefault();
    if (!passageTitle.trim() || !passageContent.trim()) return;

    setPassageSaving(true);
    try {
      if (editingPassage) {
        // Update existing passage
        const res = await fetch(`${API_BASE}/api/teacher/passages/${editingPassage.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teacher_id: teacher.id,
            title: passageTitle,
            content: passageContent,
            grade_level: passageGrade,
            timer_seconds: parseInt(passageTimer, 10) || 60
          })
        });
        if (!res.ok) throw new Error("Hindi ma-update ang talata.");
      } else {
        // Create new passage
        const res = await fetch(`${API_BASE}/api/teacher/passages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teacher_id: teacher.id,
            title: passageTitle,
            content: passageContent,
            grade_level: passageGrade,
            timer_seconds: parseInt(passageTimer, 10) || 60,
            is_active: passages.length === 0 // automatically active if first passage
          })
        });
        if (!res.ok) throw new Error("Hindi ma-save ang bagong talata.");
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
    if (!window.confirm("Sigurado ka bang nais mong tanggalin ang talatang ito?")) return;
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

  // Open Edit Modal
  const openEditModal = (p) => {
    setEditingPassage(p);
    setPassageTitle(p.title);
    setPassageContent(p.content);
    setPassageGrade(p.grade_level || 'Grade 4');
    setPassageTimer(p.timer_seconds || 60);
    setIsPassageModalOpen(true);
  };

  // Open Create Modal
  const openCreateModal = () => {
    setEditingPassage(null);
    setPassageTitle('');
    setPassageContent('');
    setPassageGrade('Grade 4');
    setPassageTimer(60);
    setIsPassageModalOpen(true);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!teacher) return;
    window.open(`${API_BASE}/api/teacher/records/export?teacher_id=${teacher.id}`, '_blank');
  };

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
      <div className="min-h-screen bg-slate-950 text-white font-sans relative flex flex-col justify-between">
        <SoundWaveBackground opacity={0.15} />

        {/* Top Bar */}
        <header className="relative z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-6 sm:px-12 py-4 flex justify-between items-center">
          <Link to="/" className="text-2xl font-black text-[#0096FF] tracking-tight hover:opacity-90">
            ReadFil
          </Link>
          <Link to="/" className="text-xs uppercase font-bold text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 transition-all">
            Bumalik sa Simula
          </Link>
        </header>

        {/* Auth Card */}
        <main className="relative z-20 flex-grow flex items-center justify-center p-4 sm:p-6 my-8">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-10 max-w-md w-full shadow-2xl backdrop-blur-md">
            <div className="text-center mb-8">
              <div className="w-14 h-14 bg-gradient-to-tr from-[#0096FF] to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-blue-500/20">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                </svg>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Portal ng Guro</h1>
              <p className="text-slate-400 text-sm mt-1">Classroom Monitoring & Passage Management</p>
            </div>

            {/* Error / Success Notifications */}
            {authError && (
              <div className="mb-6 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {authError}
              </div>
            )}
            {authSuccess && (
              <div className="mb-6 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
                {authSuccess}
              </div>
            )}

            {/* TAB SELECTOR: LOGIN / REGISTER */}
            {authMode !== 'forgot' && (
              <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 mb-6">
                <button
                  onClick={() => { setAuthMode('login'); setAuthError(''); }}
                  className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${
                    authMode === 'login' ? 'bg-[#0096FF] text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Mag-Login
                </button>
                <button
                  onClick={() => { setAuthMode('register'); setAuthError(''); }}
                  className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${
                    authMode === 'register' ? 'bg-[#0096FF] text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Magrehistro
                </button>
              </div>
            )}

            {/* 1. LOGIN FORM */}
            {authMode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">Username</label>
                  <input
                    type="text"
                    required
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="hal. teacher"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#0096FF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">Password</label>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#0096FF]"
                  />
                </div>

                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => { setAuthMode('forgot'); setForgotStep(1); setAuthError(''); setAuthSuccess(''); }}
                    className="text-xs font-semibold text-[#0096FF] hover:underline"
                  >
                    Nakalimutan ang password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-3.5 bg-gradient-to-r from-[#0096FF] to-[#005FA3] hover:from-blue-500 hover:to-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
                >
                  {authLoading ? "Pumapasok..." : "Pumasok sa Dashboard"}
                </button>

                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 text-center">
                  💡 <em>Default test login:</em> Username: <strong>teacher</strong> | Password: <strong>teacher123</strong>
                </div>
              </form>
            )}

            {/* 2. REGISTER FORM */}
            {authMode === 'register' && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">Buong Pangalan</label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Guro Maria Santos"
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#0096FF]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">Username</label>
                    <input
                      type="text"
                      required
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="mariasantos"
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#0096FF]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">Email</label>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="maria@school.edu"
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#0096FF]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#0096FF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">Tanong sa Seguridad (Recovery)</label>
                  <select
                    value={regSecurityQuestion}
                    onChange={(e) => setRegSecurityQuestion(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-[#0096FF]"
                  >
                    <option value="Ano ang pangalan ng paborito mong guro?">Ano ang pangalan ng paborito mong guro?</option>
                    <option value="Ano ang pangalan ng iyong unang paaralan?">Ano ang pangalan ng iyong unang paaralan?</option>
                    <option value="Ano ang paborito mong asignatura?">Ano ang paborito mong asignatura?</option>
                    <option value="Ano ang paborito mong kulay?">Ano ang paborito mong kulay?</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">Sagot sa Tanong</label>
                  <input
                    type="text"
                    required
                    value={regSecurityAnswer}
                    onChange={(e) => setRegSecurityAnswer(e.target.value)}
                    placeholder="Ilagay ang iyong sagot..."
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#0096FF]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-3.5 bg-gradient-to-r from-[#0096FF] to-[#005FA3] hover:from-blue-500 hover:to-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
                >
                  {authLoading ? "Nirerehistro..." : "Gumawa ng Teacher Account"}
                </button>
              </form>
            )}

            {/* 3. FORGOT PASSWORD FLOW */}
            {authMode === 'forgot' && (
              <div>
                <h3 className="text-lg font-bold text-white mb-2">I-recover ang Password</h3>
                <p className="text-slate-400 text-xs mb-4">
                  {forgotStep === 1
                    ? "Ilagay ang iyong username upang makuha ang iyong tanong sa seguridad."
                    : "Sagutin ang iyong tanong sa seguridad upang makapag-set ng bagong password."}
                </p>

                {forgotStep === 1 ? (
                  <form onSubmit={handleForgotStep1} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">Username</label>
                      <input
                        type="text"
                        required
                        value={forgotUsername}
                        onChange={(e) => setForgotUsername(e.target.value)}
                        placeholder="I-type ang iyong username..."
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#0096FF]"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setAuthMode('login'); setAuthError(''); }}
                        className="w-1/3 py-3 rounded-xl border border-slate-700 text-slate-300 font-bold text-sm hover:bg-slate-800"
                      >
                        Bumalik
                      </button>
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-2/3 py-3 bg-[#0096FF] hover:bg-blue-600 text-white font-bold rounded-xl transition-colors disabled:opacity-50 text-sm"
                      >
                        {authLoading ? "Sinusuri..." : "Ipagpatuloy"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleForgotStep2} className="space-y-4">
                    <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                      <strong>Tanong:</strong> {forgotSecurityQuestion}
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">Iyong Sagot</label>
                      <input
                        type="text"
                        required
                        value={forgotSecurityAnswer}
                        onChange={(e) => setForgotSecurityAnswer(e.target.value)}
                        placeholder="I-type ang iyong sagot..."
                        className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#0096FF]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">Bagong Password</label>
                      <input
                        type="password"
                        required
                        value={forgotNewPassword}
                        onChange={(e) => setForgotNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#0096FF]"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setForgotStep(1)}
                        className="w-1/3 py-3 rounded-xl border border-slate-700 text-slate-300 font-bold text-sm hover:bg-slate-800"
                      >
                        Bumalik
                      </button>
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-2/3 py-3 bg-[#0096FF] hover:bg-blue-600 text-white font-bold rounded-xl transition-colors disabled:opacity-50 text-sm"
                      >
                        {authLoading ? "Inilalapat..." : "I-reset ang Password"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </main>

        <footer className="relative z-20 py-4 text-center text-xs text-slate-500 border-t border-slate-900">
          ReadFil Classroom Monitoring & Assessment System &bull; SQLite Persistence
        </footer>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: LOGGED IN TEACHER DASHBOARD
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans relative overflow-x-hidden">
      <SoundWaveBackground opacity={0.12} />

      {/* Top Navbar */}
      <header className="relative z-20 border-b border-slate-800 bg-slate-950/85 backdrop-blur-md px-6 sm:px-12 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <Link to="/" className="text-2xl font-black text-[#0096FF] tracking-tight hover:opacity-90">
            ReadFil
          </Link>
          <span className="text-xs uppercase font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
            Teacher Portal
          </span>
          {tokenStatus && (
            <span className="hidden lg:inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              {tokenStatus.cloud_stt_configured ? "Cloud STT Online (Token Active)" : "Local Wav2Vec Mode"}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-slate-400">Naka-login bilang:</div>
            <div className="text-sm font-bold text-white">{teacher.name}</div>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs uppercase font-bold text-red-400 hover:text-white hover:bg-red-500/20 px-3.5 py-2 rounded-xl border border-red-500/30 transition-all"
          >
            Mag-Logout
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-20 max-w-7xl mx-auto px-4 sm:px-8 py-8">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 mb-8 gap-2">
          <button
            onClick={() => setActiveTab('passages')}
            className={`flex items-center gap-2 px-6 py-3 font-bold text-sm sm:text-base border-b-2 transition-all ${
              activeTab === 'passages'
                ? 'border-[#0096FF] text-[#0096FF] bg-blue-500/10 rounded-t-xl'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            Pamamahala ng Talata ({passages.length})
          </button>

          <button
            onClick={() => setActiveTab('students')}
            className={`flex items-center gap-2 px-6 py-3 font-bold text-sm sm:text-base border-b-2 transition-all ${
              activeTab === 'students'
                ? 'border-[#0096FF] text-[#0096FF] bg-blue-500/10 rounded-t-xl'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
            </svg>
            Talaan ng mga Mag-aaral ({records.length})
          </button>
        </div>

        {/* -------------------------------------------------------------
            TAB 1: PASSAGES MANAGER
            ------------------------------------------------------------- */}
        {activeTab === 'passages' && (
          <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-black text-white">Mga Talata sa Pagbasa</h2>
                <p className="text-slate-400 text-sm">
                  Gumawa at pumili ng talatang babasahin ng buong klase sa Classroom Mode.
                </p>
              </div>
              <button
                onClick={openCreateModal}
                className="px-6 py-3 bg-[#0096FF] hover:bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/20 flex items-center gap-2 transition-transform hover:scale-[1.02]"
              >
                <span className="text-xl leading-none">+</span> Magdagdag ng Bagong Talata
              </button>
            </div>

            {passages.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center">
                <div className="w-16 h-16 bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold">📄</div>
                <h3 className="text-lg font-bold text-white mb-1">Walang Naka-save na Talata</h3>
                <p className="text-slate-400 text-sm mb-6">Magsimula sa pamamagitan ng paglikha ng iyong unang babasahin para sa mga mag-aaral.</p>
                <button onClick={openCreateModal} className="px-6 py-2.5 bg-[#0096FF] text-white font-bold rounded-xl text-sm">
                  Gumawa ng Talata Ngayon
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {passages.map((p) => {
                  const wordCount = p.content.trim().split(/\s+/).length;
                  return (
                    <div
                      key={p.id}
                      className={`relative bg-slate-900/90 border rounded-3xl p-6 shadow-xl flex flex-col justify-between transition-all ${
                        p.is_active
                          ? 'border-emerald-500/60 ring-2 ring-emerald-500/20 shadow-emerald-500/10'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        {/* Header Badges */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className="text-xs font-bold text-[#0096FF] uppercase bg-[#0096FF]/10 px-2.5 py-0.5 rounded-md border border-[#0096FF]/20">
                            {p.grade_level || "General"}
                          </span>
                          {p.is_active ? (
                            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 rounded-full">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                              AKTIBO SA KLASE
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-slate-500">Hindi Aktibo</span>
                          )}
                        </div>

                        <h3 className="text-xl font-bold text-white mb-2 tracking-tight">{p.title}</h3>
                        <p className="text-slate-300 text-sm line-clamp-3 mb-4 leading-relaxed font-serif">
                          {p.content}
                        </p>

                        <div className="flex items-center gap-4 text-xs text-slate-400 mb-6 pb-4 border-b border-slate-800">
                          <span>⏱️ <strong>{p.timer_seconds || 60}s</strong> timer</span>
                          <span>📝 <strong>{wordCount}</strong> salita</span>
                        </div>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="flex flex-col gap-2">
                        {!p.is_active && (
                          <button
                            onClick={() => handleActivatePassage(p.id)}
                            className="w-full py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                          >
                            ✓ Gawing Aktibo para sa Klase
                          </button>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditModal(p)}
                            className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition-colors"
                          >
                            I-edit
                          </button>
                          <button
                            onClick={() => handleDeletePassage(p.id)}
                            className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-bold rounded-xl text-xs transition-colors"
                          >
                            Tanggalin
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
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-lg">
                <span className="text-xs uppercase font-bold text-slate-400">Kabuuang Pagsusuri</span>
                <div className="text-3xl font-black text-white mt-1">{totalStudents}</div>
                <div className="text-[11px] text-slate-500 mt-1">mga naitalang resulta</div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-lg">
                <span className="text-xs uppercase font-bold text-slate-400">Karaniwang Accuracy</span>
                <div className="text-3xl font-black text-[#0096FF] mt-1">{avgAccuracy}%</div>
                <div className="text-[11px] text-slate-500 mt-1">Reading Accuracy Rate</div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-lg">
                <span className="text-xs uppercase font-bold text-slate-400">Karaniwang WCPM</span>
                <div className="text-3xl font-black text-blue-400 mt-1">{avgWcpm}</div>
                <div className="text-[11px] text-slate-500 mt-1">Words Correct / Minute</div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-lg flex flex-col justify-between">
                <span className="text-xs uppercase font-bold text-slate-400">Phil-IRI Antas</span>
                <div className="flex gap-2 text-xs font-bold mt-2">
                  <span className="text-emerald-400">{independentCount} Ind</span>
                  <span className="text-amber-400">{instructionalCount} Ins</span>
                  <span className="text-red-400">{frustrationCount} Fru</span>
                </div>
              </div>
            </div>

            {/* Filter & Export Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Maghanap ayon sa pangalan ng mag-aaral..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    fetchRecords(e.target.value);
                  }}
                  className="w-full px-4 py-2.5 pl-10 bg-slate-900 border border-slate-800 rounded-2xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#0096FF]"
                />
                <svg className="w-5 h-5 text-slate-500 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                I-export sa Excel / CSV
              </button>
            </div>

            {/* Records Table */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 text-xs uppercase font-bold tracking-wider">
                      <th className="py-4 px-6">Mag-aaral</th>
                      <th className="py-4 px-6">Babasahin</th>
                      <th className="py-4 px-6">Accuracy</th>
                      <th className="py-4 px-6">WCPM</th>
                      <th className="py-4 px-6">Composite</th>
                      <th className="py-4 px-6">Antas (Phil-IRI)</th>
                      <th className="py-4 px-6">Petsa</th>
                      <th className="py-4 px-6 text-center">Aksyon</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {records.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="py-12 text-center text-slate-500 font-medium">
                          {recordsLoading ? "Kinukuha ang talaan..." : "Walang nahanap na resulta ng mag-aaral."}
                        </td>
                      </tr>
                    ) : (
                      records.map((r) => {
                        let levelBadge = 'bg-slate-800 text-slate-300';
                        if (r.reading_level === 'Independent') levelBadge = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
                        else if (r.reading_level === 'Instructional') levelBadge = 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
                        else if (r.reading_level === 'Frustration') levelBadge = 'bg-red-500/20 text-red-400 border border-red-500/30';

                        return (
                          <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-4 px-6 font-bold text-white">{r.student_name}</td>
                            <td className="py-4 px-6 text-slate-300">{r.passage_title}</td>
                            <td className="py-4 px-6 font-mono font-bold text-[#0096FF]">{r.accuracy_rate}%</td>
                            <td className="py-4 px-6 font-mono font-bold text-slate-200">{r.wcpm}</td>
                            <td className="py-4 px-6 font-mono text-slate-300">{r.composite_score}</td>
                            <td className="py-4 px-6">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${levelBadge}`}>
                                {r.reading_level}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-xs text-slate-400">
                              {new Date(r.timestamp).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="py-4 px-6 text-center">
                              <button
                                onClick={() => setSelectedRecord(r)}
                                className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-[#0096FF] font-bold rounded-lg text-xs transition-colors border border-blue-500/20"
                              >
                                Detalye
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
          MODAL: ADD / EDIT PASSAGE
          ------------------------------------------------------------- */}
      {isPassageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-black text-white mb-1">
              {editingPassage ? "I-edit ang Talata" : "Magdagdag ng Bagong Talata"}
            </h3>
            <p className="text-slate-400 text-sm mb-6">
              Itakda ang pamagat, nilalaman, at takdang oras ng pagbasa para sa iyong klase.
            </p>

            <form onSubmit={handleSavePassage} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Pamagat ng Talata
                </label>
                <input
                  type="text"
                  required
                  value={passageTitle}
                  onChange={(e) => setPassageTitle(e.target.value)}
                  placeholder="Hal. Si Pagong at si Matsing"
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#0096FF]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Baitang / Antas
                  </label>
                  <select
                    value={passageGrade}
                    onChange={(e) => setPassageGrade(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-[#0096FF]"
                  >
                    <option value="Grade 4">Grade 4</option>
                    <option value="Grade 5">Grade 5</option>
                    <option value="Grade 6">Grade 6</option>
                    <option value="Grade 7">Grade 7</option>
                    <option value="General">Pangkalahatan (General)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Oras ng Pagbasa (Segundo)
                  </label>
                  <select
                    value={passageTimer}
                    onChange={(e) => setPassageTimer(parseInt(e.target.value, 10))}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-[#0096FF]"
                  >
                    <option value={30}>30 Segundo</option>
                    <option value={45}>45 Segundo</option>
                    <option value={60}>60 Segundo (1 Minuto)</option>
                    <option value={90}>90 Segundo (1.5 Minuto)</option>
                    <option value={120}>120 Segundo (2 Minuto)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Nilalaman ng Babasahing Talata (Tagalog)
                </label>
                <textarea
                  required
                  rows={6}
                  value={passageContent}
                  onChange={(e) => setPassageContent(e.target.value)}
                  placeholder="I-type o i-paste ang buong talata dito..."
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#0096FF] leading-relaxed font-serif text-sm"
                ></textarea>
                <div className="text-right text-[11px] text-slate-500 mt-1">
                  Bilang ng Salita: {passageContent.trim() ? passageContent.trim().split(/\s+/).length : 0}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPassageModalOpen(false)}
                  className="px-5 py-2.5 rounded-full text-slate-400 hover:text-white font-bold text-sm"
                >
                  Kanselahin
                </button>
                <button
                  type="submit"
                  disabled={passageSaving}
                  className="px-6 py-2.5 bg-[#0096FF] hover:bg-blue-600 text-white font-bold rounded-full text-sm transition-colors disabled:opacity-50"
                >
                  {passageSaving ? "Inililigtas..." : "I-save ang Talata"}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6 pb-4 border-b border-slate-800">
              <div>
                <span className="text-xs uppercase font-bold text-slate-400">Detalyadong Pagsusuri ng Mag-aaral</span>
                <h3 className="text-2xl font-black text-white">{selectedRecord.student_name}</h3>
                <p className="text-sm text-[#0096FF] font-medium">{selectedRecord.passage_title}</p>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="p-2 text-slate-400 hover:text-white rounded-full bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Score Grid */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400">Accuracy</span>
                <div className="text-xl font-black text-[#0096FF]">{selectedRecord.accuracy_rate}%</div>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400">WCPM</span>
                <div className="text-xl font-black text-white">{selectedRecord.wcpm}</div>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400">Tamang Salita</span>
                <div className="text-xl font-black text-emerald-400">{selectedRecord.correct_words} / {selectedRecord.total_target_words}</div>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400">Mga Miscue</span>
                <div className="text-xl font-black text-red-400">{selectedRecord.errors_detected}</div>
              </div>
            </div>

            {/* Stutter Badges */}
            {selectedRecord.stutter_words && selectedRecord.stutter_words.length > 0 && (
              <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <span className="text-xs font-bold text-amber-300 block mb-2">Natukoy na Utal / Pag-uulit (Disfluencies):</span>
                <div className="flex flex-wrap gap-2">
                  {selectedRecord.stutter_words.map((w, i) => (
                    <span key={i} className="px-2.5 py-1 bg-amber-500/20 text-amber-300 rounded-lg text-xs font-mono font-bold">
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Step-by-Step Alignment Trace */}
            {selectedRecord.trace_json && selectedRecord.trace_json.length > 0 && (
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-3">
                  Pagsusuri sa Bawat Salita (Needleman-Wunsch Alignment & MLD):
                </span>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                  {selectedRecord.trace_json.map((step, idx) => {
                    let badge = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300';
                    let label = 'TAMA';

                    if (step.is_vowel_shift) {
                      badge = 'bg-blue-500/10 border-blue-500/30 text-blue-300';
                      label = 'DIALECT VOWEL SHIFT';
                    } else if (step.type === 'substitution') {
                      badge = 'bg-red-500/10 border-red-500/30 text-red-300';
                      label = 'MISPRONUNCIATION';
                    } else if (step.type === 'deletion') {
                      badge = 'bg-amber-500/10 border-amber-500/30 text-amber-300';
                      label = 'OMISSION (LINAKTAWAN)';
                    } else if (step.type === 'insertion') {
                      badge = 'bg-purple-500/10 border-purple-500/30 text-purple-300';
                      label = 'INSERTION (DAGDAG)';
                    }

                    return (
                      <div key={idx} className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${badge}`}>
                        <div>
                          <strong className="text-white">Target:</strong> {step.target || "-"} &bull; <strong className="text-white">Binigkas:</strong> {step.spoken || "-"}
                        </div>
                        <span className="font-mono font-bold text-[10px] uppercase px-2 py-0.5 rounded bg-black/40">
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-slate-800 text-right">
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-full text-xs"
              >
                Isara
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
