import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { beginnerPassages, moderatePassages, expertPassages } from './data/passages';

export default function Progressive() {
  const navigate = useNavigate();

  // Progressive State Management
  const [currentLevel, setCurrentLevel] = useState('Beginner');
  const [isTestReady, setIsTestReady] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [testPassages, setTestPassages] = useState([]);

  // Updated Mic Test States
  const [micStatus, setMicStatus] = useState('idle'); // idle, recording_test, playback_ready
  const [testAudioUrl, setTestAudioUrl] = useState(null);

  // Actual Test States
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Modal States
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);
  const [mockScore, setMockScore] = useState(0);

  // Refs for the ACTUAL evaluation recording
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Refs for the MIC TEST phase
  const testRecorderRef = useRef(null);
  const testChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const streamRef = useRef(null);

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

  // Clean up media tracks and animations when component unmounts
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    };
  }, []);
  // --- UPDATED: Continuous Live Timer Logic ---
  useEffect(() => {
    let timer;
    if (isTestReady) {
      timer = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timer);
    }
    return () => clearInterval(timer);
  }, [isTestReady]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Dynamic Theming based on the active level
  const getTheme = () => {
    switch (currentLevel) {
      case 'Beginner': return { text: 'text-black', bg: 'bg-black', hover: 'hover:bg-gray-800', lightBg: 'bg-gray-100', title: 'Beginner', stroke: '#000000' };
      case 'Moderate': return { text: 'text-[#0096FF]', bg: 'bg-[#0096FF]', hover: 'hover:bg-blue-600', lightBg: 'bg-[#0096FF]/10', title: 'Moderate', stroke: '#0096FF' };
      case 'Expert': return { text: 'text-[#005FA3]', bg: 'bg-[#005FA3]', hover: 'hover:bg-[#004A80]', lightBg: 'bg-[#005FA3]/10', title: 'Expert', stroke: '#005FA3' };
      default: return { text: 'text-black', bg: 'bg-black', hover: 'hover:bg-gray-800', lightBg: 'bg-gray-100', title: 'Beginner', stroke: '#000000' };
    }
  };
  const theme = getTheme();

  // --- Visualizer Logic ---
  const drawWaveform = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteTimeDomainData(dataArray);

      ctx.fillStyle = '#f9fafb'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 3;
      ctx.strokeStyle = theme.stroke; // Dynamic color based on current level!
      ctx.beginPath();

      const sliceWidth = canvas.width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };
    draw();
  };

  // --- Mic Test Logic ---
  const handleMicTestToggle = async () => {
    if (micStatus === 'idle' || micStatus === 'playback_ready') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        analyserRef.current.fftSize = 2048;

        testRecorderRef.current = new MediaRecorder(stream);
        testChunksRef.current = [];
        
        testRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) testChunksRef.current.push(event.data);
        };

        testRecorderRef.current.onstop = () => {
          const audioBlob = new Blob(testChunksRef.current, { type: 'audio/webm' });
          const audioUrl = URL.createObjectURL(audioBlob);
          setTestAudioUrl(audioUrl);
        };

        testRecorderRef.current.start();
        setMicStatus('recording_test');
        drawWaveform();

      } catch (err) {
        console.error("Microphone access denied:", err);
        alert("Please allow microphone permissions in your browser to proceed.");
      }
    } else if (micStatus === 'recording_test') {
      testRecorderRef.current.stop();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setMicStatus('playback_ready');
    }
  };

  // --- Actual Evaluation Logic ---
