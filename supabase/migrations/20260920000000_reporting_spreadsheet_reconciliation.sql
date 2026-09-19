-- General managed Spreadsheet contract reconciliation. This generation is
-- independent from event_drive_locations.revision (which tracks Drive folders).
alter table public.reporting_spreadsheet_provisioning
  add column if not exists target_generation bigint not null default 1;

alter table public.reporting_spreadsheet_provisioning
  add constraint reporting_spreadsheet_target_generation_positive
  check (target_generation > 0);

create or replace function public.request_reporting_spreadsheet_reconciliation(p_event_id uuid)
returns table(destination_id uuid, provisioning_id uuid, provisioning_status text, target_generation bigint)
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.events%rowtype; d public.reporting_destinations%rowtype; l public.event_drive_locations%rowtype; p public.reporting_spreadsheet_provisioning%rowtype;
begin
  select * into e from public.events where id=p_event_id and deleted_at is null;
  if not found then raise exception 'reporting_event_not_found' using errcode='P0002'; end if;
  select * into l from public.event_drive_locations where event_id=e.id and organization_id=e.organization_id and deleted_at is null;
  if not found or l.status<>'ready' or nullif(trim(l.event_drive_folder_id),'') is null then raise exception 'drive_event_folder_required' using errcode='55000'; end if;
  select * into d from public.reporting_destinations where event_id=e.id and organization_id=e.organization_id and provider='google_sheets' and deleted_at is null for update;
  if not found or d.writer_mode<>'oauth_user' or nullif(trim(d.spreadsheet_id),'') is null then raise exception 'reporting_managed_spreadsheet_required' using errcode='55000'; end if;
  select * into p from public.reporting_spreadsheet_provisioning where destination_id=d.id for update;
  if not found then raise exception 'reporting_provisioning_missing' using errcode='P0002'; end if;
  if p.status in ('pending','processing','uncertain','retry') then
    return query select d.id,p.id,p.status,p.target_generation;
    return;
  end if;
  update public.reporting_spreadsheet_provisioning
    set target_generation=p.target_generation+1,status='pending',available_at=now(),last_error_code=null,
        claim_token=null,lease_expires_at=null,create_started_at=null,processed_at=null
    where id=p.id
    returning * into p;
  return query select d.id,p.id,p.status,p.target_generation;
end; $$;

revoke all on function public.request_reporting_spreadsheet_reconciliation(uuid) from public,anon,authenticated;
grant execute on function public.request_reporting_spreadsheet_reconciliation(uuid) to service_role;

