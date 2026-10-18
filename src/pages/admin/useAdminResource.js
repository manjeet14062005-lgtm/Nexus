import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../services/apiClient';

export function useAdminResource(user, path, enabled = true) {
 const currentUser = useRef(user); currentUser.current = user;
 const [revision,setRevision] = useState(0);
 const [state,setState] = useState({data:null,error:'',loading:true,refreshing:false});
 const refresh = useCallback(()=>setRevision(v=>v+1),[]);
 const uid = user?.uid;
 const scope=JSON.stringify([uid,path,enabled]);
 useEffect(()=> {
 if(!uid || !enabled) { setState({scope,data:null,error:'',loading:false,refreshing:false}); return; }
 const controller=new AbortController(); let active=true;
 setState({scope,data:null,error:'',loading:true,refreshing:false});
 let pending=false;
 async function load() {
 if(pending || document.visibilityState==='hidden') return;
 pending=true;
 setState(previous=>({...previous,refreshing:true}));
 try { const data=await apiRequest(currentUser.current,path,{signal:controller.signal});
 if(active) setState({scope,data,error:'',loading:false,refreshing:false}); }
 catch(error) { if(active && error.name!=='AbortError') {
 setState(previous=>({...previous,data:error.status===403?null:previous.data,error:error.message,loading:false,refreshing:false}));
 if(error.status===403) window.dispatchEvent(new Event('nexus:auth-context-refresh'));
 }} finally {pending=false;}
 }
 void load(); const timer=setInterval(load,30000);
 document.addEventListener('visibilitychange',load);
 return ()=>{ active=false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange',load); };
 },[uid,path,enabled,revision,scope]);
 return {...(state.scope===scope?state:{data:null,error:'',loading:Boolean(uid&&enabled),refreshing:false}),refresh};
}
