-- Activate only destinations that reached READY through automatic provisioning.
alter table public.reporting_destinations
  add column if not exists activation_state text not null default 'manual_disabled';
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.reporting_destinations'::regclass and conname='reporting_destinations_activation_state_check') then
    alter table public.reporting_destinations add constraint reporting_destinations_activation_state_check
      check (activation_state in ('auto_pending','active','manual_disabled'));
  end if;
end $$;

create or replace function public.activate_reporting_destination_automatic(p_event_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.reporting_destinations%rowtype; p public.reporting_spreadsheet_provisioning%rowtype; i public.reporting_drive_integrations%rowtype; l public.event_drive_locations%rowtype; o public.reporting_outbox%rowtype; next_sequence bigint;
begin
  select * into d from public.reporting_destinations where event_id=p_event_id and provider='google_sheets' and deleted_at is null for update;
  if not found or d.activation_state<>'auto_pending' or d.enabled then return false; end if;
  select * into p from public.reporting_spreadsheet_provisioning where destination_id=d.id and status='ready' for update;
  select * into l from public.event_drive_locations where event_id=d.event_id and organization_id=d.organization_id and status='ready' and event_drive_folder_id is not null and deleted_at is null;
  select * into i from public.reporting_drive_integrations where organization_id=d.organization_id and enabled and status='connected' and oauth_secret_id is not null and deleted_at is null;
  if not found or d.spreadsheet_id is null or l.id is null or i.id is null then return false; end if;
  update public.reporting_destinations set enabled=true,activation_state='active',last_error=null where id=d.id;
  select * into o from public.reporting_outbox where destination_id=d.id for update;
  if not found then
    next_sequence:=d.last_requested_sequence+1;
    update public.reporting_destinations set last_requested_sequence=next_sequence where id=d.id;
    insert into public.reporting_outbox(destination_id,organization_id,event_id,requested_sequence,status,available_at,attempts)
      values(d.id,d.organization_id,d.event_id,next_sequence,'pending',now(),0);
  end if;
  return true;
end; $$;
revoke all on function public.activate_reporting_destination_automatic(uuid) from public,anon,authenticated;
grant execute on function public.activate_reporting_destination_automatic(uuid) to service_role;

create or replace function public.reporting_auto_activate_ready_destination()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='ready' and (tg_op='INSERT' or old.status is distinct from new.status) then
    update public.reporting_destinations set activation_state='auto_pending'
      where event_id=new.event_id and enabled=false and deleted_at is null;
    perform public.activate_reporting_destination_automatic(new.event_id);
  end if;
  return new;
end; $$;
drop trigger if exists reporting_auto_activate_ready_destination on public.reporting_spreadsheet_provisioning;
create trigger reporting_auto_activate_ready_destination
after insert or update of status on public.reporting_spreadsheet_provisioning
for each row execute function public.reporting_auto_activate_ready_destination();

create or replace function public.set_reporting_destination_enabled(p_event_id uuid, p_enabled boolean)
returns table(id uuid,event_id uuid,provider text,spreadsheet_id text,enabled boolean,sheet_schema_version integer,writer_mode text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.reporting_destinations%rowtype;
begin
  if auth.uid() is null then raise exception 'reporting_unauthenticated' using errcode='28000'; end if;
  if not (p_event_id = any(public.current_event_ids())) then raise exception 'reporting_forbidden' using errcode='42501'; end if;
  select rd.* into d from public.reporting_destinations rd where rd.event_id=p_event_id and rd.provider='google_sheets' and rd.deleted_at is null for update;
  if not found then raise exception 'reporting_destination_not_found' using errcode='P0002'; end if;
  if not exists (select 1 from public.events e join public.profiles p on p.organization_id=e.organization_id and p.user_id=public.current_app_user_id() and p.deleted_at is null join public.roles r on r.id=p.role_id and r.deleted_at is null where e.id=p_event_id and ('event.edit'=any(r.permissions) or 'organization.manage'=any(r.permissions))) then raise exception 'reporting_forbidden' using errcode='42501'; end if;
  if p_enabled and (d.writer_mode<>'oauth_user' or d.sheet_schema_version<>2 or d.spreadsheet_id is null or not exists (select 1 from public.reporting_spreadsheet_provisioning p where p.destination_id=d.id and p.status='ready') or not exists (select 1 from public.reporting_drive_integrations i join public.events e on e.organization_id=i.organization_id where e.id=p_event_id and i.enabled and i.status='connected' and i.oauth_secret_id is not null and i.deleted_at is null)) then raise exception 'reporting_destination_not_ready' using errcode='55000'; end if;
  update public.reporting_destinations set enabled=p_enabled,activation_state=case when p_enabled then 'active' else 'manual_disabled' end,last_error=null where id=d.id returning * into d;
  return query select d.id,d.event_id,d.provider,d.spreadsheet_id,d.enabled,d.sheet_schema_version,d.writer_mode;
end; $$;
revoke all on function public.set_reporting_destination_enabled(uuid,boolean) from public,anon;
grant execute on function public.set_reporting_destination_enabled(uuid,boolean) to authenticated;

-- Reconcile the known interrupted automatic shape without touching arbitrary disabled destinations.
update public.reporting_destinations d set activation_state='auto_pending'
where d.enabled=false and d.writer_mode='oauth_user' and d.deleted_at is null
  and exists (select 1 from public.reporting_spreadsheet_provisioning p where p.destination_id=d.id and p.status='ready')
  and exists (select 1 from public.event_drive_locations l where l.event_id=d.event_id and l.organization_id=d.organization_id and l.status='ready' and l.event_drive_folder_id is not null and l.deleted_at is null)
  and not exists (select 1 from public.reporting_outbox o where o.destination_id=d.id);
