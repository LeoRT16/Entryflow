-- Requeue only authorization-blocked Reporting work after a durable OAuth reauthorization.
create or replace function public.recover_reporting_google_authorization(p_organization_id uuid)
returns table(drive_recovered integer, spreadsheet_recovered integer, sync_recovered integer)
language plpgsql security definer set search_path=public,pg_temp as $$
declare d_count integer := 0; p_count integer := 0; s_count integer := 0;
begin
  if p_organization_id is null then raise exception 'reporting_organization_required' using errcode='22023'; end if;

  update public.drive_provisioning_outbox o
     set status='pending', available_at=now(), claim_token=null, lease_expires_at=null,
         last_error_code=null
   where o.organization_id=p_organization_id
     and o.status='needs_action'
     and o.last_error_code in ('google_invalid_grant','google_auth_failed')
     and exists (select 1 from public.reporting_drive_integrations i
                   where i.id=o.integration_id and i.organization_id=p_organization_id
                     and i.enabled and i.status='connected' and i.deleted_at is null)
     and exists (select 1 from public.event_drive_locations l
                   where l.id=o.event_location_id and l.organization_id=p_organization_id
                     and l.deleted_at is null)
     and exists (select 1 from public.events e
                   where e.id=(select l2.event_id from public.event_drive_locations l2 where l2.id=o.event_location_id)
                     and e.organization_id=p_organization_id and e.deleted_at is null);
  get diagnostics d_count = row_count;

  update public.reporting_spreadsheet_provisioning p
     set status='pending', available_at=now(), claim_token=null, lease_expires_at=null,
         create_started_at=null, last_error_code=null
   where p.organization_id=p_organization_id
     and p.status in ('needs_action','needs_reauth')
     and p.last_error_code in ('google_invalid_grant','google_auth_failed','google_drive_integration_required')
     and exists (select 1 from public.reporting_destinations d
                   where d.id=p.destination_id and d.organization_id=p_organization_id
                     and d.deleted_at is null and d.writer_mode='oauth_user')
     and exists (select 1 from public.events e
                   where e.id=p.event_id and e.organization_id=p_organization_id and e.deleted_at is null);
  get diagnostics p_count = row_count;

  update public.reporting_outbox o
     set status='pending', available_at=now(), locked_at=null, locked_by=null,
         active_sync_run_id=null, last_error=null
   where o.organization_id=p_organization_id
     and o.status in ('failed','dead')
     and position('google_invalid_grant' in coalesce(o.last_error,'')) > 0
     and exists (select 1 from public.reporting_destinations d
                   where d.id=o.destination_id and d.organization_id=p_organization_id
                     and d.deleted_at is null and d.writer_mode='oauth_user')
     and exists (select 1 from public.events e
                   where e.id=o.event_id and e.organization_id=p_organization_id and e.deleted_at is null);
  get diagnostics s_count = row_count;

  update public.reporting_destinations d
     set last_error=null
   where d.organization_id=p_organization_id and d.deleted_at is null
     and position('google_invalid_grant' in coalesce(d.last_error,'')) > 0;

  return query select d_count,p_count,s_count;
end; $$;
revoke all on function public.recover_reporting_google_authorization(uuid) from public,anon,authenticated;
grant execute on function public.recover_reporting_google_authorization(uuid) to service_role;
