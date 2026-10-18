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
      'country', coalesce(new.raw_user_meta_data->>'country', ''),
      'phone', coalesce(new.raw_user_meta_data->>'phone', new.phone, ''),
      'bio', coalesce(new.raw_user_meta_data->>'bio', ''),
      'photoUrl', coalesce(new.raw_user_meta_data->>'photoUrl', new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
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

create or replace function public.ensure_user_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user auth.users;
  v_doc public.nexus_documents;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_user from auth.users where id = auth.uid();
  if not found then
    raise exception 'User not found';
  end if;

  insert into public.nexus_user_roles(user_id, role)
  values (v_user.id, 'user')
  on conflict (user_id) do nothing;

  insert into public.nexus_documents(collection_name, collection_path, doc_id, user_id, data)
  values (
    'users', 'users', v_user.id::text, v_user.id,
    jsonb_build_object(
      'submitterUid', v_user.id::text,
      'uid', v_user.id::text,
      'email', lower(coalesce(v_user.email, '')),
      'name', coalesce(v_user.raw_user_meta_data->>'name', v_user.raw_user_meta_data->>'full_name', split_part(coalesce(v_user.email, ''), '@', 1)),
      'country', coalesce(v_user.raw_user_meta_data->>'country', ''),
      'phone', coalesce(v_user.raw_user_meta_data->>'phone', v_user.phone, ''),
      'bio', coalesce(v_user.raw_user_meta_data->>'bio', ''),
      'photoUrl', coalesce(v_user.raw_user_meta_data->>'photoUrl', v_user.raw_user_meta_data->>'avatar_url', v_user.raw_user_meta_data->>'picture', ''),
      'agreedToTerms', coalesce((v_user.raw_user_meta_data->>'agreedToTerms')::boolean, false),
      'phoneVerified', coalesce((v_user.raw_user_meta_data->>'phoneVerified')::boolean, false),
      'role', 'user',
      'status', 'active',
      'state', 'active',
      'emailVerified', (v_user.email_confirmed_at is not null),
      'createdAt', now()::text,
      'updatedAt', now()::text
    )
  )
  on conflict (collection_path, doc_id) do nothing;

  select * into v_doc from public.nexus_documents where collection_path = 'users' and doc_id = auth.uid()::text;
  return v_doc.data;
end;
$$;

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
     (new.data - array['name','country','bio','phone','photoUrl','lastLoginBonus','loginBonusDays','updatedAt'])
       is distinct from (old.data - array['name','country','bio','phone','photoUrl','lastLoginBonus','loginBonusDays','updatedAt']) then
     raise exception 'Only profile fields may be edited' using errcode='42501';
   elsif new.collection_name='messages' and (new.data - 'read' - 'updatedAt') is distinct from (old.data - 'read' - 'updatedAt') then
     raise exception 'Only message read state may be edited' using errcode='42501';
   end if;
 end if;
 new.updated_at := clock_timestamp();
 return new;
end;
$$;
