import {memo,useContext} from 'react';
import {Link} from 'react-router-dom';
import {Box,Drawer,IconButton,Typography,Button,Alert,Skeleton} from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import {NotifContext} from '../../core/appConstants';
import {NotificationList} from '../../pages/messaging/NotificationList';
import '../../pages/messaging/eventCenter.css';
export const NotificationDrawer=memo(function NotificationDrawer({open,onClose}){
 const inbox=useContext(NotifContext);
 return <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{sx:{width:{xs:'100%',sm:420},maxWidth:'100vw',bgcolor:'#fffdfa'}}}><div className="evt-center evt-notifications">
 <Box sx={{p:3,display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid #ede7dd'}}><Box><Typography className="evt-eyebrow">YOUR ATTENTION INBOX</Typography><Typography component="h2" fontSize={25}>Notifications</Typography></Box><IconButton aria-label="Close notifications" onClick={onClose}><CloseRounded/></IconButton></Box>
 <Box sx={{p:2,display:'flex',alignItems:'center',justifyContent:'space-between'}}><Typography fontSize={13}>{inbox.loading?'Loading…':inbox.error?'Unavailable':inbox.unread+' unread'} · {inbox.filters.view}</Typography><Button disabled={inbox.loading||inbox.busy||!inbox.unread} onClick={inbox.markRead}>Mark all read</Button></Box>
 {inbox.error&&<Alert severity="error" action={<Button onClick={inbox.refresh}>Retry</Button>}>{inbox.error}</Alert>}
 {inbox.loading?<Skeleton sx={{m:3}} height={100}/>:<NotificationList items={inbox.notifs} mutate={inbox.mutate} busy={inbox.busy} compact onOpen={onClose}/>}
 {!inbox.loading&&!inbox.error&&!inbox.notifs.length&&<div className="evt-empty"><h2>No matching updates.</h2><p>Your current inbox view is quiet.</p></div>}
 <Box sx={{p:3}}><Button component={Link} to="/notifications" fullWidth variant="outlined" onClick={onClose}>Open full inbox →</Button></Box></div></Drawer>;
});
