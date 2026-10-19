import { createEmailConfirmationCheck, withVerificationTimeout } from './emailConfirmation';
import { supabase, assertSupabaseConfigured, supabaseConfigured } from './supabaseClient';

function normalizeUser(user) {
  if (!user) return null;
  return {
    ...user,
    uid: user.id,
    emailVerified: Boolean(user.email_confirmed_at),
    displayName: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User',
    photoURL: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
    providerData: Array.isArray(user.identities) ? user.identities.map((i) => ({ providerId: i.provider })) : [],
    getIdToken: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if(data.session?.user?.id && data.session.user.id!==user.id)throw new Error('Your signed-in account changed. Reload before continuing.');
      return data.session?.access_token || null;
    },
    getIdTokenResult: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const token = data.session?.access_token;
      let claims = {};
      if (token) {
        try { claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch {}
      }
      return { claims, token };
    },
  };
}

export const auth = {
  onAuthStateChanged(callback) {
    let active = true;
    let previousUserSignature;
    if (!supabaseConfigured) { callback(null); return () => { active = false; }; }
    // INITIAL_SESSION supplies the first state. A parallel getUser request can
    // arrive after sign-out and restore a stale user. Defer consumers so their
    // asynchronous Supabase calls run outside the auth event lock.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      // Focus and token refresh can re-emit SIGNED_IN for the same account.
      // Tokens are read on demand; unchanged identity must not reset every page.
      const signature = JSON.stringify(session?.user || null);
      if (signature === previousUserSignature) return;
      previousUserSignature = signature;
      const user = normalizeUser(session?.user || null);
      setTimeout(() => { if (active) callback(user); }, 0);
    });
    return () => { active = false; subscription?.subscription?.unsubscribe?.(); };
  },
};

// A cache makes `auth.currentUser` synchronous for the existing UI while the
// real Supabase session remains the source of truth.
let cachedUser = null;
if (supabaseConfigured) {
  supabase.auth.onAuthStateChange((_event, session) => { cachedUser = normalizeUser(session?.user || null); });
}
Object.defineProperty(auth, 'currentUser', { get: () => cachedUser });

export function onAuthStateChanged(_auth, callback) {
  return auth.onAuthStateChanged(callback);
}

export const provider = { provider: 'google' };

export async function signInWithEmailAndPassword(_auth, email, password) {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password });
  if (error) { error.code = error.code || 'auth/invalid-credential'; throw error; }
  return { user: normalizeUser(data.user), session: data.session };
}

export async function createUserWithEmailAndPassword(_auth, email, password, profile = {}) {
  assertSupabaseConfigured();
  // IMPORTANT: REACT_APP_SUPABASE_EMAIL_REDIRECT_URL must be set to your
  // production domain before deploying (e.g. https://yourdomain.com/verify-email).
  // If left as localhost, email verification links will not work for real users.
  const redirectTo = process.env.REACT_APP_SUPABASE_EMAIL_REDIRECT_URL || `${window.location.origin}/verify-email`;
  const { data, error } = await supabase.auth.signUp({
    email: String(email).trim().toLowerCase(),
    password,
    options: { emailRedirectTo: redirectTo, data: { name: profile.name || '', country: profile.country || '', state: profile.state || '', gender: profile.gender || '', phone: profile.phone || '', linkedin: profile.linkedin || '', twitter: profile.twitter || '', bio: profile.bio || '', agreedToTerms: Boolean(profile.agreedToTerms), phoneVerified: Boolean(profile.phoneVerified), signupPhoneProof: profile.signupPhoneProof || '' } },
  });
  if (error) { error.code = error.code || 'auth/email-signup-failed'; throw error; }
  return { user: normalizeUser(data.user), session: data.session };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function signInWithPopup(_auth, _provider) {
  assertSupabaseConfigured();
  const redirectTo = process.env.REACT_APP_SUPABASE_OAUTH_REDIRECT_URL || `${window.location.origin}/dashboard`;
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw error;
  return data;
}

export async function sendPasswordResetEmail(_auth, email) {
  assertSupabaseConfigured();
  const { error } = await supabase.auth.resetPasswordForEmail(String(email).trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

export async function sendEmailVerification(user) {
  assertSupabaseConfigured();
  const { error } = await supabase.auth.resend({ type: 'signup', email: user?.email, options: { emailRedirectTo: process.env.REACT_APP_SUPABASE_EMAIL_REDIRECT_URL || `${window.location.origin}/verify-email` } });
  if (error) throw error;
}

export async function reload(user) {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const normalized = normalizeUser(data.user);
  if (user && normalized) Object.assign(user, normalized);
  return normalized;
}

export async function deleteUser() {
  throw new Error('Client-side account deletion is disabled. Use the Nexus account-deletion flow.');
}

export { normalizeUser };

const checkConfirmation = createEmailConfirmationCheck(supabase, window.location, window.history);
export async function checkEmailConfirmation() {
  return normalizeUser(await withVerificationTimeout(checkConfirmation));
}
