create or replace function public.accreditation_whatsapp_delivery_attempt_operator_is_authorized(
  attempt_organization_id uuid,
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
      and 'access.issue' = any(r.permissions)
  );
$$;

create or replace function public.accreditation_whatsapp_delivery_attempt_belongs_to_scope(
  attempt_organization_id uuid,
  attempt_event_id uuid,
  attempt_enrollment_id uuid,
  attempt_access_grant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    attempt_organization_id = any(public.current_organization_ids())
    and attempt_event_id = any(public.current_event_ids())
    and exists (
      select 1
      from public.accreditation_enrollments as enrollment
      where enrollment.id = attempt_enrollment_id
        and enrollment.deleted_at is null
        and enrollment.organization_id = attempt_organization_id
        and enrollment.event_id = attempt_event_id
        and enrollment.status = 'active'
    )
    and exists (
      select 1
      from public.accreditation_access_grants as grant_row
      where grant_row.id = attempt_access_grant_id
        and grant_row.organization_id = attempt_organization_id
        and grant_row.event_id = attempt_event_id
        and grant_row.enrollment_id = attempt_enrollment_id
        and grant_row.status = 'active'
  );
$$;

create or replace function public.accreditation_whatsapp_delivery_attempt_belongs_to_history_scope(
  attempt_organization_id uuid,
  attempt_event_id uuid,
  attempt_enrollment_id uuid,
  attempt_access_grant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    attempt_organization_id = any(public.current_organization_ids())
    and attempt_event_id = any(public.current_event_ids())
    and exists (
      select 1
      from public.accreditation_enrollments as enrollment
      where enrollment.id = attempt_enrollment_id
        and enrollment.deleted_at is null
        and enrollment.organization_id = attempt_organization_id
        and enrollment.event_id = attempt_event_id
    )
    and exists (
      select 1
      from public.accreditation_access_grants as grant_row
      where grant_row.id = attempt_access_grant_id
        and grant_row.organization_id = attempt_organization_id
        and grant_row.event_id = attempt_event_id
        and grant_row.enrollment_id = attempt_enrollment_id
    );
$$;

create or replace function public.accreditation_whatsapp_delivery_attempt_can_be_recorded(
  attempt_organization_id uuid,
  attempt_event_id uuid,
  attempt_enrollment_id uuid,
  attempt_access_grant_id uuid,
  attempt_operator_profile_id uuid,
  attempt_recipient text,
  attempt_access_code text,
  attempt_qr_token text,
  attempt_delivery_status text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.accreditation_whatsapp_delivery_attempt_belongs_to_scope(
      attempt_organization_id,
      attempt_event_id,
      attempt_enrollment_id,
      attempt_access_grant_id
    )
    and public.accreditation_whatsapp_delivery_attempt_operator_is_authorized(
      attempt_organization_id,
      attempt_operator_profile_id
    )
    and btrim(coalesce(attempt_recipient, '')) <> ''
    and btrim(coalesce(attempt_access_code, '')) <> ''
    and btrim(coalesce(attempt_qr_token, '')) <> ''
    and attempt_delivery_status in ('accepted', 'sent', 'delivered', 'read', 'failed');
$$;

create or replace function public.accreditation_whatsapp_delivery_attempt_assign_attempt_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.enrollment_id::text, 0));

  new.attempt_number := coalesce(
    (
      select max(attempt_number)
      from public.accreditation_whatsapp_delivery_attempts
      where enrollment_id = new.enrollment_id
    ),
    0
  ) + 1;

  return new;
end;
$$;

create table if not exists public.accreditation_whatsapp_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  enrollment_id uuid not null references public.accreditation_enrollments(id) on delete cascade,
  access_grant_id uuid not null references public.accreditation_access_grants(id) on delete cascade,
  operator_profile_id uuid not null references public.profiles(id),
  recipient text not null,
  access_code text not null,
  qr_token text not null,
  message_id text not null unique,
  attempt_number integer not null default 1,
  delivery_status text not null,
  status_history jsonb not null default '[]'::jsonb,
  accepted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  failure_message text,
  failure_details jsonb,
  template_name text not null,
  template_language text not null,
  media_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint accreditation_whatsapp_delivery_attempts_enrollment_attempt_number_unique unique (enrollment_id, attempt_number),
  constraint accreditation_whatsapp_delivery_attempts_delivery_status_check check (delivery_status in ('accepted', 'sent', 'delivered', 'read', 'failed'))
);

