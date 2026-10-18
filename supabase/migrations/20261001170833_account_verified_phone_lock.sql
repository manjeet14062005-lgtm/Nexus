create or replace function private.nexus_guard_browser_update()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
 if new.collection_name is distinct from old.collection_name or new.collection_path is distinct from old.collection_path
 or new.doc_id is distinct from old.doc_id or new.user_id is distinct from old.user_id or new.workspace_id is distinct from old.workspace_id then
   raise exception 'Document identity is immutable' using errcode='42501';
 end if;
 if new.collection_name='users' and ((new.data->>'phone') is distinct from (old.data->>'phone') or (new.data->'phoneVerified') is distinct from (old.data->'phoneVerified')) then
   raise exception 'Phone numbers can only be saved through OTP verification' using errcode='42501';
 end if;
 if not private.nexus_is_admin() then
   if new.collection_name='users' and
     (new.data - array['name','state','country','bio','phone','photoUrl','marketingEmails','securityAlerts','weeklyDigest','lastLoginBonus','loginBonusDays','updatedAt'])
       is distinct from (old.data - array['name','state','country','bio','phone','photoUrl','marketingEmails','securityAlerts','weeklyDigest','lastLoginBonus','loginBonusDays','updatedAt']) then
     raise exception 'Only profile fields may be edited' using errcode='42501';
   elsif new.collection_name='messages' and (new.data - 'read' - 'updatedAt') is distinct from (old.data - 'read' - 'updatedAt') then
     raise exception 'Only message read state may be edited' using errcode='42501';
   end if;
 end if;
 if new.collection_name='users' then
   if (new.data->>'phone') is distinct from (old.data->>'phone') then
     new.data := jsonb_set(new.data, '{phoneVerified}', 'false'::jsonb);
   end if;
   if length(coalesce(new.data->>'photoUrl','')) > 960000 then raise exception 'Photo is too large'; end if;
 end if;
 new.updated_at := clock_timestamp();
 return new;
end;
$$;


create or replace function public.nexus_lock_verified_phone(target_user uuid, verified_phone text)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare profile_id uuid; profile_data jsonb;
begin
 if verified_phone !~ '^\+[1-9][0-9]{6,14}$' then raise exception 'Invalid phone number'; end if;
 select id,data into profile_id,profile_data from public.nexus_documents
 where collection_path='users' and user_id=target_user order by created_at limit 1 for update;
 if profile_id is null then raise exception 'Profile unavailable'; end if;
 if profile_data->>'phoneVerified'='true' and coalesce(profile_data->>'phone','')<>'' then
   raise exception 'Verified phone is locked' using errcode='23505';
 end if;
 update public.nexus_documents set data=data || jsonb_build_object('phone',verified_phone,'phoneVerified',true), updated_at=clock_timestamp() where id=profile_id;
end;
$$;
revoke all on function public.nexus_lock_verified_phone(uuid,text) from public,anon,authenticated;
grant execute on function public.nexus_lock_verified_phone(uuid,text) to service_role;
