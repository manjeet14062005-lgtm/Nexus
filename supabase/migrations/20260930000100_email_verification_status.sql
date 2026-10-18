-- Server-only lookup used by the verification page when the signup browser has
-- no Supabase session (for example, when a mail scanner consumed the one-time
-- confirmation link before the user opened it).
create or replace function public.nexus_email_verified(candidate_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users
    where lower(email) = lower(trim(candidate_email))
      and email_confirmed_at is not null
  )
$$;

revoke all on function public.nexus_email_verified(text) from public, anon, authenticated;
grant execute on function public.nexus_email_verified(text) to service_role;
