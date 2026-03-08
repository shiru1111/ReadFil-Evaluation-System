import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { beginnerPassages, moderatePassages, expertPassages } from './data/passages';

export default function Progressive() {
  const navigate = useNavigate();

  // Progressive State Management
  const [currentLevel, setCurrentLevel] = useState('Beginner');
  const [isTestReady, setIsTestReady] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [testPassages, setTestPassages] = useState([]);

  // Recording States
  const [micStatus, setMicStatus] = useState('idle');
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);

  // Modal States
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);
  const [mockScore, setMockScore] = useState(0);

  // Load Passages based on Current Level
  useEffect(() => {
    let sourcePassages = [];
    if (currentLevel === 'Beginner') sourcePassages = [...beginnerPassages];
    if (currentLevel === 'Moderate') sourcePassages = [...moderatePassages];
    if (currentLevel === 'Expert') sourcePassages = [...expertPassages];

    // Shuffle and select up to 25 passages per level
    for (let i = sourcePassages.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sourcePassages[i], sourcePassages[j]] = [sourcePassages[j], sourcePassages[i]];
    }
    setTestPassages(sourcePassages.slice(0, 25));
  }, [currentLevel]);

  // Dynamic Theming based on the active level
  const getTheme = () => {
    switch (currentLevel) {
      case 'Beginner': return { text: 'text-black', bg: 'bg-black', hover: 'hover:bg-gray-800', lightBg: 'bg-gray-100', title: 'Beginner' };
      case 'Moderate': return { text: 'text-[#0096FF]', bg: 'bg-[#0096FF]', hover: 'hover:bg-blue-600', lightBg: 'bg-[#0096FF]/10', title: 'Moderate' };
      case 'Expert': return { text: 'text-[#005FA3]', bg: 'bg-[#005FA3]', hover: 'hover:bg-[#004A80]', lightBg: 'bg-[#005FA3]/10', title: 'Expert' };
      default: return { text: 'text-black', bg: 'bg-black', hover: 'hover:bg-gray-800', lightBg: 'bg-gray-100', title: 'Beginner' };
    }
  };
  const theme = getTheme();

  const handleMicTest = () => {
    if (micStatus === 'idle') setMicStatus('testing');
    else if (micStatus === 'testing') setMicStatus('success');
  };

  const startActualTest = () => {
    setIsTestReady(true);
  };

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      setHasRecorded(true);
    } else {
      setIsRecording(true);
      setHasRecorded(false);
    }
  };

  const nextPassage = () => {
    if (currentIndex < testPassages.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setIsRecording(false);
      setHasRecorded(false);
    } else {
      // User finished the last passage of the current level
      if (currentLevel === 'Beginner' || currentLevel === 'Moderate') {
        // Show the short qualification result
        setMockScore(Math.floor(Math.random() * (98 - 85 + 1)) + 85);
        setShowLevelUpModal(true);
      } else if (currentLevel === 'Expert') {
        // User finished all 3 levels, proceed to total evaluation
        navigate('/results');
      }
    }
  };

  const handleLevelUp = () => {
    // Determine the next level
    if (currentLevel === 'Beginner') {
      setCurrentLevel('Moderate');
    } else if (currentLevel === 'Moderate') {
      setCurrentLevel('Expert');
    }
    
    // CRITICAL FIX: Reset all states so the user sees the new Introduction Screen
    setIsTestReady(false); // Sends them back to the start screen of the new level
    setMicStatus('idle'); // Requires a quick mic check for the new level
    setCurrentIndex(0); // Resets passage counter to 1
    setIsRecording(false);
    setHasRecorded(false);
    setShowLevelUpModal(false);
    
    // Scroll to top automatically
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmReturnHome = () => {
    navigate('/');
  };

  if (testPassages.length === 0) return null;

  return (
    <div className={`min-h-screen bg-gradient-to-br from-white via-white to-${theme.lightBg} text-black font-sans relative transition-colors duration-700`}>
      <nav className="w-full bg-white/80 backdrop-blur-md shadow-sm px-10 lg:px-20 py-5 flex justify-between items-center z-50 relative">
        <div className={`text-2xl font-black tracking-tight ${theme.text}`}>ReadFil Progressive</div>
        <button onClick={() => setShowConfirmModal(true)} className={`font-semibold text-sm uppercase tracking-wide hover:${theme.text} transition-colors cursor-pointer`}>
          Quit Assessment
        </button>
      </nav>

      {!isTestReady ? (
        <main className="max-w-3xl mx-auto pt-32 px-10 pb-20 text-center animate-in fade-in zoom-in duration-500">
          <h1 className={`text-4xl font-extrabold mb-4 ${theme.text}`}>{theme.title} Phase Verification</h1>
          <p className="text-gray-600 text-lg mb-12">You are about to start the {theme.title} evaluation. Please confirm your audio.</p>

          <div className="bg-white p-12 rounded-[2rem] shadow-xl border border-gray-100 flex flex-col items-center">
            <p className="text-xl font-medium text-gray-700 mb-8">
              {micStatus === 'idle' ? 'Click and say "Hello"' : micStatus === 'testing' ? 'Listening...' : 'Audio verified!'}
            </p>

            <button 
              onClick={handleMicTest}
              disabled={micStatus === 'success'}
              className={`w-28 h-28 rounded-full flex items-center justify-center shadow-lg transform transition-all ${
                micStatus === 'testing' ? 'bg-red-500 scale-110 animate-pulse' : 
                micStatus === 'success' ? 'bg-green-500' : `${theme.bg} ${theme.hover} hover:scale-105`
              }`}
            >
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {micStatus === 'success' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                )}
              </svg>
            </button>

            {micStatus === 'success' && (
              <button 
                onClick={startActualTest}
                className={`mt-10 ${theme.bg} ${theme.hover} text-white font-bold py-4 px-12 rounded-full shadow-lg transition-all transform hover:-translate-y-1 text-lg`}
              >
                Start {theme.title} Phase
              </button>
            )}
          </div>
        </main>
      ) : (
        <main className="max-w-4xl mx-auto pt-20 px-10 pb-20 animate-in fade-in duration-500">
          <div className="text-center mb-12">
            <h1 className={`text-4xl font-extrabold mb-2 ${theme.text}`}>{theme.title} Phase</h1>
            <p className="text-gray-500 font-bold uppercase tracking-widest text-sm">Progressive Assessment Mode</p>
          </div>

          <div className="bg-white p-10 rounded-[2rem] shadow-xl border border-gray-100 mb-10 relative">
            <div className="flex justify-between items-center mb-6">
              <h2 className={`text-2xl font-bold ${theme.text}`}>Reading Material</h2>
              <span className="text-sm font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                {currentIndex + 1} / {testPassages.length}
              </span>
            </div>
            
            <div className="p-8 bg-gray-50 rounded-xl border border-gray-200 min-h-[150px] flex flex-col items-center justify-center">
              <p className="text-2xl leading-relaxed text-center font-medium text-black">
                "{testPassages[currentIndex]?.text}"
              </p>
              <span className="mt-6 text-sm text-gray-400 italic">
                Source: {testPassages[currentIndex]?.source}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center">
            <button 
              onClick={toggleRecording}
              className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transform transition-all hover:scale-105 ${
                isRecording ? 'bg-red-500 animate-pulse' : theme.bg
              }`}
            >
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
              </svg>
            </button>
            
            <p className={`mt-6 font-bold text-lg ${isRecording ? 'text-red-500' : 'text-gray-500'}`}>
              {isRecording ? 'Recording...' : (hasRecorded ? 'Recording saved!' : 'Click to start recording')}
            </p>

            {hasRecorded && (
              <button 
                onClick={nextPassage}
                className={`mt-8 ${theme.bg} ${theme.hover} text-white font-bold py-4 px-10 rounded-full shadow-lg transition-all transform hover:-translate-y-1`}
              >
                {currentIndex < testPassages.length - 1 ? 'Proceed to Next Passage \u2192' : 'Submit Phase Evaluation \u2192'}
              </button>
            )}
          </div>
        </main>
      )}

      {/* Level Up Qualification Modal */}
      {showLevelUpModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
          
          <div className="relative bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden z-10 text-center animate-in zoom-in duration-300">
            <div className={`${theme.bg} py-10 px-8 flex flex-col items-center`}>
              <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg mb-6">
                <span className={`text-4xl font-black ${theme.text}`}>{mockScore}</span>
              </div>
              <h3 className="text-3xl font-extrabold text-white mb-2">Phase Cleared!</h3>
              <p className="text-white/90 font-medium">
                You scored {mockScore}/100 in the {currentLevel} evaluation.
              </p>
            </div>
            
            <div className="p-8">
              <p className="text-gray-700 text-lg mb-8 font-medium">
                Congratulations! You are officially qualified to proceed to the <span className={`font-bold ${currentLevel === 'Beginner' ? 'text-[#0096FF]' : 'text-[#005FA3]'}`}>{currentLevel === 'Beginner' ? 'Moderate' : 'Expert'}</span> Level.
              </p>
              
              <button 
                onClick={handleLevelUp}
                className={`w-full px-6 py-4 rounded-xl font-bold text-white ${currentLevel === 'Beginner' ? 'bg-[#0096FF] hover:bg-blue-600' : 'bg-[#005FA3] hover:bg-[#004A80]'} transition-all transform hover:-translate-y-1 shadow-lg text-lg`}
              >
                Proceed to {currentLevel === 'Beginner' ? 'Moderate' : 'Expert'} Phase
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quit Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden z-10">
            <div className="p-8 border-b border-gray-100">
              <h3 className="text-3xl font-extrabold text-black mb-2">Quit Assessment?</h3>
              <p className="text-gray-500">Your progressive run will not be saved.</p>
            </div>
            <div className="p-8 bg-gray-50 flex gap-4">
              <button onClick={() => setShowConfirmModal(false)} className="w-1/2 py-4 rounded-xl font-bold text-gray-600 bg-gray-200 hover:bg-gray-300">Cancel</button>
              <button onClick={confirmReturnHome} className="w-1/2 py-4 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg">Quit to Home</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}