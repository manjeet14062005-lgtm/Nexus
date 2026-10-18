import {useContext,useState,useEffect} from 'react';
import {Box,Button,Container,Typography,Alert,Skeleton,TextField,MenuItem} from '@mui/material';
import {NotifContext} from '../../core/appConstants';
import {NotificationList} from './NotificationList';
import {Link} from 'react-router-dom';
import './eventCenter.css';
export function NotificationsView({user}){
 const inbox=useContext(NotifContext);const [search,setSearch]=useState(inbox.filters.q);
 const changeFilters=inbox.setFilters;
 useEffect(()=>{setSearch('');},[user?.uid]);
 useEffect(()=>{const timer=setTimeout(()=>changeFilters({q:search}),300);return()=>clearTimeout(timer);},[search,changeFilters]);
 if(!user)return null;
 return <Container maxWidth="xl" className="evt-center evt-notifications" sx={{py:{xs:3,md:5}}}>
 <header className="evt-hero"><div><span className="evt-eyebrow">YOUR ATTENTION, WELL PLACED</span><Typography component="h1">A little clarity.<br/><span>Everything that matters.</span></Typography><p>Your account updates, conversations and support requests. An inbox you control.</p></div><div className="evt-hero-art" aria-hidden="true"><div className="evt-art-card">n<span className="evt-art-line"/><span className="evt-art-line short"/></div><span className="evt-orbit-dot"/></div></header>
 <div className="evt-summary"><div><small>Unread, across your inbox</small><strong>{inbox.loading||inbox.error?'—':inbox.unread}</strong></div><div><small>Matching this view</small><strong>{inbox.loading||inbox.error?'—':inbox.total}</strong></div><div><small>Delivery channel</small><strong className="evt-text-stat">In-app</strong></div></div>
 <section className="evt-panel"><div className="evt-toolbar"><div className="evt-tabs">{[['inbox','Inbox'],['unread','Unread'],['archive','Archived']].map(([value,label])=><button key={value} aria-pressed={inbox.filters.view===value} onClick={()=>inbox.setFilters({view:value})}>{label}</button>)}</div><Box sx={{display:'flex',gap:1}}><Button disabled={inbox.loading||inbox.busy||!inbox.unread} onClick={inbox.markRead}>Mark all read</Button><Button disabled={inbox.loading} onClick={inbox.refresh}>Refresh</Button></Box></div>
 <div className="evt-filters"><TextField size="small" label="Search notifications" value={search} onChange={e=>setSearch(e.target.value)} inputProps={{maxLength:120}}/><TextField size="small" select label="Category" value={inbox.filters.category} onChange={e=>inbox.setFilters({category:e.target.value})}>{['all','account','admin','message','support'].map(value=><MenuItem key={value} value={value}>{value==='all'?'All updates':value[0].toUpperCase()+value.slice(1)}</MenuItem>)}</TextField></div>
 {inbox.error&&<Alert severity="error" action={<Button onClick={inbox.refresh}>Retry</Button>} sx={{m:2}}>{inbox.error}</Alert>}
 {inbox.loading?<Box sx={{p:3}}>{[1,2,3].map(n=><Skeleton key={n} height={95}/>)}</Box>:inbox.notifs.length?<NotificationList items={inbox.notifs} mutate={inbox.mutate} busy={inbox.busy}/>:!inbox.error?<div className="evt-empty"><span>✓</span><h2>{inbox.filters.view==='unread'?'You’re all caught up.':'A quiet moment.'}</h2><p>No notifications match this view. New recorded updates appear here automatically.</p></div>:null}
 <div className="evt-pagination"><span>Page {inbox.filters.page+1} · 30 items per page</span><div><Button disabled={inbox.loading||!inbox.filters.page} onClick={()=>inbox.setFilters({page:inbox.filters.page-1})}>Previous</Button><Button disabled={inbox.loading||!inbox.hasMore} onClick={()=>inbox.setFilters({page:inbox.filters.page+1})}>Next</Button></div></div></section>
 <footer className="evt-footnote">Opening this page never marks everything read. Read and archive choices are saved to your account. Updates refresh every 30 seconds.<br/>Notifications begin with event tracking enabled; historical alerts are not reconstructed. <Link to="/account?section=preferences">Communication preferences →</Link></footer>
 </Container>;
}
