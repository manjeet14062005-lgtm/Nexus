import { memo } from "react";
import { Box } from "@mui/material";
import { ACCENT } from "../../constants/theme";

// Hybrid Premium surface.
// `glass` is intentionally opt-in so most content remains clean/solid,
// while floating and overlay contexts can use translucent material.
export const GlassCard = memo(function GlassCard({
  children,
  sx = {},
  glow,
  onClick,
  glass = false,
  as,
}) {
  const roleSurface = glass ? {
    backgroundColor: "color-mix(in oklch, var(--nexus-brand) 3%, var(--nexus-surface-glass))",
    backdropFilter: "blur(18px) saturate(135%)",
    WebkitBackdropFilter: "blur(18px) saturate(135%)",
    border: "1px solid color-mix(in oklch, var(--nexus-brand) 12%, var(--nexus-border))",
    boxShadow: "0 1px 0 rgba(15,23,42,0.04) inset, 0 14px 36px rgba(0,0,0,0.16), 0 28px 64px rgba(0,0,0,0.10)",
  } : {
    backgroundColor: (t) => t.palette.background.paper,
    border: (t) => `1px solid ${t.palette.divider}`,
    boxShadow: (t) => t.palette.mode === "dark"
      ? "0 1px 2px rgba(0,0,0,0.12)"
      : "0 1px 3px rgba(15,23,42,0.04)",
  };

  return (
    <Box
      component={as}
      onClick={onClick}
      sx={{
        position: "relative",
        borderRadius: 2,
        overflow: "hidden",
        transition: "transform 220ms cubic-bezier(.22,1,.36,1), box-shadow 220ms cubic-bezier(.22,1,.36,1), border-color 180ms ease",
        cursor: onClick ? "pointer" : "default",
        minWidth: 0,
        ...roleSurface,
        ...(glow ? {
          "&:focus-within": {
            borderColor: "var(--nexus-interaction-border)",
            boxShadow: "0 4px 14px rgba(24,46,37,.06)",
          },
        } : {}),
        "&:hover": onClick ? {
          transform: "translateY(-2px)",
        } : {},
        "&:focus-visible": onClick ? {
          outline: "2px solid var(--nexus-interaction-border)",
          outlineOffset: 3,
          boxShadow: "none",
        } : {},
        // A restrained accent reflection is used only on glass surfaces.
        ...(glass ? {
          "&::before": {
            content: '""',
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: `linear-gradient(135deg, color-mix(in oklch, ${ACCENT.primary} 8%, transparent), transparent 36%, color-mix(in oklch, ${ACCENT.tertiary} 4%, transparent) 100%)`,
            opacity: 0.65,
          },
        } : {}),
        ...sx,
      }}
    >
      {children}
    </Box>
  );
});
