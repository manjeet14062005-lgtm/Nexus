-- Nexus Supabase migration
-- PostgreSQL-backed replacement for Firebase Auth + Firestore storage.
-- Keep service-role keys server-side only. Client access is protected by RLS.

create extension if not exists pgcrypto;

create table if not exists public.nexus_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user',
  updated_at timestamptz not null default now()
);

create table if not exists public.nexus_workspaces (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Workspace',
  member_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nexus_workspace_members (
  workspace_id text not null references public.nexus_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.nexus_documents (
  id uuid primary key default gen_random_uuid(),
  collection_name text not null,
  collection_path text not null,
  doc_id text not null,
  workspace_id text,
  user_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collection_path, doc_id)
);

create index if not exists nexus_documents_collection_idx on public.nexus_documents(collection_name, collection_path);
create index if not exists nexus_documents_workspace_idx on public.nexus_documents(workspace_id, updated_at desc);
create index if not exists nexus_documents_user_idx on public.nexus_documents(user_id, updated_at desc);
create index if not exists nexus_documents_created_idx on public.nexus_documents(created_at desc);
create index if not exists nexus_documents_uid_json_idx on public.nexus_documents((data->>'uid'));
create index if not exists nexus_documents_submitter_json_idx on public.nexus_documents((data->>'submitterUid'));

create or replace function public.nexus_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.nexus_user_roles r
    where r.user_id = auth.uid() and r.role in ('admin','owner')
  );
$$;

create or replace function public.nexus_has_workspace_access(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    public.nexus_is_admin()
    or exists (
      select 1 from public.nexus_workspaces w
      where w.id = target_workspace_id and w.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.nexus_workspace_members m
      where m.workspace_id = target_workspace_id and m.user_id = auth.uid()
    )
  );
$$;

revoke all on function public.nexus_is_admin() from public;
revoke all on function public.nexus_has_workspace_access(text) from public;

alter table public.nexus_user_roles enable row level security;
alter table public.nexus_workspaces enable row level security;
alter table public.nexus_workspace_members enable row level security;
alter table public.nexus_documents enable row level security;

revoke all on table public.nexus_user_roles from anon, authenticated;
revoke all on table public.nexus_workspaces from anon;
revoke all on table public.nexus_workspace_members from anon;

grant select, insert, update, delete on table public.nexus_documents to authenticated;
grant select on table public.nexus_workspaces to authenticated;
grant select on table public.nexus_workspace_members to authenticated;

drop policy if exists nexus_docs_select on public.nexus_documents;
create policy nexus_docs_select on public.nexus_documents
for select to authenticated
using (
  public.nexus_is_admin()
  or (user_id is not null and user_id = auth.uid())
  or (data->>'uid') = auth.uid()::text
  or (data->>'submitterUid') = auth.uid()::text
  or (workspace_id is not null and public.nexus_has_workspace_access(workspace_id))
  or (collection_name = 'roles' and doc_id = auth.uid()::text)
);

drop policy if exists nexus_docs_insert on public.nexus_documents;
create policy nexus_docs_insert on public.nexus_documents
for insert to authenticated
with check (
  public.nexus_is_admin()
  or (
    collection_name not in ('billing','billing_usage','billing_invoices','apiKeys','webhooks','webhookEvents','auditLogs','securityEvents','accountDeletionRequests','supportTickets','reportSchedules','reportRuns','automationJobs','usage','verificationRequests','roles','workspaces','workspaceMembers','workspaceInvites')
    and (
      (user_id is not null and user_id = auth.uid())
      or (data->>'uid') = auth.uid()::text
      or (data->>'submitterUid') = auth.uid()::text
      or (workspace_id is not null and public.nexus_has_workspace_access(workspace_id))
    )
  )
);

