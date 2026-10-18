import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {Simulate} from "react-dom/test-utils";
import {MemoryRouter} from "react-router-dom";
import {TeamWorkspacePage,filterMembers} from "./TeamWorkspacePage";
import {apiRequest} from "../../services/apiClient";
jest.mock("../../services/apiClient",()=>({apiRequest:jest.fn(),apiDownload:jest.fn()}));
jest.mock("../../contexts/UserProfileContext",()=>({useUserProfile:()=>({profile:{submitterUid:"owner",name:"Profile name",photoUrl:"https://example.test/avatar.png"}})}));
jest.mock("react-hot-toast",()=>({toast:Object.assign(jest.fn(),{success:jest.fn(),error:jest.fn()})}));
const user={uid:"owner"},member={id:"member",uid:"guest",name:"Guest",email:"guest@example.test",role:"viewer"};
let host,root;
const button=text=>[...document.querySelectorAll("button")].find(el=>el.textContent===text);
const field=label=>[...document.querySelectorAll("input,textarea")].find(el=>document.querySelector('label[for="'+el.id+'"]')?.textContent===label);
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;jest.resetAllMocks();host=document.createElement("div");document.body.appendChild(host);root=createRoot(host);
 apiRequest.mockImplementation(async(_user,path,opts)=>{
  if(path==="/workspaces")return {workspaces:[{id:"one",name:"Workspace one",role:"owner"},{id:"two",name:"Workspace two",role:"owner"}]};
  if(path==="/workspace-invites")return {invites:[]};
  if(opts?.method)return {emailStatus:"not_configured",message:"Saved in Nexus"};
  if(path.endsWith("/members"))return {members:[member]};
  if(path.includes("/activity"))return {activity:[]};
  if(path.endsWith("/branding"))return {branding:{available:true,brandName:path.includes("/one/")?"One brand":"Two brand",accentColor:"#627a99"}};
  if(path.endsWith("/invites"))return {invites:[{id:"invite",invitedEmail:"guest@example.test",role:"viewer",status:"pending"}]};
  return {};
 });
});
afterEach(()=>{act(()=>root.unmount());host.remove();});
async function mount(){await act(async()=>root.render(<MemoryRouter><TeamWorkspacePage user={user}/></MemoryRouter>));}
test("member search and role filters are independent",()=>{
 expect(filterMembers([member],"GUEST","viewer")).toHaveLength(1);
 expect(filterMembers([member],"guest","admin")).toHaveLength(0);
});
test("member identity uses the current account name and photo above a single email",async()=>{
 const normal=apiRequest.getMockImplementation();
 apiRequest.mockImplementation((u,path,opts)=>path.endsWith("/members")?Promise.resolve({members:[{id:"own",uid:"owner",name:"owner@example.test",email:"owner@example.test",role:"owner"}]}):normal(u,path,opts));
 await mount();const row=host.querySelector('.ws-member');
 expect(row.querySelector('strong').textContent).toContain('Profile name');expect(row.querySelector('.ws-member-info span').textContent).toBe('owner@example.test');expect(row.querySelector('img').getAttribute('src')).toBe('https://example.test/avatar.png');
});
test("member removal requires confirmation; cancellation leaves membership intact",async()=>{
 await mount();await act(async()=>button("Remove").click());
 expect(apiRequest.mock.calls.some(([, ,opts])=>opts?.method==="DELETE")).toBe(false);
 await act(async()=>button("Cancel").click());
 expect(apiRequest.mock.calls.some(([, ,opts])=>opts?.method==="DELETE")).toBe(false);
});
test("a slow member response cannot appear under a different workspace",async()=>{
 const normal=apiRequest.getMockImplementation();let resolve,signal;
 apiRequest.mockImplementation((u,path,opts)=>path==="/workspaces/one/members"?new Promise(done=>{resolve=done;signal=opts.signal;}):normal(u,path,opts));
 await mount();await act(async()=>document.querySelector('.ws-sidebar button:nth-of-type(2)').click());
 expect(signal.aborted).toBe(true);
 await act(async()=>resolve({members:[{...member,name:"Stale member"}]}));
 expect(host.textContent).not.toContain("Stale member");expect(host.textContent).toContain("Workspace two");
});
test("late branding response does not populate another workspace's editor",async()=>{
 const normal=apiRequest.getMockImplementation();let resolve;
 apiRequest.mockImplementation((u,path,opts)=>path==="/workspaces/one/branding"?new Promise(done=>{resolve=done;}):normal(u,path,opts));
 await mount();await act(async()=>document.querySelector('.ws-sidebar button:nth-of-type(2)').click());
 await act(async()=>resolve({branding:{available:true,brandName:"Stale brand"}}));
 await act(async()=>button("Settings").click());expect(field("Brand name").value).toBe("Two brand");
});
test("duplicate workspace creation is blocked and errors preserve the draft",async()=>{
 await mount();let reject;const normal=apiRequest.getMockImplementation();
 apiRequest.mockImplementation((u,path,opts)=>opts?.method==="POST"?new Promise((_,fail)=>{reject=fail;}):normal(u,path,opts));
 await act(async()=>button("New Workspace").click());await act(async()=>Simulate.change(field("Workspace name"),{target:{value:"My draft"}}));
 await act(async()=>{button("Create workspace").click();button("Create workspace").click();});
 expect(apiRequest.mock.calls.filter(([, ,opts])=>opts?.method==="POST")).toHaveLength(1);
 await act(async()=>reject(new Error("Unavailable")));expect(field("Workspace name").value).toBe("My draft");expect(document.body.textContent).toContain("Unavailable");
});
test("invitations distinguish incoming from outgoing and never email on page load",async()=>{
 await mount();await act(async()=>button("Invitations").click());
 expect(host.textContent).toContain("Invitations for you");expect(host.textContent).toContain("Sent from this workspace");
 expect(apiRequest.mock.calls.some(([, ,opts])=>opts?.method)).toBe(false);
 await act(async()=>button("Revoke").click());expect(document.body.textContent).toContain("Revoke this invitation?");
});
test("invalid branding values block writes and unsaved settings require discard before switching",async()=>{
 await mount();await act(async()=>button("Settings").click());
 await act(async()=>Simulate.change(field("Accent color"),{target:{value:"invalid"}}));
 await act(async()=>button("Save branding").click());
 expect(host.textContent).toContain("six-digit hex");expect(apiRequest.mock.calls.some(([, ,opts])=>opts?.method)).toBe(false);
 await act(async()=>document.querySelector('.ws-sidebar button:nth-of-type(2)').click());
 expect(document.body.textContent).toContain("Discard unsaved changes?");
 await act(async()=>button("Cancel").click());expect(host.textContent).toContain("Workspace one");
});
test("failed invitations show retry instead of an empty successful list",async()=>{
 const normal=apiRequest.getMockImplementation();
 apiRequest.mockImplementation((u,path,opts)=>path==="/workspaces/one/invites"?Promise.reject(new Error("Invitations unavailable")):normal(u,path,opts));
 await mount();await act(async()=>button("Invitations").click());expect(host.textContent).toContain("Invitations unavailable");expect(button("Retry")).toBeDefined();
});
test("legacy uppercase owner roles never show removal or reassignment controls",async()=>{
 const normal=apiRequest.getMockImplementation();
 apiRequest.mockImplementation((u,path,opts)=>path.endsWith("/members")?Promise.resolve({members:[{...member,role:"Owner"}]}):normal(u,path,opts));
 await mount();expect(button("Remove")).toBeUndefined();expect(field("Role for Guest")).toBeUndefined();
 expect(host.textContent).toContain("Owner");
});
test("viewer workspace roles do not expose invitation, edit or delete actions",async()=>{
 const normal=apiRequest.getMockImplementation();
 apiRequest.mockImplementation((u,path,opts)=>path==="/workspaces"?Promise.resolve({workspaces:[{id:"one",name:"Read only",role:"viewer"}]}):normal(u,path,opts));
 await mount();expect(button("Invite")).toBeUndefined();expect(button("Remove")).toBeUndefined();
 expect(apiRequest.mock.calls.some(([,path])=>path==="/workspaces/one/invites")).toBe(false);
 await act(async()=>button("Settings").click());expect(button("Delete")).toBeUndefined();expect(button("Save settings").disabled).toBe(true);
});
