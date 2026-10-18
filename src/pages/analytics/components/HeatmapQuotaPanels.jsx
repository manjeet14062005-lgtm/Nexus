import { useMemo, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import AllInclusiveRoundedIcon from "@mui/icons-material/AllInclusiveRounded";
import SpeedRoundedIcon from "@mui/icons-material/SpeedRounded";
import TableRowsRoundedIcon from "@mui/icons-material/TableRowsRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import { motion } from "motion/react";
import { AnalyticsSurface } from "./AnalyticsSurface.jsx";
import { OdometerNumber } from "./AnimatedNumber.jsx";
import { finiteNumber, formatCompact, paceProjection, quotaPercent, thresholdColorInterpolation } from "../utils.js";
import { useAmbientSlot, useAnalyticsMotion } from "../motion/AnalyticsMotionProvider.jsx";

function parseDay(day) {
  const date = day ? new Date(`${day}T00:00:00`) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatDay(day) {
  const date = parseDay(day);
  return date ? new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(date) : String(day || "—");
}

function heatmapLayout(series) {
  const rows = Array.isArray(series) ? series : [];
  if (!rows.length) return { cells: [], weeks: 1 };
  const firstDate = parseDay(rows[0]?.day);
  const firstOffset = firstDate ? (firstDate.getDay() + 6) % 7 : 0;
  const cells = rows.map((row, index) => {
    const position = firstOffset + index;
    return { row, week: Math.floor(position / 7), weekday: position % 7, index };
  });
  return { cells, weeks: Math.max(1, ...cells.map((cell) => cell.week + 1)) };
}

export function CalendarHeatmap({ series, activeDay, onActiveDay }) {
  const { level } = useAnalyticsMotion();
  const [tableView, setTableView] = useState(false);
  const [hovered, setHovered] = useState(null);
  const layout = useMemo(() => heatmapLayout(series), [series]);
  const max = Math.max(1, ...layout.cells.map((cell) => finiteNumber(cell.row?.requests, 0)));
  const cell = layout.weeks > 38 ? 10 : layout.weeks > 16 ? 14 : 18;
  const gap = 4;
  const width = layout.weeks * (cell + gap) - gap;
  const height = 7 * (cell + gap) - gap;

  return (
    <AnalyticsSurface sx={{ p: { xs: 1.6, sm: 2 }, minHeight: 330 }} accent="var(--an-primary)" interactive>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.2, mb: 1.4 }}>
        <Box><Typography sx={{ fontSize: 15.5, fontWeight: 850, letterSpacing: "-.02em", color: "var(--an-text)" }}>Request calendar</Typography><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>Daily request volume. Darker cells represent more requests.</Typography></Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: .5 }}><Button size="small" startIcon={<TableRowsRoundedIcon />} onClick={() => setTableView((value) => !value)} sx={{ minHeight: 38, borderRadius: 1.6, textTransform: "none", fontSize: 10.5, fontWeight: 740, color: "var(--an-text-2)", border: "1px solid var(--an-border)" }}>{tableView ? "View heatmap" : "View as table"}</Button><CalendarMonthRoundedIcon sx={{ fontSize: 20, color: "var(--an-primary-fg)" }} /></Box>
      </Box>

      {tableView ? (
        <Box sx={{ maxHeight: 300, overflow: "auto", border: "1px solid var(--an-border)", borderRadius: 2 }}>
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", "& th,& td": { p: .75, borderBottom: "1px solid var(--an-border)", textAlign: "left", fontSize: 11.5, color: "var(--an-text-2)" }, "& th": { position: "sticky", top: 0, background: "var(--an-surface)", color: "var(--an-text)", fontWeight: 800 } }}><thead><tr><th>Day</th><th>Requests</th></tr></thead><tbody>{layout.cells.map(({ row }) => <tr key={row.day}><td>{formatDay(row.day)}</td><td>{formatCompact(row.requests)}</td></tr>)}</tbody></Box>
        </Box>
      ) : layout.cells.length === 0 ? (
        <Box sx={{ py: 6, textAlign: "center", color: "var(--an-text-3)" }}><Typography variant="body2">No daily volume is available.</Typography></Box>
      ) : (
        <Box sx={{ overflowX: "auto", pb: .6, scrollbarWidth: "thin" }}>
          <Box sx={{ width: Math.max(width, 260), minWidth: "100%" }}>
            <Box sx={{ position: "relative", width, height, mx: "auto" }} role="img" aria-label={`Calendar heatmap across ${layout.cells.length} days`}>
              {layout.cells.map((item) => {
                const value = finiteNumber(item.row?.requests, 0);
                const intensity = max > 0 ? value / max : 0;
                const isActive = item.row?.day === activeDay;
                const distance = hovered === null ? 99 : Math.abs(item.index - hovered);
                const fisheye = level === "full" && distance <= 2 ? 1 + (3 - distance) * .035 : 1;
                return (
                  <Box
                    component={motion.button}
                    key={item.row.day || item.index}
                    type="button"
                    aria-label={`${formatDay(item.row.day)}: ${formatCompact(value)} requests`}
                    title={`${formatDay(item.row.day)} · ${formatCompact(value)} requests`}
                    onFocus={() => onActiveDay?.(item.row?.day || null)}
                    onPointerEnter={() => { setHovered(item.index); onActiveDay?.(item.row?.day || null); }}
                    onPointerLeave={() => setHovered(null)}
                    initial={level === "full" ? { opacity: 0, scale: .78 } : false}
                    animate={{ opacity: 1, scale: fisheye }}
                    transition={level === "full" ? { type: "spring", stiffness: 420, damping: 30, delay: Math.min(.35, (item.week + item.weekday) * .008) } : { duration: 0 }}
                    sx={{
                      appearance: "none",
                      border: isActive ? "2px solid var(--an-gold)" : "1px solid color-mix(in oklch,var(--an-primary) 9%,var(--an-border))",
                      p: 0,
                      position: "absolute",
                      left: item.week * (cell + gap),
                      top: item.weekday * (cell + gap),
                      width: cell,
                      height: cell,
                      minWidth: 0,
                      borderRadius: Math.max(3, cell * .28),
                      cursor: "pointer",
                      background: value === 0 ? "var(--an-surface-soft)" : `color-mix(in oklch,var(--an-primary) ${Math.round(14 + intensity * 72)}%,var(--an-surface))`,
                      transformOrigin: "center",
                      "&:focus-visible": { outline: "2px solid var(--an-primary)", outlineOffset: 2, zIndex: 2 },
                    }}
                  />
                );
              })}
            </Box>
            <Box sx={{ mt: 1.15, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: .5 }}><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>Less</Typography>{[0, 22, 42, 62, 82].map((amount) => <Box key={amount} sx={{ width: 13, height: 13, borderRadius: .7, border: "1px solid var(--an-border)", background: amount === 0 ? "var(--an-surface-soft)" : `color-mix(in oklch,var(--an-primary) ${amount}%,var(--an-surface))` }} />)}<Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>More</Typography></Box>
          </Box>
        </Box>
      )}
    </AnalyticsSurface>
  );
}

