alter table public.reporting_destinations
  add column if not exists last_success_dataset_hash text,
  add column if not exists last_success_spreadsheet_id text,
  add column if not exists last_success_sheet_schema_version integer;

create or replace function public.upsert_reporting_destination(
  p_event_id uuid, p_spreadsheet_id text, p_enabled boolean default true)
returns table(id uuid, event_id uuid, provider text, spreadsheet_id text, enabled boolean,
  sheet_schema_version integer, last_requested_sequence bigint, last_processed_sequence bigint,
  last_sync_at timestamptz, last_success_at timestamptz, last_error text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.reporting_destinations%rowtype; changed boolean;
begin
  if nullif(trim(p_spreadsheet_id),'') is null then raise exception 'reporting_spreadsheet_required' using errcode='22023'; end if;
  if not (p_event_id = any(public.current_event_ids())) then raise exception 'reporting_forbidden' using errcode='42501'; end if;
  if not exists (select 1 from public.events e join public.profiles p on p.organization_id=e.organization_id and p.user_id=public.current_app_user_id() and p.deleted_at is null join public.roles r on r.id=p.role_id and r.deleted_at is null where e.id=p_event_id and ('event.edit'=any(r.permissions) or 'organization.manage'=any(r.permissions))) then raise exception 'reporting_forbidden' using errcode='42501'; end if;
  select (spreadsheet_id is distinct from trim(p_spreadsheet_id)) into changed from public.reporting_destinations where event_id=p_event_id and provider='google_sheets' and deleted_at is null;
  insert into public.reporting_destinations(organization_id,event_id,provider,spreadsheet_id,enabled,sheet_schema_version)
    select e.organization_id,p_event_id,'google_sheets',trim(p_spreadsheet_id),coalesce(p_enabled,true),1 from public.events e where e.id=p_event_id
  on conflict (event_id,provider) where deleted_at is null do update set spreadsheet_id=excluded.spreadsheet_id,enabled=excluded.enabled,sheet_schema_version=1,
    last_success_dataset_hash=case when changed then null else reporting_destinations.last_success_dataset_hash end,
    last_success_spreadsheet_id=case when changed then null else reporting_destinations.last_success_spreadsheet_id end,
    last_success_sheet_schema_version=case when changed then null else reporting_destinations.last_success_sheet_schema_version end;
  select * into d from public.reporting_destinations where event_id=p_event_id and provider='google_sheets' and deleted_at is null;
  return query select d.id,d.event_id,d.provider,d.spreadsheet_id,d.enabled,d.sheet_schema_version,d.last_requested_sequence,d.last_processed_sequence,d.last_sync_at,d.last_success_at,d.last_error;
end; $$;

create or replace function public.complete_reporting_sync_success(p_outbox_id uuid,p_sync_run_id uuid,p_processed_sequence bigint,p_dataset_hash text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.reporting_outbox%rowtype; d public.reporting_destinations%rowtype; next_status text;
begin
  select * into o from public.reporting_outbox where id=p_outbox_id for update;
  if not found or o.status <> 'processing' or o.active_sync_run_id <> p_sync_run_id then raise exception 'reporting_outbox_not_processing' using errcode='P0001'; end if;
  select * into d from public.reporting_destinations where id=o.destination_id for update;
  next_status := case when d.last_requested_sequence > p_processed_sequence then 'pending' else 'synced' end;
  update public.reporting_destinations set last_processed_sequence=greatest(last_processed_sequence,p_processed_sequence),last_sync_at=now(),last_success_at=now(),last_error=null,last_success_dataset_hash=left(p_dataset_hash,256),last_success_spreadsheet_id=d.spreadsheet_id,last_success_sheet_schema_version=d.sheet_schema_version where id=d.id;
  update public.reporting_outbox set status=next_status,processed_at=case when next_status='synced' then now() else processed_at end,locked_at=null,locked_by=null,active_sync_run_id=null,last_error=null where id=o.id;
  update public.reporting_sync_runs set status='synced',processed_sequence=p_processed_sequence,dataset_hash=left(p_dataset_hash,256),finished_at=now() where id=p_sync_run_id;
  return true;
end; $$;
