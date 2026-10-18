import { memo } from "react";
import { Box } from "@mui/material";

/**
 * Premium text treatment used across Nexus.
 *
 * Gradient text was intentionally removed from the global typography system.
 * GText now provides a high-contrast, solid brand-accent treatment with a
 * restrained luminance lift. This keeps typography readable in both themes
 * and preserves native emoji/icon rendering.
 */
export const GText = memo(function GText({ children, sx = {} }) {
  return (
    <Box
      component="span"
      sx={{
        color: "var(--nexus-brand, #6366F1)",
        fontWeight: "inherit",
        textShadow: "none",
        textDecorationThickness: "1px",
        textUnderlineOffset: "3px",
        "@media (prefers-reduced-motion: reduce)": {
          textShadow: "none",
        },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
});