function semanticColor(name) {
  if (name === "success") return "var(--an-success)";
  if (name === "warning") return "var(--an-warning)";
  if (name === "danger") return "var(--an-danger)";
  return "var(--an-primary-fg)";
}

function quotaRampColor(percent) {
  const ramp = thresholdColorInterpolation(percent);
  const from = semanticColor(ramp.from);
  const to = semanticColor(ramp.to);
  if (ramp.from === ramp.to) return from;
  const mix = Math.max(0, Math.min(100, ramp.mix));
  return `color-mix(in oklch, ${from} ${100 - mix}%, ${to} ${mix}%)`;
}

function QuotaRing({ percent }) {
  const { level } = useAnalyticsMotion();
  const safe = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  const color = percent === null ? "var(--an-primary-fg)" : quotaRampColor(percent);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return (
    <Box sx={{ width: 150, height: 150, position: "relative", display: "grid", placeItems: "center" }}>
      <Box component="svg" viewBox="0 0 100 100" aria-hidden="true" sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
        {Array.from({ length: 20 }, (_, index) => {
          const angle = (index / 20) * Math.PI * 2;
          return <line key={index} x1={50 + Math.cos(angle) * 34} y1={50 + Math.sin(angle) * 34} x2={50 + Math.cos(angle) * 37} y2={50 + Math.sin(angle) * 37} stroke="var(--an-border-strong)" strokeWidth=".8" />;
        })}
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--an-border)" strokeWidth="8" />
        {percent !== null && <motion.circle cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} animate={{ strokeDashoffset: circumference * (1 - safe / 100) }} initial={level === "full" ? { strokeDashoffset: circumference } : false} transition={level === "full" ? { type: "spring", stiffness: 180, damping: 24 } : { duration: 0 }} />}
      </Box>
      <Box sx={{ textAlign: "center" }}>{percent === null ? <AllInclusiveRoundedIcon sx={{ fontSize: 34, color: "var(--an-primary-fg)" }} /> : <Typography sx={{ fontSize: 28, fontWeight: 920, color, letterSpacing: "-.04em", fontVariantNumeric: "tabular-nums" }}><OdometerNumber value={safe} formatter={(number) => `${Math.round(number)}%`} /></Typography>}<Typography variant="caption" sx={{ mt: .3, display: "block", color: "var(--an-text-3)" }}>{percent === null ? "Unlimited" : "used"}</Typography></Box>
    </Box>
  );
}

