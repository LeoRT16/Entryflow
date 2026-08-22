create or replace function public.resource_belongs_to_event(
  reservation_resource_id uuid,
  reservation_event_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    reservation_resource_id is null
    or exists (
      select 1
      from public.events as e
      join public.resources as r
        on r.id = reservation_resource_id
      where e.id = reservation_event_id
        and e.deleted_at is null
        and r.deleted_at is null
        and e.organization_id = any(public.current_organization_ids())
        and e.id = any(public.current_event_ids())
        and r.id = any(public.current_resource_ids())
        and (
          e.venue_id is null
          or r.venue_id = e.venue_id
        )
    );
$$;

comment on function public.resource_belongs_to_event(uuid, uuid) is 'Validates that a reservation resource stays within the current tenant and either matches the persisted event venue or, for venue-less events, remains within the current accessible resource set.';
