-- Phase 1: schema foundation for venue layouts and event snapshots.
-- This migration is intentionally non-destructive.
-- It does not backfill data yet and does not change the current UX/runtime flow.
-- Backfill and code migration will happen in later phases after review.

create table if not exists public.venue_layouts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  status text not null default 'active',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint venue_layouts_status_check check (status in ('active', 'archived'))
);

create table if not exists public.venue_layout_sectors (
  id uuid primary key default gen_random_uuid(),
  venue_layout_id uuid not null references public.venue_layouts(id) on delete cascade,
  source_sector_id uuid references public.sectors(id) on delete set null,
  name text not null,
  description text,
  capacity integer,
  display_order integer not null default 0,
  status text not null default 'active',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint venue_layout_sectors_status_check check (status in ('active', 'inactive', 'archived'))
);

create table if not exists public.venue_layout_resources (
  id uuid primary key default gen_random_uuid(),
  venue_layout_id uuid not null references public.venue_layouts(id) on delete cascade,
  venue_layout_sector_id uuid references public.venue_layout_sectors(id) on delete set null,
  source_resource_id uuid references public.resources(id) on delete set null,
  type text not null,
  name text not null,
  capacity integer not null default 0,
  status text not null default 'active',
  display_order integer not null default 0,
  notes text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint venue_layout_resources_status_check check (status in ('active', 'inactive', 'archived'))
);

create table if not exists public.event_layouts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  source_venue_layout_id uuid references public.venue_layouts(id) on delete set null,
  name text not null,
  description text,
  status text not null default 'active',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint event_layouts_status_check check (status in ('active', 'archived'))
);

create table if not exists public.event_layout_sectors (
  id uuid primary key default gen_random_uuid(),
  event_layout_id uuid not null references public.event_layouts(id) on delete cascade,
  source_venue_layout_sector_id uuid references public.venue_layout_sectors(id) on delete set null,
  name text not null,
  description text,
  capacity integer,
  display_order integer not null default 0,
  status text not null default 'active',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint event_layout_sectors_status_check check (status in ('active', 'inactive', 'archived'))
);

create table if not exists public.event_layout_resources (
  id uuid primary key default gen_random_uuid(),
  event_layout_id uuid not null references public.event_layouts(id) on delete cascade,
  event_layout_sector_id uuid references public.event_layout_sectors(id) on delete set null,
  source_venue_layout_resource_id uuid references public.venue_layout_resources(id) on delete set null,
  type text not null,
  name text not null,
  capacity integer not null default 0,
  status text not null default 'active',
  display_order integer not null default 0,
  notes text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint event_layout_resources_status_check check (status in ('active', 'inactive', 'archived'))
);

alter table public.events
  add column if not exists venue_id uuid;

alter table public.reservations
  add column if not exists event_layout_id uuid,
  add column if not exists event_layout_resource_id uuid;

create unique index if not exists venue_layouts_venue_default_unique
  on public.venue_layouts (venue_id)
  where is_default and deleted_at is null;

create unique index if not exists venue_layouts_venue_name_unique
  on public.venue_layouts (venue_id, lower(name))
  where deleted_at is null;

create index if not exists venue_layouts_venue_id_idx on public.venue_layouts (venue_id);
create index if not exists venue_layout_sectors_layout_id_idx on public.venue_layout_sectors (venue_layout_id);
create index if not exists venue_layout_resources_layout_id_idx on public.venue_layout_resources (venue_layout_id);
create index if not exists venue_layout_resources_sector_id_idx on public.venue_layout_resources (venue_layout_sector_id);

create unique index if not exists venue_layout_sectors_source_sector_unique
  on public.venue_layout_sectors (venue_layout_id, source_sector_id)
  where source_sector_id is not null and deleted_at is null;

create unique index if not exists venue_layout_sectors_name_unique
  on public.venue_layout_sectors (venue_layout_id, lower(name))
  where deleted_at is null;

create unique index if not exists venue_layout_resources_source_resource_unique
  on public.venue_layout_resources (venue_layout_id, source_resource_id)
  where source_resource_id is not null and deleted_at is null;

create unique index if not exists venue_layout_resources_name_unique
  on public.venue_layout_resources (venue_layout_id, lower(name))
  where deleted_at is null;

create index if not exists event_layouts_venue_id_idx on public.event_layouts (venue_id);
create index if not exists event_layouts_source_venue_layout_id_idx on public.event_layouts (source_venue_layout_id);
create index if not exists event_layout_sectors_layout_id_idx on public.event_layout_sectors (event_layout_id);
create index if not exists event_layout_resources_layout_id_idx on public.event_layout_resources (event_layout_id);
create index if not exists event_layout_resources_sector_id_idx on public.event_layout_resources (event_layout_sector_id);
create index if not exists reservations_event_layout_id_idx on public.reservations (event_layout_id);
create index if not exists reservations_event_layout_resource_id_idx on public.reservations (event_layout_resource_id);
create index if not exists events_venue_id_idx on public.events (venue_id);

