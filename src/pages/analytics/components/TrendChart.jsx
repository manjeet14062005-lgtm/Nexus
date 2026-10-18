import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import TableRowsRoundedIcon from "@mui/icons-material/TableRowsRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import { motion } from "motion/react";
import { AnalyticsSurface } from "./AnalyticsSurface.jsx";
import { SERIES_STYLES } from "../tokens.js";
import {
  areaPath,
  brushRangeFromPixels,
  deriveSignalDays,
  findZScoreOutliers,
  finiteNumber,
  formatCompact,
  linearScale,
  monotonePath,
  niceTicks,
  normalizeBrushRange,
  resampleValues,
} from "../utils.js";
import { useAmbientSlot, useAnalyticsMotion } from "../motion/AnalyticsMotionProvider.jsx";

function formatDay(day, long = false) {
  if (!day) return "—";
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(day);
  return new Intl.DateTimeFormat(undefined, long ? { weekday: "short", month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" }).format(date);
}

function xTickIndices(length, count = 6) {
  if (length <= 1) return [0];
  const total = Math.min(count, length);
  const indexes = [];
  for (let index = 0; index < total; index += 1) indexes.push(Math.round((index / (total - 1)) * (length - 1)));
  return [...new Set(indexes)];
}

function Marker({ shape, x, y, color, size = 4 }) {
  if (shape === "square") return <rect x={x - size} y={y - size} width={size * 2} height={size * 2} rx="1" fill="var(--an-surface)" stroke={color} strokeWidth="2" />;
  if (shape === "diamond") return <rect x={x - size} y={y - size} width={size * 2} height={size * 2} rx="1" transform={`rotate(45 ${x} ${y})`} fill="var(--an-surface)" stroke={color} strokeWidth="2" />;
  if (shape === "triangle") return <path d={`M${x},${y - size - 1}L${x + size + 1},${y + size}L${x - size - 1},${y + size}Z`} fill="var(--an-surface)" stroke={color} strokeWidth="1.7" />;
  return <circle cx={x} cy={y} r={size} fill="var(--an-surface)" stroke={color} strokeWidth="2" />;
}

export function TrendChart({ series, activeDay, onActiveDay, selectedRange, onSelectedRange }) {
  const rows = useMemo(() => Array.isArray(series) ? series : [], [series]);
  const { level } = useAnalyticsMotion();
  const gradientId = useId().replace(/:/g, "");
  const containerRef = useRef(null);
  const ambientEnabled = useAmbientSlot(containerRef, true);
  const brushRef = useRef(null);
  const dragRef = useRef(null);
  const [width, setWidth] = useState(920);
  const [visible, setVisible] = useState({ requests: true, verified: true, failed: true, expired: false });
  const [tableView, setTableView] = useState(false);
  const [hoverIndex, setHoverIndex] = useState(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect?.width;
      if (Number.isFinite(next) && next > 0) setWidth(Math.max(320, next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const normalizedRange = useMemo(() => normalizeBrushRange(selectedRange, rows.length), [rows.length, selectedRange]);
  const viewStart = normalizedRange?.start ?? 0;
  const viewEnd = normalizedRange?.end ?? Math.max(0, rows.length - 1);
  const viewRows = rows.slice(viewStart, viewEnd + 1);

  const chart = useMemo(() => {
    const height = width < 560 ? 316 : 370;
    const margin = { top: 28, right: 20, bottom: 46, left: width < 480 ? 43 : 56 };
    const plotWidth = Math.max(1, width - margin.left - margin.right);
    const plotHeight = Math.max(1, height - margin.top - margin.bottom);
    const enabledKeys = Object.keys(SERIES_STYLES).filter((key) => visible[key]);
    const values = viewRows.flatMap((row) => enabledKeys.map((key) => finiteNumber(row?.[key], 0)));
    const yMax = Math.max(1, ...values, 0);
    const yTicks = niceTicks(0, yMax, 5);
    const tickMax = Math.max(1, ...yTicks);
    const x = linearScale([0, Math.max(1, viewRows.length - 1)], [margin.left, margin.left + plotWidth]);
    const y = linearScale([0, tickMax], [margin.top + plotHeight, margin.top]);
    const renderedX = linearScale([0, 95], [margin.left, margin.left + plotWidth]);
    const paths = {};
    enabledKeys.forEach((key) => {
      const sampled = resampleValues(viewRows.map((row) => row?.[key]), 96);
      const points = sampled.map((value, index) => ({ x: renderedX(index), y: y(value) }));
      paths[key] = { points, line: monotonePath(points), area: areaPath(points, margin.top + plotHeight) };
    });
    return { height, margin, plotWidth, plotHeight, enabledKeys, yTicks, x, y, paths, xTicks: xTickIndices(viewRows.length, width < 600 ? 4 : 6) };
  }, [viewRows, visible, width]);

  const outliers = useMemo(() => findZScoreOutliers(rows, "requests", 2).filter((item) => item.index >= viewStart && item.index <= viewEnd), [rows, viewEnd, viewStart]);
  const signalDays = useMemo(() => deriveSignalDays(viewRows), [viewRows]);
  const activeLocalIndex = activeDay ? viewRows.findIndex((row) => row?.day === activeDay) : -1;
  const effectiveIndex = hoverIndex !== null ? hoverIndex : activeLocalIndex >= 0 ? activeLocalIndex : Math.max(0, viewRows.length - 1);
  const activeRow = viewRows[effectiveIndex] || null;
  const activeX = activeRow ? chart.x(effectiveIndex) : null;
  const activeGlobalIndex = activeRow ? viewStart + effectiveIndex : -1;
  const previousRow = activeGlobalIndex > 0 ? rows[activeGlobalIndex - 1] : null;

  const setIndex = (index) => {
    if (!viewRows.length) return;
    const safe = Math.max(0, Math.min(viewRows.length - 1, index));
    onActiveDay?.(viewRows[safe]?.day || null);
  };

  const handlePointerMove = (event) => {
    if (!viewRows.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const relative = ((event.clientX - rect.left) / Math.max(1, rect.width)) * width;
    const ratio = (relative - chart.margin.left) / Math.max(1, chart.plotWidth);
    const index = Math.round(Math.max(0, Math.min(1, ratio)) * Math.max(0, viewRows.length - 1));
    setHoverIndex(index);
    onActiveDay?.(viewRows[index]?.day || null);
  };

  const handleKeyDown = (event) => {
    if (!viewRows.length) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onSelectedRange?.({ start: 0, end: Math.max(0, rows.length - 1) });
      return;
    }
    const current = activeLocalIndex >= 0 ? activeLocalIndex : viewRows.length - 1;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setIndex(current + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setIndex(current - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setIndex(viewRows.length - 1);
    }
  };

  const tooltipLeft = activeX === null ? 0 : Math.max(72, Math.min(width - 232, activeX + 12));
  const brushHeight = 74;
  const brushMargin = { left: chart.margin.left, right: chart.margin.right };
  const brushWidth = Math.max(1, width - brushMargin.left - brushMargin.right);
  const brushX = linearScale([0, Math.max(1, rows.length - 1)], [brushMargin.left, brushMargin.left + brushWidth]);
  const miniMax = Math.max(1, ...rows.map((row) => finiteNumber(row?.requests, 0)));
  const miniY = linearScale([0, miniMax], [brushHeight - 10, 10]);
  const miniPoints = rows.map((row, index) => ({ x: brushX(index), y: miniY(finiteNumber(row?.requests, 0)) }));
  const miniPath = monotonePath(miniPoints);
  const selectionLeft = rows.length ? brushX(viewStart) : brushMargin.left;
  const selectionRight = rows.length ? brushX(viewEnd) : brushMargin.left + brushWidth;

  const brushPosition = (event) => {
    const rect = brushRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const local = ((event.clientX - rect.left) / Math.max(1, rect.width)) * width;
    return Math.max(0, Math.min(brushWidth, local - brushMargin.left));
  };

  const startBrush = (event) => {
    if (!rows.length) return;
    const start = brushPosition(event);
    dragRef.current = { start };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const next = brushRangeFromPixels(start, start, brushWidth, rows.length);
    if (next) onSelectedRange?.(next);
  };

  const moveBrush = (event) => {
    if (!dragRef.current || !rows.length) return;
    const current = brushPosition(event);
    const next = brushRangeFromPixels(dragRef.current.start, current, brushWidth, rows.length);
    if (next) onSelectedRange?.(next);
  };

  const endBrush = () => { dragRef.current = null; };

  const resetZoom = () => onSelectedRange?.({ start: 0, end: Math.max(0, rows.length - 1) });

  return (
    <AnalyticsSurface sx={{ p: { xs: 1.5, sm: 2, lg: 2.3 }, boxShadow: "var(--an-shadow-2)" }} accent="var(--an-primary)" interactive>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2, flexWrap: "wrap", mb: 1.4 }}>
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 870, letterSpacing: "-.02em", color: "var(--an-text)" }}>Verification flow</Typography>
          <Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>Daily requests and outcomes. Outlier markers use a derived z-score &gt; 2.</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: .6, flexWrap: "wrap" }}>
          {(viewStart !== 0 || viewEnd !== Math.max(0, rows.length - 1)) && (
            <Button size="small" startIcon={<RestartAltRoundedIcon />} onClick={resetZoom} sx={{ minHeight: 44, borderRadius: 1.75, textTransform: "none", fontWeight: 760, color: "var(--an-text-2)", border: "1px solid var(--an-border)" }}>Reset zoom</Button>
          )}
          <Button size="small" startIcon={tableView ? <ShowChartRoundedIcon /> : <TableRowsRoundedIcon />} onClick={() => setTableView((current) => !current)} sx={{ minHeight: 44, borderRadius: 1.75, textTransform: "none", fontWeight: 760, color: "var(--an-text-2)", border: "1px solid var(--an-border)" }}>{tableView ? "View chart" : "View as table"}</Button>
        </Box>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: .65, flexWrap: "wrap", mb: 1.25 }}>
        {Object.entries(SERIES_STYLES).map(([key, style]) => (
          <Button
            key={key}
            size="small"
            onClick={() => setVisible((current) => ({ ...current, [key]: !current[key] }))}
            aria-pressed={Boolean(visible[key])}
            sx={{ minHeight: 44, px: 1.05, borderRadius: 99, textTransform: "none", fontSize: 11, fontWeight: 760, color: visible[key] ? "var(--an-text)" : "var(--an-text-3)", border: `1px solid ${visible[key] ? `color-mix(in oklch, ${style.color} 28%, transparent)` : "var(--an-border)"}`, background: visible[key] ? `color-mix(in oklch, ${style.color} 7%, transparent)` : "transparent", "&:focus-visible": { outline: "2px solid var(--an-primary)", outlineOffset: 2 } }}
          >
            <Box component="span" sx={{ width: 13, height: 8, mr: .65, position: "relative", display: "inline-block", "&::before": { content: '""', position: "absolute", left: 0, right: 0, top: "50%", borderTop: style.dash === "0" ? `2px solid ${style.color}` : `2px dashed ${style.color}` } }} />
            {style.label}
          </Button>
        ))}
      </Box>

      {tableView ? (
        <Box sx={{ maxHeight: 420, overflow: "auto", border: "1px solid var(--an-border)", borderRadius: 2 }}>
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", minWidth: 620, "& th, & td": { px: 1.4, py: 1, textAlign: "right", borderBottom: "1px solid var(--an-border)", fontSize: 11.5, color: "var(--an-text-2)", fontVariantNumeric: "tabular-nums" }, "& th": { position: "sticky", top: 0, zIndex: 1, background: "var(--an-surface)", color: "var(--an-text)", fontWeight: 800 }, "& th:first-of-type, & td:first-of-type": { textAlign: "left" } }}>
            <thead><tr><th>Day</th><th>Requests</th><th>Verified</th><th>Failed</th><th>Expired</th></tr></thead>
            <tbody>{viewRows.map((row) => <tr key={row.day}><td>{formatDay(row.day, true)}</td><td>{formatCompact(row.requests)}</td><td>{formatCompact(row.verified)}</td><td>{formatCompact(row.failed)}</td><td>{formatCompact(row.expired)}</td></tr>)}</tbody>
          </Box>
        </Box>
      ) : (
        <>
          <Box
            ref={containerRef}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoverIndex(null)}
            onDoubleClick={resetZoom}
            aria-label="Interactive verification trend chart. Use left and right arrow keys to inspect days. Drag the minimap below to zoom. Escape or double-click resets zoom."
            sx={{ position: "relative", width: "100%", outline: "none", "&:focus-visible": { borderRadius: 2, boxShadow: "0 0 0 3px var(--an-focus)" }, touchAction: "pan-y" }}
          >
            <svg width="100%" height={chart.height} viewBox={`0 0 ${width} ${chart.height}`} role="img" aria-label={`Daily analytics across ${viewRows.length} displayed days`}>
              <defs>
                <linearGradient id={`trendFill-${gradientId}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--an-primary)" stopOpacity=".19" /><stop offset="100%" stopColor="var(--an-primary)" stopOpacity="0" /></linearGradient>
                {chart.enabledKeys.map((key) => (
                  <linearGradient key={key} id={`trendStroke-${gradientId}-${key}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={SERIES_STYLES[key].color} stopOpacity=".72" /><stop offset="55%" stopColor={SERIES_STYLES[key].color} /><stop offset="100%" stopColor={SERIES_STYLES[key].color} stopOpacity=".84" /></linearGradient>
                ))}
                <filter id={`trendGlow-${gradientId}`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              </defs>

              {chart.yTicks.map((tick) => {
                const y = chart.y(tick);
                return <g key={tick}><line x1={chart.margin.left} x2={chart.margin.left + chart.plotWidth} y1={y} y2={y} stroke="var(--an-grid)" strokeWidth="1" strokeDasharray={tick === 0 ? "5 5" : "0"} /><text x={chart.margin.left - 9} y={y + 4} textAnchor="end" fill="var(--an-text-3)" fontSize="10" fontFamily="Inter, sans-serif">{formatCompact(tick)}</text></g>;
              })}

              {chart.xTicks.map((index) => <text key={`${viewRows[index]?.day}-${index}`} x={chart.x(index)} y={chart.height - 13} textAnchor={index === 0 ? "start" : index === viewRows.length - 1 ? "end" : "middle"} fill="var(--an-text-3)" fontSize="10" fontFamily="Inter, sans-serif">{formatDay(viewRows[index]?.day)}</text>)}

              {visible.requests && chart.paths.requests?.area && <motion.path d={chart.paths.requests.area} animate={{ d: chart.paths.requests.area }} fill={`url(#trendFill-${gradientId})`} transition={level === "full" ? { duration: .45, ease: [0.22, 1, .36, 1] } : { duration: 0 }} />}

              {chart.enabledKeys.map((key) => {
                const path = chart.paths[key]?.line;
                if (!path) return null;
                return (
                  <motion.path
                    key={key}
                    d={path}
                    animate={{ d: path, opacity: 1 }}
                    initial={level === "full" ? { pathLength: 0, opacity: .2 } : false}
                    fill="none"
                    stroke={`url(#trendStroke-${gradientId}-${key})`}
                    strokeWidth={key === "requests" ? 2.8 : 2.15}
                    strokeDasharray={SERIES_STYLES[key].dash}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter={key === "requests" ? `url(#trendGlow-${gradientId})` : undefined}
                    transition={level === "off" ? { duration: 0 } : level === "reduced" ? { duration: .15 } : { duration: .56, ease: [0.22, 1, .36, 1] }}
                  />
                );
              })}

              {visible.requests && outliers.map((outlier) => {
                const local = outlier.index - viewStart;
                return <g key={`${outlier.day}-${outlier.index}`}><circle cx={chart.x(local)} cy={chart.y(outlier.value)} r="5" fill="var(--an-surface)" stroke="var(--an-gold)" strokeWidth="2" /><circle cx={chart.x(local)} cy={chart.y(outlier.value)} r="1.8" fill="var(--an-gold)" /></g>;
              })}

              {width > 720 && signalDays.bestDay?.row?.day && (() => {
                const index = viewRows.findIndex((row) => row.day === signalDays.bestDay.row.day);
                if (index < 0) return null;
                const x = chart.x(index);
                const y = chart.y(finiteNumber(signalDays.bestDay.row.verified, 0));
                return <text x={x} y={Math.max(15, y - 12)} textAnchor="middle" fill="var(--an-success)" fontSize="9.5" fontWeight="700">best rate · derived</text>;
              })()}

              {width > 720 && signalDays.failureDay?.day && finiteNumber(signalDays.failureDay.failed, 0) > 0 && (() => {
                const index = viewRows.findIndex((row) => row.day === signalDays.failureDay.day);
                if (index < 0) return null;
                const x = chart.x(index);
                const y = chart.y(finiteNumber(signalDays.failureDay.failed, 0));
                return <text x={x} y={Math.max(15, y - 12)} textAnchor="middle" fill="var(--an-danger)" fontSize="9.5" fontWeight="700">most failures</text>;
              })()}

              {activeRow && activeX !== null && (
                <g pointerEvents="none">
                  <motion.line x1={activeX} x2={activeX} y1={chart.margin.top} y2={chart.margin.top + chart.plotHeight} stroke="var(--an-border-strong)" strokeDasharray="4 4" animate={{ x1: activeX, x2: activeX }} transition={level === "full" ? { type: "spring", stiffness: 420, damping: 32 } : { duration: 0 }} />
                  {chart.enabledKeys.map((key) => <Marker key={key} shape={SERIES_STYLES[key].marker} x={activeX} y={chart.y(finiteNumber(activeRow[key], 0))} color={SERIES_STYLES[key].color} />)}
                </g>
              )}

              {viewRows.length > 0 && visible.requests && (() => {
                const latestIndex = viewRows.length - 1;
                const cx = chart.x(latestIndex);
                const cy = chart.y(finiteNumber(viewRows[latestIndex].requests, 0));
                return <motion.circle cx={cx} cy={cy} r="4" fill="var(--an-primary)" animate={ambientEnabled ? { r: [3.7, 5.2, 3.7], opacity: [.78, 1, .78] } : { r: 4, opacity: 1 }} transition={ambientEnabled ? { duration: 2.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }} />;
              })()}
            </svg>

            {activeRow && (
              <Box component={motion.div} initial={level === "full" ? { opacity: 0, scale: .96, y: 3 } : false} animate={{ opacity: 1, scale: 1, y: 0 }} sx={{ position: "absolute", left: tooltipLeft, top: 12, width: 214, p: 1.15, pointerEvents: "none", borderRadius: 1.8, border: "1px solid var(--an-border-strong)", background: "color-mix(in oklch,var(--an-surface) 92%,transparent)", backdropFilter: "blur(14px)", boxShadow: "var(--an-shadow-2)" }}>
                <Typography sx={{ fontSize: 11.5, fontWeight: 850, color: "var(--an-text)" }}>{formatDay(activeRow.day, true)}</Typography>
                <Box sx={{ mt: .65, display: "grid", gap: .38 }}>
                  {chart.enabledKeys.map((key) => {
                    const current = finiteNumber(activeRow[key], 0);
                    const previous = previousRow ? finiteNumber(previousRow[key], 0) : null;
                    const delta = previous === null ? null : current - previous;
                    return (
                      <Box key={key} sx={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 1 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: .6 }}><Box sx={{ width: 10, height: 2, borderRadius: 99, background: SERIES_STYLES[key].color }} /><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>{SERIES_STYLES[key].label}</Typography></Box>
                        <Box sx={{ textAlign: "right" }}><Typography variant="caption" sx={{ color: "var(--an-text)", fontWeight: 820, fontVariantNumeric: "tabular-nums" }}>{formatCompact(current)}</Typography>{delta !== null && <Typography component="span" sx={{ ml: .45, fontSize: 9.5, color: delta > 0 ? "var(--an-text-2)" : "var(--an-text-3)", fontVariantNumeric: "tabular-nums" }}>{delta > 0 ? "+" : ""}{formatCompact(delta)}</Typography>}</Box>
                      </Box>
                    );
                  })}
                </Box>
                {outliers.some((outlier) => outlier.index === activeGlobalIndex) && <Typography variant="caption" sx={{ mt: .65, display: "block", color: "var(--an-gold-fg)", fontWeight: 800 }}>Statistical outlier · derived z-score &gt; 2</Typography>}
              </Box>
            )}
          </Box>

          <Box sx={{ mt: .6 }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: .45 }}>
              <Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>Drag to select a window · double-click or Esc to reset</Typography>
              <Typography variant="caption" sx={{ color: "var(--an-text-3)", fontFamily: '"JetBrains Mono",monospace' }}>{viewRows.length}/{rows.length} days</Typography>
            </Box>
            <Box
              ref={brushRef}
              onPointerDown={startBrush}
              onPointerMove={moveBrush}
              onPointerUp={endBrush}
              onPointerCancel={endBrush}
              onDoubleClick={resetZoom}
              sx={{ width: "100%", height: brushHeight, cursor: "crosshair", touchAction: "none", borderRadius: 1.8, border: "1px solid var(--an-border)", background: "var(--an-surface-soft)", overflow: "hidden", position: "relative" }}
              aria-label="Timeline range selector"
            >
              <svg width="100%" height={brushHeight} viewBox={`0 0 ${width} ${brushHeight}`} aria-hidden="true">
                <path d={miniPath} fill="none" stroke="var(--an-primary)" strokeWidth="1.6" opacity=".56" />
                <rect x={selectionLeft} y="5" width={Math.max(3, selectionRight - selectionLeft)} height={brushHeight - 10} rx="8" fill="color-mix(in oklch,var(--an-primary) 8%,transparent)" stroke="color-mix(in oklch,var(--an-primary) 34%,transparent)" />
                <motion.rect x={selectionLeft - 2} y="20" width="4" height={brushHeight - 40} rx="2" fill="var(--an-primary)" animate={{ x: selectionLeft - 2 }} transition={level === "full" ? { type: "spring", stiffness: 420, damping: 34 } : { duration: 0 }} />
                <motion.rect x={selectionRight - 2} y="20" width="4" height={brushHeight - 40} rx="2" fill="var(--an-primary)" animate={{ x: selectionRight - 2 }} transition={level === "full" ? { type: "spring", stiffness: 420, damping: 34 } : { duration: 0 }} />
              </svg>
            </Box>
          </Box>
        </>
      )}
    </AnalyticsSurface>
  );
}
