import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';

export default function Results() {
  const navigate = useNavigate();
  const certificateRef = useRef(null);

  const [resultData, setResultData] = useState({
    firstName: "Student",
    lastName: "",
    level: "Overall",
    date: new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
  });

  const [readingLogs, setReadingLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'alignment', 'certificate'
  const [isExporting, setIsExporting] = useState(false);
  const [certId, setCertId] = useState("");

  useEffect(() => {
    const storedFirstName = localStorage.getItem('user_firstName') || "Student";
    const storedLastName = localStorage.getItem('user_lastName') || "";
    const storedLevel = localStorage.getItem('evaluated_level') || "Overall";
    const storedLogs = JSON.parse(localStorage.getItem('reading_logs')) || [];

    setReadingLogs(storedLogs);
    setResultData({
      firstName: storedFirstName,
      lastName: storedLastName,
      level: storedLevel,
      date: new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    });

    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    setCertId(`RF-${Date.now().toString().slice(-6)}-${randomSuffix}`);
  }, []);

  // Compute Overall Aggregate Metrics across all evaluated passages
  const totalPassages = readingLogs.length;
  const avgAccuracy = totalPassages > 0
    ? (readingLogs.reduce((acc, log) => acc + (Number(log.accuracy) || 0), 0) / totalPassages)
    : 0;
  const avgWcpm = totalPassages > 0
    ? (readingLogs.reduce((acc, log) => acc + (Number(log.wcpm) || 0), 0) / totalPassages)
    : 0;
  const totalTargetWords = readingLogs.reduce((acc, log) => acc + (Number(log.total_target_words) || 0), 0);
  const totalCorrectWords = readingLogs.reduce((acc, log) => acc + (Number(log.correct_words) || 0), 0);
  const totalSubstitutions = readingLogs.reduce((acc, log) => acc + (Number(log.substitutions) || 0), 0);
  const totalDeletions = readingLogs.reduce((acc, log) => acc + (Number(log.deletions) || 0), 0);
  const totalInsertions = readingLogs.reduce((acc, log) => acc + (Number(log.insertions) || 0), 0);

  // Phil-IRI Categorization (FR-016 / BR-006)
  const getProficiencyCategory = (acc) => {
    if (acc >= 97.0) {
      return {
        level: "Independent",
        badgeBg: "bg-emerald-500",
        badgeText: "text-emerald-700",
        pillBg: "bg-emerald-100",
        border: "border-emerald-300",
        desc: "Excels in word recognition and oral reading fluency with minimal teacher assistance."
      };
    } else if (acc >= 90.0) {
      return {
        level: "Instructional",
        badgeBg: "bg-amber-500",
        badgeText: "text-amber-800",
        pillBg: "bg-amber-100",
        border: "border-amber-300",
        desc: "Adequate reading fluency; student benefits from guided oral reading instruction."
      };
    } else {
      return {
        level: "Frustration",
        badgeBg: "bg-rose-500",
        badgeText: "text-rose-800",
        pillBg: "bg-rose-100",
        border: "border-rose-300",
        desc: "Significant reading challenges detected; requires direct remedial intervention."
      };
    }
  };

  const proficiency = getProficiencyCategory(avgAccuracy);
  const speedRatio = Math.min(avgWcpm / 100.0, 1.0);
  const overallCompositeScore = Math.round((avgAccuracy * 0.6) + (speedRatio * 100.0 * 0.4));

  const handleReturnHome = () => {
    localStorage.removeItem('evaluated_level');
    localStorage.removeItem('reading_logs');
    navigate('/');
  };

  const handleExportCertificate = async () => {
    if (!certificateRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(certificateRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `ReadFil_Certificate_${resultData.firstName}_${resultData.lastName || 'Student'}.png`;
      link.click();
    } catch (err) {
      console.error("Export certificate error:", err);
      alert("Failed to export certificate image. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-gray-900 pb-24">

      {/* Navigation Bar */}
      <nav className="w-full bg-white px-4 sm:px-10 lg:px-20 py-4 sm:py-5 flex justify-between items-center border-b border-gray-200 sticky top-0 z-40 shadow-sm backdrop-blur-md bg-white/95">
        <div className="flex items-center gap-3">
          <div className="text-xl sm:text-2xl font-black tracking-tight text-[#0096FF]">ReadFil</div>
          <span className="hidden sm:inline-block px-2.5 py-0.5 text-[10px] font-bold tracking-widest uppercase bg-blue-50 text-[#0096FF] rounded border border-blue-200">
            Phil-IRI Evaluator
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('certificate')}
            className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-[#0096FF] border border-blue-200 font-bold text-xs uppercase tracking-wider rounded-lg transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Certificate
          </button>
          <button
            onClick={handleReturnHome}
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all"
          >
            Return Home
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 mt-8">

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 mb-8 bg-white rounded-xl p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex-1 py-3 px-4 font-bold text-sm rounded-lg transition-all ${
              activeTab === 'dashboard'
                ? 'bg-[#0096FF] text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Diagnostic Dashboard
          </button>
          <button
            onClick={() => setActiveTab('alignment')}
            className={`flex-1 py-3 px-4 font-bold text-sm rounded-lg transition-all ${
              activeTab === 'alignment'
                ? 'bg-[#0096FF] text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Transcript Sequence Alignment (Sprint 6 & 7)
          </button>
          <button
            onClick={() => setActiveTab('certificate')}
            className={`flex-1 py-3 px-4 font-bold text-sm rounded-lg transition-all ${
              activeTab === 'certificate'
                ? 'bg-[#0096FF] text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Official Certificate (Sprint 8)
          </button>
        </div>

        {/* =========================================================================
            TAB 1: DIAGNOSTIC DASHBOARD & HERO KPI CARDS
           ========================================================================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-500">

            {/* Assessment Header Card */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-200">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-gray-100">
                <div>
                  <span className="text-xs font-black uppercase tracking-widest text-[#0096FF]">Phil-IRI Evaluation Result</span>
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-1 uppercase">
                    {resultData.firstName} {resultData.lastName}
                  </h1>
                  <p className="text-gray-500 text-sm mt-1">
                    Evaluated Tier: <span className="font-bold text-gray-800">{resultData.level}</span> • Date: {resultData.date}
                  </p>
                </div>

                {/* Phil-IRI Level Banner */}
                <div className={`px-6 py-4 rounded-xl border ${proficiency.border} ${proficiency.pillBg} flex items-center gap-4`}>
                  <div className={`w-3.5 h-3.5 rounded-full ${proficiency.badgeBg} animate-pulse`}></div>
                  <div>
                    <div className="text-xs uppercase tracking-wider font-extrabold text-gray-500">Phil-IRI Category</div>
                    <div className={`text-2xl font-black tracking-wide ${proficiency.badgeText} uppercase`}>
                      {proficiency.level}
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-4 italic">{proficiency.desc}</p>
            </div>

            {/* 4 Primary Metric KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">

              {/* Accuracy Rate Card */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-black uppercase tracking-widest text-gray-400">Oral Accuracy</span>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-50 text-blue-600 border border-blue-200">FR-013</span>
                </div>
                <div className="my-4">
                  <div className="text-4xl font-black text-gray-900">{avgAccuracy.toFixed(1)}%</div>
                  <div className="w-full bg-gray-100 h-2.5 rounded-full mt-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${
                        avgAccuracy >= 97 ? 'bg-emerald-500' : avgAccuracy >= 90 ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.min(avgAccuracy, 100)}%` }}
                    ></div>
                  </div>
                </div>
                <span className="text-xs text-gray-500">{totalCorrectWords} of {totalTargetWords} words correctly read</span>
              </div>

              {/* WCPM Fluency Card */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-black uppercase tracking-widest text-gray-400">Fluency Speed</span>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-50 text-blue-600 border border-blue-200">FR-012</span>
                </div>
                <div className="my-4">
                  <div className="text-4xl font-black text-gray-900">{avgWcpm.toFixed(1)}</div>
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Words Correct / Minute</span>
                </div>
                <span className="text-xs text-gray-500">Benchmark target: 100 WCPM</span>
              </div>

              {/* Composite Score Card */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-black uppercase tracking-widest text-gray-400">Composite Score</span>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-50 text-blue-600 border border-blue-200">BR-005</span>
                </div>
                <div className="my-4">
                  <div className="text-4xl font-black text-[#0096FF]">{overallCompositeScore}</div>
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Fluency + Accuracy Index</span>
                </div>
                <span className="text-xs text-gray-500">Weighted: 60% Acc + 40% WCPM</span>
              </div>

              {/* Error Breakdown Card */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-black uppercase tracking-widest text-gray-400">Error Tally</span>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-50 text-blue-600 border border-blue-200">FR-011</span>
                </div>
                <div className="my-4 flex items-center justify-around text-center">
                  <div>
                    <div className="text-2xl font-black text-amber-600">{totalSubstitutions}</div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase">Substitutions</div>
                  </div>
                  <div className="h-8 w-px bg-gray-200"></div>
                  <div>
                    <div className="text-2xl font-black text-rose-600">{totalDeletions}</div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase">Omissions</div>
                  </div>
                  <div className="h-8 w-px bg-gray-200"></div>
                  <div>
                    <div className="text-2xl font-black text-sky-600">{totalInsertions}</div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase">Additions</div>
                  </div>
                </div>
                <span className="text-xs text-gray-500">Needleman-Wunsch Alignment</span>
              </div>

            </div>

            {/* Passage Summary Table */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Passage Assessment Summary</h2>
              {readingLogs.length === 0 ? (
                <p className="text-gray-500 text-sm py-4">No reading logs recorded for this session.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-gray-600">
                    <thead className="bg-gray-50 text-gray-700 text-xs uppercase font-extrabold border-b border-gray-200">
                      <tr>
                        <th className="py-3 px-4">Passage</th>
                        <th className="py-3 px-4">Target Text</th>
                        <th className="py-3 px-4">Model Used</th>
                        <th className="py-3 px-4">Accuracy</th>
                        <th className="py-3 px-4">WCPM</th>
                        <th className="py-3 px-4">Proficiency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {readingLogs.map((log, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/70 transition-colors">
                          <td className="py-3 px-4 font-bold text-gray-900">#{idx + 1}</td>
                          <td className="py-3 px-4 max-w-xs truncate text-gray-800" title={log.target_text}>
                            {log.target_text}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-1 text-[10px] font-black rounded bg-blue-100 text-blue-800 border border-blue-200 uppercase">
                              {log.model_used || "WAV2VEC"}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold text-gray-900">{Number(log.accuracy || 0).toFixed(1)}%</td>
                          <td className="py-3 px-4 font-bold text-gray-900">{Number(log.wcpm || 0).toFixed(1)}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                              (log.accuracy || 0) >= 97
                                ? 'bg-emerald-100 text-emerald-800'
                                : (log.accuracy || 0) >= 90
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {log.proficiency_level || (log.accuracy >= 97 ? "Independent" : log.accuracy >= 90 ? "Instructional" : "Frustration")}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

        {/* =========================================================================
            TAB 2: TRANSCRIPT SEQUENCE ALIGNMENT & EXACT ERROR HIGHLIGHTING (SPRINT 6 & 7)
           ========================================================================= */}
        {activeTab === 'alignment' && (
          <div className="space-y-8 animate-in fade-in duration-500">

            {/* Alignment Legend Banner */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Needleman-Wunsch Alignment & Phonetic Matrix</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Visual diagnostic breakdown of exact pronunciation matches, Tagalog regional vowel shifts, and errors.
                  </p>
                </div>
                <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-3 py-1 rounded border border-gray-200 font-bold">
                  SPRINT 6 & 7 (FR-010, FR-011, FR-018)
                </span>
              </div>

              {/* Legend Badges */}
              <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-100">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Correct Match
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-teal-100 text-teal-800 border border-teal-300">
                  <span className="w-2 h-2 rounded-full bg-teal-500"></span> Regional Accent Shift (e↔i, o↔u, d↔r)
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span> Mispronunciation / Substitution
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 line-through">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span> Omission / Skipped
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-sky-100 text-sky-800 border border-sky-300">
                  <span className="w-2 h-2 rounded-full bg-sky-500"></span> Insertion / Added Word
                </span>
              </div>
            </div>

            {/* Passage Alignment Cards */}
            {readingLogs.map((log, idx) => {
              const tokens = log.alignment_tokens || [];
              return (
                <div key={idx} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                  
                  {/* Card Header */}
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex flex-wrap justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                      <span className="font-extrabold text-gray-900 tracking-wider">PASSAGE #{idx + 1}</span>
                      <span className="px-2.5 py-0.5 text-xs font-black uppercase rounded bg-blue-100 text-blue-700 border border-blue-200">
                        {log.model_used || "WAV2VEC"}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-bold text-gray-600">
                      <span>Accuracy: <strong className="text-gray-900">{Number(log.accuracy || 0).toFixed(1)}%</strong></span>
                      <span>•</span>
                      <span>WCPM: <strong className="text-gray-900">{Number(log.wcpm || 0).toFixed(1)}</strong></span>
                      <span>•</span>
                      <span>Duration: <strong className="text-gray-900">{log.duration_seconds}s</strong></span>
                    </div>
                  </div>

                  {/* Alignment Sequence Visualizer */}
                  <div className="p-6">
                    <div className="mb-6">
                      <span className="text-xs font-black uppercase tracking-widest text-gray-400 block mb-3">
                        Word-by-Word Alignment Sequence
                      </span>

                      {tokens.length === 0 ? (
                        <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-500 italic">
                          Standard sequence alignment data not available.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2.5 p-4 bg-slate-50/80 rounded-xl border border-slate-200 min-h-[80px] items-center">
                          {tokens.map((tok, tIdx) => {
                            if (tok.status === 'correct') {
                              const isAccent = tok.type === 'accent_variation';
                              return (
                                <div
                                  key={tIdx}
                                  className={`px-3 py-1.5 rounded-lg border text-sm font-semibold flex flex-col items-center ${
                                    isAccent
                                      ? 'bg-teal-50 text-teal-800 border-teal-300'
                                      : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  }`}
                                  title={isAccent ? `Regional variation accepted: spoken "${tok.spoken}" for target "${tok.target}"` : "Exact match"}
                                >
                                  <span>{tok.target}</span>
                                  {isAccent && (
                                    <span className="text-[9px] uppercase tracking-wider text-teal-600 font-extrabold">
                                      accent shift
                                    </span>
                                  )}
                                </div>
                              );
                            } else if (tok.status === 'substitution') {
                              return (
                                <div
                                  key={tIdx}
                                  className="px-3 py-1.5 rounded-lg border bg-amber-50 text-amber-900 border-amber-300 text-sm font-semibold flex flex-col items-center"
                                  title={`Mispronounced: expected "${tok.target}", spoken "${tok.spoken}"`}
                                >
                                  <span className="line-through text-xs text-amber-600">{tok.target}</span>
                                  <span className="font-bold text-amber-900">{tok.spoken}</span>
                                </div>
                              );
                            } else if (tok.status === 'deletion') {
                              return (
                                <div
                                  key={tIdx}
                                  className="px-3 py-1.5 rounded-lg border bg-rose-50 text-rose-800 border-rose-300 text-sm font-semibold line-through"
                                  title={`Omitted word: student skipped "${tok.target}"`}
                                >
                                  {tok.target}
                                </div>
                              );
                            } else if (tok.status === 'insertion') {
                              return (
                                <div
                                  key={tIdx}
                                  className="px-3 py-1.5 rounded-lg border bg-sky-50 text-sky-800 border-sky-300 text-sm font-semibold"
                                  title={`Added word: student inserted "${tok.spoken}"`}
                                >
                                  +{tok.spoken}
                                </div>
                              );
                            }
                            return null;
                          })}
                        </div>
                      )}
                    </div>

                    {/* Side-by-Side Target vs Output */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Target Reference Text</span>
                        <p className="text-gray-900 font-medium leading-relaxed italic">"{log.target_text}"</p>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-gray-200">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Selected STT Transcription</span>
                        <p className="text-gray-900 font-medium leading-relaxed italic">
                          {log.transcription ? `"${log.transcription}"` : <span className="text-gray-400 italic">No audio detected.</span>}
                        </p>
                      </div>
                    </div>

                    {/* Multi-Phrase Breakdown (Sprint 5) */}
                    {log.phrase_breakdown && log.phrase_breakdown.length > 1 && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Phrase Segmentation Breakdown</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {log.phrase_breakdown.map((phrase, pIdx) => (
                            <div key={pIdx} className="p-3 bg-gray-50 rounded-lg border border-gray-200 flex justify-between items-center text-xs">
                              <span className="truncate pr-3 text-gray-700 italic">"{phrase.target_phrase}"</span>
                              <span className="font-extrabold text-gray-900 bg-white px-2 py-0.5 rounded border border-gray-200">
                                {phrase.accuracy}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              );
            })}

          </div>
        )}

        {/* =========================================================================
            TAB 3: OFFICIAL CERTIFICATE OF ORAL READING EVALUATION (SPRINT 8 / FR-020)
           ========================================================================= */}
        {activeTab === 'certificate' && (
          <div className="space-y-6 animate-in fade-in duration-500">

            <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <div>
                <h3 className="font-bold text-gray-900">Phil-IRI Certificate of Assessment</h3>
                <p className="text-xs text-gray-500">Official digital certificate export with automated verification seal.</p>
              </div>
              <button
                onClick={handleExportCertificate}
                disabled={isExporting}
                className="px-6 py-3 bg-[#0096FF] hover:bg-blue-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isExporting ? (
                  <>Exporting Image...</>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download Certificate (PNG)
                  </>
                )}
              </button>
            </div>

            {/* Printable / Canvas Certificate Container */}
            <div className="flex justify-center overflow-x-auto pb-8">
              <div
                ref={certificateRef}
                className="w-[820px] min-w-[820px] bg-white p-12 rounded-lg border-8 border-double border-blue-900 shadow-2xl relative text-gray-900 select-none"
                style={{ backgroundColor: '#ffffff' }}
              >
                {/* Decorative Corner Ornaments */}
                <div className="absolute top-4 left-4 w-12 h-12 border-t-4 border-l-4 border-blue-600"></div>
                <div className="absolute top-4 right-4 w-12 h-12 border-t-4 border-r-4 border-blue-600"></div>
                <div className="absolute bottom-4 left-4 w-12 h-12 border-b-4 border-l-4 border-blue-600"></div>
                <div className="absolute bottom-4 right-4 w-12 h-12 border-b-4 border-r-4 border-blue-600"></div>

                {/* Certificate Header */}
                <div className="text-center mb-8">
                  <div className="text-[11px] font-extrabold uppercase tracking-widest text-blue-900">
                    Republic of the Philippines • Department of Education
                  </div>
                  <div className="text-xs font-semibold text-gray-500 tracking-wider uppercase mt-1">
                    Philippine Informal Reading Inventory (Phil-IRI) Framework
                  </div>
                  <div className="w-24 h-1 bg-[#0096FF] mx-auto my-3"></div>
                  <h1 className="text-3xl font-black tracking-widest uppercase text-gray-900 mt-2">
                    Certificate of Oral Reading Assessment
                  </h1>
                  <p className="text-xs text-gray-400 font-mono tracking-widest mt-1 uppercase">
                    Verification ID: {certId}
                  </p>
                </div>

                {/* Student Award Text */}
                <div className="text-center my-8">
                  <p className="text-sm text-gray-600 uppercase tracking-widest font-medium">This is proudly presented to</p>
                  <h2 className="text-4xl font-black text-blue-950 uppercase tracking-wider my-3 border-b-2 border-gray-300 pb-2 inline-block min-w-[400px]">
                    {resultData.firstName} {resultData.lastName}
                  </h2>
                  <p className="text-sm text-gray-700 max-w-xl mx-auto leading-relaxed mt-3">
                    for completing the Tagalog oral reading evaluation at the <strong className="text-blue-900">{resultData.level} Tier</strong> using the ReadFil Automated Speech Recognition & Fluency Evaluation System.
                  </p>
                </div>

                {/* Performance Summary Grid on Certificate */}
                <div className="grid grid-cols-3 gap-4 my-8 p-5 bg-blue-50/60 rounded-xl border border-blue-200/80 text-center">
                  <div className="border-r border-blue-200">
                    <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Reading Accuracy</div>
                    <div className="text-2xl font-black text-gray-900 mt-1">{avgAccuracy.toFixed(1)}%</div>
                  </div>
                  <div className="border-r border-blue-200">
                    <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Fluency Rate</div>
                    <div className="text-2xl font-black text-gray-900 mt-1">{avgWcpm.toFixed(1)} <span className="text-xs font-normal text-gray-500">WCPM</span></div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Phil-IRI Category</div>
                    <div className={`text-2xl font-black mt-1 uppercase ${proficiency.badgeText}`}>{proficiency.level}</div>
                  </div>
                </div>

                {/* Official Stamp & Signatures */}
                <div className="mt-12 pt-6 flex justify-between items-end px-8">
                  <div className="text-center">
                    <div className="w-48 border-b border-gray-400 mb-1"></div>
                    <div className="text-xs font-extrabold uppercase text-gray-800">Rachel Joy D. Ramos</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Project Lead / Phil-IRI Evaluator</div>
                  </div>

                  {/* Stamp Seal */}
                  <div className="w-24 h-24 rounded-full border-4 border-dashed border-blue-600 flex flex-col items-center justify-center p-2 text-center text-blue-800 rotate-[-10deg] shadow-inner">
                    <div className="text-[8px] font-black uppercase tracking-widest">ReadFil</div>
                    <div className="text-[7px] font-bold uppercase">OFFICIAL SEAL</div>
                    <div className="text-[8px] font-mono font-black">{new Date().getFullYear()}</div>
                  </div>

                  <div className="text-center">
                    <div className="w-48 border-b border-gray-400 mb-1"></div>
                    <div className="text-xs font-extrabold uppercase text-gray-800">{resultData.date}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Date of Issuance</div>
                  </div>
                </div>

              </div>
            </div>

          </div>
        )}

      </main>

    </div>
  );
}