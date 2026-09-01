create table if not exists public.accreditation_access_checkpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  sector_id uuid not null references public.accreditation_access_sectors(id) on delete restrict,
  name text not null,
  code text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint accreditation_access_checkpoints_name_check check (length(trim(name)) > 0)
);

create unique index if not exists accreditation_access_checkpoints_event_code_unique
  on public.accreditation_access_checkpoints (organization_id, event_id, code)
  where code is not null and deleted_at is null;
create index if not exists accreditation_access_checkpoints_event_idx
  on public.accreditation_access_checkpoints (organization_id, event_id, status);

alter table public.accreditation_sector_access_attempts
  add column if not exists checkpoint_id uuid references public.accreditation_access_checkpoints(id) on delete restrict;
alter table public.accreditation_sector_movements
  add column if not exists checkpoint_id uuid references public.accreditation_access_checkpoints(id) on delete restrict;

alter table public.accreditation_sector_access_attempts
  drop constraint if exists accreditation_sector_access_attempts_denial_check;
alter table public.accreditation_sector_access_attempts
  add constraint accreditation_sector_access_attempts_denial_check check (
    (decision = 'allow' and denial_reason is null)
    or (decision = 'deny' and denial_reason in (
      'grant_not_found', 'wrong_scope', 'grant_revoked', 'enrollment_cancelled',
      'sector_not_found', 'sector_inactive', 'no_sector_entitlement',
      'entitlement_revoked', 'checkpoint_inactive'
    ))
  );

create index if not exists accreditation_sector_access_attempts_checkpoint_idx
  on public.accreditation_sector_access_attempts (checkpoint_id);
create index if not exists accreditation_sector_movements_checkpoint_idx
  on public.accreditation_sector_movements (checkpoint_id);

create or replace function public.accreditation_access_checkpoint_is_immutable()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.organization_id <> old.organization_id or new.event_id <> old.event_id or new.sector_id <> old.sector_id then
    raise exception 'accreditation_access_checkpoint identity is immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists enforce_accreditation_access_checkpoint_identity on public.accreditation_access_checkpoints;
create trigger enforce_accreditation_access_checkpoint_identity
before update on public.accreditation_access_checkpoints
for each row execute function public.accreditation_access_checkpoint_is_immutable();

create or replace function public.accreditation_access_checkpoint_scope_is_valid(
  checkpoint_organization_id uuid,
  checkpoint_event_id uuid,
  checkpoint_id uuid,
  target_sector_id uuid
)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.accreditation_access_checkpoints c
    join public.accreditation_access_sectors s on s.id = c.sector_id
    where c.id = checkpoint_id
      and c.organization_id = checkpoint_organization_id
      and c.event_id = checkpoint_event_id
      and c.sector_id = target_sector_id
      and s.organization_id = checkpoint_organization_id
      and s.event_id = checkpoint_event_id
  );
$$;

alter table public.accreditation_access_checkpoints enable row level security;
drop policy if exists "Tenant-scoped accreditation access checkpoint select" on public.accreditation_access_checkpoints;
drop policy if exists "Tenant-scoped accreditation access checkpoint insert" on public.accreditation_access_checkpoints;
drop policy if exists "Tenant-scoped accreditation access checkpoint update" on public.accreditation_access_checkpoints;
create policy "Tenant-scoped accreditation access checkpoint select"
  on public.accreditation_access_checkpoints for select to authenticated
  using (organization_id = any(public.current_organization_ids()) and event_id = any(public.current_event_ids()));
create policy "Tenant-scoped accreditation access checkpoint insert"
  on public.accreditation_access_checkpoints for insert to authenticated
  with check (
    organization_id = any(public.current_organization_ids())
    and event_id = any(public.current_event_ids())
    and exists (
      select 1 from public.profiles p join public.roles r on r.id = p.role_id
      where p.user_id = public.current_app_user_id()
        and p.organization_id = organization_id and p.deleted_at is null and r.deleted_at is null
        and ('event.edit' = any(r.permissions) or 'settings.manage' = any(r.permissions))
    )
  );
create policy "Tenant-scoped accreditation access checkpoint update"
  on public.accreditation_access_checkpoints for update to authenticated
  using (
    organization_id = any(public.current_organization_ids())
    and event_id = any(public.current_event_ids())
    and exists (
      select 1 from public.profiles p join public.roles r on r.id = p.role_id
      where p.user_id = public.current_app_user_id() and p.organization_id = organization_id
        and p.deleted_at is null and r.deleted_at is null
        and ('event.edit' = any(r.permissions) or 'settings.manage' = any(r.permissions))
    )
  )
  with check (organization_id = any(public.current_organization_ids()) and event_id = any(public.current_event_ids()));

