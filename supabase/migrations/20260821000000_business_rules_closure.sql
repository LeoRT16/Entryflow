create or replace function public.current_venue_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    array_agg(distinct v.id order by v.id),
    '{}'::uuid[]
  )
  from public.venues as v
  where v.deleted_at is null
    and v.organization_id = any(public.current_organization_ids());
$$;

create or replace function public.current_event_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    array_agg(distinct e.id order by e.id),
    '{}'::uuid[]
  )
  from public.events as e
  where e.deleted_at is null
    and e.organization_id = any(public.current_organization_ids());
$$;

create or replace function public.current_table_ids()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    array_agg(distinct t.id::text order by t.id::text),
    '{}'::text[]
  )
  from public.tables as t
  where t.deleted_at is null
    and t.event_id = any(public.current_event_ids());
$$;

create index if not exists events_organization_id_idx on public.events (organization_id);
create index if not exists venues_organization_id_idx on public.venues (organization_id);
create index if not exists sectors_venue_id_idx on public.sectors (venue_id);
create index if not exists resources_venue_id_idx on public.resources (venue_id);
create index if not exists reservations_event_id_idx on public.reservations (event_id);
create index if not exists reservations_table_id_idx on public.reservations (table_id);
create index if not exists guests_event_id_idx on public.guests (event_id);
create index if not exists guests_table_id_idx on public.guests (table_id);
create index if not exists tables_event_id_idx on public.tables (event_id);
create index if not exists checkins_event_id_idx on public.checkins (event_id);
create index if not exists timeline_events_event_id_idx on public.timeline_events (event_id);

alter table public.events enable row level security;
alter table public.venues enable row level security;
alter table public.sectors enable row level security;
alter table public.resources enable row level security;
alter table public.reservations enable row level security;
alter table public.guests enable row level security;
alter table public.tables enable row level security;
alter table public.checkins enable row level security;
alter table public.timeline_events enable row level security;

drop policy if exists "Allow all access" on public.events;
drop policy if exists "Allow all access" on public.venues;
drop policy if exists "Allow all access" on public.sectors;
drop policy if exists "Allow all access" on public.resources;
drop policy if exists "Allow all access" on public.reservations;
drop policy if exists "Allow all access" on public.guests;
drop policy if exists "Allow all access" on public.tables;
drop policy if exists "Allow all access" on public.checkins;
drop policy if exists "Allow all access" on public.timeline_events;

drop policy if exists "Tenant-scoped event select" on public.events;
drop policy if exists "Tenant-scoped event insert" on public.events;
drop policy if exists "Tenant-scoped event update" on public.events;
drop policy if exists "Tenant-scoped event delete" on public.events;

drop policy if exists "Tenant-scoped venue select" on public.venues;
drop policy if exists "Tenant-scoped venue insert" on public.venues;
drop policy if exists "Tenant-scoped venue update" on public.venues;
drop policy if exists "Tenant-scoped venue delete" on public.venues;

drop policy if exists "Tenant-scoped sector select" on public.sectors;
drop policy if exists "Tenant-scoped sector insert" on public.sectors;
drop policy if exists "Tenant-scoped sector update" on public.sectors;
drop policy if exists "Tenant-scoped sector delete" on public.sectors;

drop policy if exists "Tenant-scoped resource select" on public.resources;
drop policy if exists "Tenant-scoped resource insert" on public.resources;
drop policy if exists "Tenant-scoped resource update" on public.resources;
drop policy if exists "Tenant-scoped resource delete" on public.resources;

drop policy if exists "Tenant-scoped reservation select" on public.reservations;
drop policy if exists "Tenant-scoped reservation insert" on public.reservations;
drop policy if exists "Tenant-scoped reservation update" on public.reservations;
drop policy if exists "Tenant-scoped reservation delete" on public.reservations;

drop policy if exists "Tenant-scoped guest select" on public.guests;
drop policy if exists "Tenant-scoped guest insert" on public.guests;
drop policy if exists "Tenant-scoped guest update" on public.guests;
drop policy if exists "Tenant-scoped guest delete" on public.guests;

drop policy if exists "Tenant-scoped table select" on public.tables;
drop policy if exists "Tenant-scoped table insert" on public.tables;
drop policy if exists "Tenant-scoped table update" on public.tables;
drop policy if exists "Tenant-scoped table delete" on public.tables;

drop policy if exists "Tenant-scoped checkin select" on public.checkins;
drop policy if exists "Tenant-scoped checkin insert" on public.checkins;
drop policy if exists "Tenant-scoped checkin update" on public.checkins;
drop policy if exists "Tenant-scoped checkin delete" on public.checkins;

drop policy if exists "Tenant-scoped timeline_event select" on public.timeline_events;
drop policy if exists "Tenant-scoped timeline_event insert" on public.timeline_events;
drop policy if exists "Tenant-scoped timeline_event update" on public.timeline_events;
drop policy if exists "Tenant-scoped timeline_event delete" on public.timeline_events;

create policy "Tenant-scoped event select"
  on public.events
  for select
  to authenticated
  using (
    events.deleted_at is null
    and events.organization_id = any(public.current_organization_ids())
  );

create policy "Tenant-scoped event insert"
  on public.events
  for insert
  to authenticated
  with check (
    events.organization_id = any(public.current_organization_ids())
    and (
      events.venue_id is null
      or events.venue_id = any(public.current_venue_ids())
    )
  );

create policy "Tenant-scoped event update"
  on public.events
  for update
  to authenticated
  using (
    events.organization_id = any(public.current_organization_ids())
  )
  with check (
    events.organization_id = any(public.current_organization_ids())
    and (
      events.venue_id is null
      or events.venue_id = any(public.current_venue_ids())
    )
  );

