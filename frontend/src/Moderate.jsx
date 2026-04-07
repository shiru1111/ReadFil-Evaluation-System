import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const rawPassages = [
  "May isang asong gutom na gutom na naglalakad sa kalsada. Habang naglalakad, ibinubulong niya sa sarili na kailangan niyang makakita ng isang lunggang puno ng pagkain.",
  "Nang makakita siya ng lungga sa dulo ng kalsada, agad siyang pumasok dito. Kumain siya hanggang mabusog.",
  "Nang lalabas na lamang siya, napansin niyang hindi na siya magkasya sa labasan. Sumigaw siya upang humingi ng tulong.",
  "Hanap nang hanap si Susan kay Muning. Dala ni Susan ang lalagyan ng pagkain ni Muning.",
  "May laman na ang lalagyan, pero wala si Muning. Wala siya sa kusina. Wala rin siya sa silid.",
  "Nakita ni Susan ang kasama ni Muning. Mga kuting ang kasama ni Muning sa kahon. May puti, itim at magkahalong puti at itim na kulay na mga kuting. Tuwang-tuwa si Susan.",
  "Si Brownie ay aking alagang aso. Ang aking aso ay masamang magalit. Minsan ay may pumasok na malaking manok sa aming bakuran.",
  "Kaagad niya itong tinahulan. Kung hindi lamang siya nakatali nang mahigpit, malamang na habulin niya ito.",
  "Bahagya pa niyang ginalaw ang kanyang buntot nang makita ako. Kaagad kong binitbit sa buntot ang daga at ipinakita kay Tatay.",
  "Maraming salamat mga bata. Natatapos agad ang gawain kung nagtutulungan.",
  "Pagdating sa paaralan, gayundin ang kanilang nakita. Maputik ang silid at madungis ang pader. Nagkalat ang mga dahon sa buong paligid.",
  "Papasok na ng paaralan ang tatlong mag-aaral. Nakita nila ang nagkalat na mga sanga ng puno sa mahabang daan.",
  "Nagtitinda ng dyaryo si Luis tuwing umaga. Nilagang mais at saging naman ang itinitinda ni Karen.",
  "Katulad mo rin. Nakapagbibigay din ako kay Inay at nakapag-iipon pa ako.",
  "Dumaan ang habagat sa Luzon. Nagdulot ito ng pinsala sa tao.",
  "Maiiwasan sana ang pagguho ng lupa sa mga kabundukan kung isasagawa ng mga tao ang programa ng Kagawaran ng Pangangalaga sa kapaligiran at Likas na Yaman.",
  "Iwasan natin ang paggamit ng mga plastik at ang pagtatapon ng basura kung saan-saan.",
  "Mag-umpisa tayong maglinis ng paligid at magtanim ng mga puno sa mga bakanteng lupa ng ating bakuran.",
  "Matiyaga siyang nagsaka at maingat na nagplano ng patubigan para sa mga tanim",
  "Isang araw, nagulat si Rizal nang biglang dumating sa Dapitan si Pio Valenzuela",
  "Binanggit din niya ang alok na ibibigay ni Bonifacio kay Rizal, ang liderato ng katipunan kung sakaling aanib ang doktor sa kilusang ito.",
  "Sa simula pa lang ng kasaysayan ng ating mundo, mayroon nang di pagkakasundo sa pagitan ng dalawang grupo ng tao.",
  "Anumang pag-aaway na naglalayong sirain, talunin at pagharian ang bawat isa ay maituturing na digmaan.",
  "Ang basurang nabubulok ay maaaring pampataba ng lupa na pagtataniman ng mga halaman",
  "Pumili ng isang lugar at humukay ng pagtatapunan ng basurang nabubulok tulad ng balat ng prutas at tuyong dahon",
  "Muling magagamit ang ibang basurang di-nabubulok tulad ng mga basyo ng lata, plastic, o bote.",
  "Malaki ang matutulong natin sa pagpapanatili ng kalinisan at kaayusan sa ganitiong paraan.",
  "Nagtitiis silang mawalay sa pamilya upang makapag hanapbuhay at may maitustos sa pamilya",
  "Higit sa walong milyong Pilipino ang naghahanapbuhay sa iba’t ibang bansa ngayon.",
  "Bilang pagkilala sa malaking kontribusyon nila sa ating bansa, pinagkaloooban sila ng ating pamahalaan ng karapatang bumoto kahit sila ay nasa labas ng bansa",
  "Ang Embahada ng Pilipinas sa bansang kanilang pinag hahanapbuhayan ay nagsisilbing sentro ng botohan.",
  "Gamit din bilang dekorasyon ang makukulay at iba’t ibang hugis na kiping na mula sa bigas.",
  "Maraming mga tao ang nakapag pasigla ng ating kultura sa larangan ng pelikula, paglilok, literatura, at arkitektura.",
  "Nagpapaalala ang mga ito na puno ng pag-asa ang buhay at ng pagmamahal sa kalayaan.",
  "Nagpapahiwatig din ito na malulutas ang suliranin at matutupad ang mga mithiin kung hihilingin ito sa Poong Maykapal",
  "kapag nakatamo ang bansa ng tagumpay, nakadarama ng pagmamalaki ang mamamayan.",
  "Ang pangangalaga sa kalayaan at karapatang tinatamasa ng mamamayan ay isa sa mga pangunahing katangian ng lipunang demokratiko.",
  "Hindi mabilang ang malalaki at maliliit na mga robot na kumikilos tulad ng mga tao.",
  "May makukulay na mga sasakyang panghimpapawid na animo saranggolang nakasabit sa langit.",
  "Ang usapin ng populasyon ay mahalaga para sa pag-unlad ng isang bansa.",
  "Ang mabilis na paglaki ng populasyon ay kritikal sa madaling pagkaubos ng likas na yaman.",
  "Kung ang likas na yaman ay isa sa pangunahing batayan ng pag-unlad ng isang bansa, ang malaking populasyon ay nangangahulugang maramihang paggamit sa likas ng yaman.",
  "Marami rin ang walang hanapbuhay kung kaya’t nangingibang-bansa sila kung saan mas malaki ang kita",
  "Ang krimen na dulot ng matinding kahirapan ay hadlang din sa pag-unlad ng ekonomiya dahil sa kawalan ng seguridad sa lipunan.",
  "nagiging dahilan din ito upang mabigong mahikayat ang mga dayuhan na mamuhunan sa ating bansa.",
  "Tungkulin ng mga batang sumunod sa batas ng bansa at sa mga tuntunin sa pinapasukang paaralan",
  "Ang ating bansa ay napaliligiran ng malawak na karagatan. Sagana ito sa iba’t ibang uri ng isda",
  "Iba’t ibang uri ng isda ang dinadala natin sa mga bansang ito tulad ng tuna at lapu-lapu.",
  "Malaki ang naitutulong nito sa hanapbuhay ng ating mga mangingisda. Subalit ang kasaganahang ito ay malimit na inaabuso.",
  "May mga mangingisdang gumagamit ng mga pampasabog at lasong kemikal para makahuli ng maraming isda.",
  "Namamatay ang maliliit na isda na dapat sana ay lumaki at dumami pa. Ang iba naman ay sinisiral.",
  "Ang Kagawaran ng Agrikultura sa pangunguna ng ay patuloy na gumagawa ng mga hakbang para masugpo ang mga mangingisdang lumalabag sa batas.",
  "Malaking bahagi ng ekonomiya ang nagbubuhat sa sektor ng mga mangingisda.",
  "Ito ang mga dahilan kung bakit kailangang alagaan ang industriyang ito.",
  "Iba’t ibang kamangha-manghang hugis ang nabuo mula sa mga limestone sa loob ng kuweba.",
  "Ang ilog ay tinatayang dalawang kilometro ang haba at ito ay tumutuloy sa dagat.",
  "Anumang gawaing ninanais niya ay isinasakatuparan niya agad. Ayaw niya na may masayang na panahon dahil naniniwala siya na ang oras ay ginto.",
  "Sa pamamagitan ng pagsasakatuparan ng katarungang Panlipunan, binigyan niya ng pantay na pagpapahalaga ang mahihirap at mayayaman",
  "Ang bulaklak ng niyog ay ginagawang suka at alak. Ang ubod naman ay ginagawang atsara, sariwang lumpiya, at panghalo sa mga lutuing karne o lamang dagat.",
  "Ang bawat panukalang-batas na mapagtitibay ng kongreso ay ihaharap sa pangulo bago maging batas. Lalagdaan ito ng pangulo kung sinasang-ayunan niya ito",
  "May pinagdadaanang proseso ang isang panukalang-batas bago ito tuluyang maging batas para maipatupad sa ating bansa.",
  "Tatlong araw bago mapagtibay ito ay ipinag-uutos ang pamamahagi ng nakalimbag na kopya nito sa mga kagawad ng kapulungan.",
  "Tanghaling tapat na. Marami sa mga mag-aaral ang nagmamadali nang umuwi. Walang lilim na masisilungan kahit saan.",
  "Ihanda muna natin ang mga takip ng bote o tansan para sa gulong. Pagkatapos, kailangan nating maghanap ng kahon ng posporo para sa katawan.",
  "Kasama si Jamil, isang batang Muslim, sa sumalubong sa pagdating ng kanyang tiyuhin.",
  "Nagkukulang din sa suplay ng tubig sa mga imbakan gaya ng La Mesa Dam na matatagpuan sa Lungsod Quezon at Angat Dam sa Bulacan.",
  "Ang mga ito ang pinagkukunan ng tubig sa kamaynilaan at sa mga karatig probinsya nito.",
  "Dahil sa patuloy na pagputol ng mga punong kahoy, marami na ang nagaganap na mga kalamidad tulad ng biglaang pagbaha sa iba’t ibang pook.",
  "Sa paggawa ng karosang ito, ipinakikita ng mga Pilipino ang kanilang pagiging malikhain at pagiging matulungin.",
  "Ang pinakasikat at inaabangang gawain tuwing pista ng bulaklak ay ang parada."
];

