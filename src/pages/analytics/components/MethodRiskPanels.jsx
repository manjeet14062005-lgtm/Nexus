import React from "react";
import { Box, Button, Typography } from "@mui/material";
import AlternateEmailRoundedIcon from "@mui/icons-material/AlternateEmailRounded";
import PhoneIphoneRoundedIcon from "@mui/icons-material/PhoneIphoneRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import TableRowsRoundedIcon from "@mui/icons-material/TableRowsRounded";
import { motion } from "motion/react";
import { AnalyticsSurface } from "./AnalyticsSurface.jsx";
import { finiteNumber, formatCompact, formatPercent, methodVerificationRate, normalizeBreakdown } from "../utils.js";
import { useAnalyticsMotion } from "../motion/AnalyticsMotionProvider.jsx";

function MethodRow({ icon, label, volume, rate, color }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 2.2, border: "1px solid var(--an-border)", background: "var(--an-surface-soft)" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box sx={{ width: 34, height: 34, borderRadius: 1.7, display: "grid", placeItems: "center", color, background: `color-mix(in oklch, ${color} 8%, transparent)`, border: `1px solid color-mix(in oklch, ${color} 14%, transparent)` }}>{icon}</Box>
        <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontSize: 12.5, fontWeight: 820, color: "var(--an-text)" }}>{label}</Typography><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>{formatCompact(volume)} requests</Typography></Box>
        <Box sx={{ textAlign: "right" }}><Typography sx={{ fontSize: 18, lineHeight: 1, fontWeight: 880, color: "var(--an-text)", fontVariantNumeric: "tabular-nums" }}>{formatPercent(rate, 1)}</Typography><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>verification rate</Typography></Box>
      </Box>
    </Box>
  );
}

export function MethodPanel({ totals }) {
  const emailRate = methodVerificationRate(totals, "email");
  const phoneRate = methodVerificationRate(totals, "phone");
  const emailVolume = finiteNumber(totals?.emailRequests, 0);
  const phoneVolume = finiteNumber(totals?.phoneRequests, 0);
  const totalVolume = emailVolume + phoneVolume;

  return (
    <AnalyticsSurface sx={{ p: { xs: 1.6, sm: 2 } }} accent="var(--an-primary-2)" interactive>
      <Box sx={{ mb: 1.5 }}><Typography sx={{ fontSize: 15.5, fontWeight: 850, letterSpacing: "-.02em", color: "var(--an-text)" }}>Email vs phone</Typography><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>Method rates are derived from verified ÷ (verified + failed + expired).</Typography></Box>
      <Box sx={{ display: "grid", gap: 1 }}><MethodRow icon={<AlternateEmailRoundedIcon sx={{ fontSize: 18 }} />} label="Email" volume={emailVolume} rate={emailRate} color="var(--an-primary-2)" /><MethodRow icon={<PhoneIphoneRoundedIcon sx={{ fontSize: 18 }} />} label="Phone" volume={phoneVolume} rate={phoneRate} color="var(--an-aurora)" /></Box>
      <Box sx={{ mt: 1.5, display: "flex", height: 8, overflow: "hidden", borderRadius: 99, background: "var(--an-surface-soft)" }} aria-label={totalVolume > 0 ? `Email ${formatPercent((emailVolume / totalVolume) * 100, 1)}, phone ${formatPercent((phoneVolume / totalVolume) * 100, 1)}` : "No method volume available"}>
        {totalVolume > 0 && <Box sx={{ width: `${(emailVolume / totalVolume) * 100}%`, minWidth: emailVolume > 0 ? 3 : 0, background: "var(--an-primary-2)" }} />}
        {totalVolume > 0 && <Box sx={{ width: `${(phoneVolume / totalVolume) * 100}%`, minWidth: phoneVolume > 0 ? 3 : 0, background: "var(--an-aurora)" }} />}
      </Box>
    </AnalyticsSurface>
  );
}

