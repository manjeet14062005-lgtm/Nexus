alter table public.nexus_account_events add column actor_id uuid default auth.uid();

create table public.nexus_notifications (
 id uuid primary key default gen_random_uuid(), recipient_id uuid not null references auth.users(id) on delete cascade,
 event_key text not null, category text not null check(category in ('account','admin','message','support')),
 title text not null, body text not null default '', href text not null,
 created_at timestamptz not null default clock_timestamp(), read_at timestamptz, archived_at timestamptz,
 unique(recipient_id,event_key)
);
create index on public.nexus_notifications(recipient_id,created_at desc,id);
alter table public.nexus_notifications enable row level security;
revoke all on public.nexus_notifications from public,anon,authenticated;
grant all on public.nexus_notifications to service_role;

create table public.nexus_platform_events(id uuid primary key default gen_random_uuid(),target_id uuid,type text not null,created_at timestamptz not null default clock_timestamp());
alter table public.nexus_platform_events enable row level security;
revoke all on public.nexus_platform_events from public,anon,authenticated;
grant all on public.nexus_platform_events to service_role;
create index on public.nexus_platform_events(created_at desc,id);

create function private.nexus_deliver_event() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare recipient uuid; event_id text; heading text; category_name text; destination text; target_id uuid;
begin
 if tg_table_name='users' then
 insert into public.nexus_platform_events(target_id,type) values(new.id,'account_registered');
 event_id:='registration:'||new.id; heading:='New account registered';category_name:='admin';destination:='/users';
 for recipient in select user_id from public.nexus_user_roles where role='admin' loop
 insert into public.nexus_notifications(recipient_id,event_key,category,title,href) values(recipient,event_id,category_name,heading,destination) on conflict do nothing;
 end loop;
 elsif tg_table_name='nexus_admin_audit' then
 event_id:='admin:'||new.id;heading:='Administrative action recorded';destination:='/activity';
 for recipient in select user_id from public.nexus_user_roles where role='admin' loop
 insert into public.nexus_notifications(recipient_id,event_key,category,title,body,href) values(recipient,event_id,'admin',heading,replace(new.action,'_',' '),destination) on conflict do nothing;
 end loop;
 if new.target_id is not null and new.action in ('edit','suspend','restore','request_deletion','retry_deletion') and exists(select 1 from auth.users where id=new.target_id) then
 insert into public.nexus_notifications(recipient_id,event_key,category,title,body,href) values(new.target_id,event_id||':personal','account','Your account was updated','An administrator recorded an account change.','/account?section=activity') on conflict do nothing;
 end if;
 elsif tg_table_name='nexus_account_events' then
 if not exists(select 1 from auth.users where id=new.user_id) then return new; end if;
 insert into public.nexus_notifications(recipient_id,event_key,category,title,body,href)
 values(new.user_id,'account:'||new.id,'account',case new.type when 'deletion_requested' then 'Account deletion scheduled' when 'deletion_canceled' then 'Account deletion canceled' when 'sessions_revoked' then 'Sign-out across devices requested' else 'Account details updated' end,'Review your account timeline for details.','/account?section=activity') on conflict do nothing;
 elsif tg_table_name='nexus_documents' then
 if new.collection_name='messages' and tg_op='INSERT' and new.data->>'toUid' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
 recipient:=(new.data->>'toUid')::uuid;
 if exists(select 1 from auth.users where id=recipient) then
 insert into public.nexus_notifications(recipient_id,event_key,category,title,href) values(recipient,'message:'||new.id,'message','You have a new message','/messages') on conflict do nothing;
 end if;
 elsif new.collection_name='supportTickets' and tg_op='UPDATE' and new.data->>'status' is distinct from old.data->>'status' and new.data->>'requesterUid' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
 recipient:=(new.data->>'requesterUid')::uuid;
 if exists(select 1 from auth.users where id=recipient) then
 insert into public.nexus_notifications(recipient_id,event_key,category,title,body,href) values(recipient,'support:'||new.id||':'||gen_random_uuid(),'support','Support ticket updated','The status of your support request changed.','/support') on conflict do nothing;
 end if;
 end if;
 end if;return new;
end; $$;
revoke all on function private.nexus_deliver_event() from public,anon,authenticated;
create trigger nexus_notify_registration after insert on auth.users for each row execute function private.nexus_deliver_event();
create trigger nexus_notify_admin after insert on public.nexus_admin_audit for each row execute function private.nexus_deliver_event();
create trigger nexus_notify_account after insert on public.nexus_account_events for each row execute function private.nexus_deliver_event();
create trigger nexus_notify_document after insert or update on public.nexus_documents for each row execute function private.nexus_deliver_event();

