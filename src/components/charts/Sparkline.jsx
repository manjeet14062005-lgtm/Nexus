import { memo } from "react";
import { NEON } from "../../constants/theme";



export const Sparkline = memo(function Sparkline({ data, color = NEON.blue, width = 180, height = 50 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  }).join(" ");
  const area = `M0,${height} L${pts.split(" ").join(" L")} L${width},${height} Z`;
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`sg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color.replace("#", "")})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2"
        style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
    </svg>
  );
});

// Real-time pulse dot
