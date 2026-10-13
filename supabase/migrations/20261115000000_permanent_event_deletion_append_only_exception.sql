-- Keep normal check-ins append-only. The dedicated non-login role is the
-- PostgreSQL-enforced trust boundary for the authorized deletion function.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'event_deleter') then
    create role event_deleter nologin noinherit;
  end if;
end $$;

create or replace function public.accreditation_checkin_is_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'event_deleter' then return old; end if;
  raise exception 'accreditation_checkins are append-only';
end;
$$;

alter function public.permanently_delete_archived_event(uuid) owner to event_deleter;
grant select, delete on public.events,
  public.accreditation_theatre_seat_assignments, public.accreditation_theatre_seats,
  public.accreditation_access_entitlement_days, public.accreditation_access_grant_days,
  public.accreditation_event_days, public.accreditation_sector_movements,
  public.accreditation_sector_access_attempts, public.accreditation_access_checkpoints,
  public.accreditation_access_entitlements, public.accreditation_access_grants,
  public.accreditation_checkins, public.accreditation_enrollments,
  public.accreditation_program_sessions, public.accreditation_access_sectors,
  public.accreditation_categories, public.reporting_final_report_jobs,
  public.reporting_final_snapshots, public.reporting_sync_runs,
  public.reporting_retry_audit, public.reporting_outbox,
  public.reporting_spreadsheet_provisioning, public.reporting_destinations,
  public.drive_provisioning_outbox, public.event_drive_locations,
  public.whatsapp_delivery_attempts to event_deleter;
revoke all on function public.accreditation_checkin_is_immutable() from public, anon, authenticated;
