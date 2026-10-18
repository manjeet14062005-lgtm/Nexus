-- All lifecycle transitions share the admin authority lock. Browsers have no grants.
create table public.nexus_account_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null,
 type text not null, created_at timestamptz not null default clock_timestamp(),
 metadata jsonb not null default '{}'
);
create index on public.nexus_account_events(user_id,created_at desc,id);
alter table public.nexus_account_events enable row level security;
revoke all on public.nexus_account_events from public,anon,authenticated;
grant all on public.nexus_account_events to service_role;

create function private.nexus_profile_event() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare fields jsonb;
begin
 if new.collection_name='users' and new.workspace_id is null and new.user_id is not null then
 select coalesce(jsonb_agg(k),'[]'::jsonb) into fields from unnest(array['name','country','bio','photoUrl','phoneVerified','role','marketingEmails','weeklyDigest','securityAlerts']) k where old.data->k is distinct from new.data->k;
 if jsonb_array_length(fields)>0 then
 insert into public.nexus_account_events(user_id,type,metadata) values(new.user_id,'profile_updated',jsonb_build_object('fields',fields));
 end if;
 end if; return new;
end; $$;
revoke all on function private.nexus_profile_event() from public,anon,authenticated;
create trigger nexus_account_profile_event after update on public.nexus_documents for each row execute function private.nexus_profile_event();

create function private.nexus_assert_deletable(target uuid,protected_uids uuid[]) returns void language plpgsql set search_path=pg_catalog,public as $$
begin
 if target=any(protected_uids) or exists(select 1 from public.nexus_user_roles where user_id=target and role='admin') then raise exception 'Administrator access must be transferred and demoted before deletion' using errcode='23505'; end if;
 if exists(select 1 from public.nexus_workspaces where owner_id=target) or exists(select 1 from public.nexus_documents where collection_name='workspaces' and data->>'ownerUid'=target::text) then raise exception 'Transfer owned workspaces before deletion' using errcode='23505'; end if;
 if exists(select 1 from public.nexus_documents where collection_name='billing' and doc_id=target::text and data->>'status' in ('active','trialing','past_due','paused','authenticated','created') and coalesce(nullif(data->>'subId',''),nullif(data->>'subscriptionId','')) is not null) then raise exception 'Cancel your active subscription before deletion' using errcode='23505'; end if;
end; $$;
revoke all on function private.nexus_assert_deletable(uuid,uuid[]) from public,anon,authenticated;

