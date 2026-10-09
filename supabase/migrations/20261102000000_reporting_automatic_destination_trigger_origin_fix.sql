-- Preserve the automatic Reporting contract after the origin-aware RPC change.
-- Existing manual callers keep the RPC default of p_origin='manual'.
create or replace function public.request_reporting_spreadsheet_when_drive_ready()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp as $$
begin
  if new.status='ready' and (old.status is distinct from 'ready' or old.event_drive_folder_id is distinct from new.event_drive_folder_id) then
    perform public.request_reporting_spreadsheet_provisioning(new.event_id,'automatic');
  end if;
  return new;
end; $$;

drop trigger if exists event_drive_location_reporting_ready on public.event_drive_locations;
create trigger event_drive_location_reporting_ready
after update of status,event_drive_folder_id on public.event_drive_locations
for each row execute function public.request_reporting_spreadsheet_when_drive_ready();

-- No backfill is performed here. Existing manual/legacy rows do not retain
-- independent, unambiguous evidence that they came from the defective trigger
-- path, so promoting them would risk enabling an intentional manual disable.
