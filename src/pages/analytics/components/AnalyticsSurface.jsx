import { forwardRef, useCallback, useEffect, useRef } from "react";
import { Box } from "@mui/material";
import { useAnalyticsMotion } from "../motion/AnalyticsMotionProvider.jsx";

export const AnalyticsSurface = forwardRef(function AnalyticsSurface({ children, sx, component = "section", accent = "var(--an-primary)", interactive = false, ...props }, forwardedRef) {
  const { level } = useAnalyticsMotion();
  const frameRef = useRef(null);

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  const onPointerMove = useCallback((event) => {
    if (!interactive || level !== "full" || window.matchMedia?.("(pointer: coarse)")?.matches) return;
    const node = event.currentTarget;
    const x = event.clientX;
    const y = event.clientY;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const rect = node.getBoundingClientRect();
      node.style.setProperty("--mx", `${x - rect.left}px`);
      node.style.setProperty("--my", `${y - rect.top}px`);
    });
  }, [interactive, level]);

  return (
    <Box
      ref={forwardedRef}
      component={component}
      onPointerMove={onPointerMove}
      {...props}
      sx={{
        containerType: "inline-size",
        position: "relative",
        border: "1px solid var(--an-border)",
        borderRadius: { xs: 2.5, md: 3 },
        background: "var(--an-surface)",
        boxShadow: "var(--an-shadow-1), var(--an-inner-highlight)",
        overflow: "hidden",
        isolation: "isolate",
        transition: level === "off" ? "none" : "transform 180ms cubic-bezier(.22,1,.36,1), box-shadow 180ms cubic-bezier(.22,1,.36,1), border-color 180ms ease",
        "&::before": interactive ? {
          content: '""',
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: -1,
          opacity: level === "full" ? .85 : 0,
          background: `radial-gradient(260px circle at var(--mx,50%) var(--my,50%), color-mix(in oklch, ${accent} 8%, transparent), transparent 72%)`,
        } : undefined,
        "&::after": {
          content: '""',
          position: "absolute",
          left: "8%",
          right: "8%",
          top: 0,
          height: 1,
          pointerEvents: "none",
          background: `linear-gradient(90deg,transparent,color-mix(in oklch, ${accent} 24%, white 22%),transparent)`,
          opacity: .56,
        },
        ...(interactive ? {
          "&:hover": {
            transform: level === "full" ? "translateY(-1px)" : "none",
            boxShadow: `var(--an-shadow-2), inset 0 1px 0 color-mix(in oklch, ${accent} 13%, white 18%)`,
            borderColor: `color-mix(in oklch, ${accent} 18%, var(--an-border))`,
          },
        } : {}),
        ...sx,
      }}
    >
      {children}
    </Box>
  );
});