drop function if exists public.claim_reporting_spreadsheet_provisioning_jobs(text,integer);
create or replace function public.claim_reporting_spreadsheet_provisioning_jobs(p_worker_id text,p_limit integer default 1)
returns table(outbox_id uuid,destination_id uuid,event_id uuid,organization_id uuid,target_revision bigint,target_generation bigint,
  attempts integer,claim_token uuid,reconcile_only boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; t uuid; reconcile boolean;
begin
  if nullif(trim(p_worker_id),'') is null or p_limit<1 or p_limit>25 then raise exception 'reporting_spreadsheet_invalid_claim' using errcode='22023'; end if;
  for r in select p.*,d.writer_mode,l.status as location_status,l.event_drive_folder_id,i.enabled as integration_enabled,i.status as integration_status,i.oauth_secret_id
    from public.reporting_spreadsheet_provisioning p join public.reporting_destinations d on d.id=p.destination_id and d.organization_id=p.organization_id and d.event_id=p.event_id
    left join public.event_drive_locations l on l.event_id=p.event_id and l.organization_id=p.organization_id and l.deleted_at is null
    left join public.reporting_drive_integrations i on i.organization_id=p.organization_id and i.deleted_at is null
    where d.writer_mode='oauth_user' and d.deleted_at is null and ((p.status in ('pending','retry','uncertain') and p.available_at<=now()) or (p.status='processing' and p.lease_expires_at<now()))
    order by p.available_at,p.created_at for update of p,d skip locked limit p_limit loop
    if r.location_status is distinct from 'ready' or nullif(trim(r.event_drive_folder_id),'') is null then update public.reporting_spreadsheet_provisioning set status='blocked',last_error_code='drive_event_folder_required',claim_token=null,lease_expires_at=null where id=r.id; continue; end if;
    if r.integration_enabled is distinct from true or r.integration_status is distinct from 'connected' or r.oauth_secret_id is null then update public.reporting_spreadsheet_provisioning set status='needs_reauth',last_error_code='google_drive_integration_required',claim_token=null,lease_expires_at=null where id=r.id; continue; end if;
    if r.target_revision<>(select loc.revision from public.event_drive_locations loc where loc.event_id=r.event_id and loc.organization_id=r.organization_id and loc.deleted_at is null) then update public.reporting_spreadsheet_provisioning set status='needs_action',last_error_code='drive_event_folder_revision_changed',claim_token=null,lease_expires_at=null where id=r.id; continue; end if;
    reconcile:=r.status='uncertain' or (r.status='processing' and r.lease_expires_at<now() and r.create_started_at is not null); t:=gen_random_uuid();
    update public.reporting_spreadsheet_provisioning set status='processing',attempts=r.attempts+1,claim_token=t,lease_expires_at=now()+interval '5 minutes' where id=r.id;
    return query select r.id,r.destination_id,r.event_id,r.organization_id,r.target_revision,r.target_generation,r.attempts+1,t,reconcile;
  end loop;
end; $$;
revoke all on function public.claim_reporting_spreadsheet_provisioning_jobs(text,integer) from public,anon,authenticated; grant execute on function public.claim_reporting_spreadsheet_provisioning_jobs(text,integer) to service_role;

drop function if exists public.complete_reporting_spreadsheet_provisioning_job(uuid,uuid,bigint,text,text,text,boolean);
create or replace function public.complete_reporting_spreadsheet_provisioning_job(p_outbox_id uuid,p_claim_token uuid,p_target_revision bigint,p_target_generation bigint,p_event_drive_folder_id text,p_spreadsheet_id text,p_last_applied_title text,p_update_last_applied_title boolean default false)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.reporting_spreadsheet_provisioning%rowtype; d public.reporting_destinations%rowtype; l public.event_drive_locations%rowtype;
begin
  if nullif(trim(p_spreadsheet_id),'') is null or nullif(trim(p_last_applied_title),'') is null then raise exception 'reporting_spreadsheet_result_invalid' using errcode='22023'; end if;
  select * into p from public.reporting_spreadsheet_provisioning where id=p_outbox_id for update;
  if not found or p.status<>'processing' or p.claim_token<>p_claim_token or p.target_revision<>p_target_revision or p.target_generation<>p_target_generation or p.lease_expires_at<=now() then return 'stale'; end if;
  select * into d from public.reporting_destinations where id=p.destination_id and organization_id=p.organization_id and event_id=p.event_id for update;
  if not found or d.writer_mode<>'oauth_user' then return 'stale'; end if;
  if d.spreadsheet_id is not null and d.spreadsheet_id<>p_spreadsheet_id then update public.reporting_spreadsheet_provisioning set status='needs_action',last_error_code='reporting_spreadsheet_identity_conflict',claim_token=null,lease_expires_at=null,create_started_at=null where id=p.id; return 'needs_action'; end if;
  select * into l from public.event_drive_locations where event_id=p.event_id and organization_id=p.organization_id and deleted_at is null for update;
  if not found or l.status<>'ready' or l.revision<>p.target_revision or l.event_drive_folder_id is distinct from p_event_drive_folder_id then update public.reporting_spreadsheet_provisioning set status='needs_action',last_error_code='drive_event_folder_revision_changed',claim_token=null,lease_expires_at=null,create_started_at=null where id=p.id; return 'needs_action'; end if;
  update public.reporting_destinations set spreadsheet_id=coalesce(spreadsheet_id,p_spreadsheet_id),last_applied_spreadsheet_title=case when last_applied_spreadsheet_title is null or p_update_last_applied_title then p_last_applied_title else last_applied_spreadsheet_title end,enabled=false,writer_mode='oauth_user',sheet_schema_version=2 where id=d.id;
  update public.reporting_spreadsheet_provisioning set status='ready',processed_at=now(),last_error_code=null,claim_token=null,lease_expires_at=null,create_started_at=null where id=p.id; return 'completed';
end; $$;
revoke all on function public.complete_reporting_spreadsheet_provisioning_job(uuid,uuid,bigint,bigint,text,text,text,boolean) from public,anon,authenticated; grant execute on function public.complete_reporting_spreadsheet_provisioning_job(uuid,uuid,bigint,bigint,text,text,text,boolean) to service_role;
