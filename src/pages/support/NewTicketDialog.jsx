import { useEffect, useRef, useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, TextField } from "@mui/material";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import { apiRequest } from "../../services/apiClient.js";
import { CATEGORIES, PRIORITIES } from "./ticketModel.js";
const TIPS = {
 technical:["The page or endpoint involved","Steps to reproduce the issue","Request ID and test/live environment"],
 verification:["Verification method and request ID","Status or error you received","What you expected to happen"],
 billing:["The workspace and plan involved","Usage or billing detail in question","No card numbers or payment credentials"],
 account:["The account feature involved","The exact error message","No passwords or verification codes"],
 feedback:["What you were trying to achieve","What would improve the experience","An example of your ideal outcome"],
 other:["What you need help with","What you have already tried","The outcome you are looking for"],
};
export function NewTicketDialog({ open, category = "technical", user, workspaceId, workspaceName, darkMode, onClose, onCreated }) {
  const [form,setForm] = useState({ subject:"",description:"",category,priority:"normal",environment:"",requestId:"" });
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (open) setForm(current => ({ ...current,category })); }, [open,category]);
  function field(key,value) { setForm(current => ({ ...current,[key]:value })); }
  async function submit() {
    if (busy.current || !workspaceId) return;
    if (form.subject.trim().length < 3) { setError("Add a subject with at least 3 characters."); return; }
    if (form.description.trim().length < 10) { setError("Describe the issue in at least 10 characters so the team has enough context."); return; }
    const context = [form.environment && "Environment: " + form.environment,form.requestId.trim() && "Nexus request ID: " + form.requestId.trim()].filter(Boolean).join("\n");
    const description = form.description.trim() + (context ? "\n\n--- Diagnostic context ---\n" + context : "");
    if (description.length > 6000) { setError("This request is too long. Shorten the description or diagnostic context."); return; }
    busy.current = true; setSaving(true); setError("");
    try {
      const result = await apiRequest(user,"/support/tickets",{ method:"POST",body:JSON.stringify({ workspaceId,subject:form.subject.trim(),description,category:form.category,priority:form.priority }) });
      if (!alive.current) return;
      setForm({ subject:"",description:"",category,priority:"normal",environment:"",requestId:"" });
      onCreated(result.ticket);
    } catch (err) { if (alive.current) setError(err.message || "Your ticket could not be created. Your draft is still here."); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  }
  return <Dialog className="support-dialog support-create-dialog" data-mode={darkMode ? "dark" : "light"} open={open} onClose={() => !busy.current && onClose()} fullWidth maxWidth="md">
    <DialogTitle component="div"><div className="support-eyebrow">A CONVERSATION WITH CONTEXT</div><h2>Let's get you moving.</h2><p>New ticket · {workspaceName || "Selected workspace"}</p></DialogTitle>
    <DialogContent><div className="support-create-layout"><div className="support-create-fields">{error && <Alert severity="error">{error}</Alert>}<TextField autoFocus label="Ticket subject" fullWidth value={form.subject} disabled={saving} onChange={event => field("subject",event.target.value)} inputProps={{ maxLength:140 }} placeholder="A short, clear summary of the issue" /><div className="support-create-pair"><FormControl size="small"><InputLabel>Category</InputLabel><Select value={form.category} label="Category" disabled={saving} onChange={event => field("category",event.target.value)}>{CATEGORIES.map(([value,label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl><FormControl size="small"><InputLabel>Priority</InputLabel><Select value={form.priority} label="Priority" disabled={saving} onChange={event => field("priority",event.target.value)}>{PRIORITIES.map(([value,label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl></div><TextField label="What do you need help with?" fullWidth multiline minRows={6} maxRows={12} disabled={saving} value={form.description} onChange={event => field("description",event.target.value)} inputProps={{ maxLength:5500 }} helperText={form.description.length + "/5500 · Extra space is reserved for diagnostic context."} /><div className="support-create-pair"><FormControl size="small"><InputLabel>Environment (optional)</InputLabel><Select value={form.environment} label="Environment (optional)" disabled={saving} onChange={event => field("environment",event.target.value)}><MenuItem value="">Not sure / not applicable</MenuItem><MenuItem value="test">Test</MenuItem><MenuItem value="live">Live</MenuItem></Select></FormControl><TextField label="Request ID (optional)" size="small" value={form.requestId} disabled={saving} onChange={event => field("requestId",event.target.value)} inputProps={{ maxLength:120 }} /></div><small className="support-muted">Keep API keys, passwords, OTPs, and sensitive customer data out of your ticket.</small></div><aside className="support-create-guide"><div className="support-eyebrow">HELP US HELP YOU</div><h3>A little context.<br />A clearer next step.</h3><ol>{TIPS[form.category].map(tip => <li key={tip}>{tip}</li>)}</ol><p>{form.priority === "urgent" ? "Choose Urgent for a critical blocker. Describe who is affected and the impact; priority does not promise a response time." : "Choose a priority that reflects the impact. Mention what is blocked and who is affected."}</p><div className="support-private-note">Keep API keys, passwords, OTPs, and sensitive customer data out of the conversation.</div></aside></div></DialogContent>
    <DialogActions sx={{ p:3 }}><Button disabled={saving} onClick={onClose}>Keep draft & close</Button><Button variant="contained" disabled={saving || !workspaceId} onClick={submit} endIcon={<ArrowForwardRounded />}>{saving ? "Creating ticket…" : "Create ticket"}</Button></DialogActions>
  </Dialog>;
}