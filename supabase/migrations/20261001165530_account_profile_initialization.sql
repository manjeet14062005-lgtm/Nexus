create or replace function public.ensure_user_profile()
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_id uuid := auth.uid(); result jsonb;
begin
 if current_id is null then raise exception 'Not authenticated' using errcode='42501'; end if;
 select data into result from public.nexus_documents where collection_path='users' and user_id=current_id order by created_at limit 1;
 if found then return result; end if;
 insert into public.nexus_documents(collection_name,collection_path,doc_id,user_id,data)
 select 'users','users',u.id::text,u.id,jsonb_build_object('submitterUid',u.id::text,'uid',u.id::text,'email',u.email,'name',coalesce(u.raw_user_meta_data->>'name',u.raw_user_meta_data->>'full_name',''),'phone',coalesce(u.phone,u.raw_user_meta_data->>'phone',''),'country','','bio','','photoUrl','','role','user','status','active','emailVerified',u.email_confirmed_at is not null,'phoneVerified',u.phone_confirmed_at is not null,'createdAt',u.created_at,'updatedAt',now())
 from auth.users u where u.id=current_id
 on conflict(collection_path,doc_id) do nothing;
 select data into result from public.nexus_documents where collection_path='users' and user_id=current_id order by created_at limit 1;
 if result is null then raise exception 'Profile could not be initialized'; end if;
 return result;
end;
$$;
revoke all on function public.ensure_user_profile() from public,anon;
grant execute on function public.ensure_user_profile() to authenticated;
