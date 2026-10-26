import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Baked at build time from GA_MEASUREMENT_ID; defaults to arc's GA4 property.
const GA_MEASUREMENT_ID = import.meta.env.GA_MEASUREMENT_ID || 'G-SEDXMKVG9K';

// Extend Window interface for gtag
declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

export function GoogleAnalytics() {
  const { pathname } = useLocation();
  const live = pathname === '/live' || pathname.startsWith('/live/');
  useEffect(() => {
    // Live links carry a read capability in their fragment. Keep live sessions
    // out of analytics, including after navigating from an ordinary site page.
    const flags = window as unknown as Record<string, unknown>;
    flags[`ga-disable-${GA_MEASUREMENT_ID}`] = live;
    if (live) return;
    // Check if gtag already exists
    if (typeof window.gtag !== 'undefined') {
      return;
    }

    // Load gtag script
    const script = document.createElement('script');
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    script.async = true;
    document.head.appendChild(script);

    // Initialize gtag
    script.onload = () => {
      window.dataLayer = window.dataLayer || [];
      function gtag(...args: any[]) {
        window.dataLayer.push(args);
      }
      window.gtag = gtag;
      gtag('js', new Date());
      gtag('config', GA_MEASUREMENT_ID, {
        page_location: `${window.location.origin}${window.location.pathname}`,
      });
    };

    return () => {
      // Cleanup if needed
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [live]);

  return null;
}
