create table if not exists public.accreditation_event_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  day_number integer not null,
  name text not null,
  event_date date not null,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint accreditation_event_days_number_check check (day_number > 0),
  constraint accreditation_event_days_name_check check (length(trim(name)) > 0),
  constraint accreditation_event_days_window_check check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create unique index if not exists accreditation_event_days_number_unique
  on public.accreditation_event_days (organization_id, event_id, day_number)
  where deleted_at is null;
create unique index if not exists accreditation_event_days_date_unique
  on public.accreditation_event_days (organization_id, event_id, event_date)
  where deleted_at is null;
create index if not exists accreditation_event_days_event_idx
  on public.accreditation_event_days (organization_id, event_id, event_date, status);

create table if not exists public.accreditation_access_grant_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  access_grant_id uuid not null references public.accreditation_access_grants(id) on delete restrict,
  event_day_id uuid not null references public.accreditation_event_days(id) on delete restrict,
  created_at timestamptz not null default now()
);
create unique index if not exists accreditation_access_grant_days_unique
  on public.accreditation_access_grant_days (organization_id, event_id, access_grant_id, event_day_id);

create table if not exists public.accreditation_access_entitlement_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  entitlement_id uuid not null references public.accreditation_access_entitlements(id) on delete restrict,
  event_day_id uuid not null references public.accreditation_event_days(id) on delete restrict,
  created_at timestamptz not null default now()
);
create unique index if not exists accreditation_access_entitlement_days_unique
  on public.accreditation_access_entitlement_days (organization_id, event_id, entitlement_id, event_day_id);

alter table public.accreditation_sector_access_attempts
  add column if not exists event_day_id uuid references public.accreditation_event_days(id) on delete restrict;
alter table public.accreditation_sector_movements
  add column if not exists event_day_id uuid references public.accreditation_event_days(id) on delete restrict;
create index if not exists accreditation_sector_access_attempts_event_day_idx
  on public.accreditation_sector_access_attempts (organization_id, event_id, event_day_id, evaluated_at desc);
create index if not exists accreditation_sector_movements_event_day_idx
  on public.accreditation_sector_movements (organization_id, event_id, event_day_id, moved_at desc);

create or replace function public.accreditation_festival_day_belongs_to_scope(
  target_organization_id uuid,
  target_event_id uuid,
  target_event_day_id uuid
)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.accreditation_event_days d
    where d.id = target_event_day_id
      and d.organization_id = target_organization_id
      and d.event_id = target_event_id
      and d.status = 'active'
      and d.deleted_at is null
  );
$$;

create or replace function public.accreditation_festival_day_access_is_valid(
  target_organization_id uuid,
  target_event_id uuid,
  target_access_grant_id uuid,
  target_sector_id uuid,
  target_event_day_id uuid
)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select
    public.accreditation_festival_day_belongs_to_scope(target_organization_id, target_event_id, target_event_day_id)
    and exists (
      select 1 from public.accreditation_access_grants g
      where g.id = target_access_grant_id and g.organization_id = target_organization_id
        and g.event_id = target_event_id and g.status = 'active'
    )
    and exists (
      select 1 from public.accreditation_access_sectors s
      where s.id = target_sector_id and s.organization_id = target_organization_id
        and s.event_id = target_event_id and s.status = 'active' and s.deleted_at is null
    )
    and exists (
      select 1 from public.accreditation_access_entitlements e
      where e.organization_id = target_organization_id and e.event_id = target_event_id
        and e.access_grant_id = target_access_grant_id and e.sector_id = target_sector_id and e.status = 'active'
        and (
          not exists (select 1 from public.accreditation_access_entitlement_days ed where ed.entitlement_id = e.id)
          or exists (select 1 from public.accreditation_access_entitlement_days ed where ed.entitlement_id = e.id and ed.event_day_id = target_event_day_id)
        )
    )
    and (
      not exists (select 1 from public.accreditation_access_grant_days gd where gd.access_grant_id = target_access_grant_id)
      or exists (select 1 from public.accreditation_access_grant_days gd where gd.access_grant_id = target_access_grant_id and gd.event_day_id = target_event_day_id)
    );
