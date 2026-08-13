import React from 'react';

export default function TermsAndConditions() {
  const handleClose = () => {
    window.close();
  };

  return (
    <div className="min-h-screen bg-white text-gray-800 font-sans selection:bg-[#0096FF]/30">
      
      {/* Header */}
      <div className="w-full bg-white border-b border-gray-200 sticky top-0 z-50 px-6 sm:px-12 py-6 flex justify-between items-center shadow-sm">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-gray-900">Terms and Conditions & Privacy Policy</h1>
          <p className="text-sm text-gray-500 mt-1">Last Updated: {new Date().toLocaleDateString()}</p>
        </div>
        <button 
          onClick={handleClose}
          className="hidden sm:block border-2 border-gray-200 text-gray-600 hover:border-[#0096FF] hover:text-[#0096FF] font-semibold py-2 px-6 rounded-full transition-colors"
        >
          Close Tab
        </button>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 sm:px-12 py-10 space-y-10 text-sm sm:text-base leading-relaxed text-gray-600">
        
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 tracking-tight uppercase text-sm">1. Introduction & Acceptance of Terms</h2>
          <p className="mb-4">
            By accessing, registering for, or using the Speech Recognition System (hereinafter referred to as the "Platform"), you signify your absolute and unconditional acceptance of these Terms and Conditions and our Privacy Policy. If you do not agree with any part of these terms, you must immediately cease all use of the Platform.
          </p>
          <p>
            These terms constitute a legally binding agreement between you ("User", "You") and the administrators of the Platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 tracking-tight uppercase text-sm">2. Data Collection and Processing</h2>
          <p className="mb-4">
            In order to provide the core functionalities of the Platform, we require the collection, processing, and temporary storage of specific personal and biometric information. By proceeding, you explicitly consent to the collection of the following data:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li><strong>Personal Identifiable Information (PII):</strong> Name, Email Address, and Phone Number (Optional).</li>
            <li><strong>Biometric Data:</strong> Direct audio recordings of your voice during your interaction with the Platform.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 tracking-tight uppercase text-sm">3. Purpose of Data Utilization</h2>
          <p>
            All collected Data is strictly utilized for the sole purpose of speech processing, algorithmic evaluation, and statistical analysis. Your biometric data is fed securely through speech recognition models to calculate accuracy metrics and Word Error Rates (WER). Your PII is utilized exclusively for user identification and system auditing. 
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 tracking-tight uppercase text-sm">4. Data Privacy, Security, and Confidentiality</h2>
          <p className="mb-4">
            The Platform rigorously complies with the provisions of the <strong>Data Privacy Act of 2012 (Republic Act No. 10173)</strong>. We implement robust, industry-standard cryptographic and security measures to protect your Data against unauthorized access, alteration, disclosure, or destruction.
          </p>
          <p>
            <strong>Strict Non-Disclosure:</strong> Under no circumstances will your PII or biometric audio data be sold, leased, traded, or distributed to unauthorized third parties, marketing agencies, or commercial entities.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 tracking-tight uppercase text-sm">5. Data Retention and Automated Deletion</h2>
          <p>
            The Platform adheres to a strict data minimization and retention policy. Your data will only be retained on our secure servers for the absolute minimum duration required to fulfill the analytical purposes stated herein. Upon the conclusion of the analytical processing cycle, all associated digital audio files and identifiable records are subject to permanent and irreversible cryptographic erasure.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 tracking-tight uppercase text-sm">6. User Rights and Voluntary Participation</h2>
          <p className="mb-4">
            Your registration and subsequent use of the Platform is entirely voluntary. In accordance with RA 10173, you retain the following rights regarding your personal data:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>The right to be informed of how your data is processed.</li>
            <li>The right to withdraw consent and request the immediate deletion of your data from our servers without penalty.</li>
            <li>The right to object to further processing of your information.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 tracking-tight uppercase text-sm">7. Limitation of Liability</h2>
          <p>
            While we employ stringent security measures to protect your data, the administrators of the Platform shall not be held liable for any indirect, incidental, special, consequential, or punitive damages resulting from unauthorized access to or alteration of your transmissions or data beyond our reasonable control.
          </p>
        </section>

        {/* Action */}
        <div className="pt-10 pb-20 border-t border-gray-200 mt-10">
          <p className="text-gray-900 font-semibold mb-6">
            By checking the agreement box on the registration page, you acknowledge that you have read this document in its entirety, comprehend its legal implications, and unequivocally grant your consent.
          </p>
          <button 
            onClick={handleClose}
            className="w-full sm:w-auto bg-[#0096FF] hover:bg-blue-600 text-white font-bold py-4 px-12 rounded-lg shadow-md transition-all text-center"
          >
            I Understand, Close Tab
          </button>
        </div>

      </div>
    </div>
  );
}
