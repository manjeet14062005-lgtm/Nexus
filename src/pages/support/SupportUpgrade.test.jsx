import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
import { SupportPage } from "./SupportPage";
import { AdminSupportPage } from "../admin/AdminSupportPage";
import { NewTicketDialog } from "./NewTicketDialog";
import { useSupportDesk } from "./useSupportDesk";
import { apiRequest } from "../../services/apiClient";
import { filterTickets } from "./ticketModel";
jest.mock("../../services/apiClient", () => ({ apiRequest:jest.fn() }));
jest.mock("react-hot-toast", () => ({ toast:{success:jest.fn(),error:jest.fn()} }));
const user = { uid:"customer" };
const ticket = (id,other={}) => ({ id,workspaceId:"one",requesterUid:"customer",subject:"Issue " + id,category:"technical",priority:"normal",status:"open",createdAt:"2026-10-01T10:00:00Z",updatedAt:"2026-10-01T10:00:00Z",messageCount:1,...other });
let host,root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; jest.resetAllMocks(); host=document.createElement("div");document.body.appendChild(host);root=createRoot(host); });
afterEach(() => { act(() => root.unmount());host.remove(); });
const button = text => [...document.querySelectorAll("button")].find(el => el.textContent === text);
const field = label => [...document.querySelectorAll("input,textarea")].find(el => document.querySelector('label[for="' + el.id + '"]')?.textContent === label);
function mockRequests(rows=[ticket("a"),ticket("b")]) {
 apiRequest.mockImplementation(async (_u,path,opts) => {
  if (path === "/workspaces") return {workspaces:[{id:"one",name:"Workspace one",role:"viewer"},{id:"two",name:"Workspace two",role:"viewer"}]};
  if (path.startsWith("/support/tickets?") || path === "/admin/support/tickets") return {tickets:rows};
  if (opts?.method === "POST" || opts?.method === "PATCH") return {ticket:ticket("new")};
  const id=path.split("/support/tickets/")[1]?.split("?")[0];
  return {ticket:ticket(id,{messages:[{id:"message",authorType:"customer",authorUid:"customer",body:"Original issue",createdAt:"2026-10-01"}]})};
 });
}
test("help search and topic filters reveal practical guides without support writes", async () => {
 mockRequests();await act(async () => root.render(<SupportPage user={user} />));
 await act(async () => Simulate.change(field("Search help guides"),{target:{value:"signing"}}));
 expect(host.textContent).toContain("Troubleshoot event delivery");
 expect(host.textContent).not.toContain("Manage your verified phone");
 await act(async () => document.querySelector(".support-article>button").click());
 expect(host.textContent).toContain("Never include that secret in a ticket");
 expect(apiRequest.mock.calls.some(([, ,opts]) => opts?.method)).toBe(false);
});
test("failed ticket loads show retry, never an empty success", async () => {
 mockRequests(); const normal=apiRequest.getMockImplementation();
 apiRequest.mockImplementation((u,path,opts) => path.startsWith("/support/tickets?") ? Promise.reject(new Error("Tickets unavailable")) : normal(u,path,opts));
 await act(async () => root.render(<SupportPage user={user} />));
 await act(async () => document.querySelector(".support-tabs button:nth-child(2)").click());
 expect(host.textContent).toContain("Tickets unavailable");expect(button("Retry tickets")).toBeDefined();
 expect(host.textContent).not.toContain("Every conversation starts here.");
});
test("ticket drafts are isolated and a late response cannot replace the current conversation", async () => {
 mockRequests();let desk;
 function Harness({scope}) { desk=useSupportDesk({user,scope});return <div>{desk.detail.data?.subject}</div>; }
 await act(async () => root.render(<Harness scope="one" />));
 await act(async () => desk.openTicket("a"));
 await act(async () => desk.setReply("Draft A"));
 await act(async () => desk.openTicket("b"));
 expect(desk.reply).toBe("");
 await act(async () => desk.setReply("Draft B"));
 await act(async () => desk.openTicket("a"));
 expect(desk.reply).toBe("Draft A");
 let resolve;const normal=apiRequest.getMockImplementation();
 apiRequest.mockImplementation((u,path,opts) => path.includes("/slow") ? new Promise(done=>{resolve=done;}) : normal(u,path,opts));
 await act(async () => desk.openTicket("slow"));
 await act(async () => desk.openTicket("b"));
 await act(async () => resolve({ticket:ticket("slow",{subject:"Stale conversation"})}));
 expect(host.textContent).toBe("Issue b");expect(desk.reply).toBe("Draft B");
 await act(async () => root.render(<Harness scope="two" />));
 expect(host.textContent).toBe("");expect(desk.reply).toBe("");
});
test("reply failure retains the draft and duplicate submit cannot send twice", async () => {
 mockRequests();let desk, reject;
 function Harness(){desk=useSupportDesk({user,scope:"one"});return <div>{desk.actionError}</div>;}
 await act(async () => root.render(<Harness />));
 await act(async () => desk.openTicket("a"));
 await act(async () => desk.setReply("Useful diagnostic context"));
 const normal=apiRequest.getMockImplementation();
 apiRequest.mockImplementation((u,path,opts) => opts?.method === "POST" ? new Promise((_done,fail)=>{reject=fail;}) : normal(u,path,opts));
 let pending;
 await act(async () => {pending=desk.mutate("reply");desk.mutate("reply");});
 expect(apiRequest.mock.calls.filter(([, ,opts])=>opts?.method==="POST")).toHaveLength(1);
 await act(async () => {reject(new Error("Reply unavailable"));await pending;});
 expect(desk.reply).toBe("Useful diagnostic context");expect(host.textContent).toBe("Reply unavailable");
});
test("successful replies clear drafts even when subsequent conversation refresh fails", async () => {
 mockRequests();let desk;
 function Harness(){desk=useSupportDesk({user,scope:"one"});return <div>{desk.detail.error}</div>;}
 await act(async () => root.render(<Harness />));await act(async () => desk.openTicket("a"));await act(async () => desk.setReply("Reply body"));
 apiRequest.mockImplementation(async (_u,path,opts)=>{if(opts?.method==="POST")return {};if(path.startsWith("/support/tickets?"))return {tickets:[]};throw new Error("Refresh unavailable");});
 await act(async()=>desk.mutate("reply"));
 expect(desk.reply).toBe("");expect(host.textContent).toBe("Refresh unavailable");
});
test("guided creation validates, preserves drafts and includes only supported diagnostic payload fields", async () => {
 apiRequest.mockResolvedValue({ticket:ticket("new")});const created=jest.fn();
 await act(async()=>root.render(<NewTicketDialog open user={user} workspaceId="one" onCreated={created} onClose={()=>{}} />));
 await act(async()=>button("Create ticket").click());expect(apiRequest).not.toHaveBeenCalled();
 await act(async()=>Simulate.change(field("Ticket subject"),{target:{value:" API issue "}}));
 await act(async()=>Simulate.change(field("What do you need help with?"),{target:{value:"Detailed issue description"}}));
 await act(async()=>Simulate.change(field("Request ID (optional)"),{target:{value:"req_123"}}));
 await act(async()=>button("Create ticket").click());
 const payload=JSON.parse(apiRequest.mock.calls[0][2].body);
 expect(payload).toMatchObject({workspaceId:"one",subject:"API issue",category:"technical",priority:"normal"});
 expect(payload.description).toContain("Nexus request ID: req_123");expect(payload).not.toHaveProperty("requestId");expect(created).toHaveBeenCalledTimes(1);
});
test("admin triage opens the highest impact active issue and reply templates never send automatically", async () => {
 mockRequests([ticket("a"),ticket("urgent",{priority:"urgent"}),ticket("closed",{status:"closed",priority:"urgent"})]);
 await act(async()=>root.render(<MemoryRouter><AdminSupportPage user={user} userRole="admin" /></MemoryRouter>));
 await act(async()=>button("Next to review").click());
 expect(host.querySelector(".support-conversation-header h2").textContent).toBe("Issue urgent");
 expect(field("Your reply to the customer")).toBeDefined();
 const starterLabel=[...host.querySelectorAll("label")].find(el=>el.textContent==="Insert a response starter");
 const starter=starterLabel.closest(".MuiFormControl-root").querySelector('[role="combobox"]');
 await act(async()=>Simulate.mouseDown(starter,{button:0}));
 const option=[...document.querySelectorAll('[role="option"]')].find(el=>el.textContent==="Request diagnostic context");
 await act(async()=>option.click());
 expect(field("Your reply to the customer").value).toContain("Could you share the Nexus request ID");
 expect(apiRequest.mock.calls.some(([, ,opts])=>opts?.method)).toBe(false);
});
test("non-admins never request the internal queue", async () => {
 await act(async()=>root.render(<MemoryRouter><AdminSupportPage user={user} userRole="viewer" /></MemoryRouter>));
 expect(apiRequest).not.toHaveBeenCalled();
});
test("impact sorting, active filtering and text matching use actual ticket data without mutating the source", () => {
 const rows=[ticket("normal"),ticket("urgent",{priority:"urgent"}),ticket("old-high",{priority:"high",updatedAt:"2026-09-01"}),ticket("closed",{status:"closed",priority:"urgent"})];
 expect(filterTickets(rows,{status:"active",priority:"impact",sort:"priority"}).map(row=>row.id)).toEqual(["urgent","old-high"]);
 expect(filterTickets(rows,{search:" OLD-HIGH "}).map(row=>row.id)).toEqual(["old-high"]);
 expect(rows[0].id).toBe("normal");
});
