import { clamp, smooth } from "../motion/choreographer";

export const WORLD_STOPS = [0, .34, .63, .91];
export function worldWeights(progress) {
  const p = clamp(progress);
  if (p >= WORLD_STOPS[3]) return [0, 0, 0, 1];
  let stage = 0;
  while (stage < 2 && p > WORLD_STOPS[stage + 1]) stage++;
  const blend = smooth((p - WORLD_STOPS[stage]) / (WORLD_STOPS[stage + 1] - WORLD_STOPS[stage]));
  const result = [0, 0, 0, 0];
  result[stage] = 1 - blend; result[stage + 1] = blend;
  return result;
}

// A common topology lets every vertex travel continuously through all four worlds.
export function signalPoint(stage, t, lane) {
  const phase = lane * Math.PI * 2 / 5;
  if (stage === 0) {
    const a = t + phase * .13, radius = 1.5 + .52 * Math.cos(3 * a + phase);
    return [radius * Math.cos(2 * a), radius * Math.sin(2 * a), .92 * Math.sin(3 * a + phase)];
  }
  if (stage === 1) return [(t / (Math.PI * 2) - .5) * 7.6, Math.sin(t * 1.6 + phase) * .65 + (lane - 2) * .28, Math.cos(t + phase) * 1.3];
  if (stage === 2) {
    const a = t + phase, tilt = lane * .58 + .28;
    return [Math.cos(a) * 2.35, Math.sin(a) * Math.cos(tilt) * 2.35, Math.sin(a) * Math.sin(tilt) * 2.35];
  }
  const radius = 1.8 + .2 * Math.sin(t * 3 + phase);
  return [Math.cos(t + phase) * radius, (lane - 2) * .62 + Math.sin(t * 2 + phase) * .17, Math.sin(t + phase) * radius];
}
