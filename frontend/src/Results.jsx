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

  // Fetch the real data when the certificate loads
  useEffect(() => {
    // 1. Fetch User Registration Data
    const storedFirstName = localStorage.getItem('user_firstName') || "Student";
    const storedLastName = localStorage.getItem('user_lastName') || "";
    
    // 2. Fetch the Evaluation Metrics from the Python Server
    const storedAccuracy = parseFloat(localStorage.getItem('final_accuracy')) || 0;
    const storedWcpm = parseFloat(localStorage.getItem('final_wcpm')) || 0;
    
    // 3. Determine the evaluated level (You can customize this logic)
    const storedLevel = localStorage.getItem('evaluated_level') || "Overall";

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

  // SVG Calculations for Progress Rings
  const rarRadius = 36;
  const rarCircumference = 2 * Math.PI * rarRadius;
  const rarOffset = rarCircumference - (resultData.accuracyRate / 100) * rarCircumference;

  const totalRadius = 64;
  const totalCircumference = 2 * Math.PI * totalRadius;
  const totalOffset = totalCircumference - (finalScore / 100) * totalCircumference;
  
  const wcpmPercentage = Math.min((resultData.wcpm / targetWcpm) * 100, 100);

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
    // Note: You can keep or clear user_firstName depending on your login flow
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
            
            <p className="text-xs text-gray-500 mt-6 text-center max-w-sm">
              Standardized weighted score combining reading accuracy (50%) and reading speed (50%).
            </p>
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

      </main>
    </div>
  );
}