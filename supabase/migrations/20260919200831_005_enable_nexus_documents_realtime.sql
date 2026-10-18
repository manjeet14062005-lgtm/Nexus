do $$
begin
  if not exists (
    select 1
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    where p.pubname = 'supabase_realtime'
      and pr.prrelid = 'public.nexus_documents'::regclass
  ) then
    execute 'alter publication supabase_realtime add table public.nexus_documents';
  end if;
end
$$;
