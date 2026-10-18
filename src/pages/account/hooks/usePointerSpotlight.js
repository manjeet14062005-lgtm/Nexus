// usePointerSpotlight.js — rAF-throttled pointer spotlight effect.
// Returns ref to attach to the container element.
// Respects prefers-reduced-motion.

import { useEffect, useRef } from "react";

export function usePointerSpotlight(enabled = true) {
  const ref = useRef(null);
  const rafRef = useRef(null);
  const posRef = useRef({ x: -999, y: -999 });

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    // Check reduced motion
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;

    const onMove = (e) => {
      posRef.current = { x: e.clientX, y: e.clientY };
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const rect = el.getBoundingClientRect();
          const x = posRef.current.x - rect.left;
          const y = posRef.current.y - rect.top;
          el.style.setProperty("--spotlight-x", `${x}px`);
          el.style.setProperty("--spotlight-y", `${y}px`);
        });
      }
    };

    el.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      el.removeEventListener("mousemove", onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled]);

  return ref;
}
