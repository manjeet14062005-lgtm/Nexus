
create index if not exists idx_nexus_workspaces_owner_id
  on public.nexus_workspaces (owner_id);

create index if not exists idx_nexus_workspace_members_user_id
  on public.nexus_workspace_members (user_id);

create index if not exists idx_nexus_workspace_members_workspace_id
  on public.nexus_workspace_members (workspace_id);

create index if not exists idx_nexus_documents_collection_path
  on public.nexus_documents (collection_name, collection_path);

create index if not exists idx_nexus_documents_workspace_id
  on public.nexus_documents (workspace_id);

create index if not exists idx_nexus_documents_user_id
  on public.nexus_documents (user_id);

