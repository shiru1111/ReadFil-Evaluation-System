import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import Beginner from './Beginner.jsx'
import Moderate from './Moderate.jsx'
import Expert from './Expert.jsx'
import ScrollToTop from './ScrollToTop.jsx' // <-- 1. Imported here
import Results from './Results.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ScrollToTop /> {/* <-- 2. Added here right above Routes */}
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/beginner" element={<Beginner />} />
        <Route path="/moderate" element={<Moderate />} />
        <Route path="/expert" element={<Expert />} />
        <Route path="/results" element={<Results />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)