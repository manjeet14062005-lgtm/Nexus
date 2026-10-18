import {Link} from 'react-router-dom';
import {Box,Button,Typography,Chip} from '@mui/material';
import {NotificationsNoneRounded,MailOutlineRounded,SupportAgentRounded,ShieldOutlined} from '@mui/icons-material';
const icons={message:MailOutlineRounded,support:SupportAgentRounded,account:ShieldOutlined,admin:NotificationsNoneRounded};
const allowed=new Set(['/users','/activity','/account?section=activity','/messages','/support']);
export function NotificationList({items,mutate,busy,compact=false,onOpen}){
 return <div className="evt-inbox-list">{items.map(item=>{const Icon=icons[item.category] || NotificationsNoneRounded;return <article key={item.id} className={'evt-notification '+(!item.read_at?'is-unread':'')}>
 <div className="evt-notification-icon"><Icon fontSize="small"/></div><Box sx={{flex:1,minWidth:0}}><Box sx={{display:'flex',gap:1,alignItems:'center',flexWrap:'wrap'}}><Typography sx={{fontWeight:item.read_at?500:650,fontSize:15}}>{item.title}</Typography>{!item.read_at&&<span className="evt-unread-dot" aria-label="Unread"/>}</Box>
 <Typography sx={{fontSize:13,color:'#716b60',mt:.7,lineHeight:1.7}}>{item.body}</Typography>
 <Box sx={{display:'flex',gap:1,alignItems:'center',flexWrap:'wrap',mt:1}}><Chip size="small" variant="outlined" label={item.category}/><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time></Box>
 <Box sx={{display:'flex',flexWrap:'wrap',gap:1,mt:1}}>{allowed.has(item.href)&&<Button size="small" component={Link} to={item.href} onClick={()=>{if(!item.read_at)mutate('read',item.id);onOpen?.();}}>Open →</Button>}
 {!compact&&<Button size="small" disabled={busy} onClick={()=>mutate(item.read_at?'unread':'read',item.id)}>{item.read_at?'Mark unread':'Mark read'}</Button>}
 <Button size="small" disabled={busy} onClick={()=>mutate(item.archived_at?'restore':'archive',item.id)}>{item.archived_at?'Restore':'Archive'}</Button></Box></Box></article>;})}</div>;
}
