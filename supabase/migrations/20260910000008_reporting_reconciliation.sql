create or replace function public.request_reporting_reconciliation(p_limit integer default 100)
returns table(destinations_considered integer, requested integer, failed integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare d record; considered integer := 0; requested_count integer := 0; failed_count integer := 0;
begin
  if p_limit < 1 or p_limit > 500 then raise exception 'reporting_invalid_reconciliation_limit' using errcode='22023'; end if;
  for d in select rd.id from public.reporting_destinations rd where rd.enabled and rd.deleted_at is null and nullif(trim(rd.spreadsheet_id),'') is not null order by rd.updated_at limit p_limit loop
    considered := considered + 1;
    begin
      perform public.request_reporting_sync_for_destination(d.id);
      requested_count := requested_count + 1;
    exception when others then failed_count := failed_count + 1;
    end;
  end loop;
  return query select considered, requested_count, failed_count;
end; $$;

-- Internal helper avoids requiring an authenticated browser session.
create or replace function public.request_reporting_sync_for_destination(p_destination_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.reporting_destinations%rowtype; next_sequence bigint;
begin
  select * into d from public.reporting_destinations where id=p_destination_id and enabled and deleted_at is null and nullif(trim(spreadsheet_id),'') is not null for update;
  if not found then raise exception 'reporting_destination_not_found'; end if;
  next_sequence := d.last_requested_sequence + 1;
  update public.reporting_destinations set last_requested_sequence=next_sequence,last_error=null where id=d.id;
  insert into public.reporting_outbox(destination_id,organization_id,event_id,requested_sequence,status,available_at,attempts)
    values(d.id,d.organization_id,d.event_id,next_sequence,'pending',now(),0)
  on conflict (destination_id) do update set requested_sequence=excluded.requested_sequence,status='pending',available_at=now(),last_error=null,locked_at=null,locked_by=null,active_sync_run_id=null;
  return true;
end; $$;
revoke all on function public.request_reporting_reconciliation(integer) from public, authenticated, anon;
grant execute on function public.request_reporting_reconciliation(integer) to service_role;
revoke all on function public.request_reporting_sync_for_destination(uuid) from public, authenticated, anon;
grant execute on function public.request_reporting_sync_for_destination(uuid) to service_role;
