'use client';

import { useEffect } from 'react';

function isIOSSafari() {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent;
  const isIOSDevice = /iP(hone|ad|od)/.test(userAgent)
    || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  const isSafariEngine = /WebKit/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);

  return isIOSDevice && isSafariEngine;
}

export default function SafariViewportFix() {
  useEffect(() => {
    if (!isIOSSafari() || typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const root = document.documentElement;
    root.classList.add('ios-safari-vv-fix');

    let rafId = 0;

    const syncViewportOffset = () => {
      const viewportOffset = Math.max(0, window.visualViewport?.offsetTop ?? 0);
      root.style.setProperty('--safari-vv-offset-top', `${viewportOffset}px`);
    };

    const scheduleSync = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(syncViewportOffset);
    };

    scheduleSync();

    window.visualViewport.addEventListener('resize', scheduleSync);
    window.visualViewport.addEventListener('scroll', scheduleSync);
    window.addEventListener('orientationchange', scheduleSync);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.visualViewport?.removeEventListener('resize', scheduleSync);
      window.visualViewport?.removeEventListener('scroll', scheduleSync);
      window.removeEventListener('orientationchange', scheduleSync);
      root.style.setProperty('--safari-vv-offset-top', '0px');
      root.classList.remove('ios-safari-vv-fix');
    };
  }, []);

  return null;
}
