-- Activate only destinations that reached READY through automatic provisioning.
alter table public.reporting_destinations
  add column if not exists activation_state text not null default 'manual_disabled',
  add column if not exists provisioning_origin text not null default 'legacy_unknown';
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.reporting_destinations'::regclass and conname='reporting_destinations_activation_state_check') then
    alter table public.reporting_destinations add constraint reporting_destinations_activation_state_check
      check (activation_state in ('auto_pending','active','manual_disabled'));
  end if;
end $$;


drop function if exists public.request_reporting_spreadsheet_provisioning(uuid);

create or replace function public.request_reporting_spreadsheet_provisioning(p_event_id uuid,p_origin text default 'manual')
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
  if p_origin not in ('automatic','manual') then raise exception 'reporting_origin_invalid' using errcode='22023'; end if;
  if not found then raise exception 'reporting_event_not_found' using errcode='P0002'; end if;
  select * into l from public.event_drive_locations where event_id=e.id and organization_id=e.organization_id and deleted_at is null;
  target_revision_value:=coalesce(l.revision,1);
  folder_ready:=found and l.status='ready' and nullif(trim(l.event_drive_folder_id),'') is not null;
  select * into i from public.reporting_drive_integrations where organization_id=e.organization_id and enabled and deleted_at is null;
  integration_ready:=found and i.enabled and i.status='connected' and i.oauth_secret_id is not null;

  insert into public.reporting_destinations(organization_id,event_id,provider,enabled,spreadsheet_id,sheet_schema_version,writer_mode,provisioning_origin)
    values(e.organization_id,e.id,'google_sheets',false,null,2,'oauth_user',p_origin)
    on conflict (event_id,provider) where deleted_at is null do nothing;
  select * into d from public.reporting_destinations where event_id=e.id and provider='google_sheets' and deleted_at is null for update;

  if d.writer_mode='service_account' and d.spreadsheet_id is not null then
    target_state:='needs_action'; err:='legacy_destination_requires_review';
  elsif d.writer_mode='service_account' and exists (select 1 from public.reporting_outbox ro where ro.destination_id=d.id) then
    target_state:='needs_action'; err:='legacy_sync_history_requires_review';
  elsif exists (select 1 from public.reporting_outbox ro where ro.destination_id=d.id and ro.status='processing') then
    target_state:='needs_action'; err:='legacy_writer_active';
  else
    update public.reporting_destinations set enabled=false,writer_mode='oauth_user',sheet_schema_version=2,provisioning_origin=case when d.provisioning_origin='legacy_unknown' then p_origin else d.provisioning_origin end where id=d.id;
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
revoke all on function public.request_reporting_spreadsheet_provisioning(uuid,text) from public,anon,authenticated;
grant execute on function public.request_reporting_spreadsheet_provisioning(uuid,text) to service_role;


create or replace function public.activate_reporting_destination_automatic(p_event_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.reporting_destinations%rowtype; p public.reporting_spreadsheet_provisioning%rowtype; i public.reporting_drive_integrations%rowtype; l public.event_drive_locations%rowtype; o public.reporting_outbox%rowtype; next_sequence bigint;
begin
  select * into d from public.reporting_destinations where event_id=p_event_id and provider='google_sheets' and deleted_at is null for update;
  if not found or d.provisioning_origin<>'automatic' or d.activation_state<>'auto_pending' or d.enabled then return false; end if;
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
      where event_id=new.event_id and enabled=false and provisioning_origin='automatic' and deleted_at is null;
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

-- One-time, assertion-based promotion of the controlled R1 rollout fixture.
do $$ declare n integer; begin
  select count(*) into n from public.reporting_destinations d join public.events e on e.id=d.event_id and e.organization_id=d.organization_id join public.reporting_spreadsheet_provisioning p on p.destination_id=d.id and p.event_id=e.id join public.event_drive_locations l on l.event_id=e.id and l.organization_id=e.organization_id where d.id='7e2dbbdd-af47-4b1a-856b-6edb07cf125c' and d.event_id='eb2a26ec-3b07-48d5-b407-616d7224f483' and d.organization_id='02cf45fb-25fe-4287-be1f-71154bb102b3' and d.enabled=false and d.deleted_at is null and p.status='ready' and l.status='ready' and l.event_drive_folder_id is not null and not exists (select 1 from public.reporting_outbox o where o.destination_id=d.id);
  if n<>1 then raise exception 'reporting_r1_fixture_state_mismatch'; end if;
  update public.reporting_destinations set provisioning_origin='automatic',activation_state='auto_pending' where id='7e2dbbdd-af47-4b1a-856b-6edb07cf125c';
end $$;

-- Future reconciliation is provenance-gated; ambiguous legacy rows remain untouched.
update public.reporting_destinations d set activation_state='auto_pending'
where d.enabled=false and d.writer_mode='oauth_user' and d.provisioning_origin='automatic' and d.activation_state='auto_pending' and d.deleted_at is null
  and exists (select 1 from public.reporting_spreadsheet_provisioning p where p.destination_id=d.id and p.status='ready')
  and exists (select 1 from public.event_drive_locations l where l.event_id=d.event_id and l.organization_id=d.organization_id and l.status='ready' and l.event_drive_folder_id is not null and l.deleted_at is null)
  and not exists (select 1 from public.reporting_outbox o where o.destination_id=d.id);
