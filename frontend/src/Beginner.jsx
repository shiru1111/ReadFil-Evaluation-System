import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const rawPassages = [
  "Keso ang paborito nito.",
  "Sa garapon nakatira.",
  "Tulungan mo ako.",
  "Paglabas ko rito",
  "Masaya talaga ako.",
  "Reyna ng mga duwende.",
  "Lagi siyang nakaupo",
  "Sa malaking balde.",
  "Berdeng balde ang paborito niya.",
  "Balat ng saging.",
  "Ang korona niya.",
  "Pumunta sa lawa si Tito",
  "Nakita nila ang palaka.",
  "Nakita nila ang bibe.",
  "Nakita rin nila ang buwaya.",
  "Si Mila ay nakatira sa bukid.",
  "Maraming hayop, marami ring halaman.",
  "May alagang baboy si Mila.",
  "May alaga din siyang baka at kambing.",
  "Ang manok niya ang kanyang paborito.",
  "Tiko ang pangalan ng manok niya.",
  "Siya ang gumigising kay Mila tuwing umaga.",
  "May karera ng kotse.",
  "Makukulay ang mga ito.",
  "Manonood ako ng karera.",
  "Magdadala ako ng kamera.",
  "Sasakay na ako sa bisikleta.",
  "May gitara si Lana.",
  "Maganda ang kulay nito.",
  "Kulay pula at may bulaklak na disenyo.",
  "Bigay ito ni Tita Ana.",
  "Binigay niya ito noong kaarawan ni Lana.",
  "Naglalakad si Lana papunta sa parke.",
  "Tumama ang paa ni Lana sa isang malaking bato.",
  "Naglalaro sa bakuran ang mga bata.",
  "Matibay ang kahoy ng punong narra.",
  "Nagmistulang malaking karagatan ang mga ito.",
  "Ginamot niya ang mga may sakit.",
  "Nagturo rin siya ng mga samahang sibiko.",
  "Kulay dilaw ang hinog nito.",
  "May punong mangga sa bakuran nina Ana.",
  "May kamote sa mesa.",
  "Bunga ng maraming basura.",
  "Sanhi ng pagbabago.",
  "Malaki ang mga papaya.",
  "Tumulong sa pangkat.",
  "Tatlong araw na siyang hindi kumakain.",
  "Humingi siya ng tulong dito.",
  "Lubos na ipinagmamalaki natin ito.",
  "Hinuhuli niya ang palaka."
];

const allPassages = rawPassages.map(text => ({
  text: text,
  source: "Phil-IRI The Philippine Informal Reading Inventory Manual"
}));

