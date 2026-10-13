-- The procedure calls this existing SECURITY DEFINER helper for the Root
-- branch. Grant only EXECUTE; the helper retains ownership and table access.
grant execute on function public.is_platform_root() to event_deleter;
