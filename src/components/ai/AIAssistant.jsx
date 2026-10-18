import { memo } from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, TextField, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { NEON } from "../../constants/theme";
import { STATES } from "../../constants/countryData";
import SendIcon from "@mui/icons-material/Send";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import { PulseDot } from "../common/PulseDot.jsx";



export const AIAssistant = memo(function AIAssistant({ submissions, open, onClose }) {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "👋 Hi! I'm your AI Data Assistant. Ask me anything about your registrations — growth trends, regional analysis, suspicious patterns, and more!", time: new Date().toLocaleTimeString() },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const analyze = useCallback(async (q) => {
    setThinking(true);
    await new Promise((r) => setTimeout(r, 900));

    const total = submissions.length;
    const ql = q.toLowerCase();
    let reply = "";

    const byState = STATES.map((s) => ({ state: s, count: submissions.filter((u) => u.state === s).length }))
      .filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
    const byGender = { male: 0, female: 0, other: 0 };
    submissions.forEach((u) => { if (u.gender) byGender[u.gender] = (byGender[u.gender] || 0) + 1; });
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const thisWeek = submissions.filter((u) => u.createdAt && new Date(u.createdAt) > weekAgo).length;
    const withPhone = submissions.filter((u) => u.phone).length;

    if (ql.includes("total") || ql.includes("how many")) {
      reply = `📊 You have **${total} total registrations**. This week: **${thisWeek} new users** joined. The growth rate is approximately ${total > 0 ? Math.round(thisWeek / total * 100) : 0}% weekly.`;
    } else if (ql.includes("suspicious") || ql.includes("fake") || ql.includes("spam")) {
      const noPhone = submissions.filter((u) => !u.phone).length;
      const noBio = submissions.filter((u) => !u.bio).length;
      reply = `🔍 Suspicious account analysis:\n• **${noPhone}** users have no phone number (${total > 0 ? Math.round(noPhone / total * 100) : 0}%)\n• **${noBio}** users have no bio\n• Recommendation: Consider requiring phone verification to reduce bot registrations.`;
    } else if (ql.includes("state") || ql.includes("region") || ql.includes("location") || ql.includes("where")) {
      reply = `🗺️ Top states by registration:\n${byState.slice(0, 5).map((s, i) => `${i + 1}. ${s.state}: **${s.count}** users`).join("\n")}\n\nTotal states represented: **${byState.length}** out of ${STATES.length}.`;
    } else if (ql.includes("gender")) {
      reply = `👥 Gender breakdown:\n• Male: **${byGender.male}** (${total > 0 ? Math.round(byGender.male / total * 100) : 0}%)\n• Female: **${byGender.female}** (${total > 0 ? Math.round(byGender.female / total * 100) : 0}%)\n• Other: **${byGender.other || 0}**`;
    } else if (ql.includes("growth") || ql.includes("trend") || ql.includes("predict")) {
      const projected = Math.round(thisWeek * 4.3);
      reply = `📈 Growth Analysis:\n• This week: **${thisWeek} users**\n• Projected monthly: **~${projected} users**\n• Projected annually: **~${projected * 12} users**\n\nTrend: ${thisWeek > 2 ? "🟢 Growing steadily" : "🟡 Slow growth — consider running campaigns"}`;
    } else if (ql.includes("phone") || ql.includes("contact") || ql.includes("verified")) {
      reply = `📞 Contact completeness:\n• Users with phone: **${withPhone}/${total}** (${total > 0 ? Math.round(withPhone / total * 100) : 0}%)\n• Users without phone: **${total - withPhone}**\n\nRecommendation: ${withPhone / total < 0.5 ? "Enable mandatory phone verification" : "Good phone coverage!"}`;
    } else if (ql.includes("summar") || ql.includes("report") || ql.includes("overview")) {
      reply = `📋 Platform Summary:\n• **${total}** total registrations\n• **${byState.length}** states represented\n• Top state: **${byState[0]?.state || "N/A"}** (${byState[0]?.count || 0} users)\n• This week: **${thisWeek} new users**\n• Phone verified: **${withPhone}** users\n• Data quality score: **${total > 0 ? Math.min(100, Math.round((withPhone / total * 50) + (byState.length / STATES.length * 50))) : 0}%**`;
    } else if (ql.includes("delhi") || ql.includes("mumbai") || ql.includes("bangalore") || ql.includes("chennai")) {
      const stateMap = { delhi: "Delhi", mumbai: "Maharashtra", bangalore: "Karnataka", chennai: "Tamil Nadu" };
      const key = Object.keys(stateMap).find((k) => ql.includes(k));
      const state = stateMap[key];
      const count = submissions.filter((u) => u.state === state).length;
      reply = `🏙️ Users from ${state}: **${count}** registrations (${total > 0 ? Math.round(count / total * 100) : 0}% of total)`;
    } else {
      reply = `🤖 I can help you analyze:\n• **"Show total users"** — Registration counts\n• **"Suspicious accounts"** — Bot/spam detection\n• **"State distribution"** — Regional breakdown\n• **"Gender stats"** — Gender analysis\n• **"Growth trends"** — Predictive analytics\n• **"Platform summary"** — Full overview\n\nTry one of these queries!`;
    }

    setThinking(false);
    setMessages((prev) => [...prev, { role: "assistant", text: reply, time: new Date().toLocaleTimeString() }]);
  }, [submissions]);

  const send = () => {
    if (!input.trim()) return;
    const q = input.trim();
    setMessages((prev) => [...prev, { role: "user", text: q, time: new Date().toLocaleTimeString() }]);
    setInput("");
    analyze(q);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { background: "#ffffff", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 3, height: "80vh" } }}>
      <DialogTitle sx={{ pb: 1, borderBottom: "1px solid rgba(99,102,241,0.1)" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box sx={{ width: 36, height: 36, borderRadius: 2, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <SmartToyIcon sx={{ fontSize: 20, color: "#fff" }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>AI Data Assistant</Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <PulseDot color={NEON.green} size={6} />
              <Typography variant="caption" sx={{ color: NEON.green, fontSize: 10 }}>Online — {submissions.length} records loaded</Typography>
            </Box>
          </Box>
          <IconButton aria-label="Close AI assistant" onClick={onClose} sx={{ ml: "auto" }} size="small"><CloseIcon sx={{ fontSize: 16 }} /></IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", p: 0, overflow: "hidden" }}>
        <Box sx={{ flex: 1, overflowY: "auto", p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
          {messages.map((m, i) => (
            <Box key={i} sx={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <Box sx={{
                maxWidth: "82%", p: 1.5, borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: m.role === "user"
                  ? "#E9ECFF"
                  : "rgba(15,23,42,0.06)",
                border: m.role === "user" ? "none" : "1px solid rgba(99,102,241,0.1)",
              }}>
                <Typography variant="body2" sx={{ fontSize: 12, lineHeight: 1.6, color: "text.primary", whiteSpace: "pre-line" }}>
                  {m.text.replace(/\*\*(.*?)\*\*/g, "$1")}
                </Typography>
                <Typography variant="caption" sx={{ fontSize: 9, opacity: 0.5, display: "block", mt: 0.3, textAlign: m.role === "user" ? "right" : "left" }}>
                  {m.time}
                </Typography>
              </Box>
            </Box>
          ))}
          {thinking && (
            <Box sx={{ display: "flex", gap: 0.5, p: 1.5, width: 60, background: "rgba(15,23,42,0.06)", borderRadius: 2 }}>
              {[0.1, 0.25, 0.4].map((d) => (
                <Box key={d} sx={{ width: 6, height: 6, borderRadius: "50%", background: NEON.blue, animation: "bounce 1.2s infinite", animationDelay: `${d}s`, "@keyframes bounce": { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-5px)" } } }} />
              ))}
            </Box>
          )}
          <div ref={bottomRef} />
        </Box>

        <Box sx={{ p: 2, borderTop: "1px solid rgba(99,102,241,0.1)", display: "flex", gap: 1 }}>
          <TextField
            fullWidth size="small" placeholder="Ask about your data..."
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5, background: "rgba(15,23,42,0.04)", "& fieldset": { borderColor: "rgba(99,102,241,0.2)" }, "&:hover fieldset": { borderColor: NEON.blue } } }}
          />
          <IconButton aria-label="Send message" onClick={send} disabled={!input.trim()}
            sx={{ background: input.trim() ? "#E9ECFF" : "rgba(15,23,42,0.05)", color: input.trim() ? "#fff" : "#555", borderRadius: 2 }}>
            <SendIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </DialogContent>
    </Dialog>
  );
});
