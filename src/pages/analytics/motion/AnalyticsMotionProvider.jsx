import { createContext, useCallback, useContext, useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { framePerformanceDecision, motionLevelReducer, normalizeMotionLevel } from "../utils.js";

const STORAGE_KEY = "nexus.analytics.motion";
const AMBIENT_LIMIT = 6;
const AnalyticsMotionContext = createContext(null);

function readStoredMotion(fallback) {
  try {
    return normalizeMotionLevel(window.localStorage.getItem(STORAGE_KEY), fallback);
  } catch {
    return fallback;
  }
}

export function AnalyticsMotionProvider({ children }) {
  const systemReduced = useReducedMotion();
  const initialRef = useRef(null);
  if (initialRef.current === null) initialRef.current = readStoredMotion(systemReduced ? "reduced" : "full");
  const [level, dispatch] = useReducer(motionLevelReducer, initialRef.current);
  const [performanceNotice, setPerformanceNotice] = useState(false);
  const [visible, setVisible] = useState(typeof document === "undefined" ? true : !document.hidden);
  const samplesRef = useRef([]);
  const startRef = useRef(0);
  const lastFrameRef = useRef(0);
  const degradedRef = useRef(false);
  const ambientSlotsRef = useRef(new Set());

  const setLevel = useCallback((next) => {
    const normalized = normalizeMotionLevel(next, level);
    dispatch({ type: "SET", value: normalized });
    degradedRef.current = false;
    setPerformanceNotice(false);
    try { window.localStorage.setItem(STORAGE_KEY, normalized); } catch {}
  }, [level]);

  useEffect(() => {
    const handleVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (level !== "full" || !visible || degradedRef.current) return undefined;
    samplesRef.current = [];
    startRef.current = performance.now();
    lastFrameRef.current = startRef.current;
    let frame = 0;
    const tick = (time) => {
      const delta = time - lastFrameRef.current;
      lastFrameRef.current = time;
      if (delta > 0 && delta < 250) samplesRef.current.push(delta);
      if (time - startRef.current >= 2000) {
        const decision = framePerformanceDecision(samplesRef.current, 24);
        if (decision.reduce) {
          degradedRef.current = true;
          dispatch({ type: "DEGRADE" });
          setPerformanceNotice(true);
        }
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [level, visible]);

  const ambientEnabled = level === "full" && visible;

  useEffect(() => {
    if (!ambientEnabled) ambientSlotsRef.current.clear();
  }, [ambientEnabled]);

  const claimAmbientSlot = useCallback((id) => {
    if (!ambientEnabled) return false;
    if (ambientSlotsRef.current.has(id)) return true;
    if (ambientSlotsRef.current.size >= AMBIENT_LIMIT) return false;
    ambientSlotsRef.current.add(id);
    return true;
  }, [ambientEnabled]);

  const releaseAmbientSlot = useCallback((id) => {
    ambientSlotsRef.current.delete(id);
  }, []);

  const value = useMemo(() => ({
    level,
    setLevel,
    ambientEnabled,
    claimAmbientSlot,
    releaseAmbientSlot,
    ambientLimit: AMBIENT_LIMIT,
    performanceNotice,
    dismissPerformanceNotice: () => setPerformanceNotice(false),
  }), [ambientEnabled, claimAmbientSlot, level, performanceNotice, releaseAmbientSlot, setLevel]);

  return <AnalyticsMotionContext.Provider value={value}>{children}</AnalyticsMotionContext.Provider>;
}

export function useAnalyticsMotion() {
  const value = useContext(AnalyticsMotionContext);
  if (!value) {
    return {
      level: "reduced",
      setLevel: () => {},
      ambientEnabled: false,
      claimAmbientSlot: () => false,
      releaseAmbientSlot: () => {},
      ambientLimit: AMBIENT_LIMIT,
      performanceNotice: false,
      dismissPerformanceNotice: () => {},
    };
  }
  return value;
}

export function useAmbientSlot(ref, requested = true) {
  const id = useId();
  const { ambientEnabled, claimAmbientSlot, releaseAmbientSlot } = useAnalyticsMotion();
  const [intersecting, setIntersecting] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const node = ref?.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setIntersecting(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => setIntersecting(Boolean(entry?.isIntersecting)), { rootMargin: "80px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  useEffect(() => {
    if (!requested || !ambientEnabled || !intersecting) {
      releaseAmbientSlot(id);
      setAllowed(false);
      return undefined;
    }
    const granted = claimAmbientSlot(id);
    setAllowed(granted);
    return () => releaseAmbientSlot(id);
  }, [ambientEnabled, claimAmbientSlot, id, intersecting, releaseAmbientSlot, requested]);

  return allowed;
}