create function public.nexus_notification_inbox(recipient uuid,view_name text default 'inbox',category_filter text default 'all',search_text text default '',page_number integer default 0)
returns jsonb language sql stable set search_path=pg_catalog,public as $$
 with authorized as(select * from public.nexus_notifications n where n.recipient_id=recipient and (category<>'admin' or exists(select 1 from public.nexus_user_roles where user_id=recipient and role='admin'))),
 filtered as(select * from authorized where
 (case view_name when 'archive' then archived_at is not null when 'unread' then archived_at is null and read_at is null else archived_at is null end)
 and (category_filter='all' or category=category_filter) and strpos(lower(title||' '||body),lower(search_text))>0),
 paged as(select * from filtered order by created_at desc,id desc limit 30 offset greatest(0,page_number)*30)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)-'recipient_id'-'event_key' order by created_at desc,id desc) from paged p),'[]'::jsonb),
 'total',(select count(*) from filtered),'unread',(select count(*) from authorized where read_at is null and archived_at is null),
 'cutoff',clock_timestamp(),'page',page_number,'hasMore',(select count(*) from filtered)>(page_number+1)*30);
$$;
revoke all on function public.nexus_notification_inbox(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.nexus_notification_inbox(uuid,text,text,text,integer) to service_role;

create function public.nexus_notification_action(recipient uuid,operation text,item uuid default null,cutoff timestamptz default null) returns integer language plpgsql set search_path=pg_catalog,public as $$
declare changed integer;
begin
 if operation='read_all' then
 if cutoff is null or cutoff>clock_timestamp()+interval '1 minute' then raise exception 'Valid acknowledgement cutoff required' using errcode='22023'; end if;
 update public.nexus_notifications set read_at=clock_timestamp() where recipient_id=recipient and read_at is null and archived_at is null and created_at<=cutoff and (category<>'admin' or exists(select 1 from public.nexus_user_roles where user_id=recipient and role='admin'));
 elsif operation in ('read','unread','archive','restore') then
 update public.nexus_notifications set read_at=case operation when 'read' then clock_timestamp() when 'unread' then null else read_at end,
 archived_at=case operation when 'archive' then clock_timestamp() when 'restore' then null else archived_at end
 where id=item and recipient_id=recipient and (category<>'admin' or exists(select 1 from public.nexus_user_roles where user_id=recipient and role='admin'));
 else raise exception 'Invalid notification action' using errcode='22023'; end if;
 get diagnostics changed=row_count; return changed;
end; $$;
revoke all on function public.nexus_notification_action(uuid,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.nexus_notification_action(uuid,text,uuid,timestamptz) to service_role;

create function public.nexus_activity_feed(source_filter text default 'all',action_filter text default '',search_text text default '',since_time timestamptz default null,until_time timestamptz default null,page_number integer default 0)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 with events as (
 select 'admin:'||id as id,'admin' as source,action as type,actor_id,target_id,reason,created_at,jsonb_build_object('before',(select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(coalesce(before_data,'{}')) where key in ('name','country','bio','role','status')), 'after',(select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(coalesce(after_data,'{}')) where key in ('name','country','bio','role','status'))) as details from public.nexus_admin_audit
 union all select 'account:'||id,'account',type,actor_id,user_id,''::text,created_at,metadata from public.nexus_account_events
 union all select 'registration:'||id,'registration',type,null::uuid,target_id,''::text,created_at,'{}'::jsonb from public.nexus_platform_events
 ), named as(select e.*,coalesce((select nullif(d.data->>'name','') from public.nexus_documents d where d.collection_path='users' and d.user_id=e.actor_id order by d.updated_at desc limit 1),nullif(a.raw_user_meta_data->>'full_name',''),nullif(a.raw_user_meta_data->>'name',''),e.actor_id::text,'Not recorded') actor,
 coalesce((select nullif(d.data->>'name','') from public.nexus_documents d where d.collection_path='users' and d.user_id=e.target_id order by d.updated_at desc limit 1),nullif(t.raw_user_meta_data->>'full_name',''),nullif(t.raw_user_meta_data->>'name',''),e.target_id::text,'—') target from events e left join auth.users a on a.id=e.actor_id left join auth.users t on t.id=e.target_id),
 filtered as(select * from named where (source_filter='all' or source=source_filter) and (action_filter='' or type=action_filter)
 and (since_time is null or created_at>=since_time) and (until_time is null or created_at<=until_time)
 and strpos(lower(actor||' '||target||' '||type||' '||reason),lower(search_text))>0),
 paged as(select * from filtered order by created_at desc,id desc limit 30 offset greatest(0,page_number)*30)
 select jsonb_build_object('events',coalesce((select jsonb_agg(to_jsonb(p) order by created_at desc,id desc) from paged p),'[]'::jsonb),
 'total',(select count(*) from filtered),'page',page_number,'hasMore',(select count(*) from filtered)>(page_number+1)*30,'updatedAt',clock_timestamp(),
 'counts',jsonb_build_object('admin',(select count(*) from filtered where source='admin'),'account',(select count(*) from filtered where source='account'),'registration',(select count(*) from filtered where source='registration')));
$$;
revoke all on function public.nexus_activity_feed(text,text,text,timestamptz,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.nexus_activity_feed(text,text,text,timestamptz,timestamptz,integer) to service_role;
