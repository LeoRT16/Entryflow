-- Phase 5D.1: rotate credential material without replacing the entitlement.
create or replace function public.rotate_guest_access_credential_atomic(p_guest_id uuid)
returns table(guest_id uuid, access_grant_id uuid, access_code text, qr_token text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  g public.guests%rowtype;
  e public.accreditation_enrollments%rowtype;
  a public.accreditation_access_grants%rowtype;
  v_code text;
  v_token text;
  v_actor text;
begin
  if auth.uid() is null then raise exception 'access_rotation_unauthenticated' using errcode='28000'; end if;
  select * into g from public.guests where id=p_guest_id and deleted_at is null for update;
  if not found then raise exception 'access_rotation_guest_not_found' using errcode='P0002'; end if;
  select * into e from public.accreditation_enrollments where reservation_guest_id=g.id and event_id=g.event_id and deleted_at is null for update;
  if not found or e.status <> 'active' then raise exception 'access_rotation_enrollment_invalid' using errcode='55000'; end if;
  if not public.is_platform_root() and not exists (
    select 1 from public.profiles p join public.roles r on r.id=p.role_id
    where p.user_id=public.current_app_user_id() and p.organization_id=e.organization_id
      and p.deleted_at is null and r.deleted_at is null and 'access.issue'=any(r.permissions)
  ) then raise exception 'access_rotation_forbidden' using errcode='42501'; end if;
  if g.admission_status = 'Ingresó' or g.reservation_status = 'Cancelled' or g.admission_status = 'Anulada' then
    raise exception 'access_rotation_guest_ineligible' using errcode='55000';
  end if;
  select * into a from public.accreditation_access_grants where enrollment_id=e.id for update;
  if not found or a.status <> 'active' then raise exception 'access_rotation_grant_ineligible' using errcode='55000'; end if;
  if exists (select 1 from public.accreditation_checkins where access_grant_id=a.id)
     or exists (
       select 1
       from public.checkins as ci
       where ci.guest_id = g.id
         and ci.access_grant_id = a.id
         and ci.deleted_at is null
         and ci.status in ('Checked In', 'Checked Out', 'Completed')
     ) then
    raise exception 'access_rotation_already_consumed' using errcode='55000';
  end if;
  v_code := 'ACC-' || upper(substr(encode(gen_random_bytes(6),'hex'),1,10));
  v_token := 'qr_' || encode(gen_random_bytes(24),'hex');
  update public.accreditation_access_grants
  set access_code=v_code, qr_token=v_token, updated_at=now()
  where id=a.id;
  select coalesce(nullif(trim(u.display_name),''),'Operación') into v_actor
  from public.users u where u.id=public.current_app_user_id() and u.deleted_at is null;
  insert into public.timeline_events(id,event_id,timestamp,kind,icon,tone,title,description,reservation_id,reservation_code,reservation_name,guest_id,guest_name,metadata)
  values(gen_random_uuid(),g.event_id,to_char(now(),'HH24:MI'),'access.credential_rotated','key','warning','Credencial rotada','Se reemplazó la credencial de acceso sin cambiar la identidad del invitado.',g.reservation_id::text,g.reservation_code,g.reservation_name,g.id::text,g.guest_name,jsonb_build_object('actor',coalesce(v_actor,'Operación'),'context',g.event_name,'target',g.guest_name,'guestId',g.id,'accessGrantId',a.id));
  return query select g.id,a.id,v_code,v_token;
end; $$;
revoke all on function public.rotate_guest_access_credential_atomic(uuid) from public,anon,service_role;
grant execute on function public.rotate_guest_access_credential_atomic(uuid) to authenticated;
