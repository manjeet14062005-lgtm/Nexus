import { useEffect, useLayoutEffect, useState } from "react";

// The HTML loader is visible even before the application bundle has downloaded.
export function useLandingReveal(visualReady) {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    document.documentElement.classList.add("nexus-landing-booting");
    return () => document.documentElement.classList.remove("nexus-landing-booting");
  }, []);
  useEffect(() => {
    if (!visualReady) return undefined;
    let cancelled = false, firstFrame, secondFrame;
    let fontTimeout;
    const fonts = document.fonts ? Promise.all([
      document.fonts.load('500 16px Inter'),
      document.fonts.load('600 12px "JetBrains Mono"'),
      document.fonts.ready,
    ]).catch(() => {}) : Promise.resolve();
    const fontBudget = new Promise(resolve => { fontTimeout = setTimeout(resolve, 4000); });
    const images = Array.from(document.querySelectorAll('.tg-header img')).map(img => img.decode ? img.decode().catch(() => {}) : Promise.resolve());
    Promise.race([Promise.all([fonts, ...images]), fontBudget]).then(() => {
      clearTimeout(fontTimeout);
      if (cancelled) return;
      // Allow the completed canvas and final text layout to reach the compositor.
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          if (cancelled) return;
          setReady(true);
          document.documentElement.classList.remove("nexus-landing-booting");
        });
      });
    });
    return () => { cancelled = true; clearTimeout(fontTimeout); cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, [visualReady]);
  return ready;
}
