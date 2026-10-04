create or replace function public.add_presale_guest_atomic(p_reservation_id uuid, p_guest jsonb, p_access_event jsonb)
returns public.guests language plpgsql security definer set search_path=public,pg_temp as $$
declare r reservations%rowtype; e events%rowtype; g guests%rowtype; timeline_id uuid; access_code text; qr_token text;
begin
 if auth.uid() is null then raise exception 'guest_unauthenticated' using errcode='28000'; end if;
 select * into r from reservations where id=p_reservation_id and deleted_at is null for update;
 if not found or r.reservation_type <> 'Preventa' then raise exception 'presale_not_found' using errcode='P0002'; end if;
 select * into e from events where id=r.event_id and deleted_at is null;
 if not public.is_platform_root() and not exists(select 1 from profiles p join roles ro on ro.id=p.role_id and ro.deleted_at is null where p.user_id=current_app_user_id() and p.organization_id=e.organization_id and p.deleted_at is null and 'reservation.edit'=any(ro.permissions)) then raise exception 'reservation_forbidden' using errcode='42501'; end if;
 if r.status in ('Cancelled','Completed','No Show') or e.status in ('finished','completed') then raise exception 'reservation_closed' using errcode='22023'; end if;
 if (select count(*) from guests x where x.reservation_id=r.id::text and x.deleted_at is null and x.admission_status <> 'Anulada' and x.reservation_status <> 'Cancelled') >= floor((r.commercial_snapshot->>'quantity')::numeric) then raise exception 'presale_capacity_exceeded' using errcode='22023'; end if;
 if nullif(trim(p_guest->>'guest_name'),'') is null or nullif(trim(p_guest->>'carnet'),'') is null or nullif(trim(p_guest->>'whatsapp'),'') is null then raise exception 'presale_guest_incomplete' using errcode='22023'; end if;
 g:=public.create_guest_with_access_ordinal(r.id,p_guest); access_code:='ACC-'||encode(extensions.gen_random_bytes(6),'hex'); qr_token:='qr_'||encode(extensions.gen_random_bytes(24),'hex'); perform * from public.prepare_guest_access_atomic(g.id,access_code,qr_token); update reservations set guest_ids=array_append(guest_ids,g.id::text),updated_at=now() where id=r.id;
 if p_access_event is not null then timeline_id:=(p_access_event->>'id')::uuid; insert into timeline_events(id,event_id,timestamp,kind,icon,tone,title,description,reservation_id,reservation_code,reservation_name,guest_id,guest_name,metadata,created_at,updated_at) values(timeline_id,r.event_id,coalesce(p_access_event->>'timestamp',to_char(now(),'HH24:MI')),p_access_event->>'kind',coalesce(p_access_event->>'icon','guest'),coalesce(p_access_event->>'tone','info'),p_access_event->>'title',p_access_event->>'description',r.id::text,r.code,r.name,g.id::text,g.guest_name,p_access_event->'metadata',now(),now()); end if;
 return g;
end; $$;
alter function public.add_presale_guest_atomic(uuid,jsonb,jsonb) owner to postgres;
revoke all on function public.add_presale_guest_atomic(uuid,jsonb,jsonb) from public,anon,service_role;
grant execute on function public.add_presale_guest_atomic(uuid,jsonb,jsonb) to authenticated;
