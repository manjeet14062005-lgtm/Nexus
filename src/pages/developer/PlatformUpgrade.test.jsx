import { MemoryRouter } from "react-router-dom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { AIFeaturesPage } from "../advanced/AIFeaturesPage";
import { DeveloperPortal } from "./DeveloperPortal";
import { buildSnippet, ENDPOINTS } from "./QuickstartBench";
import { apiRequest } from "../../services/apiClient";
jest.mock("../../services/apiClient", () => ({ apiRequest: jest.fn() }));
jest.mock("react-hot-toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const user = { uid: "test-user" };
let root, host;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; jest.resetAllMocks(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const button = text => [...host.querySelectorAll("button")].find(row => row.textContent === text);
function requests(role = "owner", remaining = 10) {
  apiRequest.mockImplementation(async (_user, path) => {
    if (path === "/workspaces") return { workspaces: [{ id: "one", name: "Test workspace", role }] };
    if (path.endsWith("/access")) return { workspace: { id: "one", role } };
    if (path.endsWith("/entitlements")) return { plan: { featureFlags: { webhooks: true } } };
    if (path.endsWith("/intelligence/usage")) return { usage: { remaining, used: 20 - remaining, limit: 20 } };
    if (path.endsWith("/intelligence")) return { answer: "## Findings\n\n**A useful insight.**", source: "workspace-analytics" };
    return {};
  });
}
test("suggestions only fill the composer and one explicit submission records the correct analysis context", async () => {
  requests(); await act(async () => root.render(<AIFeaturesPage user={user} />));
  await act(async () => host.querySelector(".intel-starters button").click());
  expect(apiRequest.mock.calls.filter(([, , options]) => options?.method === "POST")).toHaveLength(0);
  expect(host.querySelector("#intel-question").value).toContain("Summarize my verification performance");
  await act(async () => { button("Explore question").click(); button("Explore question").click(); });
  const posts = apiRequest.mock.calls.filter(([, , options]) => options?.method === "POST");
  expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0][2].body)).toMatchObject({ range: 30, environment: "all" });
  expect(host.querySelector(".intel-answer h3").textContent).toBe("Findings");
  expect(host.querySelector(".intel-answer strong").textContent).toBe("A useful insight.");
  expect(host.querySelector('[aria-label="Download analysis"]')).not.toBeNull();
});
test("role and exhausted quota prevent analysis requests", async () => {
  requests("viewer"); await act(async () => root.render(<AIFeaturesPage user={user} />));
  expect(button("Explore question").disabled).toBe(true);
  expect(apiRequest.mock.calls.some(([, path]) => path.includes("/intelligence"))).toBe(false);
  requests("owner", 0);
  await act(async () => root.render(<AIFeaturesPage key="second" user={user} />));
  await act(async () => host.querySelector(".intel-starters button").click());
  expect(button("Explore question").disabled).toBe(true);
  expect(host.textContent).toContain("allowance has been used");
});
test("usage failure cannot accidentally permit a metered request", async () => {
  requests(); const normal = apiRequest.getMockImplementation();
  apiRequest.mockImplementation((u, path, opts) => path.endsWith("/intelligence/usage") ? Promise.reject(new Error("Usage unavailable")) : normal(u, path, opts));
  await act(async () => root.render(<AIFeaturesPage user={user} />));
  await act(async () => host.querySelector(".intel-starters button").click());
  expect(button("Explore question").disabled).toBe(true);
  expect(button("Retry usage")).toBeDefined();
});