function RiskDistribution({ breakdown, tableView }) {
  const { level } = useAnalyticsMotion();
  const rows = normalizeBreakdown(breakdown);
  const ordered = ["Low", "Medium", "High"].map((label) => rows.find((row) => row.label.toLowerCase() === label.toLowerCase()) || { label, value: 0 });
  const total = ordered.reduce((sum, row) => sum + row.value, 0);
  const colors = { Low: "var(--an-success)", Medium: "var(--an-warning)", High: "var(--an-danger)" };

  if (tableView) {
    return (
      <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", "& th,& td": { p: .75, borderBottom: "1px solid var(--an-border)", textAlign: "left", fontSize: 11.5, color: "var(--an-text-2)" }, "& th": { color: "var(--an-text)", fontWeight: 800 } }}>
        <thead><tr><th>Risk bucket</th><th>Requests</th><th>Share</th></tr></thead>
        <tbody>{ordered.map((row) => <tr key={row.label}><td>{row.label}</td><td>{formatCompact(row.value)}</td><td>{formatPercent(total > 0 ? (row.value / total) * 100 : null, 1)}</td></tr>)}</tbody>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", background: "var(--an-surface-soft)", border: "1px solid var(--an-border)" }} role="img" aria-label={total > 0 ? ordered.map((row) => `${row.label} ${formatPercent((row.value / total) * 100, 1)}`).join(", ") : "No risk distribution data"}>
        {ordered.map((row, index) => <Box component={motion.div} key={row.label} initial={level === "full" ? { scaleX: 0 } : false} animate={{ scaleX: 1 }} transition={level === "full" ? { type: "spring", stiffness: 280, damping: 28, delay: index * .06 } : { duration: 0 }} sx={{ width: total > 0 ? `${(row.value / total) * 100}%` : 0, background: colors[row.label], minWidth: row.value > 0 ? 2 : 0, transformOrigin: "left" }} />)}
      </Box>
      <Box sx={{ mt: .85, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: .5 }}>{ordered.map((row) => <Box key={row.label}><Box sx={{ display: "flex", alignItems: "center", gap: .5 }}><Box sx={{ width: 6, height: 6, borderRadius: "50%", background: colors[row.label] }} /><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>{row.label}</Typography></Box><Typography sx={{ mt: .1, fontSize: 14, fontWeight: 850, color: "var(--an-text)", fontVariantNumeric: "tabular-nums" }}>{formatCompact(row.value)}</Typography></Box>)}</Box>
      {total === 0 && <Typography variant="caption" sx={{ mt: .8, display: "block", color: "var(--an-text-3)" }}>No risk detail rows are available for this selection.</Typography>}
    </Box>
  );
}

export function RiskPanel({ analytics }) {
  const { level } = useAnalyticsMotion();
  const [tableView, setTableView] = React.useState(false);
  const totals = analytics?.totals || {};
  const signals = normalizeBreakdown(analytics?.topRiskSignals).slice(0, 10);
  const maxSignal = Math.max(1, ...signals.map((row) => row.value));

  return (
    <AnalyticsSurface sx={{ p: { xs: 1.6, sm: 2 } }} accent="var(--an-danger)" interactive>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5, mb: 1.5 }}>
        <Box><Typography sx={{ fontSize: 15.5, fontWeight: 850, letterSpacing: "-.02em", color: "var(--an-text)" }}>Risk intelligence</Typography><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>Distribution and ranked signals from available detail rows.</Typography></Box>
        <Box sx={{ display: "flex", gap: .5 }}><Button size="small" startIcon={<TableRowsRoundedIcon />} onClick={() => setTableView((value) => !value)} sx={{ minHeight: 38, borderRadius: 1.6, textTransform: "none", fontSize: 10.5, fontWeight: 740, color: "var(--an-text-2)", border: "1px solid var(--an-border)" }}>{tableView ? "View bars" : "View as table"}</Button><Box sx={{ width: 34, height: 34, borderRadius: 1.8, display: "grid", placeItems: "center", color: "var(--an-danger)", background: "color-mix(in oklch,var(--an-danger) 8%,transparent)" }}><ShieldRoundedIcon sx={{ fontSize: 18 }} /></Box></Box>
      </Box>

      <RiskDistribution breakdown={analytics?.riskBreakdown} tableView={tableView} />

      <Box sx={{ mt: 1.65, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
        <Box sx={{ p: 1.25, borderRadius: 1.9, border: "1px solid var(--an-border)", background: "var(--an-surface-soft)" }}><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>High-risk rate</Typography><Typography sx={{ mt: .25, fontSize: 20, fontWeight: 880, color: "var(--an-text)", fontVariantNumeric: "tabular-nums" }}>{formatPercent(totals.highRiskRate, 1)}</Typography><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>{formatCompact(totals.highRisk)} requests</Typography></Box>
        <Box sx={{ p: 1.25, borderRadius: 1.9, border: "1px solid var(--an-border)", background: "var(--an-surface-soft)" }}><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>Disposable rate</Typography><Typography sx={{ mt: .25, fontSize: 20, fontWeight: 880, color: "var(--an-text)", fontVariantNumeric: "tabular-nums" }}>{formatPercent(totals.disposableRate, 1)}</Typography><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>{formatCompact(totals.disposable)} requests</Typography></Box>
      </Box>

      <Box sx={{ mt: 1.8 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: .65, mb: .9 }}><WarningAmberRoundedIcon sx={{ fontSize: 16, color: "var(--an-warning)" }} /><Typography sx={{ fontSize: 11.5, fontWeight: 820, color: "var(--an-text)" }}>Top risk signals</Typography></Box>
        {signals.length === 0 ? <Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>No ranked risk signals are available.</Typography> : (
          <Box sx={{ display: "grid", gap: .75 }}>{signals.map((signal, index) => <Box key={`${signal.label}-${index}`}><Box sx={{ mb: .35, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}><Typography variant="caption" sx={{ color: "var(--an-text-2)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{index + 1}. {signal.label}</Typography><Typography variant="caption" sx={{ color: "var(--an-text)", fontWeight: 820, fontVariantNumeric: "tabular-nums" }}>{formatCompact(signal.value)}</Typography></Box><Box sx={{ height: 5, borderRadius: 99, overflow: "hidden", background: "var(--an-surface-soft)" }}><Box component={motion.div} initial={level === "full" ? { scaleX: 0 } : false} animate={{ scaleX: 1 }} transition={level === "full" ? { type: "spring", stiffness: 300, damping: 30, delay: index * .04 } : { duration: 0 }} sx={{ height: "100%", width: `${(signal.value / maxSignal) * 100}%`, borderRadius: 99, transformOrigin: "left", background: "linear-gradient(90deg,var(--an-warning),var(--an-danger))" }} /></Box></Box>)}</Box>
        )}
      </Box>
    </AnalyticsSurface>
  );
}
