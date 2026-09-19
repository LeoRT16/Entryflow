alter table public.reporting_destinations
  add column if not exists writer_mode text not null default 'service_account',
  add column if not exists last_applied_spreadsheet_title text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.reporting_destinations'::regclass
      and conname='reporting_destinations_writer_mode_check'
  ) then
    alter table public.reporting_destinations
      add constraint reporting_destinations_writer_mode_check
      check (writer_mode in ('service_account','oauth_user'));
  end if;
end $$;

create table if not exists public.reporting_spreadsheet_provisioning (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null unique references public.reporting_destinations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  event_id uuid not null references public.events(id),
  status text not null default 'blocked'
    check (status in ('blocked','pending','processing','retry','uncertain','ready','needs_action','needs_reauth','dead')),
  target_revision bigint not null default 1 check (target_revision > 0),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  claim_token uuid,
  lease_expires_at timestamptz,
  create_started_at timestamptz,
  last_error_code text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events(id, organization_id),
  check (last_error_code is null or length(trim(last_error_code)) > 0),
  check ((status='processing') = (claim_token is not null and lease_expires_at is not null))
);

create index if not exists reporting_spreadsheet_provisioning_claim_idx
  on public.reporting_spreadsheet_provisioning(status, available_at, created_at);

drop trigger if exists reporting_spreadsheet_provisioning_touch on public.reporting_spreadsheet_provisioning;
create trigger reporting_spreadsheet_provisioning_touch
  before update on public.reporting_spreadsheet_provisioning
  for each row execute function public.reporting_touch_updated_at();

alter table public.reporting_spreadsheet_provisioning enable row level security;
revoke all on public.reporting_spreadsheet_provisioning from public, anon, authenticated;
grant all on public.reporting_spreadsheet_provisioning to service_role;
revoke insert, update, delete on public.reporting_destinations from anon, authenticated;

