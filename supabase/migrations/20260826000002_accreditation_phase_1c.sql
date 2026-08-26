create or replace function public.current_profile_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    array_agg(distinct p.id order by p.id),
    '{}'::uuid[]
  )
  from public.profiles as p
  join public.organizations as o
    on o.id = p.organization_id
  where p.user_id = public.current_app_user_id()
    and p.deleted_at is null
    and o.deleted_at is null
    and o.status = 'active';
$$;

create or replace function public.accreditation_checkin_operator_is_authorized(
  checkin_organization_id uuid,
  checkin_operator_profile_id uuid
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
    where p.id = checkin_operator_profile_id
      and p.user_id = public.current_app_user_id()
      and p.organization_id = checkin_organization_id
      and p.deleted_at is null
      and r.deleted_at is null
      and checkin_organization_id = any(public.current_organization_ids())
      and 'checkin.perform' = any(r.permissions)
  );
$$;

create table if not exists public.accreditation_checkins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  enrollment_id uuid not null references public.accreditation_enrollments(id) on delete cascade,
  access_grant_id uuid not null references public.accreditation_access_grants(id) on delete cascade,
  operator_profile_id uuid not null references public.profiles(id),
  source text not null,
  checked_in_at timestamptz not null default now(),
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accreditation_checkins_source_check check (source in ('qr', 'manual_code')),
  constraint accreditation_checkins_access_grant_unique unique (access_grant_id)
);

create index if not exists accreditation_checkins_organization_event_idx
  on public.accreditation_checkins (organization_id, event_id);

create index if not exists accreditation_checkins_event_checked_in_at_idx
  on public.accreditation_checkins (event_id, checked_in_at desc);

create index if not exists accreditation_checkins_enrollment_idx
  on public.accreditation_checkins (enrollment_id);

create index if not exists accreditation_checkins_operator_profile_idx
  on public.accreditation_checkins (operator_profile_id);

create or replace function public.accreditation_checkin_belongs_to_scope(
  checkin_organization_id uuid,
  checkin_event_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    checkin_organization_id = any(public.current_organization_ids())
    and checkin_event_id = any(public.current_event_ids());
$$;

create or replace function public.accreditation_checkin_can_be_recorded(
  checkin_organization_id uuid,
  checkin_event_id uuid,
  checkin_enrollment_id uuid,
  checkin_access_grant_id uuid,
  checkin_operator_profile_id uuid,
  checkin_source text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.accreditation_checkin_belongs_to_scope(checkin_organization_id, checkin_event_id)
    and public.accreditation_checkin_operator_is_authorized(
      checkin_organization_id,
      checkin_operator_profile_id
    )
    and checkin_source in ('qr', 'manual_code')
    and exists (
      select 1
      from public.accreditation_enrollments as enrollment
      where enrollment.id = checkin_enrollment_id
        and enrollment.deleted_at is null
        and enrollment.organization_id = checkin_organization_id
        and enrollment.event_id = checkin_event_id
        and enrollment.status = 'active'
    )
    and exists (
      select 1
      from public.accreditation_access_grants as grant_row
      where grant_row.id = checkin_access_grant_id
        and grant_row.organization_id = checkin_organization_id
        and grant_row.event_id = checkin_event_id
        and grant_row.enrollment_id = checkin_enrollment_id
        and grant_row.status = 'active'
    )
    and not exists (
      select 1
      from public.accreditation_checkins as existing
      where existing.access_grant_id = checkin_access_grant_id
    );
$$;

create or replace function public.accreditation_checkin_is_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'accreditation_checkins are append-only';
end;
$$;

drop policy if exists "Tenant-scoped accreditation checkin select" on public.accreditation_checkins;
drop policy if exists "Tenant-scoped accreditation checkin insert" on public.accreditation_checkins;
drop policy if exists "Tenant-scoped accreditation checkin update" on public.accreditation_checkins;
drop policy if exists "Tenant-scoped accreditation checkin delete" on public.accreditation_checkins;

drop trigger if exists enforce_accreditation_checkins_immutable on public.accreditation_checkins;

alter table public.accreditation_checkins enable row level security;

create trigger enforce_accreditation_checkins_immutable
before update or delete on public.accreditation_checkins
for each row
execute function public.accreditation_checkin_is_immutable();

create policy "Tenant-scoped accreditation checkin select"
  on public.accreditation_checkins
  for select
  to authenticated
  using (
    public.accreditation_checkin_belongs_to_scope(
      accreditation_checkins.organization_id,
      accreditation_checkins.event_id
    )
  );

create policy "Tenant-scoped accreditation checkin insert"
  on public.accreditation_checkins
  for insert
  to authenticated
  with check (
    public.accreditation_checkin_can_be_recorded(
      accreditation_checkins.organization_id,
      accreditation_checkins.event_id,
      accreditation_checkins.enrollment_id,
      accreditation_checkins.access_grant_id,
      accreditation_checkins.operator_profile_id,
      accreditation_checkins.source
    )
  );

comment on function public.current_profile_ids() is 'Resolves active profile ids for the current public user via SECURITY DEFINER access.';
comment on function public.accreditation_checkin_operator_is_authorized(uuid, uuid) is 'Requires the current user to submit one of their active operator profiles in the target organization and that role to include checkin.perform.';
comment on function public.accreditation_checkin_belongs_to_scope(uuid, uuid) is 'Limits accreditation check-in reads to the active organization and event scope of the current user.';
comment on function public.accreditation_checkin_can_be_recorded(uuid, uuid, uuid, uuid, uuid, text) is 'Fails closed unless the check-in references active accreditation enrollment, access grant, operator profile authorization, and scope.';
comment on function public.accreditation_checkin_is_immutable() is 'Prevents update and delete mutations on accreditation check-ins.';
