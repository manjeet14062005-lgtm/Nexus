import {useState,useEffect,useRef,useCallback} from 'react';
import {apiRequest} from '../../../services/apiClient';
import {useUserProfile} from '../../../contexts/UserProfileContext';
export function useAccountData(user){
 const {profile,profileLoading,profileError,refetch,updateProfile}=useUserProfile();
 const identity=useRef(user);identity.current=user;
 const [revision,reload]=useState(0),[page,setEventPage]=useState(0),[side,setSide]=useState({}),[history,setHistory]=useState({});
 useEffect(()=>{setEventPage(0);},[user?.uid]);
 useEffect(()=>{
  const uid=user?.uid;if(!uid)return undefined;
  const controller=new AbortController();let active=true,pending=false;
  const load=async()=>{if(pending || document.visibilityState==='hidden')return;pending=true;
   try{const result=await apiRequest(identity.current,'/account/deletion-request',{signal:controller.signal});if(active)setSide({uid,request:result.request || null});}
   catch(error){if(active && error.name!=='AbortError')setSide(previous=>({...previous,uid,error:'Unable to load deletion status. Retry before making changes.'}));}finally{pending=false;}
  };load();const timer=setInterval(load,30000);window.addEventListener('focus',load);
  return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('focus',load);};
 },[user?.uid,revision]);
 useEffect(()=>{
  const uid=user?.uid;if(!uid)return undefined;let active=true;const controller=new AbortController();
  setHistory({uid,loading:true});
  apiRequest(identity.current,'/account/security-events?page='+page,{signal:controller.signal}).then(result=>{if(active)setHistory({uid,...result,loading:false});}).catch(error=>{if(active && error.name!=='AbortError')setHistory({uid,error:error.message,loading:false});});
  return()=>{active=false;controller.abort();};
 },[user?.uid,page,revision]);
 const refresh=useCallback(()=>{refetch();reload(v=>v+1);},[refetch]);
 return {profileData:profile,myData:profile,loading:profileLoading,profileError,updateProfile,refresh,
  deletionRequest:side.uid===user?.uid?side.request:undefined,deletionError:side.uid===user?.uid?side.error:null,
  setDeletionRequest:request=>setSide({uid:user?.uid,request}),securityEvents:history.uid===user?.uid?history.events:null,
  activityLoading:history.uid!==user?.uid || history.loading,activityError:history.uid===user?.uid?history.error:null,
  activityPage:page,activityTotal:history.total || 0,activityHasMore:history.hasMore,setEventPage};
}
