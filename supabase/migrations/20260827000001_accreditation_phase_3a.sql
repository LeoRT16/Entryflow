create or replace function public.accreditation_access_sector_belongs_to_scope(
  sector_organization_id uuid,
  sector_event_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    sector_organization_id = any(public.current_organization_ids())
    and sector_event_id = any(public.current_event_ids())
    and exists (
      select 1
      from public.events as event_row
      where event_row.id = sector_event_id
        and event_row.deleted_at is null
        and event_row.organization_id = sector_organization_id
        and event_row.organization_id = any(public.current_organization_ids())
        and event_row.id = any(public.current_event_ids())
    );
$$;

create or replace function public.accreditation_access_sector_operator_is_authorized(
  sector_organization_id uuid,
  sector_event_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles as p
    join public.roles as r
      on r.id = p.role_id
    where p.user_id = public.current_app_user_id()
      and p.organization_id = sector_organization_id
      and p.deleted_at is null
      and r.deleted_at is null
      and sector_organization_id = any(public.current_organization_ids())
      and sector_event_id = any(public.current_event_ids())
      and (
        'event.edit' = any(r.permissions)
        or 'settings.manage' = any(r.permissions)
      )
  );
$$;

create or replace function public.accreditation_access_sector_identity_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.organization_id is distinct from new.organization_id
    or old.event_id is distinct from new.event_id then
    raise exception 'accreditation_access_sectors identity columns are immutable';
  end if;

  return new;
end;
$$;

create or replace function public.accreditation_access_entitlement_identity_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.organization_id is distinct from new.organization_id
    or old.event_id is distinct from new.event_id
    or old.access_grant_id is distinct from new.access_grant_id
    or old.sector_id is distinct from new.sector_id then
    raise exception 'accreditation_access_entitlements identity columns are immutable';
  end if;

  return new;
end;
$$;

create table if not exists public.accreditation_access_sectors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  code text not null,
  description text,
  status text not null default 'active',
  capacity integer,
  sort_order integer not null default 0,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint accreditation_access_sectors_status_check check (status in ('active', 'inactive')),
  constraint accreditation_access_sectors_capacity_check check (capacity is null or capacity >= 0),
  constraint accreditation_access_sectors_scope_check check (public.accreditation_access_sector_belongs_to_scope(organization_id, event_id))
);

