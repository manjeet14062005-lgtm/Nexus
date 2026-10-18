import {Box,Typography,Switch,FormControlLabel,Button,Alert} from '@mui/material';
import {BentoBox} from './BentoBox';
import {useAccountDraft} from '../hooks/useAccountDraft';
const keys=['securityAlerts','weeklyDigest','marketingEmails'];
const labels={securityAlerts:['Security alerts','Account security updates.'],weeklyDigest:['Weekly digest','A summary of workspace activity.'],marketingEmails:['Product updates','News about features and offers.']};
export function SectionPreferences({user,profileData,actions}){
 const draft=useAccountDraft(user.uid,'preferences',{securityAlerts:profileData?.securityAlerts!==false,weeklyDigest:Boolean(profileData?.weeklyDigest),marketingEmails:Boolean(profileData?.marketingEmails)},keys);
 return <BentoBox title="Communication preferences" subtitle="Choose the updates you would like to receive.">
 <Alert severity="info" sx={{mb:3}}>These choices are saved to your account. Automated email delivery for these preferences is not enabled yet. Required verification messages are separate.</Alert>
 {keys.map(key=><Box key={key} sx={{py:2,borderBottom:'1px solid var(--acct-border)'}}><FormControlLabel control={<Switch checked={draft.values[key]} disabled={actions.saving} onChange={e=>draft.change(key,e.target.checked)}/>} label={<Box><Typography fontWeight={600}>{labels[key][0]}</Typography><Typography color="text.secondary" fontSize={13}>{labels[key][1]}</Typography></Box>}/></Box>)}
 <Box sx={{mt:3,display:'flex',justifyContent:'flex-end',gap:1}}><Button disabled={!draft.dirty||actions.saving} onClick={draft.reset}>Discard changes</Button><Button variant="contained" disabled={!draft.dirty||actions.saving} onClick={async()=>{if(await actions.savePreferences(draft.changes))draft.reset();}}>{actions.saving?'Saving…':'Save preferences'}</Button></Box></BentoBox>;
}