create or replace function public.request_reporting_spreadsheet_provisioning(p_event_id uuid)
returns table(destination_id uuid, provisioning_id uuid, provisioning_status text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  e public.events%rowtype;
  d public.reporting_destinations%rowtype;
  l public.event_drive_locations%rowtype;
  i public.reporting_drive_integrations%rowtype;
  p public.reporting_spreadsheet_provisioning%rowtype;
  target_state text;
  target_revision_value bigint;
  err text;
  folder_ready boolean;
  integration_ready boolean;
begin
  select * into e from public.events where id=p_event_id and deleted_at is null;
  if not found then raise exception 'reporting_event_not_found' using errcode='P0002'; end if;
  select * into l from public.event_drive_locations where event_id=e.id and organization_id=e.organization_id and deleted_at is null;
  target_revision_value:=coalesce(l.revision,1);
  folder_ready:=found and l.status='ready' and nullif(trim(l.event_drive_folder_id),'') is not null;
  select * into i from public.reporting_drive_integrations where organization_id=e.organization_id and enabled and deleted_at is null;
  integration_ready:=found and i.enabled and i.status='connected' and i.oauth_secret_id is not null;

  insert into public.reporting_destinations(organization_id,event_id,provider,enabled,spreadsheet_id,sheet_schema_version,writer_mode)
    values(e.organization_id,e.id,'google_sheets',false,null,2,'oauth_user')
    on conflict (event_id,provider) where deleted_at is null do nothing;
  select * into d from public.reporting_destinations where event_id=e.id and provider='google_sheets' and deleted_at is null for update;

  if d.writer_mode='service_account' and d.spreadsheet_id is not null then
    target_state:='needs_action'; err:='legacy_destination_requires_review';
  elsif d.writer_mode='service_account' and exists (select 1 from public.reporting_outbox ro where ro.destination_id=d.id) then
    target_state:='needs_action'; err:='legacy_sync_history_requires_review';
  elsif exists (select 1 from public.reporting_outbox ro where ro.destination_id=d.id and ro.status='processing') then
    target_state:='needs_action'; err:='legacy_writer_active';
  else
    update public.reporting_destinations set enabled=false,writer_mode='oauth_user',sheet_schema_version=2 where id=d.id;
    if not found then raise exception 'reporting_destination_not_found' using errcode='P0002'; end if;
    if not integration_ready then target_state:='needs_reauth'; err:='google_drive_integration_required';
    elsif not folder_ready then target_state:='blocked'; err:='drive_event_folder_required';
    else target_state:='pending'; err:=null; end if;
  end if;

  insert into public.reporting_spreadsheet_provisioning(destination_id,organization_id,event_id,status,target_revision,available_at,last_error_code)
    values(d.id,e.organization_id,e.id,target_state,target_revision_value,now(),err)
  on conflict on constraint reporting_spreadsheet_provisioning_destination_id_key do update set
    status=case
      when reporting_spreadsheet_provisioning.status in ('processing','ready','uncertain') then reporting_spreadsheet_provisioning.status
      when reporting_spreadsheet_provisioning.status='needs_action' and reporting_spreadsheet_provisioning.last_error_code not in ('drive_event_folder_revision_changed','drive_event_folder_required','google_drive_integration_required') then 'needs_action'
      else excluded.status end,
    target_revision=case when reporting_spreadsheet_provisioning.status in ('processing','ready','uncertain') then reporting_spreadsheet_provisioning.target_revision else excluded.target_revision end,
    available_at=case when reporting_spreadsheet_provisioning.status in ('processing','ready','uncertain') then reporting_spreadsheet_provisioning.available_at else now() end,
    last_error_code=case
      when reporting_spreadsheet_provisioning.status in ('processing','ready','uncertain') then reporting_spreadsheet_provisioning.last_error_code
      when reporting_spreadsheet_provisioning.status='needs_action' and reporting_spreadsheet_provisioning.last_error_code not in ('drive_event_folder_revision_changed','drive_event_folder_required','google_drive_integration_required') then reporting_spreadsheet_provisioning.last_error_code
      else excluded.last_error_code end
  returning * into p;
  return query select d.id,p.id,p.status;
end; $$;
revoke all on function public.request_reporting_spreadsheet_provisioning(uuid) from public,anon,authenticated;
grant execute on function public.request_reporting_spreadsheet_provisioning(uuid) to service_role;

create or replace function public.claim_reporting_spreadsheet_provisioning_jobs(p_worker_id text,p_limit integer default 1)
returns table(outbox_id uuid,destination_id uuid,event_id uuid,organization_id uuid,target_revision bigint,
  attempts integer,claim_token uuid,reconcile_only boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; t uuid; reconcile boolean;
begin
  if nullif(trim(p_worker_id),'') is null or p_limit<1 or p_limit>25 then
    raise exception 'reporting_spreadsheet_invalid_claim' using errcode='22023';
  end if;
  for r in
    select p.*,d.writer_mode,l.status as location_status,l.event_drive_folder_id,i.enabled as integration_enabled,
      i.status as integration_status,i.oauth_secret_id
    from public.reporting_spreadsheet_provisioning p
    join public.reporting_destinations d on d.id=p.destination_id and d.organization_id=p.organization_id and d.event_id=p.event_id
    left join public.event_drive_locations l on l.event_id=p.event_id and l.organization_id=p.organization_id and l.deleted_at is null
    left join public.reporting_drive_integrations i on i.organization_id=p.organization_id and i.deleted_at is null
    where d.writer_mode='oauth_user' and d.deleted_at is null
      and (p.status in ('pending','retry','uncertain') and p.available_at<=now()
        or p.status='processing' and p.lease_expires_at<now())
    order by p.available_at,p.created_at
    for update of p,d skip locked
    limit p_limit
  loop
    if r.location_status is distinct from 'ready' or nullif(trim(r.event_drive_folder_id),'') is null then
      update public.reporting_spreadsheet_provisioning set status='blocked',last_error_code='drive_event_folder_required',claim_token=null,lease_expires_at=null where id=r.id;
      continue;
    end if;
    if r.integration_enabled is distinct from true or r.integration_status is distinct from 'connected' or r.oauth_secret_id is null then
      update public.reporting_spreadsheet_provisioning set status='needs_reauth',last_error_code='google_drive_integration_required',claim_token=null,lease_expires_at=null where id=r.id;
      continue;
    end if;
    if r.target_revision<>(select loc.revision from public.event_drive_locations loc where loc.event_id=r.event_id and loc.organization_id=r.organization_id and loc.deleted_at is null) then
      update public.reporting_spreadsheet_provisioning set status='needs_action',last_error_code='drive_event_folder_revision_changed',claim_token=null,lease_expires_at=null where id=r.id;
      continue;
    end if;
    reconcile:=r.status='uncertain' or (r.status='processing' and r.lease_expires_at<now() and r.create_started_at is not null);
    t:=gen_random_uuid();
    update public.reporting_spreadsheet_provisioning set status='processing',attempts=r.attempts+1,claim_token=t,lease_expires_at=now()+interval '5 minutes' where id=r.id;
    return query select r.id,r.destination_id,r.event_id,r.organization_id,r.target_revision,r.attempts+1,t,reconcile;
  end loop;
end; $$;
revoke all on function public.claim_reporting_spreadsheet_provisioning_jobs(text,integer) from public,anon,authenticated;
grant execute on function public.claim_reporting_spreadsheet_provisioning_jobs(text,integer) to service_role;

create or replace function public.begin_reporting_spreadsheet_create(p_outbox_id uuid,p_claim_token uuid,p_target_revision bigint,p_event_drive_folder_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare
  p public.reporting_spreadsheet_provisioning%rowtype;
  l public.event_drive_locations%rowtype;
  d public.reporting_destinations%rowtype;
  i public.reporting_drive_integrations%rowtype;
begin
  select * into p from public.reporting_spreadsheet_provisioning where id=p_outbox_id for update;
  if not found or p.status<>'processing' or p.claim_token<>p_claim_token or p.target_revision<>p_target_revision or p.lease_expires_at<=now() then return false; end if;
  select * into d from public.reporting_destinations where id=p.destination_id and organization_id=p.organization_id and event_id=p.event_id for update;
  if not found or d.writer_mode<>'oauth_user' or d.spreadsheet_id is not null then return false; end if;
  select * into l from public.event_drive_locations where event_id=p.event_id and organization_id=p.organization_id and deleted_at is null for update;
  if not found or l.status<>'ready' or l.revision<>p.target_revision or l.event_drive_folder_id is distinct from p_event_drive_folder_id then return false; end if;
  select * into i from public.reporting_drive_integrations
    where organization_id=p.organization_id and enabled and status='connected' and oauth_secret_id is not null and deleted_at is null for update;
  if not found then return false; end if;
  update public.reporting_spreadsheet_provisioning set create_started_at=now(),lease_expires_at=now()+interval '10 minutes' where id=p.id;
  return true;
end; $$;
revoke all on function public.begin_reporting_spreadsheet_create(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.begin_reporting_spreadsheet_create(uuid,uuid,bigint,text) to service_role;

create or replace function public.complete_reporting_spreadsheet_provisioning_job(
  p_outbox_id uuid,p_claim_token uuid,p_target_revision bigint,p_event_drive_folder_id text,
  p_spreadsheet_id text,p_last_applied_title text,p_update_last_applied_title boolean default false)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.reporting_spreadsheet_provisioning%rowtype; d public.reporting_destinations%rowtype; l public.event_drive_locations%rowtype; i public.reporting_drive_integrations%rowtype;
begin
  if nullif(trim(p_spreadsheet_id),'') is null or nullif(trim(p_last_applied_title),'') is null then
    raise exception 'reporting_spreadsheet_result_invalid' using errcode='22023';
  end if;
  select * into p from public.reporting_spreadsheet_provisioning where id=p_outbox_id for update;
  if not found or p.status<>'processing' or p.claim_token<>p_claim_token or p.target_revision<>p_target_revision or p.lease_expires_at<=now() then return 'stale'; end if;
  select * into d from public.reporting_destinations where id=p.destination_id and organization_id=p.organization_id and event_id=p.event_id for update;
  if not found or d.writer_mode<>'oauth_user' then return 'stale'; end if;
  if d.spreadsheet_id is not null and d.spreadsheet_id<>p_spreadsheet_id then
    update public.reporting_spreadsheet_provisioning set status='needs_action',last_error_code='reporting_spreadsheet_identity_conflict',claim_token=null,lease_expires_at=null,create_started_at=null where id=p.id;
    return 'needs_action';
  end if;
  select * into l from public.event_drive_locations where event_id=p.event_id and organization_id=p.organization_id and deleted_at is null for update;
  if not found or l.status<>'ready' or l.revision<>p.target_revision or l.event_drive_folder_id is distinct from p_event_drive_folder_id then
    update public.reporting_spreadsheet_provisioning set status='needs_action',last_error_code='drive_event_folder_revision_changed',claim_token=null,lease_expires_at=null,create_started_at=null where id=p.id;
    return 'needs_action';
  end if;
  select * into i from public.reporting_drive_integrations where organization_id=p.organization_id and enabled and status='connected' and deleted_at is null;
  if not found then return 'stale'; end if;
  update public.reporting_destinations set spreadsheet_id=coalesce(spreadsheet_id,p_spreadsheet_id),
    last_applied_spreadsheet_title=case when last_applied_spreadsheet_title is null or p_update_last_applied_title then p_last_applied_title else last_applied_spreadsheet_title end,
    enabled=false,writer_mode='oauth_user',sheet_schema_version=2
    where id=d.id;
  update public.reporting_spreadsheet_provisioning set status='ready',processed_at=now(),last_error_code=null,claim_token=null,lease_expires_at=null,create_started_at=null where id=p.id;
  return 'completed';
end; $$;
revoke all on function public.complete_reporting_spreadsheet_provisioning_job(uuid,uuid,bigint,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.complete_reporting_spreadsheet_provisioning_job(uuid,uuid,bigint,text,text,text,boolean) to service_role;

create or replace function public.fail_reporting_spreadsheet_provisioning_job(
  p_outbox_id uuid,p_claim_token uuid,p_target_revision bigint,p_status text,p_error_code text,p_next_available_at timestamptz default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.reporting_spreadsheet_provisioning%rowtype;
begin
  if p_status not in ('blocked','retry','uncertain','needs_action','needs_reauth','dead') then
    raise exception 'reporting_spreadsheet_invalid_failure_status' using errcode='22023';
  end if;
  select * into p from public.reporting_spreadsheet_provisioning where id=p_outbox_id for update;
  if not found or p.status<>'processing' or p.claim_token<>p_claim_token or p.target_revision<>p_target_revision or p.lease_expires_at<=now() then return false; end if;
  update public.reporting_spreadsheet_provisioning set status=p_status,last_error_code=nullif(trim(p_error_code),''),
    available_at=coalesce(p_next_available_at,available_at),claim_token=null,lease_expires_at=null,
    create_started_at=case when p_status in ('uncertain','needs_action') then create_started_at else null end
    where id=p.id;
  if p_status='needs_reauth' then
    update public.reporting_drive_integrations set status='needs_reauth',last_error_code='google_invalid_grant'
      where organization_id=p.organization_id and deleted_at is null;
  end if;
  return true;
end; $$;
revoke all on function public.fail_reporting_spreadsheet_provisioning_job(uuid,uuid,bigint,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.fail_reporting_spreadsheet_provisioning_job(uuid,uuid,bigint,text,text,timestamptz) to service_role;

create or replace function public.request_reporting_sync(p_event_id uuid)
returns table(outbox_id uuid,destination_id uuid,requested_sequence bigint)
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.reporting_destinations%rowtype; o public.reporting_outbox%rowtype; next_sequence bigint;
begin
  if auth.uid() is null then raise exception 'reporting_unauthenticated' using errcode='28000'; end if;
  select rd.* into d from public.reporting_destinations rd
    where rd.event_id=p_event_id and rd.provider='google_sheets' and rd.enabled and rd.deleted_at is null for update;
  if not found then raise exception 'reporting_destination_not_found' using errcode='P0002'; end if;
  if d.writer_mode<>'service_account' then raise exception 'reporting_writer_not_enabled' using errcode='55000'; end if;
  if not (p_event_id = any(public.current_event_ids())) then raise exception 'reporting_forbidden' using errcode='42501'; end if;
  if not exists (select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.user_id=public.current_app_user_id() and p.organization_id=d.organization_id and p.deleted_at is null and r.deleted_at is null and ('event.edit'=any(r.permissions) or 'organization.manage'=any(r.permissions))) then raise exception 'reporting_forbidden' using errcode='42501'; end if;
  next_sequence:=d.last_requested_sequence+1;
  update public.reporting_destinations set last_requested_sequence=next_sequence,last_error=null where id=d.id;
  insert into public.reporting_outbox(destination_id,organization_id,event_id,requested_sequence,status,available_at,attempts,last_error,locked_at,locked_by,processed_at)
    values(d.id,d.organization_id,d.event_id,next_sequence,'pending',now(),0,null,null,null,null)
  on conflict on constraint reporting_outbox_destination_id_key do update set requested_sequence=excluded.requested_sequence,status='pending',available_at=now(),last_error=null,locked_at=null,locked_by=null;
  select ro.* into o from public.reporting_outbox ro where ro.destination_id=d.id;
  return query select o.id,d.id,o.requested_sequence;
end; $$;
revoke all on function public.request_reporting_sync(uuid) from public;
grant execute on function public.request_reporting_sync(uuid) to authenticated;

create or replace function public.claim_reporting_sync_work(p_worker_id text,p_limit integer default 1)
returns table(outbox_id uuid,sync_run_id uuid,destination_id uuid,event_id uuid,requested_sequence bigint,attempts integer,provider text,spreadsheet_id text,sheet_schema_version integer)
language plpgsql security definer set search_path=public,pg_temp as $$
declare o record; run_id uuid;
begin
  if nullif(trim(p_worker_id),'') is null or p_limit<1 or p_limit>50 then raise exception 'reporting_invalid_claim' using errcode='22023'; end if;
  for o in
    select ob.*,d.provider,d.spreadsheet_id,d.sheet_schema_version,d.writer_mode
    from public.reporting_outbox ob join public.reporting_destinations d on d.id=ob.destination_id
    where d.enabled and d.deleted_at is null and d.writer_mode='service_account'
      and ((ob.status in ('pending','retry') and ob.available_at<=now()) or (ob.status='processing' and ob.locked_at<now()-interval '5 minutes'))
    order by ob.available_at,ob.created_at for update of ob,d skip locked limit p_limit
  loop
    if o.status='processing' and o.locked_at<now()-interval '5 minutes' and o.active_sync_run_id is not null then
      update public.reporting_sync_runs set status='failed',finished_at=now(),error_code='worker_lease_expired',error_message='Worker lease expired before completion.'
      where reporting_sync_runs.id=o.active_sync_run_id and reporting_sync_runs.destination_id=o.destination_id and reporting_sync_runs.event_id=o.event_id and reporting_sync_runs.status='processing';
    end if;
    update public.reporting_outbox set status='processing',locked_at=now(),locked_by=p_worker_id,attempts=o.attempts+1 where id=o.id;
    run_id:=gen_random_uuid();
    insert into public.reporting_sync_runs(id,destination_id,organization_id,event_id,requested_sequence,sheet_schema_version,status,attempt)
      values(run_id,o.destination_id,o.organization_id,o.event_id,o.requested_sequence,o.sheet_schema_version,'processing',o.attempts+1);
    update public.reporting_outbox set active_sync_run_id=run_id where id=o.id;
    return query select o.id,run_id,o.destination_id,o.event_id,o.requested_sequence,o.attempts+1,o.provider,o.spreadsheet_id,o.sheet_schema_version;
  end loop;
end; $$;
revoke all on function public.claim_reporting_sync_work(text,integer) from public,authenticated,anon;
grant execute on function public.claim_reporting_sync_work(text,integer) to service_role;

create or replace function public.upsert_reporting_destination(p_event_id uuid,p_spreadsheet_id text,p_enabled boolean default true)
returns table(id uuid,event_id uuid,provider text,spreadsheet_id text,enabled boolean,sheet_schema_version integer,
  last_requested_sequence bigint,last_processed_sequence bigint,last_sync_at timestamptz,last_success_at timestamptz,last_error text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.reporting_destinations%rowtype; changed boolean;
begin
  if nullif(trim(p_spreadsheet_id),'') is null then raise exception 'reporting_spreadsheet_required' using errcode='22023'; end if;
  if not (p_event_id=any(public.current_event_ids())) then raise exception 'reporting_forbidden' using errcode='42501'; end if;
  if not exists (select 1 from public.events e join public.profiles p on p.organization_id=e.organization_id and p.user_id=public.current_app_user_id() and p.deleted_at is null join public.roles r on r.id=p.role_id and r.deleted_at is null where e.id=p_event_id and ('event.edit'=any(r.permissions) or 'organization.manage'=any(r.permissions))) then raise exception 'reporting_forbidden' using errcode='42501'; end if;

  select rd.* into d from public.reporting_destinations rd where rd.event_id=p_event_id and rd.provider='google_sheets' and rd.deleted_at is null for update;
  if found and d.writer_mode='oauth_user' then raise exception 'reporting_oauth_destination_immutable' using errcode='55000'; end if;
  if found then
    changed:=d.spreadsheet_id is distinct from trim(p_spreadsheet_id);
  else
    insert into public.reporting_destinations(organization_id,event_id,provider,spreadsheet_id,enabled,sheet_schema_version,writer_mode)
      select e.organization_id,p_event_id,'google_sheets',trim(p_spreadsheet_id),coalesce(p_enabled,true),1,'service_account' from public.events e where e.id=p_event_id
      on conflict do nothing returning * into d;
    if not found then
      select rd.* into d from public.reporting_destinations rd where rd.event_id=p_event_id and rd.provider='google_sheets' and rd.deleted_at is null for update;
    end if;
    if not found then raise exception 'reporting_destination_not_found' using errcode='P0002'; end if;
    changed:=d.spreadsheet_id is distinct from trim(p_spreadsheet_id);
  end if;
  update public.reporting_destinations rd set spreadsheet_id=trim(p_spreadsheet_id),enabled=coalesce(p_enabled,true),sheet_schema_version=1,
    last_success_dataset_hash=case when changed then null else rd.last_success_dataset_hash end,
    last_success_spreadsheet_id=case when changed then null else rd.last_success_spreadsheet_id end,
    last_success_sheet_schema_version=case when changed then null else rd.last_success_sheet_schema_version end
    where rd.id=d.id returning rd.* into d;
  return query select d.id,d.event_id,d.provider,d.spreadsheet_id,d.enabled,d.sheet_schema_version,d.last_requested_sequence,d.last_processed_sequence,d.last_sync_at,d.last_success_at,d.last_error;
end; $$;
revoke all on function public.upsert_reporting_destination(uuid,text,boolean) from public,anon;
grant execute on function public.upsert_reporting_destination(uuid,text,boolean) to authenticated;
