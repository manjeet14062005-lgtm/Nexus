import React, { act, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { ReportsPage } from "../reports/ReportsPage";
import { WorkflowsPage } from "../workflows/WorkflowsPage";
import { WorkflowEditor } from "../workflows/WorkflowEditor";
import { ScheduleEditor } from "../reports/ScheduleEditor";
import { useOperationResource } from "./useOperationsData";
import { parseRecipients, previewWorkflow, validateSchedule, validateWorkflow, workflowPayload } from "./validation";
import { apiRequest, apiDownload } from "../../services/apiClient";
jest.mock("../../services/apiClient", () => ({ apiRequest: jest.fn(), apiDownload: jest.fn() }));
jest.mock("react-hot-toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
let host, root;
const user = { uid: "test-user", email: "owner@example.com" };
const eventRows = [{ id: "verification.failed" }, { id: "verification.completed" }];
const report = { range: { start: "2026-01-01", end: "2026-01-30" }, totals: { requests: 0, verified: 0, highRisk: 0, verificationRate: 0 }, series: [{ day: "2026-01-01", requests: 0, verified: 0 }], plan: { name: "Pro" } };
const workflow = { name: "Risk check", description: "", trigger: "verification.failed", environment: "all", conditions: [{ field: "risk_score", operator: "gte", value: 80 }], actions: [{ type: "email_owner", config: {} }] };
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; jest.resetAllMocks(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const button = text => [...document.querySelectorAll("button")].find(el => el.textContent === text);
const input = label => [...document.querySelectorAll("input, textarea")].find(el => document.querySelector(`label[for="${el.id}"]`)?.textContent === label);
function mockRequests(role = "owner") {
  apiRequest.mockImplementation(async (_user, path) => {
    if (path === "/workspaces") return { workspaces: [{ id: "one", name: "Test workspace", role }] };
    if (path.includes("/analytics?")) return { analytics: report };
    if (path.endsWith("/workflows/events")) return { events: eventRows };
    if (path.endsWith("/workflows")) return { workflows: [] };
    if (path.endsWith("/webhooks")) return { webhooks: [] };
    if (path.endsWith("/report-schedules")) return { schedules: [] };
    if (path.endsWith("/entitlements")) return { plan: { name: "Pro", featureFlags: { automation: true, scheduledReports: true } } };
    return {};
  });
}
test("viewers can read reports and workflows without forbidden schedule or webhook requests", async () => {
  mockRequests("viewer"); await act(async () => root.render(<ReportsPage user={user} />));
  expect(button("Export report").disabled).toBe(true);
  expect(host.textContent).toContain("No requests in this period");
  expect(apiRequest.mock.calls.some(([, path]) => path.includes("report-schedules"))).toBe(false);
  await act(async () => root.render(<WorkflowsPage user={user} />));
  expect(host.textContent).toContain("Make your first connection");
  expect(button("Create workflow").disabled).toBe(true);
  expect(apiRequest.mock.calls.some(([, path]) => path.endsWith("/webhooks"))).toBe(false);
  expect(apiDownload).not.toHaveBeenCalled();
});
test("report filter failures show retry and never label old report data as a new period", async () => {
  mockRequests(); await act(async () => root.render(<ReportsPage user={user} />));
  expect(host.textContent).toContain("The story behind the numbers");
  await act(async () => button("Daily detail").click()); expect(host.querySelector("table")).not.toBeNull();
  apiRequest.mockImplementation(async (_u, path) => { if (path.includes("environment=live")) throw new Error("Live data unavailable"); return { analytics: report }; });
  await act(async () => button("Live").click());
  expect(host.textContent).toContain("Live data unavailable");
  expect(host.textContent).not.toContain("Your report, at a glance");
  expect(button("Retry")).toBeDefined();
});
test("workflow templates open an editable builder, remove actions and preview rules without API writes", async () => {
  mockRequests(); await act(async () => root.render(<WorkflowsPage user={user} />));
  await act(async () => document.querySelector(".ops-template").click());
  expect(document.body.textContent).toContain("Build a new connection");
  expect(input("Workflow name").value).toBe("High-risk verification alert");
  await act(async () => document.querySelector('[aria-label="Remove action 2"]').click());
  expect(document.querySelector('[aria-label="Remove action 2"]')).toBeNull();
  await act(async () => button("Preview rules with a sample event").click());
  await act(async () => button("Check sample").click());
  expect(document.body.textContent).toContain("Rules match. 1 action(s)");
  expect(apiRequest.mock.calls.some(([, , options]) => options?.method)).toBe(false);
});
test("workflow save validates recipients and preserves partially typed email input", async () => {
  apiRequest.mockResolvedValue({}); const saved = jest.fn();
  await act(async () => root.render(<WorkflowEditor initial={{ ...workflow, actions: [{ type: "email_recipients", config: { recipients: [] } }] }} user={user} base="/workspaces/one" enabled events={eventRows} webhooks={[]} onClose={() => {}} onSaved={saved} />));
  await act(async () => button("Create & activate").click()); expect(apiRequest).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("Add at least one recipient");
  await act(async () => Simulate.change(input("Email recipients"), { target: { value: "a@example.com, b@example.com" } }));
  expect(input("Email recipients").value).toBe("a@example.com, b@example.com");
  await act(async () => button("Create & activate").click());
  expect(JSON.parse(apiRequest.mock.calls[0][2].body).actions[0].config.recipients).toEqual(["a@example.com", "b@example.com"]);
  expect(saved).toHaveBeenCalled();
});
test("schedule editor sends clean fields, retains timezone and rejects invalid recipients", async () => {
  apiRequest.mockResolvedValue({}); const saved = jest.fn();
  await act(async () => root.render(<ScheduleEditor item={{}} defaults={{ recipients: "bad-address" }} user={user} base="/workspaces/one" onClose={() => {}} onSaved={saved} />));
  await act(async () => button("Create schedule").click()); expect(apiRequest).not.toHaveBeenCalled();
  await act(async () => Simulate.change(input("Email recipients"), { target: { value: "Owner@example.com, owner@example.com" } }));
  await act(async () => button("Create schedule").click());
  const payload = JSON.parse(apiRequest.mock.calls[0][2].body);
  expect(payload.recipients).toEqual(["owner@example.com"]); expect(payload.timezone).toBeTruthy(); expect(payload.enabled).toBe(true); expect(saved).toHaveBeenCalled();
});
test("late responses and workspace switches cannot restore previous-context results", async () => {
  let handle; const resolvers = {};
  function Harness({ id }) { const loader = useCallback(() => new Promise(resolve => { resolvers[id] = resolve; }), [id]); handle = useOperationResource(id, loader); return <div>{handle.data?.label}</div>; }
  await act(async () => root.render(<Harness id="old" />));
  await act(async () => root.render(<Harness id="new" />));
  await act(async () => resolvers.new({ label: "New workspace" }));
  await act(async () => resolvers.old({ label: "Old workspace" }));
  expect(host.textContent).toBe("New workspace");
  await act(async () => root.render(<Harness id="third" />)); expect(host.textContent).toBe(""); expect(handle.loading).toBe(true);
});
test("changing an existing daily schedule to monthly uses the displayed default day", async () => {
  apiRequest.mockResolvedValue({});
  const item = { id: "daily", name: "Briefing", frequency: "daily", time: "09:00", timezone: "UTC", range: 30, environment: "all", recipients: ["a@example.com"], weekday: null, dayOfMonth: null };
  await act(async () => root.render(<ScheduleEditor item={item} user={user} base="/workspaces/one" onClose={() => {}} onSaved={() => {}} />));
  const frequency = [...document.querySelectorAll('[role="combobox"]')].find(el => el.textContent === "daily");
  await act(async () => Simulate.mouseDown(frequency, { button: 0 }));
  await act(async () => document.querySelector('[role="option"][data-value="monthly"]').click());
  expect(input("Day of month").value).toBe("1");
  await act(async () => button("Save schedule").click());
  expect(JSON.parse(apiRequest.mock.calls[0][2].body)).toMatchObject({ frequency: "monthly", dayOfMonth: 1, weekday: 1 });
});
test("validation and preview handle boundaries, booleans, environment and recipient limits", () => {
  expect(parseRecipients("A@example.com; a@example.com\nb@example.com")).toEqual(["a@example.com", "b@example.com"]);
  expect(validateSchedule({ name: "Report", recipients: "a@example.com", time: "09:00", timezone: "Invalid/Zone" })).toContain("timezone");
  const sample = { event: "verification.failed", environment: "test", risk_score: 80, disposable: true };
  expect(previewWorkflow(workflow, sample)).toBe(true);
  expect(previewWorkflow(workflow, { ...sample, risk_score: 79 })).toBe(false);
  expect(previewWorkflow({ ...workflow, environment: "live" }, sample)).toBe(false);
  expect(previewWorkflow({ ...workflow, conditions: [{ field: "disposable", operator: "equals", value: "true" }] }, sample)).toBe(true);
  expect(validateWorkflow({ ...workflow, conditions: [{ field: "risk_score", operator: "gte", value: "oops" }] })).toContain("Risk score");
  expect(workflowPayload({ ...workflow, actions: [{ type: "email_recipients", config: { recipientsText: "a@example.com" } }] }).actions[0].config).toEqual({ recipients: ["a@example.com"] });
});
