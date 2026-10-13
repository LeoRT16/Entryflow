-- auth.uid() already has EXECUTE for event_deleter. The missing privilege is
-- only schema USAGE, required for PostgreSQL to resolve auth.uid() while the
-- SECURITY DEFINER function runs under event_deleter.
grant usage on schema auth to event_deleter;
