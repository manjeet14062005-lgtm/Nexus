-- Server-only administrative operations. Public clients cannot mutate authority.
create table public.nexus_account_controls (
 user_id uuid primary key references auth.users(id) on delete cascade,
 status text not null check(status in ('active','suspended','deleting')) default 'active',
 updated_at timestamptz not null default clock_timestamp()
);
create table public.nexus_admin_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null,
 target_id uuid, action text not null, reason text not null,
 before_data jsonb not null default '{}', after_data jsonb not null default '{}',
 created_at timestamptz not null default clock_timestamp()
);
create index on public.nexus_admin_audit (target_id, created_at desc);
alter table public.nexus_account_controls enable row level security;
alter table public.nexus_admin_audit enable row level security;
revoke all on public.nexus_account_controls,public.nexus_admin_audit from anon,authenticated;
grant all on public.nexus_account_controls,public.nexus_admin_audit to service_role;

create or replace function private.nexus_account_active()
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from auth.users u left join public.nexus_account_controls c on c.user_id=u.id
 where u.id=auth.uid() and coalesce(c.status,'active')='active'
 and (u.banned_until is null or u.banned_until<=now()));
$$;
revoke all on function private.nexus_account_active() from public,anon;
grant execute on function private.nexus_account_active() to authenticated;
create policy nexus_active_account on public.nexus_documents as restrictive for all to authenticated
 using(private.nexus_account_active()) with check(private.nexus_account_active());
create policy nexus_active_account on public.nexus_user_roles as restrictive for all to authenticated
 using(private.nexus_account_active()) with check(private.nexus_account_active());
create policy nexus_active_account on public.nexus_workspaces as restrictive for all to authenticated
 using(private.nexus_account_active()) with check(private.nexus_account_active());
create policy nexus_active_account on public.nexus_workspace_members as restrictive for all to authenticated
 using(private.nexus_account_active()) with check(private.nexus_account_active());

-- Guard the one authenticated SECURITY DEFINER entry point as well.
alter function public.ensure_user_profile() rename to nexus_ensure_profile_internal;
alter function public.nexus_ensure_profile_internal() set schema private;
revoke all on function private.nexus_ensure_profile_internal() from public,anon,authenticated;
create function public.ensure_user_profile() returns jsonb language plpgsql security definer
 set search_path=pg_catalog,public as $$
begin
 if not private.nexus_account_active() then raise exception 'Account access unavailable' using errcode='42501'; end if;
 return private.nexus_ensure_profile_internal();
end; $$;
revoke all on function public.ensure_user_profile() from public,anon;
grant execute on function public.ensure_user_profile() to authenticated;

create view private.nexus_admin_directory as
 select u.id,u.email,u.created_at,u.last_sign_in_at,u.email_confirmed_at,
 coalesce(r.role,'user') as role,
 case when c.status in ('suspended','deleting') then c.status
 when u.banned_until>now() then 'suspended' else 'active' end as status,
 coalesce(p.data->>'name',u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name','') as name,
 coalesce(p.data->>'photoUrl',u.raw_user_meta_data->>'avatar_url',u.raw_user_meta_data->>'picture','') as photo,
 coalesce(p.data->>'phone','') as phone,coalesce(p.data->>'phoneVerified','false')='true' as phone_verified,
 coalesce(p.data->>'country','') as country,coalesce(p.data->>'bio','') as bio,
 p.updated_at as version,coalesce(u.raw_app_meta_data->>'provider','email') as provider
 from auth.users u left join public.nexus_user_roles r on r.user_id=u.id
 left join public.nexus_account_controls c on c.user_id=u.id
 left join lateral (select data,updated_at from public.nexus_documents d
 where d.collection_name='users' and d.user_id=u.id and d.workspace_id is null
 order by (d.doc_id=u.id::text and d.collection_path='users') desc,d.updated_at desc,d.id limit 1) p on true;
revoke all on private.nexus_admin_directory from public,anon,authenticated;

create function public.nexus_admin_users(q text default '', role_filter text default 'all', status_filter text default 'all',
 verification_filter text default 'all', page_number integer default 0, page_size integer default 20, protected_uids uuid[] default '{}')
returns jsonb language sql security definer set search_path=pg_catalog,public as $$
 with filtered as (
 select *,case when id=any(protected_uids) then 'admin' else role end as effective_role from private.nexus_admin_directory
 where (q='' or strpos(lower(concat(name,' ',email,' ',id::text)),lower(q))>0)
 and (status_filter='all' or status=status_filter)
 and (verification_filter='all' or (verification_filter='verified' and email_confirmed_at is not null)
 or (verification_filter='pending' and email_confirmed_at is null))
 ), scoped as (select * from filtered where role_filter='all' or effective_role=role_filter),
 totals as (select count(*) as total from scoped),
 paging as (select total,greatest(0,least(page_number,greatest(0,ceil(total::numeric/greatest(1,least(page_size,100)))::integer-1))) as page from totals),
 items as (select s.* from scoped s order by created_at desc,id
 limit greatest(1,least(page_size,100)) offset (select page*greatest(1,least(page_size,100)) from paging))
 select jsonb_build_object('total',total,'page',page,'pageSize',greatest(1,least(page_size,100)),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'email',email,'photoUrl',photo,
 'phone',phone,'phoneVerified',phone_verified,'emailVerified',email_confirmed_at is not null,'role',effective_role,
 'status',status,'country',country,'bio',bio,'createdAt',created_at,'lastSignIn',last_sign_in_at,'version',version,
 'provider',provider,'protected',id=any(protected_uids)) order by created_at desc,id) from items),'[]'::jsonb),
 'updatedAt',clock_timestamp()) from paging;
