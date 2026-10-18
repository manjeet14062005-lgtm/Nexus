import { Link } from 'react-router-dom';
import { Alert, Avatar, Button, CircularProgress } from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import './admin.css';
export const dateLabel = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}) : 'Not available';
export function Identity({row,large=false}) {
 return <div className={`adm-identity ${large?'adm-identity-large':''}`}><Avatar src={row.photoUrl || undefined} alt={row.name || 'User'} sx={{width:large?60:38,height:large?60:38,bgcolor:'#edf2f8',color:'#344b68',fontSize:large?24:14}}>{(row.name || row.email || '?')[0].toUpperCase()}</Avatar><div><strong>{row.name || 'Unnamed account'}</strong><span>{row.email || 'No email address'}</span></div></div>;
}
export function Badge({children,tone='neutral'}) { return <span className={`adm-badge adm-badge-${tone}`}>{children}</span>; }
export function AdminHeader({eyebrow,title,description,resource,children}) {
 return <header className="adm-header"><div><div className="adm-eyebrow"><ShieldOutlined fontSize="inherit"/>{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><div className="adm-header-actions">{children}<Button onClick={resource.refresh} disabled={resource.refreshing} startIcon={resource.refreshing?<CircularProgress size={14}/>:<RefreshRounded/>}>Refresh</Button><small>{resource.data?.updatedAt ? `Updated ${new Date(resource.data.updatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`:'Waiting for data'} · 30s refresh</small></div></header>;
}
export function ResourceNotice({resource}) { return <>{resource.error && <Alert severity="error" action={<Button color="inherit" onClick={resource.refresh}>Retry</Button>}>{resource.error}{resource.data?' Displaying the last successful snapshot.':''}</Alert>}{resource.data?.readOnly && <Alert severity="info">Read-only preview. Account actions and audited exports will become available after the administrative database migration is approved and applied.</Alert>}</>; }
export function Metric({label,value,detail,icon}) { return <div className="adm-metric"><div>{label}{icon}</div><strong>{value ?? '—'}</strong><small>{detail}</small></div>; }
export function AdminLink({to,children}) { return <Button component={Link} to={to} endIcon={<ArrowForwardRounded/>}>{children}</Button>; }
