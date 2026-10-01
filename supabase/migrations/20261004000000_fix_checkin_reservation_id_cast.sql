-- Correct the text-to-uuid reservation boundary in the atomic check-in RPC.
create or replace function public.persist_completed_checkin_atomic(
  p_guest_id uuid,
  p_access_grant_id uuid,
  p_operator_profile_id uuid,
  p_source text,
  p_method text,
  p_operator text,
  p_gate text,
  p_checked_in_at text,
  p_notes text,
  p_audit_trail jsonb,
  p_timeline jsonb
)
returns table(guest_id uuid, checkin_id uuid, enrollment_id uuid, access_grant_id uuid, admission_status text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.guests%rowtype; e public.accreditation_enrollments%rowtype; a public.accreditation_access_grants%rowtype; c public.checkins%rowtype; ac public.accreditation_checkins%rowtype; t jsonb;
begin
  if auth.uid() is null then raise exception 'checkin_unauthenticated' using errcode='28000'; end if;
  if p_source not in ('qr','manual_code') then raise exception 'checkin_source_invalid' using errcode='22023'; end if;
  select * into g from public.guests where id=p_guest_id and deleted_at is null for update;
  if not found then raise exception 'checkin_guest_not_found' using errcode='P0002'; end if;
  select * into e from public.accreditation_enrollments where reservation_guest_id=g.id and event_id=g.event_id and deleted_at is null for update;
  if not found or e.status <> 'active' then raise exception 'checkin_enrollment_invalid' using errcode='55000'; end if;
  select ag.* into a from public.accreditation_access_grants as ag where ag.id=p_access_grant_id and ag.enrollment_id=e.id and ag.event_id=g.event_id for update;
  if not found or a.status <> 'active' then raise exception 'checkin_grant_invalid' using errcode='55000'; end if;
  if not public.accreditation_checkin_belongs_to_scope(e.organization_id,e.event_id)
     or not public.accreditation_checkin_operator_is_authorized(e.organization_id,p_operator_profile_id)
     then raise exception 'checkin_out_of_scope' using errcode='42501'; end if;
  if g.admission_status = 'Ingresó' then raise exception 'checkin_already_admitted' using errcode='55000'; end if;
  select aci.* into ac from public.accreditation_checkins as aci where aci.access_grant_id=a.id for update;
  if found then raise exception 'checkin_already_consumed' using errcode='23505'; end if;
  select ci.* into c from public.checkins as ci where ci.access_grant_id=a.id and ci.deleted_at is null for update;
  if found then
    if c.guest_id <> g.id or c.event_id <> g.event_id or c.status <> 'Checked In' then raise exception 'checkin_partial_incompatible' using errcode='55000'; end if;
  else
    c.id := gen_random_uuid();
    insert into public.checkins(id,guest_id,reservation_id,event_id,access_grant_id,access_type,method,checked_in_at,operator,gate,notes,audit_trail,status,source)
      values(c.id,g.id,g.reservation_id::uuid,g.event_id,a.id,'manual',p_method,p_checked_in_at,p_operator,p_gate,p_notes,coalesce(p_audit_trail,'[]'::jsonb),'Checked In',p_source)
      returning * into c;
  end if;
  insert into public.accreditation_checkins(organization_id,event_id,enrollment_id,access_grant_id,operator_profile_id,source,metadata)
    values(e.organization_id,e.event_id,e.id,a.id,p_operator_profile_id,p_source,jsonb_build_object('legacyCheckinId',c.id,'method',p_method));
  update public.guests set admission_status='Ingresó', qr_status='Usado', reservation_status='Checked In', check_in_time=p_checked_in_at, check_in_method=p_method, gate=p_gate, manual_admission=(p_method='Manual'), updated_at=now() where id=g.id;
  t := coalesce(p_timeline,'{}'::jsonb);
  insert into public.timeline_events(id,event_id,timestamp,kind,icon,tone,title,description,reservation_id,reservation_code,reservation_name,guest_id,guest_name,table_id,table_name,metadata)
    values(coalesce((t->>'id')::uuid,gen_random_uuid()),g.event_id,coalesce(t->>'timestamp',p_checked_in_at),coalesce(t->>'kind','access.checked_in'),coalesce(t->>'icon','checkin'),coalesce(t->>'tone','success'),coalesce(t->>'title','Check-in manual'),coalesce(t->>'description',p_notes),g.reservation_id::text,g.reservation_code,g.reservation_name,g.id::text,g.guest_name,g.table_id,g.table_name,coalesce(t->'metadata','{}'::jsonb));
  return query select g.id,c.id,e.id,a.id,'Ingresó'::text;
end; $$;
revoke all on function public.persist_completed_checkin_atomic(uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.persist_completed_checkin_atomic(uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb) to authenticated,service_role;
