-- Authenticated activation boundary for existing reporting destinations.
create or replace function public.set_reporting_destination_enabled(p_event_id uuid, p_enabled boolean)
returns table(id uuid,event_id uuid,provider text,spreadsheet_id text,enabled boolean,sheet_schema_version integer,writer_mode text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.reporting_destinations%rowtype;
begin
  if auth.uid() is null then raise exception 'reporting_unauthenticated' using errcode='28000'; end if;
  if not (p_event_id = any(public.current_event_ids())) then raise exception 'reporting_forbidden' using errcode='42501'; end if;
  select rd.* into d from public.reporting_destinations rd
    where rd.event_id=p_event_id and rd.provider='google_sheets' and rd.deleted_at is null for update;
  if not found then raise exception 'reporting_destination_not_found' using errcode='P0002'; end if;
  if not exists (
    select 1 from public.events e join public.profiles p on p.organization_id=e.organization_id and p.user_id=public.current_app_user_id() and p.deleted_at is null
      join public.roles r on r.id=p.role_id and r.deleted_at is null
    where e.id=p_event_id and ('event.edit'=any(r.permissions) or 'organization.manage'=any(r.permissions))
  ) then raise exception 'reporting_forbidden' using errcode='42501'; end if;
  if p_enabled and d.writer_mode='oauth_user' then
    if d.sheet_schema_version<>2 or d.spreadsheet_id is null
      or not exists (select 1 from public.reporting_spreadsheet_provisioning p where p.destination_id=d.id and p.status='ready')
      or not exists (select 1 from public.reporting_drive_integrations i join public.events e on e.organization_id=i.organization_id where e.id=p_event_id and i.enabled and i.status='connected' and i.oauth_secret_id is not null and i.deleted_at is null)
    then raise exception 'reporting_destination_not_ready' using errcode='55000'; end if;
  end if;
  update public.reporting_destinations rd set enabled=p_enabled, last_error=null where rd.id=d.id returning rd.* into d;
  return query select d.id,d.event_id,d.provider,d.spreadsheet_id,d.enabled,d.sheet_schema_version,d.writer_mode;
end; $$;
revoke all on function public.set_reporting_destination_enabled(uuid,boolean) from public,anon;
grant execute on function public.set_reporting_destination_enabled(uuid,boolean) to authenticated;
