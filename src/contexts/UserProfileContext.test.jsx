import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {UserProfileProvider,useUserProfile} from './UserProfileContext';
import {onSnapshot,getDocs} from '../lib/supabaseDataCompat';
import {supabase} from '../lib/supabaseClient';
jest.mock('../lib/supabaseDataCompat',()=>({collection:jest.fn(),query:jest.fn(),where:jest.fn(),onSnapshot:jest.fn(),getDocs:jest.fn()}));
jest.mock('../lib/supabaseLegacy',()=>({db:{}}));
jest.mock('../lib/supabaseClient',()=>({supabase:{rpc:jest.fn()}}));
let root,current,callbacks;
function Consumer(){current=useUserProfile();return null;}
const render=uid=>root.render(<UserProfileProvider user={{uid}}><Consumer/></UserProfileProvider>);
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.resetAllMocks();callbacks=[];onSnapshot.mockImplementation((q,cb)=>{callbacks.push(cb);return ()=>{};});root=createRoot(document.createElement('div'));});
afterEach(()=>act(()=>root.unmount()));
test('signed-out pages render without reading an absent profile or error',async()=>{
 await act(async()=>root.render(<UserProfileProvider user={null}><Consumer/></UserProfileProvider>));
 expect(current.profile).toBeNull();expect(current.profileError).toBeNull();expect(current.profileLoading).toBe(false);expect(onSnapshot).not.toHaveBeenCalled();
});
test('late initialization never publishes a previous account into the current account',async()=>{
 let finish;supabase.rpc.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
 await act(async()=>render('old'));
 await act(async()=>{callbacks[0]({empty:true});});
 await act(async()=>render('new'));
 await act(async()=>callbacks[1]({empty:false,docs:[{id:'new',data:()=>({name:'New user'})}]}));
 await act(async()=>finish({data:{name:'Old user'}}));
 expect(current.profile.name).toBe('New user');expect(current.profile.id).toBe('new');
});
test('initialization failure stays actionable and refetch only succeeds with persisted data',async()=>{
 supabase.rpc.mockResolvedValue({error:{message:'Denied'}});
 await act(async()=>render('one'));
 await act(async()=>callbacks[0]({empty:true}));
 expect(current.profileError).toMatch(/retry/i);expect(current.profile).toBeNull();
 getDocs.mockResolvedValue({empty:true});let ok;
 await act(async()=>{ok=await current.refetch();});expect(ok).toBe(false);expect(current.profileError).toBeTruthy();
 supabase.rpc.mockResolvedValue({data:{name:'Saved'}});
 await act(async()=>{ok=await current.refetch();});expect(ok).toBe(true);expect(current.profile.name).toBe('Saved');
});
