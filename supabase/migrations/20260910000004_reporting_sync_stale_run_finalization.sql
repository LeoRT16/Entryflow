-- Finalize the previous run atomically when a lease is reclaimed.
create or replace function public.claim_reporting_sync_work(p_worker_id text, p_limit integer default 1)
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
    if o.status='processing' and o.locked_at < now()-interval '5 minutes'
       and o.active_sync_run_id is not null then
      update public.reporting_sync_runs
      set status='failed', finished_at=now(), error_code='worker_lease_expired',
          error_message='Worker lease expired before completion.'
      where reporting_sync_runs.id=o.active_sync_run_id
        and reporting_sync_runs.destination_id=o.destination_id
        and reporting_sync_runs.event_id=o.event_id
        and reporting_sync_runs.status='processing';
    end if;
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

revoke all on function public.claim_reporting_sync_work(text,integer) from public, authenticated, anon;
grant execute on function public.claim_reporting_sync_work(text,integer) to service_role;
