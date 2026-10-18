import {useState} from 'react';
import {Box,TextField,Button,Grid,Alert} from '@mui/material';
import {BentoBox} from './BentoBox';
import {AccountPhone} from './AccountPhone';
import {useAccountDraft} from '../hooks/useAccountDraft';
const fields=['name','country','bio'];
export function SectionProfile({user,profileData,actions}){
 const draft=useAccountDraft(user.uid,'profile',{name:profileData?.name||'',country:profileData?.country||'',bio:profileData?.bio||''},fields);
 const [feedback,setFeedback]=useState(null);
 const save=async e=>{e.preventDefault();if(!draft.dirty||!draft.values.name.trim()||actions.saving)return;
 const patch=Object.fromEntries(Object.entries(draft.changes).map(([k,v])=>[k,v.trim()]));
 const ok=await actions.saveProfile(patch);if(ok)draft.reset();setFeedback(ok?'saved':'error');};
 return <Box component="form" onSubmit={save} sx={{display:'grid',gap:3}}>
 <BentoBox title="Personal information" subtitle="Your identity, consistent across Nexus.">
 {draft.dirty&&<Alert severity="info" sx={{mb:3}}>Unsaved changes are kept in this tab when you switch sections.</Alert>}
 {feedback&&<Alert severity={feedback==='saved'?'success':'error'} sx={{mb:3}}>{feedback==='saved'?'Your profile has been updated.':'Unable to save. Your draft is still available.'}</Alert>}
 <Grid container spacing={3}>
 <Grid item xs={12} sm={6}><TextField fullWidth required label="Name" value={draft.values.name} inputProps={{maxLength:100}} disabled={actions.saving} onChange={e=>draft.change('name',e.target.value)}/></Grid>
 <Grid item xs={12} sm={6}><TextField fullWidth label="Email" value={user.email||''} InputProps={{readOnly:true}} helperText="Managed by your sign-in provider."/></Grid>
 <Grid item xs={12} sm={6}><AccountPhone key={user.uid} user={user} profileData={profileData}/></Grid>
 <Grid item xs={12} sm={6}><TextField fullWidth label="Country (optional)" value={draft.values.country} inputProps={{maxLength:100}} disabled={actions.saving} onChange={e=>draft.change('country',e.target.value)}/></Grid>
 <Grid item xs={12}><TextField fullWidth label="About you (optional)" multiline rows={3} value={draft.values.bio} inputProps={{maxLength:160}} disabled={actions.saving} helperText={draft.values.bio.length+'/160 characters'} onChange={e=>draft.change('bio',e.target.value)}/></Grid>
 </Grid><Box sx={{mt:3,display:'flex',justifyContent:'flex-end',gap:1}}><Button disabled={!draft.dirty||actions.saving} onClick={()=>{draft.reset();setFeedback(null);}}>Discard changes</Button><Button type="submit" variant="contained" disabled={!draft.dirty||!draft.values.name.trim()||actions.saving}>{actions.saving?'Saving…':'Save changes'}</Button></Box>
 </BentoBox></Box>;
}
