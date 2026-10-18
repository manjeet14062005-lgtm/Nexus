import { Box, Button, Typography } from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { motion } from "motion/react";
import { AnalyticsSurface } from "./AnalyticsSurface.jsx";
import { useAnalyticsMotion } from "../motion/AnalyticsMotionProvider.jsx";

function Shimmer({ height, sx }) {
  const { level } = useAnalyticsMotion();
  return (
    <Box
      aria-hidden="true"
      sx={{
        height,
        borderRadius: 2.6,
        border: "1px solid var(--an-border)",
        background: level === "full"
          ? "linear-gradient(105deg,color-mix(in oklch,var(--an-primary) 4%,var(--an-surface-soft)) 20%,color-mix(in oklch,var(--an-primary) 11%,var(--an-surface-raised)) 42%,color-mix(in oklch,var(--an-primary) 4%,var(--an-surface-soft)) 64%)"
          : "var(--an-surface-soft)",
        backgroundSize: level === "full" ? "230% 100%" : "auto",
        animation: level === "full" ? "analyticsSkeletonShimmer 1.45s linear infinite" : "none",
        ...sx,
      }}
    />
  );
}

export function AnalyticsSkeleton() {
  return (
    <Box aria-label="Loading analytics" aria-busy="true" sx={{ display: "grid", gap: 1.25 }}>
      <Shimmer height={306} />
      <Box sx={{ display: { xs: "flex", md: "grid" }, gridTemplateColumns: { md: "repeat(2,1fr)", lg: "repeat(4,1fr)" }, gap: 1.25, overflow: "hidden" }}>{[0, 1, 2, 3].map((item) => <Shimmer key={item} height={176} sx={{ minWidth: { xs: 290, md: 0 }, flex: { xs: "0 0 82vw", md: "initial" } }} />)}</Box>
      <Shimmer height={488} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 1.25 }}><Shimmer height={350} /><Shimmer height={350} /></Box>
    </Box>
  );
}

function EmptyIllustration({ variant = "data" }) {
  return (
    <Box component="svg" viewBox="0 0 220 130" role="img" aria-label={variant === "workspace" ? "Workspace analytics illustration" : "Empty analytics illustration"} sx={{ width: 220, maxWidth: "86%", height: "auto", mx: "auto", display: "block" }}>
      <defs><linearGradient id={`empty-${variant}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="var(--an-primary)" stopOpacity=".8" /><stop offset="100%" stopColor="var(--an-aurora)" stopOpacity=".48" /></linearGradient></defs>
      <rect x="16" y="18" width="188" height="94" rx="18" fill="var(--an-surface-soft)" stroke="var(--an-border-strong)" />
      <path d="M34 91 C55 76,64 86,82 64 S117 76,139 49 S169 58,188 38" fill="none" stroke={`url(#empty-${variant})`} strokeWidth="4" strokeLinecap="round" />
      {[40,74,108,142,176].map((x, index) => <line key={x} x1={x} x2={x} y1="31" y2="99" stroke="var(--an-grid)" strokeDasharray={index % 2 ? "2 4" : "0"} />)}
      <circle cx={variant === "workspace" ? 108 : 139} cy={variant === "workspace" ? 66 : 49} r="7" fill="var(--an-surface)" stroke="var(--an-gold)" strokeWidth="3" />
      <path d={variant === "workspace" ? "M96 66h24M108 54v24" : "M135 49l3 3 7-8"} fill="none" stroke="var(--an-gold)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Box>
  );
}

export function EmptyWorkspaceState({ onCreateWorkspace }) {
  return (
    <AnalyticsSurface sx={{ minHeight: 460, display: "grid", placeItems: "center", p: 3 }}>
      <Box sx={{ maxWidth: 560, textAlign: "center" }}><EmptyIllustration variant="workspace" /><Typography sx={{ mt: 1.2, fontSize: 22, fontWeight: 880, letterSpacing: "-.03em", color: "var(--an-text)" }}>Create a workspace to begin</Typography><Typography sx={{ mt: .8, color: "var(--an-text-2)", lineHeight: 1.7 }}>Analytics are workspace-scoped. Create or join a workspace before verification activity can be analyzed.</Typography><Button variant="contained" onClick={onCreateWorkspace} sx={{ mt: 2, minHeight: 44, borderRadius: 2, textTransform: "none", fontWeight: 780, background: "var(--an-primary-action)", color: "#fff" }}>Open workspaces</Button></Box>
    </AnalyticsSurface>
  );
}

export function EmptyDataState({ onOpenDeveloper, onRefresh }) {
  return (
    <AnalyticsSurface sx={{ minHeight: 460, display: "grid", placeItems: "center", p: 3 }}>
      <Box sx={{ maxWidth: 590, textAlign: "center" }}><EmptyIllustration /><Typography sx={{ mt: 1.2, fontSize: 22, fontWeight: 880, letterSpacing: "-.03em", color: "var(--an-text)" }}>No verification activity in this range</Typography><Typography sx={{ mt: .8, color: "var(--an-text-2)", lineHeight: 1.7 }}>No requests were returned for the selected workspace, environment, and date range. Nexus will populate this view from real verification traffic.</Typography><Box sx={{ mt: 2, display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap" }}><Button variant="contained" onClick={onOpenDeveloper} sx={{ minHeight: 44, borderRadius: 2, textTransform: "none", fontWeight: 780, background: "var(--an-primary-action)", color: "#fff" }}>Open Developer Portal</Button><Button variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={onRefresh} sx={{ minHeight: 44, borderRadius: 2, textTransform: "none", fontWeight: 760, color: "var(--an-text)", borderColor: "var(--an-border-strong)" }}>Refresh</Button></Box></Box>
    </AnalyticsSurface>
  );
}

export function AnalyticsError({ message, onRetry, compact = false, title }) {
  const { level } = useAnalyticsMotion();
  return (
    <Box component={motion.div} role="alert" initial={level === "full" ? { opacity: 0, x: -8 } : false} animate={level === "full" ? { opacity: 1, x: [0, -3, 3, 0] } : { opacity: 1 }} transition={level === "full" ? { duration: .34, ease: [0.22, 1, .36, 1] } : { duration: level === "off" ? 0 : .14 }} sx={{ p: compact ? 1.25 : 1.6, borderRadius: 2.2, border: "1px solid color-mix(in oklch,var(--an-danger) 20%,transparent)", background: "var(--an-semantic-danger-bg)", display: "flex", alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between", gap: 1.2, flexDirection: { xs: "column", sm: "row" } }}>
      <Box><Typography sx={{ fontSize: 12.5, fontWeight: 820, color: "var(--an-danger)" }}>{title || (compact ? "We couldn’t refresh analytics." : "We couldn’t load analytics.")}</Typography><Typography variant="caption" sx={{ mt: .25, display: "block", color: "var(--an-text-2)" }}>{message || (compact ? "The previous successful data remains unchanged." : "Try again when the connection is ready.")}</Typography></Box>
      <Button size="small" startIcon={<RefreshRoundedIcon />} onClick={onRetry} sx={{ minHeight: 44, borderRadius: 1.8, textTransform: "none", fontWeight: 760, color: "var(--an-text)" }}>Retry</Button>
    </Box>
  );
}
