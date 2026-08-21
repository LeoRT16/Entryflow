alter table public.reservations
  add column if not exists resource_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conname = 'reservations_resource_id_fkey'
      and c.conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_resource_id_fkey
      foreign key (resource_id)
      references public.resources(id)
      on delete set null;
  end if;
end $$;

create index if not exists reservations_resource_id_idx on public.reservations (resource_id);

create or replace function public.current_resource_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    array_agg(distinct r.id order by r.id),
    '{}'::uuid[]
  )
  from public.resources as r
  where r.deleted_at is null
    and r.venue_id = any(public.current_venue_ids());
$$;

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
        and r.venue_id = e.venue_id
        and r.id = any(public.current_resource_ids())
    );
$$;

drop policy if exists "Allow all access" on public.reservations;
drop policy if exists "Tenant-scoped reservation insert" on public.reservations;
drop policy if exists "Tenant-scoped reservation update" on public.reservations;

create policy "Tenant-scoped reservation insert"
  on public.reservations
  for insert
  to authenticated
  with check (
    reservations.event_id = any(public.current_event_ids())
    and (
      reservations.table_id is null
      or reservations.table_id = any(public.current_table_ids())
    )
    and public.resource_belongs_to_event(reservations.resource_id, reservations.event_id)
  );

create policy "Tenant-scoped reservation update"
  on public.reservations
  for update
  to authenticated
  using (
    reservations.event_id = any(public.current_event_ids())
  )
  with check (
    reservations.event_id = any(public.current_event_ids())
    and (
      reservations.table_id is null
      or reservations.table_id = any(public.current_table_ids())
    )
    and public.resource_belongs_to_event(reservations.resource_id, reservations.event_id)
  );

comment on function public.current_resource_ids() is 'Resolves the current accessible resource ids through SECURITY DEFINER membership context without recursive browser RLS joins.';
comment on function public.resource_belongs_to_event(uuid, uuid) is 'Validates that a reservation resource stays within the current tenant and the reservation event venue without browser-controlled joins.';
