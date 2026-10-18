export function signInMethods(user){
 const providers=new Set([...(user?.identities || []).map(i=>i.provider),...(user?.app_metadata?.providers || [])]);
 if(!providers.size)providers.add(user?.app_metadata?.provider || 'email');
 return {google:providers.has('google'),email:providers.has('email'),labels:[...providers].map(p=>p==='google'?'Google':p==='email'?'Email & password':p)};
}
