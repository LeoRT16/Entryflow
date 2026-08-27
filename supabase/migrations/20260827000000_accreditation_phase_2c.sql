create or replace function public.accreditation_program_session_belongs_to_scope(
  session_organization_id uuid,
  session_event_id uuid
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.events as event_row
    where event_row.id = session_event_id
      and event_row.organization_id = session_organization_id
      and event_row.deleted_at is null
  );
$$;

create or replace function public.accreditation_program_session_has_valid_time_window(
  session_starts_at timestamptz,
  session_ends_at timestamptz
)
returns boolean
language sql
immutable
as $$
  select session_ends_at > session_starts_at;
$$;

create table if not exists public.accreditation_program_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  description text,
  session_type text not null default 'other',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  room text,
  capacity integer,
  metadata jsonb,
  status text not null default 'active',
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accreditation_program_sessions_title_check check (btrim(title) <> ''),
  constraint accreditation_program_sessions_session_type_check check (session_type in ('keynote', 'talk', 'panel', 'workshop', 'break', 'networking', 'other')),
  constraint accreditation_program_sessions_status_check check (status in ('active', 'cancelled')),
  constraint accreditation_program_sessions_capacity_check check (capacity is null or capacity >= 0),
  constraint accreditation_program_sessions_scope_check check (public.accreditation_program_session_belongs_to_scope(organization_id, event_id)),
  constraint accreditation_program_sessions_time_window_check check (public.accreditation_program_session_has_valid_time_window(starts_at, ends_at))
);

create index if not exists accreditation_program_sessions_organization_event_idx
  on public.accreditation_program_sessions (organization_id, event_id);

create index if not exists accreditation_program_sessions_event_starts_idx
  on public.accreditation_program_sessions (event_id, starts_at);

drop trigger if exists set_updated_at_accreditation_program_sessions on public.accreditation_program_sessions;
create trigger set_updated_at_accreditation_program_sessions
before update on public.accreditation_program_sessions
for each row
execute function public.set_updated_at();

alter table public.accreditation_program_sessions enable row level security;

drop policy if exists "Tenant-scoped accreditation program session select" on public.accreditation_program_sessions;
drop policy if exists "Tenant-scoped accreditation program session insert" on public.accreditation_program_sessions;
drop policy if exists "Tenant-scoped accreditation program session update" on public.accreditation_program_sessions;
drop policy if exists "Tenant-scoped accreditation program session delete" on public.accreditation_program_sessions;

create policy "Tenant-scoped accreditation program session select"
  on public.accreditation_program_sessions
  for select
  using (
    public.accreditation_program_session_belongs_to_scope(
      accreditation_program_sessions.organization_id,
      accreditation_program_sessions.event_id
    )
  );

create policy "Tenant-scoped accreditation program session insert"
  on public.accreditation_program_sessions
  for insert
  with check (
    public.accreditation_program_session_belongs_to_scope(
      accreditation_program_sessions.organization_id,
      accreditation_program_sessions.event_id
    )
  );

create policy "Tenant-scoped accreditation program session update"
  on public.accreditation_program_sessions
  for update
  using (
    public.accreditation_program_session_belongs_to_scope(
      accreditation_program_sessions.organization_id,
      accreditation_program_sessions.event_id
    )
  )
  with check (
    public.accreditation_program_session_belongs_to_scope(
      accreditation_program_sessions.organization_id,
      accreditation_program_sessions.event_id
    )
  );

create policy "Tenant-scoped accreditation program session delete"
  on public.accreditation_program_sessions
  for delete
  using (
    public.accreditation_program_session_belongs_to_scope(
      accreditation_program_sessions.organization_id,
      accreditation_program_sessions.event_id
    )
  );

comment on function public.accreditation_program_session_belongs_to_scope(uuid, uuid) is 'Limits accreditation program sessions to the active organization and event scope.';
comment on function public.accreditation_program_session_has_valid_time_window(timestamptz, timestamptz) is 'Requires accreditation program sessions to end strictly after they start.';
