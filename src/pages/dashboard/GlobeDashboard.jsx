import {useState,useEffect} from 'react';
import {Navigate,Link} from 'react-router-dom';
import {Container,Typography,Button,TextField,MenuItem,Alert,Skeleton} from '@mui/material';
import {Globe3D} from '../../components/globe/Globe3D';
import {useAdminResource} from '../admin/useAdminResource';
import './operationsCenter.css';
export function GlobeDashboard({user,userRole}){
 const [range,setRange]=useState('all'),[selected,setSelected]=useState(''),[search,setSearch]=useState('');
 const resource=useAdminResource(user,'/admin/globe?range='+range,userRole==='admin');const data=resource.data,countries=data?.countries||[];
 useEffect(()=>{setSelected('');setSearch('');},[user?.uid,range]);
 if(!user||userRole===null)return <Skeleton height={200}/>;
 if(userRole!=='admin')return <Navigate to="/dashboard" replace/>;
 const focused=countries.find(c=>c.name===selected);
 return <Container maxWidth="xl" className="ops-center geo-center" sx={{py:{xs:3,md:5}}}>
 <header className="ops-heading"><div><span className="ops-eyebrow">NEXUS / GLOBAL PERSPECTIVE</span><Typography component="h1">A world of<br/><em>connections.</em></Typography><p>Explore where your community is growing. Every point represents a country, every count a registered account.</p></div><div className="ops-header-actions"><TextField select size="small" label="Registration period" value={range} onChange={e=>setRange(e.target.value)}>{[['all','All time'],['7','Last 7 days'],['30','Last 30 days'],['90','Last 90 days']].map(([value,label])=><MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField><Button onClick={resource.refresh} disabled={resource.refreshing}>Refresh</Button></div></header>
 <div className="ops-stats">{[['Accounts in period',data?.total],['Mapped countries',countries.length],['Accounts mapped',data?.mapped],['Location unknown',data?.unknown]].map(([label,value])=><div key={label}><small>{label}</small><strong>{resource.loading||resource.error?'—':value??'—'}</strong></div>)}</div>
 {resource.error&&<Alert severity="error" action={<Button onClick={resource.refresh}>Retry</Button>}>{resource.error}</Alert>}
 {data&&!data.complete&&<Alert severity="warning">Partial directory coverage: {data.sourceTotal} accounts exist. This view is limited to the first 10,000 accounts; totals are incomplete.</Alert>}
 <div className="geo-layout"><section className="ops-card geo-stage"><div className="ops-card-heading"><span className="ops-eyebrow">COUNTRY DISTRIBUTION</span><small>{data?'Updated '+new Date(data.updatedAt).toLocaleTimeString():'Awaiting data'}</small></div>{resource.loading?<Skeleton variant="rounded" height={460}/>:<Globe3D points={countries} selected={selected} onSelect={setSelected}/>}<p className="ops-note">Country centroids show approximate distribution, not individual locations. Outlines: Natural Earth, public domain.</p></section>
 <section className="ops-card geo-directory"><span className="ops-eyebrow">YOUR GLOBAL FOOTPRINT</span><h2>People, across places.</h2><TextField fullWidth size="small" label="Find a country" value={search} onChange={e=>setSearch(e.target.value)}/>
 <div className="geo-country-list">{countries.filter(c=>c.name.toLowerCase().includes(search.toLowerCase())).map(c=><button key={c.name} aria-pressed={selected===c.name} onClick={()=>setSelected(c.name)}><span className="geo-flag">{c.flag}</span><span><strong>{c.name}</strong><small>{data.total?Math.round(c.count/data.total*100):0}% of accounts in period</small></span><b>{c.count}</b></button>)}</div>
 {!resource.loading&&!resource.error&&!countries.length&&<p className="ops-note">No known countries in this period. Unknown locations remain included in the totals.</p>}
 {focused&&<div className="geo-selection" aria-live="polite"><small>SELECTED COUNTRY</small><h3>{focused.name}</h3><p>{focused.count} registered accounts · approximate country center</p></div>}
 <Link to="/users">Explore the account directory →</Link></section></div>
 <footer className="ops-note">Countries come from saved profile details. Unsupported or missing locations are counted as unknown. Refreshes every 30 seconds; recent periods use a rolling UTC time window. No personal names, emails or phone numbers are loaded into this map.</footer>
 </Container>;
}