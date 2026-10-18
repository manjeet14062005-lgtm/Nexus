import { supabase, assertSupabaseConfigured } from './supabaseClient';

export async function reauthenticateWithPassword(user, password) {
  assertSupabaseConfigured();
  if (!user?.email || !password) throw new Error('Enter your current password.');
  const { data, error } = await supabase.auth.signInWithPassword({ email: user.email, password });
  if (error) throw error;
  if (!data.user || data.user.id !== user.uid) {
    await supabase.auth.signOut({ scope: 'local' });
    throw new Error('Sign in with the account that owns this workspace.');
  }
  return data.user;
}

export async function reauthenticateWithGoogle(workspaceId, accountReturnPath) {
  assertSupabaseConfigured();
  const candidate=new URL(accountReturnPath || '/workspace',window.location.origin);
  const allowedReturn=candidate.origin===window.location.origin && ['/account','/security','/users'].includes(candidate.pathname);
  const redirectTo = new URL(allowedReturn ? candidate.pathname+candidate.search : '/workspace', window.location.origin);
  if (workspaceId) redirectTo.searchParams.set('reauthWorkspace', workspaceId);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectTo.href, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
}
