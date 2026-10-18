import {Box,Typography,Button,Chip,Grid} from '@mui/material';
import {BentoBox} from './BentoBox';
import {AvatarUploader} from './AvatarUploader';
import {signInMethods} from '../../../lib/signInMethods';
export function SectionOverview({user,userRole,profileData,actions,onNavigate,deletionRequest,deletionError}){
 const phone=profileData?.phoneVerified===true && !!profileData?.phone;
 const methods=signInMethods(user);
 const role=userRole==='admin'?'Platform administrator':userRole==='moderator'?'Moderator':userRole?'Member':'Checking access';
 return <Box className="acct-overview" sx={{display:'grid',gap:3}}>
  <BentoBox highlight spotlight={false}><Box className="acct-identity">
   <AvatarUploader url={profileData?.photoUrl || user?.photoURL} name={profileData?.name || user.displayName} onUpload={actions.uploadAvatar} size={88}/>
   <Box sx={{flex:1,minWidth:0}}><Typography className="acct-eyebrow">YOUR NEXUS IDENTITY</Typography><Typography component="h2" sx={{fontSize:{xs:28,md:36},fontWeight:500,letterSpacing:'-.04em',mt:1}}>{profileData?.name || user.displayName || 'Your account'}</Typography><Typography sx={{color:'var(--acct-muted)',overflowWrap:'anywhere',mt:1}}>{user.email}</Typography><Box sx={{display:'flex',gap:1,flexWrap:'wrap',mt:2}}><Chip size="small" label={role}/>{methods.labels.map(label=><Chip key={label} size="small" variant="outlined" label={label}/>)}</Box></Box>
   <Button variant="contained" onClick={()=>onNavigate('profile')}>Manage profile ↗</Button>
  </Box></BentoBox>
  <Grid container spacing={2}>{[
   ['Email identity',user.emailVerified?'Confirmed':'Confirmation needed','Your sign-in email stays tied to your account.','security'],
   ['Phone identity',phone?'Verified & locked':'Verification needed',phone?'Your verified number cannot be changed manually.':'Add and verify your phone in Profile.','profile'],
   ['Account lifecycle',deletionError?'Status unavailable':deletionRequest===undefined?'Checking status':deletionRequest?.status==='pending'?'Deletion scheduled':deletionRequest?.status==='processing'?'Cleanup in progress':deletionRequest?.status==='failed'?'Recovery needed':deletionRequest?.status==='blocked'?'Deletion blocked':'No deletion scheduled','Review exports, retention and account removal.','privacy']
  ].map(([title,status,description,section])=><Grid key={title} item xs={12} md={4}><BentoBox title={title} spotlight={false} sx={{height:"100%"}}><Typography component="h3" sx={{fontSize:21,fontWeight:500,mb:1}}>{status}</Typography><Typography sx={{fontSize:13,color:'var(--acct-muted)',minHeight:44}}>{description}</Typography><Button onClick={()=>onNavigate(section)} sx={{mt:2}}>Review {title.toLowerCase()} →</Button></BentoBox></Grid>)}</Grid>
  <BentoBox title="Make this account yours" subtitle="Optional details personalize Nexus. They do not determine account security." spotlight={false}>
   <Box sx={{display:'flex',gap:2,flexWrap:'wrap',alignItems:'center',justifyContent:'space-between'}}><Typography sx={{color:'var(--acct-muted)',fontSize:14}}>Keep your name and photo recognizable to the people you work with.</Typography><Button onClick={()=>onNavigate('profile')}>Edit personal details</Button></Box>
  </BentoBox>
 </Box>;
}
