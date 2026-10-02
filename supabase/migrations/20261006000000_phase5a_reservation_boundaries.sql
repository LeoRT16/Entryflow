-- Phase 5A forward fixes: Root authority and authoritative physical capacity.
create or replace function public.create_physical_reservation_atomic(p_reservation jsonb,p_guests jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r reservations%rowtype; e events%rowtype; res resources%rowtype; elr event_layout_resources%rowtype; el event_layouts%rowtype; g jsonb; outg jsonb:='[]'; ord int; gid uuid; rid uuid; event_id uuid; resource_id uuid; vcount int;
begin
 if auth.uid() is null then raise exception 'reservation_unauthenticated' using errcode='28000'; end if;
 event_id:=(p_reservation->>'event_id')::uuid; resource_id:=(p_reservation->>'resource_id')::uuid; rid:=coalesce((p_reservation->>'id')::uuid,gen_random_uuid());
 select * into e from events where id=event_id and deleted_at is null for update; if not found then raise exception 'event_not_found' using errcode='P0002'; end if;
 if not public.is_platform_root() and not exists(select 1 from profiles p join roles ro on ro.id=p.role_id and ro.deleted_at is null where p.user_id=current_app_user_id() and p.organization_id=e.organization_id and p.deleted_at is null and 'reservation.create'=any(ro.permissions)) then raise exception 'reservation_forbidden' using errcode='42501'; end if;
 if e.venue_id is null then raise exception 'event_venue_required' using errcode='22023'; end if;
 select x.* into el from event_layouts x where x.event_id=e.id and x.venue_id=e.venue_id and x.deleted_at is null and x.status='active'; if not found then raise exception 'event_layout_required' using errcode='22023'; end if;
 select * into res from resources where id=resource_id and deleted_at is null for update; if not found or res.venue_id<>e.venue_id then raise exception 'event_layout_resource_not_found' using errcode='P0002'; end if;
 select count(*) into vcount from event_layout_resources x where x.event_layout_id=el.id and x.deleted_at is null and x.status='active' and (x.source_resource_id=res.id or (x.source_resource_id is null and exists(select 1 from venue_layout_resources v where v.id=x.source_venue_layout_resource_id and v.source_resource_id=res.id))); if vcount<>1 then raise exception 'event_layout_resource_not_found' using errcode='P0002'; end if;
 select * into elr from event_layout_resources x where x.event_layout_id=el.id and x.deleted_at is null and x.status='active' and (x.source_resource_id=res.id or (x.source_resource_id is null and exists(select 1 from venue_layout_resources v where v.id=x.source_venue_layout_resource_id and v.source_resource_id=res.id))) limit 1;
 if (select count(*) from guests g where g.event_id=e.id and g.table_id=res.id::text and g.deleted_at is null and g.admission_status<>'Anulada' and g.reservation_status<>'Cancelled') + jsonb_array_length(p_guests) > greatest(res.capacity,0) then raise exception 'physical_capacity_exceeded' using errcode='22023'; end if;
 insert into reservations(id,code,name,event_id,event_name,date,time,table_name,table_id,table_capacity,holder_name,holder_document,holder_whatsapp,holder_email,reservation_type,payment_status,amount,advance,notes,guest_ids,status,timeline,event_layout_id,event_layout_resource_id,resource_id,commercial_snapshot,reference)
 values(rid,p_reservation->>'code',p_reservation->>'name',e.id,e.name,p_reservation->>'date',p_reservation->>'time',res.name,res.id::text,res.capacity,coalesce(p_reservation->>'holder_name',''),coalesce(p_reservation->>'holder_document',''),coalesce(p_reservation->>'holder_whatsapp',''),coalesce(p_reservation->>'holder_email',''),'Mesa',coalesce(p_reservation->>'payment_status','Pendiente'),coalesce(p_reservation->>'amount','0'),coalesce(p_reservation->>'advance','0'),coalesce(p_reservation->>'notes',''),array[]::text[],coalesce(p_reservation->>'status','Pending'),'[]'::jsonb,el.id,elr.id,res.id,(p_reservation->'commercial_snapshot'),p_reservation->>'reference');
 for g in select * from jsonb_array_elements(p_guests) loop
   gid:=coalesce((g->>'id')::uuid,gen_random_uuid()); select coalesce(max(access_ordinal),0)+1 into ord from guests where reservation_id=rid::text; insert into guests(id,event_id,guest_name,reservation_name,reservation_code,reservation_id,event_name,table_id,table_name,event_status,invitation_sequence,invitation_code,carnet,whatsapp,delivery_status,admission_status,reservation_status,qr_status,recent_change,no_whatsapp,no_invitation_sent,manual_admission,delivery_history,operator_activity,created_at,updated_at,access_ordinal) values(gid,e.id,g->>'guest_name',p_reservation->>'name',p_reservation->>'code',rid::text,e.name,res.id::text,res.name,'Próximo',coalesce(g->>'invitation_sequence',ord::text),format('%s-%s',p_reservation->>'code',lpad(ord::text,2,'0')),coalesce(g->>'carnet',''),coalesce(g->>'whatsapp',''),coalesce(g->>'delivery_status','Enviada'),coalesce(g->>'admission_status','Pendiente'),coalesce(p_reservation->>'status','Pending'),coalesce(g->>'qr_status','Válido'),true,false,false,false,'[]'::jsonb,'[]'::jsonb,now(),now(),ord); outg:=outg||jsonb_build_object('id',gid,'access_ordinal',ord,'invitation_code',format('%s-%s',p_reservation->>'code',lpad(ord::text,2,'0')),'table_id',res.id,'table_name',res.name); end loop;
 update reservations set guest_ids=array(select (x->>'id') from jsonb_array_elements(outg) x) where id=rid;
 return jsonb_build_object('reservation',to_jsonb((select x from reservations x where x.id=rid)),'guests',coalesce((select jsonb_agg(to_jsonb(x)) from guests x where x.reservation_id=rid::text and x.deleted_at is null),'[]'::jsonb));
end; $$;

create or replace function public.add_reservation_guest_atomic(
  p_reservation_id uuid,
  p_guest jsonb,
  p_courtesy_event jsonb default null,
  p_access_event jsonb default null
)
returns public.guests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_resource public.resources%rowtype;
  v_guest public.guests%rowtype;
  v_timeline public.timeline_events%rowtype;
  v_guest_ids text[];
begin
  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Reservation not found.' using errcode = 'P0002';
  end if;

  if not (v_reservation.event_id = any(public.current_event_ids())) then
    raise exception 'Event is outside the active workspace.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles as p
    join public.roles as r on r.id = p.role_id
    where p.user_id = public.current_app_user_id()
      and p.organization_id = (select organization_id from public.events where id = v_reservation.event_id)
      and p.deleted_at is null
      and r.deleted_at is null
      and 'reservation.edit' = any(r.permissions)
  ) then
    raise exception 'Missing reservation.edit permission.' using errcode = '42501';
  end if;

  if v_reservation.reservation_type not in ('Mesa', 'Cortesía') then
    raise exception 'Reservation type does not support adding individual guests.' using errcode = '22023';
  end if;

  if v_reservation.status in ('Cancelled', 'Completed', 'No Show') then
    raise exception 'Reservation is closed.' using errcode = '22023';
  end if;

  if v_reservation.reservation_type = 'Mesa' then
    select * into v_resource
    from public.resources
    where deleted_at is null
      and (id = v_reservation.resource_id or id::text = v_reservation.table_id)
    for update;
    if not found then
      raise exception 'physical_resource_not_found' using errcode = 'P0002';
    end if;
    if (
      select count(*)
      from public.guests as occupied
      where occupied.event_id = v_reservation.event_id
        and occupied.deleted_at is null
        and coalesce(occupied.admission_status, '') <> 'Anulada'
        and coalesce(occupied.reservation_status, '') <> 'Cancelled'
        and occupied.table_id = v_resource.id::text
    ) + 1 > greatest(coalesce(v_resource.capacity, 0), 0) then
      raise exception 'physical_capacity_exceeded' using errcode = '22023';
    end if;
  end if;

  v_guest := public.create_guest_with_access_ordinal(p_reservation_id, p_guest);
  v_guest_ids := array_append(v_reservation.guest_ids, v_guest.id::text);

  update public.reservations
  set guest_ids = v_guest_ids,
      updated_at = now()
  where id = p_reservation_id;

  if p_courtesy_event is not null then
    v_timeline := jsonb_populate_record(null::public.timeline_events, p_courtesy_event);
    v_timeline.id := (p_courtesy_event->>'id')::uuid;
    v_timeline.event_id := v_reservation.event_id;
    v_timeline.reservation_id := p_reservation_id::text;
    v_timeline.reservation_code := v_reservation.code;
    v_timeline.reservation_name := v_reservation.name;
    v_timeline.guest_id := v_guest.id::text;
    v_timeline.guest_name := v_guest.guest_name;
    v_timeline.created_at := now();
    v_timeline.updated_at := now();
    v_timeline.deleted_at := null;
    insert into public.timeline_events select v_timeline.*;
  end if;

  if p_access_event is not null then
    v_timeline := jsonb_populate_record(null::public.timeline_events, p_access_event);
    v_timeline.id := (p_access_event->>'id')::uuid;
    v_timeline.event_id := v_reservation.event_id;
    v_timeline.reservation_id := p_reservation_id::text;
    v_timeline.reservation_code := v_reservation.code;
    v_timeline.reservation_name := v_reservation.name;
    v_timeline.guest_id := v_guest.id::text;
    v_timeline.guest_name := v_guest.guest_name;
    v_timeline.created_at := now();
    v_timeline.updated_at := now();
    v_timeline.deleted_at := null;
    insert into public.timeline_events select v_timeline.*;
  end if;

  return v_guest;
end;
$$;


alter function public.create_physical_reservation_atomic(jsonb, jsonb) owner to postgres;
revoke all on function public.create_physical_reservation_atomic(jsonb, jsonb) from public, anon, service_role;
grant execute on function public.create_physical_reservation_atomic(jsonb, jsonb) to authenticated;

revoke all on function public.add_reservation_guest_atomic(uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.add_reservation_guest_atomic(uuid, jsonb, jsonb, jsonb) to authenticated;
