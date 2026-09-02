import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import Beginner from './Beginner.jsx'
import Moderate from './Moderate.jsx'
import Expert from './Expert.jsx'
import Progressive from './Progressive';
import TermsAndConditions from './TermsAndConditions.jsx';
import ScrollToTop from './ScrollToTop.jsx'
import Results from './Results.jsx'
import Simulation from './Simulation.jsx'
import AdminMode from './AdminMode.jsx'
import ProtectedRoute from './ProtectedRoute.jsx'
import './index.css'
import { LanguageProvider } from './contexts/LanguageContext'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/terms" element={<TermsAndConditions />} />
        
        {/* Protected User Routes */}
        <Route path="/beginner" element={<ProtectedRoute><Beginner /></ProtectedRoute>} />
        <Route path="/moderate" element={<ProtectedRoute><Moderate /></ProtectedRoute>} />
        <Route path="/expert" element={<ProtectedRoute><Expert /></ProtectedRoute>} />
        <Route path="/progressive" element={<ProtectedRoute><Progressive /></ProtectedRoute>} />
        <Route path="/results" element={<ProtectedRoute><Results /></ProtectedRoute>} />
        <Route path="/simulation" element={<Simulation />} />

        {/* Protected Admin Route */}
        <Route path="/admin" element={<ProtectedRoute adminOnly={true}><AdminMode /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>,
)
