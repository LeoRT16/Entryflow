-- Correct Cortesía append timeline metadata from the persisted access grant.
create or replace function public.add_courtesy_guest_atomic(p_reservation_id uuid, p_guest jsonb, p_access_event jsonb)
returns public.guests language plpgsql security definer set search_path=public,pg_temp as $$
declare r reservations%rowtype; e events%rowtype; g guests%rowtype; access_code text; qr_token text; timeline_id uuid; grant_id uuid; canonical_code text; canonical_qr text;
begin
 if auth.uid() is null then raise exception 'guest_unauthenticated' using errcode='28000'; end if;
 select * into r from reservations where id=p_reservation_id and deleted_at is null for update;
 if not found or r.reservation_type <> 'Cortesía' then raise exception 'courtesy_not_found' using errcode='P0002'; end if;
 select * into e from events where id=r.event_id and deleted_at is null;
 if not public.is_platform_root() and not exists(select 1 from profiles p join roles ro on ro.id=p.role_id and ro.deleted_at is null where p.user_id=current_app_user_id() and p.organization_id=e.organization_id and p.deleted_at is null and 'reservation.edit'=any(ro.permissions)) then raise exception 'reservation_forbidden' using errcode='42501'; end if;
 if r.status in ('Cancelled','Completed','No Show') or e.status in ('finished','completed') then raise exception 'reservation_closed' using errcode='22023'; end if;
 if nullif(trim(p_guest->>'guest_name'),'') is null or nullif(trim(p_guest->>'carnet'),'') is null or nullif(trim(p_guest->>'whatsapp'),'') is null then raise exception 'courtesy_guest_incomplete' using errcode='22023'; end if;
 g:=public.create_guest_with_access_ordinal(r.id,p_guest); access_code:='ACC-'||encode(extensions.gen_random_bytes(6),'hex'); qr_token:='qr_'||encode(extensions.gen_random_bytes(24),'hex'); perform * from public.prepare_guest_access_atomic(g.id,access_code,qr_token); update reservations set guest_ids=array_append(coalesce(guest_ids,'{}'),g.id::text),updated_at=now() where id=r.id;
 select ag.id,ag.access_code,ag.qr_token,guest_row.invitation_code into grant_id,access_code,canonical_qr,canonical_code from accreditation_enrollments ae join accreditation_access_grants ag on ag.enrollment_id=ae.id and ag.status='active' join guests guest_row on guest_row.id=ae.reservation_guest_id where ae.reservation_guest_id=g.id and ae.event_id=r.event_id and ae.deleted_at is null order by ag.id limit 1;
 if not found then raise exception 'courtesy_access_artifact_missing' using errcode='55000'; end if;
 if p_access_event is not null then
   timeline_id:=(p_access_event->>'id')::uuid;
   insert into timeline_events(id,event_id,timestamp,kind,icon,tone,title,description,reservation_id,reservation_code,reservation_name,guest_id,guest_name,metadata,created_at,updated_at)
   values(timeline_id,r.event_id,coalesce(p_access_event->>'timestamp',to_char(now(),'HH24:MI')),p_access_event->>'kind',coalesce(p_access_event->>'icon','guest'),coalesce(p_access_event->>'tone','info'),p_access_event->>'title',p_access_event->>'description',r.id::text,r.code,r.name,g.id::text,g.guest_name,coalesce(p_access_event->'metadata','{}'::jsonb)||jsonb_build_object('accessGrantId',grant_id,'code',canonical_code,'qrToken',canonical_qr,'guestId',g.id),now(),now());
 end if;
 return g;
end; $$;
alter function public.add_courtesy_guest_atomic(uuid,jsonb,jsonb) owner to postgres;
revoke all on function public.add_courtesy_guest_atomic(uuid,jsonb,jsonb) from public,anon,service_role;
grant execute on function public.add_courtesy_guest_atomic(uuid,jsonb,jsonb) to authenticated;
