import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function AdminPortal() {
  const navigate = useNavigate();

  // Status & Auth state
  const [adminStatus, setAdminStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(() => {
    const token = localStorage.getItem('readfil_admin_token');
    const profile = localStorage.getItem('readfil_admin_profile');
    return token && profile ? { token, admin: JSON.parse(profile) } : null;
  });

  // Active dashboard tab
  const [activeTab, setActiveTab] = useState('overview');

  // MFA & Auth form state
  const [authStep, setAuthStep] = useState('login'); // 'login' | 'pin' | 'otp' | 'recovery'
  const [tempToken, setTempToken] = useState('');
  const [emailHint, setEmailHint] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(60);

  // Setup Wizard State
  const [setupForm, setSetupForm] = useState({
    fullName: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    pin: '',
    confirmPin: ''
  });
  const [recoveryCode, setRecoveryCode] = useState(null);
  const [savedRecoveryAck, setSavedRecoveryAck] = useState(false);

  // Login Form State
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [pinDigits, setPinDigits] = useState(['', '', '', '', '', '']);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [recoveryInput, setRecoveryInput] = useState('');

  // Dashboard Data State
  const [stats, setStats] = useState(null);
  const [nlpRules, setNlpRules] = useState([]);
  const [nlpSearch, setNlpSearch] = useState('');
  const [nlpFilter, setNlpFilter] = useState('all');
  const [teachers, setTeachers] = useState([]);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [records, setRecords] = useState([]);
  const [recordSearch, setRecordSearch] = useState('');
  const [recordLevelFilter, setRecordLevelFilter] = useState('all');
  const [systemSettings, setSystemSettings] = useState({});
  const [auditLogs, setAuditLogs] = useState([]);

  // Modals & Feedback
  const [toast, setToast] = useState(null);
  const [isAddNlpModalOpen, setIsAddNlpModalOpen] = useState(false);
  const [newNlpRule, setNewNlpRule] = useState({ spoken_text: '', replacement_text: '', description: '', is_regex: false });
  const [nlpTesterInput, setNlpTesterInput] = useState('Pumunta si tiago sa manga atinas kanina upang magbasa.');
  const [nlpTesterResult, setNlpTesterResult] = useState(null);
  const [nlpTesting, setNlpTesting] = useState(false);

  // Teacher Modals
  const [isAddTeacherModalOpen, setIsAddTeacherModalOpen] = useState(false);
  const [newTeacher, setNewTeacher] = useState({ full_name: '', username: '', email: '', department: 'Filipino Dept', classroom_pin: '', password: '' });
  const [resetPwModal, setResetPwModal] = useState({ open: false, teacher: null, newPassword: '' });
  const [visiblePins, setVisiblePins] = useState({});

  // DB Restore Modal
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreLoading, setRestoreLoading] = useState(false);

  // Refs for OTP & PIN boxes
  const pinRefs = useRef([]);
  const otpRefs = useRef([]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    fetchAdminStatus();
  }, []);

  const fetchAdminStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/admin/status`);
      const data = await res.json();
      setAdminStatus(data);

      if (data.is_setup && session?.token) {
        const verifyRes = await fetch(`${API_BASE}/api/admin/verify-session`, {
          headers: { Authorization: `Bearer ${session.token}` }
        });
        const verifyData = await verifyRes.json();
        if (verifyData.valid) {
          loadDashboardData(session.token);
        } else {
          localStorage.removeItem('readfil_admin_token');
          localStorage.removeItem('readfil_admin_profile');
          setSession(null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch admin status:', err);
      showToast('Could not reach backend server.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadDashboardData = async (token) => {
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [statsRes, nlpRes, teachersRes, recordsRes, settingsRes, auditRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/stats`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/api/admin/nlp/rules`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/api/admin/teachers`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/api/admin/records`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/api/admin/system/config`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/api/admin/audit-logs`, { headers }).then(r => r.json())
      ]);

      if (statsRes.success) setStats(statsRes.stats);
      if (nlpRes.success) setNlpRules(nlpRes.rules);
      if (teachersRes.success) setTeachers(teachersRes.teachers);
      if (recordsRes.success) setRecords(recordsRes.records);
      if (settingsRes.success) setSystemSettings(settingsRes.settings);
      if (auditRes.success) setAuditLogs(auditRes.logs);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      showToast('Error refreshing data.', 'error');
    }
  };

  useEffect(() => {
    let interval = null;
    if (authStep === 'otp' && otpCountdown > 0) {
      interval = setInterval(() => setOtpCountdown(c => c - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [authStep, otpCountdown]);

  // Handle Setup Submit
  const handleSetupSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (setupForm.password !== setupForm.confirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }
    if (setupForm.pin.length !== 6 || !/^\d{6}$/.test(setupForm.pin)) {
      setAuthError('Security PIN must be exactly 6 digits.');
      return;
    }
    if (setupForm.pin !== setupForm.confirmPin) {
      setAuthError('PIN confirmation does not match.');
      return;
    }

    try {
      setAuthLoading(true);
      const res = await fetch(`${API_BASE}/api/admin/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: setupForm.fullName,
          email: setupForm.email,
          username: setupForm.username,
          password: setupForm.password,
          pin: setupForm.pin
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Setup failed');

      setRecoveryCode(data.recovery_key || data.recovery_code);
      setAdminStatus({ is_setup: true });
      showToast('Admin account created successfully!');
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Step 1: Login
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      setAuthLoading(true);
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid credentials');

      if (data.temp_token) setTempToken(data.temp_token);
      setAuthStep('pin');
      setTimeout(() => pinRefs.current[0]?.focus(), 100);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Step 2: 6-Digit PIN
  const handlePinSubmit = async (eOrCode) => {
    if (eOrCode && typeof eOrCode === 'object' && eOrCode.preventDefault) {
      eOrCode.preventDefault();
    }
    const pin = (typeof eOrCode === 'string' && eOrCode.length === 6)
      ? eOrCode
      : pinDigits.join('');

    if (pin.length !== 6) {
      setAuthError('Please enter all 6 digits of your PIN.');
      return;
    }
    setAuthError('');
    try {
      setAuthLoading(true);
      const res = await fetch(`${API_BASE}/api/admin/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, temp_token: tempToken })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid PIN');

      if (data.temp_token) setTempToken(data.temp_token);
      setEmailHint(data.masked_email || data.email || data.email_hint || '');
      setAuthError('');
      setAuthStep('otp');
      setOtpCountdown(60);
      showToast(`Verification code sent to ${data.masked_email || data.email || 'your email'}`);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Step 3: Email OTP
  const handleOtpSubmit = async (eOrCode) => {
    if (eOrCode && typeof eOrCode === 'object' && eOrCode.preventDefault) {
      eOrCode.preventDefault();
    }
    const otp = (typeof eOrCode === 'string' && eOrCode.length === 6)
      ? eOrCode
      : otpDigits.join('');

    if (otp.length !== 6) {
      setAuthError('Please enter the 6-digit code.');
      return;
    }
    setAuthError('');
    try {
      setAuthLoading(true);
      const res = await fetch(`${API_BASE}/api/admin/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp, code: otp, temp_token: tempToken })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid code');

      setAuthError('');
      const sessionToken = data.session_token || data.token;
      const adminProfile = data.admin || { username: loginUsername, full_name: 'Administrator', email: '' };
      localStorage.setItem('readfil_admin_token', sessionToken);
      localStorage.setItem('readfil_admin_profile', JSON.stringify(adminProfile));
      setSession({ token: sessionToken, admin: adminProfile });
      showToast(`Welcome, ${adminProfile.full_name}!`);
      loadDashboardData(sessionToken);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Emergency Recovery Key
  const handleRecoverySubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      setAuthLoading(true);
      const res = await fetch(`${API_BASE}/api/admin/verify-recovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recovery_key: recoveryInput.trim(),
          recovery_code: recoveryInput.trim(),
          code: recoveryInput.trim(),
          temp_token: tempToken
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid recovery key');

      const sessionToken = data.session_token || data.token;
      const adminProfile = data.admin || { username: loginUsername, full_name: 'Administrator', email: '' };
      localStorage.setItem('readfil_admin_token', sessionToken);
      localStorage.setItem('readfil_admin_profile', JSON.stringify(adminProfile));
      setSession({ token: sessionToken, admin: adminProfile });
      showToast('Logged in with recovery key!');
      loadDashboardData(sessionToken);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpCountdown > 0) return;
    try {
      setAuthLoading(true);
      const res = await fetch(`${API_BASE}/api/admin/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp_token: tempToken })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend code');
      setOtpCountdown(60);
      showToast('New verification code sent to your email.');
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (session?.token) {
      try {
        await fetch(`${API_BASE}/api/admin/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token}` }
        });
      } catch (err) {
        console.error('Logout error:', err);
      }
    }
    localStorage.removeItem('readfil_admin_token');
    localStorage.removeItem('readfil_admin_profile');
    setSession(null);
    setAuthStep('login');
    setLoginUsername('');
    setLoginPassword('');
    setPinDigits(['', '', '', '', '', '']);
    setOtpDigits(['', '', '', '', '', '']);
    showToast('Logged out successfully.');
  };

  const handleDigitChange = (index, value, digits, setDigits, nextRefs, autoSubmitFunc) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...digits];
    newDigits[index] = value.slice(-1);
    setDigits(newDigits);
    setAuthError('');

    if (value && index < 5) {
      nextRefs.current[index + 1]?.focus();
    }
    if (newDigits.every(d => d !== '') && autoSubmitFunc) {
      const fullCode = newDigits.join('');
      setTimeout(() => autoSubmitFunc(fullCode), 60);
    }
  };

  const handleDigitKeyDown = (index, e, digits, nextRefs) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        nextRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      nextRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      nextRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitPaste = (e, setDigits, nextRefs, autoSubmitFunc) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;
    const newDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < pastedData.length; i++) {
      newDigits[i] = pastedData[i];
    }
    setDigits(newDigits);
    setAuthError('');
    const focusIdx = Math.min(pastedData.length, 5);
    nextRefs.current[focusIdx]?.focus();

    if (pastedData.length === 6 && autoSubmitFunc) {
      setTimeout(() => autoSubmitFunc(pastedData), 60);
    }
  };

  // NLP Rules
  const handleAddNlpRule = async (e) => {
    e.preventDefault();
    if (!newNlpRule.spoken_text.trim() || !newNlpRule.replacement_text.trim()) {
      showToast('Both spoken text and correction are required.', 'error');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/admin/nlp/rules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify(newNlpRule)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add rule');

      showToast('Correction rule added!');
      setIsAddNlpModalOpen(false);
      setNewNlpRule({ spoken_text: '', replacement_text: '', description: '', is_regex: false });
      loadDashboardData(session.token);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleToggleNlpRule = async (ruleId) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/nlp/rules/${ruleId}/toggle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to toggle rule');
      showToast(`Rule is now ${data.is_active ? 'Active' : 'Inactive'}`);
      loadDashboardData(session.token);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteNlpRule = async (ruleId) => {
    if (!window.confirm('Delete this correction rule?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/nlp/rules/${ruleId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete rule');
      showToast('Rule deleted.');
      loadDashboardData(session.token);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleTestNlpPlayground = async () => {
    if (!nlpTesterInput.trim()) return;
    try {
      setNlpTesting(true);
      const res = await fetch(`${API_BASE}/api/admin/nlp/rules/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify({ sample_text: nlpTesterInput })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Test failed');
      setNlpTesterResult(data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setNlpTesting(false);
    }
  };

  // Teachers
  const handleAddTeacher = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/admin/teachers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify(newTeacher)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create teacher');

      showToast(`Teacher ${newTeacher.full_name} added with PIN: ${data.classroom_pin}`);
      setIsAddTeacherModalOpen(false);
      setNewTeacher({ full_name: '', username: '', email: '', department: 'Filipino Dept', classroom_pin: '', password: '' });
      loadDashboardData(session.token);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleResetTeacherPassword = async (e) => {
    e.preventDefault();
    if (!resetPwModal.teacher || !resetPwModal.newPassword) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/teachers/${resetPwModal.teacher.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify({ new_password: resetPwModal.newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');

      showToast(`Password updated for ${resetPwModal.teacher.full_name}`);
      setResetPwModal({ open: false, teacher: null, newPassword: '' });
      loadDashboardData(session.token);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteTeacher = async (teacherId, teacherName) => {
    if (!window.confirm(`Delete teacher account "${teacherName}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/teachers/${teacherId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete teacher');

      showToast(`Teacher ${teacherName} removed.`);
      loadDashboardData(session.token);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Database
  const handleDownloadBackup = () => {
    if (!session?.token) return;
    window.open(`${API_BASE}/api/admin/db/download?token=${encodeURIComponent(session.token)}`, '_blank');
    showToast('Database download started.');
  };

  const handleRestoreDatabase = async (e) => {
    e.preventDefault();
    if (!restoreFile) {
      showToast('Please select a .db file.', 'error');
      return;
    }
    if (!restorePassword) {
      showToast('Admin password is required.', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('database', restoreFile);
    formData.append('db_file', restoreFile);
    formData.append('admin_password', restorePassword);

    try {
      setRestoreLoading(true);
      const res = await fetch(`${API_BASE}/api/admin/db/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Restore failed');

      showToast('Database restored successfully!');
      setIsRestoreModalOpen(false);
      setRestoreFile(null);
      setRestorePassword('');
      loadDashboardData(session.token);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRestoreLoading(false);
    }
  };

  const handlePurgeAudio = async () => {
    if (!window.confirm('Delete temporary audio files older than 7 days? Permanent scores will not be deleted.')) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/db/cleanup-audio`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Purge failed');
      showToast(`Audio cleanup complete (${data.deleted_count} files removed).`);
      loadDashboardData(session.token);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify(systemSettings)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update settings');

      showToast('Settings saved.');
      loadDashboardData(session.token);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleExportRecords = () => {
    if (!session?.token) return;
    window.open(`${API_BASE}/api/admin/records/export?token=${encodeURIComponent(session.token)}`, '_blank');
    showToast('Exporting student records to CSV...');
  };

  const togglePinVisibility = (teacherId) => {
    setVisiblePins(prev => ({ ...prev, [teacherId]: !prev[teacherId] }));
  };

  // Loading Screen (Clean ReadFil Style)
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center font-sans p-4">
        <div className="w-12 h-12 border-4 border-[#0096FF]/20 border-t-[#0096FF] rounded-full animate-spin mb-4"></div>
        <div className="text-2xl font-black text-[#0096FF]">ReadFil</div>
        <div className="text-xs text-gray-500 mt-1 font-medium">Loading Administrator Portal...</div>
      </div>
    );
  }

  // ==========================================
  // VIEW 1: ADMIN SETUP (CLEAN READFIL WHITE THEME)
  // ==========================================
  if (adminStatus && !adminStatus.is_setup) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-gray-800 flex flex-col justify-center items-center p-4 sm:p-6 font-sans">
        <div className="w-full max-w-lg mb-6 text-center">
          <Link to="/" className="inline-block text-3xl font-black text-[#0096FF] tracking-tight hover:opacity-90 transition-opacity mb-2">
            ReadFil
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Administrator Setup</h1>
          <p className="text-sm text-gray-500 mt-1">Set up your school administrator account.</p>
        </div>

        <div className="w-full max-w-lg bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
          {recoveryCode ? (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                <div className="font-bold text-sm mb-1">Save Your Emergency Recovery Key</div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Keep this 16-character key in a safe place. If you ever lose access to your email, you can use this key to log in.
                </p>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Recovery Key</div>
                <div className="font-mono text-xl sm:text-2xl font-bold text-[#0096FF] tracking-wider select-all py-1">
                  {recoveryCode}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(recoveryCode);
                    showToast('Key copied to clipboard!');
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs transition-colors"
                >
                  Copy Key
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([`READFIL EMERGENCY RECOVERY KEY:\n${recoveryCode}\nKeep this file confidential.`], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `readfil_recovery_key.txt`;
                    a.click();
                    showToast('Key file downloaded!');
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#0096FF] hover:bg-[#007acc] text-white font-semibold text-xs transition-colors"
                >
                  Download .txt
                </button>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="ack"
                  checked={savedRecoveryAck}
                  onChange={(e) => setSavedRecoveryAck(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-[#0096FF] focus:ring-[#0096FF] cursor-pointer"
                />
                <label htmlFor="ack" className="text-xs text-gray-600 cursor-pointer select-none">
                  I have saved this recovery key in a safe place.
                </label>
              </div>

              <button
                type="button"
                disabled={!savedRecoveryAck}
                onClick={() => {
                  setRecoveryCode(null);
                  setAuthStep('login');
                  setLoginUsername(setupForm.username);
                }}
                className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all ${savedRecoveryAck ? 'bg-[#0096FF] hover:bg-[#007acc] text-white shadow-md cursor-pointer' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
              >
                Log In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSetupSubmit} className="space-y-4">
              {authError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs">
                  {authError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    value={setupForm.fullName}
                    onChange={(e) => setSetupForm({ ...setupForm, fullName: e.target.value })}
                    placeholder="e.g. Maria Santos"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#0096FF] focus:ring-2 focus:ring-[#0096FF]/20 outline-none transition-all text-sm bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    value={setupForm.email}
                    onChange={(e) => setSetupForm({ ...setupForm, email: e.target.value })}
                    placeholder="admin@school.edu.ph"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#0096FF] focus:ring-2 focus:ring-[#0096FF]/20 outline-none transition-all text-sm bg-gray-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Username</label>
                <input
                  type="text"
                  required
                  value={setupForm.username}
                  onChange={(e) => setSetupForm({ ...setupForm, username: e.target.value })}
                  placeholder="admin"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#0096FF] focus:ring-2 focus:ring-[#0096FF]/20 outline-none transition-all text-sm bg-gray-50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={setupForm.password}
                    onChange={(e) => setSetupForm({ ...setupForm, password: e.target.value })}
                    placeholder="Min. 8 characters"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#0096FF] focus:ring-2 focus:ring-[#0096FF]/20 outline-none transition-all text-sm bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Confirm Password</label>
                  <input
                    type="password"
                    required
                    value={setupForm.confirmPassword}
                    onChange={(e) => setSetupForm({ ...setupForm, confirmPassword: e.target.value })}
                    placeholder="Repeat password"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#0096FF] focus:ring-2 focus:ring-[#0096FF]/20 outline-none transition-all text-sm bg-gray-50"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100 my-2">
                <div className="font-semibold text-xs text-[#0096FF] mb-1">6-Digit Security PIN</div>
                <p className="text-[11px] text-gray-500 mb-3">
                  This 6-digit PIN is required whenever you log in or reset passwords.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Enter 6-Digit PIN</label>
                    <input
                      type="password"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      required
                      value={setupForm.pin}
                      onChange={(e) => setSetupForm({ ...setupForm, pin: e.target.value.replace(/\D/g, '') })}
                      placeholder="e.g. 123456"
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-center font-mono text-base font-bold text-gray-800 focus:border-[#0096FF] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Confirm PIN</label>
                    <input
                      type="password"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      required
                      value={setupForm.confirmPin}
                      onChange={(e) => setSetupForm({ ...setupForm, confirmPin: e.target.value.replace(/\D/g, '') })}
                      placeholder="Repeat 6 digits"
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-center font-mono text-base font-bold text-gray-800 focus:border-[#0096FF] outline-none"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3.5 rounded-xl font-bold text-white bg-[#0096FF] hover:bg-[#007acc] transition-all shadow-md hover:shadow-lg cursor-pointer disabled:opacity-50 text-sm mt-2"
              >
                {authLoading ? 'Creating Account...' : 'Set Up Admin'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: LOGIN (CLEAN READFIL WHITE THEME)
  // ==========================================
  if (!session) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-gray-800 flex flex-col justify-center items-center p-4 sm:p-6 font-sans">
        <div className="w-full max-w-md text-center mb-6">
          <Link to="/" className="inline-block text-3xl font-black text-[#0096FF] tracking-tight hover:opacity-90 transition-opacity mb-2">
            ReadFil
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Admin Log In</h1>
          <p className="text-xs text-gray-500 mt-1">Sign in to manage your school system</p>
        </div>

        <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
          {authError && (
            <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs">
              {authError}
            </div>
          )}

          {/* STEP 1: USERNAME & PASSWORD */}
          {authStep === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Username</label>
                <input
                  type="text"
                  required
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#0096FF] focus:ring-2 focus:ring-[#0096FF]/20 outline-none transition-all text-sm bg-gray-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#0096FF] focus:ring-2 focus:ring-[#0096FF]/20 outline-none transition-all text-sm bg-gray-50"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3.5 rounded-xl font-bold text-white bg-[#0096FF] hover:bg-[#007acc] transition-all shadow-md hover:shadow-lg cursor-pointer disabled:opacity-50 text-sm mt-2"
              >
                {authLoading ? 'Signing In...' : 'Log In'}
              </button>
            </form>
          )}

          {/* STEP 2: 6-DIGIT PIN */}
          {authStep === 'pin' && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="text-sm font-semibold text-gray-800">Enter your 6-Digit PIN</div>
                <div className="text-xs text-gray-500 mt-0.5">Please provide your security PIN to continue.</div>
              </div>

              <div className="flex justify-center gap-2">
                {pinDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (pinRefs.current[idx] = el)}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    disabled={authLoading}
                    onChange={(e) => handleDigitChange(idx, e.target.value, pinDigits, setPinDigits, pinRefs, handlePinSubmit)}
                    onKeyDown={(e) => handleDigitKeyDown(idx, e, pinDigits, pinRefs)}
                    onPaste={(e) => handleDigitPaste(e, setPinDigits, pinRefs, handlePinSubmit)}
                    className="w-11 h-12 text-center text-xl font-mono font-bold bg-gray-50 border border-gray-300 rounded-xl text-gray-800 focus:border-[#0096FF] focus:ring-2 focus:ring-[#0096FF]/20 outline-none transition-all disabled:opacity-50"
                  />
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthStep('login');
                    setPinDigits(['', '', '', '', '', '']);
                    setAuthError('');
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={authLoading || pinDigits.some(d => !d)}
                  onClick={() => handlePinSubmit()}
                  className="flex-1 py-2.5 rounded-xl bg-[#0096FF] hover:bg-[#007acc] text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {authLoading ? 'Verifying...' : 'Continue'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: EMAIL OTP */}
          {authStep === 'otp' && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="text-sm font-semibold text-gray-800">Enter Verification Code</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Code sent to <span className="font-semibold text-gray-700">{emailHint || 'your email'}</span>
                </div>
              </div>

              <div className="flex justify-center gap-2">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (otpRefs.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    disabled={authLoading}
                    onChange={(e) => handleDigitChange(idx, e.target.value, otpDigits, setOtpDigits, otpRefs, handleOtpSubmit)}
                    onKeyDown={(e) => handleDigitKeyDown(idx, e, otpDigits, otpRefs)}
                    onPaste={(e) => handleDigitPaste(e, setOtpDigits, otpRefs, handleOtpSubmit)}
                    className="w-11 h-12 text-center text-xl font-mono font-bold bg-gray-50 border border-gray-300 rounded-xl text-gray-800 focus:border-[#0096FF] focus:ring-2 focus:ring-[#0096FF]/20 outline-none transition-all disabled:opacity-50"
                  />
                ))}
              </div>

              <div className="flex justify-between items-center text-xs text-gray-500">
                <span>Didn't get code?</span>
                <button
                  type="button"
                  disabled={otpCountdown > 0 || authLoading}
                  onClick={handleResendOtp}
                  className={`font-semibold transition-colors ${otpCountdown > 0 ? 'text-gray-400 cursor-not-allowed' : 'text-[#0096FF] hover:underline cursor-pointer'}`}
                >
                  {otpCountdown > 0 ? `Resend in ${otpCountdown}s` : 'Resend Code'}
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setAuthStep('pin');
                    setOtpDigits(['', '', '', '', '', '']);
                    setAuthError('');
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={authLoading || otpDigits.some(d => !d)}
                  onClick={() => handleOtpSubmit()}
                  className="flex-1 py-2.5 rounded-xl bg-[#0096FF] hover:bg-[#007acc] text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {authLoading ? 'Verifying...' : 'Log In'}
                </button>
              </div>

              <div className="pt-2 border-t border-gray-100 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setAuthStep('recovery');
                    setAuthError('');
                  }}
                  className="text-xs text-gray-500 hover:text-[#0096FF] hover:underline transition-colors"
                >
                  Lost email access? Use Recovery Key
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: EMERGENCY RECOVERY KEY */}
          {authStep === 'recovery' && (
            <form onSubmit={handleRecoverySubmit} className="space-y-4">
              <div className="text-center">
                <div className="text-sm font-semibold text-gray-800">Emergency Recovery Key</div>
                <div className="text-xs text-gray-500 mt-0.5">Enter your 16-character recovery key</div>
              </div>

              <div>
                <input
                  type="text"
                  required
                  value={recoveryInput}
                  onChange={(e) => setRecoveryInput(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-center font-mono text-sm font-bold tracking-widest text-gray-800 focus:border-[#0096FF] outline-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setAuthStep('otp');
                    setAuthError('');
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={authLoading || !recoveryInput.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-[#0096FF] hover:bg-[#007acc] text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {authLoading ? 'Verifying...' : 'Log In'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 3: ADMIN DASHBOARD (CLEAN READFIL WHITE THEME)
  // ==========================================
  const activeNlpCount = nlpRules.filter(r => r.is_active).length;
  const filteredNlpRules = nlpRules.filter(r => {
    const matchesSearch = (r.spoken_text || '').toLowerCase().includes(nlpSearch.toLowerCase()) ||
                          (r.replacement_text || '').toLowerCase().includes(nlpSearch.toLowerCase()) ||
                          (r.description && r.description.toLowerCase().includes(nlpSearch.toLowerCase()));
    if (!matchesSearch) return false;
    if (nlpFilter === 'active') return r.is_active;
    if (nlpFilter === 'inactive') return !r.is_active;
    return true;
  });

  const filteredTeachers = teachers.filter(t => {
    const name = t.full_name || t.name || '';
    return name.toLowerCase().includes(teacherSearch.toLowerCase()) ||
           (t.username || '').toLowerCase().includes(teacherSearch.toLowerCase()) ||
           (t.email || '').toLowerCase().includes(teacherSearch.toLowerCase()) ||
           (t.department && t.department.toLowerCase().includes(teacherSearch.toLowerCase()));
  });

  const filteredRecords = records.filter(r => {
    const matchesSearch = (r.student_name || '').toLowerCase().includes(recordSearch.toLowerCase()) ||
                          (r.teacher_name && r.teacher_name.toLowerCase().includes(recordSearch.toLowerCase())) ||
                          (r.passage_title && r.passage_title.toLowerCase().includes(recordSearch.toLowerCase()));
    if (!matchesSearch) return false;
    if (recordLevelFilter !== 'all' && r.level !== recordLevelFilter) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-gray-900 font-sans flex flex-col">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg border text-sm font-semibold flex items-center gap-2 animate-in fade-in duration-200 ${toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-blue-200 text-[#0096FF]'}`}>
          <span className={`w-2 h-2 rounded-full ${toast.type === 'error' ? 'bg-red-500' : 'bg-[#0096FF]'}`}></span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40 shadow-xs">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-2xl font-black text-[#0096FF] tracking-tight">
            ReadFil
          </Link>
          <span className="hidden sm:inline-block h-5 w-[1px] bg-gray-200"></span>
          <span className="text-sm font-bold text-gray-700">Administrator Portal</span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/classroom"
            target="_blank"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-700 transition-colors"
          >
            <span>Classroom</span>
          </Link>
          <Link
            to="/teacher"
            target="_blank"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-700 transition-colors"
          >
            <span>Teacher Portal</span>
          </Link>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-red-50 hover:text-red-600 text-xs font-semibold text-gray-700 transition-colors cursor-pointer"
          >
            Log Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex overflow-x-auto pb-2 gap-2 border-b border-gray-200 scrollbar-none">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'nlp', label: 'Speech Corrections', count: activeNlpCount },
            { id: 'teachers', label: 'Teachers', count: teachers.length },
            { id: 'records', label: 'Student Records', count: records.length },
            { id: 'db', label: 'Database Backup' },
            { id: 'settings', label: 'Settings' },
            { id: 'audit', label: 'Audit Logs' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${activeTab === tab.id ? 'bg-[#0096FF] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ========================================================= */}
        {/* TAB 1: OVERVIEW */}
        {/* ========================================================= */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Registered Teachers</div>
                <div className="text-3xl font-black text-gray-900">{stats ? stats.teachers_count : teachers.length}</div>
                <div className="text-xs text-gray-500 mt-1">Active classrooms</div>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Total Oral Evaluations</div>
                <div className="text-3xl font-black text-[#0096FF]">{stats ? stats.total_evaluations : records.length}</div>
                <div className="text-xs text-gray-500 mt-1">Phil-IRI assessments</div>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Active Speech Rules</div>
                <div className="text-3xl font-black text-gray-900">{stats ? stats.active_nlp_rules : activeNlpCount}</div>
                <div className="text-xs text-gray-500 mt-1">Phonetic corrections</div>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Database Size</div>
                <div className="text-3xl font-black text-gray-900">{stats ? `${stats.db_size_mb} MB` : '1.4 MB'}</div>
                <div className="text-xs text-gray-500 mt-1">readfil.db</div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
              <h3 className="text-base font-bold text-gray-900 mb-2">School Administration</h3>
              <p className="text-xs text-gray-500 leading-relaxed max-w-2xl">
                Manage your school's teachers, speech recognition corrections, and evaluation records directly from this dashboard.
              </p>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setActiveTab('nlp')}
                  className="px-4 py-2 rounded-xl bg-[#0096FF] hover:bg-[#007acc] text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  Add Speech Correction
                </button>
                <button
                  onClick={handleDownloadBackup}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Download Database Backup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: SPEECH CORRECTIONS */}
        {/* ========================================================= */}
        {activeTab === 'nlp' && (
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">Speech Recognition Corrections</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">
                  If the speech model transcribes a word differently from the passage (for example, 'tiago' instead of 'Tiyago'), add a correction rule here so it counts as correct.
                </p>
              </div>
              <button
                onClick={() => setIsAddNlpModalOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-[#0096FF] hover:bg-[#007acc] text-white font-bold text-xs transition-colors whitespace-nowrap cursor-pointer"
              >
                + Add Correction Rule
              </button>
            </div>

            {/* Playground */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
              <div className="text-xs font-bold text-gray-700 mb-2">Test Your Corrections</div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={nlpTesterInput}
                  onChange={(e) => setNlpTesterInput(e.target.value)}
                  placeholder="Enter sample transcribed speech to test..."
                  className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 outline-none focus:border-[#0096FF]"
                />
                <button
                  onClick={handleTestNlpPlayground}
                  disabled={nlpTesting || !nlpTesterInput.trim()}
                  className="px-5 py-2.5 rounded-xl bg-[#0096FF] hover:bg-[#007acc] text-white font-bold text-xs transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  {nlpTesting ? 'Testing...' : 'Test Correction'}
                </button>
              </div>

              {nlpTesterResult && (
                <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
                  <div className="text-xs text-gray-600">
                    <span className="font-semibold">Corrected Output: </span>
                    <span className="font-mono text-[#0096FF] font-bold">{nlpTesterResult.corrected_text}</span>
                  </div>
                  {nlpTesterResult.rules_applied && nlpTesterResult.rules_applied.length > 0 && (
                    <div className="text-xs text-gray-500">
                      <span className="font-semibold">Rules Triggered: </span>
                      {nlpTesterResult.rules_applied.map((rule, idx) => (
                        <span key={idx} className="inline-block bg-blue-50 text-[#0096FF] border border-blue-200 px-2 py-0.5 rounded text-[11px] mr-1 font-mono">
                          {rule.spoken} &rarr; {rule.replacement}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Rules Table */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={nlpSearch}
                    onChange={(e) => setNlpSearch(e.target.value)}
                    placeholder="Search rules..."
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 outline-none focus:border-[#0096FF]"
                  />
                  <select
                    value={nlpFilter}
                    onChange={(e) => setNlpFilter(e.target.value)}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700 outline-none"
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="text-xs text-gray-500">
                  {filteredNlpRules.length} rules
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-4">Spoken Word</th>
                      <th className="py-3 px-4">Correction</th>
                      <th className="py-3 px-4">Notes</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-800">
                    {filteredNlpRules.map(rule => (
                      <tr key={rule.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-gray-800">
                          {rule.spoken_text}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-[#0096FF]">
                          {rule.replacement_text}
                        </td>
                        <td className="py-3 px-4 text-gray-500">
                          {rule.description || '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleToggleNlpRule(rule.id)}
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-colors ${rule.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
                          >
                            {rule.is_active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDeleteNlpRule(rule.id)}
                            className="text-gray-400 hover:text-red-500 font-semibold transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredNlpRules.length === 0 && (
                      <tr>
                        <td colSpan="5" className="py-8 text-center text-gray-400">
                          No correction rules found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: TEACHERS */}
        {/* ========================================================= */}
        {activeTab === 'teachers' && (
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">Teachers</h3>
                <p className="text-xs text-gray-500 mt-1">Manage school teacher accounts and classroom access PINs.</p>
              </div>
              <button
                onClick={() => setIsAddTeacherModalOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-[#0096FF] hover:bg-[#007acc] text-white font-bold text-xs transition-colors whitespace-nowrap cursor-pointer"
              >
                + Add Teacher
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                <input
                  type="text"
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  placeholder="Search teachers..."
                  className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 outline-none focus:border-[#0096FF] w-64"
                />
                <span className="text-xs text-gray-500">{filteredTeachers.length} teachers</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Username & Email</th>
                      <th className="py-3 px-4">Classroom PIN</th>
                      <th className="py-3 px-4">Evaluations</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-800">
                    {filteredTeachers.map(teacher => (
                      <tr key={teacher.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 px-4 font-bold text-gray-900">
                          {teacher.full_name || teacher.name}
                        </td>
                        <td className="py-3 px-4 text-gray-600 font-mono text-[11px]">
                          <div>@{teacher.username}</div>
                          <div className="text-gray-400">{teacher.email}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1.5 bg-gray-100 px-2.5 py-1 rounded-lg font-mono font-bold text-gray-800">
                            <span>{visiblePins[teacher.id] ? teacher.classroom_pin : '••••••'}</span>
                            <button
                              onClick={() => togglePinVisibility(teacher.id)}
                              className="text-gray-500 hover:text-gray-800 text-[10px] cursor-pointer"
                            >
                              {visiblePins[teacher.id] ? 'Hide' : 'Show'}
                            </button>
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-gray-700">
                          {teacher.total_evaluations || teacher.evaluations_count || 0}
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            onClick={() => setResetPwModal({ open: true, teacher, newPassword: '' })}
                            className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-semibold transition-colors cursor-pointer"
                          >
                            Reset Password
                          </button>
                          <button
                            onClick={() => handleDeleteTeacher(teacher.id, teacher.full_name || teacher.name)}
                            className="text-gray-400 hover:text-red-500 text-[11px] font-semibold transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredTeachers.length === 0 && (
                      <tr>
                        <td colSpan="5" className="py-8 text-center text-gray-400">
                          No teachers registered.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: STUDENT RECORDS */}
        {/* ========================================================= */}
        {activeTab === 'records' && (
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">Student Reading Records</h3>
                <p className="text-xs text-gray-500 mt-1">All recorded oral reading assessments across classrooms.</p>
              </div>
              <button
                onClick={handleExportRecords}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-xs transition-colors cursor-pointer"
              >
                Export to CSV
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3 items-center justify-between">
                <input
                  type="text"
                  value={recordSearch}
                  onChange={(e) => setRecordSearch(e.target.value)}
                  placeholder="Search student or passage..."
                  className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 outline-none focus:border-[#0096FF] w-64"
                />
                <span className="text-xs text-gray-500">{filteredRecords.length} records</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Level</th>
                      <th className="py-3 px-4">Teacher</th>
                      <th className="py-3 px-4">WCPM</th>
                      <th className="py-3 px-4">Accuracy</th>
                      <th className="py-3 px-4">Profile</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-800">
                    {filteredRecords.map(rec => (
                      <tr key={rec.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 px-4 text-gray-500 text-[11px]">
                          {rec.date ? new Date(rec.date).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-3 px-4 font-bold text-gray-900">
                          {rec.student_name}
                        </td>
                        <td className="py-3 px-4 font-semibold text-[#0096FF]">
                          {rec.level}
                        </td>
                        <td className="py-3 px-4 text-gray-600">
                          {rec.teacher_name || 'System'}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-gray-900">
                          {rec.wcpm}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-emerald-600">
                          {rec.accuracy}%
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${rec.profile === 'Independent' ? 'bg-emerald-100 text-emerald-700' : rec.profile === 'Instructional' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                            {rec.profile || 'Assessed'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filteredRecords.length === 0 && (
                      <tr>
                        <td colSpan="7" className="py-8 text-center text-gray-400">
                          No student records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: DATABASE MAINTENANCE */}
        {/* ========================================================= */}
        {activeTab === 'db' && (
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
              <h3 className="text-base font-bold text-gray-900 mb-1">Database & Storage</h3>
              <p className="text-xs text-gray-500">Download backups or clean up old temporary audio recordings.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
                <div>
                  <h4 className="text-sm font-bold text-gray-900 mb-2">Download Backup</h4>
                  <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                    Download a copy of the database (<code className="text-[#0096FF]">readfil.db</code>) with all teachers, students, and records.
                  </p>
                </div>
                <button
                  onClick={handleDownloadBackup}
                  className="w-full py-2.5 rounded-xl bg-[#0096FF] hover:bg-[#007acc] text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Download .db File
                </button>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
                <div>
                  <h4 className="text-sm font-bold text-gray-900 mb-2">Restore Backup</h4>
                  <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                    Restore database from a previously downloaded .db file.
                  </p>
                </div>
                <button
                  onClick={() => setIsRestoreModalOpen(true)}
                  className="w-full py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Upload & Restore
                </button>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
                <div>
                  <h4 className="text-sm font-bold text-gray-900 mb-2">Clean Temporary Audio</h4>
                  <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                    Delete temporary audio files older than 7 days to save disk space.
                  </p>
                </div>
                <button
                  onClick={handlePurgeAudio}
                  className="w-full py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs transition-colors cursor-pointer"
                >
                  Clean Audio Files
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 6: SETTINGS */}
        {/* ========================================================= */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-gray-900">Settings</h3>
                <p className="text-xs text-gray-500 mt-1">Configure speech recognition and reading benchmarks.</p>
              </div>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#0096FF] hover:bg-[#007acc] text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Save
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Speech Engine</h4>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Mode</label>
                  <select
                    value={systemSettings.stt_mode || 'LOCAL_WAV2VEC_ONLY'}
                    onChange={(e) => setSystemSettings({ ...systemSettings, stt_mode: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 outline-none"
                  >
                    <option value="LOCAL_WAV2VEC_ONLY">LOCAL_WAV2VEC_ONLY (Offline Tagalog Model)</option>
                    <option value="HYBRID_CLOUD_LOCAL">HYBRID_CLOUD_LOCAL (Cloud-Accelerated)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Silence Trim Sensitivity (dB)</label>
                  <input
                    type="number"
                    value={systemSettings.audio_trim_top_db || 26}
                    onChange={(e) => setSystemSettings({ ...systemSettings, audio_trim_top_db: parseInt(e.target.value) || 26 })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 outline-none"
                  />
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Target WCPM Standards</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Beginner</label>
                    <input
                      type="number"
                      value={systemSettings.target_wcpm_beginner || 60}
                      onChange={(e) => setSystemSettings({ ...systemSettings, target_wcpm_beginner: parseInt(e.target.value) || 60 })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-center text-gray-800 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Moderate</label>
                    <input
                      type="number"
                      value={systemSettings.target_wcpm_moderate || 90}
                      onChange={(e) => setSystemSettings({ ...systemSettings, target_wcpm_moderate: parseInt(e.target.value) || 90 })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-center text-gray-800 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Expert</label>
                    <input
                      type="number"
                      value={systemSettings.target_wcpm_expert || 120}
                      onChange={(e) => setSystemSettings({ ...systemSettings, target_wcpm_expert: parseInt(e.target.value) || 120 })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-center text-gray-800 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* ========================================================= */}
        {/* TAB 7: AUDIT LOGS */}
        {/* ========================================================= */}
        {activeTab === 'audit' && (
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
              <h3 className="text-base font-bold text-gray-900 mb-1">Audit Logs</h3>
              <p className="text-xs text-gray-500">History of administrative events and actions.</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-4">Time</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-800">
                    {auditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 px-4 text-gray-500 text-[11px] whitespace-nowrap">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-700">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-600">
                          {log.details}
                        </td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan="3" className="py-8 text-center text-gray-400">
                          No audit events recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* MODAL: ADD NLP RULE */}
      {/* ========================================================= */}
      {isAddNlpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-md w-full shadow-xl animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-gray-900">Add Correction Rule</h3>
              <button onClick={() => setIsAddNlpModalOpen(false)} className="text-gray-400 hover:text-gray-600 font-bold">&times;</button>
            </div>

            <form onSubmit={handleAddNlpRule} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Spoken Word (Transcribed)</label>
                <input
                  type="text"
                  required
                  value={newNlpRule.spoken_text}
                  onChange={(e) => setNewNlpRule({ ...newNlpRule, spoken_text: e.target.value })}
                  placeholder="e.g. tiago or sinta"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 outline-none focus:border-[#0096FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Target Word (Passage)</label>
                <input
                  type="text"
                  required
                  value={newNlpRule.replacement_text}
                  onChange={(e) => setNewNlpRule({ ...newNlpRule, replacement_text: e.target.value })}
                  placeholder="e.g. Tiyago or sintas"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 outline-none focus:border-[#0096FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Note (Optional)</label>
                <input
                  type="text"
                  value={newNlpRule.description}
                  onChange={(e) => setNewNlpRule({ ...newNlpRule, description: e.target.value })}
                  placeholder="e.g. Grade 4 Passage"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 outline-none"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddNlpModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#0096FF] hover:bg-[#007acc] text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Add Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD TEACHER */}
      {/* ========================================================= */}
      {isAddTeacherModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-md w-full shadow-xl animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-gray-900">Add Teacher</h3>
              <button onClick={() => setIsAddTeacherModalOpen(false)} className="text-gray-400 hover:text-gray-600 font-bold">&times;</button>
            </div>

            <form onSubmit={handleAddTeacher} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newTeacher.full_name}
                  onChange={(e) => setNewTeacher({ ...newTeacher, full_name: e.target.value })}
                  placeholder="Maria Santos"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 outline-none focus:border-[#0096FF]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={newTeacher.username}
                    onChange={(e) => setNewTeacher({ ...newTeacher, username: e.target.value })}
                    placeholder="msantos"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 outline-none focus:border-[#0096FF]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newTeacher.password}
                    onChange={(e) => setNewTeacher({ ...newTeacher, password: e.target.value })}
                    placeholder="Min. 6 chars"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 outline-none focus:border-[#0096FF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={newTeacher.email}
                  onChange={(e) => setNewTeacher({ ...newTeacher, email: e.target.value })}
                  placeholder="msantos@school.edu.ph"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 outline-none focus:border-[#0096FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Classroom PIN</label>
                <input
                  type="text"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={newTeacher.classroom_pin}
                  onChange={(e) => setNewTeacher({ ...newTeacher, classroom_pin: e.target.value.replace(/\D/g, '') })}
                  placeholder="Auto or 6 digits"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-center font-mono text-gray-800 outline-none"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddTeacherModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#0096FF] hover:bg-[#007acc] text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Create Teacher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: RESET PASSWORD */}
      {/* ========================================================= */}
      {resetPwModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-md w-full shadow-xl animate-in fade-in zoom-in duration-150">
            <h3 className="text-base font-bold text-gray-900 mb-2">
              Reset Password for {resetPwModal.teacher?.full_name || resetPwModal.teacher?.name}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Enter a new password for @{resetPwModal.teacher?.username}.
            </p>

            <form onSubmit={handleResetTeacherPassword} className="space-y-4">
              <div>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={resetPwModal.newPassword}
                  onChange={(e) => setResetPwModal({ ...resetPwModal, newPassword: e.target.value })}
                  placeholder="New password"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 outline-none focus:border-[#0096FF]"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setResetPwModal({ open: false, teacher: null, newPassword: '' })}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#0096FF] hover:bg-[#007acc] text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Save Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: RESTORE DATABASE */}
      {/* ========================================================= */}
      {isRestoreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-md w-full shadow-xl animate-in fade-in zoom-in duration-150">
            <h3 className="text-base font-bold text-gray-900 mb-1">Restore Database</h3>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Uploading a .db file will replace the current database with the backup.
            </p>

            <form onSubmit={handleRestoreDatabase} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Select Backup File (.db)</label>
                <input
                  type="file"
                  required
                  accept=".db,.sqlite,.sqlite3"
                  onChange={(e) => setRestoreFile(e.target.files[0])}
                  className="w-full text-xs text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-800 hover:file:bg-gray-200 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Admin Password</label>
                <input
                  type="password"
                  required
                  value={restorePassword}
                  onChange={(e) => setRestorePassword(e.target.value)}
                  placeholder="Enter your password to authorize"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 outline-none focus:border-[#0096FF]"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsRestoreModalOpen(false);
                    setRestoreFile(null);
                    setRestorePassword('');
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={restoreLoading}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {restoreLoading ? 'Restoring...' : 'Restore'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
