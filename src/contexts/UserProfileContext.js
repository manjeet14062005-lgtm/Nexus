import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, onSnapshot, getDocs } from '../lib/supabaseDataCompat';
import { db } from '../lib/supabaseLegacy';
import { supabase } from '../lib/supabaseClient';
const UserProfileContext=createContext(null);
export function UserProfileProvider({user,children}) {
 const uid=user?.uid;
 const owner=useRef(uid);owner.current=uid;
 const generation=useRef(0),initializing=useRef(null);
 const [saved,setSaved]=useState(null),[loaded,setLoaded]=useState(null),[failure,setFailure]=useState(null);
 const publish=useCallback((id,data)=>{if(owner.current===id){setSaved({uid:id,data});setLoaded(id);setFailure(null);}},[]);
 const ensureProfile=useCallback(async(id,epoch)=>{
  if(initializing.current?.uid===id && initializing.current?.epoch===epoch)return initializing.current.promise;
  const promise=(async()=>{
   const {data,error}=await supabase.rpc('ensure_user_profile');
   if(owner.current!==id || generation.current!==epoch)return false;
   if(error || !data){setFailure({uid:id,message:'Could not initialize your saved profile. Please retry.'});setLoaded(id);return false;}
   publish(id,{...data,id});return true;
  })().catch(()=>{if(owner.current===id && generation.current===epoch){setFailure({uid:id,message:'Could not initialize your saved profile. Please retry.'});setLoaded(id);}return false;});
  initializing.current={uid:id,epoch,promise};
  try{return await promise;}finally{if(initializing.current?.promise===promise)initializing.current=null;}
 },[publish]);
 const choose=useCallback((snap,id)=>{
  const docs=snap.docs.map(d=>({...d.data(),id:d.id}));
  return docs.find(d=>d.id===id) || docs.sort((a,b)=>String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || a.id.localeCompare(b.id))[0];
 },[]);
 const refetch=useCallback(async()=>{
  if(!uid)return false;const epoch=generation.current;
  try{const snap=await getDocs(query(collection(db,'users'),where('submitterUid','==',uid)));
   if(owner.current!==uid || epoch!==generation.current)return false;
   if(snap.empty)return await ensureProfile(uid,epoch);
   publish(uid,choose(snap,uid));return true;
  }catch{if(owner.current===uid && epoch===generation.current){setFailure({uid,message:'Could not load your profile. Please retry.'});setLoaded(uid);}return false;}
 },[uid,ensureProfile,publish,choose]);
 useEffect(()=>{
  const epoch=++generation.current;setSaved(null);setLoaded(null);setFailure(null);initializing.current=null;
  if(!uid)return undefined;
  const unsubscribe=onSnapshot(query(collection(db,'users'),where('submitterUid','==',uid)),async snap=>{
   if(owner.current!==uid || generation.current!==epoch)return;
   if(snap.empty)await ensureProfile(uid,epoch);else publish(uid,choose(snap,uid));
  },()=>{if(owner.current===uid && generation.current===epoch){setLoaded(uid);setFailure({uid,message:'Could not load your profile. Please retry.'});}});
  return()=>{unsubscribe();};
 },[uid,ensureProfile,publish,choose]);
 const updateProfile=useCallback((fields,expectedUid=uid)=>{if(owner.current===expectedUid)setSaved(previous=>previous?.uid===expectedUid?{...previous,data:{...previous.data,...fields}}:previous);},[uid]);
 return <UserProfileContext.Provider value={{profile:uid && saved?.uid===uid?saved.data:null,profileLoading:!!uid && loaded!==uid,profileError:uid && failure?.uid===uid?failure.message:null,refetch,updateProfile}}>{children}</UserProfileContext.Provider>;
}
export function useUserProfile(){const ctx=useContext(UserProfileContext);if(!ctx)throw new Error('useUserProfile must be used inside <UserProfileProvider>');return ctx;}
