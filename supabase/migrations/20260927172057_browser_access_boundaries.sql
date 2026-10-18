-- Browser clients use explicit platform surfaces; workspace mutations use the API.
create or replace function private.nexus_has_workspace_access(target_workspace_id text)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select auth.uid() is not null and (
 exists(select 1 from public.nexus_workspaces where id=target_workspace_id and owner_id=auth.uid())
 or exists(select 1 from public.nexus_workspace_members where workspace_id=target_workspace_id and user_id=auth.uid())
 );
$$;
revoke all on function private.nexus_has_workspace_access(text) from public,anon;
grant execute on function private.nexus_has_workspace_access(text) to authenticated;
drop policy if exists nexus_workspace_select on public.nexus_workspaces;
create policy nexus_workspace_select on public.nexus_workspaces for select to authenticated using(private.nexus_has_workspace_access(id));
drop policy if exists nexus_members_select on public.nexus_workspace_members;
create policy nexus_members_select on public.nexus_workspace_members for select to authenticated using(private.nexus_has_workspace_access(workspace_id));

drop policy if exists nexus_docs_select on public.nexus_documents;
create policy nexus_docs_select on public.nexus_documents for select to authenticated using(
  collection_name in ('users','roles','messages','announcements','forms')
  and workspace_id is null
  and (private.nexus_is_admin() or user_id=(select auth.uid())
    or data->>'uid'=(select auth.uid())::text or data->>'submitterUid'=(select auth.uid())::text
    or (collection_name='roles' and doc_id=(select auth.uid())::text)
    or (collection_name='messages' and data->>'toUid'=(select auth.uid())::text)
    or collection_name='announcements')
);
drop policy if exists nexus_announcements_select on public.nexus_documents;
drop policy if exists nexus_docs_insert on public.nexus_documents;
create policy nexus_docs_insert on public.nexus_documents for insert to authenticated with check(
  workspace_id is null and collection_name in ('users','roles','messages','announcements')
  and private.nexus_is_admin()
);
drop policy if exists nexus_docs_update on public.nexus_documents;
create policy nexus_docs_update on public.nexus_documents for update to authenticated
using (workspace_id is null and (
 (private.nexus_is_admin() and collection_name in ('users','roles','messages','announcements'))
 or (collection_name='users' and user_id=(select auth.uid()))
 or (collection_name='messages' and data->>'toUid'=(select auth.uid())::text)
))
with check (workspace_id is null and (
 (private.nexus_is_admin() and collection_name in ('users','roles','messages','announcements'))
 or (collection_name='users' and user_id=(select auth.uid()))
 or (collection_name='messages' and data->>'toUid'=(select auth.uid())::text)
));
drop policy if exists nexus_docs_delete on public.nexus_documents;
create policy nexus_docs_delete on public.nexus_documents for delete to authenticated using(
 workspace_id is null and (
 (private.nexus_is_admin() and collection_name in ('users','roles','messages','announcements'))
 or (collection_name='messages' and data->>'toUid'=(select auth.uid())::text)
 )
);
-- Prevent authorized profile/message updates from changing identity or authority.
create or replace function private.nexus_guard_browser_update()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
 if new.collection_name is distinct from old.collection_name or new.collection_path is distinct from old.collection_path
 or new.doc_id is distinct from old.doc_id or new.user_id is distinct from old.user_id or new.workspace_id is distinct from old.workspace_id then
   raise exception 'Document identity is immutable' using errcode='42501';
 end if;
 if not private.nexus_is_admin() then
   if new.collection_name='users' and
     (new.data - array['name','state','bio','phone','lastLoginBonus','loginBonusDays','updatedAt'])
       is distinct from (old.data - array['name','state','bio','phone','lastLoginBonus','loginBonusDays','updatedAt']) then
     raise exception 'Only profile fields may be edited' using errcode='42501';
   elsif new.collection_name='messages' and (new.data - 'read' - 'updatedAt') is distinct from (old.data - 'read' - 'updatedAt') then
     raise exception 'Only message read state may be edited' using errcode='42501';
   end if;
 end if;
 new.updated_at := clock_timestamp();
 return new;
end;
$$;
revoke all on function private.nexus_guard_browser_update() from public,anon,authenticated;
drop trigger if exists nexus_guard_browser_update on public.nexus_documents;
create trigger nexus_guard_browser_update before update on public.nexus_documents for each row execute function private.nexus_guard_browser_update();

