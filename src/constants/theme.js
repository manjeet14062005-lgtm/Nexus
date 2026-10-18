import { createTheme } from "@mui/material/styles";

// ═══════════════════════════════════════════════════════════════════════
// DESIGN TOKENS — Electric Indigo system (Linear/Vercel/Stripe inspired)
// ═══════════════════════════════════════════════════════════════════════

// Hybrid Premium color engine: legacy hex fallbacks + modern OKLCH semantic tokens.
// Components can consume the semantic CSS variables for perceptually consistent
// surfaces, accents, focus rings and soft states.
export const ACCENT = {
  primary: "#4F55CF",
  secondary: "#6945BA",
  tertiary: "#087E8B",
  success: "#087F5B",
  warning: "#A45A07",
  danger: "#C63650",
};

export const MODERN_COLOR = {
  primary: "oklch(62.7% 0.226 264.4)",
  secondary: "oklch(58.5% 0.245 292.7)",
  tertiary: "oklch(70.5% 0.165 194.8)",
  success: "oklch(70.4% 0.170 162.5)",
  warning: "oklch(76.9% 0.188 70.1)",
  danger: "oklch(63.7% 0.237 25.3)",
  darkBase: "oklch(14.5% 0.022 264)",
  darkSurface: "oklch(18% 0.021 258)",
  darkOverlay: "oklch(22.5% 0.024 262)",
  lightBase: "oklch(98.2% 0.006 264)",
  lightSurface: "oklch(100% 0 0)",
  lightOverlay: "oklch(96.1% 0.012 264)",
};

export const DARK = {
  bgBase: "#0D1117",
  bgSurface: "#131920",
  bgOverlay: "#161B27",
  bgSubtle: "#1C2333",
  textPrimary: "#F1F5F9",
  textSecondary: "#B8C4D6",
  textMuted: "#7C8AA0",
  border: "rgba(180,197,215,0.12)",
};

export const LIGHT = {
  bgBase: "#F5F7FA",
  bgSurface: "#FFFFFF",
  bgOverlay: "#F1F5F9",
  bgSubtle: "#E2E8F0",
  textPrimary: "#0F172A",
  textSecondary: "#334155",
  textMuted: "#64748B",
  border: "#DCE3EB",
};

export const getColors = (darkMode) => (darkMode ? DARK : LIGHT);

// Background mesh + dot-grid treatment, shared across dark/light shells.
// Kept deliberately faint and fixed-to-viewport so it reads as a clean flat
// surface with just a hint of color in the corners — not a visible blob.
export const getMeshBackground = (darkMode) => ({
  backgroundColor: darkMode ? DARK.bgBase : LIGHT.bgBase,
  backgroundImage: darkMode
    ? `radial-gradient(ellipse 82% 58% at 12% -8%, rgba(99,102,241,0.10) 0%, transparent 62%),
       radial-gradient(ellipse 64% 46% at 88% 104%, rgba(139,92,246,0.08) 0%, transparent 64%),
       radial-gradient(circle at 50% 22%, rgba(6,182,212,0.025), transparent 42%)`
    : `radial-gradient(ellipse 82% 58% at 12% -8%, rgba(99,102,241,0.055) 0%, transparent 62%),
       radial-gradient(ellipse 64% 46% at 88% 104%, rgba(139,92,246,0.045) 0%, transparent 64%),
       radial-gradient(circle at 50% 22%, rgba(6,182,212,0.018), transparent 42%)`,
  backgroundRepeat: "no-repeat",
  backgroundAttachment: "fixed",
  backgroundSize: "120% 120vh",
});
export const FONT_STACK = "'Inter', system-ui, -apple-system, sans-serif";
export const MONO_STACK = "'JetBrains Mono', 'SFMono-Regular', Menlo, monospace";

