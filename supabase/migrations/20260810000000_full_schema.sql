create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null,
  timezone text not null,
  branding jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  event_type text not null,
  status text not null,
  start_at text not null,
  end_at text,
  timezone text not null,
  venue text not null,
  capacity integer not null default 0,
  enabled_modules text[] not null default '{}'::text[],
  operational_model text not null,
  admission_methods text[] not null default '{}'::text[],
  resource_types text[] not null default '{}'::text[],
  icon text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  address text,
  city text,
  country text,
  status text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.sectors (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  description text,
  capacity integer,
  display_order integer not null default 0,
  status text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  sector_id uuid references public.sectors(id) on delete set null,
  type text not null,
  name text not null,
  capacity integer not null default 0,
  status text not null,
  display_order integer not null default 0,
  notes text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_name text not null,
  reservation_name text not null,
  reservation_code text not null,
  reservation_id text not null,
  event_name text not null,
  table_id text,
  table_name text,
  event_status text not null,
  invitation_sequence text not null,
  invitation_code text not null,
  carnet text not null,
  whatsapp text not null default '',
  seat text,
  delivery_status text not null,
  admission_status text not null,
  reservation_status text not null,
  check_in_time text,
  check_in_method text,
  gate text,
  method text,
  attention text,
  attention_tone text,
  recent_change boolean not null default false,
  no_whatsapp boolean not null default false,
  no_invitation_sent boolean not null default false,
  manual_admission boolean not null default false,
  incidents jsonb,
  audit_rows jsonb,
  delivery_history jsonb not null default '[]'::jsonb,
  operator_activity jsonb not null default '[]'::jsonb,
  internal_notes text,
  qr_status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  event_id uuid not null references public.events(id) on delete cascade,
  event_name text not null,
  date text not null,
  time text not null,
  table_name text not null,
  table_id text,
  table_capacity integer not null default 0,
  holder_name text not null,
  holder_document text not null default '',
  holder_whatsapp text not null default '',
  holder_email text not null default '',
  reservation_type text not null,
  payment_status text not null,
  amount text not null default '0',
  advance text not null default '0',
  notes text not null default '',
  guest_ids text[] not null default '{}'::text[],
  status text not null,
  timeline jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  capacity integer not null default 0,
  location text not null,
  status text not null,
  event_id uuid not null references public.events(id) on delete cascade,
  reservation_ids text[] not null default '{}'::text[],
  guest_ids text[] not null default '{}'::text[],
  closed boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null,
  reservation_id uuid not null,
  event_id uuid not null references public.events(id) on delete cascade,
  access_grant_id uuid,
  access_type text not null default 'reservation',
  method text not null,
  checked_in_at text not null,
  checked_out_at text,
  operator text not null,
  gate text,
  notes text,
  audit_trail jsonb not null default '[]'::jsonb,
  reentry_allowed boolean not null default true,
  max_entries integer not null default 1,
  reentry_window_minutes integer,
  attempt_count integer not null default 0,
  last_attempt_at text,
  status text not null,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  timestamp text not null,
  kind text not null,
  icon text not null,
  tone text not null,
  title text not null,
  description text not null,
  reservation_id text,
  reservation_code text,
  reservation_name text,
  guest_id text,
  guest_name text,
  table_id text,
  table_name text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  timestamp text not null,
  kind text not null,
  icon text not null,
  tone text not null,
  title text not null,
  description text not null,
  reservation_id text,
  reservation_code text,
  reservation_name text,
  guest_id text,
  guest_name text,
  table_id text,
  table_name text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  permissions text[] not null default '{}'::text[],
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  avatar_url text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  display_name text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists set_updated_at_organizations on public.organizations;
create trigger set_updated_at_organizations before update on public.organizations for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_events on public.events;
create trigger set_updated_at_events before update on public.events for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_venues on public.venues;
create trigger set_updated_at_venues before update on public.venues for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_sectors on public.sectors;
create trigger set_updated_at_sectors before update on public.sectors for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_resources on public.resources;
create trigger set_updated_at_resources before update on public.resources for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_guests on public.guests;
create trigger set_updated_at_guests before update on public.guests for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_reservations on public.reservations;
create trigger set_updated_at_reservations before update on public.reservations for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_tables on public.tables;
create trigger set_updated_at_tables before update on public.tables for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_checkins on public.checkins;
create trigger set_updated_at_checkins before update on public.checkins for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_timeline_events on public.timeline_events;
create trigger set_updated_at_timeline_events before update on public.timeline_events for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_activity_logs on public.activity_logs;
create trigger set_updated_at_activity_logs before update on public.activity_logs for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_roles on public.roles;
create trigger set_updated_at_roles before update on public.roles for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_users on public.users;
create trigger set_updated_at_users before update on public.users for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles before update on public.profiles for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.events enable row level security;
alter table public.venues enable row level security;
alter table public.sectors enable row level security;
alter table public.resources enable row level security;
alter table public.guests enable row level security;
alter table public.reservations enable row level security;
alter table public.tables enable row level security;
alter table public.checkins enable row level security;
alter table public.timeline_events enable row level security;
alter table public.activity_logs enable row level security;
alter table public.roles enable row level security;
alter table public.users enable row level security;
alter table public.profiles enable row level security;

-- DEV POLICY: temporary V1 access policy so the app can persist and reload
-- workspace data while Auth/RBAC is not implemented. Replace before production.
drop policy if exists "Allow all access" on public.organizations;
create policy "Allow all access" on public.organizations for all using (true) with check (true);

drop policy if exists "Allow all access" on public.events;
create policy "Allow all access" on public.events for all using (true) with check (true);

drop policy if exists "Allow all access" on public.venues;
create policy "Allow all access" on public.venues for all using (true) with check (true);

drop policy if exists "Allow all access" on public.sectors;
create policy "Allow all access" on public.sectors for all using (true) with check (true);

drop policy if exists "Allow all access" on public.resources;
create policy "Allow all access" on public.resources for all using (true) with check (true);

drop policy if exists "Allow all access" on public.guests;
create policy "Allow all access" on public.guests for all using (true) with check (true);

drop policy if exists "Allow all access" on public.reservations;
create policy "Allow all access" on public.reservations for all using (true) with check (true);

drop policy if exists "Allow all access" on public.tables;
create policy "Allow all access" on public.tables for all using (true) with check (true);

drop policy if exists "Allow all access" on public.checkins;
create policy "Allow all access" on public.checkins for all using (true) with check (true);

drop policy if exists "Allow all access" on public.timeline_events;
create policy "Allow all access" on public.timeline_events for all using (true) with check (true);

drop policy if exists "Allow all access" on public.activity_logs;
create policy "Allow all access" on public.activity_logs for all using (true) with check (true);

drop policy if exists "Allow all access" on public.roles;
create policy "Allow all access" on public.roles for all using (true) with check (true);

drop policy if exists "Allow all access" on public.users;
create policy "Allow all access" on public.users for all using (true) with check (true);

drop policy if exists "Allow all access" on public.profiles;
create policy "Allow all access" on public.profiles for all using (true) with check (true);
