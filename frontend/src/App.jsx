import React, { useState, useEffect } from 'react';
import myImage from './assets/picture1.png';
import { useNavigate } from 'react-router-dom';

export default function App() {
  const [imageOpacity, setImageOpacity] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCriteriaModalOpen, setIsCriteriaModalOpen] = useState(false); 
  const [isAlgorithmModalOpen, setIsAlgorithmModalOpen] = useState(false); 
  const [selectedLevel, setSelectedLevel] = useState('');
  
  // State variables to hold the user's input
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      const opacity = Math.max(1 - scrollPosition / 500, 0);
      setImageOpacity(opacity);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleOpenModal = (level) => {
    setSelectedLevel(level);
    setIsModalOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedLevel('');
    setFirstName(''); 
    setLastName('');  
    document.body.style.overflow = 'unset';
  };

  const handleProceed = (e) => {
    e.preventDefault();
    
    localStorage.setItem('user_firstName', firstName);
    localStorage.setItem('user_lastName', lastName);
    
    const levelToSave = selectedLevel === 'Progressive Mode' ? 'Progressive' : selectedLevel;
    localStorage.setItem('evaluated_level', levelToSave);

    document.body.style.overflow = 'unset';
    
    if (selectedLevel === 'Progressive Mode') navigate('/progressive'); 
    else if (selectedLevel === 'Beginner') navigate('/beginner');
    else if (selectedLevel === 'Moderate') navigate('/moderate');
    else if (selectedLevel === 'Expert') navigate('/expert');
  };

  const getLevelStyles = () => {
    switch (selectedLevel) {
      case 'Beginner':
        return { color: 'text-black', bg: 'bg-black', hover: 'hover:bg-gray-800', textBtn: 'text-white' };
      case 'Moderate':
        return { color: 'text-[#0096FF]', bg: 'bg-[#0096FF]', hover: 'hover:bg-blue-600', textBtn: 'text-white' };
      case 'Expert':
        return { color: 'text-[#005FA3]', bg: 'bg-[#005FA3]', hover: 'hover:bg-blue-800', textBtn: 'text-white' };
      case 'Progressive Mode':
        return { color: 'text-transparent bg-clip-text bg-gradient-to-r from-black via-[#0096FF] to-[#005FA3]', bg: 'bg-gradient-to-r from-black via-[#0096FF] to-[#005FA3]', hover: 'hover:opacity-90', textBtn: 'text-white' };
      default:
        return { color: 'text-[#0096FF]', bg: 'bg-[#0096FF]', hover: 'hover:bg-blue-600', textBtn: 'text-white' };
    }
  };

  const theme = getLevelStyles();

  return (
    <div className="min-h-screen bg-white text-black font-sans relative">
      
      {/* GLOBAL CUSTOM SCROLLBAR STYLE */}
      <style>{`
        ::-webkit-scrollbar {
          width: 12px;
        }
        ::-webkit-scrollbar-track {
          background: #f8fafc; /* light gray bg */
        }
        ::-webkit-scrollbar-thumb {
          background-color: #0096FF; /* ReadFil Blue */
          border-radius: 20px;
          border: 3px solid #f8fafc; /* creates a nice padding effect */
        }
        ::-webkit-scrollbar-thumb:hover {
          background-color: #005FA3; /* Darker blue on hover */
        }
        /* For Firefox */
        * {
          scrollbar-width: thin;
          scrollbar-color: #0096FF #f8fafc;
        }
      `}</style>

      <nav className="fixed w-full top-0 bg-white/80 backdrop-blur-md shadow-sm z-50 px-10 lg:px-20 py-5 flex justify-between items-center">
        <div className="text-2xl font-black tracking-tight text-[#0096FF]">
          ReadFil
        </div>
        <ul className="flex space-x-8 font-semibold text-sm uppercase tracking-wide items-center">
          <li>
            <button 
              onClick={() => setIsCriteriaModalOpen(true)} 
              className="hover:text-[#0096FF] transition-colors font-semibold uppercase tracking-wide"
            >
              Criteria
            </button>
          </li>
          <li>
            <button 
              onClick={() => setIsAlgorithmModalOpen(true)} 
              className="hover:text-[#0096FF] transition-colors font-semibold uppercase tracking-wide"
            >
              Algorithm
            </button>
          </li>
          <li><a href="#footer" className="hover:text-[#0096FF] transition-colors">About Us</a></li>
        </ul>
      </nav>

      <main className="relative flex flex-col lg:flex-row items-start justify-between min-h-screen">
        <div className="lg:w-1/2 pl-10 lg:pl-20 pr-12 pt-32 lg:pt-48 z-20 relative">
          <h1 className="text-5xl lg:text-7xl font-extrabold mb-8 leading-tight">
            Master Your Tagalog Fluency
          </h1>
          <p className="text-lg mb-10 leading-relaxed opacity-80">
  Improve your reading skills with ReadFil. Our intelligent system listens to your speech and guides you in enhancing your pronunciation and fluency. 
  Through interactive assessments and real-time feedback, you can track your progress and build confidence in reading Tagalog effectively.
          </p>
          <a href="#levels" className="inline-block bg-[#0096FF] hover:bg-[#8ACEFF] text-white hover:text-black font-bold py-4 px-10 rounded-full shadow-lg transform transition-all hover:-translate-y-1 text-lg">
            Test your Tagalog now
          </a>
        </div>

        <div className="lg:absolute lg:top-0 lg:right-0 lg:w-[55%] w-full h-[600px] lg:h-screen sticky top-0 z-10">
          <div className="w-full h-full relative" style={{ opacity: imageOpacity, transition: 'opacity 0.1s ease-out' }}>
            <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-white via-white/70 to-transparent z-20 w-1/2"></div>
            <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-white to-transparent z-20"></div>
            <img
              src={myImage}
              alt="Reading placeholder"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </main>

      <section id="levels" className="relative z-30 px-10 lg:px-20 py-24 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-extrabold mb-12 text-center text-black">Select Your Level</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div className="bg-white p-8 rounded-[2rem] shadow-lg border border-[#8ACEFF]/30 hover:-translate-y-2 transition-transform flex flex-col items-center text-center">
              <h3 className="text-2xl font-bold text-black mb-3">Beginner</h3>
              <p className="text-gray-600 mb-8 flex-grow">Start your reading journey here with short sentences and simple everyday words.</p>
              <button onClick={() => handleOpenModal('Beginner')} className="w-full bg-black text-white py-3 rounded-full hover:bg-gray-800 transition-colors font-bold">
                Start Beginner
              </button>
            </div>

            <div className="bg-white p-8 rounded-[2rem] shadow-lg border border-[#8ACEFF]/30 hover:-translate-y-2 transition-transform flex flex-col items-center text-center">
              <h3 className="text-2xl font-bold text-[#0096FF] mb-3">Moderate</h3>
              <p className="text-gray-600 mb-8 flex-grow">Take your skills to the next level with slightly longer passages and conversational phrases.</p>
              <button onClick={() => handleOpenModal('Moderate')} className="w-full bg-[#0096FF] text-white py-3 rounded-full hover:bg-blue-600 transition-colors font-bold">
                Start Moderate
              </button>
            </div>

            <div className="bg-white p-8 rounded-[2rem] shadow-lg border border-[#005FA3]/30 hover:-translate-y-2 transition-transform flex flex-col items-center text-center">
              <h3 className="text-2xl font-bold text-[#005FA3] mb-3">Expert</h3>
              <p className="text-gray-600 mb-8 flex-grow">Challenge yourself with advanced vocabulary and complex sentence structures.</p>
              <button onClick={() => handleOpenModal('Expert')} className="w-full bg-[#005FA3] text-white py-3 rounded-full hover:bg-blue-600 transition-colors font-bold">
                Start Expert
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-r from-black via-[#0096FF] to-[#005FA3] p-[2px] rounded-[2rem] shadow-xl hover:-translate-y-2 transition-transform">
            <div className="bg-white p-8 lg:p-10 rounded-[2rem] flex flex-col md:flex-row items-center justify-between text-center md:text-left h-full w-full">
              <div className="mb-6 md:mb-0 md:mr-8">
                <h3 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-black via-[#0096FF] to-[#005FA3] mb-3">
                  Progressive Assessment Mode
                </h3>
                <p className="text-gray-600 max-w-2xl text-lg">
                  Challenge yourself to climb the ranks of reading fluency. In this mode, you will navigate through our three reading difficulty  levels.
                </p>
              </div>
              <button onClick={() => handleOpenModal('Progressive Mode')} className="w-full md:w-auto px-10 py-4 bg-gradient-to-r from-black via-[#0096FF] to-[#005FA3] text-white rounded-full transition-opacity hover:opacity-90 font-bold text-lg whitespace-nowrap shadow-lg">
                Take Full Test
              </button>
            </div>
          </div>

        </div>
      </section>

      <section className="relative z-30 py-24 px-10 bg-black text-white overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full z-0 opacity-40">
          <div className="absolute -top-32 -left-32 w-[30rem] h-[30rem] bg-[#0096FF] rounded-full mix-blend-screen filter blur-[100px]"></div>
          <div className="absolute bottom-[-10rem] right-[-10rem] w-[30rem] h-[30rem] bg-[#8ACEFF] rounded-full mix-blend-screen filter blur-[100px]"></div>
        </div>

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <h3 className="text-4xl md:text-5xl font-extrabold mb-6">How It Works</h3>
          <p className="text-lg text-gray-300 mb-16 max-w-2xl mx-auto">
            Follow this quick process to practice your speaking skills and see exactly how much you are improving.
          </p>

          <div className="flex flex-col md:flex-row justify-center items-center gap-6 md:gap-12">
            <div className="flex flex-col items-center z-10">
              <div className="w-20 h-20 rounded-full border-4 border-[#8ACEFF] bg-black text-[#8ACEFF] flex items-center justify-center text-3xl font-black mb-4 shadow-[0_0_30px_rgba(138,206,255,0.4)]">1</div>
              <h4 className="font-bold text-xl mb-2">Connect Mic</h4>
            </div>
            
            <div className="hidden md:block w-24 h-1 bg-gradient-to-r from-[#8ACEFF] to-[#0096FF] opacity-50"></div>
            <div className="md:hidden w-1 h-12 bg-gradient-to-b from-[#8ACEFF] to-[#0096FF] opacity-50"></div>

            <div className="flex flex-col items-center z-10">
              <div className="w-20 h-20 rounded-full border-4 border-[#0096FF] bg-[#0096FF] text-white flex items-center justify-center text-3xl font-black mb-4 shadow-[0_0_30px_rgba(0,150,255,0.6)] transform scale-110">2</div>
              <h4 className="font-bold text-xl mb-2">Read Aloud</h4>
            </div>

            <div className="hidden md:block w-24 h-1 bg-gradient-to-r from-[#0096FF] to-white opacity-50"></div>
            <div className="md:hidden w-1 h-12 bg-gradient-to-b from-[#0096FF] to-white opacity-50"></div>

            <div className="flex flex-col items-center z-10">
              <div className="w-20 h-20 rounded-full border-4 border-white bg-white text-black flex items-center justify-center text-3xl font-black mb-4 shadow-[0_0_30px_rgba(255,255,255,0.4)]">3</div>
              <h4 className="font-bold text-xl mb-2">Get Evaluated</h4>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-30 px-10 lg:px-20 py-24 bg-white text-black">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="bg-gray-50 p-10 rounded-[2rem] shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <h3 className="text-3xl font-extrabold mb-4 text-[#0096FF]">Why ReadFil?</h3>
            <p className="text-gray-600 leading-relaxed text-lg">
              READFIL helps learners improve their Tagalog reading fluency by providing instant, accurate feedback on pronunciation and reading accuracy. It is designed to support users at different levels, making reading practice interactive and engaging.
            </p>
          </div>

          <div className="bg-gray-50 p-10 rounded-[2rem] shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <h3 className="text-3xl font-extrabold mb-4 text-[#0096FF]">What is the purpose?</h3>
            <p className="text-gray-600 leading-relaxed text-lg">
              The purpose of READFIL is to evaluate oral reading fluency using speech recognition and algorithm-based analysis. It measures accuracy and words correct per minute, guides learners to improve their fluency, and sees progress across Beginner, Moderate, and Expert levels.
            </p>
          </div>
        </div>
      </section>

      <footer id="footer" className="relative z-30 bg-[#121212] text-gray-300 py-16 px-10 lg:px-20 border-t border-[#333]">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 mb-10">
          <div>
            <h4 className="text-2xl font-bold text-white mb-4">About the System</h4>
            <p className="text-sm leading-relaxed text-gray-400">
              Lorem Ipsum Dolor Sit Amet
Consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.
            </p>
          </div>
          <div>
            <h4 className="text-2xl font-bold text-white mb-4">Project Details</h4>
            <p className="text-sm leading-relaxed text-gray-400 mb-2">
              READFIL is developed as a solution for modern literacy assessment. It serves as a technical solution to promote, preserve and enhance Tagalog literacy for the modern learner.
            </p>
            <p className="text-sm leading-relaxed text-gray-400">
              <strong>Developed by:</strong> CSB3
            </p>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-8 text-center text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Automated Oral Reading System. All rights reserved.
        </div>
      </footer>

      {/* =========================================
          CRITERIA POP-OUT MODAL
          ========================================= */}
      {isCriteriaModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={() => setIsCriteriaModalOpen(false)}
          ></div>
          
          <div className="relative bg-gray-50 w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-[2rem] shadow-2xl z-10 animate-in fade-in zoom-in duration-300">
            
            {/* Modal Sticky Header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm px-8 lg:px-12 py-8 border-b border-gray-200 flex justify-between items-center z-20">
              <div>
                <h2 className="text-3xl lg:text-4xl font-extrabold text-black">Evaluation Criteria</h2>
                <p className="text-gray-500 mt-2 text-lg">Discover exactly how ReadFil analyzes your voice to calculate your fluency score.</p>
              </div>
              <button 
                onClick={() => setIsCriteriaModalOpen(false)}
                className="p-3 bg-gray-100 rounded-full text-gray-500 hover:text-black hover:bg-gray-200 transition-colors shadow-sm"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            {/* Modal Body: The Detailed Calculation Cards */}
            <div className="p-8 lg:p-12 grid grid-cols-1 md:grid-cols-3 gap-10">
              {/* Accuracy Card */}
              <div className="bg-white p-10 rounded-[2rem] shadow-lg border border-gray-100 hover:-translate-y-2 transition-transform relative overflow-hidden group flex flex-col h-full">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#0096FF]/10 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
                <div className="w-16 h-16 bg-[#0096FF]/10 rounded-2xl flex items-center justify-center mb-6 text-[#0096FF]">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <h3 className="text-2xl font-bold mb-2">Accuracy Rate</h3>
                <div className="text-sm font-black text-[#0096FF] tracking-widest uppercase mb-4">50% of Final Grade</div>
                <p className="text-gray-600 leading-relaxed text-justify mb-8 flex-grow">
                  The system transcribes your speech and compares it directly to the target passage. The formula divides the number of correctly pronounced words by the total number of words, ensuring every single word is accounted for.
                </p>
                <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 mt-auto">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 text-center">Mathematical Formula</p>
                  <p className="text-[#0096FF] font-mono font-bold text-sm text-center">
                    ( Correct / Total ) × 100
                  </p>
                </div>
              </div>

              {/* WCPM Card */}
              <div className="bg-white p-10 rounded-[2rem] shadow-lg border border-gray-100 hover:-translate-y-2 transition-transform relative overflow-hidden group flex flex-col h-full">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#005FA3]/10 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
                <div className="w-16 h-16 bg-[#005FA3]/10 rounded-2xl flex items-center justify-center mb-6 text-[#005FA3]">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                <h3 className="text-2xl font-bold mb-2">Reading Speed</h3>
                <div className="text-sm font-black text-[#005FA3] tracking-widest uppercase mb-4">50% of Final Grade</div>
                <p className="text-gray-600 leading-relaxed text-justify mb-8 flex-grow">
                  Fluency is about pacing. Words Correct Per Minute (WCPM) takes your total correct words and divides it by the reading time. For this evaluation, reaching the target rate of 150 WCPM grants a perfect speed score.
                </p>
                <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 mt-auto">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 text-center">Mathematical Formula</p>
                  <p className="text-[#005FA3] font-mono font-bold text-sm text-center">
                    ( Correct / Seconds ) × 60
                  </p>
                </div>
              </div>

              {/* Final Score Card */}
              <div className="bg-gradient-to-br from-black to-gray-900 p-10 rounded-[2rem] shadow-xl hover:-translate-y-2 transition-transform text-white relative overflow-hidden group flex flex-col h-full">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mb-6 text-white">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                </div>
                <h3 className="text-2xl font-bold mb-2">Composite Score</h3>
                <div className="text-sm font-black text-gray-400 tracking-widest uppercase mb-4">Official Result</div>
                <p className="text-gray-300 leading-relaxed text-justify mb-8 flex-grow">
                  Your final grade out of 100 points weighs your exact pronunciation accuracy against your conversational pacing. The system merges 50% of your Accuracy Rate with 50% of your WCPM percentage.
                </p>
                <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 mt-auto">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 text-center">Mathematical Formula</p>
                  <p className="text-white font-mono font-bold text-xs text-center leading-relaxed">
                    (Accuracy × 0.5) + <br/>((WCPM / 150) × 50)
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* =========================================
          ALGORITHM POP-OUT MODAL
          ========================================= */}
      {isAlgorithmModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={() => setIsAlgorithmModalOpen(false)}
          ></div>
          
          <div className="relative bg-gray-50 w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-[2rem] shadow-2xl z-10 animate-in fade-in zoom-in duration-300">
            
            {/* Modal Sticky Header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm px-8 lg:px-12 py-8 border-b border-gray-200 flex justify-between items-center z-20">
              <div>
                <h2 className="text-3xl lg:text-4xl font-extrabold text-black">System Algorithms</h2>
                <p className="text-gray-500 mt-2 text-lg">The underlying technology powering the ReadFil evaluation engine.</p>
              </div>
              <button 
                onClick={() => setIsAlgorithmModalOpen(false)}
                className="p-3 bg-gray-100 rounded-full text-gray-500 hover:text-black hover:bg-gray-200 transition-colors shadow-sm"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            {/* Modal Body: The Algorithm Cards */}
            <div className="p-8 lg:p-12 grid grid-cols-1 md:grid-cols-2 gap-10">
              
              {/* Algorithm 1: Modified Levenshtein */}
              <div className="bg-white p-10 rounded-[2rem] shadow-lg border border-gray-100 hover:-translate-y-2 transition-transform relative overflow-hidden group flex flex-col h-full">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#0096FF]/10 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
                <div className="w-16 h-16 bg-[#0096FF]/10 rounded-2xl flex items-center justify-center mb-6 text-[#0096FF]">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                </div>
                <h3 className="text-2xl font-bold mb-2">Modified Levenshtein</h3>
                <div className="text-sm font-black text-[#0096FF] tracking-widest uppercase mb-6">Error Calculation Metric</div>
                
                <div className="flex-grow space-y-5">
                  <div>
                    <h4 className="font-bold text-gray-800 text-sm uppercase tracking-wide">What it is</h4>
                    <p className="text-gray-600 leading-relaxed text-sm mt-1 text-justify">
                      A customized string metric algorithm used to measure the exact degree of difference between two sequences of words.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 text-sm uppercase tracking-wide">What it uses</h4>
                    <p className="text-gray-600 leading-relaxed text-sm mt-1 text-justify">
                      It takes the expected target reading passage and compares it directly against the live text transcribed from the user's speech audio, mapping them word-by-word.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 text-sm uppercase tracking-wide">How it works</h4>
                    <p className="text-gray-600 leading-relaxed text-sm mt-1 text-justify">
                      The algorithm calculates the minimum number of single-word edits pecifically insertions, deletions, and substitutions required to transform the transcribed text into the target text. By tailoring this metric for Tagalog phonetics, the system can precisely pinpoint reading errors and calculate the final accuracy rate.
                    </p>
                  </div>
                </div>
              </div>

              {/* Algorithm 2: Needleman-Wunsch */}
              <div className="bg-gradient-to-br from-black to-gray-900 p-10 rounded-[2rem] shadow-xl border border-gray-800 hover:-translate-y-2 transition-transform text-white relative overflow-hidden group flex flex-col h-full">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mb-6 text-white">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
                </div>
                <h3 className="text-2xl font-bold mb-2">Needleman-Wunsch</h3>
                <div className="text-sm font-black text-gray-400 tracking-widest uppercase mb-6">Global Sequence Alignment</div>
                
                <div className="flex-grow space-y-5">
                  <div>
                    <h4 className="font-bold text-gray-300 text-sm uppercase tracking-wide">What it is</h4>
                    <p className="text-gray-400 leading-relaxed text-sm mt-1 text-justify">
                      A powerful dynamic programming algorithm originally developed for bioinformatics, adapted in this system for optimal text sequence alignment.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-300 text-sm uppercase tracking-wide">What it uses</h4>
                    <p className="text-gray-400 leading-relaxed text-sm mt-1 text-justify">
                      It employs a mathematical scoring matrix that assigns specific point values for exact word matches, and structural penalties for mismatches and gaps.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-300 text-sm uppercase tracking-wide">How it works</h4>
                    <p className="text-gray-400 leading-relaxed text-sm mt-1 text-justify">
                      Rather than just looking at individual words, it evaluates the entire transcribed text against the target passage from start to finish. It finds the absolute best global alignment, which allows the system to accurately track exactly where a student skipped words, added extra words, or completely lost their place while reading.
                    </p>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* Registration Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={handleCloseModal}
          ></div>
          
          <div className="relative bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className={`p-8 pb-6 border-b border-gray-100`}>
              <div className="flex justify-between items-center mb-2">
                <h3 className={`text-3xl font-extrabold ${theme.color}`}>
                  {selectedLevel} Registration
                </h3>
                <button 
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-800 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
              <p className="text-gray-500">Please provide your details to begin the evaluation.</p>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleProceed} className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">First Name</label>
                  <input 
                    type="text" 
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#8ACEFF] focus:ring-2 focus:ring-[#8ACEFF]/20 outline-none transition-all bg-gray-50" 
                    placeholder="Juan" 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Last Name</label>
                  <input 
                    type="text" 
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#8ACEFF] focus:ring-2 focus:ring-[#8ACEFF]/20 outline-none transition-all bg-gray-50" 
                    placeholder="Dela Cruz" 
                    required 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Email Address</label>
                  <input type="email" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#8ACEFF] focus:ring-2 focus:ring-[#8ACEFF]/20 outline-none transition-all bg-gray-50" placeholder="juan@example.com" required />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Confirm Email</label>
                  <input type="email" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#8ACEFF] focus:ring-2 focus:ring-[#8ACEFF]/20 outline-none transition-all bg-gray-50" placeholder="juan@example.com" required />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Phone Number <span className="text-gray-400 font-normal">(Optional)</span></label>
                <input type="tel" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#8ACEFF] focus:ring-2 focus:ring-[#8ACEFF]/20 outline-none transition-all bg-gray-50" placeholder="09XX XXX XXXX" />
              </div>

              <div className="flex items-start pt-2">
                <div className="flex items-center h-5">
                  <input id="terms" type="checkbox" className={`w-5 h-5 border border-gray-300 rounded focus:ring-2 focus:ring-[#8ACEFF]/20 cursor-pointer`} required />
                </div>
                <label htmlFor="terms" className="ml-3 text-sm text-gray-600 cursor-pointer">
                  I agree to the <a href="#" className={`font-bold hover:underline ${selectedLevel === 'Progressive Mode' ? 'text-[#0096FF]' : theme.color}`}>Terms and Conditions</a> and consent to the recording of my voice for academic thesis evaluation purposes.
                </label>
              </div>

              <div className="pt-4 flex gap-4">
                <button 
                  type="button" 
                  onClick={handleCloseModal}
                  className="w-1/3 px-6 py-4 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className={`w-2/3 px-6 py-4 rounded-xl font-bold ${theme.textBtn} ${theme.bg} ${theme.hover} transition-all transform hover:-translate-y-1 shadow-lg`}
                >
                  Proceed to Test
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}