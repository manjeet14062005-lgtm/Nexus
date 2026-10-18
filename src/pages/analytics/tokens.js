export const ANALYTICS_ACCENTS = Object.freeze({
  violet: {
    label: "Violet",
    primary: "#7C5CFF",
    primaryOklch: "oklch(0.62 0.24 292)",
    secondary: "#5B6CFF",
    aurora: "#22D3EE",
    foregroundLight: "#6546E8",
    foregroundDark: "#B7A9FF",
  },
  emerald: {
    label: "Emerald",
    primary: "#0EA97C",
    primaryOklch: "oklch(0.64 0.16 164)",
    secondary: "#18B98A",
    aurora: "#57D8B5",
    foregroundLight: "#087454",
    foregroundDark: "#75E8C1",
  },
  sapphire: {
    label: "Sapphire",
    primary: "#316BDF",
    primaryOklch: "oklch(0.57 0.19 258)",
    secondary: "#4D7CF4",
    aurora: "#38C7F2",
    foregroundLight: "#2457B8",
    foregroundDark: "#8EB7FF",
  },
  rose: {
    label: "Rose",
    primary: "#D3486B",
    primaryOklch: "oklch(0.60 0.20 12)",
    secondary: "#E35A82",
    aurora: "#F29BB0",
    foregroundLight: "#A92A49",
    foregroundDark: "#FF9CB1",
  },
  gold: {
    label: "Gold",
    primary: "#A77A24",
    primaryOklch: "oklch(0.60 0.11 82)",
    secondary: "#C5963D",
    aurora: "#E8C987",
    foregroundLight: "#785817",
    foregroundDark: "#E8C987",
  },
});

export const ANALYTICS_COLORS = Object.freeze({
  ink: "#0B1020",
  inkSoft: "#161C2E",
  pageLight: "#F4F6FC",
  surfaceLight: "#FFFFFF",
  raisedLight: "#F8F9FE",
  pageDark: "#070A14",
  surfaceDark: "#0B1020",
  raisedDark: "#11172E",
  overlayDark: "#171F3D",
  violet: "#7C5CFF",
  indigo: "#5B6CFF",
  cyan: "#22D3EE",
  emerald: "#10D9A0",
  amber: "#FFB547",
  rose: "#FF5C7A",
  sky: "#4CC2FF",
  champagne: "#E8C987",
  champagneDeep: "#B98B3E",
});

export const ANALYTICS_MOTION = Object.freeze({
  easeOut: [0.22, 1, 0.36, 1],
  easeInOut: [0.65, 0, 0.35, 1],
  snappy: { type: "spring", stiffness: 520, damping: 38, mass: 0.72 },
  smooth: { type: "spring", stiffness: 260, damping: 30, mass: 0.88 },
  gentle: { type: "spring", stiffness: 140, damping: 24, mass: 1 },
  bouncyLite: { type: "spring", stiffness: 420, damping: 22, mass: 0.72 },
});

export const SERIES_STYLES = Object.freeze({
  requests: { label: "Requests", color: "var(--an-primary)", dash: "0", marker: "circle", fill: true },
  verified: { label: "Verified", color: "var(--an-success)", dash: "0", marker: "diamond" },
  failed: { label: "Failed", color: "var(--an-danger)", dash: "6 4", marker: "square" },
  expired: { label: "Expired", color: "var(--an-warning)", dash: "2 4", marker: "triangle" },
});

export const ANALYTICS_CONTRAST_PAIRS = Object.freeze([
  { name: "light body", foreground: "#0B1020", background: "#FFFFFF", minimum: 4.5 },
  { name: "light secondary", foreground: "#4B5570", background: "#FFFFFF", minimum: 4.5 },
  { name: "light tertiary", foreground: "#69758F", background: "#FFFFFF", minimum: 4.5 },
  { name: "dark body", foreground: "#F7F8FD", background: "#0B1020", minimum: 4.5 },
  { name: "dark secondary", foreground: "#C4CAE0", background: "#0B1020", minimum: 4.5 },
  { name: "dark tertiary", foreground: "#9099B5", background: "#0B1020", minimum: 4.5 },
  { name: "light success", foreground: "#087454", background: "#ECFBF6", minimum: 4.5 },
  { name: "light warning", foreground: "#7A4800", background: "#FFF6E6", minimum: 4.5 },
  { name: "light danger", foreground: "#A92A49", background: "#FFF0F4", minimum: 4.5 },
  { name: "light gold text", foreground: "#9A6D19", background: "#FFFFFF", minimum: 4.5 },
  { name: "dark success", foreground: "#75E8C1", background: "#102A25", minimum: 4.5 },
  { name: "dark warning", foreground: "#FFD18A", background: "#2A2114", minimum: 4.5 },
  { name: "dark danger", foreground: "#FF9CB1", background: "#2A151C", minimum: 4.5 },
  ...Object.entries(ANALYTICS_ACCENTS).flatMap(([name, accent]) => [
    { name: `${name} light accent text`, foreground: accent.foregroundLight, background: "#FFFFFF", minimum: 4.5 },
    { name: `${name} dark accent text`, foreground: accent.foregroundDark, background: "#0B1020", minimum: 4.5 },
    { name: `${name} primary action`, foreground: "#FFFFFF", background: accent.foregroundLight, minimum: 4.5 },
  ]),
]);