const sendAudioToServer = async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', audioBlob, 'latest_recording.webm');
    
    // Add the target passage text to the payload
    const targetText = testPassages[currentIndex]?.text || "";
    formData.append('target_text', targetText);

    try {
      const response = await fetch('https://indira-topflight-mindi.ngrok-free.dev/api/evaluate', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      console.log("Server Evaluation Results:", result);

      localStorage.setItem('final_accuracy', result.accuracy_rate);
      localStorage.setItem('final_wcpm', result.wcpm);
      
      // You can later save these results to state/localStorage to display on Results.jsx
    } catch (error) {
      console.error("Error sending audio to server:", error);
    }
    audioChunksRef.current = [];
  };

  const startActualTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = sendAudioToServer;
      
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      
      setIsTestReady(true);
    } catch (err) {
      alert("Microphone connection lost. Please allow access.");
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setHasRecorded(true);
    } else {
      audioChunksRef.current = [];
      mediaRecorderRef.current.start();
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
      if (currentLevel === 'Beginner' || currentLevel === 'Moderate') {
        setMockScore(Math.floor(Math.random() * (98 - 85 + 1)) + 85);
        setShowLevelUpModal(true);
      } else if (currentLevel === 'Expert') {
        navigate('/results');
      }
    }
  };

  const handleLevelUp = () => {
    if (currentLevel === 'Beginner') {
      setCurrentLevel('Moderate');
    } else if (currentLevel === 'Moderate') {
      setCurrentLevel('Expert');
    }
    
    // Complete reset for the new phase
    setIsTestReady(false); 
    setMicStatus('idle'); 
    setTestAudioUrl(null);
    setCurrentIndex(0); 
    setIsRecording(false);
    setHasRecorded(false);
    setShowLevelUpModal(false);
    audioChunksRef.current = []; 
    
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

          <div className="bg-white p-10 rounded-[2rem] shadow-xl border border-gray-100 flex flex-col items-center">
            
            {/* Visualizer Canvas */}
            <div className="w-full h-32 bg-gray-50 rounded-xl border border-gray-200 mb-8 overflow-hidden flex items-center justify-center">
              {micStatus === 'idle' && <p className="text-gray-400 font-medium">Waveform will appear here</p>}
              <canvas 
                ref={canvasRef} 
                width="600" 
                height="128" 
                className={`w-full h-full ${micStatus === 'idle' ? 'hidden' : 'block'}`}
              />
            </div>

            <p className="text-xl font-medium text-gray-700 mb-8">
              {micStatus === 'idle' ? 'Click the mic to record a test phrase.' : 
               micStatus === 'recording_test' ? 'Recording... Speak clearly, then click to stop.' : 
               'Test complete! Listen to your playback.'}
            </p>

            {/* Test Controls */}
            <div className="flex flex-col items-center gap-6">
              {micStatus !== 'playback_ready' ? (
                <button 
                  onClick={handleMicTestToggle}
                  className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transform transition-all ${
                    micStatus === 'recording_test' ? 'bg-red-500 hover:bg-red-600 animate-pulse scale-110' : `${theme.bg} ${theme.hover} hover:scale-105`
                  }`}
                >
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {micStatus === 'recording_test' ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path>
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                    )}
                  </svg>
                </button>
              ) : (
                <div className="flex flex-col items-center gap-6 w-full">
                  <audio src={testAudioUrl} controls className="w-full max-w-md" />
                  <div className="flex gap-4">
                    <button 
                      onClick={() => { setMicStatus('idle'); setTestAudioUrl(null); }}
                      className="px-6 py-3 rounded-full font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      Retest Mic
                    </button>
                    <button 
                      onClick={startActualTest}
                      className={`${theme.bg} ${theme.hover} text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all transform hover:-translate-y-1`}
                    >
                      Start {theme.title} Phase
                    </button>
                  </div>
                </div>
              )}
            </div>
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
              <h2 className="text-2xl font-bold text-[#0096FF]">Reading Material</h2>
              <span className="text-sm font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                {currentIndex + 1} / {testPassages.length}
              </span>
            </div>
            
            <div className="p-8 pb-12 bg-gray-50 rounded-xl border border-gray-200 min-h-[150px] flex flex-col items-center justify-center relative">
              <p className="text-2xl leading-relaxed text-center font-medium text-black">
                "{testPassages[currentIndex]?.text}"
              </p>
              <span className="mt-6 text-sm text-gray-400 italic">
                Source: {testPassages[currentIndex]?.source}
              </span>

              {/* NEW: Live Timer */}
              <div className="absolute bottom-4 right-6 flex items-center gap-2 text-gray-600 font-mono font-bold bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                {formatTime(elapsedTime)}
              </div>
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
                {isRecording ? (
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path>
                ) : (
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                )}
              </svg>
            </button>
            
            <p className={`mt-6 font-bold text-lg ${isRecording ? 'text-red-500' : 'text-gray-500'}`}>
              {isRecording ? 'Recording... Click to stop.' : (hasRecorded ? 'Recording sent to server!' : 'Click to start recording')}
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