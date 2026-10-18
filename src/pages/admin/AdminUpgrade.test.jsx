import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {Simulate} from 'react-dom/test-utils';
import {MemoryRouter} from 'react-router-dom';
import {UserManagement} from './UserManagement';
import {AdminDashboard} from './AdminDashboard';
import {apiRequest,apiDownload} from '../../services/apiClient';
jest.mock('../../services/apiClient',()=>({apiRequest:jest.fn(),apiDownload:jest.fn()}));
jest.mock('../account/components/PasswordReauth',()=>({PasswordReauth:()=>null}));
const user={uid:'admin'},accounts=[{id:'a',name:'Alice',email:'alice@example.test',role:'user',status:'active',emailVerified:true,phoneVerified:false,phone:'123',createdAt:'2026-09-30T00:00:00Z',version:'2026-09-30T00:00:00Z',photoUrl:'https://example.test/alice.png'},{id:'b',name:'Bob',email:'bob@example.test',role:'user',status:'active',emailVerified:false,phoneVerified:true,phone:'+123456789',createdAt:'2026-09-29T00:00:00Z',version:null}];
let host,root;
const button=text=>[...document.querySelectorAll('button')].find(el=>el.textContent===text);
const field=label=>[...document.querySelectorAll('input,textarea')].find(el=>document.querySelector(`label[for="${el.id}"]`)?.textContent.startsWith(label));
const update=(el,value)=>act(()=>{el.value=value;Simulate.change(el,{target:el});});
async function click(el){await act(async()=>el.click());}
async function mount(Component=UserManagement,props={}){await act(async()=>root.render(<MemoryRouter><Component user={user} userRole="admin" {...props}/></MemoryRouter>));}
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
 host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
 apiRequest.mockImplementation(async(_user,path,options)=>{
 if(options?.method)return {success:true};
 if(path.includes('/activity'))return {events:[]};
 if(path==='/admin/overview')return {total:2,emailVerified:1,phoneVerified:1,admins:1,suspended:0,today:0,week:1,previousWeek:0,trend:null,pendingSupport:0,pendingDeletion:0,daily:[{date:'2026-10-02',value:0}],updatedAt:'2026-10-02T10:00:00Z'};
 if(path==='/admin/system/health')return {readiness:{ready:true,database:true,warnings:[]},workers:{webhook:true}};
 if(path.includes('account-deletion-requests'))return {requests:[]};
 return {rows:accounts,total:2,page:0,pageSize:20,updatedAt:'2026-10-02T10:00:00Z'};
 });
});
afterEach(()=>{act(()=>root.unmount());host.remove();jest.useRealTimers();});
test('directory renders names, single emails, photos and verified flags separately',async()=>{
 await mount();const row=host.querySelector('tbody tr');expect(row.textContent).toContain('Alice');expect(row.querySelector('img').getAttribute('src')).toContain('alice.png');expect(row.textContent.match(/alice@example.test/g)).toHaveLength(1);expect(row.textContent).not.toContain('Phone verified');
});
test('migration-pending preview disables mutations and exports while keeping the directory usable',async()=>{
 const normal=apiRequest.getMockImplementation();apiRequest.mockImplementation(async(...args)=>({...await normal(...args),readOnly:true}));
 await mount();expect(button('Export this page').disabled).toBe(true);await click(document.querySelector('button[aria-label="View Alice"]'));expect(button('Edit profile').disabled).toBe(true);expect(button('Request deletion').disabled).toBe(true);expect(apiDownload).not.toHaveBeenCalled();
});
test('changing a view clears selected users so bulk actions cannot target hidden accounts',async()=>{
 await mount();await click(host.querySelector('tbody input[type="checkbox"]'));expect(host.textContent).toContain('1 selected on this page');await click(button('Awaiting confirmation'));expect(host.textContent).not.toContain('selected on this page');
});
test('bulk actions require a reason and disclose per-account failures',async()=>{
 const normal=apiRequest.getMockImplementation();apiRequest.mockImplementation((u,path,opts)=>opts?.method && path.includes('/b/')?Promise.reject(new Error('Protected account')):normal(u,path,opts));
 await mount();await click(host.querySelector('thead input[type="checkbox"]'));await click(button('Restrict access'));expect(button('Confirm action').disabled).toBe(true);update(field('Reason for this action'),'Confirmed support request');await click(button('Confirm action'));
 expect(host.textContent).toContain('1 succeeded · 1 failed');expect(host.textContent).toContain('Protected account');const writes=apiRequest.mock.calls.filter(([, ,opts])=>opts?.method);expect(writes).toHaveLength(2);expect(JSON.parse(writes[0][2].body).reason).toBe('Confirmed support request');expect(button('Confirm action').disabled).toBe(true);
});
test('profile edit preserves the fetched version and does not expose email or phone inputs',async()=>{
 await mount();await click(document.querySelector('button[aria-label="View Alice"]'));await click(button('Edit profile'));expect(field('Email')).toBeUndefined();expect(field('Phone')).toBeUndefined();update(field('Name'),'Alice Updated');update(field('Reason for this action'),'Customer requested correction');await click(button('Confirm action'));
 const write=apiRequest.mock.calls.find(([, ,opts])=>opts?.method);const body=JSON.parse(write[2].body);expect(body.version).toBe(accounts[0].version);expect(body.changes.name).toBe('Alice Updated');expect(body.changes.email).toBeUndefined();
});
test('a late response from a previous administrator cannot populate a different account',async()=>{
 let resolve;apiRequest.mockImplementation(()=>new Promise(done=>{resolve=done;}));await mount();const old=resolve;apiRequest.mockResolvedValue({rows:[{...accounts[1],name:'New account view'}],total:1,page:0});await mount(UserManagement,{user:{uid:'other-admin'}});await act(async()=>old({rows:[{...accounts[0],name:'Stale private record'}],total:1,page:0}));expect(host.textContent).not.toContain('Stale private record');expect(host.textContent).toContain('New account view');
});
test('failed directory reads show errors, never a misleading empty account state',async()=>{
 apiRequest.mockRejectedValue(new Error('Directory unavailable'));await mount();expect(host.textContent).toContain('Directory unavailable');expect(host.textContent).not.toContain('No accounts yet.');
});
test('overview reports honest evidence-based insights and worker configuration',async()=>{
 await mount(AdminDashboard);expect(host.textContent).toContain('Rules-based insights');expect(host.textContent).toContain('no baseline');expect(host.textContent).toContain('Worker heartbeats are not available');expect(host.textContent).not.toContain('AI Assistant');expect(host.querySelector('[role="img"]').getAttribute('aria-label')).toContain('2026-10-02: 0');
});
