create table if not exists public.accreditation_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.accreditation_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  category_id uuid references public.accreditation_categories(id) on delete set null,
  sector_id uuid references public.sectors(id) on delete set null,
  name text not null,
  email text,
  phone text,
  status text not null default 'active',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint accreditation_enrollments_status_check check (status in ('active', 'cancelled'))
);

create unique index if not exists accreditation_categories_event_slug_unique
  on public.accreditation_categories (event_id, slug)
  where deleted_at is null;

create index if not exists accreditation_categories_organization_event_idx
  on public.accreditation_categories (organization_id, event_id);

create index if not exists accreditation_enrollments_organization_event_idx
  on public.accreditation_enrollments (organization_id, event_id);

create index if not exists accreditation_enrollments_event_status_idx
  on public.accreditation_enrollments (event_id, status);

create index if not exists accreditation_enrollments_event_category_idx
  on public.accreditation_enrollments (event_id, category_id);

create index if not exists accreditation_enrollments_event_sector_idx
  on public.accreditation_enrollments (event_id, sector_id);

create or replace function public.current_sector_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    array_agg(distinct s.id order by s.id),
    '{}'::uuid[]
  )
  from public.sectors as s
  where s.deleted_at is null
    and s.venue_id = any(public.current_venue_ids());
$$;

create or replace function public.accreditation_category_belongs_to_scope(
  category_id uuid,
  category_organization_id uuid,
  category_event_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    category_id is not null
    and category_organization_id = any(public.current_organization_ids())
    and category_event_id = any(public.current_event_ids())
    and exists (
      select 1
      from public.accreditation_categories as c
      where c.id = category_id
        and c.deleted_at is null
        and c.organization_id = category_organization_id
        and c.event_id = category_event_id
        and c.organization_id = any(public.current_organization_ids())
        and c.event_id = any(public.current_event_ids())
    );
$$;

create or replace function public.accreditation_sector_belongs_to_event(
  enrollment_sector_id uuid,
  enrollment_event_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    enrollment_sector_id is null
    or exists (
      select 1
      from public.events as e
      join public.sectors as s
        on s.id = enrollment_sector_id
      where e.id = enrollment_event_id
        and e.deleted_at is null
        and s.deleted_at is null
        and e.organization_id = any(public.current_organization_ids())
        and e.id = any(public.current_event_ids())
        and e.venue_id is not null
        and s.venue_id = e.venue_id
        and s.id = any(public.current_sector_ids())
    );
$$;

create or replace function public.accreditation_enrollment_belongs_to_scope(
  enrollment_organization_id uuid,
  enrollment_event_id uuid,
  enrollment_category_id uuid,
  enrollment_sector_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    enrollment_organization_id = any(public.current_organization_ids())
    and enrollment_event_id = any(public.current_event_ids())
    and (
      enrollment_category_id is null
      or public.accreditation_category_belongs_to_scope(
        enrollment_category_id,
        enrollment_organization_id,
        enrollment_event_id
      )
    )
    and public.accreditation_sector_belongs_to_event(
      enrollment_sector_id,
      enrollment_event_id
    );
$$;

drop policy if exists "Tenant-scoped accreditation category select" on public.accreditation_categories;
drop policy if exists "Tenant-scoped accreditation category insert" on public.accreditation_categories;
drop policy if exists "Tenant-scoped accreditation category update" on public.accreditation_categories;
drop policy if exists "Tenant-scoped accreditation category delete" on public.accreditation_categories;

drop policy if exists "Tenant-scoped accreditation enrollment select" on public.accreditation_enrollments;
drop policy if exists "Tenant-scoped accreditation enrollment insert" on public.accreditation_enrollments;
drop policy if exists "Tenant-scoped accreditation enrollment update" on public.accreditation_enrollments;
drop policy if exists "Tenant-scoped accreditation enrollment delete" on public.accreditation_enrollments;

alter table public.accreditation_categories enable row level security;
alter table public.accreditation_enrollments enable row level security;

create trigger set_updated_at_accreditation_categories before update on public.accreditation_categories for each row execute function public.set_updated_at();
create trigger set_updated_at_accreditation_enrollments before update on public.accreditation_enrollments for each row execute function public.set_updated_at();

create policy "Tenant-scoped accreditation category select"
  on public.accreditation_categories
  for select
  to authenticated
  using (
    accreditation_categories.deleted_at is null
    and accreditation_categories.organization_id = any(public.current_organization_ids())
    and accreditation_categories.event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped accreditation category insert"
  on public.accreditation_categories
  for insert
  to authenticated
  with check (
    accreditation_categories.deleted_at is null
    and accreditation_categories.organization_id = any(public.current_organization_ids())
    and accreditation_categories.event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped accreditation category update"
  on public.accreditation_categories
  for update
  to authenticated
  using (
    accreditation_categories.deleted_at is null
    and accreditation_categories.organization_id = any(public.current_organization_ids())
    and accreditation_categories.event_id = any(public.current_event_ids())
  )
  with check (
    accreditation_categories.deleted_at is null
    and accreditation_categories.organization_id = any(public.current_organization_ids())
    and accreditation_categories.event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped accreditation category delete"
  on public.accreditation_categories
  for delete
  to authenticated
  using (
    accreditation_categories.organization_id = any(public.current_organization_ids())
    and accreditation_categories.event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped accreditation enrollment select"
  on public.accreditation_enrollments
  for select
  to authenticated
  using (
    accreditation_enrollments.deleted_at is null
    and public.accreditation_enrollment_belongs_to_scope(
      accreditation_enrollments.organization_id,
      accreditation_enrollments.event_id,
      accreditation_enrollments.category_id,
      accreditation_enrollments.sector_id
    )
  );

create policy "Tenant-scoped accreditation enrollment insert"
  on public.accreditation_enrollments
  for insert
  to authenticated
  with check (
    accreditation_enrollments.deleted_at is null
    and public.accreditation_enrollment_belongs_to_scope(
      accreditation_enrollments.organization_id,
      accreditation_enrollments.event_id,
      accreditation_enrollments.category_id,
      accreditation_enrollments.sector_id
    )
  );

create policy "Tenant-scoped accreditation enrollment update"
  on public.accreditation_enrollments
  for update
  to authenticated
  using (
    accreditation_enrollments.deleted_at is null
    and public.accreditation_enrollment_belongs_to_scope(
      accreditation_enrollments.organization_id,
      accreditation_enrollments.event_id,
      accreditation_enrollments.category_id,
      accreditation_enrollments.sector_id
    )
  )
  with check (
    accreditation_enrollments.deleted_at is null
    and public.accreditation_enrollment_belongs_to_scope(
      accreditation_enrollments.organization_id,
      accreditation_enrollments.event_id,
      accreditation_enrollments.category_id,
      accreditation_enrollments.sector_id
    )
  );

create policy "Tenant-scoped accreditation enrollment delete"
  on public.accreditation_enrollments
  for delete
  to authenticated
  using (
    public.accreditation_enrollment_belongs_to_scope(
      accreditation_enrollments.organization_id,
      accreditation_enrollments.event_id,
      accreditation_enrollments.category_id,
      accreditation_enrollments.sector_id
    )
  );
