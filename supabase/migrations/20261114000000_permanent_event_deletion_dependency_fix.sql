create or replace function public.permanently_delete_archived_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.events%rowtype;
  active_count integer;
begin
  if auth.uid() is null then raise exception 'event_delete_unauthenticated' using errcode = '28000'; end if;
  select * into target from public.events where id = p_event_id for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if target.deleted_at is null then raise exception 'event_not_archived' using errcode = '22023'; end if;
  if not public.is_platform_root() and not exists (select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.user_id=public.current_app_user_id() and p.organization_id=target.organization_id and p.deleted_at is null and r.deleted_at is null and r.slug='owner') then
    raise exception 'event_permanent_delete_forbidden' using errcode = '42501';
  end if;
  select count(*) into active_count from public.reporting_outbox where event_id=target.id and status not in ('synced','dead','failed');
  if active_count > 0 then raise exception 'event_delete_blocked: reporting work is still active' using errcode='55006'; end if;
  select count(*) into active_count from public.reporting_final_report_jobs where event_id=target.id and status not in ('synced','dead','failed','completed');
  if active_count > 0 then raise exception 'event_delete_blocked: final report work is still active' using errcode='55006'; end if;
  select count(*) into active_count from public.reporting_spreadsheet_provisioning where event_id=target.id and status not in ('ready','dead');
  if active_count > 0 then raise exception 'event_delete_blocked: spreadsheet provisioning is still active' using errcode='55006'; end if;
  select count(*) into active_count from public.drive_provisioning_outbox d join public.event_drive_locations l on l.id=d.event_location_id where l.event_id=target.id and d.status not in ('succeeded','dead','cancelled');
  if active_count > 0 then raise exception 'event_delete_blocked: drive provisioning is still active' using errcode='55006'; end if;
  delete from public.accreditation_theatre_seat_assignments where event_id=target.id;
  delete from public.accreditation_theatre_seats where event_id=target.id;
  delete from public.accreditation_access_entitlement_days where event_id=target.id;
  delete from public.accreditation_access_grant_days where event_id=target.id;
  delete from public.accreditation_event_days where event_id=target.id;
  delete from public.accreditation_sector_movements where event_id=target.id;
  delete from public.accreditation_sector_access_attempts where event_id=target.id;
  delete from public.accreditation_access_checkpoints where event_id=target.id;
  delete from public.accreditation_access_entitlements where event_id=target.id;
  delete from public.accreditation_access_grants where event_id=target.id;
  delete from public.accreditation_checkins where event_id=target.id;
  delete from public.accreditation_enrollments where event_id=target.id;
  delete from public.accreditation_program_sessions where event_id=target.id;
  delete from public.accreditation_access_sectors where event_id=target.id;
  delete from public.accreditation_categories where event_id=target.id;
  delete from public.reporting_final_report_jobs where event_id=target.id;
  delete from public.reporting_final_snapshots where event_id=target.id;
  delete from public.reporting_sync_runs where event_id=target.id;
  delete from public.reporting_retry_audit where event_id=target.id;
  delete from public.reporting_outbox where event_id=target.id;
  delete from public.reporting_spreadsheet_provisioning where event_id=target.id;
  delete from public.reporting_destinations where event_id=target.id;
  delete from public.drive_provisioning_outbox where event_location_id in (select id from public.event_drive_locations where event_id=target.id);
  delete from public.event_drive_locations where event_id=target.id;
  delete from public.whatsapp_delivery_attempts where event_id=target.id;
  delete from public.events where id=target.id;
  return jsonb_build_object('ok',true,'eventId',target.id,'deleted',true);
end; $$;
revoke all on function public.permanently_delete_archived_event(uuid) from public, anon;
grant execute on function public.permanently_delete_archived_event(uuid) to authenticated;
