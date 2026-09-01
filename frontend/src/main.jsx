import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import Beginner from './Beginner.jsx'
import Moderate from './Moderate.jsx'
import Expert from './Expert.jsx'
import Progressive from './Progressive';
import TermsAndConditions from './TermsAndConditions.jsx';
import ScrollToTop from './ScrollToTop.jsx' // <-- 1. Imported here
import Results from './Results.jsx'
import Simulation from './Simulation.jsx'
import AdminMode from './AdminMode.jsx'
import './index.css'
import { LanguageProvider } from './contexts/LanguageContext'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <BrowserRouter>
      <ScrollToTop /> {/* <-- 2. Added here right above Routes */}
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/beginner" element={<Beginner />} />
        <Route path="/moderate" element={<Moderate />} />
        <Route path="/expert" element={<Expert />} />
        <Route path="/progressive" element={<Progressive />} />
        <Route path="/terms" element={<TermsAndConditions />} />
        <Route path="/results" element={<Results />} />
        <Route path="/simulation" element={<Simulation />} />
        <Route path="/admin" element={<AdminMode />} />
      </Routes>
    </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>,
)
