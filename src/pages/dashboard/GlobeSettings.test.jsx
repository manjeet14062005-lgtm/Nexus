import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {GlobeDashboard} from './GlobeDashboard';
import {SystemSettings} from './SystemSettings';
import {apiRequest} from '../../services/apiClient';
jest.mock('../../services/apiClient',()=>({apiRequest:jest.fn()}));
jest.mock('../../components/globe/Globe3D',()=>({Globe3D:()=> <div>Interactive globe</div>}));
let host,root;
const admin={uid:'admin'};
const geo={total:5,mapped:3,unknown:2,complete:true,sourceTotal:5,updatedAt:'2026-10-03T10:00:00Z',countries:[{name:'India',count:3,flag:'🇮🇳',lat:20,lng:78}]};
const health={timestamp:'2026-10-03T10:00:00Z',services:{supabase:true,processRole:'api',production:false},readiness:{ready:false,database:true,blocking:['Production origin required'],warnings:['Email delivery untested']},workers:{webhook:false,automation:false,reports:false}};
const button=text=>[...host.querySelectorAll('button')].find(el=>el.textContent===text);
async function mount(Component=GlobeDashboard,props={},entry='/globe'){await act(async()=>root.render(<MemoryRouter initialEntries={[entry]}><Component user={admin} userRole="admin" {...props}/></MemoryRouter>));}
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);apiRequest.mockImplementation(async(_user,path)=>path.includes('/globe')?geo:path.includes('/health')?health:{requests:[],total:0,hasMore:false});});
afterEach(()=>{act(()=>root.unmount());host.remove();});
test('globe exposes unknown coverage and keyboard-accessible country selection',async()=>{
 await mount();expect(host.textContent).toContain('Location unknown');expect(host.textContent).toContain('No personal names');const country=host.querySelector('button[aria-pressed]');expect(country.tagName).toBe('BUTTON');await act(async()=>country.click());expect(host.textContent).toContain('SELECTED COUNTRY');expect(country.getAttribute('aria-pressed')).toBe('true');expect(host.textContent).toContain('3 registered accounts');
});
test('failed globe reads show retry and never fake empty-country success',async()=>{
 apiRequest.mockRejectedValue(new Error('Directory unavailable'));await mount();expect(host.textContent).toContain('Directory unavailable');expect(button('Retry')).toBeDefined();expect(host.textContent).not.toContain('No known countries in this period');
});
test('non-administrators never request geographic data',async()=>{
 await mount(GlobeDashboard,{userRole:'user'});expect(apiRequest).not.toHaveBeenCalled();expect(host.textContent).not.toContain('Interactive globe');
});
test('Settings distinguishes configuration from runtime and shows readiness problems',async()=>{
 await mount(SystemSettings,{},'/settings');expect(host.textContent).toContain('Production origin required');expect(host.textContent).toContain('Email delivery untested');expect(host.textContent).toContain('Runtime heartbeat is not collected');expect(host.textContent).toContain('Disabled in configuration');expect(host.textContent).toContain('Action required');
});
test('failed deletion queue reads show retry instead of no pending requests',async()=>{
 apiRequest.mockImplementation(async(_user,path)=>{if(path.includes('/health'))return health;throw new Error('Queue unavailable');});await mount(SystemSettings,{},'/settings?section=data');expect(host.textContent).toContain('Queue unavailable');expect(host.textContent).not.toContain('No requests with this status');expect(button('Next').disabled).toBe(true);expect(host.textContent).toContain('Backup and restore capability has not been verified');
});
test('queue next page requests only its next slice',async()=>{
 apiRequest.mockImplementation(async(_user,path)=>path.includes('/health')?health:{requests:[{uid:'u',email:'request@example.test',status:'pending'}],total:31,hasMore:!path.includes('page=1')});await mount(SystemSettings,{},'/settings?section=data');await act(async()=>button('Next').click());expect(apiRequest.mock.calls.some(([,path])=>path.includes('status=pending&page=1'))).toBe(true);expect(button('Next').disabled).toBe(true);
});
test('a late globe response cannot replace a different administrator’s data',async()=>{
 let resolve;apiRequest.mockImplementation(()=>new Promise(done=>{resolve=done;}));await mount();const old=resolve;apiRequest.mockResolvedValue({...geo,countries:[{name:'Canada',count:3}]});await mount(GlobeDashboard,{user:{uid:'other'}});await act(async()=>old(geo));expect(host.textContent).not.toContain('India');expect(host.textContent).toContain('Canada');
});
