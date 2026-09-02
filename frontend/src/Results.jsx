import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { useLanguage } from './contexts/LanguageContext';

export default function Results() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const certificateRef = useRef(null);

  const [resultData, setResultData] = useState({
    firstName: "Student",
    lastName: "",
    level: "Overall",
    accuracyRate: 0,
    wcpm: 0,
    date: new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
  });

  const [readingLogs, setReadingLogs] = useState([]);

  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("success");

  const showToast = (msg, type = "success") => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => setToastMessage(""), 4000);
  };

  useEffect(() => {
    const storedFirstName = localStorage.getItem('user_firstName') || "Student";
    const storedLastName = localStorage.getItem('user_lastName') || "";
    const storedAccuracy = Math.round(parseFloat(localStorage.getItem('final_accuracy')) || 0);
    const storedWcpm = Math.round(parseFloat(localStorage.getItem('final_wcpm')) || 0);
    const storedLevel = localStorage.getItem('evaluated_level') || "Overall";
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

  const targetWcpm = 150; 
  
  const accuracyScore = resultData.accuracyRate * 0.5; 
  const fluencyScore = Math.min((resultData.wcpm / targetWcpm) * 50, 50); 
  const finalScore = Math.round(accuracyScore + fluencyScore);

  let tagalogLevel = "";
  if (finalScore >= 90) {
    tagalogLevel = "Independent";
  } else if (finalScore >= 75) {
    tagalogLevel = "Instructional";
  } else {
    tagalogLevel = "Frustration";
  }

  const rarRadius = 36;
  const rarCircumference = 2 * Math.PI * rarRadius;
  const rarOffset = rarCircumference - (resultData.accuracyRate / 100) * rarCircumference;

  const totalRadius = 64;
  const totalCircumference = 2 * Math.PI * totalRadius;
  const totalOffset = totalCircumference - (finalScore / 100) * totalCircumference;
  
  const wcpmPercentage = Math.min((resultData.wcpm / targetWcpm) * 100, 100);

  // ==========================================
  // FIXED: Visual Error Highlighter Function
  // ==========================================
  const highlightErrors = (target, heard, stutters = []) => {
    if (!heard) return <span className="text-gray-400 italic">No audio detected.</span>;

    // Pure stripping. No hardcoded dictionary mapping. 
    // We trust the backend's Two-Way Snapper to have formatted the words correctly.
    const targetWords = target.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(' ');
    const heardWords = heard.split(' ');
    
    return heardWords.map((word, index) => {
      const cleanWord = word.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      const isError = !targetWords.includes(cleanWord);
      const isStutter = stutters.includes(cleanWord);

      let styleClass = "text-gray-900";
      if (isStutter) {
        styleClass = "bg-orange-200 text-orange-900 font-extrabold px-1.5 py-0.5 rounded-md mx-0.5 shadow-sm";
      } else if (isError) {
        styleClass = "bg-red-200 text-red-900 font-extrabold px-1.5 py-0.5 rounded-md mx-0.5 shadow-sm";
      }

      return (
        <span 
          key={index} 
          className={styleClass}
        >
          {word}{' '}
        </span>
      );
    });
  };
  // ==========================================

  const handleSaveAsImage = async () => {
    if (!certificateRef.current) return;
    
    const originalStyle = certificateRef.current.style.cssText;
    
    // Temporarily force desktop dimensions for the snapshot
    certificateRef.current.style.width = '1024px';
    certificateRef.current.style.maxWidth = '1024px';
    certificateRef.current.style.margin = '0 auto';

    try {
      const canvas = await html2canvas(certificateRef.current, {
        scale: 2, 
        backgroundColor: '#ffffff', 
        useCORS: true,
        windowWidth: 1024 // Forces Tailwind's md/lg breakpoints
      });
      
      const image = canvas.toDataURL('image/png', 1.0);
      const downloadLink = document.createElement('a');
      downloadLink.href = image;
      downloadLink.download = `ReadFil_Certificate_${resultData.firstName}_${resultData.lastName}.png`;
      downloadLink.click();
    } catch (error) {
      console.error("Error generating certificate image:", error);
      showToast("There was an error saving your certificate. Please try again.", "error");
    } finally {
      // Restore original responsive state immediately
      certificateRef.current.style.cssText = originalStyle;
    }
  };

  const [isEmailing, setIsEmailing] = useState(false);

  const handleSendEmail = async () => {
    if (!certificateRef.current) return;
    
    const userEmail = localStorage.getItem('user_email');
    if (!userEmail) {
      showToast("No email found. Please register an email on the home screen.", "error");
      return;
    }

    setIsEmailing(true);
    const originalStyle = certificateRef.current.style.cssText;
    
    // Temporarily force desktop dimensions for the snapshot
    certificateRef.current.style.width = '1024px';
    certificateRef.current.style.maxWidth = '1024px';
    certificateRef.current.style.margin = '0 auto';

    try {
      const canvas = await html2canvas(certificateRef.current, {
        scale: 2, 
        backgroundColor: '#ffffff', 
        useCORS: true,
        windowWidth: 1024
      });
      
      const image = canvas.toDataURL('image/png', 1.0);
      
      const response = await fetch((import.meta.env.VITE_API_URL || '') + '/api/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: userEmail,
          name: `${resultData.firstName} ${resultData.lastName}`,
          level: resultData.level,
          score: finalScore,
          image_data: image
        })
      });

      const data = await response.json();
      if (response.ok) {
        showToast("Certificate successfully sent! Please check your Inbox and Spam/Drafts folder.", "success");
      } else {
        showToast(`Failed to send email: ${data.error}`, "error");
      }
    } catch (error) {
      console.error("Error sending email:", error);
      showToast(`There was an error sending your certificate: ${error.message || error}`, "error");
    } finally {
      // Restore original responsive state immediately
      certificateRef.current.style.cssText = originalStyle;
      setIsEmailing(false);
    }
  };

  const handleReturnHome = () => {
    localStorage.removeItem('final_accuracy');
    localStorage.removeItem('final_wcpm');
    localStorage.removeItem('evaluated_level');
    localStorage.removeItem('reading_logs');
    localStorage.removeItem('user_firstName');
    localStorage.removeItem('user_lastName');
    localStorage.removeItem('user_email');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0096FF]/20 to-white font-sans text-gray-900 pb-20">
      
      <nav className="w-full bg-white px-4 sm:px-10 lg:px-20 py-4 sm:py-5 flex justify-between items-center border-b border-gray-200">
        <div className="text-xl sm:text-2xl font-black tracking-tight text-gray-900">ReadFil</div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 mt-8 sm:mt-12">
        
        <div 
          ref={certificateRef} 
          className="bg-white/90 backdrop-blur-md rounded-xl sm:rounded-sm shadow-md border border-gray-200 p-5 sm:p-10 lg:p-14 animate-in fade-in zoom-in duration-700"
        >
          
          <div className="text-center border-b border-gray-300 pb-8 mb-10">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 tracking-wider sm:tracking-widest uppercase mb-2">
              {t("results.title")}
            </h1>
            <p className="text-gray-500 font-medium tracking-widest uppercase text-xs">
              {t("results.subtitle")}
            </p>
          </div>

          <div className="text-center mb-14">
            <p className="text-gray-500 text-sm uppercase tracking-widest mb-4">{t("results.certifies")}</p>
            <h2 className="text-2xl sm:text-4xl font-black text-gray-900 mb-4 uppercase tracking-wide">
              {resultData.firstName} {resultData.lastName}
            </h2>
            <p className="text-base sm:text-lg text-gray-700 leading-relaxed max-w-2xl mx-auto">
              {t("results.finished")} <span className="font-bold text-gray-900 border-b-2 border-[#0096FF] pb-1">{resultData.level} {t("results.level")}</span>.
            </p>
            <p className="text-xs text-gray-400 mt-6 font-medium uppercase tracking-widest">{t("results.date")}: {resultData.date}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-12 mb-12">
            
            <div className="flex items-center gap-6">
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="48" cy="48" r={rarRadius} stroke="#f3f4f6" strokeWidth="6" fill="none" />
                  <circle cx="48" cy="48" r={rarRadius} stroke="#0096FF" strokeWidth="6" fill="none" strokeDasharray={rarCircumference} strokeDashoffset={rarOffset} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center -mt-2">
                <span className="text-xl font-bold text-gray-900">{resultData.accuracyRate}%</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-gray-900 mb-1">{t("results.accuracy")}</p>
              <p className="text-[9px] sm:text-[10px] text-gray-400 font-medium uppercase tracking-wider">{t("results.accuracy_desc")}</p>
            </div>
          </div>

          <div className="flex-1 min-w-[200px]">
            <div className="flex justify-between items-end mb-2">
              <div>
                <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-gray-900 mb-1">{t("results.wcpm")}</p>
                <p className="text-[9px] sm:text-[10px] text-gray-400 font-medium uppercase tracking-wider">{t("results.wcpm_desc")}</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-black text-gray-900 leading-none">{resultData.wcpm}</span>
                <span className="text-[9px] sm:text-[10px] text-gray-400 font-bold tracking-widest uppercase">/ 150 TARGET</span>
              </div>
            </div>
            <div className="w-full bg-gray-100 h-2">
              <div 
                className="h-full bg-[#005FA3] transition-all duration-1000 ease-out"
                style={{ width: `${wcpmPercentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* --- Final Score --- */}
        <div className="mt-8 bg-gray-50 border border-gray-100 p-8 flex flex-col items-center justify-center text-center">
          <p className="text-[10px] sm:text-[11px] text-gray-500 font-bold uppercase tracking-[0.2em] mb-6">{t("results.composite")}</p>
          
          <div className="relative w-40 h-40 mb-6">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r={totalRadius} stroke="#e5e7eb" strokeWidth="8" fill="none" />
              <circle cx="80" cy="80" r={totalRadius} stroke="#005FA3" strokeWidth="8" fill="none" strokeDasharray={totalCircumference} strokeDashoffset={totalOffset} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center -mt-6">
              <div className="flex items-baseline">
                <span className="text-5xl font-black text-gray-900 leading-none">{finalScore}</span>
              </div>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">{t("results.out_of")}</span>
            </div>
          </div>
            
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-6">{t("results.tagalog_level")} {tagalogLevel}</h3>
            
          </div>

        </div>

        <div className="mt-8 flex flex-col sm:flex-row justify-end items-center gap-3 sm:gap-4">
          <button 
            onClick={() => window.open('/simulation', '_blank')}
            className="w-full sm:w-auto px-6 py-3 bg-white text-gray-700 font-bold text-xs uppercase tracking-widest border border-gray-300 shadow-sm hover:text-[#0096FF] transition-colors text-center"
          >
            {t("nav.simulation")}
          </button>

          <button 
            onClick={handleSaveAsImage}
            className="w-full sm:w-auto px-6 py-3 bg-white text-gray-700 font-bold text-xs uppercase tracking-widest border border-gray-300 shadow-sm hover:bg-gray-50 transition-colors text-center"
          >
            {t("results.save_image")}
          </button>

          <button 
            onClick={handleSendEmail}
            disabled={isEmailing}
            className={`w-full sm:w-auto px-6 py-3 bg-white text-gray-700 font-bold text-xs uppercase tracking-widest border border-gray-300 shadow-sm transition-colors text-center ${isEmailing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
          >
            {isEmailing ? 'SENDING...' : t("results.send_email")}
          </button>
          
          <button 
            onClick={handleReturnHome}
            className="w-full sm:w-auto px-8 py-3 bg-gray-900 text-white font-bold text-xs uppercase tracking-widest shadow-sm hover:bg-gray-800 transition-colors text-center"
          >
            {t("nav.return_home")}
          </button>
        </div>
        
        {/* =========================================
            Transcript Analysis Section 
            ========================================= */}
        <div className="mt-16 animate-in slide-in-from-bottom-10 duration-700">
          <div className="mb-8 text-center border-b border-gray-200 pb-6">
            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight uppercase">{t("results.transcript_title")}</h2>
            <p className="text-gray-500 mt-2 font-medium tracking-wide">{t("results.transcript_desc")}</p>
          </div>

          {readingLogs.length === 0 ? (
            <div className="bg-gray-50 p-10 rounded-sm border border-gray-200 text-center">
              <p className="text-gray-500 font-medium">{t("results.no_logs")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {readingLogs.map((log, index) => {
                const hasErrors = log.errors_detected > 0;

                return (
                  <div key={index} className={`bg-white rounded-sm shadow-sm border overflow-hidden transition-all hover:shadow-md ${hasErrors ? 'border-red-200' : 'border-green-200'}`}>
                    
                    <div className={`px-6 py-4 border-b flex justify-between items-center ${hasErrors ? 'bg-red-50/50 border-red-100' : 'bg-green-50/50 border-green-100'}`}>
                      <span className="font-extrabold text-gray-800 tracking-wider">{t("results.passage")} #{index + 1}</span>
                      <span className={`px-4 py-1.5 rounded-sm text-xs font-black uppercase tracking-widest shadow-sm ${hasErrors ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-green-100 text-green-700 border border-green-200'}`}>
                        {hasErrors ? `${log.errors_detected} ${t("results.errors")}` : t("results.perfect")}
                      </span>
                    </div>

                    <div className="p-4 sm:p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 relative">
                      
                      <div className="hidden md:block absolute left-1/2 top-8 bottom-8 w-px bg-gray-200 transform -translate-x-1/2"></div>

                      <div className="flex flex-col">
                        <span className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                          {t("results.target_text")}
                        </span>
                        <div className="bg-gray-50 p-6 rounded-sm border border-gray-100 h-full shadow-inner">
                          <p className="text-gray-900 font-medium leading-relaxed text-lg italic">
                            "{log.target_text}"
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col">
                        <span className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                          {t("results.transcription")}
                        </span>
                        <div className={`p-6 rounded-sm border h-full shadow-inner ${hasErrors ? 'bg-red-50/30 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                          <p className="font-medium leading-relaxed text-lg italic leading-loose">
                            {highlightErrors(log.target_text, log.transcription, log.stutter_words)}
                          </p>
                        </div>
                      </div>

                    </div>

                    <div className="bg-gray-50 px-8 py-5 flex justify-around border-t border-gray-100 text-sm">
                      <div className="flex flex-col items-center">
                        <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">{t("results.accuracy")}</span>
                        <span className="font-black text-2xl text-gray-800">{Math.round(log.accuracy_rate)}%</span>
                      </div>
                      <div className="w-px bg-gray-300"></div>
                      <div className="flex flex-col items-center">
                        <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">WCPM</span>
                        <span className="font-black text-2xl text-gray-800">{Math.round(log.wcpm)}</span>
                      </div>
                      <div className="w-px bg-gray-300"></div>
                      <div className="flex flex-col items-center">
                        <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">{t("results.duration")}</span>
                        <span className="font-black text-2xl text-gray-800">{log.duration_seconds ? `${log.duration_seconds.toFixed(2)}s` : 'N/A'}</span>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-10 right-10 sm:bottom-12 sm:right-12 px-6 py-4 rounded shadow-2xl transition-all duration-300 z-50 transform flex items-center gap-3 ${toastType === 'error' ? 'bg-red-500 text-white' : 'bg-gray-900 text-white'}`}>
          <div className="font-bold tracking-wide text-sm">{toastMessage}</div>
          <button onClick={() => setToastMessage("")} className="ml-4 opacity-70 hover:opacity-100 transition-opacity">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
