import React,{act,useContext} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {NotifProvider} from '../../components/common/NotifProvider';
import {NotificationDrawer} from '../../components/common/NotificationDrawer';
import {NotifContext} from '../../core/appConstants';
import {NotificationsView} from './NotificationsView';
import {ActivityLogsPage} from '../dashboard/ActivityLogsPage';
import {apiRequest} from '../../services/apiClient';
jest.mock('../../services/apiClient',()=>({apiRequest:jest.fn(),apiDownload:jest.fn()}));
const user={uid:'first'},item={id:'00000000-0000-4000-8000-000000000002',title:'Recorded update',body:'Your profile changed.',category:'account',href:'/account?section=activity',created_at:'2026-10-03T00:00:00Z',read_at:null,archived_at:null};
let host,root,inbox;
function Probe(){inbox=useContext(NotifContext);return <span>{inbox.notifs.map(n=>n.title).join(',')}</span>;}
async function mount(uid=user.uid,children=<Probe/>){await act(async()=>root.render(<MemoryRouter><NotifProvider user={{uid}}>{children}</NotifProvider></MemoryRouter>));}
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});jest.clearAllMocks();host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);apiRequest.mockResolvedValue({items:[item],total:1,unread:1,cutoff:'2026-10-03T00:01:00Z'});});
afterEach(()=>{act(()=>root.unmount());host.remove();jest.useRealTimers();});
test('account switching immediately clears private items and ignores a late response',async()=>{
 await mount();expect(host.textContent).toContain('Recorded update');
 let oldResolve;apiRequest.mockImplementation(()=>new Promise(resolve=>{oldResolve=resolve;}));
 await act(async()=>inbox.refresh());const late=oldResolve;
 apiRequest.mockResolvedValue({items:[{...item,title:'Second account only'}],total:1,unread:1});
 await mount('second');await act(async()=>late({items:[{...item,title:'Stale private update'}],total:1,unread:1}));
 expect(host.textContent).toContain('Second account only');expect(host.textContent).not.toContain('Stale private update');expect(host.textContent).not.toContain('Recorded update');
});
test('opening the notification page does not acknowledge alerts and explicit bulk action uses its snapshot cutoff',async()=>{
 await mount(user.uid,<NotificationsView user={user}/>);
 expect(apiRequest.mock.calls.some(([, ,options])=>options?.method)).toBe(false);
 await act(async()=>button('Mark all read').click());
 const write=apiRequest.mock.calls.find(([, ,options])=>options?.method);
 expect(write[0].uid).toBe(user.uid);expect(JSON.parse(write[2].body)).toEqual({action:'read_all',cutoff:'2026-10-03T00:01:00Z'});
});
test('closing the drawer never marks unseen alerts read',async()=>{
 const close=jest.fn();await mount(user.uid,<NotificationDrawer open onClose={close}/>);
 await act(async()=>document.querySelector('button[aria-label="Close notifications"]').click());
 expect(close).toHaveBeenCalledTimes(1);expect(apiRequest.mock.calls.some(([, ,options])=>options?.method)).toBe(false);
});
test('unavailable inbox shows an error instead of claiming zero updates or an empty success state',async()=>{
 apiRequest.mockRejectedValue(new Error('Event service unavailable'));
 await mount(user.uid,<NotificationsView user={user}/>);
 expect(host.textContent).toContain('Event service unavailable');expect(host.textContent).not.toContain('A quiet moment.');
 expect([...host.querySelectorAll('.evt-summary strong')].slice(0,2).map(el=>el.textContent)).toEqual(['—','—']);
});
test('moderators cannot fetch the platform audit feed',async()=>{
 await act(async()=>root.render(<MemoryRouter><ActivityLogsPage user={user} userRole="moderator"/></MemoryRouter>));
 expect(apiRequest).not.toHaveBeenCalled();expect(host.textContent).not.toContain('PLATFORM AUDIT CONSOLE');
});
test('audit inspector shows actual changes and paging requests the next filtered page',async()=>{
 apiRequest.mockResolvedValue({events:[{id:'account:1',source:'account',type:'profile_updated',actor:'Alice',target:'Alice',created_at:item.created_at,details:{fields:['name']}}],total:31,hasMore:true,counts:{account:31,admin:0,registration:0}});
 await act(async()=>root.render(<MemoryRouter><ActivityLogsPage user={user} userRole="admin"/></MemoryRouter>));
 await act(async()=>button('Inspect ↗').click());expect(document.body.textContent).toContain('Changed fields: name');
 expect(host.textContent).not.toContain('Backup completed');await act(async()=>button('Next').click());
 expect(apiRequest.mock.calls.some(([,path])=>path.includes('page=1'))).toBe(true);
});