// Legacy palette kept so existing components (which import NEON/GLOW) render
// in the new accent system without a full call-site rewrite.
export const NEON = {
  blue: ACCENT.primary,
  cyan: ACCENT.tertiary,
  green: ACCENT.success,
  pink: ACCENT.danger,
  orange: ACCENT.warning,
  purple: ACCENT.secondary,
  teal: ACCENT.tertiary,
  yellow: ACCENT.warning,
  gold: ACCENT.warning,
  red: ACCENT.danger,
};

// Subtle glow — reserved for focused/active states only, per design spec
export const GLOW = (color = ACCENT.primary) => `0 0 0 3px ${color}26`;

// ═══════════════════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════════════════
export const getTheme = (darkMode) => {
  const c = getColors(darkMode);
  return createTheme({
    palette: {
      mode: darkMode ? "dark" : "light",
      primary: { main: darkMode ? "#a0adff" : ACCENT.primary, contrastText: "#fff" },
      secondary: { main: ACCENT.secondary, contrastText: "#fff" },
      success: { main: ACCENT.success },
      warning: { main: ACCENT.warning },
      error: { main: ACCENT.danger },
      info: { main: ACCENT.tertiary },
      background: { default: c.bgBase, paper: c.bgSurface },
      text: { primary: c.textPrimary, secondary: c.textSecondary },
      divider: c.border,
    },
    typography: {
      fontFamily: FONT_STACK,
      h1: { fontWeight: 800, fontSize: 48, lineHeight: 1.2, letterSpacing: "-0.02em" },
      h2: { fontWeight: 800, fontSize: 40, lineHeight: 1.2, letterSpacing: "-0.02em" },
      h3: { fontWeight: 700, fontSize: 32, lineHeight: 1.2, letterSpacing: "-0.01em" },
      h4: { fontWeight: 700, fontSize: 24, lineHeight: 1.25 },
      h5: { fontWeight: 600, fontSize: 18, lineHeight: 1.3 },
      h6: { fontWeight: 600, fontSize: 15, lineHeight: 1.4 },
      subtitle1: { fontWeight: 500, fontSize: 15 },
      subtitle2: { fontWeight: 500, fontSize: 14 },
      body1: { fontWeight: 400, fontSize: 14, lineHeight: 1.5 },
      body2: { fontWeight: 400, fontSize: 13, lineHeight: 1.5 },
      button: { fontWeight: 500, fontSize: 14, textTransform: "none" },
      caption: { fontWeight: 400, fontSize: 12 },
    },
    shape: { borderRadius: 10 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ":root": {
            colorScheme: darkMode ? "dark" : "light",
            "--nexus-interaction-border": darkMode ? "#9BBFAE" : "#45685B",
            "--nexus-brand": darkMode ? MODERN_COLOR.primary : ACCENT.primary,
            "--nexus-brand-hex": ACCENT.primary,
            "--nexus-violet": MODERN_COLOR.secondary,
            "--nexus-cyan": MODERN_COLOR.tertiary,
            "--nexus-success": MODERN_COLOR.success,
            "--nexus-warning": MODERN_COLOR.warning,
            "--nexus-danger": MODERN_COLOR.danger,
            "--nexus-bg-base": c.bgBase,
            "--nexus-bg-surface": c.bgSurface,
            "--nexus-bg-overlay": c.bgOverlay,
            "--nexus-bg-subtle": c.bgSubtle,
            "--nexus-text-primary": c.textPrimary,
            "--nexus-text-secondary": c.textSecondary,
            "--nexus-text-muted": c.textMuted,
            "--nexus-text-disabled": darkMode ? "#64748B" : "#94A3B8",
            "--nexus-on-brand": "#FFFFFF",
            "--nexus-on-surface": c.textPrimary,
            "--nexus-on-surface-secondary": c.textSecondary,
            "--nexus-on-overlay": darkMode ? "#F8FAFC" : "#0F172A",
            "--nexus-motion-fast": "140ms",
            "--nexus-motion-normal": "200ms",
            "--nexus-ease-standard": "cubic-bezier(.22,1,.36,1)",
            "--nexus-border": c.border,
            "--nexus-focus": `color-mix(in oklch, ${MODERN_COLOR.primary} 22%, transparent)`,
            "--nexus-brand-soft": `color-mix(in oklch, ${MODERN_COLOR.primary} 11%, transparent)`,
            "--nexus-surface-glass": darkMode
              ? "color-mix(in oklch, white 4%, transparent)"
              : "color-mix(in oklch, white 78%, transparent)",
            "--nexus-surface-glass-border": darkMode
              ? "color-mix(in oklch, white 10%, transparent)"
              : "color-mix(in oklch, black 7%, transparent)",
            "--nexus-focus-ring": `color-mix(in oklch, ${MODERN_COLOR.primary} 22%, transparent)`,
            "--nexus-brand-hover": `color-mix(in oklch, ${MODERN_COLOR.primary} 88%, black 12%)`,
            "--nexus-brand-active": `color-mix(in oklch, ${MODERN_COLOR.primary} 78%, black 22%)`,
            "--nexus-brand-contrast": "#FFFFFF",
            "--nexus-surface-1": c.bgSurface,
            "--nexus-surface-2": c.bgOverlay,
            "--nexus-surface-3": c.bgSubtle,
            "--nexus-text-strong": c.textPrimary,
            "--nexus-text-default": c.textSecondary,
            "--nexus-text-subtle": c.textMuted,
            "--nexus-success-soft": `color-mix(in oklch, ${MODERN_COLOR.success} 12%, transparent)`,
            "--nexus-warning-soft": `color-mix(in oklch, ${MODERN_COLOR.warning} 12%, transparent)`,
            "--nexus-danger-soft": `color-mix(in oklch, ${MODERN_COLOR.danger} 12%, transparent)`,
            "--nexus-info-soft": `color-mix(in oklch, ${MODERN_COLOR.tertiary} 12%, transparent)`,
          },
          "*": { boxSizing: "border-box" },
          "#root": { width: "100%", minHeight: "100%" },
          html: {
            width: "100%",
            minHeight: "100%",
            scrollBehavior: "smooth",
            "@media (prefers-reduced-motion: reduce)": { scrollBehavior: "auto" },
          },
          body: {
            margin: 0,
            padding: 0,
            width: "100%",
            minHeight: "100%",
            backgroundColor: c.bgBase,
            color: c.textPrimary,
            overflowX: "hidden",
            textRendering: "optimizeLegibility",
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
            fontOpticalSizing: "auto",
            colorScheme: darkMode ? "dark" : "light",
            accentColor: MODERN_COLOR.primary,
            "&::-webkit-scrollbar": { width: 8, height: 8 },
            "&::-webkit-scrollbar-track": { background: "transparent" },
            scrollbarColor: `${c.bgSubtle} transparent`,
            "&::-webkit-scrollbar-thumb": { background: c.bgSubtle, borderRadius: 8 },
          },
          '[data-nexus-theme] .MuiTypography-root': {
            opacity: "1 !important",
            textRendering: "optimizeLegibility",
          },
          '[data-nexus-theme] .MuiTypography-colorTextSecondary': {
            color: `${c.textSecondary} !important`,
          },
          '[data-nexus-theme] .MuiTypography-caption': {
            color: `${c.textSecondary} !important`,
          },
          '[data-nexus-theme] .MuiFormHelperText-root': {
            opacity: "1 !important",
            color: `${c.textSecondary} !important`,
          },
          '[data-nexus-theme] .MuiInputBase-input': {
            color: `${c.textPrimary} !important`,
            WebkitTextFillColor: `${c.textPrimary} !important`,
          },
          '[data-nexus-theme] .MuiInputBase-input::placeholder': {
            color: `${c.textMuted} !important`,
            opacity: "1 !important",
          },
          '[data-nexus-theme] .MuiTypography-root.Mui-disabled': {
            color: `${darkMode ? "#64748B" : "#94A3B8"} !important`,
          },
          '[data-nexus-theme] .nexus-readable-secondary': {
            color: `${c.textSecondary} !important`,
            opacity: "1 !important",
          },
          '[data-nexus-theme] .nexus-readable-muted': {
            color: `${c.textMuted} !important`,
            opacity: "1 !important",
          },
          '[data-nexus-theme] .nexus-inverse-surface': {
            color: darkMode ? "#F8FAFC" : "#F8FAFC",
          },
          '[data-nexus-theme] .nexus-inverse-surface .MuiTypography-root': {
            color: "#F8FAFC !important",
            opacity: "1 !important",
          },
          "::selection": {
            background: `color-mix(in oklch, ${MODERN_COLOR.primary} 30%, transparent)`,
          },
          "@keyframes nexusAmbient": {
            "0%,100%": { transform: "translate3d(0,0,0) scale(1)" },
            "50%": { transform: "translate3d(1.5%,-1%,0) scale(1.02)" },
          },
          "@keyframes nexusShimmer": {
            "0%": { backgroundPosition: "-200% 0" },
            "100%": { backgroundPosition: "200% 0" },
          },
          "@keyframes nexusPageIn": {
            "0%": { opacity: 0, transform: "translate3d(0, 6px, 0) scale(0.995)" },
            "100%": { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
          },
          "@keyframes nexusSoftPop": {
            "0%": { opacity: 0, transform: "translate3d(0, 4px, 0) scale(0.985)" },
            "70%": { opacity: 1, transform: "translate3d(0, -1px, 0) scale(1.002)" },
            "100%": { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
          },
          "@media (prefers-reduced-motion: reduce)": {
            "*": {
              animationDuration: "0.01ms !important",
              animationIterationCount: "1 !important",
              transitionDuration: "0.01ms !important",
              scrollBehavior: "auto !important",
            },
          },
          "@media (max-width: 599px)": {
            body: { fontSize: 14 },
            ".MuiContainer-root": { paddingLeft: "16px !important", paddingRight: "16px !important" },
            ".MuiDialog-paper": { width: "calc(100% - 24px) !important", maxWidth: "calc(100% - 24px) !important", margin: "12px !important" },
            ".MuiDialogTitle-root": { padding: "18px 18px 8px !important" },
            ".MuiDialogContent-root": { padding: "8px 18px !important" },
            ".MuiDialogActions-root": { padding: "12px 18px 18px !important", flexWrap: "wrap" },
            ".MuiTableContainer-root": { maxWidth: "100%", overflowX: "auto" },
            ".MuiTabs-root": { maxWidth: "100%" },
            ".MuiTabs-scroller": { overflowX: "auto !important", scrollbarWidth: "none" },
            ".MuiTabs-flexContainer": { minWidth: "max-content" },
          },
        },
      },
      MuiButtonBase: {
        defaultProps: { disableRipple: true },
        styleOverrides: {
          root: {
            "&:focus-visible": {
              outline: "2px solid var(--nexus-interaction-border)",
              outlineOffset: 2,
              boxShadow: "none",
            },
            "@media (pointer: coarse)": {
              "&.MuiIconButton-root": { minWidth: 44, minHeight: 44 },
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            minHeight: 40,
            textTransform: "none",
            fontWeight: 500,
            borderRadius: 8,
            transition: "background-color 150ms ease, transform 150ms ease, box-shadow 150ms ease",
            "&:active": { transform: "scale(0.98)" },
          },
          containedPrimary: {
            backgroundColor: ACCENT.primary,
            "&:hover": { backgroundColor: "#4F52D9", transform: "scale(1.01)" },
          },
          outlined: { borderWidth: 1 },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            minWidth: 40,
            minHeight: 40,
            transition: "background-color 150ms ease, color 150ms ease, transform 180ms cubic-bezier(.22,1,.36,1)",
            "&:hover": { transform: "translateY(-1px)" },
            "&:active": { transform: "translateY(0) scale(0.96)" },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            transition: "background-color 150ms ease, color 150ms ease, transform 180ms cubic-bezier(.22,1,.36,1), box-shadow 180ms ease",
            "&:active": { transform: "scale(0.995)" },
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            transition: "background-color 130ms ease, color 130ms ease, transform 160ms cubic-bezier(.22,1,.36,1)",
            "&:hover": { transform: "translateX(1px)" },
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            transition: "color 150ms ease, opacity 150ms ease, transform 160ms cubic-bezier(.22,1,.36,1)",
            "&:active": { transform: "scale(0.98)" },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: "none" },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: c.bgSurface,
            border: `1px solid ${c.border}`,
            borderRadius: 12,
            boxShadow: darkMode
              ? "0 1px 2px rgba(0,0,0,0.12)"
              : "0 1px 3px rgba(15,23,42,0.04)",
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: { backgroundImage: "none", backgroundColor: c.bgOverlay, border: `1px solid ${c.border}`, borderRadius: 12 },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: { backgroundImage: "none", backgroundColor: c.bgOverlay, border: `1px solid ${c.border}`, borderRadius: 12 },
        },
      },
      MuiDrawer: { styleOverrides: { paper: { backgroundImage: "none", border: "none" } } },
      MuiDialog: {
        styleOverrides: {
          root: {
            "& .MuiBackdrop-root": { backdropFilter: "blur(4px)", backgroundColor: darkMode ? "rgba(0,0,0,0.6)" : "rgba(30,41,59,0.28)" },
          },
          paper: {
            backgroundImage: "none",
            backgroundColor: c.bgOverlay,
            borderRadius: 20,
            maxWidth: 480,
            border: `1px solid ${c.border}`,
          },
        },
      },
      MuiDialogTitle: { styleOverrides: { root: { padding: "24px 24px 8px", fontWeight: 700, fontSize: 18 } } },
      MuiDialogContent: { styleOverrides: { root: { padding: "8px 24px" } } },
      MuiDialogActions: { styleOverrides: { root: { padding: "16px 24px 24px", gap: 8 } } },
      MuiChip: {
        styleOverrides: { root: { fontWeight: 500, borderRadius: 999 } },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            backgroundColor: darkMode ? "rgba(255,255,255,0.02)" : "transparent",
            "& fieldset": { borderColor: darkMode ? "rgba(255,255,255,0.1)" : "#E2E8F0" },
            "&:hover fieldset": { borderColor: "var(--nexus-interaction-border)" },
            "&.Mui-focused fieldset": { borderColor: "var(--nexus-interaction-border)", borderWidth: 1 },
            "&.Mui-focused": { boxShadow: "0 2px 8px rgba(24,46,37,.06)" },
          },
          input: { fontSize: 14 },
        },
      },
      MuiLink: {
        styleOverrides: {
          root: {
            color: ACCENT.primary,
            textUnderlineOffset: 3,
            "&:focus-visible": {
              outline: "2px solid var(--nexus-interaction-border)",
              outlineOffset: 2,
              borderRadius: 3,
            },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: { color: c.textSecondary, fontSize: 12, fontWeight: 500 },
          shrink: { color: c.textSecondary },
        },
      },
      MuiFormHelperText: { styleOverrides: { root: { marginLeft: 2, fontSize: 11.5 } } },
      MuiTableCell: {
        styleOverrides: {
          root: { borderBottom: `1px solid ${c.border}`, fontSize: 13 },
          head: {
            textTransform: "uppercase",
            fontSize: 11,
            letterSpacing: "0.05em",
            fontWeight: 600,
            color: c.textSecondary,
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            "&:hover": { backgroundColor: darkMode ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)" },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { backgroundColor: c.bgOverlay, color: c.textPrimary, fontSize: 11.5, borderRadius: 8, border: `1px solid ${c.border}` },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 999, backgroundColor: darkMode ? "rgba(255,255,255,0.08)" : "#E2E8F0" },
          bar: { borderRadius: 999 },
        },
      },
      MuiAvatar: { styleOverrides: { root: { fontWeight: 600 } } },
      MuiSwitch: {
        styleOverrides: {
          switchBase: { "&.Mui-checked": { color: ACCENT.primary }, "&.Mui-checked + .MuiSwitch-track": { backgroundColor: ACCENT.primary } },
        },
      },
    },
  });
};
