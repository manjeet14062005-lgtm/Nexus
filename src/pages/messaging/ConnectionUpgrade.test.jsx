import React,{act} from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
import { MessagingPage,filterMessages } from "./MessagingPage";
import { IntegrationsPage,endpointLabel } from "../integrations/IntegrationsPage";
import { addDoc,getDocs,onSnapshot,updateDoc,deleteDoc } from "../../lib/supabaseDataCompat";
import { apiRequest } from "../../services/apiClient";
jest.mock("../../lib/supabaseLegacy",()=>({db:{}}));
jest.mock("../../lib/supabaseDataCompat",()=>({
 collection:(_db,name)=>({name}),doc:(_db,name,id)=>({name,id}),query:(ref,...constraints)=>({...ref,constraints}),
 where:(field,op,value)=>({field,op,value}),orderBy:()=>({}),limit:()=>({}),addDoc:jest.fn(),getDocs:jest.fn(),onSnapshot:jest.fn(),updateDoc:jest.fn(),deleteDoc:jest.fn()
}));
jest.mock("../../services/apiClient",()=>({apiRequest:jest.fn()}));
jest.mock("react-hot-toast",()=>({toast:{success:jest.fn(),error:jest.fn()}}));
let host,root;
const user={uid:"one",email:"owner@example.test"};
const message={id:"m",title:"Welcome",body:"Your workspace is ready",fromName:"Nexus",read:false,ts:100};
const snap=rows=>({docs:rows.map(row=>({id:row.id,data:()=>row}))});
const button=text=>[...document.querySelectorAll("button")].find(el=>el.textContent===text);
const field=label=>[...document.querySelectorAll("input,textarea")].find(el=>document.querySelector('label[for="'+el.id+'"]')?.textContent===label);
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;jest.resetAllMocks();host=document.createElement("div");document.body.appendChild(host);root=createRoot(host);
 onSnapshot.mockImplementation((ref,success)=>{success(snap(ref.name==="messages"?[message]:[]));return jest.fn();});
 getDocs.mockResolvedValue(snap([{id:"recipient",submitterUid:"two",name:"Recipient"}]));
});
afterEach(()=>{act(()=>root.unmount());host.remove();});
test("inbox filtering supports unread and text while preserving read messages",()=>{
 expect(filterMessages([message,{...message,id:"read",read:true}],"workspace","unread")).toHaveLength(1);
 expect(filterMessages([message],"missing","all")).toEqual([]);
 expect(filterMessages([message,{...message,read:true}],"","read")).toHaveLength(1);
});
test("reading does not write until explicitly marked; failed read stays visible",async()=>{
 updateDoc.mockRejectedValue(new Error("Could not save"));
 await act(async()=>root.render(<MemoryRouter><MessagingPage user={user}/></MemoryRouter>));
 await act(async()=>document.querySelector(".message-row").click());
 expect(updateDoc).not.toHaveBeenCalled();
 await act(async()=>button("Mark as read").click());
 expect(host.textContent).toContain("Could not save");expect(button("Mark as read")).toBeDefined();
});
test("deletion requires confirmation and cancel performs no delete",async()=>{
 await act(async()=>root.render(<MemoryRouter><MessagingPage user={user}/></MemoryRouter>));
 await act(async()=>document.querySelector(".message-row").click());
 await act(async()=>button("Delete").click());
 expect(deleteDoc).not.toHaveBeenCalled();expect(document.body.textContent).toContain("Delete permanently");
 await act(async()=>button("Cancel").click());expect(deleteDoc).not.toHaveBeenCalled();
});
test("announcements publish once to the shared feed without recipient fan-out",async()=>{
 await act(async()=>root.render(<MemoryRouter><MessagingPage user={user} userRole="admin"/></MemoryRouter>));
 await act(async()=>button("Announcement").click());
 await act(async()=>Simulate.change(field("Subject"),{target:{value:"Update"}}));
 await act(async()=>Simulate.change(field("Message"),{target:{value:"A shared update"}}));
 await act(async()=>button("Publish announcement").click());
 expect(addDoc).toHaveBeenCalledTimes(1);
 expect(addDoc.mock.calls[0][0]).toEqual({name:"announcements"});
 expect(addDoc.mock.calls[0][1].body).toBe("A shared update");
});
test("compose draft survives close and failed send, duplicate writes are blocked",async()=>{
 let reject;addDoc.mockImplementation(()=>new Promise((_,fail)=>{reject=fail;}));
 await act(async()=>root.render(<MemoryRouter><MessagingPage user={user} userRole="admin"/></MemoryRouter>));
 await act(async()=>button("Announcement").click());
 await act(async()=>Simulate.change(field("Subject"),{target:{value:"Draft"}}));
 await act(async()=>Simulate.change(field("Message"),{target:{value:"Draft body"}}));
 await act(async()=>button("Keep draft & close").click());
 await act(async()=>button("Announcement").click());expect(field("Subject").value).toBe("Draft");
 await act(async()=>{button("Publish announcement").click();button("Publish announcement").click();});
 expect(addDoc).toHaveBeenCalledTimes(1);
 await act(async()=>reject(new Error("Unavailable")));
 expect(field("Message").value).toBe("Draft body");expect(document.body.textContent).toContain("Unavailable");
});
test("non-admin cannot compose and a failed feed shows retry",async()=>{
 onSnapshot.mockImplementation((_ref,_success,error)=>{error(new Error("Inbox offline"));return jest.fn();});
 await act(async()=>root.render(<MemoryRouter><MessagingPage user={user}/></MemoryRouter>));
 expect(button("New message")).toBeUndefined();expect(host.textContent).toContain("Inbox offline");
 expect(button("Retry")).toBeDefined();expect(host.textContent).not.toContain("You're all caught up.");
});
function mockIntegration(role="owner") {
 apiRequest.mockImplementation(async(_u,path)=>{
  if(path==="/workspaces")return {workspaces:[{id:"w",name:"Workspace",role}]};
  if(path.endsWith("/access"))return {workspace:{id:"w",role}};
  if(path.endsWith("/api-keys"))return {apiKeys:[{status:"active"},{status:"revoked"}]};
  if(path.endsWith("/webhooks"))return {webhooks:[{id:"h",name:"Orders",url:"https://example.test/hook?secret=hidden",enabled:true}]};
  return {};
 });
}
test("integration hub uses live metadata and conceals endpoint query credentials",async()=>{
 mockIntegration();await act(async()=>root.render(<MemoryRouter><IntegrationsPage user={user}/></MemoryRouter>));
 expect(host.textContent).toContain("Orders");expect(host.textContent).toContain("example.test/hook");
 expect(host.textContent).not.toContain("hidden");expect(button("Manage credentials").disabled).toBe(false);
 expect(endpointLabel("https://user:password@example.test/path?token=secret#fragment")).toBe("example.test/path");
});
test("restricted roles do not request credential or webhook data",async()=>{
 mockIntegration("viewer");await act(async()=>root.render(<MemoryRouter><IntegrationsPage user={user}/></MemoryRouter>));
 expect(apiRequest.mock.calls.some(([,path])=>path.endsWith("/api-keys")||path.endsWith("/webhooks"))).toBe(false);
 expect(button("Manage credentials").disabled).toBe(true);
 expect(host.textContent).toContain("Your role cannot view webhook destinations.");
});
test("failed integration data is shown as unavailable rather than zero connections",async()=>{
 mockIntegration();const normal=apiRequest.getMockImplementation();
 apiRequest.mockImplementation((u,path,opts)=>path.endsWith("/webhooks")?Promise.reject(new Error("Destinations unavailable")):normal(u,path,opts));
 await act(async()=>root.render(<MemoryRouter><IntegrationsPage user={user}/></MemoryRouter>));
 expect(host.textContent).toContain("Destinations unavailable");
 expect(host.textContent).toContain("Unavailable");
 expect(host.textContent).not.toContain("Your next event starts here.");
});