create or replace function public.accreditation_access_entitlement_belongs_to_scope(
  entitlement_organization_id uuid,
  entitlement_event_id uuid,
  entitlement_access_grant_id uuid,
  entitlement_sector_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    entitlement_organization_id = any(public.current_organization_ids())
    and entitlement_event_id = any(public.current_event_ids())
    and exists (
      select 1
      from public.accreditation_access_grants as grant_row
      where grant_row.id = entitlement_access_grant_id
        and grant_row.organization_id = entitlement_organization_id
        and grant_row.event_id = entitlement_event_id
        and grant_row.organization_id = any(public.current_organization_ids())
        and grant_row.event_id = any(public.current_event_ids())
    )
    and exists (
      select 1
      from public.accreditation_access_sectors as sector_row
      where sector_row.id = entitlement_sector_id
        and sector_row.deleted_at is null
        and sector_row.organization_id = entitlement_organization_id
        and sector_row.event_id = entitlement_event_id
        and sector_row.organization_id = any(public.current_organization_ids())
        and sector_row.event_id = any(public.current_event_ids())
    );
$$;

create or replace function public.accreditation_access_entitlement_can_be_assigned(
  entitlement_organization_id uuid,
  entitlement_event_id uuid,
  entitlement_access_grant_id uuid,
  entitlement_sector_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.accreditation_access_sector_operator_is_authorized(
      entitlement_organization_id,
      entitlement_event_id
    )
    and public.accreditation_access_entitlement_belongs_to_scope(
      entitlement_organization_id,
      entitlement_event_id,
      entitlement_access_grant_id,
      entitlement_sector_id
    )
    and exists (
      select 1
      from public.accreditation_access_grants as grant_row
      where grant_row.id = entitlement_access_grant_id
        and grant_row.status = 'active'
    )
    and exists (
      select 1
      from public.accreditation_enrollments as enrollment
      where enrollment.id = (
        select grant_row.enrollment_id
        from public.accreditation_access_grants as grant_row
        where grant_row.id = entitlement_access_grant_id
      )
        and enrollment.deleted_at is null
        and enrollment.status = 'active'
    )
    and exists (
      select 1
      from public.accreditation_access_sectors as sector_row
      where sector_row.id = entitlement_sector_id
        and sector_row.deleted_at is null
        and sector_row.status = 'active'
    );
$$;

create table if not exists public.accreditation_access_entitlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  access_grant_id uuid not null references public.accreditation_access_grants(id) on delete cascade,
  sector_id uuid not null references public.accreditation_access_sectors(id) on delete cascade,
  status text not null default 'active',
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accreditation_access_entitlements_status_check check (status in ('active', 'revoked')),
  constraint accreditation_access_entitlements_revoked_at_check check (
    (status = 'active' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  ),
  constraint accreditation_access_entitlements_scope_check check (
    public.accreditation_access_entitlement_belongs_to_scope(
      organization_id,
      event_id,
      access_grant_id,
      sector_id
    )
  )
);

create unique index if not exists accreditation_access_sectors_event_code_unique
  on public.accreditation_access_sectors (event_id, code)
  where deleted_at is null;

create index if not exists accreditation_access_sectors_organization_event_idx
  on public.accreditation_access_sectors (organization_id, event_id);

create index if not exists accreditation_access_sectors_event_status_order_idx
  on public.accreditation_access_sectors (event_id, status, sort_order, code);

create unique index if not exists accreditation_access_entitlements_grant_sector_active_unique
  on public.accreditation_access_entitlements (access_grant_id, sector_id)
  where status = 'active';

create index if not exists accreditation_access_entitlements_organization_event_idx
  on public.accreditation_access_entitlements (organization_id, event_id);

create index if not exists accreditation_access_entitlements_event_grant_idx
  on public.accreditation_access_entitlements (event_id, access_grant_id);

create index if not exists accreditation_access_entitlements_event_sector_idx
  on public.accreditation_access_entitlements (event_id, sector_id);

create index if not exists accreditation_access_entitlements_event_status_idx
  on public.accreditation_access_entitlements (event_id, status, issued_at desc);

drop trigger if exists enforce_accreditation_access_sector_identity_immutable on public.accreditation_access_sectors;
create trigger enforce_accreditation_access_sector_identity_immutable
before update on public.accreditation_access_sectors
for each row
execute function public.accreditation_access_sector_identity_immutable();

drop trigger if exists set_updated_at_accreditation_access_sectors on public.accreditation_access_sectors;
create trigger set_updated_at_accreditation_access_sectors
before update on public.accreditation_access_sectors
for each row
execute function public.set_updated_at();

drop trigger if exists enforce_accreditation_access_entitlement_identity_immutable on public.accreditation_access_entitlements;
create trigger enforce_accreditation_access_entitlement_identity_immutable
before update on public.accreditation_access_entitlements
for each row
execute function public.accreditation_access_entitlement_identity_immutable();

drop trigger if exists set_updated_at_accreditation_access_entitlements on public.accreditation_access_entitlements;
create trigger set_updated_at_accreditation_access_entitlements
before update on public.accreditation_access_entitlements
for each row
execute function public.set_updated_at();

alter table public.accreditation_access_sectors enable row level security;
alter table public.accreditation_access_entitlements enable row level security;

drop policy if exists "Tenant-scoped accreditation access sector select" on public.accreditation_access_sectors;
drop policy if exists "Tenant-scoped accreditation access sector insert" on public.accreditation_access_sectors;
drop policy if exists "Tenant-scoped accreditation access sector update" on public.accreditation_access_sectors;

drop policy if exists "Tenant-scoped accreditation access entitlement select" on public.accreditation_access_entitlements;
drop policy if exists "Tenant-scoped accreditation access entitlement insert" on public.accreditation_access_entitlements;
drop policy if exists "Tenant-scoped accreditation access entitlement update" on public.accreditation_access_entitlements;

create policy "Tenant-scoped accreditation access sector select"
  on public.accreditation_access_sectors
  for select
  to authenticated
  using (
    accreditation_access_sectors.deleted_at is null
    and public.accreditation_access_sector_belongs_to_scope(
      accreditation_access_sectors.organization_id,
      accreditation_access_sectors.event_id
    )
  );

create policy "Tenant-scoped accreditation access sector insert"
  on public.accreditation_access_sectors
  for insert
  to authenticated
  with check (
    accreditation_access_sectors.deleted_at is null
    and public.accreditation_access_sector_operator_is_authorized(
      accreditation_access_sectors.organization_id,
      accreditation_access_sectors.event_id
    )
    and public.accreditation_access_sector_belongs_to_scope(
      accreditation_access_sectors.organization_id,
      accreditation_access_sectors.event_id
    )
  );

create policy "Tenant-scoped accreditation access sector update"
  on public.accreditation_access_sectors
  for update
  to authenticated
  using (
    accreditation_access_sectors.deleted_at is null
    and public.accreditation_access_sector_belongs_to_scope(
      accreditation_access_sectors.organization_id,
      accreditation_access_sectors.event_id
    )
  )
  with check (
    accreditation_access_sectors.deleted_at is null
    and public.accreditation_access_sector_operator_is_authorized(
      accreditation_access_sectors.organization_id,
      accreditation_access_sectors.event_id
    )
    and public.accreditation_access_sector_belongs_to_scope(
      accreditation_access_sectors.organization_id,
      accreditation_access_sectors.event_id
    )
  );

create policy "Tenant-scoped accreditation access entitlement select"
  on public.accreditation_access_entitlements
  for select
  to authenticated
  using (
    public.accreditation_access_entitlement_belongs_to_scope(
      accreditation_access_entitlements.organization_id,
      accreditation_access_entitlements.event_id,
      accreditation_access_entitlements.access_grant_id,
      accreditation_access_entitlements.sector_id
    )
  );

create policy "Tenant-scoped accreditation access entitlement insert"
  on public.accreditation_access_entitlements
  for insert
  to authenticated
  with check (
    accreditation_access_entitlements.status = 'active'
    and public.accreditation_access_entitlement_can_be_assigned(
      accreditation_access_entitlements.organization_id,
      accreditation_access_entitlements.event_id,
      accreditation_access_entitlements.access_grant_id,
      accreditation_access_entitlements.sector_id
    )
  );

create policy "Tenant-scoped accreditation access entitlement update"
  on public.accreditation_access_entitlements
  for update
  to authenticated
  using (
    public.accreditation_access_entitlement_belongs_to_scope(
      accreditation_access_entitlements.organization_id,
      accreditation_access_entitlements.event_id,
      accreditation_access_entitlements.access_grant_id,
      accreditation_access_entitlements.sector_id
    )
  )
  with check (
    public.accreditation_access_sector_operator_is_authorized(
      accreditation_access_entitlements.organization_id,
      accreditation_access_entitlements.event_id
    )
    and public.accreditation_access_entitlement_belongs_to_scope(
      accreditation_access_entitlements.organization_id,
      accreditation_access_entitlements.event_id,
      accreditation_access_entitlements.access_grant_id,
      accreditation_access_entitlements.sector_id
    )
  );

comment on function public.accreditation_access_sector_belongs_to_scope(uuid, uuid) is 'Limits accreditation access sectors to the active organization and event scope.';
comment on function public.accreditation_access_sector_operator_is_authorized(uuid, uuid) is 'Requires the current user to submit one of their active operator profiles in the target organization and that role to include event.edit or settings.manage.';
comment on function public.accreditation_access_entitlement_belongs_to_scope(uuid, uuid, uuid, uuid) is 'Limits accreditation access entitlements to matching organization, event, grant, and sector scope.';
comment on function public.accreditation_access_entitlement_can_be_assigned(uuid, uuid, uuid, uuid) is 'Requires the current user to be authorized and the grant, enrollment, and sector to remain active within the same accreditation scope.';
comment on function public.accreditation_access_sector_identity_immutable() is 'Prevents accreditation access sector identity columns from changing after creation.';
comment on function public.accreditation_access_entitlement_identity_immutable() is 'Prevents accreditation access entitlement identity columns from changing after creation.';
