-- R1: persist automatic Reporting provisioning intent in the Event transaction.
create or replace function public.create_event_with_layout_atomic(
  p_id uuid, p_organization_id uuid, p_name text, p_description text, p_event_type text,
  p_status text, p_start_at text, p_end_at text, p_timezone text, p_venue_id uuid,
  p_venue text, p_capacity integer, p_enabled_modules text[], p_operational_model text,
  p_admission_methods text[], p_resource_types text[], p_icon text, p_metadata jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_event public.events%rowtype; v_layout jsonb;
begin
  if auth.uid() is null then raise exception 'event_unauthenticated' using errcode='28000'; end if;
  if not exists (select 1 from public.profiles p join public.roles r on r.id=p.role_id and r.deleted_at is null where p.user_id=public.current_app_user_id() and p.organization_id=p_organization_id and p.deleted_at is null and ('event.create'=any(r.permissions) or r.slug in ('owner','administrator'))) then raise exception 'event_forbidden' using errcode='42501'; end if;
  if p_venue_id is not null and not exists (select 1 from public.venues v where v.id=p_venue_id and v.organization_id=p_organization_id and v.deleted_at is null) then raise exception 'event_venue_organization_mismatch' using errcode='22023'; end if;
  insert into public.events(id,organization_id,name,description,event_type,status,start_at,end_at,timezone,venue_id,venue,capacity,enabled_modules,operational_model,admission_methods,resource_types,icon,metadata)
  values(p_id,p_organization_id,p_name,p_description,p_event_type,p_status,p_start_at,p_end_at,p_timezone,p_venue_id,p_venue,p_capacity,p_enabled_modules,p_operational_model,p_admission_methods,p_resource_types,p_icon,p_metadata)
  returning * into v_event;
  if p_venue_id is not null then v_layout:=public.materialize_event_layout_atomic(p_id); end if;
  if exists (select 1 from public.reporting_drive_integrations i where i.organization_id=p_organization_id and i.enabled and i.status='connected' and i.oauth_secret_id is not null and i.deleted_at is null) then
    perform public.request_drive_event_provisioning_internal(p_id,'provision_event');
  end if;
  return jsonb_build_object('event',to_jsonb(v_event),'layout',v_layout);
end; $$;
revoke all on function public.create_event_with_layout_atomic(uuid,uuid,text,text,text,text,text,text,text,uuid,text,integer,text[],text,text[],text[],text,jsonb) from public,anon;
grant execute on function public.create_event_with_layout_atomic(uuid,uuid,text,text,text,text,text,text,text,uuid,text,integer,text[],text,text[],text[],text,jsonb) to authenticated;

create or replace function public.request_reporting_spreadsheet_when_drive_ready()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='ready' and (old.status is distinct from 'ready' or old.event_drive_folder_id is distinct from new.event_drive_folder_id) then
    perform public.request_reporting_spreadsheet_provisioning(new.event_id);
  end if;
  return new;
end; $$;
drop trigger if exists event_drive_location_reporting_ready on public.event_drive_locations;
create trigger event_drive_location_reporting_ready
after update of status,event_drive_folder_id on public.event_drive_locations
for each row execute function public.request_reporting_spreadsheet_when_drive_ready();
