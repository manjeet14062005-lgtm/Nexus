-- Mirrors the applied Supabase migration. Server-only email availability lookup.
create or replace function public.nexus_email_registered(candidate_email text)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from auth.users where lower(email) = lower(trim(candidate_email))) $$;
revoke all on function public.nexus_email_registered(text) from public, anon, authenticated;
grant execute on function public.nexus_email_registered(text) to service_role;
