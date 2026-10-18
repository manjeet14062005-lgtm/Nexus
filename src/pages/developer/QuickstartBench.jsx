import { useState } from "react";
import { Button } from "@mui/material";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import { toast } from "react-hot-toast";
import { OTP_SERVER_URL } from "../../core/appConstants.js";

export const ENDPOINTS = [
  { id: "create", method: "POST", path: "/v1/verifications", title: "Create a verification", description: "Start an email verification for a customer.", body: { method: "email", external_user_id: "customer_123", email: "customer@example.com" } },
  { id: "verify", method: "POST", path: "/v1/verifications/VERIFICATION_ID/verify", title: "Confirm the code", description: "Replace VERIFICATION_ID with the ID returned by the create endpoint.", body: { code: "123456" } },
  { id: "get", method: "GET", path: "/v1/verifications/VERIFICATION_ID", title: "Read verification status", description: "Retrieve a verification using the same environment as its original request." },
  { id: "usage", method: "GET", path: "/v1/usage", title: "Check workspace usage", description: "Retrieve usage for the current month." },
];
export function buildSnippet(endpoint, language, base = OTP_SERVER_URL) {
  const url = `${base.replace(/\/$/, "")}${endpoint.path}`;
  const body = endpoint.body ? JSON.stringify(endpoint.body, null, 2) : "";
  if (language === "curl") return `curl -X ${endpoint.method} '${url}' \\\n  -H 'Authorization: Bearer nx_test_YOUR_KEY'${body ? ` \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(endpoint.body)}'` : ""}`;
  if (language === "python") return `import os\nimport requests\n\nresponse = requests.${endpoint.method.toLowerCase()}(\n    "${url}",\n    headers={"Authorization": f"Bearer {os.environ['NEXUS_API_KEY']}"},${body ? `\n    json=${JSON.stringify(endpoint.body, null, 4)},` : ""}\n    timeout=30,\n)\nresponse.raise_for_status()\nprint(response.json())`;
  return `// Run on your server. Keep your API key out of browser code.\nconst response = await fetch('${url}', {\n  method: '${endpoint.method}',\n  headers: {\n    Authorization: 'Bearer ' + process.env.NEXUS_API_KEY,${body ? "\n    'Content-Type': 'application/json'," : ""}\n  },${body ? `\n  body: JSON.stringify(${body.replace(/\n/g, "\n  ")}),` : ""}\n});\nif (!response.ok) throw new Error(await response.text());\nconst data = await response.json();`;
}
export function QuickstartBench() {
  const [language, setLanguage] = useState("curl"); const [selected, setSelected] = useState("create");
  const endpoint = ENDPOINTS.find(row => row.id === selected);
  const code = buildSnippet(endpoint, language);
  async function copy() { try { await navigator.clipboard.writeText(code); toast.success("Example copied."); } catch (_) { toast.error("Clipboard unavailable. Select and copy the example manually."); } }
  return <div className="dev-workbench"><aside className="dev-endpoint-nav"><div className="dev-kicker">API REFERENCE / V1</div><h2>Ship your first<br /> integration.</h2><p>Real endpoints. Server-side examples. Start with a test key.</p>{ENDPOINTS.map(row => <button key={row.id} aria-pressed={selected === row.id} onClick={() => setSelected(row.id)}><span className="dev-method">{row.method}</span>{row.title}</button>)}<div className="dev-note">Test requests use code <code>123456</code> and do not consume production verification quota.</div></aside><section className="dev-code-panel"><div className="dev-code-toolbar"><div className="dev-code-dots"><i /><i /><i /></div><div className="dev-code-languages" aria-label="Example language">{[["curl", "cURL"], ["javascript", "Node.js"], ["python", "Python"]].map(([id, label]) => <button key={id} aria-pressed={language === id} onClick={() => setLanguage(id)}>{label}</button>)}</div><Button size="small" aria-label="Copy code example" startIcon={<ContentCopyRounded />} onClick={copy}>Copy</Button></div><div className="dev-code-heading"><span>{endpoint.method}</span><code>{endpoint.path}</code></div><pre>{code}</pre><div className="dev-code-footer"><span>SERVER-SIDE ONLY</span><span>Placeholder key · no requests executed</span></div></section><div className="dev-workbench-caption"><strong>{endpoint.title}</strong><p>{endpoint.description} Use a key with {endpoint.method === "GET" ? "verification:read" : "verification:write"} permission.</p></div></div>;
}
