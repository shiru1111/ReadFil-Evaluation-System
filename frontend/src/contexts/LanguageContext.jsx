import React, { createContext, useState, useContext, useEffect } from 'react';
import { en } from '../translations/en';
import { tl } from '../translations/tl';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  // Load from local storage or default to 'en'
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('appLanguage') || 'en';
  });

  useEffect(() => {
    localStorage.setItem('appLanguage', language);
  }, [language]);

  const toggleLanguage = () => {
    setLanguage(prev => (prev === 'en' ? 'tl' : 'en'));
  };

  // Helper function to get nested keys (e.g. t('nav.criteria'))
  const t = (key) => {
    const dict = language === 'tl' ? tl : en;
    const keys = key.split('.');
    let value = dict;
    for (const k of keys) {
      if (value[k] === undefined) {
        console.warn(`Missing translation key: ${key}`);
        return key; // fallback
      }
      value = value[k];
    }
    return value;
  };

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
