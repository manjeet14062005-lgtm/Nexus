
update public.nexus_workspace_members
set role = lower(trim(role))
where role is not null;

alter table public.nexus_workspace_members
  drop constraint if exists nexus_workspace_members_role_check;

alter table public.nexus_workspace_members
  add constraint nexus_workspace_members_role_check
  check (role in ('owner','admin','developer','analyst','viewer'));

