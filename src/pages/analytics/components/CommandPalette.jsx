import { analyticsPortalContainer } from "./portalContainer.js";
import { useEffect, useMemo, useState } from "react";
import { Box, Dialog, DialogContent, InputAdornment, List, ListItemButton, ListItemText, TextField, Typography } from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import KeyboardCommandKeyRoundedIcon from "@mui/icons-material/KeyboardCommandKeyRounded";
import { motion } from "motion/react";
import { fuzzyFilterCommands } from "../utils.js";
import { useAnalyticsMotion } from "../motion/AnalyticsMotionProvider.jsx";

const RECENTS_KEY = "nexus.analytics.commandRecents";

function readRecents() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecents(ids) {
  try { window.localStorage.setItem(RECENTS_KEY, JSON.stringify(ids.slice(0, 5))); } catch {}
}

function groupCommands(commands) {
  return commands.reduce((groups, command) => {
    const group = command.group || "Other";
    if (!groups[group]) groups[group] = [];
    groups[group].push(command);
    return groups;
  }, {});
}

export function CommandPalette({ open, onClose, workspaces, range, environment, canExport, onWorkspace, onRange, onEnvironment, onRefresh, onExport }) {
  const { level } = useAnalyticsMotion();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState(readRecents);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const allCommands = useMemo(() => [
    { id: "refresh", label: "Refresh analytics", hint: "R", group: "Actions", keywords: "reload update fetch", action: onRefresh },
    { id: "export", label: "Export verification CSV", hint: "E", group: "Actions", keywords: "download report csv", disabled: !canExport, action: onExport },
    ...[7, 30, 90, 365].map((value, index) => ({ id: `range-${value}`, label: `Range · ${value === 365 ? "1 year" : `${value} days`}`, hint: `${index + 1}`, group: "Range", keywords: `${value} days time period`, selected: range === value, action: () => onRange(value) })),
    ...["all", "live", "test"].map((value) => ({ id: `environment-${value}`, label: `Environment · ${value[0].toUpperCase()}${value.slice(1)}`, hint: environment === value ? "Selected" : "", group: "Environment", keywords: "environment verification", selected: environment === value, action: () => onEnvironment(value) })),
    ...(Array.isArray(workspaces) ? workspaces.map((workspace) => ({ id: `workspace-${workspace.id}`, label: `Workspace · ${workspace.name || "Untitled workspace"}`, hint: "Workspace", group: "Workspaces", keywords: workspace.name || "workspace", action: () => onWorkspace(workspace.id) })) : []),
  ], [canExport, environment, onEnvironment, onExport, onRange, onRefresh, onWorkspace, range, workspaces]);

  const commands = useMemo(() => {
    if (query.trim()) return fuzzyFilterCommands(allCommands, query);
    const recent = recentIds.map((id) => allCommands.find((command) => command.id === id)).filter(Boolean).map((command) => ({ ...command, group: "Recent" }));
    const recentSet = new Set(recent.map((command) => command.id));
    return [...recent, ...allCommands.filter((command) => !recentSet.has(command.id))];
  }, [allCommands, query, recentIds]);

  const groups = useMemo(() => groupCommands(commands), [commands]);
  const flatCommands = useMemo(() => Object.values(groups).flat(), [groups]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, flatCommands.length - 1)));
  }, [flatCommands.length]);

  const run = (command) => {
    if (!command || command.disabled) return;
    command.action?.();
    const nextRecents = [command.id, ...recentIds.filter((id) => id !== command.id)].slice(0, 5);
    setRecentIds(nextRecents);
    saveRecents(nextRecents);
    onClose();
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(flatCommands.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(flatCommands[activeIndex]);
    }
  };

  let runningIndex = 0;
  return (
    <Dialog aria-label="Analytics command palette" container={analyticsPortalContainer} open={open} onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ component: motion.div, initial: level === "full" ? { opacity: 0, scale: .97, filter: "blur(7px)" } : false, animate: { opacity: 1, scale: 1, filter: "blur(0px)" }, transition: level === "full" ? { type: "spring", stiffness: 320, damping: 30 } : { duration: level === "off" ? 0 : .14 }, sx: { borderRadius: 3, border: "1px solid var(--an-border-strong)", background: "var(--an-surface)", boxShadow: "var(--an-shadow-3)", overflow: "hidden" } }}>
      <DialogContent sx={{ p: 1.25 }} onKeyDown={handleKeyDown}>
        <TextField inputProps={{ "aria-label": "Search analytics commands" }} autoFocus fullWidth value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} placeholder="Search analytics commands" InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: "var(--an-text-3)" }} /></InputAdornment>, endAdornment: <InputAdornment position="end"><Box sx={{ display: "flex", alignItems: "center", gap: .35, color: "var(--an-text-3)" }}><KeyboardCommandKeyRoundedIcon sx={{ fontSize: 16 }} /><Typography variant="caption">K</Typography></Box></InputAdornment> }} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.25, color: "var(--an-text)", background: "var(--an-surface-soft)", "& fieldset": { borderColor: "var(--an-border)" }, "&.Mui-focused fieldset": { borderColor: "var(--an-primary)", boxShadow: "0 0 0 3px var(--an-focus)" } } }} />

        <List sx={{ mt: 1, maxHeight: 460, overflowY: "auto", p: .25 }}>
          {Object.entries(groups).map(([group, groupRows]) => (
            <Box key={group} sx={{ mb: .7 }}>
              <Typography sx={{ px: 1.1, py: .55, fontSize: 9.5, fontWeight: 850, letterSpacing: ".11em", textTransform: "uppercase", color: "var(--an-text-3)" }}>{group}</Typography>
              {groupRows.map((command) => {
                const index = runningIndex;
                runningIndex += 1;
                const selected = index === activeIndex;
                return (
                  <ListItemButton key={`${group}-${command.id}`} selected={selected} disabled={command.disabled} onMouseEnter={() => setActiveIndex(index)} onClick={() => run(command)} sx={{ position: "relative", minHeight: 48, borderRadius: 1.75, mb: .25, color: "var(--an-text)", overflow: "hidden", "&.Mui-selected": { background: "transparent" }, "&.Mui-selected:hover": { background: "transparent" } }}>
                    {selected && <Box component={motion.span} layoutId="analytics-command-selection" transition={level === "full" ? { type: "spring", stiffness: 520, damping: 38 } : { duration: 0 }} sx={{ position: "absolute", inset: 0, zIndex: 0, borderRadius: 1.75, background: "color-mix(in oklch,var(--an-primary) 9%,transparent)", border: "1px solid color-mix(in oklch,var(--an-primary) 14%,transparent)" }} />}
                    <ListItemText sx={{ position: "relative", zIndex: 1 }} primary={command.label} secondary={command.selected ? "Selected" : undefined} primaryTypographyProps={{ fontWeight: 720, fontSize: 13 }} secondaryTypographyProps={{ fontSize: 9.5, color: "var(--an-primary-fg)", fontWeight: 760 }} />
                    {command.hint && <Typography component="kbd" sx={{ position: "relative", zIndex: 1, px: .65, py: .25, borderRadius: .85, fontFamily: '"JetBrains Mono",monospace', fontSize: 9.5, color: "var(--an-text-3)", border: "1px solid var(--an-border)" }}>{command.hint}</Typography>}
                  </ListItemButton>
                );
              })}
            </Box>
          ))}
          {flatCommands.length === 0 && <Box sx={{ py: 4, textAlign: "center" }}><Typography variant="body2" sx={{ color: "var(--an-text-2)" }}>No matching commands.</Typography></Box>}
        </List>
      </DialogContent>
    </Dialog>
  );
}
