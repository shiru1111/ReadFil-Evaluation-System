import React from 'react';
import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ children, adminOnly = false }) {
  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  const isUser = !!localStorage.getItem('user_firstName');

  if (adminOnly) {
    if (!isAdmin) {
      return <Navigate to="/" replace />;
    }
  } else {
    if (!isUser) {
      return <Navigate to="/" replace />;
    }
  }

  return children;
}
