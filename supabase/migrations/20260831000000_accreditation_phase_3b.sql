create or replace function public.accreditation_sector_access_attempt_operator_is_authorized(
  attempt_organization_id uuid,
  attempt_event_id uuid,
  attempt_operator_profile_id uuid
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
    where p.id = attempt_operator_profile_id
      and p.user_id = public.current_app_user_id()
      and p.organization_id = attempt_organization_id
      and p.deleted_at is null
      and r.deleted_at is null
      and attempt_organization_id = any(public.current_organization_ids())
      and attempt_event_id = any(public.current_event_ids())
      and 'checkin.perform' = any(r.permissions)
  );
$$;

create table if not exists public.accreditation_sector_access_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  access_grant_id uuid references public.accreditation_access_grants(id) on delete restrict,
  enrollment_id uuid references public.accreditation_enrollments(id) on delete restrict,
  sector_id uuid references public.accreditation_access_sectors(id) on delete restrict,
  operator_profile_id uuid not null references public.profiles(id) on delete restrict,
  source text not null,
  credential_reference text not null,
  sector_reference text not null,
  decision text not null,
  denial_reason text,
  evaluated_at timestamptz not null default now(),
  metadata jsonb,
  created_at timestamptz not null default now(),
  constraint accreditation_sector_access_attempts_source_check check (source in ('qr', 'manual_code', 'manual_operator')),
  constraint accreditation_sector_access_attempts_decision_check check (decision in ('allow', 'deny')),
  constraint accreditation_sector_access_attempts_denial_check check (
    (decision = 'allow' and denial_reason is null)
    or (decision = 'deny' and denial_reason in (
      'grant_not_found',
      'wrong_scope',
      'grant_revoked',
      'enrollment_cancelled',
      'sector_not_found',
      'sector_inactive',
      'no_sector_entitlement',
      'entitlement_revoked'
    ))
  )
);

create or replace function public.accreditation_sector_access_attempt_can_be_recorded(
  attempt_organization_id uuid,
  attempt_event_id uuid,
  attempt_operator_profile_id uuid,
  attempt_source text,
  attempt_decision text,
  attempt_denial_reason text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.accreditation_sector_access_attempt_operator_is_authorized(
      attempt_organization_id,
      attempt_event_id,
      attempt_operator_profile_id
    )
    and attempt_source in ('qr', 'manual_code', 'manual_operator')
    and attempt_decision in ('allow', 'deny')
    and (
      (attempt_decision = 'allow' and attempt_denial_reason is null)
      or (attempt_decision = 'deny' and attempt_denial_reason is not null)
    );
$$;

create or replace function public.accreditation_sector_access_attempt_is_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'accreditation_sector_access_attempts are append-only';
end;
$$;

create index if not exists accreditation_sector_access_attempts_organization_event_idx
  on public.accreditation_sector_access_attempts (organization_id, event_id);

create index if not exists accreditation_sector_access_attempts_event_evaluated_at_idx
  on public.accreditation_sector_access_attempts (event_id, evaluated_at desc);

create index if not exists accreditation_sector_access_attempts_access_grant_idx
  on public.accreditation_sector_access_attempts (access_grant_id);

create index if not exists accreditation_sector_access_attempts_sector_idx
  on public.accreditation_sector_access_attempts (sector_id);

create index if not exists accreditation_sector_access_attempts_operator_idx
  on public.accreditation_sector_access_attempts (operator_profile_id);

drop trigger if exists enforce_accreditation_sector_access_attempts_immutable on public.accreditation_sector_access_attempts;
create trigger enforce_accreditation_sector_access_attempts_immutable
before update or delete on public.accreditation_sector_access_attempts
for each row
execute function public.accreditation_sector_access_attempt_is_immutable();

alter table public.accreditation_sector_access_attempts enable row level security;

drop policy if exists "Tenant-scoped accreditation sector access attempt select" on public.accreditation_sector_access_attempts;
drop policy if exists "Tenant-scoped accreditation sector access attempt insert" on public.accreditation_sector_access_attempts;
drop policy if exists "Tenant-scoped accreditation sector access attempt update" on public.accreditation_sector_access_attempts;
drop policy if exists "Tenant-scoped accreditation sector access attempt delete" on public.accreditation_sector_access_attempts;

create policy "Tenant-scoped accreditation sector access attempt select"
  on public.accreditation_sector_access_attempts
  for select
  to authenticated
  using (
    organization_id = any(public.current_organization_ids())
    and event_id = any(public.current_event_ids())
  );

create policy "Tenant-scoped accreditation sector access attempt insert"
  on public.accreditation_sector_access_attempts
  for insert
  to authenticated
  with check (
    public.accreditation_sector_access_attempt_can_be_recorded(
      organization_id,
      event_id,
      operator_profile_id,
      source,
      decision,
      denial_reason
    )
  );

comment on function public.accreditation_sector_access_attempt_operator_is_authorized(uuid, uuid, uuid) is 'Requires the current user to submit their active operator profile in the target organization and event with checkin.perform.';
comment on function public.accreditation_sector_access_attempt_can_be_recorded(uuid, uuid, uuid, text, text, text) is 'Allows only authenticated, scoped, checkin.perform operators to append valid allow or deny sector evaluations.';
comment on function public.accreditation_sector_access_attempt_is_immutable() is 'Prevents updates and deletes on the historical sector access evaluation ledger.';
