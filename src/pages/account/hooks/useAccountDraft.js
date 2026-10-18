import {useState,useEffect,useCallback} from 'react';
export function useAccountDraft(uid,kind,source,keys){
 const storageKey='nexus:account-draft:'+uid+':'+kind;
 const [draft,setDraft]=useState(()=>{try{const saved=JSON.parse(sessionStorage.getItem(storageKey));return saved && typeof saved==="object" && !Array.isArray(saved)?Object.fromEntries(Object.entries(saved).filter(([key,value])=>keys.includes(key) && typeof value===typeof source[key])):{};}catch{return {};}});
 const changes=Object.fromEntries(Object.entries(draft).filter(([key,value])=>keys.includes(key) && value!==(source?.[key] ?? (typeof value==='boolean'?false:''))));
 const dirty=Object.keys(changes).length>0;
 useEffect(()=>{try{if(dirty)sessionStorage.setItem(storageKey,JSON.stringify(changes));else sessionStorage.removeItem(storageKey);}catch{}},[storageKey,dirty,changes]);
 useEffect(()=>{if(!dirty)return undefined;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const change=useCallback((key,value)=>setDraft(previous=>({...previous,[key]:value})),[]);
 const reset=()=>{setDraft({});try{sessionStorage.removeItem(storageKey);}catch{}};
 return {values:{...source,...draft},changes,dirty,change,reset};
}
