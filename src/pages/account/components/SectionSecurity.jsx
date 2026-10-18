import {useState} from 'react';
import {Box,Typography,Button,Alert,Chip,Dialog,DialogTitle,DialogContent,DialogActions} from '@mui/material';
import {BentoBox} from './BentoBox';
import {signInMethods} from '../../../lib/signInMethods';
export function SectionSecurity({user,actions}){
 const methods=signInMethods(user),[confirm,setConfirm]=useState(false);
 return <Box sx={{display:'grid',gap:3}}>
  <BentoBox title="Sign-in methods" subtitle="Your connected identity providers." spotlight={false}><Box sx={{display:'flex',gap:1,mb:2}}>{methods.labels.map(m=><Chip key={m} label={m} variant="outlined"/>)}</Box>
   {methods.email && <Box sx={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:2,flexWrap:'wrap'}}><Typography sx={{fontSize:14,color:'var(--acct-muted)'}}>Use a secure email link to choose a new Nexus password.</Typography><Button variant="outlined" disabled={actions.pending} onClick={actions.resetPassword}>Send password reset email</Button></Box>}
   {methods.google && <Typography sx={{fontSize:14,color:'var(--acct-muted)',mt:2}}>Google credentials are managed in your Google account. Linked email sign-in remains available when connected.</Typography>}
  </BentoBox>
  <BentoBox title="Sign out across devices" subtitle="End refresh sessions for this Nexus account." spotlight={false}><Typography sx={{fontSize:14,color:'var(--acct-muted)',mb:3}}>This browser signs out too. Existing access tokens may remain valid until they expire. Nexus does not currently expose an individual device list.</Typography><Button variant="outlined" color="error" disabled={actions.pending} onClick={()=>setConfirm(true)}>Sign out everywhere</Button></BentoBox>
  <Alert severity="info">Verified phone numbers are locked. Account recovery and a verified-number replacement require support.</Alert>
  <Dialog open={confirm} onClose={()=>!actions.pending && setConfirm(false)}><DialogTitle>Sign out of Nexus everywhere?</DialogTitle><DialogContent>Other browsers will need to sign in again after their current access tokens expire. This browser will sign out immediately after the request succeeds.</DialogContent><DialogActions><Button onClick={()=>setConfirm(false)}>Keep sessions</Button><Button color="error" disabled={actions.pending} onClick={()=>{setConfirm(false);actions.revokeAllSessions();}}>Confirm sign out</Button></DialogActions></Dialog>
 </Box>;
}
