import { motionTokens } from "./tokens";
export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const smooth = (value) => { const t = clamp(value); return t * t * (3 - 2 * t); };
export const damp = (current, target, seconds) => current + (target - current) * (1 - Math.exp(-motionTokens.damping * Math.min(seconds, .05)));
export const chapterAt = (progress) => Math.min(3, Math.floor(clamp(progress) * 4));
export const progressFor = (top, height, viewport) => clamp(-top / Math.max(1, height - viewport));
export function transitionState(progress) {
  const p = clamp(progress), phase = (p * 4) % 1;
  return { chapter: chapterAt(p), presence: p === 1 ? 1 : Math.min(smooth(phase / .1), smooth((1 - phase) / .1)), wash: Math.max(0, 1 - Math.min(phase, 1 - phase) / .065) * (p > .2 && p < .9 ? .32 : 0) };
}
// Shared clock: layout reads precede writes, native scroll is never intercepted.
export function createChoreographer(track, onChapter, render) {
  let frame = 0, last = 0, current = 0, target = 0, dirty = true, visible = true, chapter = -1, initialized = false;
  const read = () => { dirty = true; wake(); };
  const tick = (now) => {
    frame = 0;
    if (document.hidden || !visible) { last = 0; return; }
    if (dirty) { const r = track.getBoundingClientRect(); target = progressFor(r.top, r.height, window.innerHeight); dirty = false; if (!initialized) { current = target; initialized = true; } }
    const dt = last ? (now - last) / 1000 : 1 / 60; last = now;
    current = damp(current, target, dt);
    track.style.setProperty("--story-progress", current.toFixed(4));
    const transition = transitionState(current);
    track.style.setProperty("--chapter-presence", transition.presence.toFixed(4));
    track.style.setProperty("--chapter-opacity", (clamp((current - .13) * 14) * transition.presence).toFixed(4));
    track.style.setProperty("--scene-wash", transition.wash.toFixed(4));
    const next = chapterAt(current);
    if (chapter !== next) { chapter = next; onChapter(next); }
    render(current, now / 1000, dt); frame = requestAnimationFrame(tick);
  };
  function wake() { if (!frame && !document.hidden && visible) frame = requestAnimationFrame(tick); }
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; dirty = true; wake(); }, { rootMargin: "100px" });
  observer.observe(track);
  window.addEventListener("scroll", read, { passive: true }); window.addEventListener("resize", read); document.addEventListener("visibilitychange", read); wake();
  return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("scroll", read); window.removeEventListener("resize", read); document.removeEventListener("visibilitychange", read); };
}
