import React, { useState, useEffect } from 'react';
import myImage from './assets/picture1.png';
import { useNavigate, Link } from 'react-router-dom';
import { useLanguage } from './contexts/LanguageContext';

export default function App() {
  const { t, language, toggleLanguage } = useLanguage();
  const [imageOpacity, setImageOpacity] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCriteriaModalOpen, setIsCriteriaModalOpen] = useState(false);
  const [isAlgorithmModalOpen, setIsAlgorithmModalOpen] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // State variables to hold the user's input
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // NEW STATES FOR EMAIL VALIDATION
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

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
    setEmail('');
    setConfirmEmail('');
    setErrorMessage('');
    document.body.style.overflow = 'unset';
  };

  const handleProceed = (e) => {
    e.preventDefault();
    setErrorMessage(''); // Reset any previous errors

    // VALIDATION 1: Check if email ends with @gmail.com
    if (!email.endsWith('@gmail.com')) {
      setErrorMessage('Email address must end with @gmail.com');
      return; // Stop the function from proceeding
    }

    // VALIDATION 2: Check if emails match
    if (email !== confirmEmail) {
      setErrorMessage('Email addresses do not match.');
      return; // Stop the function from proceeding
    }

    localStorage.setItem('user_firstName', firstName);
    localStorage.setItem('user_lastName', lastName);
    localStorage.setItem('user_email', email);

    const levelToSave = selectedLevel === 'Progressive Mode' || selectedLevel === t('levels.progressive') ? 'Progressive' : selectedLevel;
    localStorage.setItem('evaluated_level', levelToSave);

    document.body.style.overflow = 'unset';

    if (levelToSave === 'Progressive') navigate('/progressive');
    else if (selectedLevel === 'Beginner' || selectedLevel === t('levels.beginner')) navigate('/beginner');
    else if (selectedLevel === 'Moderate' || selectedLevel === t('levels.moderate')) navigate('/moderate');
    else if (selectedLevel === 'Expert' || selectedLevel === t('levels.expert')) navigate('/expert');
  };

  const getLevelStyles = () => {
    switch (selectedLevel) {
      case 'Beginner':
      case t('levels.beginner'):
        return { color: 'text-black', bg: 'bg-black', hover: 'hover:bg-gray-800', textBtn: 'text-white' };
      case 'Moderate':
      case t('levels.moderate'):
        return { color: 'text-[#0096FF]', bg: 'bg-[#0096FF]', hover: 'hover:bg-blue-600', textBtn: 'text-white' };
      case 'Expert':
      case t('levels.expert'):
        return { color: 'text-[#005FA3]', bg: 'bg-[#005FA3]', hover: 'hover:bg-blue-800', textBtn: 'text-white' };
      case 'Progressive Mode':
      case t('levels.progressive'):
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

      <nav className="fixed w-full top-0 bg-white/80 backdrop-blur-md shadow-sm z-50 px-4 sm:px-10 lg:px-20 py-4 sm:py-5 flex justify-between items-center">
        <div className="text-xl sm:text-2xl font-black tracking-tight text-[#0096FF]">
          ReadFil
        </div>
        
        {/* Desktop Menu */}
        <ul className="hidden md:flex space-x-3 sm:space-x-8 font-semibold text-[11px] sm:text-sm uppercase tracking-wide items-center">
          <li>
            <button
              onClick={toggleLanguage}
              className="hover:text-[#0096FF] transition-colors font-black uppercase tracking-wide bg-gray-100 px-3 py-1 rounded-full border border-gray-200"
            >
              {language === 'en' ? 'EN' : 'TL'}
            </button>
          </li>
          <li>
            <button
              onClick={() => setIsCriteriaModalOpen(true)}
              className="hover:text-[#0096FF] transition-colors font-semibold uppercase tracking-wide"
            >
              {t('nav.criteria')}
            </button>
          </li>
          <li>
            <button
              onClick={() => setIsAlgorithmModalOpen(true)}
              className="hover:text-[#0096FF] transition-colors font-semibold uppercase tracking-wide"
            >
              {t('nav.algorithm')}
            </button>
          </li>
          <li>
            <Link to="/simulation" target="_blank" className="hover:text-[#0096FF] transition-colors font-semibold uppercase tracking-wide flex items-center gap-1">
              {t('nav.simulation')}
            </Link>
          </li>
          <li><a href="#footer" className="hover:text-[#0096FF] transition-colors">{t('nav.about_us')}</a></li>
        </ul>

        {/* Mobile Menu Button */}
        <div className="md:hidden flex items-center space-x-4">
          <button
            onClick={toggleLanguage}
            className="hover:text-[#0096FF] transition-colors font-black uppercase tracking-wide bg-gray-100 px-3 py-1 rounded-full border border-gray-200 text-xs"
          >
            {language === 'en' ? 'EN' : 'TL'}
          </button>
          <button 
            className="text-black hover:text-[#0096FF] focus:outline-none transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={isMobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16m-7 6h7"}></path>
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed top-[60px] sm:top-[70px] left-0 w-full bg-white shadow-xl z-40 flex flex-col py-6 px-6 space-y-6 font-bold text-sm uppercase tracking-wide border-b border-gray-100 animate-in slide-in-from-top-2 duration-200">
          <button
            onClick={() => { setIsCriteriaModalOpen(true); setIsMobileMenuOpen(false); }}
            className="text-left text-gray-800 hover:text-[#0096FF] transition-colors"
          >
            {t('nav.criteria')}
          </button>
          <button
            onClick={() => { setIsAlgorithmModalOpen(true); setIsMobileMenuOpen(false); }}
            className="text-left text-gray-800 hover:text-[#0096FF] transition-colors"
          >
            {t('nav.algorithm')}
          </button>
          <Link 
            to="/simulation" 
            target="_blank" 
            className="text-left text-gray-800 hover:text-[#0096FF] transition-colors" 
            onClick={() => setIsMobileMenuOpen(false)}
          >
            {t('nav.simulation')}
          </Link>
          <a 
            href="#footer" 
            className="text-left text-gray-800 hover:text-[#0096FF] transition-colors" 
            onClick={() => setIsMobileMenuOpen(false)}
          >
            {t('nav.about_us')}
          </a>
        </div>
      )}

      <main className="relative flex flex-col lg:flex-row items-start justify-between min-h-screen">
        <div className="lg:w-1/2 px-4 sm:pl-10 lg:pl-20 sm:pr-12 pt-28 lg:pt-48 z-20 relative w-full">
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold mb-6 sm:mb-8 leading-tight text-center lg:text-left">
            {t('hero.title')}
          </h1>
          <p className="text-base sm:text-lg mb-8 sm:mb-10 leading-relaxed opacity-80 text-center lg:text-left">
            {t('hero.description')}
          </p>
          <div className="flex justify-center lg:justify-start">
            <a href="#levels" className="inline-block bg-[#0096FF] hover:bg-[#8ACEFF] text-white hover:text-black font-bold py-4 px-10 rounded-full shadow-lg transform transition-all hover:-translate-y-1 text-lg">
              {t('hero.cta')}
            </a>
          </div>
        </div>

        <div className="lg:absolute lg:top-0 lg:right-0 lg:w-[55%] w-full h-[300px] sm:h-[450px] lg:h-screen sticky top-0 z-10">
          <div className="w-full h-full relative" style={{ opacity: imageOpacity, transition: 'opacity 0.1s ease-out' }}>
            <div className="absolute inset-x-0 top-0 lg:inset-y-0 lg:left-0 bg-gradient-to-b lg:bg-gradient-to-r from-white via-white/70 to-transparent z-20 h-1/2 lg:h-full lg:w-1/2"></div>
            <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-white to-transparent z-20"></div>
            <img
              src={myImage}
              alt="Reading placeholder"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </main>

      <section id="levels" className="relative z-30 px-4 sm:px-10 lg:px-20 py-12 sm:py-24 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-extrabold mb-12 text-center text-black">{t('levels.title')}</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div className="bg-white p-6 sm:p-8 rounded-2xl sm:rounded-[2rem] shadow-lg border border-[#8ACEFF]/30 hover:-translate-y-2 transition-transform flex flex-col items-center text-center">
              <h3 className="text-2xl font-bold text-black mb-3">{t('levels.beginner')}</h3>
              <p className="text-gray-600 mb-8 flex-grow">{t('levels.beginner_desc')}</p>
              <button onClick={() => handleOpenModal('Beginner')} className="w-full bg-black text-white py-3 rounded-full hover:bg-gray-800 transition-colors font-bold">
                {t('levels.start_beginner')}
              </button>
            </div>

            <div className="bg-white p-6 sm:p-8 rounded-2xl sm:rounded-[2rem] shadow-lg border border-[#8ACEFF]/30 hover:-translate-y-2 transition-transform flex flex-col items-center text-center">
              <h3 className="text-2xl font-bold text-[#0096FF] mb-3">{t('levels.moderate')}</h3>
              <p className="text-gray-600 mb-8 flex-grow">{t('levels.moderate_desc')}</p>
              <button onClick={() => handleOpenModal('Moderate')} className="w-full bg-[#0096FF] text-white py-3 rounded-full hover:bg-blue-600 transition-colors font-bold">
                {t('levels.start_moderate')}
              </button>
            </div>

            <div className="bg-white p-6 sm:p-8 rounded-2xl sm:rounded-[2rem] shadow-lg border border-[#005FA3]/30 hover:-translate-y-2 transition-transform flex flex-col items-center text-center">
              <h3 className="text-2xl font-bold text-[#005FA3] mb-3">{t('levels.expert')}</h3>
              <p className="text-gray-600 mb-8 flex-grow">{t('levels.expert_desc')}</p>
              <button onClick={() => handleOpenModal('Expert')} className="w-full bg-[#005FA3] text-white py-3 rounded-full hover:bg-blue-600 transition-colors font-bold">
                {t('levels.start_expert')}
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-r from-black via-[#0096FF] to-[#005FA3] p-[2px] rounded-2xl sm:rounded-[2rem] shadow-xl hover:-translate-y-2 transition-transform">
            <div className="bg-white p-6 sm:p-8 lg:p-10 rounded-2xl sm:rounded-[2rem] flex flex-col md:flex-row items-center justify-between text-center md:text-left h-full w-full">
              <div className="mb-6 md:mb-0 md:mr-8">
                <h3 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-black via-[#0096FF] to-[#005FA3] mb-3">
                  {t('levels.progressive')}
                </h3>
                <p className="text-gray-600 max-w-2xl text-base sm:text-lg">
                  {t('levels.progressive_desc')}
                </p>
              </div>
              <button onClick={() => handleOpenModal('Progressive Mode')} className="w-full md:w-auto px-10 py-4 bg-gradient-to-r from-black via-[#0096FF] to-[#005FA3] text-white rounded-full transition-opacity hover:opacity-90 font-bold text-lg whitespace-nowrap shadow-lg">
                {t('levels.take_full_test')}
              </button>
            </div>
          </div>

        </div>
      </section>

      <section className="relative z-30 py-12 sm:py-24 px-4 sm:px-10 bg-black text-white overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full z-0 opacity-40">
          <div className="absolute -top-32 -left-32 w-[30rem] h-[30rem] bg-[#0096FF] rounded-full mix-blend-screen filter blur-[100px]"></div>
          <div className="absolute bottom-[-10rem] right-[-10rem] w-[30rem] h-[30rem] bg-[#8ACEFF] rounded-full mix-blend-screen filter blur-[100px]"></div>
        </div>

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <h3 className="text-4xl md:text-5xl font-extrabold mb-6">{t('how_it_works.title')}</h3>
          <p className="text-base sm:text-lg text-gray-300 mb-12 sm:mb-16 max-w-2xl mx-auto">
            {t('how_it_works.description')}
          </p>

          <div className="flex flex-col md:flex-row justify-center items-center gap-6 md:gap-12">
            <div className="flex flex-col items-center z-10">
              <div className="w-20 h-20 rounded-full border-4 border-[#8ACEFF] bg-black text-[#8ACEFF] flex items-center justify-center text-3xl font-black mb-4 shadow-[0_0_30px_rgba(138,206,255,0.4)]">1</div>
              <h4 className="font-bold text-xl mb-2">{t('how_it_works.step1')}</h4>
            </div>

            <div className="hidden md:block w-24 h-1 bg-gradient-to-r from-[#8ACEFF] to-[#0096FF] opacity-50"></div>
            <div className="md:hidden w-1 h-12 bg-gradient-to-b from-[#8ACEFF] to-[#0096FF] opacity-50"></div>

            <div className="flex flex-col items-center z-10">
              <div className="w-20 h-20 rounded-full border-4 border-[#0096FF] bg-[#0096FF] text-white flex items-center justify-center text-3xl font-black mb-4 shadow-[0_0_30px_rgba(0,150,255,0.6)] transform scale-110">2</div>
              <h4 className="font-bold text-xl mb-2">{t('how_it_works.step2')}</h4>
            </div>

            <div className="hidden md:block w-24 h-1 bg-gradient-to-r from-[#0096FF] to-white opacity-50"></div>
            <div className="md:hidden w-1 h-12 bg-gradient-to-b from-[#0096FF] to-white opacity-50"></div>

            <div className="flex flex-col items-center z-10">
              <div className="w-20 h-20 rounded-full border-4 border-white bg-white text-black flex items-center justify-center text-3xl font-black mb-4 shadow-[0_0_30px_rgba(255,255,255,0.4)]">3</div>
              <h4 className="font-bold text-xl mb-2">{t('how_it_works.step3')}</h4>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-30 px-4 sm:px-10 lg:px-20 py-12 sm:py-24 bg-white text-black">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="bg-gray-50 p-6 sm:p-10 rounded-2xl sm:rounded-[2rem] shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <h3 className="text-2xl sm:text-3xl font-extrabold mb-4 text-[#0096FF]">{t('features.why_title')}</h3>
            <p className="text-gray-600 leading-relaxed text-base sm:text-lg">
              {t('features.why_desc')}
            </p>
          </div>

          <div className="bg-gray-50 p-6 sm:p-10 rounded-2xl sm:rounded-[2rem] shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <h3 className="text-2xl sm:text-3xl font-extrabold mb-4 text-[#0096FF]">{t('features.purpose_title')}</h3>
            <p className="text-gray-600 leading-relaxed text-base sm:text-lg">
              {t('features.purpose_desc')}
            </p>
          </div>
        </div>
      </section>

      <footer id="footer" className="relative z-30 bg-[#121212] text-gray-300 py-10 sm:py-16 px-4 sm:px-10 lg:px-20 border-t border-[#333]">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 mb-10">
          <div>
            <h4 className="text-2xl font-bold text-white mb-4">{t('footer.about')}</h4>
            <p className="text-sm leading-relaxed text-gray-400">
              {t('footer.about_desc')}
            </p>
          </div>
          <div>
            <h4 className="text-2xl font-bold text-white mb-4">{t('footer.details')}</h4>
            <p className="text-sm leading-relaxed text-gray-400 mb-2">
              {t('footer.details_desc')}
            </p>
            <p className="text-sm leading-relaxed text-gray-400">
              <strong>{t('footer.developed_by')}</strong> CSB3
            </p>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-8 text-center text-sm text-gray-500">
          &copy; {new Date().getFullYear()} {t('footer.rights')}
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

          <div className="relative bg-gray-50 w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-2xl sm:rounded-[2rem] shadow-2xl z-10 animate-in fade-in zoom-in duration-300">

            {/* Modal Sticky Header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm px-4 sm:px-8 lg:px-12 py-6 sm:py-8 border-b border-gray-200 flex justify-between items-center z-20">
              <div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-black">{t('modals.criteria_title')}</h2>
                <p className="text-gray-500 mt-2 text-sm sm:text-lg">{t('modals.criteria_desc')}</p>
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
            <div className="p-4 sm:p-8 lg:p-12 grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-10">
              {/* Accuracy Card */}
              <div className="bg-white p-6 sm:p-10 rounded-2xl sm:rounded-[2rem] shadow-lg border border-gray-100 hover:-translate-y-2 transition-transform relative overflow-hidden group flex flex-col h-full">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#0096FF]/10 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
                <div className="w-16 h-16 bg-[#0096FF]/10 rounded-2xl flex items-center justify-center mb-6 text-[#0096FF]">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <h3 className="text-2xl font-bold mb-2">{t('modals.accuracy')}</h3>
                <div className="text-sm font-black text-[#0096FF] tracking-widest uppercase mb-4">{t('modals.accuracy_weight')}</div>
                <p className="text-gray-600 leading-relaxed text-justify mb-8 flex-grow">
                  {t('modals.accuracy_desc')}
                </p>
                <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 mt-auto">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 text-center">{t('modals.math_formula')}</p>
                  <p className="text-[#0096FF] font-mono font-bold text-sm text-center">
                    ( Correct / Total ) × 100
                  </p>
                </div>
              </div>

              {/* WCPM Card */}
              <div className="bg-white p-6 sm:p-10 rounded-2xl sm:rounded-[2rem] shadow-lg border border-gray-100 hover:-translate-y-2 transition-transform relative overflow-hidden group flex flex-col h-full">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#005FA3]/10 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
                <div className="w-16 h-16 bg-[#005FA3]/10 rounded-2xl flex items-center justify-center mb-6 text-[#005FA3]">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                <h3 className="text-2xl font-bold mb-2">{t('modals.speed')}</h3>
                <div className="text-sm font-black text-[#005FA3] tracking-widest uppercase mb-4">{t('modals.speed_weight')}</div>
                <p className="text-gray-600 leading-relaxed text-justify mb-8 flex-grow">
                  {t('modals.speed_desc')}
                </p>
                <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 mt-auto">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 text-center">{t('modals.math_formula')}</p>
                  <p className="text-[#005FA3] font-mono font-bold text-sm text-center">
                    WCPM = ( Correct / Seconds ) × 60<br/>Speed % = (WCPM / 150) × 100
                  </p>
                </div>
              </div>

              {/* Final Score Card */}
              <div className="bg-gradient-to-br from-black to-gray-900 p-6 sm:p-10 rounded-2xl sm:rounded-[2rem] shadow-xl hover:-translate-y-2 transition-transform text-white relative overflow-hidden group flex flex-col h-full">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mb-6 text-white">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                </div>
                <h3 className="text-2xl font-bold mb-2">{t('modals.composite')}</h3>
                <div className="text-sm font-black text-gray-400 tracking-widest uppercase mb-4">{t('modals.composite_weight')}</div>
                <p className="text-gray-300 leading-relaxed text-justify mb-8 flex-grow">
                  {t('modals.composite_desc')}
                </p>
                <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 mt-auto">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 text-center">{t('modals.math_formula')}</p>
                  <p className="text-white font-mono font-bold text-xs text-center leading-relaxed">
                    (Accuracy % × 0.5) + <br />(Speed % × 0.5)
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

          <div className="relative bg-gray-50 w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl sm:rounded-[2rem] shadow-2xl z-10 animate-in fade-in zoom-in duration-300">

            {/* Modal Sticky Header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm px-4 sm:px-8 lg:px-12 py-6 sm:py-8 border-b border-gray-200 flex justify-between items-center z-20">
              <div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-black">{t('modals.algorithm_title')}</h2>
                <p className="text-gray-500 mt-2 text-sm sm:text-lg">{t('modals.algorithm_desc')}</p>
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
            <div className="p-4 sm:p-8 lg:p-12 grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-10">

              {/* Algorithm 1: Modified Levenshtein */}
              <div className="bg-white p-6 sm:p-10 rounded-2xl sm:rounded-[2rem] shadow-lg border border-gray-100 hover:-translate-y-2 transition-transform relative overflow-hidden group flex flex-col h-full">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#0096FF]/10 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
                <div className="w-16 h-16 bg-[#0096FF]/10 rounded-2xl flex items-center justify-center mb-6 text-[#0096FF]">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                </div>
                <h3 className="text-2xl font-bold mb-2">{t('modals.levenshtein')}</h3>
                <div className="text-sm font-black text-[#0096FF] tracking-widest uppercase mb-6">{t('modals.levenshtein_sub')}</div>

                <div className="flex-grow space-y-5">
                  <div>
                    <h4 className="font-bold text-gray-800 text-sm uppercase tracking-wide">{t('modals.what_it_is')}</h4>
                    <p className="text-gray-600 leading-relaxed text-sm mt-1 text-justify">
                      {t('modals.lev_what_is')}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 text-sm uppercase tracking-wide">{t('modals.what_it_uses')}</h4>
                    <p className="text-gray-600 leading-relaxed text-sm mt-1 text-justify">
                      {t('modals.lev_what_uses')}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 text-sm uppercase tracking-wide">{t('modals.how_it_works')}</h4>
                    <p className="text-gray-600 leading-relaxed text-sm mt-1 text-justify">
                      {t('modals.lev_how')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Algorithm 2: Needleman-Wunsch */}
              <div className="bg-gradient-to-br from-black to-gray-900 p-6 sm:p-10 rounded-2xl sm:rounded-[2rem] shadow-xl border border-gray-800 hover:-translate-y-2 transition-transform text-white relative overflow-hidden group flex flex-col h-full">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mb-6 text-white">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
                </div>
                <h3 className="text-2xl font-bold mb-2">{t('modals.nw')}</h3>
                <div className="text-sm font-black text-gray-400 tracking-widest uppercase mb-6">{t('modals.nw_sub')}</div>

                <div className="flex-grow space-y-5">
                  <div>
                    <h4 className="font-bold text-gray-300 text-sm uppercase tracking-wide">{t('modals.what_it_is')}</h4>
                    <p className="text-gray-400 leading-relaxed text-sm mt-1 text-justify">
                      {t('modals.nw_what_is')}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-300 text-sm uppercase tracking-wide">{t('modals.what_it_uses')}</h4>
                    <p className="text-gray-400 leading-relaxed text-sm mt-1 text-justify">
                      {t('modals.nw_what_uses')}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-300 text-sm uppercase tracking-wide">{t('modals.how_it_works')}</h4>
                    <p className="text-gray-400 leading-relaxed text-sm mt-1 text-justify">
                      {t('modals.nw_how')}
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

          <div className="relative bg-white w-full max-w-2xl rounded-2xl sm:rounded-[2rem] shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className={`p-6 sm:p-8 pb-4 sm:pb-6 border-b border-gray-100`}>
              <div className="flex justify-between items-center mb-2">
                <h3 className={`text-2xl sm:text-3xl font-extrabold ${theme.color}`}>
                  {selectedLevel} {t('modals.reg_title')}
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
              <p className="text-sm sm:text-base text-gray-500">{t('modals.reg_desc')}</p>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleProceed} className="p-6 sm:p-8 space-y-4 sm:space-y-6">

              {/* Show error message if validation fails */}
              {errorMessage && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-bold border border-red-100 text-center">
                  {errorMessage}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">{t('modals.fname')}</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    maxLength={20}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#8ACEFF] focus:ring-2 focus:ring-[#8ACEFF]/20 outline-none transition-all bg-gray-50"
                    placeholder="Juan"
                    required
                  />
                  <p className="text-[10px] text-gray-400 mt-1 text-right">{firstName.length}/20</p>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">{t('modals.lname')}</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    maxLength={15}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#8ACEFF] focus:ring-2 focus:ring-[#8ACEFF]/20 outline-none transition-all bg-gray-50"
                    placeholder="Dela Cruz"
                    required
                  />
                  <p className="text-[10px] text-gray-400 mt-1 text-right">{lastName.length}/15</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">{t('modals.email')}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#8ACEFF] focus:ring-2 focus:ring-[#8ACEFF]/20 outline-none transition-all bg-gray-50"
                    placeholder="juan@gmail.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">{t('modals.confirm_email')}</label>
                  <input
                    type="email"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#8ACEFF] focus:ring-2 focus:ring-[#8ACEFF]/20 outline-none transition-all bg-gray-50"
                    placeholder="juan@gmail.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">{t('modals.phone')} <span className="text-gray-400 font-normal">{t('modals.optional')}</span></label>
                <input type="tel" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#8ACEFF] focus:ring-2 focus:ring-[#8ACEFF]/20 outline-none transition-all bg-gray-50" placeholder="09XX XXX XXXX" />
              </div>

              <div className="flex items-start pt-2">
                <div className="flex items-center h-5">
                  <input id="terms" type="checkbox" className={`w-5 h-5 border border-gray-300 rounded focus:ring-2 focus:ring-[#8ACEFF]/20 cursor-pointer`} required />
                </div>
                <label htmlFor="terms" className="ml-3 text-sm text-gray-600 cursor-pointer">
                  {t('modals.agree')} <Link to="/terms" target="_blank" rel="noopener noreferrer" className={`font-bold hover:underline ${selectedLevel === 'Progressive Mode' ? 'text-[#0096FF]' : theme.color}`}>{t('modals.terms')}</Link> {t('modals.consent')}
                </label>
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="w-1/3 px-6 py-4 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  {t('modals.cancel')}
                </button>
                <button
                  type="submit"
                  className={`w-2/3 px-6 py-4 rounded-xl font-bold ${theme.textBtn} ${theme.bg} ${theme.hover} transition-all transform hover:-translate-y-1 shadow-lg`}
                >
                  {t('modals.proceed')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}