create index if not exists accreditation_whatsapp_delivery_attempts_organization_event_idx
  on public.accreditation_whatsapp_delivery_attempts (organization_id, event_id);

create index if not exists accreditation_whatsapp_delivery_attempts_enrollment_idx
  on public.accreditation_whatsapp_delivery_attempts (enrollment_id);

create index if not exists accreditation_whatsapp_delivery_attempts_access_grant_idx
  on public.accreditation_whatsapp_delivery_attempts (access_grant_id);

create index if not exists accreditation_whatsapp_delivery_attempts_message_id_idx
  on public.accreditation_whatsapp_delivery_attempts (message_id);

drop trigger if exists set_updated_at_accreditation_whatsapp_delivery_attempts on public.accreditation_whatsapp_delivery_attempts;
create trigger set_updated_at_accreditation_whatsapp_delivery_attempts
before update on public.accreditation_whatsapp_delivery_attempts
for each row
execute function public.set_updated_at();

drop trigger if exists set_attempt_number_accreditation_whatsapp_delivery_attempts on public.accreditation_whatsapp_delivery_attempts;
create trigger set_attempt_number_accreditation_whatsapp_delivery_attempts
before insert on public.accreditation_whatsapp_delivery_attempts
for each row
execute function public.accreditation_whatsapp_delivery_attempt_assign_attempt_number();

drop trigger if exists enforce_accreditation_whatsapp_delivery_attempts_identity_immutable on public.accreditation_whatsapp_delivery_attempts;

create or replace function public.accreditation_whatsapp_delivery_attempt_identity_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.organization_id is distinct from new.organization_id
    or old.event_id is distinct from new.event_id
    or old.enrollment_id is distinct from new.enrollment_id
    or old.access_grant_id is distinct from new.access_grant_id
    or old.operator_profile_id is distinct from new.operator_profile_id
    or old.recipient is distinct from new.recipient
    or old.access_code is distinct from new.access_code
    or old.qr_token is distinct from new.qr_token
    or old.message_id is distinct from new.message_id
    or old.attempt_number is distinct from new.attempt_number then
    raise exception 'accreditation_whatsapp_delivery_attempts identity columns are immutable';
  end if;

  return new;
end;
$$;

alter table public.accreditation_whatsapp_delivery_attempts enable row level security;

drop policy if exists "Tenant-scoped accreditation whatsapp delivery attempt select" on public.accreditation_whatsapp_delivery_attempts;
drop policy if exists "Tenant-scoped accreditation whatsapp delivery attempt insert" on public.accreditation_whatsapp_delivery_attempts;
drop policy if exists "Tenant-scoped accreditation whatsapp delivery attempt update" on public.accreditation_whatsapp_delivery_attempts;
drop policy if exists "Tenant-scoped accreditation whatsapp delivery attempt delete" on public.accreditation_whatsapp_delivery_attempts;

create trigger enforce_accreditation_whatsapp_delivery_attempt_identity_immutable
before update on public.accreditation_whatsapp_delivery_attempts
for each row
execute function public.accreditation_whatsapp_delivery_attempt_identity_immutable();

