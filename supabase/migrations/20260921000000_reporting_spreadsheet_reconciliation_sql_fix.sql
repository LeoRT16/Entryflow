-- Qualify provisioning columns that collide with RETURNS TABLE output names.
create or replace function public.request_reporting_spreadsheet_reconciliation(p_event_id uuid)
returns table(destination_id uuid, provisioning_id uuid, provisioning_status text, target_generation bigint)
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.events%rowtype; d public.reporting_destinations%rowtype; l public.event_drive_locations%rowtype; p public.reporting_spreadsheet_provisioning%rowtype;
begin
  select ev.* into e from public.events ev where ev.id=p_event_id and ev.deleted_at is null;
  if not found then raise exception 'reporting_event_not_found' using errcode='P0002'; end if;
  select loc.* into l from public.event_drive_locations loc where loc.event_id=e.id and loc.organization_id=e.organization_id and loc.deleted_at is null;
  if not found or l.status<>'ready' or nullif(trim(l.event_drive_folder_id),'') is null then raise exception 'drive_event_folder_required' using errcode='55000'; end if;
  select dest.* into d from public.reporting_destinations dest where dest.event_id=e.id and dest.organization_id=e.organization_id and dest.provider='google_sheets' and dest.deleted_at is null for update;
  if not found or d.writer_mode<>'oauth_user' or nullif(trim(d.spreadsheet_id),'') is null then raise exception 'reporting_managed_spreadsheet_required' using errcode='55000'; end if;
  select prov.* into p from public.reporting_spreadsheet_provisioning prov where prov.destination_id=d.id for update;
  if not found then raise exception 'reporting_provisioning_missing' using errcode='P0002'; end if;
  if p.status in ('pending','processing','uncertain','retry') then
    return query select d.id,p.id,p.status,p.target_generation;
    return;
  end if;
  update public.reporting_spreadsheet_provisioning prov
    set target_generation=prov.target_generation+1,status='pending',available_at=now(),last_error_code=null,
        claim_token=null,lease_expires_at=null,create_started_at=null,processed_at=null
    where prov.id=p.id
    returning prov.* into p;
  return query select d.id,p.id,p.status,p.target_generation;
end; $$;
revoke all on function public.request_reporting_spreadsheet_reconciliation(uuid) from public,anon,authenticated;
grant execute on function public.request_reporting_spreadsheet_reconciliation(uuid) to service_role;
