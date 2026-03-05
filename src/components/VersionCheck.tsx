'use client';

import { useEffect, useRef } from 'react';

const CHECK_INTERVAL = 60_000; // Check every 60 seconds
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';

export function VersionCheck() {
  const currentBuildId = useRef(BUILD_ID);

  useEffect(() => {
    // Don't run in development
    if (process.env.NODE_ENV !== 'production') return;

    const checkVersion = async () => {
      try {
        // Fetch the health endpoint with cache-busting
        const res = await fetch(`${window.location.origin}/api/health`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });

        const serverBuildId = res.headers.get('X-Build-Id');

        if (serverBuildId && serverBuildId !== currentBuildId.current && serverBuildId !== 'dev') {
          console.log(`[VersionCheck] New version detected: ${serverBuildId} (was ${currentBuildId.current})`);
          // Hard reload — bypasses all caches
          window.location.reload();
        }
      } catch {
        // Silently ignore — network errors shouldn't break the app
      }
    };

    const interval = setInterval(checkVersion, CHECK_INTERVAL);

    // Also check on visibility change (user returns to tab)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return null; // Renders nothing — purely side-effect
}
