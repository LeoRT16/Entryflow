-- OAuth-user Sheets writer V2. Legacy Service Account RPCs remain isolated.

create or replace function public.request_reporting_oauth_sync(p_event_id uuid)
returns table(outbox_id uuid,destination_id uuid,requested_sequence bigint)
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.reporting_destinations%rowtype; o public.reporting_outbox%rowtype; next_sequence bigint;
begin
  if auth.uid() is null then raise exception 'reporting_unauthenticated' using errcode='28000'; end if;
  select rd.* into d from public.reporting_destinations rd
    where rd.event_id=p_event_id and rd.provider='google_sheets' and rd.enabled and rd.deleted_at is null for update;
  if not found or d.writer_mode<>'oauth_user' or d.sheet_schema_version<>2 then
    raise exception 'reporting_oauth_destination_not_ready' using errcode='55000';
  end if;
  if not (p_event_id=any(public.current_event_ids())) then raise exception 'reporting_forbidden' using errcode='42501'; end if;
  if not exists (select 1 from public.profiles p join public.roles r on r.id=p.role_id
    where p.user_id=public.current_app_user_id() and p.organization_id=d.organization_id and p.deleted_at is null and r.deleted_at is null
      and ('event.edit'=any(r.permissions) or 'organization.manage'=any(r.permissions))) then
    raise exception 'reporting_forbidden' using errcode='42501';
  end if;
  if not exists (select 1 from public.reporting_drive_integrations i where i.organization_id=d.organization_id
      and i.enabled and i.status='connected' and i.oauth_secret_id is not null and i.deleted_at is null)
    or not exists (select 1 from public.reporting_spreadsheet_provisioning p where p.destination_id=d.id and p.status='ready') then
    raise exception 'reporting_oauth_destination_not_ready' using errcode='55000';
  end if;
  next_sequence:=d.last_requested_sequence+1;
  update public.reporting_destinations set last_requested_sequence=next_sequence,last_error=null where id=d.id;
  insert into public.reporting_outbox(destination_id,organization_id,event_id,requested_sequence,status,available_at,attempts,last_error,locked_at,locked_by,processed_at)
    values(d.id,d.organization_id,d.event_id,next_sequence,'pending',now(),0,null,null,null,null)
  on conflict on constraint reporting_outbox_destination_id_key do update set requested_sequence=excluded.requested_sequence,status='pending',available_at=now(),attempts=0,last_error=null,locked_at=null,locked_by=null,processed_at=null;
  select ro.* into o from public.reporting_outbox ro where ro.destination_id=d.id;
  return query select o.id,d.id,o.requested_sequence;
end; $$;
revoke all on function public.request_reporting_oauth_sync(uuid) from public,anon;
grant execute on function public.request_reporting_oauth_sync(uuid) to authenticated;

