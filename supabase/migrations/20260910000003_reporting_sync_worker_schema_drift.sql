-- Incremental repair for databases where 20260910000002 was already applied
-- before the worker lease-token fields were added.
alter table public.reporting_outbox
  add column if not exists active_sync_run_id uuid;

drop function if exists public.claim_reporting_sync_work(text, integer);
create function public.claim_reporting_sync_work(p_worker_id text, p_limit integer default 1)
returns table(outbox_id uuid, sync_run_id uuid, destination_id uuid, event_id uuid,
  requested_sequence bigint, attempts integer, provider text, spreadsheet_id text,
  sheet_schema_version integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare o record; run_id uuid;
begin
  if nullif(trim(p_worker_id),'') is null or p_limit < 1 or p_limit > 50 then
    raise exception 'reporting_invalid_claim' using errcode='22023';
  end if;
  for o in
    select ob.*, d.provider, d.spreadsheet_id, d.sheet_schema_version
    from public.reporting_outbox ob
    join public.reporting_destinations d on d.id=ob.destination_id
    where d.enabled and d.deleted_at is null
      and ((ob.status in ('pending','retry') and ob.available_at <= now())
        or (ob.status='processing' and ob.locked_at < now()-interval '5 minutes'))
    order by ob.available_at, ob.created_at
    for update of ob skip locked limit p_limit
  loop
    update public.reporting_outbox set status='processing', locked_at=now(),
      locked_by=p_worker_id, attempts=o.attempts+1 where id=o.id;
    run_id:=gen_random_uuid();
    insert into public.reporting_sync_runs(id,destination_id,organization_id,event_id,
      requested_sequence,sheet_schema_version,status,attempt)
      values(run_id,o.destination_id,o.organization_id,o.event_id,o.requested_sequence,
        o.sheet_schema_version,'processing',o.attempts+1);
    update public.reporting_outbox set active_sync_run_id=run_id where id=o.id;
    return query select o.id,run_id,o.destination_id,o.event_id,o.requested_sequence,
      o.attempts+1,o.provider,o.spreadsheet_id,o.sheet_schema_version;
  end loop;
end; $$;

create or replace function public.complete_reporting_sync_success(
  p_outbox_id uuid,p_sync_run_id uuid,p_processed_sequence bigint,p_dataset_hash text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.reporting_outbox%rowtype; d public.reporting_destinations%rowtype; next_status text;
begin
  select * into o from public.reporting_outbox where id=p_outbox_id for update;
  if not found or o.status <> 'processing' or o.active_sync_run_id <> p_sync_run_id then
    raise exception 'reporting_outbox_not_processing' using errcode='P0001';
  end if;
  select * into d from public.reporting_destinations where id=o.destination_id for update;
  next_status := case when d.last_requested_sequence > p_processed_sequence then 'pending' else 'synced' end;
  update public.reporting_destinations set last_processed_sequence=greatest(last_processed_sequence,p_processed_sequence),last_sync_at=now(),last_success_at=now(),last_error=null where id=d.id;
  update public.reporting_outbox set status=next_status,processed_at=case when next_status='synced' then now() else processed_at end,locked_at=null,locked_by=null,active_sync_run_id=null,last_error=null where id=o.id;
  update public.reporting_sync_runs set status='synced',processed_sequence=p_processed_sequence,dataset_hash=left(p_dataset_hash,256),finished_at=now() where id=p_sync_run_id;
  return true;
end; $$;

create or replace function public.complete_reporting_sync_failure(
  p_outbox_id uuid,p_sync_run_id uuid,p_error_code text,p_error_message text,
  p_recoverable boolean,p_next_available_at timestamptz default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.reporting_outbox%rowtype; next_status text;
begin
  select * into o from public.reporting_outbox where id=p_outbox_id for update;
  if not found or o.status <> 'processing' or o.active_sync_run_id <> p_sync_run_id then
    raise exception 'reporting_outbox_not_processing' using errcode='P0001';
  end if;
  next_status := case when p_recoverable and o.attempts < 8 then 'retry' when p_recoverable then 'dead' else 'failed' end;
  update public.reporting_outbox set status=next_status,available_at=coalesce(p_next_available_at,now()),locked_at=null,locked_by=null,active_sync_run_id=null,last_error=left(coalesce(p_error_code,'error')||': '||coalesce(p_error_message,'sync failed'),1024) where id=o.id;
  update public.reporting_destinations set last_error=left(coalesce(p_error_code,'error')||': '||coalesce(p_error_message,'sync failed'),1024) where id=o.destination_id;
  update public.reporting_sync_runs set status=next_status,error_code=left(p_error_code,128),error_message=left(p_error_message,1024),finished_at=now() where id=p_sync_run_id;
  return true;
end; $$;

grant execute on function public.claim_reporting_sync_work(text,integer) to service_role;
revoke all on function public.claim_reporting_sync_work(text,integer) from public, authenticated, anon;
grant execute on function public.claim_reporting_sync_work(text,integer) to service_role;