$$;

create function public.nexus_admin_overview(protected_uids uuid[] default '{}')
returns jsonb language sql security definer set search_path=pg_catalog,public as $$
 with users as (select * from private.nexus_admin_directory), counts as (
 select count(*) as total,count(*) filter(where email_confirmed_at is not null) as verified,
 count(*) filter(where phone_verified and phone<>'') as phone_verified,count(*) filter(where status='suspended') as suspended,
 count(*) filter(where role='admin' or id=any(protected_uids)) as admins,
 count(*) filter(where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' and created_at<=now()) as today,
 count(*) filter(where created_at>=now()-interval '7 days' and created_at<=now()) as week,
 count(*) filter(where created_at>=now()-interval '14 days' and created_at<now()-interval '7 days') as previous_week from users),
 days as (select d::date as day from generate_series((now() at time zone 'UTC')::date-13,(now() at time zone 'UTC')::date,interval '1 day') d)
 select jsonb_build_object('total',total,'emailVerified',verified,'phoneVerified',phone_verified,'suspended',suspended,
 'admins',admins,'today',today,'week',week,'previousWeek',previous_week,
 'trend',case when previous_week=0 then null else round((week-previous_week)*100.0/previous_week) end,
 'daily', (select jsonb_agg(jsonb_build_object('date',day,'value',(select count(*) from users where (created_at at time zone 'UTC')::date=day and created_at<=now())) order by day) from days),
 'pendingSupport',(select count(*) from public.nexus_documents where collection_name='supportTickets' and data->>'status' in ('open','in_progress','pending_nexus')),
 'pendingDeletion',(select count(*) from public.nexus_documents where collection_name='accountDeletionRequests' and data->>'status' in ('pending','blocked','failed')),
 'updatedAt',clock_timestamp()) from counts;
$$;

create function public.nexus_admin_user_action(actor uuid,target uuid, operation text, reason text, changes jsonb default '{}',
 expected_version timestamptz default null,protected_uids uuid[] default '{}', grace_days integer default 7)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v private.nexus_admin_directory; target_role text; next_role text; profile public.nexus_documents;
 next_data jsonb; after_state jsonb; execute_at timestamptz;
begin
 -- Serialize authority/lifecycle changes, including concurrent last-admin demotions.
 perform pg_advisory_xact_lock(782913440);
 if not exists(select 1 from private.nexus_admin_directory where id=actor and status='active' and (role='admin' or id=any(protected_uids))) then
 raise exception 'Administrator access required' using errcode='42501'; end if;
 if length(trim(reason))<5 or length(reason)>500 then raise exception 'Provide a reason between 5 and 500 characters' using errcode='22023'; end if;
 select * into v from private.nexus_admin_directory where id=target;
 if not found then raise exception 'Account no longer exists' using errcode='P0002'; end if;
 target_role:=case when target=any(protected_uids) then 'admin' else v.role end;
 if operation not in ('edit','suspend','restore','request_deletion') then raise exception 'Invalid account action' using errcode='22023'; end if;
 if v.status='deleting' then raise exception 'Account deletion is processing' using errcode='23505'; end if;
 next_role:=coalesce(changes->>'role',target_role);
 if next_role not in ('admin','moderator','user') then raise exception 'Invalid platform role' using errcode='22023'; end if;
 if (operation in ('suspend','request_deletion') or next_role<>target_role) and (actor=target or target=any(protected_uids)) then
 raise exception 'Your own access and configured administrator accounts are protected' using errcode='42501'; end if;
 if target_role='admin' and (operation in ('suspend','request_deletion') or next_role<>'admin') and
 (select count(*) from private.nexus_admin_directory where status='active' and (role='admin' or id=any(protected_uids)))<=1 then
 raise exception 'At least one active administrator must remain' using errcode='23505'; end if;
 select * into profile from public.nexus_documents where collection_name='users' and user_id=target and workspace_id is null
 order by (doc_id=target::text and collection_path='users') desc,updated_at desc,id limit 1 for update;
 if operation='edit' then
 if profile.updated_at is distinct from expected_version then raise exception 'This profile changed. Refresh before saving' using errcode='40001'; end if;
 if changes - array['name','country','bio','role'] <> '{}'::jsonb then raise exception 'Identity fields cannot be edited here' using errcode='22023'; end if;
 if length(trim(coalesce(changes->>'name',v.name))) not between 1 and 100 or length(coalesce(changes->>'bio',v.bio))>160
 or length(coalesce(changes->>'country',v.country))>100 then raise exception 'Check name, country and biography lengths' using errcode='22023'; end if;
 next_data:=coalesce(profile.data,jsonb_build_object('submitterUid',target::text,'uid',target::text,'email',v.email,'createdAt',v.created_at))
 || changes || jsonb_build_object('role',next_role,'updatedAt',clock_timestamp());
 if profile.id is null then
 insert into public.nexus_documents(collection_name,collection_path,doc_id,user_id,data) values('users','users',target::text,target,next_data);
 else update public.nexus_documents set data=next_data,updated_at=clock_timestamp() where id=profile.id; end if;
 insert into public.nexus_documents(collection_name,collection_path,doc_id,user_id,data)
 values('roles','roles',target::text,target,jsonb_build_object('role',next_role,'submitterUid',target::text))
 on conflict(collection_path,doc_id) do update set data=excluded.data,updated_at=clock_timestamp();
 after_state:=jsonb_build_object('name',next_data->>'name','country',next_data->>'country','bio',next_data->>'bio','role',next_role);
 elsif operation in ('suspend','restore') then
 if operation='restore' and exists(select 1 from auth.users where id=target and banned_until>now()) then
 raise exception 'This account is also banned in Auth. Remove that ban before restoring access' using errcode='23505'; end if;
 insert into public.nexus_account_controls(user_id,status) values(target,case when operation='suspend' then 'suspended' else 'active' end)
 on conflict(user_id) do update set status=excluded.status,updated_at=clock_timestamp();
 -- Field patch inside the transaction preserves unrelated profile edits.
 update public.nexus_documents set data=data || jsonb_build_object('status',case when operation='suspend' then 'suspended' else 'active' end),updated_at=clock_timestamp()
 where collection_name='users' and user_id=target;
 after_state:=jsonb_build_object('status',case when operation='suspend' then 'suspended' else 'active' end);
 else
 -- Use the existing deletion worker with an explicit grace period, never profile-only deletion.
 if target_role='admin' then raise exception 'Demote this administrator before requesting deletion' using errcode='23505'; end if;
 if exists(select 1 from public.nexus_workspaces where owner_id=target) or exists(select 1 from public.nexus_documents where collection_name='workspaces' and data->>'ownerUid'=target::text) then
 raise exception 'Transfer or delete owned workspaces first' using errcode='23505'; end if;
 if exists(select 1 from public.nexus_documents where collection_name='billing' and doc_id=target::text and
 data->>'status' in ('active','trialing','past_due','paused','authenticated','created') and
 coalesce(nullif(data->>'subId',''),nullif(data->>'subscriptionId','')) is not null) then
 raise exception 'Cancel the active subscription first' using errcode='23505'; end if;
 if exists(select 1 from public.nexus_documents where collection_name='accountDeletionRequests' and doc_id=target::text and data->>'status' in ('pending','processing')) then
 raise exception 'A deletion request is already pending' using errcode='23505'; end if;
 execute_at:=clock_timestamp()+make_interval(days=>greatest(1,grace_days));
 insert into public.nexus_documents(collection_name,collection_path,doc_id,user_id,data)
 values('accountDeletionRequests','accountDeletionRequests',target::text,target,jsonb_build_object('uid',target::text,'email',v.email,'status','pending','requestedAt',clock_timestamp(),'executeAfter',execute_at,'createdBy',actor::text,'reason',reason))
 on conflict(collection_path,doc_id) do update set data=excluded.data,updated_at=clock_timestamp();
 after_state:=jsonb_build_object('status','pending','executeAfter',execute_at);
 end if;
 insert into public.nexus_admin_audit(actor_id,target_id,action,reason,before_data,after_data)
 values(actor,target,operation,trim(reason),jsonb_build_object('name',v.name,'role',target_role,'status',v.status),after_state);
 return jsonb_build_object('success',true,'action',operation,'result',after_state);
end; $$;
revoke all on function public.nexus_admin_users(text,text,text,text,integer,integer,uuid[]),
 public.nexus_admin_overview(uuid[]),public.nexus_admin_user_action(uuid,uuid,text,text,jsonb,timestamptz,uuid[],integer) from public,anon,authenticated;
grant execute on function public.nexus_admin_users(text,text,text,text,integer,integer,uuid[]),
 public.nexus_admin_overview(uuid[]),public.nexus_admin_user_action(uuid,uuid,text,text,jsonb,timestamptz,uuid[],integer) to service_role;

-- Remove the old browser pathways for authority changes and profile-only deletion.
drop policy if exists nexus_docs_insert on public.nexus_documents;
create policy nexus_docs_insert on public.nexus_documents for insert to authenticated with check(
 workspace_id is null and private.nexus_is_admin() and collection_name in ('messages','announcements'));
drop policy if exists nexus_docs_delete on public.nexus_documents;
create policy nexus_docs_delete on public.nexus_documents for delete to authenticated using(
 workspace_id is null and ((private.nexus_is_admin() and collection_name in ('messages','announcements'))
 or (collection_name='messages' and data->>'toUid'=auth.uid()::text)));
drop policy if exists nexus_docs_update on public.nexus_documents;
create policy nexus_docs_update on public.nexus_documents for update to authenticated
 using(workspace_id is null and ((collection_name='users' and user_id=auth.uid())
 or (collection_name='messages' and (private.nexus_is_admin() or data->>'toUid'=auth.uid()::text))
 or (collection_name='announcements' and private.nexus_is_admin())))
 with check(workspace_id is null and ((collection_name='users' and user_id=auth.uid())
 or (collection_name='messages' and (private.nexus_is_admin() or data->>'toUid'=auth.uid()::text))
 or (collection_name='announcements' and private.nexus_is_admin())));
-- Even admins editing their own profile must use the server for protected fields.
create function private.nexus_guard_profile_authority() returns trigger language plpgsql security invoker
 set search_path=pg_catalog,public as $$
begin
 if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
 if new.collection_name='users' and (new.data-array['name','state','country','bio','photoUrl','marketingEmails','securityAlerts','weeklyDigest','lastLoginBonus','loginBonusDays','updatedAt'])
 is distinct from (old.data-array['name','state','country','bio','photoUrl','marketingEmails','securityAlerts','weeklyDigest','lastLoginBonus','loginBonusDays','updatedAt']) then
 raise exception 'Use the protected account workflow' using errcode='42501'; end if;
 return new;
end; $$;
revoke all on function private.nexus_guard_profile_authority() from public,anon,authenticated;
create trigger nexus_guard_profile_authority before update on public.nexus_documents for each row execute function private.nexus_guard_profile_authority();

create function public.nexus_profile_patch(profile_path text,profile_doc text,fields jsonb)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare saved text;
begin
 if fields is null or jsonb_typeof(fields)<>'object' then raise exception 'Invalid profile patch' using errcode='22023'; end if;
 update public.nexus_documents set data=data || fields,updated_at=clock_timestamp()
 where collection_name='users' and collection_path=profile_path and doc_id=profile_doc returning doc_id into saved;
 if saved is null then raise exception 'Profile not found or access denied' using errcode='42501'; end if;
 return saved;
end; $$;
revoke all on function public.nexus_profile_patch(text,text,jsonb) from public,anon;
grant execute on function public.nexus_profile_patch(text,text,jsonb) to authenticated;

create function public.nexus_prepare_account_deletion(target uuid,protected_uids uuid[] default '{}')
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform pg_advisory_xact_lock(782913440);
 if not exists(select 1 from auth.users where id=target) then return; end if;
 if target=any(protected_uids) or exists(select 1 from public.nexus_user_roles where user_id=target and role='admin') then
 raise exception 'Administrator accounts must be demoted before deletion' using errcode='23505'; end if;
 if exists(select 1 from public.nexus_workspaces where owner_id=target) or exists(select 1 from public.nexus_documents where collection_name='workspaces' and data->>'ownerUid'=target::text) then
 raise exception 'Owned workspaces block deletion' using errcode='23505'; end if;
 if exists(select 1 from public.nexus_documents where collection_name='billing' and doc_id=target::text and data->>'status' in ('active','trialing','past_due','paused','authenticated','created')
 and coalesce(nullif(data->>'subId',''),nullif(data->>'subscriptionId','')) is not null) then
 raise exception 'Active subscription blocks deletion' using errcode='23505'; end if;
 insert into public.nexus_account_controls(user_id,status) values(target,'deleting')
 on conflict(user_id) do update set status='deleting',updated_at=clock_timestamp();
end; $$;
revoke all on function public.nexus_prepare_account_deletion(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.nexus_prepare_account_deletion(uuid,uuid[]) to service_role;
