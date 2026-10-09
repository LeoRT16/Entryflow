-- Preserve active reporting leases when admission invalidates a destination.
create or replace function public.request_reporting_sync_internal(p_event_id uuid)
returns table(outbox_id uuid, destination_id uuid, requested_sequence bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.reporting_destinations%rowtype; o public.reporting_outbox%rowtype; next_sequence bigint;
begin
  select * into d from public.reporting_destinations rd
    where rd.event_id=p_event_id and rd.provider='google_sheets' and rd.enabled and rd.deleted_at is null
      and nullif(trim(rd.spreadsheet_id),'') is not null for update;
  if not found then return; end if;
  next_sequence := d.last_requested_sequence + 1;
  update public.reporting_destinations set last_requested_sequence=next_sequence,last_error=null where id=d.id;
  insert into public.reporting_outbox(destination_id,organization_id,event_id,requested_sequence,status,available_at,attempts,last_error,locked_at,locked_by,processed_at,active_sync_run_id)
    values(d.id,d.organization_id,d.event_id,next_sequence,'pending',now(),0,null,null,null,null,null)
  on conflict on constraint reporting_outbox_destination_id_key do update set
    requested_sequence=excluded.requested_sequence,
    status=case when public.reporting_outbox.status='processing' then public.reporting_outbox.status else 'pending' end,
    available_at=case when public.reporting_outbox.status='processing' then public.reporting_outbox.available_at else now() end,
    attempts=case when public.reporting_outbox.status='processing' then public.reporting_outbox.attempts else 0 end,
    last_error=null,
    locked_at=case when public.reporting_outbox.status='processing' then public.reporting_outbox.locked_at else null end,
    locked_by=case when public.reporting_outbox.status='processing' then public.reporting_outbox.locked_by else null end,
    active_sync_run_id=case when public.reporting_outbox.status='processing' then public.reporting_outbox.active_sync_run_id else null end,
    processed_at=case when public.reporting_outbox.status='processing' then public.reporting_outbox.processed_at else null end;
  select * into o from public.reporting_outbox ob where ob.destination_id=d.id;
  return query select o.id,d.id,o.requested_sequence;
end; $$;

-- The authenticated OAuth request follows the same lease-preserving coalescing rule.
create or replace function public.request_reporting_oauth_sync(p_event_id uuid)
returns table(outbox_id uuid,destination_id uuid,requested_sequence bigint)
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.reporting_destinations%rowtype; o public.reporting_outbox%rowtype; next_sequence bigint;
begin
  if auth.uid() is null then raise exception 'reporting_unauthenticated' using errcode='28000'; end if;
  select rd.* into d from public.reporting_destinations rd where rd.event_id=p_event_id and rd.provider='google_sheets' and rd.enabled and rd.deleted_at is null for update;
  if not found or d.writer_mode<>'oauth_user' or d.sheet_schema_version<>2 then raise exception 'reporting_oauth_destination_not_ready' using errcode='55000'; end if;
  if not (p_event_id=any(public.current_event_ids())) then raise exception 'reporting_forbidden' using errcode='42501'; end if;
  if not exists (select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.user_id=public.current_app_user_id() and p.organization_id=d.organization_id and p.deleted_at is null and r.deleted_at is null and ('event.edit'=any(r.permissions) or 'organization.manage'=any(r.permissions))) then raise exception 'reporting_forbidden' using errcode='42501'; end if;
  if not exists (select 1 from public.reporting_drive_integrations i where i.organization_id=d.organization_id and i.enabled and i.status='connected' and i.oauth_secret_id is not null and i.deleted_at is null)
     or not exists (select 1 from public.reporting_spreadsheet_provisioning p where p.destination_id=d.id and p.status='ready') then
    raise exception 'reporting_oauth_destination_not_ready' using errcode='55000';
  end if;
  next_sequence:=d.last_requested_sequence+1;
  update public.reporting_destinations set last_requested_sequence=next_sequence,last_error=null where id=d.id;
  insert into public.reporting_outbox(destination_id,organization_id,event_id,requested_sequence,status,available_at,attempts,last_error,locked_at,locked_by,processed_at,active_sync_run_id)
    values(d.id,d.organization_id,d.event_id,next_sequence,'pending',now(),0,null,null,null,null,null)
  on conflict on constraint reporting_outbox_destination_id_key do update set requested_sequence=excluded.requested_sequence,status=case when public.reporting_outbox.status='processing' then public.reporting_outbox.status else 'pending' end,available_at=case when public.reporting_outbox.status='processing' then public.reporting_outbox.available_at else now() end,attempts=case when public.reporting_outbox.status='processing' then public.reporting_outbox.attempts else 0 end,last_error=null,locked_at=case when public.reporting_outbox.status='processing' then public.reporting_outbox.locked_at else null end,locked_by=case when public.reporting_outbox.status='processing' then public.reporting_outbox.locked_by else null end,active_sync_run_id=case when public.reporting_outbox.status='processing' then public.reporting_outbox.active_sync_run_id else null end,processed_at=case when public.reporting_outbox.status='processing' then public.reporting_outbox.processed_at else null end;
  select * into o from public.reporting_outbox ob where ob.destination_id=d.id;
  return query select o.id,d.id,o.requested_sequence;
end; $$;

-- Enforce terminal event protection at the authoritative admission boundary.
create or replace function public.enforce_admission_event_open()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare event_status text;
begin
  if new.admission_status is distinct from old.admission_status
     or new.check_in_time is distinct from old.check_in_time
     or new.check_in_method is distinct from old.check_in_method then
    select e.status into event_status from public.events e where e.id=new.event_id and e.deleted_at is null for update;
    if event_status in ('finished','cancelled') then raise exception 'checkin_event_terminal' using errcode='55000'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guests_admission_event_open on public.guests;
create trigger guests_admission_event_open
before update of admission_status, check_in_time, check_in_method on public.guests
for each row execute function public.enforce_admission_event_open();
revoke all on function public.enforce_admission_event_open() from public, anon, authenticated;

drop function if exists public.persist_completed_checkin_atomic(uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text);
create or replace function public.persist_completed_checkin_atomic(
  p_guest_id uuid,p_access_grant_id uuid,p_operator_profile_id uuid,p_source text,p_method text,p_operator text,p_gate text,p_checked_in_at text,p_notes text,p_audit_trail jsonb,p_timeline jsonb,p_presented_credential text,p_credential_kind text)
returns table(guest_id uuid,checkin_id uuid,enrollment_id uuid,access_grant_id uuid,admission_status text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.guests%rowtype; e public.accreditation_enrollments%rowtype; a public.accreditation_access_grants%rowtype; c public.checkins%rowtype; ac public.accreditation_checkins%rowtype; ev public.events%rowtype; t jsonb;
begin
  if auth.uid() is null then raise exception 'checkin_unauthenticated' using errcode='28000'; end if;
  if p_source not in ('qr','manual_code') then raise exception 'checkin_source_invalid' using errcode='22023'; end if;
  select * into g from public.guests where id=p_guest_id and deleted_at is null for update;
  if not found then raise exception 'checkin_guest_not_found' using errcode='P0002'; end if;
  select * into ev from public.events where id=g.event_id and deleted_at is null for update;
  if not found or ev.status in ('finished','cancelled') then raise exception 'checkin_event_terminal' using errcode='55000'; end if;
  select * into e from public.accreditation_enrollments where reservation_guest_id=g.id and event_id=g.event_id and deleted_at is null for update;
  if not found or e.status <> 'active' then raise exception 'checkin_enrollment_invalid' using errcode='55000'; end if;
  select ag.* into a from public.accreditation_access_grants ag where ag.id=p_access_grant_id and ag.enrollment_id=e.id and ag.event_id=g.event_id for update;
  if not found or a.status <> 'active' then raise exception 'checkin_grant_invalid' using errcode='55000'; end if;
  if not public.accreditation_checkin_belongs_to_scope(e.organization_id,e.event_id) or not public.accreditation_checkin_operator_is_authorized(e.organization_id,p_operator_profile_id) then raise exception 'checkin_out_of_scope' using errcode='42501'; end if;
  if g.admission_status = 'Ingresó' then raise exception 'checkin_already_admitted' using errcode='55000'; end if;
  select aci.* into ac from public.accreditation_checkins aci where aci.access_grant_id=a.id for update;
  if found then raise exception 'checkin_already_consumed' using errcode='23505'; end if;
  if p_credential_kind not in ('qr_token','access_code','manual') then raise exception 'checkin_credential_kind_invalid' using errcode='22023'; end if;
  if p_credential_kind in ('qr_token','access_code') and nullif(trim(coalesce(p_presented_credential,'')),'') is null then raise exception 'checkin_credential_invalid' using errcode='55000'; end if;
  if p_credential_kind='qr_token' and p_presented_credential<>a.qr_token then raise exception 'checkin_credential_invalid' using errcode='55000'; end if;
  if p_credential_kind='access_code' and p_presented_credential<>a.access_code then raise exception 'checkin_credential_invalid' using errcode='55000'; end if;
  select ci.* into c from public.checkins ci where ci.access_grant_id=a.id and ci.deleted_at is null for update;
  if found then if c.guest_id<>g.id or c.event_id<>g.event_id or c.status<>'Checked In' then raise exception 'checkin_partial_incompatible' using errcode='55000'; end if; else c.id:=gen_random_uuid(); insert into public.checkins(id,guest_id,reservation_id,event_id,access_grant_id,access_type,method,checked_in_at,operator,gate,notes,audit_trail,status,source) values(c.id,g.id,g.reservation_id::uuid,g.event_id,a.id,'manual',p_method,p_checked_in_at,p_operator,p_gate,p_notes,coalesce(p_audit_trail,'[]'::jsonb),'Checked In',p_source) returning * into c; end if;
  insert into public.accreditation_checkins(organization_id,event_id,enrollment_id,access_grant_id,operator_profile_id,source,metadata) values(e.organization_id,e.event_id,e.id,a.id,p_operator_profile_id,p_source,jsonb_build_object('legacyCheckinId',c.id,'method',p_method));
  update public.guests set admission_status='Ingresó',qr_status='Usado',reservation_status='Checked In',check_in_time=p_checked_in_at,check_in_method=p_method,gate=p_gate,manual_admission=(p_method='Manual'),updated_at=now() where id=g.id;
  t:=coalesce(p_timeline,'{}'::jsonb); insert into public.timeline_events(id,event_id,timestamp,kind,icon,tone,title,description,reservation_id,reservation_code,reservation_name,guest_id,guest_name,table_id,table_name,metadata) values(coalesce((t->>'id')::uuid,gen_random_uuid()),g.event_id,coalesce(t->>'timestamp',p_checked_in_at),coalesce(t->>'kind','access.checked_in'),coalesce(t->>'icon','checkin'),coalesce(t->>'tone','success'),coalesce(t->>'title','Check-in manual'),coalesce(t->>'description',p_notes),g.reservation_id::text,g.reservation_code,g.reservation_name,g.id::text,g.guest_name,g.table_id,g.table_name,coalesce(t->'metadata','{}'::jsonb));
  return query select g.id,c.id,e.id,a.id,'Ingresó'::text;
end; $$;
revoke all on function public.persist_completed_checkin_atomic(uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text) from public,anon;
grant execute on function public.persist_completed_checkin_atomic(uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text) to authenticated,service_role;
