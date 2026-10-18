// BentoBox.jsx — Reusable bento layout container.
// Creates a glassmorphic, softly glowing surface for account sections.

import { Box, Typography } from "@mui/material";
import { usePointerSpotlight } from "../hooks/usePointerSpotlight";

export function BentoBox({
  title,
  subtitle,
  children,
  action,
  noPad = false,
  highlight = false,
  interactive = false,
  spotlight = false,
  onClick,
  sx = {},
}) {
  const spotlightRef = usePointerSpotlight(spotlight && !highlight);

  return (
    <Box
      ref={spotlightRef}
      role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? event => { if (event.target === event.currentTarget && ["Enter", " "].includes(event.key)) { event.preventDefault(); onClick?.(); } } : undefined}
      onClick={interactive ? onClick : undefined}
      sx={{
        position: "relative",
        background: highlight
          ? "color-mix(in oklch, var(--acct-brand) 4%, var(--acct-surface))"
          : "var(--acct-surface)",
        border: highlight
          ? "1px solid color-mix(in oklch, var(--acct-brand) 30%, transparent)"
          : "1px solid var(--acct-border)",
        borderRadius: "16px",
        overflow: "hidden",
        transition: "transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease",
        cursor: interactive ? "pointer" : "default",
        boxShadow: highlight ? "0 4px 24px rgba(79,85,207,0.06)" : "none",
        "&:hover": interactive
          ? {
              transform: "translateY(-2px)",
              boxShadow: "0 8px 32px rgba(15,23,42,0.06)",
              borderColor: highlight ? undefined : "color-mix(in oklch, var(--acct-border) 80%, var(--acct-brand))",
            }
          : {},
        "&::before": (spotlight && !highlight) ? {
          content: '""',
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "radial-gradient(600px circle at var(--spotlight-x, -999px) var(--spotlight-y, -999px), rgba(79,85,207,0.03), transparent 40%)",
          pointerEvents: "none",
          zIndex: 0,
        } : {},
        ...sx,
      }}
    >
      {(title || subtitle || action) && (
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 2,
            p: 2.5,
            pb: noPad ? 2.5 : 1.5,
            borderBottom: noPad && (title || subtitle) && children ? "1px solid var(--acct-border)" : "none",
            position: "relative",
            zIndex: 1,
          }}
        >
          <Box>
            {title && (
              <Typography sx={{ fontSize: 15, fontWeight: 600, color: "var(--acct-text)", lineHeight: 1.2 }}>
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography sx={{ fontSize: 13, color: "var(--acct-muted)", mt: 0.5, lineHeight: 1.4 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
        </Box>
      )}
      {children && (
        <Box sx={{ p: noPad ? 0 : 2.5, pt: noPad || title || subtitle || action ? 0 : 2.5, position: "relative", zIndex: 1 }}>
          {children}
        </Box>
      )}
    </Box>
  );
}
