import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Results() {
  const navigate = useNavigate();

  // Dynamic State to hold the actual user data and server results
  const [resultData, setResultData] = useState({
    firstName: "Student",
    lastName: "",
    level: "Overall",
    accuracyRate: 0,
    wcpm: 0,
    date: new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
  });

  const [readingLogs, setReadingLogs] = useState([]);

  // Fetch the real data when the certificate loads
  useEffect(() => {
    // 1. Fetch User Registration Data
    const storedFirstName = localStorage.getItem('user_firstName') || "Student";
    const storedLastName = localStorage.getItem('user_lastName') || "";
    
    // 2. Fetch the Evaluation Metrics from the Python Server and ROUND them
    const storedAccuracy = Math.round(parseFloat(localStorage.getItem('final_accuracy')) || 0);
    const storedWcpm = Math.round(parseFloat(localStorage.getItem('final_wcpm')) || 0);
    
    // 3. Determine the evaluated level 
    const storedLevel = localStorage.getItem('evaluated_level') || "Overall";

    // Fetch the detailed reading logs we just saved
    const storedLogs = JSON.parse(localStorage.getItem('reading_logs')) || [];
    setReadingLogs(storedLogs);

    setResultData({
      firstName: storedFirstName,
      lastName: storedLastName,
      level: storedLevel,
      accuracyRate: storedAccuracy,
      wcpm: storedWcpm,
      date: new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    });
  }, []);

  // FORMAL COMPUTATION (Max Score = 100)
  // 50% weight for Accuracy, 50% weight for WCPM.
  const targetWcpm = 150; 
  
  const accuracyScore = resultData.accuracyRate * 0.5; 
  const fluencyScore = Math.min((resultData.wcpm / targetWcpm) * 50, 50); 
  const finalScore = Math.round(accuracyScore + fluencyScore);

  // === NEW: Determine Tagalog Level ===
  let tagalogLevel = "";
  if (finalScore >= 90) {
    tagalogLevel = "Independent";
  } else if (finalScore >= 75) {
    tagalogLevel = "Instructional";
  } else {
    tagalogLevel = "Frustration";
  }

  // SVG Calculations for Progress Rings
  const rarRadius = 36;
  const rarCircumference = 2 * Math.PI * rarRadius;
  const rarOffset = rarCircumference - (resultData.accuracyRate / 100) * rarCircumference;

  const totalRadius = 64;
  const totalCircumference = 2 * Math.PI * totalRadius;
  const totalOffset = totalCircumference - (finalScore / 100) * totalCircumference;
  
  const wcpmPercentage = Math.min((resultData.wcpm / targetWcpm) * 100, 100);

  // ==========================================
  // Visual Error Highlighter Function
  // ==========================================
  const highlightErrors = (target, heard) => {
    if (!heard) return <span className="text-gray-400 italic">No audio detected.</span>;

    const targetWords = target.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(' ').map(w => {
      if (w === 'mga') return 'manga';
      if (w === 'ng') return 'nang';
      return w;
    });

    const heardWords = heard.split(' ');
    
    return heardWords.map((word, index) => {
      const cleanWord = word.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      const isError = !targetWords.includes(cleanWord);

      return (
        <span 
          key={index} 
          className={isError ? "bg-red-200 text-red-900 font-extrabold px-1.5 py-0.5 rounded-md mx-0.5 shadow-sm" : "text-gray-900"}
        >
          {word}{' '}
        </span>
      );
    });
  };
  // ==========================================

  const handleSaveAsImage = () => {
    alert("Functionality to save this report as an image will be implemented here.");
  };

  const handleSendEmail = () => {
    alert("Functionality to email this report will be implemented here.");
  };

  const handleReturnHome = () => {
    // Clear the session data so the next student starts fresh
    localStorage.removeItem('final_accuracy');
    localStorage.removeItem('final_wcpm');
    localStorage.removeItem('evaluated_level');
    localStorage.removeItem('reading_logs');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0096FF]/20 to-white font-sans text-gray-900 pb-20">
      
      {/* Navigation Header */}
      <nav className="w-full bg-white px-10 lg:px-20 py-5 flex justify-between items-center border-b border-gray-200">
        <div className="text-2xl font-black tracking-tight text-gray-900">ReadFil</div>
      </nav>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 mt-12">
        
        {/* Minimalist Results Card */}
        <div className="bg-white/90 backdrop-blur-md rounded-sm shadow-sm border border-gray-200 p-10 lg:p-14 animate-in fade-in zoom-in duration-700">
          
          {/* Document Header */}
          <div className="text-center border-b border-gray-300 pb-8 mb-10">
            <h1 className="text-3xl font-bold text-gray-900 tracking-widest uppercase mb-2">
              Tagalog Evaluation Certificate
            </h1>
            <p className="text-gray-500 font-medium tracking-widest uppercase text-xs">
              Automated Oral Reading Fluency System
            </p>
          </div>

          {/* Certification Statement */}
          <div className="text-center mb-14">
            <p className="text-gray-500 text-sm uppercase tracking-widest mb-4">This document certifies that</p>
            <h2 className="text-4xl font-black text-gray-900 mb-4 uppercase tracking-wide">
              {resultData.firstName} {resultData.lastName}
            </h2>
            <p className="text-lg text-gray-700 leading-relaxed max-w-2xl mx-auto">
              has successfully finished the ReadFil Evaluation and demonstrated reading proficiency at the <span className="font-bold text-gray-900 border-b-2 border-[#0096FF] pb-1">{resultData.level} Level</span>.
            </p>
            <p className="text-xs text-gray-400 mt-6 font-medium uppercase tracking-widest">Date of Examination: {resultData.date}</p>
          </div>

          {/* Metrics Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12">
            
            {/* Accuracy Rate - Circular Progress */}
            <div className="flex items-center gap-6">
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="48" cy="48" r={rarRadius} stroke="#f3f4f6" strokeWidth="6" fill="none" />
                  <circle cx="48" cy="48" r={rarRadius} stroke="#0096FF" strokeWidth="6" fill="none" strokeDasharray={rarCircumference} strokeDashoffset={rarOffset} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-bold text-gray-900">{resultData.accuracyRate}%</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-900 uppercase tracking-widest font-bold">Accuracy Rate</p>
                <p className="text-xs text-gray-500 mt-1">Percentage of correct pronunciation</p>
              </div>
            </div>

            {/* WCPM - Linear Progress Gauge */}
            <div className="flex flex-col justify-center">
              <div className="flex justify-between items-end mb-2">
                <div>
                  <p className="text-sm text-gray-900 uppercase tracking-widest font-bold">Overall WCPM</p>
                  <p className="text-xs text-gray-500 mt-1">Words Correct Per Minute</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-black text-gray-900">{resultData.wcpm}</span>
                  <span className="text-xs text-gray-400 font-bold ml-1">/ {targetWcpm} TARGET</span>
                </div>
              </div>
              <div className="w-full bg-gray-100 h-2 mt-2">
                <div 
                  className="bg-[#005FA3] h-2 transition-all duration-1000 ease-out" 
                  style={{ width: `${wcpmPercentage}%` }}
                ></div>
              </div>
            </div>

          </div>

          {/* Final Total Score */}
          <div className="bg-gray-50 border border-gray-200 p-10 flex flex-col items-center justify-center mt-8">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-6">Composite Final Score</h3>
            
            <div className="relative w-40 h-40">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="80" cy="80" r={totalRadius} stroke="#e5e7eb" strokeWidth="8" fill="none" />
                <circle cx="80" cy="80" r={totalRadius} stroke="#005FA3" strokeWidth="8" fill="none" strokeDasharray={totalCircumference} strokeDashoffset={totalOffset} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="flex items-baseline">
                  <span className="text-5xl font-black text-gray-900">{finalScore}</span>
                </div>
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Out of 100</span>
              </div>
            </div>
            
            {/* === CHANGED TEXT HERE === */}
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-6">Tagalog level: {tagalogLevel}</h3>
            
          </div>

        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col md:flex-row justify-end items-center gap-4">
          <button 
            onClick={handleSaveAsImage}
            className="w-full md:w-auto px-6 py-3 bg-white text-gray-700 font-bold text-xs uppercase tracking-widest border border-gray-300 shadow-sm hover:bg-gray-50 transition-colors"
          >
            Save as Image
          </button>

          <button 
            onClick={handleSendEmail}
            className="w-full md:w-auto px-6 py-3 bg-white text-gray-700 font-bold text-xs uppercase tracking-widest border border-gray-300 shadow-sm hover:bg-gray-50 transition-colors"
          >
            Send to Email
          </button>
          
          <button 
            onClick={handleReturnHome}
            className="w-full md:w-auto px-8 py-3 bg-gray-900 text-white font-bold text-xs uppercase tracking-widest shadow-sm hover:bg-gray-800 transition-colors"
          >
            Return Home
          </button>
        </div>
        
        {/* =========================================
            Transcript Analysis Section 
            ========================================= */}
        <div className="mt-16 animate-in slide-in-from-bottom-10 duration-700">
          <div className="mb-8 text-center border-b border-gray-200 pb-6">
            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight uppercase">Transcript Analysis</h2>
            <p className="text-gray-500 mt-2 font-medium tracking-wide">Detailed breakdown of Target Passages and Transcriptions.</p>
          </div>

          {/* FALLBACK UI IF NO LOGS ARE FOUND */}
          {readingLogs.length === 0 ? (
            <div className="bg-gray-50 p-10 rounded-sm border border-gray-200 text-center">
              <p className="text-gray-500 font-medium">No transcript logs were found for this session. Complete a full evaluation to see your phonetic analysis here.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {readingLogs.map((log, index) => {
                const hasErrors = log.errors_detected > 0;

                return (
                  <div key={index} className={`bg-white rounded-sm shadow-sm border overflow-hidden transition-all hover:shadow-md ${hasErrors ? 'border-red-200' : 'border-green-200'}`}>
                    
                    {/* Header of the Log Card */}
                    <div className={`px-6 py-4 border-b flex justify-between items-center ${hasErrors ? 'bg-red-50/50 border-red-100' : 'bg-green-50/50 border-green-100'}`}>
                      <span className="font-extrabold text-gray-800 tracking-wider">PASSAGE #{index + 1}</span>
                      <span className={`px-4 py-1.5 rounded-sm text-xs font-black uppercase tracking-widest shadow-sm ${hasErrors ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-green-100 text-green-700 border border-green-200'}`}>
                        {hasErrors ? `${log.errors_detected} Errors Detected` : 'Perfect Reading'}
                      </span>
                    </div>

                    {/* Body: Side-by-Side Comparison */}
                    <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-8 relative">
                      
                      {/* Decorative Line down the middle for desktop */}
                      <div className="hidden md:block absolute left-1/2 top-8 bottom-8 w-px bg-gray-200 transform -translate-x-1/2"></div>

                      {/* Target Text Box */}
                      <div className="flex flex-col">
                        <span className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                          Target Text
                        </span>
                        <div className="bg-gray-50 p-6 rounded-sm border border-gray-100 h-full shadow-inner">
                          <p className="text-gray-900 font-medium leading-relaxed text-lg italic">
                            "{log.target_text}"
                          </p>
                        </div>
                      </div>

                      {/* Heard Text Box WITH HIGHLIGHTER */}
                      <div className="flex flex-col">
                        <span className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                          Transcription
                        </span>
                        <div className={`p-6 rounded-sm border h-full shadow-inner ${hasErrors ? 'bg-red-50/30 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                          <p className="font-medium leading-relaxed text-lg italic leading-loose">
                            {highlightErrors(log.target_text, log.transcription)}
                          </p>
                        </div>
                      </div>

                    </div>

                    {/* Footer: Individual Metrics */}
                    <div className="bg-gray-50 px-8 py-5 flex justify-around border-t border-gray-100 text-sm">
                      <div className="flex flex-col items-center">
                        <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Accuracy</span>
                        <span className="font-black text-2xl text-gray-800">{Math.round(log.accuracy_rate)}%</span>
                      </div>
                      <div className="w-px bg-gray-300"></div>
                      <div className="flex flex-col items-center">
                        <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">WCPM</span>
                        <span className="font-black text-2xl text-gray-800">{Math.round(log.wcpm)}</span>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}