$$;

create or replace function public.accreditation_festival_day_reference_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.accreditation_festival_day_belongs_to_scope(new.organization_id, new.event_id, new.event_day_id) then
    raise exception 'Festival event day is outside the target event scope';
  end if;
  if tg_table_name = 'accreditation_access_grant_days' and not exists (
    select 1 from public.accreditation_access_grants g
    where g.id = new.access_grant_id and g.organization_id = new.organization_id and g.event_id = new.event_id
  ) then
    raise exception 'Festival grant day references a grant outside the target event';
  end if;
  if tg_table_name = 'accreditation_access_entitlement_days' and not exists (
    select 1 from public.accreditation_access_entitlements e
    where e.id = new.entitlement_id and e.organization_id = new.organization_id and e.event_id = new.event_id
  ) then
    raise exception 'Festival entitlement day references an entitlement outside the target event';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_accreditation_access_grant_day_scope on public.accreditation_access_grant_days;
create trigger enforce_accreditation_access_grant_day_scope before insert or update on public.accreditation_access_grant_days
for each row execute function public.accreditation_festival_day_reference_guard();
drop trigger if exists enforce_accreditation_access_entitlement_day_scope on public.accreditation_access_entitlement_days;
create trigger enforce_accreditation_access_entitlement_day_scope before insert or update on public.accreditation_access_entitlement_days
for each row execute function public.accreditation_festival_day_reference_guard();

create or replace function public.accreditation_festival_event_day_audit_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.event_day_id is not null and not public.accreditation_festival_day_belongs_to_scope(new.organization_id, new.event_id, new.event_day_id) then
    raise exception 'Festival audit event day is outside the target event scope';
  end if;
  if tg_table_name = 'accreditation_sector_access_attempts' and new.event_day_id is not null and new.decision = 'allow' and not public.accreditation_festival_day_access_is_valid(new.organization_id, new.event_id, new.access_grant_id, new.sector_id, new.event_day_id) then
    raise exception 'Festival access is not valid for the selected event day';
  end if;
  if tg_table_name = 'accreditation_sector_movements' and new.event_day_id is not null and new.movement = 'entry' and not public.accreditation_festival_day_access_is_valid(new.organization_id, new.event_id, new.access_grant_id, new.sector_id, new.event_day_id) then
    raise exception 'Festival movement is not valid for the selected event day';
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_accreditation_festival_attempt_day on public.accreditation_sector_access_attempts;
create trigger enforce_accreditation_festival_attempt_day before insert on public.accreditation_sector_access_attempts
for each row execute function public.accreditation_festival_event_day_audit_guard();
drop trigger if exists enforce_accreditation_festival_movement_day on public.accreditation_sector_movements;
create trigger enforce_accreditation_festival_movement_day before insert on public.accreditation_sector_movements
for each row execute function public.accreditation_festival_event_day_audit_guard();

alter table public.accreditation_event_days enable row level security;
alter table public.accreditation_access_grant_days enable row level security;
alter table public.accreditation_access_entitlement_days enable row level security;
create policy "Tenant-scoped accreditation event day access" on public.accreditation_event_days for select to authenticated
  using (organization_id = any(public.current_organization_ids()) and event_id = any(public.current_event_ids()));
create policy "Tenant-scoped accreditation grant day access" on public.accreditation_access_grant_days for select to authenticated
  using (organization_id = any(public.current_organization_ids()) and event_id = any(public.current_event_ids()));
create policy "Tenant-scoped accreditation entitlement day access" on public.accreditation_access_entitlement_days for select to authenticated
  using (organization_id = any(public.current_organization_ids()) and event_id = any(public.current_event_ids()));

comment on table public.accreditation_event_days is 'Operational days of one Festival event; days do not create child events or duplicate credentials.';
comment on function public.accreditation_festival_day_access_is_valid(uuid, uuid, uuid, uuid, uuid) is 'Validates a canonical accreditation grant and sector entitlement for one active Festival day.';