drop policy if exists nexus_docs_update on public.nexus_documents;
create policy nexus_docs_update on public.nexus_documents
for update to authenticated
using (
  public.nexus_is_admin()
  or (
    collection_name not in ('billing','billing_usage','billing_invoices','apiKeys','webhooks','webhookEvents','auditLogs','securityEvents','accountDeletionRequests','supportTickets','reportSchedules','reportRuns','automationJobs','usage','verificationRequests','roles','workspaces','workspaceMembers','workspaceInvites')
    and (
      (user_id is not null and user_id = auth.uid())
      or (data->>'uid') = auth.uid()::text
      or (data->>'submitterUid') = auth.uid()::text
      or (workspace_id is not null and public.nexus_has_workspace_access(workspace_id))
    )
  )
)
with check (
  public.nexus_is_admin()
  or (
    collection_name not in ('billing','billing_usage','billing_invoices','apiKeys','webhooks','webhookEvents','auditLogs','securityEvents','accountDeletionRequests','supportTickets','reportSchedules','reportRuns','automationJobs','usage','verificationRequests','roles','workspaces','workspaceMembers','workspaceInvites')
    and (
      (user_id is not null and user_id = auth.uid())
      or (data->>'uid') = auth.uid()::text
      or (data->>'submitterUid') = auth.uid()::text
      or (workspace_id is not null and public.nexus_has_workspace_access(workspace_id))
    )
  )
);

drop policy if exists nexus_docs_delete on public.nexus_documents;
create policy nexus_docs_delete on public.nexus_documents
for delete to authenticated
using (
  public.nexus_is_admin()
  or (
    collection_name not in ('billing','billing_usage','billing_invoices','apiKeys','webhooks','webhookEvents','auditLogs','securityEvents','accountDeletionRequests','supportTickets','reportSchedules','reportRuns','automationJobs','usage','verificationRequests','roles','workspaces','workspaceMembers','workspaceInvites')
    and (
      (user_id is not null and user_id = auth.uid())
      or (data->>'uid') = auth.uid()::text
      or (data->>'submitterUid') = auth.uid()::text
      or (workspace_id is not null and public.nexus_has_workspace_access(workspace_id))
    )
  )
);

drop policy if exists nexus_workspace_select on public.nexus_workspaces;
create policy nexus_workspace_select on public.nexus_workspaces
for select to authenticated
using (owner_id = auth.uid() or public.nexus_is_admin() or public.nexus_has_workspace_access(id));

drop policy if exists nexus_members_select on public.nexus_workspace_members;
create policy nexus_members_select on public.nexus_workspace_members
for select to authenticated
using (user_id = auth.uid() or public.nexus_is_admin() or public.nexus_has_workspace_access(workspace_id));

-- Service role retains access and bypasses RLS. Do not expose the service-role key to browsers.

create or replace function public.nexus_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.nexus_user_roles(user_id, role)
  values (new.id, 'user')
  on conflict (user_id) do nothing;

  insert into public.nexus_documents(collection_name, collection_path, doc_id, user_id, data)
  values (
    'users', 'users', new.id::text, new.id,
    jsonb_build_object(
      'submitterUid', new.id::text,
      'uid', new.id::text,
      'email', lower(coalesce(new.email, '')),
      'name', coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1)),
      'country', coalesce(new.raw_user_meta_data->>'country', 'India'),
      'state', coalesce(new.raw_user_meta_data->>'state', ''),
      'gender', coalesce(new.raw_user_meta_data->>'gender', ''),
      'phone', coalesce(new.raw_user_meta_data->>'phone', new.phone, ''),
      'linkedin', coalesce(new.raw_user_meta_data->>'linkedin', ''),
      'twitter', coalesce(new.raw_user_meta_data->>'twitter', ''),
      'bio', coalesce(new.raw_user_meta_data->>'bio', ''),
      'agreedToTerms', coalesce((new.raw_user_meta_data->>'agreedToTerms')::boolean, false),
      'phoneVerified', coalesce((new.raw_user_meta_data->>'phoneVerified')::boolean, false),
      'role', 'user',
      'status', 'active',
      'state', 'active',
      'emailVerified', (new.email_confirmed_at is not null),
      'createdAt', now()::text,
      'updatedAt', now()::text
    )
  )
  on conflict (collection_path, doc_id) do nothing;

  return new;
end;
$$;

drop trigger if exists nexus_on_auth_user_created on auth.users;
create trigger nexus_on_auth_user_created
after insert on auth.users
for each row execute function public.nexus_handle_new_user();

revoke all on function public.nexus_handle_new_user() from public;