export function QuotaPanel({ usage, plan }) {
  const { level } = useAnalyticsMotion();
  const [tableView, setTableView] = useState(false);
  const quotaRef = useRef(null);
  const ambientEnabled = useAmbientSlot(quotaRef, true);
  const used = finiteNumber(usage?.used, 0);
  const limit = usage?.limit === null || usage?.limit === undefined ? null : finiteNumber(usage.limit, 0);
  const remaining = limit === null ? null : Math.max(0, finiteNumber(usage?.remaining, limit - used));
  const percent = quotaPercent(used, limit);
  const projection = paceProjection(usage);
  const projectedPercent = projection !== null && limit && limit > 0 ? Math.min(100, (projection / limit) * 100) : null;

  return (
    <AnalyticsSurface ref={quotaRef} sx={{ p: { xs: 1.6, sm: 2 }, minHeight: 330, boxShadow: ambientEnabled && level === "full" && percent !== null && percent < 50 ? "var(--an-shadow-1), 0 20px 56px color-mix(in oklch,var(--an-success) 10%,transparent)" : "var(--an-shadow-1)" }} accent={percent === null ? "var(--an-primary-fg)" : quotaRampColor(percent)} interactive>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}><Box><Typography sx={{ fontSize: 15.5, fontWeight: 850, letterSpacing: "-.02em", color: "var(--an-text)" }}>Monthly quota</Typography><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>{plan?.name ? `${plan.name} plan` : "Workspace usage"}{usage?.month ? ` · ${usage.month}` : ""}</Typography></Box><Box sx={{ display: "flex", alignItems: "center", gap: .5 }}><Button size="small" startIcon={tableView ? <ShowChartRoundedIcon /> : <TableRowsRoundedIcon />} onClick={() => setTableView((value) => !value)} sx={{ minHeight: 38, borderRadius: 1.6, textTransform: "none", fontSize: 10.5, fontWeight: 740, color: "var(--an-text-2)", border: "1px solid var(--an-border)" }}>{tableView ? "View gauge" : "View as table"}</Button><SpeedRoundedIcon sx={{ fontSize: 20, color: percent === null ? "var(--an-primary-fg)" : quotaRampColor(percent) }} /></Box></Box>

      {tableView ? (
        <Box sx={{ mt: 1.4, overflowX: "auto", border: "1px solid var(--an-border)", borderRadius: 2 }}>
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", minWidth: 360, "& th,& td": { p: .85, borderBottom: "1px solid var(--an-border)", textAlign: "left", fontSize: 11.5, color: "var(--an-text-2)" }, "& th": { color: "var(--an-text)", fontWeight: 800, background: "var(--an-surface-soft)" }, "& tr:last-child td": { borderBottom: 0 } }}><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody><tr><td>Used</td><td>{formatCompact(used)}</td></tr><tr><td>Limit</td><td>{limit === null ? "Unlimited" : formatCompact(limit)}</td></tr><tr><td>Remaining</td><td>{remaining === null ? "Unlimited" : formatCompact(remaining)}</td></tr><tr><td>Usage</td><td>{percent === null ? "Unlimited" : `${Math.round(percent)}%`}</td></tr>{projection !== null && <tr><td>At current pace · estimated</td><td>{formatCompact(projection)}</td></tr>}</tbody></Box>
        </Box>
      ) : (
      <Box sx={{ mt: 1.3, display: "grid", gridTemplateColumns: { xs: "auto 1fr", lg: "1fr" }, alignItems: "center", justifyItems: { lg: "center" }, gap: 1.1 }}>
        <QuotaRing percent={percent} />
        <Box sx={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: .75 }}>
          <Box sx={{ p: 1, borderRadius: 1.8, border: "1px solid var(--an-border)", background: "var(--an-surface-soft)" }}><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>Used</Typography><Typography sx={{ mt: .2, fontSize: 18, fontWeight: 880, color: "var(--an-text)", fontVariantNumeric: "tabular-nums" }}>{formatCompact(used)}</Typography></Box>
          <Box sx={{ p: 1, borderRadius: 1.8, border: "1px solid var(--an-border)", background: "var(--an-surface-soft)" }}><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>{limit === null ? "Limit" : "Remaining"}</Typography><Typography sx={{ mt: .2, fontSize: 18, fontWeight: 880, color: "var(--an-text)", fontVariantNumeric: "tabular-nums" }}>{limit === null ? "Unlimited" : formatCompact(remaining)}</Typography></Box>
        </Box>
      </Box>
      )}

      {projection !== null && (
        <Box sx={{ mt: 1.25, p: 1.05, borderRadius: 1.8, border: "1px solid var(--an-border)", background: "var(--an-surface-soft)" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>At current pace · estimated</Typography><Typography variant="caption" sx={{ color: "var(--an-text)", fontWeight: 820, fontVariantNumeric: "tabular-nums" }}>{formatCompact(projection)} projected</Typography></Box>
          {limit !== null && projectedPercent !== null && <Box sx={{ mt: .65, height: 5, borderRadius: 99, position: "relative", overflow: "hidden", background: "var(--an-border)" }}><Box component={motion.div} sx={{ position: "absolute", inset: 0, width: `${projectedPercent}%`, borderRadius: 99, background: "repeating-linear-gradient(90deg,color-mix(in oklch,var(--an-primary) 65%,transparent) 0 6px,transparent 6px 11px)", backgroundSize: "17px 100%" }} animate={ambientEnabled && level === "full" ? { backgroundPositionX: ["0px", "17px"] } : undefined} transition={ambientEnabled && level === "full" ? { duration: 1.4, repeat: Infinity, ease: "linear" } : undefined} /></Box>}
        </Box>
      )}
    </AnalyticsSurface>
  );
}
