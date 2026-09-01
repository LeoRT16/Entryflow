create table if not exists public.accreditation_sector_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  access_grant_id uuid not null references public.accreditation_access_grants(id) on delete restrict,
  enrollment_id uuid not null references public.accreditation_enrollments(id) on delete restrict,
  sector_id uuid not null references public.accreditation_access_sectors(id) on delete restrict,
  operator_profile_id uuid not null references public.profiles(id) on delete restrict,
  movement text not null check (movement in ('entry', 'exit')),
  source text not null check (source in ('qr', 'manual_code', 'manual_operator')),
  evaluation_attempt_id uuid references public.accreditation_sector_access_attempts(id) on delete restrict,
  credential_reference text not null,
  sector_reference text not null,
  moved_at timestamptz not null default now(),
  metadata jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.accreditation_sector_movement_is_immutable()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'accreditation_sector_movements are append-only';
end;
$$;

create or replace function public.accreditation_sector_record_movement(
  movement_organization_id uuid,
  movement_event_id uuid,
  movement_access_grant_id uuid,
  movement_enrollment_id uuid,
  movement_sector_id uuid,
  movement_operator_profile_id uuid,
  movement_type text,
  movement_source text,
  movement_credential_reference text,
  movement_sector_reference text
)
returns table(status text, inside boolean, movement_id uuid, attempt_id uuid, denial_reason text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  latest_movement text;
  resolved_denial text;
  new_attempt_id uuid;
  new_movement_id uuid;
  current_inside boolean := false;
  operator_allowed boolean;
begin
  if movement_type not in ('entry', 'exit') or movement_source not in ('qr', 'manual_code', 'manual_operator') then
    raise exception 'Invalid accreditation sector movement request';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', movement_organization_id, movement_event_id, movement_access_grant_id, movement_sector_id), 0));

  operator_allowed := auth.role() = 'service_role'
    or public.accreditation_sector_access_attempt_operator_is_authorized(
      movement_organization_id, movement_event_id, movement_operator_profile_id
    );
  if not operator_allowed then
    raise exception 'Accreditation sector movement operator is not authorized';
  end if;

  select m.movement into latest_movement
  from public.accreditation_sector_movements as m
  where m.organization_id = movement_organization_id
    and m.event_id = movement_event_id
    and m.access_grant_id = movement_access_grant_id
    and m.sector_id = movement_sector_id
  order by m.moved_at desc, m.created_at desc, m.id desc
  limit 1;
  current_inside := coalesce(latest_movement = 'entry', false);

  if movement_type = 'exit' then
    if movement_access_grant_id is null or movement_enrollment_id is null or movement_sector_id is null then
      return query select 'denied'::text, false, null::uuid, null::uuid, 'grant_not_found'::text;
      return;
    end if;
    if not current_inside then
      return query select 'already_outside'::text, false, null::uuid, null::uuid, null::text;
      return;
    end if;

    insert into public.accreditation_sector_movements (
      organization_id, event_id, access_grant_id, enrollment_id, sector_id,
      operator_profile_id, movement, source, credential_reference, sector_reference
    ) values (
      movement_organization_id, movement_event_id, movement_access_grant_id, movement_enrollment_id, movement_sector_id,
      movement_operator_profile_id, movement_type, movement_source, movement_credential_reference, movement_sector_reference
    ) returning id into new_movement_id;
    return query select 'recorded'::text, false, new_movement_id, null::uuid, null::text;
    return;
  end if;

  if movement_access_grant_id is null then
    resolved_denial := 'grant_not_found';
  elsif not exists (
    select 1 from public.accreditation_access_grants g
    where g.id = movement_access_grant_id
      and g.organization_id = movement_organization_id
      and g.event_id = movement_event_id
      and g.status = 'active'
  ) then
    resolved_denial := 'grant_revoked';
  elsif movement_enrollment_id is null or not exists (
    select 1 from public.accreditation_enrollments e
    where e.id = movement_enrollment_id
      and e.organization_id = movement_organization_id
      and e.event_id = movement_event_id
      and e.status = 'active'
      and e.deleted_at is null
  ) then
    resolved_denial := 'enrollment_cancelled';
  elsif movement_sector_id is null then
    resolved_denial := 'sector_not_found';
  elsif not exists (
    select 1 from public.accreditation_access_sectors s
    where s.id = movement_sector_id
      and s.organization_id = movement_organization_id
      and s.event_id = movement_event_id
      and s.status = 'active'
      and s.deleted_at is null
  ) then
    resolved_denial := 'sector_inactive';
  elsif not exists (
    select 1 from public.accreditation_access_entitlements a
    where a.organization_id = movement_organization_id
      and a.event_id = movement_event_id
      and a.access_grant_id = movement_access_grant_id
      and a.sector_id = movement_sector_id
      and a.status = 'active'
  ) then
    resolved_denial := 'no_sector_entitlement';
  end if;

  if resolved_denial is not null then
    insert into public.accreditation_sector_access_attempts (
      organization_id, event_id, access_grant_id, enrollment_id, sector_id,
      operator_profile_id, source, credential_reference, sector_reference,
      decision, denial_reason
    ) values (
      movement_organization_id, movement_event_id, movement_access_grant_id, movement_enrollment_id, movement_sector_id,
      movement_operator_profile_id, movement_source, movement_credential_reference, movement_sector_reference,
      'deny', resolved_denial
    ) returning id into new_attempt_id;
    return query select 'denied'::text, current_inside, null::uuid, new_attempt_id, resolved_denial;
    return;
  end if;

  insert into public.accreditation_sector_access_attempts (
    organization_id, event_id, access_grant_id, enrollment_id, sector_id,
    operator_profile_id, source, credential_reference, sector_reference, decision
  ) values (
    movement_organization_id, movement_event_id, movement_access_grant_id, movement_enrollment_id, movement_sector_id,
    movement_operator_profile_id, movement_source, movement_credential_reference, movement_sector_reference, 'allow'
  ) returning id into new_attempt_id;

  if current_inside then
    return query select 'already_inside'::text, true, null::uuid, new_attempt_id, null::text;
    return;
  end if;

  insert into public.accreditation_sector_movements (
    organization_id, event_id, access_grant_id, enrollment_id, sector_id,
    operator_profile_id, movement, source, evaluation_attempt_id, credential_reference, sector_reference
  ) values (
    movement_organization_id, movement_event_id, movement_access_grant_id, movement_enrollment_id, movement_sector_id,
    movement_operator_profile_id, movement_type, movement_source, new_attempt_id, movement_credential_reference, movement_sector_reference
  ) returning id into new_movement_id;
  return query select 'recorded'::text, true, new_movement_id, new_attempt_id, null::text;
end;
$$;

revoke all on function public.accreditation_sector_record_movement(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text) from public;
grant execute on function public.accreditation_sector_record_movement(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text) to authenticated, service_role;

create index if not exists accreditation_sector_movements_organization_event_moved_at_idx on public.accreditation_sector_movements (organization_id, event_id, moved_at desc);
create index if not exists accreditation_sector_movements_presence_idx on public.accreditation_sector_movements (event_id, access_grant_id, sector_id, moved_at desc);
create index if not exists accreditation_sector_movements_sector_idx on public.accreditation_sector_movements (event_id, sector_id, moved_at desc);
create index if not exists accreditation_sector_movements_operator_idx on public.accreditation_sector_movements (operator_profile_id);

drop trigger if exists enforce_accreditation_sector_movements_immutable on public.accreditation_sector_movements;
create trigger enforce_accreditation_sector_movements_immutable
before update or delete on public.accreditation_sector_movements
for each row execute function public.accreditation_sector_movement_is_immutable();

alter table public.accreditation_sector_movements enable row level security;
drop policy if exists "Tenant-scoped accreditation sector movement select" on public.accreditation_sector_movements;
create policy "Tenant-scoped accreditation sector movement select"
  on public.accreditation_sector_movements for select to authenticated
  using (organization_id = any(public.current_organization_ids()) and event_id = any(public.current_event_ids()));

comment on table public.accreditation_sector_movements is 'Append-only sector entry and exit ledger; current presence is derived from the latest movement.';
comment on function public.accreditation_sector_record_movement(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text) is 'Atomically rechecks Phase 3A entry access and records sector movement under a transaction advisory lock.';
