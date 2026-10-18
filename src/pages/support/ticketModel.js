export const STATUSES = [["open","Open"],["pending_nexus","Waiting for Nexus"],["pending_customer","Waiting for customer"],["resolved","Resolved"],["closed","Closed"]];
export const PRIORITIES = [["low","Low"],["normal","Normal"],["high","High"],["urgent","Urgent"]];
export const CATEGORIES = [["technical","Integration"],["verification","Verification"],["billing","Billing"],["account","Account"],["feedback","Feedback"],["other","Other"]];
export const ARTICLES = [
  { id:"connect", category:"technical", title:"Make your first connection", description:"API keys, test requests, and the path to production.", answer:"Open Developer Portal and start with a test API key. Use the Quickstart examples to create a verification, then confirm its six-digit code. Test requests use 123456. Keep API keys on your server, outside browser code.", href:"/developer", action:"Open Developer Portal" },
  { id:"failed", category:"verification", title:"Investigate a failed verification", description:"Find the request, inspect its status, and collect context.", answer:"Find the request on Verification. Check its method, environment, status, and risk signals. For an API integration, compare the request ID with Developer Portal logs. Include the request ID and what you expected when opening a ticket.", href:"/verification", action:"Inspect verifications" },
  { id:"quota", category:"billing", title:"Understand workspace usage", description:"Allowances, test and live activity, and workspace plans.", answer:"Open Billing to review your workspace plan and allowance. Overview and Analytics show verification activity. Test verification requests do not consume production verification quota. Intelligence queries use a separate monthly allowance.", href:"/billing", action:"Review billing" },
  { id:"phone", category:"account", title:"Manage your verified phone", description:"Where to verify your number and why it stays locked.", answer:"Open Account → Profile to view your number. If your account has no verified phone, use the phone verification flow and confirm the OTP. Verified numbers are locked against manual edits. Open a support ticket if you need help with a locked number.", href:"/account?section=profile", action:"Open your profile" },
  { id:"webhooks", category:"technical", title:"Troubleshoot event delivery", description:"Check destinations, delivery attempts, and signing.", answer:"In Developer Portal → Webhooks, inspect the endpoint environment and subscribed events. Open Deliveries to check response codes and failed attempts. Make sure your HTTPS receiver validates Nexus signatures with the current signing secret. Never include that secret in a ticket.", href:"/developer", action:"Open developer tools" },
  { id:"customers", category:"verification", title:"Keep customers inside your app", description:"How Nexus fits into your existing customer experience.", answer:"Your end users do not need a Nexus account. Your backend creates verification requests and confirms codes while your application presents the customer-facing flow. Use separate test and live keys for development and production.", href:"/developer", action:"Explore integration examples" },
];
export const isActive = ticket => !["closed","resolved"].includes(ticket.status);
export const needsNexus = ticket => ["open","pending_nexus"].includes(ticket.status);
export const labelFor = (options,value) => options.find(row => row[0] === value)?.[1] || String(value || "Unknown").replaceAll("_"," ");
export function timestamp(value) { const n = new Date(value || "").getTime(); return Number.isFinite(n) ? n : 0; }
export function formatDate(value) { return timestamp(value) ? new Date(value).toLocaleString([], { month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit" }) : "Date unavailable"; }
export function filterTickets(rows,{search="",status="all",priority="all",category="all",sort="recent"} = {}) {
  const needle = search.trim().toLowerCase();
  const weight = { urgent:4,high:3,normal:2,low:1 };
  return rows.filter(ticket => {
    const statusMatch = status === "all" || (status === "active" ? isActive(ticket) : status === "needs_nexus" ? needsNexus(ticket) : ticket.status === status);
    return statusMatch && (priority === "all" || (priority === "impact" ? ["high","urgent"].includes(ticket.priority) : ticket.priority === priority)) && (category === "all" || ticket.category === category) &&
      [ticket.id,ticket.subject,ticket.requesterEmail,ticket.workspaceId,ticket.category].join(" ").toLowerCase().includes(needle);
  }).sort((a,b) => {
    if (sort === "priority") return Number(isActive(b)) - Number(isActive(a)) || (weight[b.priority] || 0) - (weight[a.priority] || 0) || timestamp(a.updatedAt) - timestamp(b.updatedAt);
    if (sort === "oldest") return timestamp(a.updatedAt) - timestamp(b.updatedAt);
    return timestamp(b.updatedAt) - timestamp(a.updatedAt);
  });
}
