-- Nexus RLS helper fix
create schema if not exists private;

create or replace function private.nexus_is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.nexus_user_roles r
    where r.user_id = auth.uid()
      and r.role in ('admin', 'owner')
  );
$$;

create or replace function private.nexus_has_workspace_access(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null and (
    private.nexus_is_admin()
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

revoke all on function private.nexus_is_admin() from public, anon;
revoke all on function private.nexus_has_workspace_access(text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.nexus_is_admin() to authenticated;
grant execute on function private.nexus_has_workspace_access(text) to authenticated;

revoke all on function public.nexus_is_admin() from public, anon, authenticated;
revoke all on function public.nexus_has_workspace_access(text) from public, anon, authenticated;

drop policy if exists nexus_docs_select on public.nexus_documents;
create policy nexus_docs_select on public.nexus_documents
for select to authenticated
using (
  private.nexus_is_admin()
  or (user_id is not null and user_id = auth.uid())
  or (data->>'uid') = auth.uid()::text
  or (data->>'submitterUid') = auth.uid()::text
  or (workspace_id is not null and private.nexus_has_workspace_access(workspace_id))
  or (collection_name = 'roles' and doc_id = auth.uid()::text)
);

drop policy if exists nexus_docs_insert on public.nexus_documents;
create policy nexus_docs_insert on public.nexus_documents
for insert to authenticated
with check (
  private.nexus_is_admin()
  or (
    collection_name not in ('billing','billing_usage','billing_invoices','apiKeys','webhooks','webhookEvents','auditLogs','securityEvents','accountDeletionRequests','supportTickets','reportSchedules','reportRuns','automationJobs','usage','verificationRequests','roles','workspaces','workspaceMembers','workspaceInvites')
    and (
      (user_id is not null and user_id = auth.uid())
      or (data->>'uid') = auth.uid()::text
      or (data->>'submitterUid') = auth.uid()::text
      or (workspace_id is not null and private.nexus_has_workspace_access(workspace_id))
    )
  )
);

drop policy if exists nexus_docs_update on public.nexus_documents;
create policy nexus_docs_update on public.nexus_documents
for update to authenticated
using (
  private.nexus_is_admin()
  or (
    collection_name not in ('billing','billing_usage','billing_invoices','apiKeys','webhooks','webhookEvents','auditLogs','securityEvents','accountDeletionRequests','supportTickets','reportSchedules','reportRuns','automationJobs','usage','verificationRequests','roles','workspaces','workspaceMembers','workspaceInvites')
    and (
      (user_id is not null and user_id = auth.uid())
      or (data->>'uid') = auth.uid()::text
      or (data->>'submitterUid') = auth.uid()::text
      or (workspace_id is not null and private.nexus_has_workspace_access(workspace_id))
    )
  )
)
with check (
  private.nexus_is_admin()
  or (
    collection_name not in ('billing','billing_usage','billing_invoices','apiKeys','webhooks','webhookEvents','auditLogs','securityEvents','accountDeletionRequests','supportTickets','reportSchedules','reportRuns','automationJobs','usage','verificationRequests','roles','workspaces','workspaceMembers','workspaceInvites')
    and (
      (user_id is not null and user_id = auth.uid())
      or (data->>'uid') = auth.uid()::text
      or (data->>'submitterUid') = auth.uid()::text
      or (workspace_id is not null and private.nexus_has_workspace_access(workspace_id))
    )
  )
);

drop policy if exists nexus_docs_delete on public.nexus_documents;
create policy nexus_docs_delete on public.nexus_documents
for delete to authenticated
using (
  private.nexus_is_admin()
  or (
    collection_name not in ('billing','billing_usage','billing_invoices','apiKeys','webhooks','webhookEvents','auditLogs','securityEvents','accountDeletionRequests','supportTickets','reportSchedules','reportRuns','automationJobs','usage','verificationRequests','roles','workspaces','workspaceMembers','workspaceInvites')
    and (
      (user_id is not null and user_id = auth.uid())
      or (data->>'uid') = auth.uid()::text
      or (data->>'submitterUid') = auth.uid()::text
      or (workspace_id is not null and private.nexus_has_workspace_access(workspace_id))
    )
  )
);

drop policy if exists nexus_workspace_select on public.nexus_workspaces;
create policy nexus_workspace_select on public.nexus_workspaces
for select to authenticated
using (owner_id = auth.uid() or private.nexus_is_admin() or private.nexus_has_workspace_access(id));

drop policy if exists nexus_members_select on public.nexus_workspace_members;
create policy nexus_members_select on public.nexus_workspace_members
for select to authenticated
using (user_id = auth.uid() or private.nexus_is_admin() or private.nexus_has_workspace_access(workspace_id));

drop policy if exists nexus_announcements_select on public.nexus_documents;
create policy nexus_announcements_select on public.nexus_documents
for select to authenticated
using (collection_name = 'announcements' and collection_path = 'announcements');