export default function Beginner() {
  const navigate = useNavigate();

  const [isTestReady, setIsTestReady] = useState(() => {
    return localStorage.getItem('beginner_isTestReady') === 'true';
  });
  const [currentIndex, setCurrentIndex] = useState(() => {
    const saved = localStorage.getItem('beginner_currentIndex');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [testPassages, setTestPassages] = useState(() => {
    const saved = localStorage.getItem('beginner_passages');
    return saved ? JSON.parse(saved) : [];
  });

  // Updated Mic Test States
  const [micStatus, setMicStatus] = useState('idle'); // idle, recording_test, playback_ready
  const [testAudioUrl, setTestAudioUrl] = useState(null);
  
  // Actual Test States
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

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

  useEffect(() => {
    if (testPassages.length === 0) {
      const shuffled = [...allPassages];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const selected = shuffled.slice(0, 25);
      setTestPassages(selected);
      localStorage.setItem('beginner_passages', JSON.stringify(selected));
    }
  }, [testPassages.length]);

  useEffect(() => {
    localStorage.setItem('beginner_currentIndex', currentIndex.toString());
  }, [currentIndex]);

  // Clean up media tracks and animations when component unmounts
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    };
  }, []);

  // --- NEW: Visualizer Logic ---
  const drawWaveform = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteTimeDomainData(dataArray);

      ctx.fillStyle = '#f9fafb'; // Match the gray-50 background of the container
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0096FF'; // Your primary blue theme
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

  // --- UPDATED: Mic Test Logic ---
  const handleMicTestToggle = async () => {
    if (micStatus === 'idle' || micStatus === 'playback_ready') {
      try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        
        // Setup Web Audio API for visualizer
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        analyserRef.current.fftSize = 2048;

        // Setup temporary recorder for playback
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

        // Start everything
        testRecorderRef.current.start();
        setMicStatus('recording_test');
        drawWaveform();

      } catch (err) {
        console.error("Microphone access denied:", err);
        alert("Please allow microphone permissions in your browser to proceed.");
      }
    } else if (micStatus === 'recording_test') {
      // Stop testing and generate playback
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
      const response = await fetch('http://127.0.0.1:5000/api/evaluate', {
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
    // We must secure the stream for the actual test before moving on
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = sendAudioToServer;
      
      // Stop the test tracks to avoid hardware conflicts
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      
      setIsTestReady(true);
      localStorage.setItem('beginner_isTestReady', 'true');
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

  const handleReturnHomeClick = (e) => {
    e.preventDefault();
    setShowConfirmModal(true);
  };

  const confirmReturnHome = () => {
    localStorage.removeItem('beginner_passages');
    localStorage.removeItem('beginner_currentIndex');
    localStorage.removeItem('beginner_isTestReady');
    navigate('/');
  };
  
  const nextPassage = () => {
    if (currentIndex < testPassages.length - 1) {
      setCurrentIndex((prevIndex) => prevIndex + 1);
      setIsRecording(false); 
      setHasRecorded(false);
    } else {
      localStorage.removeItem('beginner_passages');
      localStorage.removeItem('beginner_currentIndex');
      localStorage.removeItem('beginner_isTestReady');
      navigate('/results');
    }
  };

  if (testPassages.length === 0) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#8ACEFF]/10 to-white text-black font-sans relative">
      <nav className="w-full bg-white/80 backdrop-blur-md shadow-sm px-10 lg:px-20 py-5 flex justify-between items-center">
        <div className="text-2xl font-black tracking-tight text-[#0096FF]">ReadFil</div>
        <a href="/" onClick={handleReturnHomeClick} className="font-semibold text-sm uppercase tracking-wide hover:text-[#0096FF] transition-colors cursor-pointer">
          Return Home
        </a>
      </nav>

      {!isTestReady ? (
        <main className="max-w-3xl mx-auto pt-32 px-10 pb-20 text-center">
          <h1 className="text-4xl font-extrabold mb-4">Microphone Check</h1>
          <p className="text-gray-600 text-lg mb-12">Let us verify your audio quality before we begin.</p>

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
              {micStatus === 'idle' ? 'Click the microphone to record a test phrase.' : 
               micStatus === 'recording_test' ? 'Recording... Speak clearly, then click to stop.' : 
               'Test complete! Listen to your playback.'}
            </p>

            {/* Test Controls */}
            <div className="flex flex-col items-center gap-6">
              {micStatus !== 'playback_ready' ? (
                <button 
                  onClick={handleMicTestToggle}
                  className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transform transition-all ${
                    micStatus === 'recording_test' ? 'bg-red-500 hover:bg-red-600 animate-pulse scale-110' : 'bg-black hover:bg-gray-800 hover:scale-105'
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
                      className="bg-[#0096FF] hover:bg-[#8ACEFF] text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all transform hover:-translate-y-1"
                    >
                      Proceed to Evaluation
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </main>
      ) : (
        <main className="max-w-4xl mx-auto pt-20 px-10 pb-20">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-extrabold mb-4">Beginner Level Evaluation</h1>
            <p className="text-gray-600 text-lg">Read the text below clearly and naturally.</p>
          </div>

          <div className="bg-white p-10 rounded-[2rem] shadow-xl border border-gray-100 mb-10 relative">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-[#0096FF]">Reading Material</h2>
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
                isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-black hover:bg-gray-800'
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
                className="mt-8 bg-[#0096FF] hover:bg-[#8ACEFF] text-white font-bold py-4 px-10 rounded-full shadow-lg transition-all transform hover:-translate-y-1"
              >
                {currentIndex < testPassages.length - 1 ? 'Proceed to Next Passage \u2192' : 'Finish Test \u2192'}
              </button>
            )}
          </div>
        </main>
      )}

      {/* Return Home Custom Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in duration-200">
            <div className="p-8 pb-6 border-b border-gray-100">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-3xl font-extrabold text-black">Return Home</h3>
                <button onClick={() => setShowConfirmModal(false)} className="text-gray-400 hover:text-gray-800 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
              <p className="text-gray-500">Are you sure you want to leave?</p>
            </div>
            <div className="p-8 text-center">
              <p className="text-lg text-gray-700 font-medium mb-8">Your current test progress will be reset.</p>
              <div className="flex gap-4">
                <button type="button" onClick={() => setShowConfirmModal(false)} className="w-1/2 px-6 py-4 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">Cancel</button>
                <button type="button" onClick={confirmReturnHome} className="w-1/2 px-6 py-4 rounded-xl font-bold text-white bg-black hover:bg-gray-800 transition-all transform hover:-translate-y-1 shadow-lg">Proceed</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}