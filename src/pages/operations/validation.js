export function parseRecipients(value) {
  return [...new Set(String(value || "").split(/[,;\n]/).map(email => email.trim().toLowerCase()).filter(Boolean))];
}
export function recipientError(value) {
  const recipients = Array.isArray(value) ? value : parseRecipients(value);
  if (!recipients.length) return "Add at least one recipient.";
  if (recipients.length > 5) return "Use no more than five recipients.";
  if (recipients.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return "Enter valid email addresses, separated by commas.";
  return "";
}
export function validateSchedule(form) {
  if (!form.name.trim()) return "Give this schedule a name.";
  const error = recipientError(form.recipients); if (error) return error;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time)) return "Choose a valid delivery time.";
  try { new Intl.DateTimeFormat("en", { timeZone: form.timezone.trim() }); }
  catch (_) { return "Use a valid timezone, such as Asia/Kolkata."; }
  if (form.frequency === "weekly" && (!Number.isInteger(Number(form.weekday)) || Number(form.weekday) < 0 || Number(form.weekday) > 6)) return "Choose a valid day of the week.";
  if (form.frequency === "monthly" && (!Number.isInteger(Number(form.dayOfMonth)) || Number(form.dayOfMonth) < 1 || Number(form.dayOfMonth) > 28)) return "Monthly delivery day must be between 1 and 28.";
  return "";
}
export const CONDITION_FIELDS = [["risk_score", "Risk score"], ["status", "Status"], ["method", "Method"], ["environment", "Environment"], ["disposable", "Disposable email"]];
export const CONDITION_OPS = [["equals", "equals"], ["not_equals", "does not equal"], ["gt", "is greater than"], ["gte", "is at least"], ["lt", "is less than"], ["lte", "is at most"], ["contains", "contains"], ["is_true", "is true"], ["is_false", "is false"]];
export const ACTION_LABELS = { webhook_event: "Send webhook event", email_owner: "Email workspace owner", email_recipients: "Email specific recipients", create_security_event: "Create security event" };
export const eventLabel = value => String(value || "Verification event").replace(/[._]/g, " ").replace(/^./, c => c.toUpperCase());
export function validateWorkflow(form) {
  if (!form.name.trim()) return "Give your workflow a name.";
  if (!form.trigger) return "Choose a trigger event.";
  if (!form.actions.length) return "Add at least one action.";
  for (const condition of form.conditions) {
    if (["is_true", "is_false"].includes(condition.operator)) continue;
    if (condition.value === "" || condition.value == null) return "Complete the value for every condition.";
    if (condition.field === "risk_score" && (!Number.isFinite(Number(condition.value)) || Number(condition.value) < 0 || Number(condition.value) > 100)) return "Risk score must be a number between 0 and 100.";
  }
  for (const action of form.actions) {
    if (action.type === "email_recipients") {
      const error = recipientError(action.config.recipientsText ?? action.config.recipients ?? []); if (error) return error;
    }
  }
  return "";
}
export function workflowPayload(form) {
  return { ...form, name: form.name.trim(), actions: form.actions.map(action => {
    const { recipientsText, ...config } = action.config || {};
    return { ...action, config: action.type === "email_recipients" ? { ...config, recipients: recipientsText === undefined ? config.recipients : parseRecipients(recipientsText) } : config };
  }) };
}
// A local preview of the server's condition semantics; never executes actions.
export function previewWorkflow(form, sample) {
  const payload = workflowPayload(form);
  if (form.trigger !== sample.event || (form.environment !== "all" && form.environment !== sample.environment)) return false;
  return payload.conditions.every(condition => {
    const actual = sample[condition.field];
    const value = condition.field === "disposable" && !["is_true", "is_false"].includes(condition.operator) ? String(condition.value).toLowerCase() === "true" : condition.value;
    switch (condition.operator) {
      case "equals": return String(actual ?? "").toLowerCase() === String(value ?? "").toLowerCase();
      case "not_equals": return String(actual ?? "").toLowerCase() !== String(value ?? "").toLowerCase();
      case "gt": return Number(actual) > Number(value);
      case "gte": return Number(actual) >= Number(value);
      case "lt": return Number(actual) < Number(value);
      case "lte": return Number(actual) <= Number(value);
      case "contains": return String(actual ?? "").toLowerCase().includes(String(value ?? "").toLowerCase());
      case "is_true": return Boolean(actual);
      case "is_false": return !Boolean(actual);
      default: return false;
    }
  });
}
