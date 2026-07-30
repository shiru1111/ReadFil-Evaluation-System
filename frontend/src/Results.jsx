import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Results() {
  const navigate = useNavigate();

  const [resultData, setResultData] = useState({
    firstName: "Student",
    lastName: "",
    level: "Overall",
    date: new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
  });

  const [readingLogs, setReadingLogs] = useState([]);

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
  }, []);



  const handleReturnHome = () => {
    localStorage.removeItem('evaluated_level');
    localStorage.removeItem('reading_logs');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0096FF]/20 to-white font-sans text-gray-900 pb-20">
      
      <nav className="w-full bg-white px-4 sm:px-10 lg:px-20 py-4 sm:py-5 flex justify-between items-center border-b border-gray-200">
        <div className="text-xl sm:text-2xl font-black tracking-tight text-gray-900">ReadFil</div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 mt-8 sm:mt-12">
        
        <div className="bg-white/90 backdrop-blur-md rounded-xl sm:rounded-sm shadow-md border border-gray-200 p-5 sm:p-10 lg:p-14 animate-in fade-in zoom-in duration-700">
          
          <div className="text-center border-b border-gray-300 pb-8 mb-10">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 tracking-wider sm:tracking-widest uppercase mb-2">
              Speech-to-Text Results
            </h1>
            <p className="text-gray-500 font-medium tracking-widest uppercase text-xs">
              Dual-Model STT Pipeline (Sprint 3)
            </p>
          </div>

          <div className="text-center mb-14">
            <p className="text-gray-500 text-sm uppercase tracking-widest mb-4">Reading Session Completed By</p>
            <h2 className="text-2xl sm:text-4xl font-black text-gray-900 mb-4 uppercase tracking-wide">
              {resultData.firstName} {resultData.lastName}
            </h2>
            <p className="text-base sm:text-lg text-gray-700 leading-relaxed max-w-2xl mx-auto">
              Level: <span className="font-bold text-gray-900 border-b-2 border-[#0096FF] pb-1">{resultData.level}</span>
            </p>
            <p className="text-xs text-gray-400 mt-6 font-medium uppercase tracking-widest">Date: {resultData.date}</p>
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row justify-end items-center gap-3 sm:gap-4">

          
          <button 
            onClick={handleReturnHome}
            className="w-full sm:w-auto px-8 py-3 bg-gray-900 text-white font-bold text-xs uppercase tracking-widest shadow-sm hover:bg-gray-800 transition-colors text-center"
          >
            Return Home
          </button>
        </div>
        
        {/* =========================================
            Transcript Analysis Section 
            ========================================= */}
        <div className="mt-16 animate-in slide-in-from-bottom-10 duration-700">
          <div className="mb-8 text-center border-b border-gray-200 pb-6">
            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight uppercase">Transcriptions</h2>
            <p className="text-gray-500 mt-2 font-medium tracking-wide">Target Passages vs STT Pipeline Transcriptions.</p>
          </div>

          {readingLogs.length === 0 ? (
            <div className="bg-gray-50 p-10 rounded-sm border border-gray-200 text-center">
              <p className="text-gray-500 font-medium">No transcript logs were found for this session.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {readingLogs.map((log, index) => {
                return (
                  <div key={index} className={`bg-white rounded-sm shadow-sm border border-gray-200 overflow-hidden transition-all hover:shadow-md`}>
                    
                    <div className="px-6 py-4 border-b bg-gray-50 border-gray-100 flex justify-between items-center">
                      <span className="font-extrabold text-gray-800 tracking-wider">PASSAGE #{index + 1}</span>
                      <span className="px-4 py-1.5 rounded-sm text-xs font-black uppercase tracking-widest shadow-sm bg-blue-100 text-blue-700 border border-blue-200">
                        {log.model_used || "STT Model"}
                      </span>
                    </div>

                    <div className="p-4 sm:p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 relative">
                      
                      <div className="hidden md:block absolute left-1/2 top-8 bottom-8 w-px bg-gray-200 transform -translate-x-1/2"></div>

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

                      <div className="flex flex-col">
                        <span className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                          Transcription
                        </span>
                        <div className="p-6 rounded-sm border h-full shadow-inner bg-white border-gray-200">
                          <p className="font-medium leading-relaxed text-lg italic leading-loose text-gray-900">
                            {log.transcription ? log.transcription : <span className="text-gray-400 italic">No audio detected.</span>}
                          </p>
                        </div>
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