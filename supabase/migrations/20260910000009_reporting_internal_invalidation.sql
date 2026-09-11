create or replace function public.request_reporting_sync_internal(p_event_id uuid)
returns table(outbox_id uuid, destination_id uuid, requested_sequence bigint)
language plpgsql security definer set search_path = public, pg_temp as $function$
#variable_conflict use_column
declare d public.reporting_destinations%rowtype; o public.reporting_outbox%rowtype; next_sequence bigint;
begin
  select * into d from public.reporting_destinations rd where rd.event_id=p_event_id and rd.provider='google_sheets' and rd.enabled and rd.deleted_at is null and nullif(trim(rd.spreadsheet_id),'') is not null for update;
  if not found then return; end if;
  next_sequence := d.last_requested_sequence + 1;
  update public.reporting_destinations rd set last_requested_sequence=next_sequence,last_error=null where rd.id=d.id;
  insert into public.reporting_outbox(destination_id,organization_id,event_id,requested_sequence,status,available_at,attempts,last_error,locked_at,locked_by,processed_at,active_sync_run_id)
    values(d.id,d.organization_id,d.event_id,next_sequence,'pending',now(),0,null,null,null,null,null)
  on conflict (destination_id) do update set requested_sequence=excluded.requested_sequence,status='pending',available_at=now(),last_error=null,locked_at=null,locked_by=null,active_sync_run_id=null;
  select * into o from public.reporting_outbox ob where ob.destination_id=d.id;
  return query select o.id,d.id,o.requested_sequence;
end; $function$;

create or replace function public.request_reporting_sync(p_event_id uuid)
returns table(outbox_id uuid, destination_id uuid, requested_sequence bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'reporting_unauthenticated' using errcode='28000'; end if;
  if not (p_event_id = any(public.current_event_ids())) then raise exception 'reporting_forbidden' using errcode='42501'; end if;
  if not exists (select 1 from public.events e join public.profiles p on p.organization_id=e.organization_id and p.user_id=public.current_app_user_id() and p.deleted_at is null join public.roles r on r.id=p.role_id and r.deleted_at is null where e.id=p_event_id and ('event.edit'=any(r.permissions) or 'organization.manage'=any(r.permissions))) then raise exception 'reporting_forbidden' using errcode='42501'; end if;
  return query select * from public.request_reporting_sync_internal(p_event_id);
end; $$;
revoke all on function public.request_reporting_sync_internal(uuid) from public, authenticated, anon;
grant execute on function public.request_reporting_sync_internal(uuid) to service_role;
revoke all on function public.request_reporting_sync(uuid) from public, anon;
grant execute on function public.request_reporting_sync(uuid) to authenticated;
