import {useState,useEffect,useRef,useCallback,useMemo} from 'react';
import {NotifContext} from '../../core/appConstants';
import {apiRequest} from '../../services/apiClient';
export function NotifProvider({children,user}){
 const [filters,setFilters]=useState({view:'inbox',category:'all',q:'',page:0});
 const [revision,setRevision]=useState(0),[state,setState]=useState({}),[busy,setBusy]=useState(false);
 const current=useRef(user);current.current=user;const lock=useRef(false);
 const uid=user?.uid;
 const refresh=useCallback(()=>setRevision(v=>v+1),[]);
 useEffect(()=>{window.addEventListener('nexus:notification-role-refresh',refresh);return()=>window.removeEventListener('nexus:notification-role-refresh',refresh);},[refresh]);
 const changeFilters=useCallback(patch=>setFilters(previous=>({...previous,...patch,page:patch.page??0})),[]);
 const params=useMemo(()=>new URLSearchParams(filters).toString(),[filters]);
 useEffect(()=>{setFilters({view:'inbox',category:'all',q:'',page:0});setBusy(false);},[uid]);
 useEffect(()=>{
 if(!uid){setState({});return undefined;}let active=true,pending=false;const abort=new AbortController();
 const load=async()=>{if(pending||document.visibilityState==='hidden')return;pending=true;
 try{const result=await apiRequest(current.current,'/notifications?'+params,{signal:abort.signal});if(active)setState({uid,params,...result,error:'',loading:false});}
 catch(error){if(active&&error.name!=='AbortError')setState(previous=>({...previous,uid,params,error:error.message,loading:false}));}
 finally{pending=false;}};
 setState({uid,params,loading:true});load();const interval=setInterval(load,30000);
 window.addEventListener('focus',load);document.addEventListener('visibilitychange',load);window.addEventListener('nexus:auth-context-refresh',load);
 return()=>{active=false;abort.abort();clearInterval(interval);window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',load);window.removeEventListener('nexus:auth-context-refresh',load);};
 },[uid,params,revision]);
 const safe=state.uid===uid&&state.params===params?state:{loading:!!uid};
 const mutate=useCallback(async(action,id)=>{
 if(lock.current||!current.current)return false;lock.current=true;setBusy(true);const owner=current.current.uid;
 try{await apiRequest(current.current,'/notifications/actions',{method:'POST',body:JSON.stringify({action,id,cutoff:state.cutoff})});if(current.current?.uid===owner)refresh();return true;}
 catch(error){if(current.current?.uid===owner)setState(previous=>({...previous,error:error.message}));return false;}
 finally{lock.current=false;if(current.current?.uid===owner)setBusy(false);}
 },[state.cutoff,refresh]);
 const value={notifs:safe.items || [],unread:safe.unread || 0,total:safe.total || 0,hasMore:!!safe.hasMore,loading:!!safe.loading,error:safe.error || '',busy,filters,
 setFilters:changeFilters,refresh,mutate,markRead:()=>mutate('read_all')};
 return <NotifContext.Provider value={value}>{children}</NotifContext.Provider>;
}
