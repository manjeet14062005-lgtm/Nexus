import { analyticsPortalContainer } from "./portalContainer.js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import KeyboardCommandKeyRoundedIcon from "@mui/icons-material/KeyboardCommandKeyRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import AnimationRoundedIcon from "@mui/icons-material/AnimationRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { motion } from "motion/react";
import { ANALYTICS_ACCENTS } from "../tokens.js";
import { useAnalyticsMotion } from "../motion/AnalyticsMotionProvider.jsx";

function Segmented({ label, value, options, onChange, layoutId }) {
  const { level } = useAnalyticsMotion();
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography component="span" sx={{ display: { xs: "none", xl: "block" }, mb: .45, color: "var(--an-text-3)", fontSize: 9.5, fontWeight: 800, letterSpacing: ".11em", textTransform: "uppercase" }}>{label}</Typography>
      <Box role="group" aria-label={label} sx={{ display: "flex", position: "relative", p: .4, gap: .15, minHeight: 50, borderRadius: 2, border: "1px solid var(--an-border)", background: "color-mix(in oklch,var(--an-surface-soft) 86%,transparent)" }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Button key={option.value} size="small" onClick={() => onChange(option.value)} aria-pressed={selected} sx={{ minWidth: option.minWidth || 42, minHeight: 44, px: { xs: .9, sm: 1.15 }, borderRadius: 1.55, textTransform: "none", fontSize: 11.5, fontWeight: selected ? 800 : 680, color: selected ? "var(--an-text)" : "var(--an-text-2)", zIndex: 1, position: "relative", "&:hover": { background: selected ? "transparent" : "color-mix(in oklch,var(--an-primary) 5%,transparent)" }, "&:focus-visible": { outline: "2px solid var(--an-primary)", outlineOffset: 2 } }}>
              {selected && <Box component={motion.span} layoutId={layoutId} transition={level === "full" ? { type: "spring", stiffness: 520, damping: 38 } : { duration: 0 }} sx={{ position: "absolute", inset: 0, zIndex: -1, borderRadius: 1.55, border: "1px solid var(--an-border-strong)", background: "var(--an-surface-raised)", boxShadow: "0 6px 16px rgba(31,41,70,.08),inset 0 1px 0 rgba(255,255,255,.45)" }} />}
              {option.label}
            </Button>
          );
        })}
      </Box>
    </Box>
  );
}

function secondsSince(updatedAt, now) {
  if (!updatedAt) return null;
  return Math.max(0, Math.floor((now - updatedAt.getTime()) / 1000));
}

function updatedLabel(updatedAt, now) {
  const seconds = secondsSince(updatedAt, now);
  if (seconds === null) return "Not updated yet";
  if (seconds < 5) return "Updated just now";
  if (seconds < 60) return `Updated ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Updated ${minutes}m ago`;
  return `Updated ${Math.floor(minutes / 60)}h ago`;
}

