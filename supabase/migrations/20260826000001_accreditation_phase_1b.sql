create table if not exists public.accreditation_access_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  enrollment_id uuid not null references public.accreditation_enrollments(id) on delete cascade,
  access_code text not null,
  qr_token text not null,
  status text not null default 'active',
  issued_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb,
  constraint accreditation_access_grants_status_check check (status in ('active', 'revoked')),
  constraint accreditation_access_grants_organization_event_enrollment_unique unique (organization_id, event_id, enrollment_id),
  constraint accreditation_access_grants_organization_event_access_code_unique unique (organization_id, event_id, access_code),
  constraint accreditation_access_grants_qr_token_unique unique (qr_token)
);

create index if not exists accreditation_access_grants_organization_event_idx
  on public.accreditation_access_grants (organization_id, event_id);

create index if not exists accreditation_access_grants_organization_event_status_idx
  on public.accreditation_access_grants (organization_id, event_id, status);

create or replace function public.accreditation_access_grant_identity_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.organization_id is distinct from new.organization_id
    or old.event_id is distinct from new.event_id
    or old.enrollment_id is distinct from new.enrollment_id then
    raise exception 'accreditation_access_grants identity columns are immutable';
  end if;

  return new;
end;
$$;

create or replace function public.accreditation_access_grant_belongs_to_scope(
  access_organization_id uuid,
  access_event_id uuid,
  access_enrollment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    access_organization_id = any(public.current_organization_ids())
    and access_event_id = any(public.current_event_ids())
    and exists (
      select 1
      from public.accreditation_enrollments as e
      where e.id = access_enrollment_id
        and e.deleted_at is null
        and e.organization_id = access_organization_id
        and e.event_id = access_event_id
        and e.organization_id = any(public.current_organization_ids())
        and e.event_id = any(public.current_event_ids())
    );
$$;

create or replace function public.accreditation_access_grant_can_be_issued(
  access_organization_id uuid,
  access_event_id uuid,
  access_enrollment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.accreditation_access_grant_belongs_to_scope(
      access_organization_id,
      access_event_id,
      access_enrollment_id
    )
    and exists (
      select 1
      from public.accreditation_enrollments as e
      where e.id = access_enrollment_id
        and e.status = 'active'
    );
$$;

drop policy if exists "Tenant-scoped accreditation access grant select" on public.accreditation_access_grants;
drop policy if exists "Tenant-scoped accreditation access grant insert" on public.accreditation_access_grants;
drop policy if exists "Tenant-scoped accreditation access grant update" on public.accreditation_access_grants;
drop policy if exists "Tenant-scoped accreditation access grant delete" on public.accreditation_access_grants;

alter table public.accreditation_access_grants enable row level security;

create trigger enforce_accreditation_access_grant_identity_immutable before update on public.accreditation_access_grants for each row execute function public.accreditation_access_grant_identity_immutable();
create trigger set_updated_at_accreditation_access_grants before update on public.accreditation_access_grants for each row execute function public.set_updated_at();

create policy "Tenant-scoped accreditation access grant select"
  on public.accreditation_access_grants
  for select
  to authenticated
  using (
    public.accreditation_access_grant_belongs_to_scope(
      accreditation_access_grants.organization_id,
      accreditation_access_grants.event_id,
      accreditation_access_grants.enrollment_id
    )
  );

create policy "Tenant-scoped accreditation access grant insert"
  on public.accreditation_access_grants
  for insert
  to authenticated
  with check (
    accreditation_access_grants.status = 'active'
    and public.accreditation_access_grant_can_be_issued(
      accreditation_access_grants.organization_id,
      accreditation_access_grants.event_id,
      accreditation_access_grants.enrollment_id
    )
  );

create policy "Tenant-scoped accreditation access grant update"
  on public.accreditation_access_grants
  for update
  to authenticated
  using (
    public.accreditation_access_grant_belongs_to_scope(
      accreditation_access_grants.organization_id,
      accreditation_access_grants.event_id,
      accreditation_access_grants.enrollment_id
    )
  )
  with check (
    public.accreditation_access_grant_belongs_to_scope(
      accreditation_access_grants.organization_id,
      accreditation_access_grants.event_id,
      accreditation_access_grants.enrollment_id
    )
  );
