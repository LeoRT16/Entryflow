-- The deletion procedure reads these two tables for its server-side
-- Root/Owner check. No write, auth-schema, or user-table privilege is needed.
grant select on public.profiles, public.roles to event_deleter;
