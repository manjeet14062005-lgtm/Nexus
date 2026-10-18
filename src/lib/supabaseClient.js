import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL;
const anonKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
export const supabaseConfigured = Boolean(url && anonKey);

if (!url || !anonKey) {
  // Keep the app loadable so the auth pages can show a useful configuration error.
  // createClient requires valid values, so use a harmless placeholder URL only when missing.
}

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'public-placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export function assertSupabaseConfigured() {
  if (!url || !anonKey) throw new Error('Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_PUBLISHABLE_KEY.');
}
