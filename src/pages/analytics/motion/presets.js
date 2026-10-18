export const MOTION_PRESETS = Object.freeze({
  snappy: { type: "spring", stiffness: 520, damping: 38, mass: 0.72 },
  smooth: { type: "spring", stiffness: 260, damping: 30, mass: 0.88 },
  gentle: { type: "spring", stiffness: 140, damping: 24, mass: 1 },
  bouncyLite: { type: "spring", stiffness: 420, damping: 22, mass: 0.72 },
  easeOut: [0.22, 1, 0.36, 1],
  easeInOut: [0.65, 0, 0.35, 1],
});

export function motionTransition(level, preset = "smooth") {
  if (level === "off") return { duration: 0 };
  if (level === "reduced") return { duration: 0.14, ease: MOTION_PRESETS.easeOut };
  return MOTION_PRESETS[preset] || MOTION_PRESETS.smooth;
}

export function entranceProps(level, delay = 0) {
  if (level === "off") return { initial: false, animate: { opacity: 1 }, transition: { duration: 0 } };
  if (level === "reduced") return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.16, delay, ease: MOTION_PRESETS.easeOut },
  };
  return {
    initial: { opacity: 0, y: 10, filter: "blur(4px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 0.42, delay, ease: MOTION_PRESETS.easeOut },
  };
}
