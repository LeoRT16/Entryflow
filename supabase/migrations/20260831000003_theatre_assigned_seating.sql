create table if not exists public.accreditation_theatre_seats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  venue_id uuid not null references public.venues(id) on delete restrict,
  section text not null default '',
  row_label text not null,
  seat_label text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint accreditation_theatre_seats_row_check check (length(trim(row_label)) > 0),
  constraint accreditation_theatre_seats_label_check check (length(trim(seat_label)) > 0)
);

create unique index if not exists accreditation_theatre_seats_identity_unique
  on public.accreditation_theatre_seats (organization_id, event_id, section, row_label, seat_label)
  where deleted_at is null;
create index if not exists accreditation_theatre_seats_event_idx
  on public.accreditation_theatre_seats (organization_id, event_id, status, section, row_label);

create table if not exists public.accreditation_theatre_seat_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  seat_id uuid not null references public.accreditation_theatre_seats(id) on delete restrict,
  enrollment_id uuid not null references public.accreditation_enrollments(id) on delete restrict,
  access_grant_id uuid references public.accreditation_access_grants(id) on delete restrict,
  assigned_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists accreditation_theatre_seat_assignments_active_seat_unique
  on public.accreditation_theatre_seat_assignments (organization_id, event_id, seat_id)
  where released_at is null;
create unique index if not exists accreditation_theatre_seat_assignments_active_enrollment_unique
  on public.accreditation_theatre_seat_assignments (organization_id, event_id, enrollment_id)
  where released_at is null;
create index if not exists accreditation_theatre_seat_assignments_event_idx
  on public.accreditation_theatre_seat_assignments (organization_id, event_id, assigned_at desc);

create or replace function public.accreditation_theatre_seat_scope_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  seat_event_id uuid;
  seat_organization_id uuid;
  enrollment_event_id uuid;
  enrollment_organization_id uuid;
  grant_event_id uuid;
  grant_organization_id uuid;
  grant_enrollment_id uuid;
begin
  select event_id, organization_id into seat_event_id, seat_organization_id
  from public.accreditation_theatre_seats where id = new.seat_id;
  select event_id, organization_id into enrollment_event_id, enrollment_organization_id
  from public.accreditation_enrollments where id = new.enrollment_id;

  if seat_event_id is null or seat_organization_id is null
     or seat_event_id <> new.event_id or seat_organization_id <> new.organization_id then
    raise exception 'Theatre seat is outside the assignment scope';
  end if;
  if enrollment_event_id is null or enrollment_organization_id is null
     or enrollment_event_id <> new.event_id or enrollment_organization_id <> new.organization_id then
    raise exception 'Theatre enrollment is outside the assignment scope';
  end if;

  if new.access_grant_id is not null then
    select event_id, organization_id, enrollment_id into grant_event_id, grant_organization_id, grant_enrollment_id
    from public.accreditation_access_grants where id = new.access_grant_id;
    if grant_event_id is null or grant_organization_id is null
       or grant_event_id <> new.event_id or grant_organization_id <> new.organization_id
       or grant_enrollment_id <> new.enrollment_id then
      raise exception 'Theatre access grant is outside the assignment scope';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_accreditation_theatre_seat_assignment_scope on public.accreditation_theatre_seat_assignments;
create trigger enforce_accreditation_theatre_seat_assignment_scope
before insert or update on public.accreditation_theatre_seat_assignments
for each row execute function public.accreditation_theatre_seat_scope_guard();

create or replace function public.accreditation_theatre_seat_is_in_event(
  target_seat_id uuid,
  target_organization_id uuid,
  target_event_id uuid
)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.accreditation_theatre_seats s
    join public.events e on e.id = s.event_id
    where s.id = target_seat_id
      and s.organization_id = target_organization_id
      and s.event_id = target_event_id
      and s.venue_id = e.venue_id
  );
$$;

alter table public.accreditation_theatre_seats enable row level security;
alter table public.accreditation_theatre_seat_assignments enable row level security;
drop policy if exists "Tenant-scoped theatre seats select" on public.accreditation_theatre_seats;
drop policy if exists "Tenant-scoped theatre seats insert" on public.accreditation_theatre_seats;
drop policy if exists "Tenant-scoped theatre seats update" on public.accreditation_theatre_seats;
create policy "Tenant-scoped theatre seats select"
  on public.accreditation_theatre_seats for select to authenticated
  using (organization_id = any(public.current_organization_ids()) and event_id = any(public.current_event_ids()));
create policy "Tenant-scoped theatre seats insert"
  on public.accreditation_theatre_seats for insert to authenticated
  with check (
    organization_id = any(public.current_organization_ids())
    and event_id = any(public.current_event_ids())
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.organization_id = organization_id and e.venue_id = venue_id
    )
    and exists (
      select 1 from public.profiles p join public.roles r on r.id = p.role_id
      where p.user_id = public.current_app_user_id() and p.organization_id = organization_id
        and p.deleted_at is null and r.deleted_at is null
        and ('event.edit' = any(r.permissions) or 'settings.manage' = any(r.permissions))
    )
  );