create policy "Tenant-scoped event delete"
  on public.events
  for delete
  to authenticated
  using (
    events.organization_id = any(public.current_organization_ids())
  );

create policy "Tenant-scoped venue select"
  on public.venues
  for select
  to authenticated
  using (
    venues.deleted_at is null
    and venues.organization_id = any(public.current_organization_ids())
  );

create policy "Tenant-scoped venue insert"
  on public.venues
  for insert
  to authenticated
  with check (
    venues.organization_id = any(public.current_organization_ids())
  );

create policy "Tenant-scoped venue update"
  on public.venues
  for update
  to authenticated
  using (
    venues.organization_id = any(public.current_organization_ids())
  )
  with check (
    venues.organization_id = any(public.current_organization_ids())
  );

create policy "Tenant-scoped venue delete"
  on public.venues
  for delete
  to authenticated
  using (
    venues.organization_id = any(public.current_organization_ids())
  );

create policy "Tenant-scoped sector select"
  on public.sectors
  for select
  to authenticated
  using (
    sectors.deleted_at is null
    and sectors.venue_id = any(public.current_venue_ids())
  );

create policy "Tenant-scoped sector insert"
  on public.sectors
  for insert
  to authenticated
  with check (
    sectors.venue_id = any(public.current_venue_ids())
  );

create policy "Tenant-scoped sector update"
  on public.sectors
  for update
  to authenticated
  using (
    sectors.venue_id = any(public.current_venue_ids())
  )
  with check (
    sectors.venue_id = any(public.current_venue_ids())
  );

create policy "Tenant-scoped sector delete"
  on public.sectors
  for delete
  to authenticated
  using (
    sectors.venue_id = any(public.current_venue_ids())
  );

create policy "Tenant-scoped resource select"
  on public.resources
  for select
  to authenticated
  using (
    resources.deleted_at is null
    and resources.venue_id = any(public.current_venue_ids())
  );

create policy "Tenant-scoped resource insert"
  on public.resources
  for insert
  to authenticated
  with check (
    resources.venue_id = any(public.current_venue_ids())
  );

create policy "Tenant-scoped resource update"
  on public.resources
  for update
  to authenticated
  using (
    resources.venue_id = any(public.current_venue_ids())
  )
  with check (
    resources.venue_id = any(public.current_venue_ids())
  );

create policy "Tenant-scoped resource delete"
  on public.resources
  for delete
  to authenticated
  using (
    resources.venue_id = any(public.current_venue_ids())
  );

create policy "Tenant-scoped reservation select"
  on public.reservations
  for select
  to authenticated
  using (
    reservations.deleted_at is null
    and reservations.event_id = any(public.current_event_ids())
  );

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
  );

create policy "Tenant-scoped reservation delete"
  on public.reservations
  for delete
  to authenticated
  using (
    reservations.event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped guest select"
  on public.guests
  for select
  to authenticated
  using (
    guests.deleted_at is null
    and guests.event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped guest insert"
  on public.guests
  for insert
  to authenticated
  with check (
    guests.event_id = any(public.current_event_ids())
    and (
      guests.table_id is null
      or guests.table_id = any(public.current_table_ids())
    )
  );

create policy "Tenant-scoped guest update"
  on public.guests
  for update
  to authenticated
  using (
    guests.event_id = any(public.current_event_ids())
  )
  with check (
    guests.event_id = any(public.current_event_ids())
    and (
      guests.table_id is null
      or guests.table_id = any(public.current_table_ids())
    )
  );

create policy "Tenant-scoped guest delete"
  on public.guests
  for delete
  to authenticated
  using (
    guests.event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped table select"
  on public.tables
  for select
  to authenticated
  using (
    tables.deleted_at is null
    and tables.event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped table insert"
  on public.tables
  for insert
  to authenticated
  with check (
    tables.event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped table update"
  on public.tables
  for update
  to authenticated
  using (
    tables.event_id = any(public.current_event_ids())
  )
  with check (
    tables.event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped table delete"
  on public.tables
  for delete
  to authenticated
  using (
    tables.event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped checkin select"
  on public.checkins
  for select
  to authenticated
  using (
    checkins.deleted_at is null
    and checkins.event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped checkin insert"
  on public.checkins
  for insert
  to authenticated
  with check (
    checkins.event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped checkin update"
  on public.checkins
  for update
  to authenticated
  using (
    checkins.event_id = any(public.current_event_ids())
  )
  with check (
    checkins.event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped checkin delete"
  on public.checkins
  for delete
  to authenticated
  using (
    checkins.event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped timeline_event select"
  on public.timeline_events
  for select
  to authenticated
  using (
    timeline_events.deleted_at is null
    and timeline_events.event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped timeline_event insert"
  on public.timeline_events
  for insert
  to authenticated
  with check (
    timeline_events.event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped timeline_event update"
  on public.timeline_events
  for update
  to authenticated
  using (
    timeline_events.event_id = any(public.current_event_ids())
  )
  with check (
    timeline_events.event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped timeline_event delete"
  on public.timeline_events
  for delete
  to authenticated
  using (
    timeline_events.event_id = any(public.current_event_ids())
  );

comment on function public.current_venue_ids() is 'Resolves the current accessible venue ids through SECURITY DEFINER membership context without recursive browser RLS joins.';
comment on function public.current_event_ids() is 'Resolves the current accessible event ids through SECURITY DEFINER membership context without recursive browser RLS joins.';
comment on function public.current_table_ids() is 'Resolves the current accessible table ids through SECURITY DEFINER membership context without recursive browser RLS joins.';
