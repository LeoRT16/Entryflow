-- Correct the bridge scope membership predicate for environments where the
-- original bridge migration has already been applied.  `<> ANY(array)` means
-- "different from at least one element", not "not contained in the array".
create or replace function public.prepare_guest_access_atomic(
  p_guest_id uuid,
  p_access_code text,
  p_qr_token text
)
returns table(enrollment_id uuid, access_grant_id uuid, access_code text, qr_token text, grant_status text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  g public.guests%rowtype;
  ev public.events%rowtype;
  e public.accreditation_enrollments%rowtype;
  a public.accreditation_access_grants%rowtype;
begin
  if auth.uid() is null then raise exception 'access_unauthenticated' using errcode='28000'; end if;
  if nullif(trim(p_access_code),'') is null or nullif(trim(p_qr_token),'') is null then
    raise exception 'access_credential_required' using errcode='22023';
  end if;
  select * into g from public.guests where id=p_guest_id and deleted_at is null for update;
  select * into ev from public.events where id=g.event_id and deleted_at is null;
  if not found
    or not (ev.organization_id = any(public.current_organization_ids()))
    or not (g.event_id = any(public.current_event_ids())) then
    raise exception 'access_guest_out_of_scope' using errcode='42501';
  end if;
  select * into e from public.accreditation_enrollments
    where reservation_guest_id=g.id and organization_id=ev.organization_id and event_id=g.event_id and deleted_at is null for update;
  if not found then
    insert into public.accreditation_enrollments(
      organization_id,event_id,name,phone,status,metadata,reservation_guest_id
    ) values (
      ev.organization_id,g.event_id,g.guest_name,g.whatsapp,'active',jsonb_build_object('reservationId',g.reservation_id,'guestId',g.id),g.id
    ) returning * into e;
  elsif e.status <> 'active' then
    raise exception 'access_enrollment_not_active' using errcode='55000';
  end if;
  select ag.* into a from public.accreditation_access_grants as ag where ag.enrollment_id=e.id for update;
  if found and a.status <> 'active' then
    raise exception 'access_grant_revoked' using errcode='55000';
  end if;
  if not found then
    insert into public.accreditation_access_grants(
      organization_id,event_id,enrollment_id,access_code,qr_token,status,metadata
    ) values (
      ev.organization_id,g.event_id,e.id,trim(p_access_code),trim(p_qr_token),'active',jsonb_build_object('reservationId',g.reservation_id,'guestId',g.id)
    ) returning * into a;
  elsif a.access_code <> trim(p_access_code) or a.qr_token <> trim(p_qr_token) then
    raise exception 'access_credential_identity_conflict' using errcode='55000';
  end if;
  return query select e.id,a.id,a.access_code,a.qr_token,a.status;
end; $$;

revoke all on function public.prepare_guest_access_atomic(uuid,text,text) from public,anon;
grant execute on function public.prepare_guest_access_atomic(uuid,text,text) to authenticated,service_role;