create function public.nexus_account_lifecycle(target uuid,operation text,lease_token uuid default null,protected_uids uuid[] default '{}',grace_days integer default 7,actor uuid default null,reason text default '') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare row public.nexus_documents; d jsonb; s text; attempts integer;
begin
 perform pg_advisory_xact_lock(782913440);
 select * into row from public.nexus_documents where collection_path='accountDeletionRequests' and doc_id=target::text for update;
 d:=coalesce(row.data,'{}'); s:=coalesce(d->>'status','none');
 if operation='request' then
 if s in ('processing','failed','completed') or exists(select 1 from public.nexus_account_controls where user_id=target and status='deleting') then raise exception 'Deletion has started. Contact support for recovery' using errcode='23505'; end if;
 perform private.nexus_assert_deletable(target,protected_uids);
 if not exists(select 1 from auth.users where id=target) then raise exception 'Account not found' using errcode='P0002'; end if;
 if s='pending' then return d; end if;
 d:=jsonb_build_object('uid',target,'email',(select email from auth.users where id=target),'status','pending','requestedAt',clock_timestamp(),'executeAfter',clock_timestamp()+make_interval(days=>greatest(1,grace_days)),'createdBy','account-owner');
 insert into public.nexus_documents(collection_name,collection_path,doc_id,user_id,data) values('accountDeletionRequests','accountDeletionRequests',target::text,target,d) on conflict(collection_path,doc_id) do update set data=excluded.data,updated_at=clock_timestamp();
 insert into public.nexus_account_events(user_id,type) values(target,'deletion_requested'); return d;
 elsif operation='cancel' then
 if s='none' then return jsonb_build_object('status','none'); end if;
 if s not in ('pending','blocked') or exists(select 1 from public.nexus_account_controls where user_id=target and status='deleting') then raise exception 'Deletion has started and cannot be canceled. Contact support' using errcode='23505'; end if;
 d:=d || jsonb_build_object('status','canceled','canceledAt',clock_timestamp());
 insert into public.nexus_account_events(user_id,type) values(target,'deletion_canceled');
 elsif operation='claim' then
 if lease_token is null then raise exception 'Worker lease required' using errcode='22023'; end if;
 if s not in ('pending','processing') then return null; end if;
 if s='pending' and coalesce((d->>'executeAfter')::timestamptz,'infinity')>clock_timestamp() then return null; end if;
 if s='processing' and coalesce((d->>'leaseUntil')::timestamptz,'-infinity')>clock_timestamp() then return null; end if;
 begin
 perform private.nexus_assert_deletable(target,protected_uids);
 perform public.nexus_prepare_account_deletion(target,protected_uids);
 exception when unique_violation then
 d:=d || jsonb_build_object('status',case when s='processing' then 'failed' else 'blocked' end,'error',SQLERRM);
 update public.nexus_documents set data=d,updated_at=clock_timestamp() where id=row.id; return null;
 end;
 attempts:=coalesce((d->>'attempts')::integer,0)+1;
 if attempts>5 then d:=d || jsonb_build_object('status','failed','error','Recovery requires an administrator');
 else d:=d || jsonb_build_object('status','processing','processingAt',coalesce(d->>'processingAt',clock_timestamp()::text),'leaseToken',lease_token,'leaseUntil',clock_timestamp()+interval '20 minutes','attempts',attempts); end if;
 elsif operation in ('renew','finish','fail') then
 if s<>'processing' or lease_token is null or d->>'leaseToken' is distinct from lease_token::text or (d->>'leaseUntil')::timestamptz<=clock_timestamp() then raise exception 'Worker lease lost' using errcode='40001'; end if;
 if operation='renew' then d:=d || jsonb_build_object('leaseUntil',clock_timestamp()+interval '20 minutes');
 elsif operation='finish' then d:=(d-array['leaseToken','leaseUntil','error']) || jsonb_build_object('status','completed','completedAt',clock_timestamp()); delete from public.nexus_account_events where user_id=target;
 else d:=(d-'leaseToken') || jsonb_build_object('status',case when (d->>'attempts')::integer>=5 then 'failed' else 'processing' end,'leaseUntil',clock_timestamp()+interval '5 minutes','error','Cleanup interrupted; awaiting safe recovery','lastFailedAt',clock_timestamp()); end if;
 elsif operation='retry' then
 if actor is null or not exists(select 1 from private.nexus_admin_directory where id=actor and status='active' and (role='admin' or id=any(protected_uids))) then raise exception 'Administrator required' using errcode='42501'; end if;
 if length(trim(reason))<5 or length(reason)>500 then raise exception 'Provide an audit reason' using errcode='22023'; end if;
 if s not in ('failed','blocked') then raise exception 'Only blocked or failed requests can be retried' using errcode='23505'; end if;
 perform private.nexus_assert_deletable(target,protected_uids);
 d:=(d-array['leaseToken','error']) || jsonb_build_object('status',case when exists(select 1 from public.nexus_account_controls where user_id=target and status='deleting') then 'processing' else 'pending' end,'leaseUntil',clock_timestamp(),'attempts',0);
 insert into public.nexus_admin_audit(actor_id,target_id,action,reason,after_data) values(actor,target,'retry_deletion',trim(reason),jsonb_build_object('status',d->>'status'));
 else raise exception 'Invalid lifecycle operation' using errcode='22023'; end if;
 update public.nexus_documents set data=d,updated_at=clock_timestamp() where id=row.id;
 if operation='claim' and d->>'status'<>'processing' then return null; end if;
 return d;
end; $$;
revoke all on function public.nexus_account_lifecycle(uuid,text,uuid,uuid[],integer,uuid,text) from public,anon,authenticated;
grant execute on function public.nexus_account_lifecycle(uuid,text,uuid,uuid[],integer,uuid,text) to service_role;

-- Select eligible work only, so future requests cannot starve recovery jobs.
create function public.nexus_account_deletion_candidates() returns table(doc_id text,data jsonb)
language sql stable set search_path=pg_catalog,public as $$
 select d.doc_id,d.data from public.nexus_documents d
 where d.collection_path='accountDeletionRequests' and
 ((d.data->>'status'='pending' and (d.data->>'executeAfter')::timestamptz<=now()) or
 (d.data->>'status'='processing' and coalesce((d.data->>'leaseUntil')::timestamptz,'-infinity')<=now()))
 order by d.updated_at limit 100;
$$;
revoke all on function public.nexus_account_deletion_candidates() from public,anon,authenticated;
grant execute on function public.nexus_account_deletion_candidates() to service_role;