create unique index if not exists event_layout_sectors_name_unique
  on public.event_layout_sectors (event_layout_id, lower(name))
  where deleted_at is null;

create unique index if not exists event_layout_sectors_source_sector_unique
  on public.event_layout_sectors (event_layout_id, source_venue_layout_sector_id)
  where source_venue_layout_sector_id is not null and deleted_at is null;

create unique index if not exists event_layout_resources_source_resource_unique
  on public.event_layout_resources (event_layout_id, source_venue_layout_resource_id)
  where source_venue_layout_resource_id is not null and deleted_at is null;

create unique index if not exists event_layout_resources_name_unique
  on public.event_layout_resources (event_layout_id, lower(name))
  where deleted_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_layouts_event_id_key'
      and conrelid = 'public.event_layouts'::regclass
  ) then
    alter table public.event_layouts
      add constraint event_layouts_event_id_key unique (event_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_layout_resources_id_event_layout_id_key'
      and conrelid = 'public.event_layout_resources'::regclass
  ) then
    alter table public.event_layout_resources
      add constraint event_layout_resources_id_event_layout_id_key unique (id, event_layout_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_venue_id_fkey'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_venue_id_fkey
      foreign key (venue_id) references public.venues(id) on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_event_layout_id_fkey'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_event_layout_id_fkey
      foreign key (event_layout_id) references public.event_layouts(id) on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_event_layout_resource_composite_fkey'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_event_layout_resource_composite_fkey
      foreign key (event_layout_resource_id, event_layout_id)
      references public.event_layout_resources(id, event_layout_id)
      on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_event_layout_pair_check'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_event_layout_pair_check
      check (event_layout_resource_id is null or event_layout_id is not null);
  end if;
end;
$$;

drop trigger if exists set_updated_at_venue_layouts on public.venue_layouts;
create trigger set_updated_at_venue_layouts
  before update on public.venue_layouts
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_venue_layout_sectors on public.venue_layout_sectors;
create trigger set_updated_at_venue_layout_sectors
  before update on public.venue_layout_sectors
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_venue_layout_resources on public.venue_layout_resources;
create trigger set_updated_at_venue_layout_resources
  before update on public.venue_layout_resources
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_event_layouts on public.event_layouts;
create trigger set_updated_at_event_layouts
  before update on public.event_layouts
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_event_layout_sectors on public.event_layout_sectors;
create trigger set_updated_at_event_layout_sectors
  before update on public.event_layout_sectors
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_event_layout_resources on public.event_layout_resources;
create trigger set_updated_at_event_layout_resources
  before update on public.event_layout_resources
  for each row execute function public.set_updated_at();

alter table public.venue_layouts enable row level security;
alter table public.venue_layout_sectors enable row level security;
alter table public.venue_layout_resources enable row level security;
alter table public.event_layouts enable row level security;
alter table public.event_layout_sectors enable row level security;
alter table public.event_layout_resources enable row level security;

drop policy if exists "DEV POLICY: Allow all access" on public.venue_layouts;
create policy "DEV POLICY: Allow all access" on public.venue_layouts for all using (true) with check (true);

drop policy if exists "DEV POLICY: Allow all access" on public.venue_layout_sectors;
create policy "DEV POLICY: Allow all access" on public.venue_layout_sectors for all using (true) with check (true);

drop policy if exists "DEV POLICY: Allow all access" on public.venue_layout_resources;
create policy "DEV POLICY: Allow all access" on public.venue_layout_resources for all using (true) with check (true);

drop policy if exists "DEV POLICY: Allow all access" on public.event_layouts;
create policy "DEV POLICY: Allow all access" on public.event_layouts for all using (true) with check (true);

drop policy if exists "DEV POLICY: Allow all access" on public.event_layout_sectors;
create policy "DEV POLICY: Allow all access" on public.event_layout_sectors for all using (true) with check (true);

drop policy if exists "DEV POLICY: Allow all access" on public.event_layout_resources;
create policy "DEV POLICY: Allow all access" on public.event_layout_resources for all using (true) with check (true);

comment on table public.venue_layouts is 'Reusable venue preset. Temporary DEV policy applies until auth/RBAC is introduced.';
comment on table public.venue_layout_sectors is 'Sectors belonging to a reusable venue preset. Temporary DEV policy applies until auth/RBAC is introduced.';
comment on table public.venue_layout_resources is 'Resources belonging to a reusable venue preset. Temporary DEV policy applies until auth/RBAC is introduced.';
comment on table public.event_layouts is 'Immutable operational snapshot for a specific event. Temporary DEV policy applies until auth/RBAC is introduced.';
comment on table public.event_layout_sectors is 'Sectors copied into an event-specific operational snapshot. Temporary DEV policy applies until auth/RBAC is introduced.';
comment on table public.event_layout_resources is 'Operational resources for a specific event snapshot. Temporary DEV policy applies until auth/RBAC is introduced.';
