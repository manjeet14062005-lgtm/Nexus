import { useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import TableRowsRoundedIcon from "@mui/icons-material/TableRowsRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import { motion } from "motion/react";
import { AnalyticsSurface } from "./AnalyticsSurface.jsx";
import { finiteNumber, formatCompact, formatPercent, safeRate } from "../utils.js";
import { useAnalyticsMotion } from "../motion/AnalyticsMotionProvider.jsx";

const OUTCOMES = [
  { key: "verified", label: "Verified", color: "var(--an-success)", Icon: CheckCircleRoundedIcon },
  { key: "failed", label: "Failed", color: "var(--an-danger)", Icon: ErrorOutlineRoundedIcon },
  { key: "expired", label: "Expired", color: "var(--an-warning)", Icon: ScheduleRoundedIcon },
  { key: "pending", label: "Pending", color: "var(--an-primary)", Icon: HourglassTopRoundedIcon },
];

export function OutcomeBreakdown({ totals }) {
  const { level } = useAnalyticsMotion();
  const [tableView, setTableView] = useState(false);
  const total = OUTCOMES.reduce((sum, item) => sum + finiteNumber(totals?.[item.key], 0), 0);

  return (
    <AnalyticsSurface sx={{ p: { xs: 1.6, sm: 2 } }} accent="var(--an-success)" interactive>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.2, flexWrap: "wrap" }}>
        <Box><Typography sx={{ fontSize: 15.5, fontWeight: 860, letterSpacing: "-.02em", color: "var(--an-text)" }}>Outcome breakdown</Typography><Typography variant="caption" sx={{ mt: .2, display: "block", color: "var(--an-text-3)" }}>Proportional outcomes from the server totals for this selection.</Typography></Box>
        <Button size="small" startIcon={tableView ? <ShowChartRoundedIcon /> : <TableRowsRoundedIcon />} onClick={() => setTableView((value) => !value)} sx={{ minHeight: 38, borderRadius: 1.6, textTransform: "none", fontSize: 10.5, fontWeight: 740, color: "var(--an-text-2)", border: "1px solid var(--an-border)" }}>{tableView ? "View bars" : "View as table"}</Button>
      </Box>

      {tableView ? (
        <Box sx={{ mt: 1.5, overflowX: "auto", border: "1px solid var(--an-border)", borderRadius: 2 }}>
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", minWidth: 420, "& th,& td": { p: .9, borderBottom: "1px solid var(--an-border)", textAlign: "left", fontSize: 11.5, color: "var(--an-text-2)" }, "& th": { color: "var(--an-text)", fontWeight: 800, background: "var(--an-surface-soft)" }, "& tr:last-child td": { borderBottom: 0 } }}><thead><tr><th>Outcome</th><th>Count</th><th>Share</th></tr></thead><tbody>{OUTCOMES.map((item) => { const value = finiteNumber(totals?.[item.key], 0); return <tr key={item.key}><td>{item.label}</td><td>{formatCompact(value)}</td><td>{formatPercent(safeRate(value, total), 1)}</td></tr>; })}</tbody></Box>
        </Box>
      ) : (
      <Box sx={{ mt: 1.6, height: 14, p: .2, display: "flex", gap: .25, borderRadius: 99, overflow: "hidden", background: "var(--an-surface-soft)", border: "1px solid var(--an-border)" }} role="img" aria-label={total > 0 ? OUTCOMES.map((item) => `${item.label} ${formatPercent(safeRate(totals?.[item.key], total), 1)}`).join(", ") : "No outcome data"}>
        {OUTCOMES.map((item, index) => {
          const value = finiteNumber(totals?.[item.key], 0);
          const width = total > 0 ? (value / total) * 100 : 0;
          return (
            <Box
              component={motion.div}
              key={item.key}
              initial={level === "full" ? { scaleX: 0, opacity: .35 } : false}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={level === "full" ? { type: "spring", stiffness: 300, damping: 30, delay: index * .045 } : { duration: 0 }}
              sx={{ width: `${width}%`, minWidth: value > 0 ? 3 : 0, height: "100%", borderRadius: 99, transformOrigin: "left", background: item.color, position: "relative", overflow: "hidden", "&:hover": { transform: level === "full" ? "translateY(-1px)" : "none" } }}
            />
          );
        })}
      </Box>
      )}

      <Box sx={{ mt: 1.35, display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4,1fr)" }, gap: .75 }}>
        {OUTCOMES.map((item) => {
          const value = finiteNumber(totals?.[item.key], 0);
          const rate = safeRate(value, total);
          return (
            <Box key={item.key} sx={{ p: 1, borderRadius: 1.8, border: "1px solid var(--an-border)", background: "var(--an-surface-soft)" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: .55, color: item.color }}><item.Icon sx={{ fontSize: 14 }} /><Typography variant="caption" sx={{ color: "var(--an-text-3)", fontWeight: 740 }}>{item.label}</Typography></Box>
              <Typography sx={{ mt: .35, fontSize: 17, lineHeight: 1, fontWeight: 880, color: "var(--an-text)", fontVariantNumeric: "tabular-nums slashed-zero" }}>{formatCompact(value)}</Typography>
              <Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>{formatPercent(rate, 1)}</Typography>
            </Box>
          );
        })}
      </Box>
    </AnalyticsSurface>
  );
}
