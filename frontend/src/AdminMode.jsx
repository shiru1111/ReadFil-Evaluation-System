import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { beginnerPassages, moderatePassages, expertPassages } from './data/passages';
import { useLanguage } from './contexts/LanguageContext';

export default function AdminMode() {
  const navigate = useNavigate();

  const [selectedLevel, setSelectedLevel] = useState(null);
  const [passage, setPassage] = useState(null);

  // Mic Check
  const [micStatus, setMicStatus] = useState('idle');
  const [testAudioUrl, setTestAudioUrl] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [isTestReady, setIsTestReady] = useState(false);

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef(null);
  const currentAudioBlobRef = useRef(null);

  // Results
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const startMicTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setTestAudioUrl(audioUrl);
        setMicStatus('completed');
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.start();
      setMicStatus('recording');
      setTimeout(() => stopMicTest(), 3000);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("Microphone access denied or not found.");
      setMicStatus('idle');
    }
  };

  const stopMicTest = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleLevelSelect = (level) => {
    setSelectedLevel(level);
    let pool = [];
    if (level === 'Beginner') pool = beginnerPassages;
    else if (level === 'Moderate') pool = moderatePassages;
    else if (level === 'Expert') pool = expertPassages;
    
    // Pick a random passage
    const randomIndex = Math.floor(Math.random() * pool.length);
    setPassage(pool[randomIndex]);
  };

  const toggleRecording = async () => {
    if (isRecording) {
      // Stop Recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      clearInterval(timerRef.current);
      setIsRecording(false);
      setHasRecorded(true);
    } else {
      // Start Recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        audioChunksRef.current = [];
        setElapsedTime(0);
        setError(null);
        setResults(null);
        
        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        
        mediaRecorderRef.current.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          currentAudioBlobRef.current = audioBlob;
          stream.getTracks().forEach(track => track.stop());
          evaluateAudio();
        };

        mediaRecorderRef.current.start(250);
        setIsRecording(true);
        setHasRecorded(false);
        
        timerRef.current = setInterval(() => {
          setElapsedTime(prev => prev + 1);
        }, 1000);
      } catch (err) {
        console.error("Microphone error:", err);
      }
    }
  };

  const evaluateAudio = async () => {
    if (!currentAudioBlobRef.current) return;
    setIsProcessing(true);
    
    const formData = new FormData();
    formData.append('audio', currentAudioBlobRef.current, 'recording.webm');
    formData.append('target_text', passage.text);

    try {
      const response = await fetch((import.meta.env.VITE_API_URL || '') + '/api/evaluate', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Evaluation failed');
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const generateNWAMatrix = () => {
    if (!results || !results.target_text || !results.transcription) return null;
    
    const cleanText = (text) => text.toLowerCase().replace(/[^\w\s-]/g, '');
    const targetWords = cleanText(results.target_text).split(/\s+/).filter(w => w);
    const spokenWords = cleanText(results.transcription).split(/\s+/).filter(w => w);
    
    // Safety check for massive tables that might crash UI
    if (targetWords.length > 50 || spokenWords.length > 50) return null;

    const GAP = -2;
    const MATCH = 5;
    const MISMATCH = -2;
    
    const matrix = Array(spokenWords.length + 1).fill(0).map(() => Array(targetWords.length + 1).fill(0));
    
    for (let i = 0; i <= spokenWords.length; i++) matrix[i][0] = i * GAP;
    for (let j = 0; j <= targetWords.length; j++) matrix[0][j] = j * GAP;
    
    for (let i = 1; i <= spokenWords.length; i++) {
      for (let j = 1; j <= targetWords.length; j++) {
         let cost = spokenWords[i-1] === targetWords[j-1] ? MATCH : MISMATCH;
         matrix[i][j] = Math.max(
            matrix[i-1][j-1] + cost,
            matrix[i-1][j] + GAP,
            matrix[i][j-1] + GAP
         );
      }
    }
    return { matrix, targetWords, spokenWords };
  };

  const generateMLDMatrix = () => {
    if (!results || !results.trace) return null;
    
    let errorStep = results.trace.find(step => step.target !== '-' && step.spoken !== '-' && step.target.toLowerCase() !== step.spoken.toLowerCase());
    if (!errorStep && results.trace.length > 0 && results.trace[0].target !== '-') {
      errorStep = results.trace[0]; 
    }
    if (!errorStep || errorStep.target === '-' || errorStep.spoken === '-') return null;
    
    const w1 = errorStep.target.toLowerCase().split(''); // Target columns
    const w2 = errorStep.spoken.toLowerCase().split(''); // Spoken rows
    
    const matrix = Array(w2.length + 1).fill(0).map(() => Array(w1.length + 1).fill(0));
    
    for (let i = 0; i <= w2.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= w1.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= w2.length; i++) {
      for (let j = 1; j <= w1.length; j++) {
         if (w2[i-1] === w1[j-1]) {
           matrix[i][j] = matrix[i-1][j-1];
         } else {
           let isVowelShift = (['e','i'].includes(w1[j-1]) && ['e','i'].includes(w2[i-1])) || 
                              (['o','u'].includes(w1[j-1]) && ['o','u'].includes(w2[i-1]));
           let cost = isVowelShift ? 0.3 : 1.0;
           
           matrix[i][j] = Math.min(
              matrix[i-1][j] + 1,
              matrix[i][j-1] + 1,
              matrix[i-1][j-1] + cost
           );
         }
      }
    }
    return { matrix, w1, w2, targetWord: errorStep.target, spokenWord: errorStep.spoken };
  };

  const nwaData = generateNWAMatrix();
  const mldData = generateMLDMatrix();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans relative">
      <header className="bg-black text-white p-4 sm:p-6 flex justify-between items-center z-10 sticky top-0 shadow-md">
        <h1 className="text-xl sm:text-2xl font-black tracking-tight uppercase">Admin Demo Mode</h1>
        <button onClick={() => { localStorage.removeItem('isAdmin'); navigate('/'); }} className="text-white hover:text-gray-300 transition-colors uppercase text-sm font-bold tracking-widest flex items-center gap-2">
          Exit Admin
        </button>
      </header>

      {!isTestReady ? (
        <main className="flex-grow flex items-center justify-center p-4">
           <div className="bg-white p-8 rounded-2xl shadow-xl max-w-2xl w-full border border-gray-100">
             <h2 className="text-3xl font-extrabold mb-8 text-center uppercase">Admin Setup</h2>
             
             {!selectedLevel ? (
               <div className="space-y-6">
                 <h3 className="text-xl font-bold text-center text-gray-700">Select Passage Level</h3>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   {['Beginner', 'Moderate', 'Expert'].map(level => (
                     <button
                       key={level}
                       onClick={() => handleLevelSelect(level)}
                       className="py-4 px-6 bg-gray-100 hover:bg-[#0096FF] hover:text-white text-gray-800 font-bold rounded-xl transition-colors"
                     >
                       {level}
                     </button>
                   ))}
                 </div>
               </div>
             ) : (
               <div className="space-y-8">
                 <div className="text-center">
                    <span className="bg-blue-100 text-blue-800 px-4 py-2 rounded-full font-bold uppercase text-sm">Level: {selectedLevel}</span>
                 </div>
                 
                 <div className="text-center">
                   <h3 className="text-xl font-bold mb-4">Mic Test</h3>
                   {micStatus === 'idle' ? (
                      <button onClick={startMicTest} className="bg-black text-white px-8 py-4 rounded-full font-bold shadow-lg hover:-translate-y-1 transition-all uppercase">
                        Start Mic Test
                      </button>
                   ) : micStatus === 'recording' ? (
                      <div className="animate-pulse flex flex-col items-center gap-4">
                        <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center">
                           <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                        </div>
                        <span className="text-red-500 font-bold uppercase">Recording test...</span>
                      </div>
                   ) : (
                      <div className="flex flex-col items-center gap-6">
                        <audio src={testAudioUrl} controls className="w-full max-w-md" />
                        <div className="flex gap-4">
                          <button onClick={() => setMicStatus('idle')} className="bg-gray-200 text-gray-800 px-6 py-3 rounded-full font-bold uppercase">Retest Mic</button>
                          <button onClick={() => setIsTestReady(true)} className="bg-[#0096FF] text-white px-8 py-3 rounded-full font-bold shadow-lg hover:-translate-y-1 transition-all uppercase">Proceed</button>
                        </div>
                      </div>
                   )}
                 </div>
               </div>
             )}
           </div>
        </main>
      ) : (
        <main className="max-w-5xl mx-auto pt-10 px-4 pb-20 w-full space-y-10">
          
          <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100">
             <div className="flex justify-between items-center mb-6">
                <span className="text-sm font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full uppercase">Admin Target</span>
                <span className="bg-blue-50 text-blue-600 px-4 py-1 rounded-full font-bold uppercase text-xs">{selectedLevel}</span>
             </div>
             <p className="text-2xl leading-relaxed text-center font-medium text-black">
                "{passage?.text}"
             </p>
             <div className="text-center mt-6 text-sm text-gray-400 italic">
                Source: {passage?.source}
             </div>
          </div>

          <div className="flex flex-col items-center justify-center">
            {!hasRecorded && (
              <button
                onClick={toggleRecording}
                disabled={isProcessing}
                className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transform transition-all hover:scale-105 ${isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-black hover:bg-gray-800'} ${isProcessing ? 'opacity-50 cursor-not-allowed hover:scale-100' : ''}`}
              >
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isRecording ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path>
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                  )}
                </svg>
              </button>
            )}
            
            {isRecording && (
              <div className="mt-4 text-xl font-mono font-bold text-red-500">
                {formatTime(elapsedTime)}
              </div>
            )}

            <p className="mt-6 font-bold text-lg text-gray-500">
              {isRecording ? "Recording..." : isProcessing ? "Processing Algorithm Trace..." : hasRecorded ? "Trace Generated" : "Click to Start"}
            </p>
            
            {error && <div className="mt-4 bg-red-100 text-red-600 px-6 py-3 rounded-lg font-bold">{error}</div>}
          </div>

          {/* Results Visualizer */}
          {results && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-3xl font-extrabold text-center uppercase tracking-widest border-b pb-4">Algorithm Trace Results</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 flex flex-col items-center justify-center text-center">
                   <div className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">Accuracy</div>
                   <div className="text-5xl font-black text-blue-600">{results.accuracy_rate}%</div>
                   <div className="text-sm text-gray-500 mt-2">{results.correct_words} Correct Words</div>
                </div>
                
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 flex flex-col items-center justify-center text-center">
                   <div className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">Speed</div>
                   <div className="text-5xl font-black text-purple-600">{results.wcpm}</div>
                   <div className="text-sm text-gray-500 mt-2">WCPM</div>
                </div>

                <div className="bg-black p-6 rounded-2xl shadow-xl flex flex-col items-center justify-center text-center text-white">
                   <div className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">Total Duration</div>
                   <div className="text-5xl font-black text-white">{results.duration_seconds}s</div>
                </div>
              </div>

              <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 p-8">
                  <h3 className="text-2xl font-black text-gray-800 mb-6">Evaluation Trace Table</h3>
                  
                  <div className="bg-gray-50 p-6 rounded-2xl mb-8 border border-gray-100">
                    <h4 className="text-lg font-bold text-gray-800 mb-3">How the Algorithm Works</h4>
                    <div className="text-gray-600 text-sm space-y-4">
                       <p>This system uses a hybrid approach combining <strong>Needleman-Wunsch</strong> sequence alignment and <strong>Modified Levenshtein Distance (MLD)</strong> to evaluate reading accuracy.</p>
                       <ul className="list-disc pl-5 space-y-2">
                          <li><strong>Needleman-Wunsch Alignment:</strong> Aligns the spoken words with the target text to find the optimal sequence, detecting exact matches, missing words (deletions), and extra words (insertions).</li>
                          <li><strong>Modified Levenshtein Distance (MLD):</strong> When a word doesn't match perfectly, MLD calculates how phonetically similar the spoken word is to the target. Minor mispronunciations receive partial credit instead of a complete failure.</li>
                       </ul>

                       <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-8">
                         {/* Dynamic Needleman-Wunsch Table */}
                         <div className="overflow-x-auto bg-white p-4 rounded-xl border border-gray-200">
                           <h5 className="font-bold text-gray-800 mb-3 text-center text-xs uppercase tracking-wider">Fig 1. Needleman-Wunsch Alignment Matrix</h5>
                           {nwaData ? (
                             <>
                               <table className="w-full text-center border-collapse border border-gray-200 text-[10px] sm:text-xs font-mono">
                                 <thead>
                                   <tr className="bg-blue-50">
                                     <th className="border border-gray-200 p-1 sm:p-2 sticky left-0 bg-blue-50"></th>
                                     <th className="border border-gray-200 p-1 sm:p-2 italic text-gray-500">(target)</th>
                                     {nwaData.targetWords.map((word, idx) => (
                                       <th key={idx} className="border border-gray-200 p-1 sm:p-2 text-blue-800">{word}</th>
                                     ))}
                                   </tr>
                                 </thead>
                                 <tbody>
                                   {nwaData.matrix.map((row, i) => (
                                     <tr key={i}>
                                       <td className={`border border-gray-200 p-1 sm:p-2 font-bold sticky left-0 ${i === 0 ? 'italic text-gray-500 bg-blue-50' : 'text-blue-800 bg-blue-50'}`}>
                                          {i === 0 ? '(spoken)' : nwaData.spokenWords[i - 1]}
                                       </td>
                                       {row.map((val, j) => (
                                         <td key={j} className={`border border-gray-200 p-1 sm:p-2 ${val > 0 ? 'bg-green-50 font-bold' : val < -5 ? 'text-red-500' : ''}`}>
                                           {val}
                                         </td>
                                       ))}
                                     </tr>
                                   ))}
                                 </tbody>
                               </table>
                               <div className="mt-3 text-center text-xs text-gray-500 italic">Real-time mapping of your spoken passage.</div>
                             </>
                           ) : (
                             <div className="text-center text-gray-500 italic p-4">Matrix is too large or data unavailable.</div>
                           )}
                         </div>

                         {/* Dynamic Levenshtein Table */}
                         <div className="overflow-x-auto bg-white p-4 rounded-xl border border-gray-200">
                           <h5 className="font-bold text-gray-800 mb-3 text-center text-xs uppercase tracking-wider">Fig 2. Levenshtein Distance Matrix</h5>
                           {mldData ? (
                             <>
                               <table className="w-full text-center border-collapse border border-gray-200 text-xs font-mono">
                                 <thead>
                                   <tr className="bg-purple-50">
                                     <th className="border border-gray-200 p-2 sticky left-0 bg-purple-50"></th>
                                     <th className="border border-gray-200 p-2 bg-gray-100">0</th>
                                     {mldData.w1.map((char, idx) => (
                                       <th key={idx} className="border border-gray-200 p-2 text-purple-800">{char}</th>
                                     ))}
                                   </tr>
                                 </thead>
                                 <tbody>
                                   {mldData.matrix.map((row, i) => (
                                     <tr key={i}>
                                       <td className={`border border-gray-200 p-2 font-bold sticky left-0 ${i === 0 ? 'text-gray-400 bg-gray-50' : 'text-purple-800 bg-purple-50'}`}>
                                         {i === 0 ? ' ' : mldData.w2[i - 1]}
                                       </td>
                                       {row.map((val, j) => (
                                         <td key={j} className={`border border-gray-200 p-2 ${(i === mldData.matrix.length - 1 && j === row.length - 1) ? 'bg-orange-100 font-bold' : ''}`}>
                                           {Number.isInteger(val) ? val : val.toFixed(1)}
                                         </td>
                                       ))}
                                     </tr>
                                   ))}
                                 </tbody>
                               </table>
                               <div className="mt-3 text-center text-xs text-gray-500 italic">Target: "{mldData.targetWord}" vs Spoken: "{mldData.spokenWord}"</div>
                             </>
                           ) : (
                             <div className="text-center text-gray-500 italic p-4">No mispronunciations detected for MLD evaluation.</div>
                           )}
                         </div>
                       </div>

                       <div className="bg-white p-4 rounded-lg mt-6 font-mono text-xs border border-gray-200 text-center">
                          <strong>Scoring Weights:</strong>
                          <span className="mx-2 text-green-600">Exact Match: +5.0</span> | 
                          <span className="mx-2 text-blue-600">Partial Match: +5.0 * (1.0 - MLD)</span> | 
                          <span className="mx-2 text-orange-600">Stutter: +2.5</span> | 
                          <span className="mx-2 text-red-600">Mismatch: -2.0</span>
                       </div>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b-2 border-gray-200">
                          <th className="py-4 px-4 text-sm font-bold text-gray-500 uppercase tracking-wider">Target Word</th>
                          <th className="py-4 px-4 text-sm font-bold text-gray-500 uppercase tracking-wider">Spoken Word</th>
                          <th className="py-4 px-4 text-sm font-bold text-gray-500 uppercase tracking-wider">Operation Type</th>
                          <th className="py-4 px-4 text-sm font-bold text-gray-500 uppercase tracking-wider">Penalty Score</th>
                          <th className="py-4 px-4 text-sm font-bold text-gray-500 uppercase tracking-wider">Outcome</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(!results.trace || results.trace.length === 0) ? (
                          <tr>
                            <td colSpan="5" className="py-8 text-center text-gray-500 italic">No trace generated.</td>
                          </tr>
                        ) : (
                          results.trace.map((step, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                              <td className="py-4 px-4 font-mono text-gray-900">{step.target}</td>
                              <td className="py-4 px-4 font-mono text-gray-900">
                                {results.stutter_words?.includes(step.spoken) ? (
                                  <span className="bg-orange-200 text-orange-900 font-extrabold px-2 py-1 rounded-md shadow-sm">{step.spoken}</span>
                                ) : (
                                  step.spoken
                                )}
                              </td>
                              <td className="py-4 px-4">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                  step.type === 'match' ? 'bg-green-100 text-green-800' :
                                  results.stutter_words?.includes(step.spoken) ? 'bg-orange-200 text-orange-900' :
                                  step.type === 'insertion' ? 'bg-orange-100 text-orange-800' :
                                  step.type === 'deletion' ? 'bg-red-100 text-red-800' :
                                  'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {results.stutter_words?.includes(step.spoken) ? `STUTTER (${step.type.toUpperCase()})` : step.type.toUpperCase()}
                                </span>
                              </td>
                              <td className="py-4 px-4 font-mono font-semibold text-gray-600">
                                {step.distance.toFixed(1)}
                              </td>
                              <td className="py-4 px-4">
                                {step.is_correct ? (
                                  <span className="flex items-center text-green-600 font-bold">Pass</span>
                                ) : (
                                  <span className="flex items-center text-red-600 font-bold">Fail</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
              </div>
              
              <div className="text-center mt-12">
                 <button onClick={() => { setResults(null); setHasRecorded(false); setIsTestReady(false); setSelectedLevel(null); }} className="bg-black text-white px-8 py-4 rounded-full font-bold shadow-lg uppercase">
                    Test Another Passage
                 </button>
              </div>

            </div>
          )}
        </main>
      )}
    </div>
  );
}
