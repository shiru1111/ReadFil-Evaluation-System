import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from './contexts/LanguageContext';

const NotFound = () => {
  const { language } = useLanguage();
  
  const content = {
    en: {
      title: '404',
      subtitle: 'Page Not Found',
      description: 'Oops! The page you are looking for does not exist or has been moved.',
      button: 'Go Back Home'
    },
    tl: {
      title: '404',
      subtitle: 'Hindi Nahanap ang Pahina',
      description: 'Oops! Ang pahinang hinahanap mo ay hindi umiiral o nailipat na.',
      button: 'Bumalik sa Home'
    },
    ceb: {
      title: '404',
      subtitle: 'Wala Nakit-an ang Pahina',
      description: 'Oops! Ang pahina nga imong gipangita wala mag-exist o nabalhin na.',
      button: 'Balik sa Home'
    }
  };

  const t = content[language] || content.en;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center px-6 py-12 lg:px-8">
      <div className="text-center">
        <h1 className="text-9xl font-extrabold text-blue-600 tracking-widest">{t.title}</h1>
        <div className="bg-blue-600 px-2 text-sm rounded rotate-12 absolute text-white shadow-lg">
          {t.subtitle}
        </div>
        <main className="mt-16 max-w-sm mx-auto sm:max-w-md">
          <p className="text-xl text-gray-600 font-medium mb-8">
            {t.description}
          </p>
          <Link
            to="/"
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 shadow-md hover:shadow-lg"
          >
            {t.button}
          </Link>
        </main>
      </div>
    </div>
  );
};

export default NotFound;