create policy "Tenant-scoped theatre seats update"
  on public.accreditation_theatre_seats for update to authenticated
  using (
    organization_id = any(public.current_organization_ids()) and event_id = any(public.current_event_ids())
    and exists (
      select 1 from public.profiles p join public.roles r on r.id = p.role_id
      where p.user_id = public.current_app_user_id() and p.organization_id = organization_id
        and p.deleted_at is null and r.deleted_at is null
        and ('event.edit' = any(r.permissions) or 'settings.manage' = any(r.permissions))
    )
  )
  with check (organization_id = any(public.current_organization_ids()) and event_id = any(public.current_event_ids()));
drop policy if exists "Tenant-scoped theatre seat assignments select" on public.accreditation_theatre_seat_assignments;
create policy "Tenant-scoped theatre seat assignments select"
  on public.accreditation_theatre_seat_assignments for select to authenticated
  using (organization_id = any(public.current_organization_ids()) and event_id = any(public.current_event_ids()));

create or replace function public.accreditation_theatre_assign_seat(
  assignment_organization_id uuid,
  assignment_event_id uuid,
  assignment_seat_id uuid,
  assignment_enrollment_id uuid,
  assignment_access_grant_id uuid,
  assignment_operator_profile_id uuid
)
returns table(status text, assignment_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  seat_status text;
  seat_event_id uuid;
  seat_organization_id uuid;
  enrollment_status text;
  existing_assignment_id uuid;
  new_assignment_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', assignment_organization_id, assignment_event_id, assignment_seat_id), 0));

  if not exists (select 1 from public.events where id = assignment_event_id and organization_id = assignment_organization_id and event_type = 'theatre') then
    return query select 'unsupported_event_type'::text, null::uuid;
    return;
  end if;

  if not (auth.role() = 'service_role' or exists (
    select 1 from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = assignment_operator_profile_id
      and p.user_id = public.current_app_user_id()
      and p.organization_id = assignment_organization_id
      and p.deleted_at is null and r.deleted_at is null
      and ('event.edit' = any(r.permissions) or 'settings.manage' = any(r.permissions))
  )) then
    raise exception 'Theatre seat assignment operator is not authorized';
  end if;

  select status, event_id, organization_id into seat_status, seat_event_id, seat_organization_id
  from public.accreditation_theatre_seats where id = assignment_seat_id and deleted_at is null for update;
  if seat_status is null or seat_event_id <> assignment_event_id or seat_organization_id <> assignment_organization_id or seat_status <> 'active' then
    return query select 'seat_unavailable'::text, null::uuid;
    return;
  end if;

  select status into enrollment_status from public.accreditation_enrollments
  where id = assignment_enrollment_id and organization_id = assignment_organization_id and event_id = assignment_event_id and deleted_at is null;
  if enrollment_status is null or enrollment_status <> 'active' then
    return query select 'enrollment_inactive'::text, null::uuid;
    return;
  end if;
  if assignment_access_grant_id is not null and not exists (
    select 1 from public.accreditation_access_grants
    where id = assignment_access_grant_id and organization_id = assignment_organization_id and event_id = assignment_event_id
      and enrollment_id = assignment_enrollment_id and status = 'active'
  ) then
    return query select 'grant_invalid'::text, null::uuid;
    return;
  end if;

  select id into existing_assignment_id from public.accreditation_theatre_seat_assignments
  where organization_id = assignment_organization_id and event_id = assignment_event_id
    and enrollment_id = assignment_enrollment_id and released_at is null for update;
  if existing_assignment_id is not null then
    update public.accreditation_theatre_seat_assignments set released_at = now()
    where id = existing_assignment_id;
  end if;

  insert into public.accreditation_theatre_seat_assignments
    (organization_id, event_id, seat_id, enrollment_id, access_grant_id, assigned_by_profile_id)
  values
    (assignment_organization_id, assignment_event_id, assignment_seat_id, assignment_enrollment_id, assignment_access_grant_id, assignment_operator_profile_id)
  returning id into new_assignment_id;
  return query select 'assigned'::text, new_assignment_id;
exception when unique_violation then
  return query select 'seat_already_assigned'::text, null::uuid;
end;
$$;

revoke all on function public.accreditation_theatre_assign_seat(uuid, uuid, uuid, uuid, uuid, uuid) from public;
grant execute on function public.accreditation_theatre_assign_seat(uuid, uuid, uuid, uuid, uuid, uuid) to authenticated, service_role;

comment on table public.accreditation_theatre_seats is 'Structured event-scoped seats for Theatre assigned seating; not an admission or ticket table.';
comment on table public.accreditation_theatre_seat_assignments is 'Append-only Theatre seat assignment history linked to canonical accreditation identities.';