create policy "Tenant-scoped accreditation whatsapp delivery attempt select"
  on public.accreditation_whatsapp_delivery_attempts
  for select
  to authenticated
  using (
    public.accreditation_whatsapp_delivery_attempt_belongs_to_history_scope(
      accreditation_whatsapp_delivery_attempts.organization_id,
      accreditation_whatsapp_delivery_attempts.event_id,
      accreditation_whatsapp_delivery_attempts.enrollment_id,
      accreditation_whatsapp_delivery_attempts.access_grant_id
    )
  );

create policy "Tenant-scoped accreditation whatsapp delivery attempt insert"
  on public.accreditation_whatsapp_delivery_attempts
  for insert
  to authenticated
  with check (
    public.accreditation_whatsapp_delivery_attempt_can_be_recorded(
      accreditation_whatsapp_delivery_attempts.organization_id,
      accreditation_whatsapp_delivery_attempts.event_id,
      accreditation_whatsapp_delivery_attempts.enrollment_id,
      accreditation_whatsapp_delivery_attempts.access_grant_id,
      accreditation_whatsapp_delivery_attempts.operator_profile_id,
      accreditation_whatsapp_delivery_attempts.recipient,
      accreditation_whatsapp_delivery_attempts.access_code,
      accreditation_whatsapp_delivery_attempts.qr_token,
      accreditation_whatsapp_delivery_attempts.delivery_status
    )
  );

create policy "Tenant-scoped accreditation whatsapp delivery attempt update"
  on public.accreditation_whatsapp_delivery_attempts
  for update
  to authenticated
  using (
    public.accreditation_whatsapp_delivery_attempt_belongs_to_history_scope(
      accreditation_whatsapp_delivery_attempts.organization_id,
      accreditation_whatsapp_delivery_attempts.event_id,
      accreditation_whatsapp_delivery_attempts.enrollment_id,
      accreditation_whatsapp_delivery_attempts.access_grant_id
    )
    and public.accreditation_whatsapp_delivery_attempt_operator_is_authorized(
      accreditation_whatsapp_delivery_attempts.organization_id,
      accreditation_whatsapp_delivery_attempts.operator_profile_id
    )
  )
  with check (
    public.accreditation_whatsapp_delivery_attempt_belongs_to_history_scope(
      accreditation_whatsapp_delivery_attempts.organization_id,
      accreditation_whatsapp_delivery_attempts.event_id,
      accreditation_whatsapp_delivery_attempts.enrollment_id,
      accreditation_whatsapp_delivery_attempts.access_grant_id
    )
    and public.accreditation_whatsapp_delivery_attempt_operator_is_authorized(
      accreditation_whatsapp_delivery_attempts.organization_id,
      accreditation_whatsapp_delivery_attempts.operator_profile_id
    )
  );

comment on function public.accreditation_whatsapp_delivery_attempt_operator_is_authorized(uuid, uuid) is 'Requires the current user to submit one of their active operator profiles in the target organization and that role to include access.issue.';
comment on function public.accreditation_whatsapp_delivery_attempt_belongs_to_scope(uuid, uuid, uuid, uuid) is 'Limits accreditation WhatsApp delivery attempt inserts to the active organization and event scope with active enrollment and grant linkage.';
comment on function public.accreditation_whatsapp_delivery_attempt_belongs_to_history_scope(uuid, uuid, uuid, uuid) is 'Limits accreditation WhatsApp delivery attempt reads and status updates to the current organization and event scope with historical enrollment and grant linkage.';
comment on function public.accreditation_whatsapp_delivery_attempt_can_be_recorded(uuid, uuid, uuid, uuid, uuid, text, text, text, text) is 'Fails closed unless the delivery attempt references an active accreditation enrollment, active access grant, authorized operator profile, and non-empty WhatsApp payload values.';
comment on function public.accreditation_whatsapp_delivery_attempt_assign_attempt_number() is 'Assigns a unique per-enrollment attempt number under transaction-scoped locking before insert.';
comment on function public.accreditation_whatsapp_delivery_attempt_identity_immutable() is 'Prevents identity columns on accreditation WhatsApp delivery attempts from changing after insert.';
