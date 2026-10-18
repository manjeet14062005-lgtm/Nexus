// AccountSurface.jsx — Injects OBSIDIAN AURORA CSS variables for the Account scope.
// Use once at the Account page root. Does not render DOM output.

import { useEffect } from "react";

// Light mode OBSIDIAN AURORA tokens
const LIGHT_VARS = {
  "--acct-canvas":        "#F5F7FA",
  "--acct-surface":       "#FFFFFF",
  "--acct-surface-raised":"#F1F5F9",
  "--acct-border":        "#DCE3EB",
  "--acct-text":          "#0F172A",
  "--acct-muted":         "#64748B",
  "--acct-brand":         "#315D86",
  "--acct-aurora":        "#087E8B",
  "--acct-gold":          "#A45A07",
  "--acct-success":       "#087F5B",
  "--acct-warning":       "#A45A07",
  "--acct-danger":        "#C63650",
  "--acct-surface-glass": "rgba(255,255,255,0.82)",
  "--acct-ring":          "rgba(49,93,134,0.18)",
};

const INJECTED_ID = "acct-aurora-vars";

export function AccountSurface() {
  useEffect(() => {
    if (document.getElementById(INJECTED_ID)) return;

    const style = document.createElement("style");
    style.id = INJECTED_ID;
    const vars = Object.entries(LIGHT_VARS)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join("\n");
    style.textContent = `
:root {
${vars}
}

.acct .MuiButton-textPrimary, .acct .MuiButton-outlinedPrimary { color:#315D86; }
.acct .MuiSwitch-switchBase.Mui-checked { color:#315D86; }
.acct .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track { background:#315D86; }
.acct .MuiOutlinedInput-root.Mui-focused fieldset { border-color:#315D86; }
.acct .MuiButton-containedPrimary { background:#315D86; box-shadow:none; }
.acct .MuiButton-containedPrimary:hover { background:#254967; }
.acct .MuiButton-containedPrimary.Mui-disabled { background:#e3e8ee; color:#788697; }
.acct-eyebrow { font-size:10px!important; letter-spacing:0.16em!important; text-transform:uppercase; color:#64748b; margin-bottom:12px!important; }
.acct-identity { display:flex; align-items:center; gap:24px; flex-wrap:wrap; background:linear-gradient(120deg,#fff,#edf3f9)!important; }
@media (max-width:899px) { .acct nav[aria-label="Account navigation"] { flex-wrap:wrap; overflow-x:visible; } .acct-identity { flex-direction:column; align-items:flex-start; } .acct-identity > div { width:100%; flex:none; } .acct-identity > div:first-child { width:88px; } }
.acct-timeline-item { display:flex; gap:16px; padding:20px 0; border-bottom:1px solid #e5eaf0; }
.acct-timeline-dot { width:9px; height:9px; margin-top:7px; border-radius:50%; background:#315d86; flex-shrink:0; }
.acct-surface {
  background: var(--acct-surface);
  border: 1px solid var(--acct-border);
  border-radius: 16px;
}

.acct-surface-raised {
  background: var(--acct-surface-raised);
  border: 1px solid var(--acct-border);
  border-radius: 12px;
}

.acct-nav-active {
  background: color-mix(in oklch, var(--acct-brand) 10%, transparent);
  color: var(--acct-brand);
  font-weight: 600;
}
`;
    document.head.appendChild(style);

    return () => {
      document.getElementById(INJECTED_ID)?.remove();
    };
  }, []);

  return null;
}