create or replace function public.accreditation_sector_record_movement_at_checkpoint(
  movement_organization_id uuid,
  movement_event_id uuid,
  movement_checkpoint_id uuid,
  movement_access_grant_id uuid,
  movement_enrollment_id uuid,
  movement_operator_profile_id uuid,
  movement_type text,
  movement_source text,
  movement_credential_reference text
)
returns table(status text, inside boolean, movement_id uuid, attempt_id uuid, denial_reason text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  checkpoint_sector_id uuid;
  checkpoint_sector_reference text;
  latest_movement text;
  resolved_denial text;
  new_attempt_id uuid;
  new_movement_id uuid;
  current_inside boolean := false;
begin
  if movement_type not in ('entry', 'exit') or movement_source not in ('qr', 'manual_code', 'manual_operator') then
    raise exception 'Invalid accreditation sector movement request';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', movement_organization_id, movement_event_id, movement_access_grant_id, movement_checkpoint_id), 0));

  if not (auth.role() = 'service_role' or public.accreditation_sector_access_attempt_operator_is_authorized(
    movement_organization_id, movement_event_id, movement_operator_profile_id
  )) then
    raise exception 'Accreditation sector movement operator is not authorized';
  end if;

  select c.sector_id, coalesce(c.code, c.name)
    into checkpoint_sector_id, checkpoint_sector_reference
  from public.accreditation_access_checkpoints c
  where c.id = movement_checkpoint_id
    and c.organization_id = movement_organization_id
    and c.event_id = movement_event_id
    and c.deleted_at is null
    and c.status = 'active';

  if checkpoint_sector_id is null then
    return query select 'denied'::text, false, null::uuid, null::uuid, 'checkpoint_inactive'::text;
    return;
  end if;

  select m.movement into latest_movement
  from public.accreditation_sector_movements m
  where m.organization_id = movement_organization_id
    and m.event_id = movement_event_id
    and m.access_grant_id = movement_access_grant_id
    and m.sector_id = checkpoint_sector_id
  order by m.moved_at desc, m.created_at desc, m.id desc limit 1;
  current_inside := coalesce(latest_movement = 'entry', false);

  if movement_type = 'exit' then
    if movement_access_grant_id is null or movement_enrollment_id is null then
      return query select 'denied'::text, false, null::uuid, null::uuid, 'grant_not_found'::text;
      return;
    end if;
    if not current_inside then
      return query select 'already_outside'::text, false, null::uuid, null::uuid, null::text;
      return;
    end if;
    insert into public.accreditation_sector_movements (organization_id, event_id, access_grant_id, enrollment_id, sector_id, checkpoint_id, operator_profile_id, movement, source, credential_reference, sector_reference)
      values (movement_organization_id, movement_event_id, movement_access_grant_id, movement_enrollment_id, checkpoint_sector_id, movement_checkpoint_id, movement_operator_profile_id, movement_type, movement_source, movement_credential_reference, checkpoint_sector_reference)
      returning id into new_movement_id;
    return query select 'recorded'::text, false, new_movement_id, null::uuid, null::text;
    return;
  end if;

  if movement_access_grant_id is null then
    resolved_denial := 'grant_not_found';
  elsif not exists (select 1 from public.accreditation_access_grants g where g.id = movement_access_grant_id and g.organization_id = movement_organization_id and g.event_id = movement_event_id and g.status = 'active') then
    resolved_denial := 'grant_revoked';
  elsif movement_enrollment_id is null or not exists (select 1 from public.accreditation_enrollments e where e.id = movement_enrollment_id and e.organization_id = movement_organization_id and e.event_id = movement_event_id and e.status = 'active' and e.deleted_at is null) then
    resolved_denial := 'enrollment_cancelled';
  elsif not exists (select 1 from public.accreditation_access_sectors s where s.id = checkpoint_sector_id and s.organization_id = movement_organization_id and s.event_id = movement_event_id and s.status = 'active' and s.deleted_at is null) then
    resolved_denial := 'sector_inactive';
  elsif not exists (select 1 from public.accreditation_access_entitlements a where a.organization_id = movement_organization_id and a.event_id = movement_event_id and a.access_grant_id = movement_access_grant_id and a.sector_id = checkpoint_sector_id and a.status = 'active') then
    resolved_denial := 'no_sector_entitlement';
  end if;

  if resolved_denial is not null then
    insert into public.accreditation_sector_access_attempts (organization_id, event_id, access_grant_id, enrollment_id, sector_id, checkpoint_id, operator_profile_id, source, credential_reference, sector_reference, decision, denial_reason)
      values (movement_organization_id, movement_event_id, movement_access_grant_id, movement_enrollment_id, checkpoint_sector_id, movement_checkpoint_id, movement_operator_profile_id, movement_source, movement_credential_reference, checkpoint_sector_reference, 'deny', resolved_denial)
      returning id into new_attempt_id;
    return query select 'denied'::text, current_inside, null::uuid, new_attempt_id, resolved_denial;
    return;
  end if;

  insert into public.accreditation_sector_access_attempts (organization_id, event_id, access_grant_id, enrollment_id, sector_id, checkpoint_id, operator_profile_id, source, credential_reference, sector_reference, decision)
    values (movement_organization_id, movement_event_id, movement_access_grant_id, movement_enrollment_id, checkpoint_sector_id, movement_checkpoint_id, movement_operator_profile_id, movement_source, movement_credential_reference, checkpoint_sector_reference, 'allow')
    returning id into new_attempt_id;
  if current_inside then
    return query select 'already_inside'::text, true, null::uuid, new_attempt_id, null::text;
    return;
  end if;
  insert into public.accreditation_sector_movements (organization_id, event_id, access_grant_id, enrollment_id, sector_id, checkpoint_id, operator_profile_id, movement, source, evaluation_attempt_id, credential_reference, sector_reference)
    values (movement_organization_id, movement_event_id, movement_access_grant_id, movement_enrollment_id, checkpoint_sector_id, movement_checkpoint_id, movement_operator_profile_id, movement_type, movement_source, new_attempt_id, movement_credential_reference, checkpoint_sector_reference)
    returning id into new_movement_id;
  return query select 'recorded'::text, true, new_movement_id, new_attempt_id, null::text;
end;
$$;

revoke all on function public.accreditation_sector_record_movement_at_checkpoint(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text) from public;
grant execute on function public.accreditation_sector_record_movement_at_checkpoint(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text) to authenticated, service_role;

comment on table public.accreditation_access_checkpoints is 'Operational access points mapped to one event sector; checkpoints are not entitlement records.';
comment on function public.accreditation_sector_record_movement_at_checkpoint(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text) is 'Resolves an active checkpoint target and atomically evaluates and records sector movement.';
