import React from 'react';
import { useLanguage } from './contexts/LanguageContext';

export default function TermsAndConditions() {
  const { t } = useLanguage();
  const handleClose = () => {
    window.close();
  };

  return (
    <div className="min-h-screen bg-white text-gray-800 font-sans selection:bg-[#0096FF]/30">
      
      {/* Header */}
      <div className="w-full bg-white border-b border-gray-200 sticky top-0 z-50 px-6 sm:px-12 py-6 flex justify-between items-center shadow-sm">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-gray-900">{t("terms.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("terms.updated")} {new Date().toLocaleDateString()}</p>
        </div>
        <button 
          onClick={handleClose}
          className="hidden sm:block border-2 border-gray-200 text-gray-600 hover:border-[#0096FF] hover:text-[#0096FF] font-semibold py-2 px-6 rounded-full transition-colors"
        >
          {t("terms.close")}
        </button>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 sm:px-12 py-10 space-y-10 text-sm sm:text-base leading-relaxed text-gray-600">
        
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 tracking-tight uppercase text-sm">{t("terms.s1_title")}</h2>
          <p className="mb-4">{t("terms.s1_p1")}</p>
          <p>{t("terms.s1_p2")}</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 tracking-tight uppercase text-sm">{t("terms.s2_title")}</h2>
          <p className="mb-4">{t("terms.s2_p1")}</p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>{t("terms.s2_l1")}</li>
            <li>{t("terms.s2_l2")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 tracking-tight uppercase text-sm">{t("terms.s3_title")}</h2>
          <p>{t("terms.s3_p1")}</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 tracking-tight uppercase text-sm">{t("terms.s4_title")}</h2>
          <p className="mb-4">{t("terms.s4_p1")}</p>
          <p>{t("terms.s4_p2")}</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 tracking-tight uppercase text-sm">{t("terms.s5_title")}</h2>
          <p>{t("terms.s5_p1")}</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 tracking-tight uppercase text-sm">{t("terms.s6_title")}</h2>
          <p className="mb-4">{t("terms.s6_p1")}</p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>{t("terms.s6_l1")}</li>
            <li>{t("terms.s6_l2")}</li>
            <li>{t("terms.s6_l3")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 tracking-tight uppercase text-sm">{t("terms.s7_title")}</h2>
          <p>{t("terms.s7_p1")}</p>
        </section>

        {/* Action */}
        <div className="pt-10 pb-20 border-t border-gray-200 mt-10">
          <p className="text-gray-900 font-semibold mb-6">
            {t("terms.agree_text")}
          </p>
          <button 
            onClick={handleClose}
            className="w-full sm:w-auto bg-[#0096FF] hover:bg-blue-600 text-white font-bold py-4 px-12 rounded-lg shadow-md transition-all text-center"
          >
            {t("terms.understand")}
          </button>
        </div>

      </div>
    </div>
  );
}
