import { Box } from "@mui/material";



export function ConfettiBurst() {
  const pieces = Array.from({ length: 48 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 1.2,
    dur: 1.5 + Math.random() * 1.2,
    size: 6 + Math.random() * 8,
    color: ["#6366F1","#8B5CF6","#10B981","#EF4444","#ffd700","#06B6D4","#f093fb"][Math.floor(Math.random()*7)],
    rot: Math.random() * 360,
  }));
  return (
    <Box sx={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999, overflow: "hidden" }}>
      {pieces.map((p) => (
        <Box key={p.id} sx={{
          position: "absolute", left: `${p.x}%`, top: "-20px",
          width: p.size, height: p.size,
          background: p.color, borderRadius: Math.random() > 0.5 ? "50%" : "2px",
          transform: `rotate(${p.rot}deg)`,
          animation: `confettiFall ${p.dur}s ${p.delay}s ease-in forwards`,
          "@keyframes confettiFall": {
            "0%": { transform: `rotate(${p.rot}deg) translateY(0)`, opacity: 1 },
            "100%": { transform: `rotate(${p.rot + 360}deg) translateY(100vh)`, opacity: 0 },
          },
        }} />
      ))}
    </Box>
  );
}

// Tour tooltip
