import { useCallback, useState } from "react";
import { ANALYTICS_ACCENTS } from "../tokens.js";

const STORAGE_KEY = "nexus.analytics.accent";

function readAccent() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return ANALYTICS_ACCENTS[value] ? value : "violet";
  } catch {
    return "violet";
  }
}

export function useAnalyticsAppearance() {
  const [accent, setAccentState] = useState(readAccent);

  const setAccent = useCallback((next) => {
    if (!ANALYTICS_ACCENTS[next]) return;
    const apply = () => setAccentState(next);
    if (typeof document !== "undefined" && typeof document.startViewTransition === "function") {
      document.startViewTransition(apply);
    } else {
      apply();
    }
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch {}
  }, []);

  return { accent, setAccent };
}
