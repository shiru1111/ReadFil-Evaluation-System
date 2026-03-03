import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // 1. Scroll instantly to the top
    window.scrollTo(0, 0);
    
    // 2. Force the browser to re-enable scrolling just in case a modal locked it
    document.body.style.overflow = 'auto'; 
  }, [pathname]);

  return null;
}