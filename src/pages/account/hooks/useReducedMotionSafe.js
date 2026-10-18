// useReducedMotionSafe.js — Returns true if user prefers reduced motion.

import { useState, useEffect } from "react";

export function useReducedMotionSafe() {
  const [reduced, setReduced] = useState(() => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const handler = (e) => setReduced(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } catch {
      return undefined;
    }
  }, []);

  return reduced;
}
