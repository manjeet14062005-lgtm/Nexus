import { useEffect, useState } from "react";
import { chooseTier } from "../gate/tiers";
export function useCinematicLevel() {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [level, setLevel] = useState(() => {
    try { const saved = localStorage.getItem("nexus-cinematic-level"); if (["full", "lite", "off"].includes(saved)) return saved; } catch { /* Storage is optional. */ }
    return chooseTier({ width: window.innerWidth, cores: navigator.hardwareConcurrency, memory: navigator.deviceMemory, saveData: navigator.connection?.saveData || window.matchMedia("(prefers-reduced-data: reduce)").matches });
  });
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)"); const change = () => setReduced(query.matches);
    query.addEventListener("change", change); return () => query.removeEventListener("change", change);
  }, []);
  const select = (value) => { setLevel(value); try { localStorage.setItem("nexus-cinematic-level", value); } catch { /* No storage required. */ } };
  return { level: reduced ? "off" : level, reduced, select, pause: () => setLevel("off"), degrade: () => setLevel("lite") };
}
