-- SELECT ... FOR UPDATE requires UPDATE privilege on the locked relation.
-- Keep the privilege narrowly scoped to the SECURITY DEFINER deletion owner.
grant update on table public.events to event_deleter;