test('Intelligence composer uses Nexus branding without exposing provider marketing',async()=>{
 requests();const normal=apiRequest.getMockImplementation();
 apiRequest.mockImplementation((u,path,opts)=>path.endsWith('/intelligence/usage')?Promise.resolve({usage:{remaining:10,used:0,limit:10,capabilities:{provider:'gemini'}}}):normal(u,path,opts));
 await act(async()=>root.render(<AIFeaturesPage user={user}/>));
 expect(host.textContent).toContain('Nexus Standard delivers focused analysis grounded in your workspace evidence.');expect(host.textContent).not.toContain('Gemini Flash');expect(host.textContent).not.toContain('cost more to run');
});
test("late AI answers cannot appear under a different environment", async () => {
  requests(); const normal = apiRequest.getMockImplementation(); let resolve, signal;
  apiRequest.mockImplementation((u, path, opts) => path.endsWith("/intelligence") ? new Promise(done => { resolve = done; signal = opts.signal; }) : normal(u, path, opts));
  await act(async () => root.render(<AIFeaturesPage user={user} />));
  await act(async () => host.querySelector(".intel-starters button").click());
  await act(async () => button("Explore question").click());
  expect(host.querySelector(".intel-pending")).not.toBeNull();
  await act(async () => button("live").click());
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ answer: "Old environment response" }));
  expect(host.textContent).not.toContain("Old environment response");
  expect(host.querySelector(".intel-pending")).toBeNull();
});
test("developer tools protect viewers and the quickstart changes language and endpoint without API writes", async () => {
  requests("viewer"); await act(async () => root.render(<MemoryRouter><DeveloperPortal user={user} /></MemoryRouter>));
  expect(button("Create API key").disabled).toBe(true);
  expect(apiRequest.mock.calls.some(([, path]) => path.endsWith("/api-keys") || path.endsWith("/webhooks"))).toBe(false);
  await act(async () => button("Open code workbench").click());
  await act(async () => button("Node.js").click());
  expect(host.querySelector(".dev-code-panel pre").textContent).toContain("process.env.NEXUS_API_KEY");
  await act(async () => button("GETCheck workspace usage").click());
  expect(host.querySelector(".dev-code-panel pre").textContent).toContain("/v1/usage");
  expect(host.querySelector(".dev-code-panel pre").textContent).not.toContain("body:");
  expect(apiRequest.mock.calls.some(([, , options]) => options?.method)).toBe(false);
});
test("developer request failures expose retry rather than silently showing an empty successful load", async () => {
  requests(); const normal = apiRequest.getMockImplementation();
  apiRequest.mockImplementation((u, path, opts) => path.endsWith("/api-keys") ? Promise.reject(new Error("Credentials unavailable")) : normal(u, path, opts));
  await act(async () => root.render(<MemoryRouter><DeveloperPortal user={user} /></MemoryRouter>));
  expect(host.textContent).toContain("Credentials unavailable");
  expect(button("Retry")).toBeDefined();
});
test("searchable credentials use masked values and searches do not expose secret material", async () => {
  requests(); const normal = apiRequest.getMockImplementation();
  apiRequest.mockImplementation((u, path, opts) => path.endsWith("/api-keys") ? Promise.resolve({ apiKeys: [{ id: "a", name: "Test backend", prefix: "nx_test_", last4: "1234", environment: "test", status: "active" }] }) : normal(u, path, opts));
  await act(async () => root.render(<MemoryRouter><DeveloperPortal user={user} /></MemoryRouter>));
  expect(host.textContent).toContain("nx_test_••••1234");
  const input = host.querySelector(".dev-toolbar input");
  await act(async () => Simulate.change(input, { target: { value: "no-match" } }));
  expect(host.textContent).not.toContain("Test backend");
});
test("quickstart examples use correct verbs, payloads, real line breaks and server-only key placeholders", () => {
  const curl = buildSnippet(ENDPOINTS[0], "curl", "https://api.example.com/");
  expect(curl).toContain("https://api.example.com/v1/verifications");
  expect(curl).toContain("\\\n");
  expect(curl).toContain('"method":"email"');
  expect(buildSnippet(ENDPOINTS[1], "javascript")).toContain('code": "123456"');
  expect(buildSnippet(ENDPOINTS[3], "python")).toContain("requests.get(");
  expect(buildSnippet(ENDPOINTS[3], "python")).not.toContain("json=");
});
test("integration deep links open the requested developer tab and workspace",async()=>{
 requests();const normal=apiRequest.getMockImplementation();
 apiRequest.mockImplementation((u,path,opts)=>{
  if(path==="/workspaces")return Promise.resolve({workspaces:[{id:"one",name:"First",role:"owner"},{id:"two",name:"Second",role:"owner"}]});
  if(path.endsWith("/access"))return Promise.resolve({workspace:{id:path.includes("/two/")?"two":"one",role:"owner"}});
  return normal(u,path,opts);
 });
 await act(async()=>root.render(<MemoryRouter initialEntries={["/developer?tab=webhooks&workspace=two"]}><DeveloperPortal user={user}/></MemoryRouter>));
 expect(host.querySelector('[role="tab"][aria-selected="true"]').textContent).toBe("Webhooks");
 expect(apiRequest.mock.calls.some(([,path])=>path==="/workspaces/two/access")).toBe(true);
 expect(apiRequest.mock.calls.some(([,path])=>path==="/workspaces/one/access")).toBe(false);
});
test('investigated sources and follow-up suggestions remain grounded in the active conversation', async()=>{
 requests(); const normal=apiRequest.getMockImplementation(); apiRequest.mockImplementation(async(...args)=>args[1].endsWith('/intelligence')?{answer:'Measured workspace finding [E1]',model:'test-model',quality:'partial',source:'workspace-analytics',investigation:['Verification performance'],brief:{followUpQuestions:['What should I check next?']},evidence:[{id:'E1',title:'Verification performance',data:{totals:{requests:10,verified:6},limitations:['Partial detail coverage.']}}]}:normal(...args));
 await act(async()=>root.render(<AIFeaturesPage user={user}/>));await act(async()=>host.querySelector('.intel-starters button').click());await act(async()=>button('Explore question').click());
 expect(host.textContent).toContain('Partial detail coverage');expect(host.querySelector('details summary').textContent).toContain('E1');expect(host.textContent).toContain('Verification performance');
 await act(async()=>button('What should I check next? ↗').click());expect(host.querySelector('#intel-question').value).toBe('What should I check next?');expect(apiRequest.mock.calls.filter(([, ,opts])=>opts?.method==='POST')).toHaveLength(1);
 await act(async()=>button('Explore question').click());const posts=apiRequest.mock.calls.filter(([, ,opts])=>opts?.method==='POST');expect(JSON.parse(posts[1][2].body).history[0].answer).toContain('Measured workspace finding');expect(JSON.parse(posts[1][2].body).mode).toBe('standard');
});

test('changing environment prevents previous-selection conversation from being sent',async()=>{
 requests();await act(async()=>root.render(<AIFeaturesPage user={user}/>));await act(async()=>host.querySelector('.intel-starters button').click());await act(async()=>button('Explore question').click());await act(async()=>button('test').click());await act(async()=>button('Explore question').click());const posts=apiRequest.mock.calls.filter(([, ,opts])=>opts?.method==='POST');expect(JSON.parse(posts[1][2].body).history).toEqual([]);expect(JSON.parse(posts[1][2].body).environment).toBe('test');
});