create or replace function public.claim_reporting_oauth_sync_work(p_worker_id text,p_limit integer default 5)
returns table(outbox_id uuid,sync_run_id uuid,destination_id uuid,organization_id uuid,event_id uuid,
  requested_sequence bigint,attempts integer,provider text,spreadsheet_id text,sheet_schema_version integer,writer_mode text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare o record; run_id uuid;
begin
  if nullif(trim(p_worker_id),'') is null or p_limit<1 or p_limit>25 then
    raise exception 'reporting_invalid_claim' using errcode='22023';
  end if;
  for o in
    select ob.*,d.provider,d.spreadsheet_id,d.sheet_schema_version,d.writer_mode
    from public.reporting_outbox ob join public.reporting_destinations d on d.id=ob.destination_id
      join public.reporting_drive_integrations i on i.organization_id=d.organization_id and i.enabled and i.status='connected' and i.oauth_secret_id is not null and i.deleted_at is null
      join public.reporting_spreadsheet_provisioning p on p.destination_id=d.id and p.status='ready'
    where d.enabled and d.deleted_at is null and d.writer_mode='oauth_user' and d.sheet_schema_version=2
      and ((ob.status in ('pending','retry') and ob.available_at<=now()) or (ob.status='processing' and ob.locked_at<now()-interval '5 minutes'))
    order by ob.available_at,ob.created_at for update of ob,d skip locked limit p_limit
  loop
    if o.status='processing' and o.active_sync_run_id is not null then
      update public.reporting_sync_runs set status='failed',finished_at=now(),error_code='worker_lease_expired',error_message='Worker lease expired before completion.'
        where id=o.active_sync_run_id and status='processing';
    end if;
    update public.reporting_outbox set status='processing',locked_at=now(),locked_by=p_worker_id,attempts=o.attempts+1 where id=o.id;
    run_id:=gen_random_uuid();
    insert into public.reporting_sync_runs(id,destination_id,organization_id,event_id,requested_sequence,sheet_schema_version,status,attempt)
      values(run_id,o.destination_id,o.organization_id,o.event_id,o.requested_sequence,2,'processing',o.attempts+1);
    update public.reporting_outbox set active_sync_run_id=run_id where id=o.id;
    return query select o.id,run_id,o.destination_id,o.organization_id,o.event_id,o.requested_sequence,o.attempts+1,o.provider,o.spreadsheet_id,o.sheet_schema_version,o.writer_mode;
  end loop;
end; $$;
revoke all on function public.claim_reporting_oauth_sync_work(text,integer) from public,authenticated,anon;
grant execute on function public.claim_reporting_oauth_sync_work(text,integer) to service_role;

create or replace function public.complete_reporting_oauth_sync_success(
  p_outbox_id uuid,p_sync_run_id uuid,p_processed_sequence bigint,p_dataset_hash text,p_success_at timestamptz)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.reporting_outbox%rowtype; d public.reporting_destinations%rowtype; next_status text;
begin
  if p_success_at is null then raise exception 'reporting_success_timestamp_required' using errcode='22023'; end if;
  select * into o from public.reporting_outbox where id=p_outbox_id for update;
  if not found or o.status<>'processing' or o.active_sync_run_id<>p_sync_run_id then raise exception 'reporting_outbox_not_processing' using errcode='P0001'; end if;
  select * into d from public.reporting_destinations where id=o.destination_id for update;
  if not found or not d.enabled or d.writer_mode<>'oauth_user' or d.sheet_schema_version<>2 then
    raise exception 'reporting_oauth_destination_not_ready' using errcode='55000';
  end if;
  if not exists (select 1 from public.reporting_drive_integrations i where i.organization_id=d.organization_id
      and i.enabled and i.status='connected' and i.oauth_secret_id is not null and i.deleted_at is null)
    or not exists (select 1 from public.reporting_spreadsheet_provisioning p where p.destination_id=d.id and p.status='ready') then
    raise exception 'reporting_oauth_destination_not_ready' using errcode='55000';
  end if;
  next_status:=case when d.last_requested_sequence>p_processed_sequence then 'pending' else 'synced' end;
  update public.reporting_destinations set last_processed_sequence=greatest(last_processed_sequence,p_processed_sequence),
    last_sync_at=p_success_at,last_success_at=p_success_at,last_error=null,last_success_dataset_hash=left(p_dataset_hash,256),
    last_success_spreadsheet_id=d.spreadsheet_id,last_success_sheet_schema_version=d.sheet_schema_version where id=d.id;
  update public.reporting_outbox set status=next_status,processed_at=case when next_status='synced' then p_success_at else processed_at end,
    locked_at=null,locked_by=null,active_sync_run_id=null,last_error=null where id=o.id;
  update public.reporting_sync_runs set status='synced',processed_sequence=p_processed_sequence,dataset_hash=left(p_dataset_hash,256),finished_at=p_success_at where id=p_sync_run_id;
  return true;
end; $$;
revoke all on function public.complete_reporting_oauth_sync_success(uuid,uuid,bigint,text,timestamptz) from public,authenticated,anon;
grant execute on function public.complete_reporting_oauth_sync_success(uuid,uuid,bigint,text,timestamptz) to service_role;

create or replace function public.complete_reporting_oauth_sync_failure(
  p_outbox_id uuid,p_sync_run_id uuid,p_error_code text,p_failure_status text,p_recoverable boolean,p_next_available_at timestamptz default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.reporting_outbox%rowtype; next_status text;
begin
  if p_failure_status not in ('retry','needs_reauth','needs_action','needs_scope_upgrade','failed') then
    raise exception 'reporting_oauth_failure_status_invalid' using errcode='22023';
  end if;
  select * into o from public.reporting_outbox where id=p_outbox_id for update;
  if not found or o.status<>'processing' or o.active_sync_run_id<>p_sync_run_id then raise exception 'reporting_outbox_not_processing' using errcode='P0001'; end if;
  next_status:=case when p_recoverable and o.attempts<8 then 'retry' when p_recoverable then 'dead' else 'failed' end;
  update public.reporting_outbox set status=next_status,available_at=coalesce(p_next_available_at,now()),locked_at=null,locked_by=null,
    active_sync_run_id=null,last_error=left(coalesce(p_error_code,'error')||': Google Sheets sync failed.',1024) where id=o.id;
  update public.reporting_destinations set last_error=left(coalesce(p_error_code,'error')||': Google Sheets sync failed.',1024) where id=o.destination_id;
  update public.reporting_sync_runs set status=next_status,error_code=left(p_error_code,128),error_message='Google Sheets sync failed.',finished_at=now() where id=p_sync_run_id;
  if p_failure_status='needs_reauth' then
    update public.reporting_drive_integrations i set status='needs_reauth',last_error_code='google_invalid_grant'
      from public.reporting_destinations d where d.id=o.destination_id and i.organization_id=d.organization_id and i.deleted_at is null;
  elsif p_failure_status in ('needs_action','needs_scope_upgrade') then
    update public.reporting_spreadsheet_provisioning set status='needs_action',last_error_code=left(p_error_code,128)
      where destination_id=o.destination_id;
    if p_failure_status='needs_scope_upgrade' then
      update public.reporting_drive_integrations i set status='error',last_error_code='google_scope_insufficient'
        from public.reporting_destinations d where d.id=o.destination_id and i.organization_id=d.organization_id and i.deleted_at is null;
    end if;
  end if;
  return true;
end; $$;
revoke all on function public.complete_reporting_oauth_sync_failure(uuid,uuid,text,text,boolean,timestamptz) from public,authenticated,anon;
grant execute on function public.complete_reporting_oauth_sync_failure(uuid,uuid,text,text,boolean,timestamptz) to service_role;
