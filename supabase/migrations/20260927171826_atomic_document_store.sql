-- Server-only atomic compatibility writes. Existing documents are preserved.
create or replace function public.nexus_commit_documents(operations jsonb, reads jsonb default '[]'::jsonb)
returns void language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  op jsonb; item record; current_row public.nexus_documents%rowtype;
  next_data jsonb; target text; lock_path text;
begin
  if jsonb_typeof(operations) <> 'array' or jsonb_typeof(reads) <> 'array' then
    raise exception 'Expected operation and read arrays';
  end if;
  -- Stable lock order prevents deadlocks. Absent rows are locked as well.
  for lock_path in select distinct x->>'path' from jsonb_array_elements(operations || reads) x order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(lock_path, 0));
  end loop;
  for op in select value from jsonb_array_elements(reads) loop
    select * into current_row from public.nexus_documents
      where collection_name=op->>'collection' and doc_id=op->>'id'
        and collection_path in (op->>'path', op->>'parent')
      order by updated_at desc limit 1 for update;
    if current_row.updated_at is distinct from (op->>'version')::timestamptz then
      raise exception 'Document changed; retry transaction' using errcode='40001';
    end if;
  end loop;
  for op in select value from jsonb_array_elements(operations) loop
    if coalesce(op->>'path','')='' or coalesce(op->>'id','')='' then raise exception 'Invalid document path'; end if;
    select * into current_row from public.nexus_documents
      where collection_name=op->>'collection' and doc_id=op->>'id'
        and collection_path in (op->>'path', op->>'parent')
      order by updated_at desc limit 1 for update;
    if op->>'type'='delete' then
      delete from public.nexus_documents where collection_name=op->>'collection' and doc_id=op->>'id'
        and collection_path in (op->>'path',op->>'parent');
      continue;
    end if;
    if op->>'type' not in ('set','update') then raise exception 'Unsupported write operation'; end if;
    if op->>'type'='update' and current_row.id is null then raise exception 'Document not found' using errcode='P0002'; end if;
    next_data := case when (op->>'merge')::boolean then coalesce(current_row.data,'{}'::jsonb) else '{}'::jsonb end;
    for item in select key,value from jsonb_each(op->'data') loop
      if item.value->>'__nexusFieldOp'='increment' then
        next_data := jsonb_set(next_data,array[item.key],to_jsonb(coalesce((next_data->>item.key)::numeric,0)+(item.value->>'amount')::numeric));
      elsif item.value->>'__nexusFieldOp'='serverTimestamp' then
        next_data := jsonb_set(next_data,array[item.key],to_jsonb(clock_timestamp()));
      else
        next_data := jsonb_set(next_data,array[item.key],item.value);
      end if;
    end loop;
    target := coalesce(current_row.collection_path,op->>'path');
    insert into public.nexus_documents(collection_name,collection_path,doc_id,data,workspace_id,user_id,updated_at)
    values(op->>'collection',target,op->>'id',next_data,
      coalesce(next_data->>'workspaceId',next_data->>'workspace_id',
        case when split_part(op->>'path','/',1)='workspaces' then split_part(op->>'path','/',2) end),
      coalesce(next_data->>'uid',next_data->>'submitterUid')::uuid,clock_timestamp())
    on conflict(collection_path,doc_id) do update set data=excluded.data, workspace_id=excluded.workspace_id,
      user_id=excluded.user_id, updated_at=excluded.updated_at;
  end loop;
end;
$$;
revoke all on function public.nexus_commit_documents(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.nexus_commit_documents(jsonb,jsonb) to service_role;

-- The trigger keeps authorization tables consistent with each committed write,
-- including membership removal. Errors roll back the original document write.
create or replace function private.nexus_sync_document()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
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
    if new.data->>'role' not in ('admin','user') then raise exception 'Invalid platform role'; end if;
    insert into public.nexus_user_roles(user_id,role,updated_at) values(new.doc_id::uuid,new.data->>'role',clock_timestamp())
      on conflict(user_id) do update set role=excluded.role,updated_at=excluded.updated_at;
  elsif new.collection_name='workspaces' and new.data->>'ownerUid' is not null then
    insert into public.nexus_workspaces(id,owner_id,name,member_count,updated_at)
      values(new.doc_id,(new.data->>'ownerUid')::uuid,coalesce(new.data->>'name','Workspace'),coalesce((new.data->>'memberCount')::integer,1),clock_timestamp())
      on conflict(id) do update set owner_id=excluded.owner_id,name=excluded.name,member_count=excluded.member_count,updated_at=excluded.updated_at;
  elsif new.collection_name='workspaceMembers' then
    insert into public.nexus_workspace_members(workspace_id,user_id,role,updated_at)
      values(new.data->>'workspaceId',(new.data->>'uid')::uuid,lower(trim(new.data->>'role')),clock_timestamp())
      on conflict(workspace_id,user_id) do update set role=excluded.role,updated_at=excluded.updated_at;
  end if;
  return new;
end;
$$;
revoke all on function private.nexus_sync_document() from public, anon, authenticated;
drop trigger if exists nexus_sync_document on public.nexus_documents;
create trigger nexus_sync_document after insert or update or delete on public.nexus_documents
for each row execute function private.nexus_sync_document();

create or replace function public.nexus_delete_document_tree(target_path text,target_id text)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if target_path is null or target_path='' or target_id is null or target_id='' then raise exception 'Invalid deletion target'; end if;
  delete from public.nexus_documents where
    (collection_path=target_path and doc_id=target_id)
    or starts_with(collection_path,target_path || '/');
end;
$$;
revoke all on function public.nexus_delete_document_tree(text,text) from public, anon, authenticated;
grant execute on function public.nexus_delete_document_tree(text,text) to service_role;

