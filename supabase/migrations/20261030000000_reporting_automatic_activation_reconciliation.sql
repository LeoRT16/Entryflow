-- Dispatch interrupted automatic destination activation through the existing worker pump.
create or replace function public.reconcile_reporting_destinations_automatic(p_limit integer default 100)
returns table(destinations_considered integer, activated integer, failed integer)
language plpgsql security definer set search_path=public,pg_temp as $$
declare d record; considered integer:=0; activated_count integer:=0; failed_count integer:=0; did_activate boolean;
begin
  if p_limit < 1 or p_limit > 500 then raise exception 'reporting_invalid_activation_reconciliation_limit' using errcode='22023'; end if;
  for d in
    select rd.event_id
    from public.reporting_destinations rd
    where rd.provisioning_origin='automatic'
      and rd.activation_state='auto_pending'
      and rd.enabled=false
      and rd.deleted_at is null
    order by rd.updated_at
    limit p_limit
  loop
    considered:=considered+1;
    begin
      did_activate:=public.activate_reporting_destination_automatic(d.event_id);
      if did_activate then activated_count:=activated_count+1; end if;
    exception when others then
      failed_count:=failed_count+1;
    end;
  end loop;
  return query select considered,activated_count,failed_count;
end; $$;
revoke all on function public.reconcile_reporting_destinations_automatic(integer) from public,anon,authenticated;
grant execute on function public.reconcile_reporting_destinations_automatic(integer) to service_role;
