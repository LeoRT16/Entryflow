create or replace function public.upsert_reporting_destination(
  p_event_id uuid, p_spreadsheet_id text, p_enabled boolean default true)
returns table(id uuid, event_id uuid, provider text, spreadsheet_id text,
  enabled boolean, sheet_schema_version integer, last_requested_sequence bigint,
  last_processed_sequence bigint, last_sync_at timestamptz, last_success_at timestamptz,
  last_error text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.reporting_destinations%rowtype;
begin
  if nullif(trim(p_spreadsheet_id),'') is null then raise exception 'reporting_spreadsheet_required' using errcode='22023'; end if;
  if not (p_event_id = any(public.current_event_ids())) then raise exception 'reporting_forbidden' using errcode='42501'; end if;
  if not exists (select 1 from public.events e join public.profiles p on p.organization_id=e.organization_id and p.user_id=public.current_app_user_id() and p.deleted_at is null join public.roles r on r.id=p.role_id and r.deleted_at is null where e.id=p_event_id and ('event.edit'=any(r.permissions) or 'organization.manage'=any(r.permissions))) then raise exception 'reporting_forbidden' using errcode='42501'; end if;
  insert into public.reporting_destinations(organization_id,event_id,provider,spreadsheet_id,enabled,sheet_schema_version)
    select e.organization_id,p_event_id,'google_sheets',trim(p_spreadsheet_id),coalesce(p_enabled,true),1 from public.events e where e.id=p_event_id
  on conflict (event_id,provider) where deleted_at is null do update set spreadsheet_id=excluded.spreadsheet_id, enabled=excluded.enabled, sheet_schema_version=1;
  select * into d from public.reporting_destinations where event_id=p_event_id and provider='google_sheets' and deleted_at is null;
  return query select d.id,d.event_id,d.provider,d.spreadsheet_id,d.enabled,d.sheet_schema_version,d.last_requested_sequence,d.last_processed_sequence,d.last_sync_at,d.last_success_at,d.last_error;
end; $$;
revoke all on function public.upsert_reporting_destination(uuid,text,boolean) from public, anon;
grant execute on function public.upsert_reporting_destination(uuid,text,boolean) to authenticated;
