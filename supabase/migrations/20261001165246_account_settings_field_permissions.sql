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
