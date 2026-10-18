-- Add "moderator" as a valid Nexus platform role.
--
-- The User Management UI already allows admin/user/moderator, but the
-- document-sync trigger previously rejected anything except admin/user.
-- This migration preserves the existing trigger behavior and only expands
-- the accepted platform-role list.

create or replace function private.nexus_sync_document()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if tg_op='DELETE' then
    if old.collection_name='roles' then
      delete from public.nexus_user_roles where user_id=old.doc_id::uuid;
    elsif old.collection_name='workspaceMembers' then
      delete from public.nexus_workspace_members where workspace_id=old.data->>'workspaceId' and user_id=(old.data->>'uid')::uuid;
    elsif old.collection_name='workspaces' then
      delete from public.nexus_workspaces where id=old.doc_id;
    end if;
    return old;
  end if;

  if new.collection_name='roles' then
    if lower(trim(new.data->>'role')) not in ('admin','moderator','user') then
      raise exception 'Invalid platform role';
    end if;

    insert into public.nexus_user_roles(user_id,role,updated_at)
      values(new.doc_id::uuid,lower(trim(new.data->>'role')),clock_timestamp())
      on conflict(user_id) do update
        set role=excluded.role,updated_at=excluded.updated_at;

  elsif new.collection_name='workspaces' and new.data->>'ownerUid' is not null then
    insert into public.nexus_workspaces(id,owner_id,name,member_count,updated_at)
      values(new.doc_id,(new.data->>'ownerUid')::uuid,coalesce(new.data->>'name','Workspace'),coalesce((new.data->>'memberCount')::integer,1),clock_timestamp())
      on conflict(id) do update
        set owner_id=excluded.owner_id,name=excluded.name,member_count=excluded.member_count,updated_at=excluded.updated_at;

  elsif new.collection_name='workspaceMembers' then
    insert into public.nexus_workspace_members(workspace_id,user_id,role,updated_at)
      values(new.data->>'workspaceId',(new.data->>'uid')::uuid,lower(trim(new.data->>'role')),clock_timestamp())
      on conflict(workspace_id,user_id) do update
        set role=excluded.role,updated_at=excluded.updated_at;
  end if;

  return new;
end;
$function$;
