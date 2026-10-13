-- Keep the dedicated non-login SECURITY DEFINER owner and grant it only
-- relation-local RLS visibility needed by this already-authorized RPC.
-- The role has no LOGIN and no membership granted to application roles.
do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'events','accreditation_theatre_seat_assignments','accreditation_theatre_seats',
    'accreditation_access_entitlement_days','accreditation_access_grant_days',
    'accreditation_event_days','accreditation_sector_movements',
    'accreditation_sector_access_attempts','accreditation_access_checkpoints',
    'accreditation_access_entitlements','accreditation_access_grants',
    'accreditation_checkins','accreditation_enrollments','accreditation_program_sessions',
    'accreditation_access_sectors','accreditation_categories','reporting_final_report_jobs',
    'reporting_final_snapshots','reporting_sync_runs','reporting_retry_audit',
    'reporting_outbox','reporting_spreadsheet_provisioning','reporting_destinations',
    'drive_provisioning_outbox','event_drive_locations','whatsapp_delivery_attempts',
    'profiles','roles'
  ] loop
    if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=relation_name and c.relrowsecurity) then
      execute format('create policy %I on public.%I for all to event_deleter using (true) with check (true)',
        'permanent_delete_event_deleter_' || relation_name, relation_name);
    end if;
  end loop;
end $$;