const allPassages = rawPassages.map(text => ({
  text: text,
  source: "Phil-IRI The Philippine Informal Reading Inventory Manual"
}));

export default function Moderate() {
  const navigate = useNavigate();

  const [isTestReady, setIsTestReady] = useState(() => {
    return localStorage.getItem('moderate_isTestReady') === 'true';
  });
  const [currentIndex, setCurrentIndex] = useState(() => {
    const saved = localStorage.getItem('moderate_currentIndex');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [testPassages, setTestPassages] = useState(() => {
    const saved = localStorage.getItem('moderate_passages');
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
      localStorage.setItem('moderate_passages', JSON.stringify(selected));
    }
  }, [testPassages.length]);

  useEffect(() => {
    localStorage.setItem('moderate_currentIndex', currentIndex.toString());
  }, [currentIndex]);

  // Clean up media tracks and animations when component unmounts
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    };
  }, []);

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

      ctx.fillStyle = '#f9fafb'; // Match the gray-50 background of the container
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0096FF'; // Primary blue theme for Moderate level
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
    // Secure the stream for the actual test before moving on
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
      localStorage.setItem('moderate_isTestReady', 'true');
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
    localStorage.removeItem('moderate_passages');
    localStorage.removeItem('moderate_currentIndex');
    localStorage.removeItem('moderate_isTestReady');
    navigate('/');
  };
  
  const nextPassage = () => {
    if (currentIndex < testPassages.length - 1) {
      setCurrentIndex((prevIndex) => prevIndex + 1);
      setIsRecording(false); 
      setHasRecorded(false);
    } else {
      localStorage.removeItem('moderate_passages');
      localStorage.removeItem('moderate_currentIndex');
      localStorage.removeItem('moderate_isTestReady');
      navigate('/results');
    }
  };

  if (testPassages.length === 0) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#0096FF]/10 to-white text-black font-sans relative">
      <nav className="w-full bg-white/80 backdrop-blur-md shadow-sm px-10 lg:px-20 py-5 flex justify-between items-center">
        <div className="text-2xl font-black tracking-tight text-[#0096FF]">ReadFil</div>
        <a href="/" onClick={handleReturnHomeClick} className="font-semibold text-sm uppercase tracking-wide hover:text-[#0096FF] transition-colors cursor-pointer">
          Return Home
        </a>
      </nav>

      {!isTestReady ? (
        <main className="max-w-3xl mx-auto pt-32 px-10 pb-20 text-center">
          <h1 className="text-4xl font-extrabold mb-4 text-[#0096FF]">Moderate Microphone Check</h1>
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
                      className="bg-[#0096FF] hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all transform hover:-translate-y-1"
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
            <h1 className="text-4xl font-extrabold mb-4 text-[#0096FF]">Moderate Evaluation</h1>
          </div>
          <div className="bg-white p-10 rounded-[2rem] shadow-xl border border-gray-100 mb-10">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-[#0096FF]">Reading Material</h2>
              <span className="text-sm font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{currentIndex + 1} / {testPassages.length}</span>
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
            <button onClick={toggleRecording} className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transform transition-all hover:scale-105 ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-black hover:bg-gray-800'}`}>
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isRecording ? (
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path>
                ) : (
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                )}
              </svg>
            </button>
            <p className={`mt-6 font-bold text-lg ${isRecording ? 'text-red-500' : 'text-gray-500'}`}>{isRecording ? 'Recording... Click to stop.' : (hasRecorded ? 'Recording sent to server!' : 'Click to start recording')}</p>
            {hasRecorded && (
              <button onClick={nextPassage} className="mt-8 bg-[#0096FF] text-white font-bold py-4 px-10 rounded-full shadow-lg hover:bg-blue-600 transition-all transform hover:-translate-y-1">
                {currentIndex < testPassages.length - 1 ? 'Proceed to Next Passage \u2192' : 'Finish Test \u2192'}
              </button>
            )}
          </div>
        </main>
      )}

      {/* Return Home Custom Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={() => setShowConfirmModal(false)}
          ></div>
          
          <div className="relative bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in duration-200">
            <div className="p-8 pb-6 border-b border-gray-100">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-3xl font-extrabold text-[#0096FF]">
                  Return Home
                </h3>
                <button 
                  onClick={() => setShowConfirmModal(false)}
                  className="text-gray-400 hover:text-gray-800 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
              <p className="text-gray-500">Are you sure you want to leave?</p>
            </div>

            <div className="p-8 text-center">
              <p className="text-lg text-gray-700 font-medium mb-8">
                Your current test progress will be reset.
              </p>
              <div className="flex gap-4">
                <button 
                  type="button" 
                  onClick={() => setShowConfirmModal(false)}
                  className="w-1/2 px-6 py-4 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={confirmReturnHome}
                  className="w-1/2 px-6 py-4 rounded-xl font-bold text-white bg-[#0096FF] hover:bg-blue-600 transition-all transform hover:-translate-y-1 shadow-lg"
                >
                  Proceed
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}