const GRAIN_LIGHT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.92' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.035'/%3E%3C/svg%3E")`;

export function analyticsCssVars(darkMode = false, accentName = "violet") {
  const accent = ANALYTICS_ACCENTS[accentName] || ANALYTICS_ACCENTS.violet;
  const common = {
    "--an-primary": accent.primaryOklch,
    "--an-primary-hex": accent.primary,
    "--an-primary-fg": darkMode ? accent.foregroundDark : accent.foregroundLight,
    "--an-primary-action": accent.foregroundLight,
    "--an-primary-2": accent.secondary,
    "--an-aurora": accent.aurora,
    "--an-success": darkMode ? "#75E8C1" : "#087454",
    "--an-warning": darkMode ? "#FFD18A" : "#7A4800",
    "--an-danger": darkMode ? "#FF9CB1" : "#A92A49",
    "--an-info": darkMode ? "#8DDCFF" : "#176A95",
    "--an-gold": darkMode ? ANALYTICS_COLORS.champagne : ANALYTICS_COLORS.champagneDeep,
    "--an-gold-fg": darkMode ? ANALYTICS_COLORS.champagne : "#9A6D19",
    "--an-focus": `color-mix(in oklch, ${accent.primaryOklch} ${darkMode ? 42 : 30}%, transparent)`,
    "--an-brand-gradient": `linear-gradient(135deg, ${accent.primary}, ${accent.secondary} 52%, ${accent.aurora})`,
    "--an-grain": GRAIN_LIGHT,
  };

  if (darkMode) {
    return {
      ...common,
      "--an-page": ANALYTICS_COLORS.pageDark,
      "--an-surface": ANALYTICS_COLORS.surfaceDark,
      "--an-surface-raised": ANALYTICS_COLORS.raisedDark,
      "--an-surface-overlay": ANALYTICS_COLORS.overlayDark,
      "--an-surface-soft": "#0D1327",
      "--an-text": "#F7F8FD",
      "--an-text-2": "#C4CAE0",
      "--an-text-3": "#9099B5",
      "--an-border": "rgba(255,255,255,.08)",
      "--an-border-strong": "rgba(255,255,255,.15)",
      "--an-grid": "rgba(255,255,255,.06)",
      "--an-shadow-1": "0 10px 28px rgba(0,0,0,.16)",
      "--an-shadow-2": `0 22px 62px color-mix(in oklch, ${accent.primaryOklch} 16%, rgba(0,0,0,.58))`,
      "--an-shadow-3": "0 34px 96px rgba(0,0,0,.42)",
      "--an-inner-highlight": "inset 0 1px 0 rgba(255,255,255,.055)",
      "--an-semantic-success-bg": "#102A25",
      "--an-semantic-warning-bg": "#2A2114",
      "--an-semantic-danger-bg": "#2A151C",
    };
  }

  return {
    ...common,
    "--an-page": ANALYTICS_COLORS.pageLight,
    "--an-surface": ANALYTICS_COLORS.surfaceLight,
    "--an-surface-raised": ANALYTICS_COLORS.raisedLight,
    "--an-surface-overlay": "#FFFFFF",
    "--an-surface-soft": "#F8F9FE",
    "--an-text": ANALYTICS_COLORS.ink,
    "--an-text-2": "#4B5570",
    "--an-text-3": "#69758F",
    "--an-border": "rgba(11,16,32,.08)",
    "--an-border-strong": "rgba(11,16,32,.14)",
    "--an-grid": "rgba(11,16,32,.06)",
    "--an-shadow-1": "0 8px 24px rgba(46,58,96,.055)",
    "--an-shadow-2": `0 20px 56px color-mix(in oklch, ${accent.primaryOklch} 10%, rgba(31,41,70,.09))`,
    "--an-shadow-3": "0 34px 90px rgba(31,41,70,.12)",
    "--an-inner-highlight": "inset 0 1px 0 rgba(255,255,255,.9)",
    "--an-semantic-success-bg": "#ECFBF6",
    "--an-semantic-warning-bg": "#FFF6E6",
    "--an-semantic-danger-bg": "#FFF0F4",
  };
}
