
revoke execute on function public.nexus_handle_new_user() from anon, authenticated;
revoke execute on function public.nexus_has_workspace_access(text) from anon, authenticated;
revoke execute on function public.nexus_is_admin() from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;