export function AnalyticsControlBar({
  workspaces,
  workspaceId,
  onWorkspace,
  range,
  onRange,
  environment,
  onEnvironment,
  refreshing,
  updatedAt,
  canExport,
  exportState,
  onRefresh,
  onExport,
  onOpenCommands,
  onOpenShortcuts,
  accent,
  onAccent,
}) {
  const [now, setNow] = useState(Date.now());
  const [scrolled, setScrolled] = useState(false);
  const [accentAnchor, setAccentAnchor] = useState(null);
  const [motionAnchor, setMotionAnchor] = useState(null);
  const [refreshSuccess, setRefreshSuccess] = useState(false);
  const wasRefreshingRef = useRef(false);
  const { level, setLevel } = useAnalyticsMotion();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 18);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (refreshing) {
      wasRefreshingRef.current = true;
      setRefreshSuccess(false);
      return undefined;
    }
    if (!wasRefreshingRef.current) return undefined;
    wasRefreshingRef.current = false;
    setRefreshSuccess(true);
    const timer = window.setTimeout(() => setRefreshSuccess(false), 900);
    return () => window.clearTimeout(timer);
  }, [refreshing]);

  const workspaceOptions = useMemo(() => Array.isArray(workspaces) ? workspaces : [], [workspaces]);
  const ageSeconds = secondsSince(updatedAt, now);
  const stale = ageSeconds !== null && ageSeconds > 300;

  return (
    <Box
      component={motion.nav}
      initial={level === "full" ? { opacity: 0, y: -10, filter: "blur(5px)" } : level === "reduced" ? { opacity: 0 } : false}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={level === "full" ? { duration: .38, ease: [0.22, 1, .36, 1] } : { duration: level === "off" ? 0 : .14 }}
      aria-label="Analytics controls"
      sx={{
        position: "sticky",
        top: { xs: 62, md: 64 },
        zIndex: 20,
        mb: 2,
        p: { xs: 1, md: 1.15 },
        border: "1px solid var(--an-border)",
        borderRadius: 2.75,
        background: scrolled ? "color-mix(in oklch,var(--an-surface) 88%,transparent)" : "color-mix(in oklch,var(--an-surface) 78%,transparent)",
        backdropFilter: `blur(${scrolled ? 26 : 18}px) saturate(1.25)`,
        boxShadow: scrolled ? "var(--an-shadow-2)" : "0 10px 30px rgba(30,40,70,.05)",
        transition: "background 180ms ease,box-shadow 180ms ease,backdrop-filter 180ms ease",
        "&::after": { content: '""', position: "absolute", left: 16, right: 16, bottom: 0, height: "1px", pointerEvents: "none", opacity: scrolled ? .85 : .25, background: "linear-gradient(90deg,transparent,var(--an-primary),var(--an-aurora),transparent)" },
        "@media (prefers-reduced-transparency: reduce)": { backdropFilter: "none", background: "var(--an-surface)" },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, flexWrap: "wrap" }}>
        <Box sx={{ minWidth: { xs: "100%", sm: 220 }, flex: { xs: "1 1 100%", sm: "1 1 220px", lg: "0 1 260px" } }}>
          <Typography sx={{ display: { xs: "none", xl: "block" }, mb: .45, color: "var(--an-text-3)", fontSize: 9.5, fontWeight: 800, letterSpacing: ".11em", textTransform: "uppercase" }}>Workspace</Typography>
          <TextField SelectProps={{ MenuProps: { container: analyticsPortalContainer } }} select fullWidth size="small" value={workspaceId} onChange={(event) => onWorkspace(event.target.value)} inputProps={{ "aria-label": "Workspace" }} sx={{ "& .MuiOutlinedInput-root": { minHeight: 44, borderRadius: 2, color: "var(--an-text)", background: "color-mix(in oklch,var(--an-surface-soft) 86%,transparent)", "& fieldset": { borderColor: "var(--an-border)" }, "&:hover fieldset": { borderColor: "var(--an-border-strong)" }, "&.Mui-focused fieldset": { borderColor: "var(--an-primary)", boxShadow: "0 0 0 3px var(--an-focus)" } } }}>
            {workspaceOptions.map((workspace) => <MenuItem key={workspace.id} value={workspace.id}>{workspace.name || "Untitled workspace"}</MenuItem>)}
          </TextField>
        </Box>

        <Segmented label="Range" value={range} onChange={onRange} layoutId="analytics-range-thumb" options={[{ value: 7, label: "7d" }, { value: 30, label: "30d" }, { value: 90, label: "90d" }, { value: 365, label: "1y" }]} />
        <Segmented label="Environment" value={environment} onChange={onEnvironment} layoutId="analytics-environment-thumb" options={[{ value: "all", label: "All" }, { value: "live", label: "Live" }, { value: "test", label: "Test" }]} />

        <Box sx={{ ml: { lg: "auto" }, display: "flex", alignItems: "center", gap: .55, minHeight: 44, flexWrap: "wrap" }}>
          <Typography variant="caption" sx={{ display: { xs: "none", md: "block" }, color: stale ? "var(--an-warning)" : "var(--an-text-3)", fontWeight: 720, whiteSpace: "nowrap", mr: .15 }}>{refreshing ? "Refreshing…" : updatedLabel(updatedAt, now)}</Typography>

          <Tooltip title={updatedLabel(updatedAt, now)}>
            <span>
            <IconButton aria-label={`${updatedLabel(updatedAt, now)}. Refresh analytics`} onClick={onRefresh} disabled={refreshing} sx={{ width: 44, height: 44, borderRadius: 2, border: "1px solid var(--an-border)", color: refreshSuccess ? "var(--an-success)" : "var(--an-text-2)", background: "var(--an-surface-soft)", "&:focus-visible": { outline: "2px solid var(--an-primary)", outlineOffset: 2 } }}>
              <Box component={motion.span} animate={refreshing && level === "full" ? { rotate: 360 } : { rotate: 0 }} transition={refreshing && level === "full" ? { duration: 1, repeat: Infinity, ease: "linear" } : { duration: 0 }} sx={{ display: "grid", placeItems: "center" }}>{refreshSuccess ? <CheckRoundedIcon sx={{ fontSize: 19 }} /> : <RefreshRoundedIcon sx={{ fontSize: 19 }} />}</Box>
            </IconButton>
            </span>
          </Tooltip>

          <Tooltip title={canExport ? "Export the current verification report as CSV" : "Your workspace role does not include reports.export."}>
            <span>
              <Button variant="outlined" startIcon={exportState === "success" ? <CheckRoundedIcon /> : <DownloadRoundedIcon />} disabled={!canExport || exportState === "loading"} onClick={onExport} sx={{ position: "relative", overflow: "visible", minHeight: 44, borderRadius: 2, px: 1.5, textTransform: "none", fontWeight: 760, borderColor: exportState === "success" ? "color-mix(in oklch,var(--an-success) 34%,var(--an-border))" : "var(--an-border-strong)", color: exportState === "success" ? "var(--an-success)" : "var(--an-text)", "&:hover": { borderColor: "var(--an-primary)", background: "color-mix(in oklch,var(--an-primary) 5%,transparent)" } }}>
                {exportState === "loading" ? "Exporting" : exportState === "success" ? "Exported" : "Export CSV"}
                {exportState === "success" && level === "full" && Array.from({ length: 8 }, (_, index) => <Box component={motion.span} key={index} initial={{ opacity: 1, x: 0, y: 0, scale: 1 }} animate={{ opacity: 0, x: Math.cos((index / 8) * Math.PI * 2) * 20, y: Math.sin((index / 8) * Math.PI * 2) * 20, scale: .2 }} transition={{ duration: .48, ease: [0.22, 1, .36, 1] }} sx={{ position: "absolute", width: 4, height: 4, borderRadius: "50%", left: "50%", top: "50%", background: "var(--an-success)", pointerEvents: "none" }} />)}
              </Button>
            </span>
          </Tooltip>

          <Tooltip title={`Accent theme · ${ANALYTICS_ACCENTS[accent]?.label || "Violet"}`}><IconButton onClick={(event) => setAccentAnchor(event.currentTarget)} aria-label="Change analytics accent theme" sx={{ width: 44, height: 44, borderRadius: 2, border: "1px solid var(--an-border)", color: "var(--an-text-2)", background: "var(--an-surface-soft)" }}><PaletteOutlinedIcon sx={{ fontSize: 19 }} /></IconButton></Tooltip>
          <Menu container={analyticsPortalContainer} anchorEl={accentAnchor} open={Boolean(accentAnchor)} onClose={() => setAccentAnchor(null)} PaperProps={{ sx: { mt: .7, borderRadius: 2, border: "1px solid var(--an-border)", background: "var(--an-surface)", color: "var(--an-text)", boxShadow: "var(--an-shadow-2)" } }}>{Object.entries(ANALYTICS_ACCENTS).map(([key, item]) => <MenuItem key={key} selected={accent === key} onClick={() => { onAccent(key); setAccentAnchor(null); }} sx={{ minHeight: 44, gap: 1 }}><Box sx={{ width: 14, height: 14, borderRadius: "50%", background: item.primary, boxShadow: `0 0 0 3px ${item.primary}18` }} />{item.label}</MenuItem>)}</Menu>

          <Tooltip title={`Motion · ${level}`}><IconButton onClick={(event) => setMotionAnchor(event.currentTarget)} aria-label="Change analytics motion level" sx={{ width: 44, height: 44, borderRadius: 2, border: "1px solid var(--an-border)", color: "var(--an-text-2)", background: "var(--an-surface-soft)" }}><AnimationRoundedIcon sx={{ fontSize: 19 }} /></IconButton></Tooltip>
          <Menu container={analyticsPortalContainer} anchorEl={motionAnchor} open={Boolean(motionAnchor)} onClose={() => setMotionAnchor(null)} PaperProps={{ sx: { mt: .7, borderRadius: 2, border: "1px solid var(--an-border)", background: "var(--an-surface)", color: "var(--an-text)", boxShadow: "var(--an-shadow-2)" } }}>{["full", "reduced", "off"].map((item) => <MenuItem key={item} selected={level === item} onClick={() => { setLevel(item); setMotionAnchor(null); }} sx={{ minHeight: 44, textTransform: "capitalize" }}>{item}</MenuItem>)}</Menu>

          <Tooltip title="Keyboard shortcuts"><IconButton aria-label="Open analytics keyboard shortcuts" onClick={onOpenShortcuts} sx={{ width: 44, height: 44, borderRadius: 2, border: "1px solid var(--an-border)", color: "var(--an-text-2)", background: "var(--an-surface-soft)" }}><HelpOutlineRoundedIcon sx={{ fontSize: 19 }} /></IconButton></Tooltip>

          <Tooltip title="Command palette (Ctrl/⌘ K)"><Button onClick={onOpenCommands} aria-label="Open analytics command palette" sx={{ minWidth: 44, minHeight: 44, px: 1, borderRadius: 2, border: "1px solid var(--an-border)", color: "var(--an-text-2)", background: "var(--an-surface-soft)", "&:focus-visible": { outline: "2px solid var(--an-primary)", outlineOffset: 2 } }}><KeyboardCommandKeyRoundedIcon sx={{ fontSize: 18 }} /><Typography component="span" sx={{ ml: .35, fontSize: 11, fontWeight: 800 }}>K</Typography></Button></Tooltip>
        </Box>
      </Box>

      <Typography variant="caption" sx={{ mt: .75, px: .35, display: { xs: "block", md: "none" }, color: stale ? "var(--an-warning)" : "var(--an-text-3)" }}>{refreshing ? "Refreshing analytics…" : updatedLabel(updatedAt, now)}</Typography>
    </Box>
  );
}
