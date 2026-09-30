-- Canonical EventLayoutResource -> Resource resolution for assignment and guest move.
create or replace function public.assign_reservation_table_atomic(p_reservation_id uuid,p_destination_table_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r reservations%rowtype; res resources%rowtype; gids text[]; src uuid; changed boolean:=true; v_name text; v_cap int; v_sector uuid; v_sector_name text; v_layout uuid; v_elr uuid; v_canonical_resource uuid; v_legacy_resource uuid;
begin
 if auth.uid() is null then raise exception 'reservation_unauthenticated' using errcode='28000'; end if;
 select * into r from reservations where id=p_reservation_id and deleted_at is null for update;
 if not found then raise exception 'reservation_not_found' using errcode='P0002'; end if;
 if r.status not in ('Draft','Pending','Confirmed') then raise exception 'reservation_terminal' using errcode='22023'; end if;
 if not (r.event_id=any(current_event_ids())) then raise exception 'reservation_forbidden' using errcode='42501'; end if;
 if not exists(select 1 from events e join profiles p on p.organization_id=e.organization_id and p.user_id=current_app_user_id() and p.deleted_at is null join roles ro on ro.id=p.role_id and ro.deleted_at is null where e.id=r.event_id and 'resource.assign'=any(ro.permissions)) then raise exception 'resource_permission_denied' using errcode='42501'; end if;
 src:=nullif(r.resource_id::text,'')::uuid;
 perform 1 from resources where id in (src,p_destination_table_id) and deleted_at is null order by id for update;
 select * into res from resources where id=p_destination_table_id and deleted_at is null;
 if not found then raise exception 'table_not_found' using errcode='P0002'; end if;
 v_name:=res.name; v_cap:=res.capacity; v_sector:=res.sector_id; select name into v_sector_name from sectors where id=res.sector_id;
 select elr.id, elr.event_layout_id, elr.source_resource_id, vlr.source_resource_id
 into v_elr, v_layout, v_canonical_resource, v_legacy_resource
 from event_layout_resources elr
 join event_layouts el on el.id=elr.event_layout_id
 left join venue_layout_resources vlr on vlr.id=elr.source_venue_layout_resource_id
 where el.event_id=r.event_id and el.venue_id=res.venue_id
   and elr.deleted_at is null and elr.status='active'
   and (elr.source_resource_id=res.id
     or (elr.source_resource_id is null and vlr.source_resource_id=res.id)
     or (elr.source_resource_id is not null and vlr.source_resource_id=res.id and elr.source_resource_id<>vlr.source_resource_id))
 order by case when elr.source_resource_id is not null and vlr.source_resource_id is not null and elr.source_resource_id<>vlr.source_resource_id then 0 else 1 end, elr.id limit 1;
 if v_elr is null then raise exception 'event_layout_resource_not_found' using errcode='P0002'; end if;
 if v_canonical_resource is not null and v_legacy_resource is not null and v_canonical_resource<>v_legacy_resource then
   raise exception 'event_layout_resource_identity_mismatch' using errcode='22023';
 end if;
 if v_canonical_resource is not null and v_canonical_resource<>res.id then
   raise exception 'event_layout_resource_identity_mismatch' using errcode='22023';
 end if;
 if res.status in ('inactive','archived','Closed','closed') then raise exception 'table_closed' using errcode='22023'; end if;
 if exists(select 1 from reservations x where x.id<>r.id and x.deleted_at is null and x.event_id=r.event_id and (x.table_id=p_destination_table_id::text or x.resource_id=p_destination_table_id) and x.status in ('Draft','Pending','Confirmed')) then raise exception 'table_already_assigned' using errcode='23505'; end if;
 perform 1 from guests where reservation_id=r.id::text and deleted_at is null order by id for update;
 if r.resource_id=p_destination_table_id then
  if r.table_id is distinct from p_destination_table_id::text or r.table_name is distinct from v_name or r.event_layout_resource_id is distinct from v_elr or exists(select 1 from guests where reservation_id=r.id::text and deleted_at is null and coalesce(reservation_status,'')<>'Cancelled' and table_id is distinct from p_destination_table_id::text) then raise exception 'assignment_consistency_error' using errcode='22023'; end if;
  changed:=false;
 else
  update reservations set resource_id=p_destination_table_id,table_id=p_destination_table_id::text,table_name=v_name,event_layout_resource_id=v_elr,event_layout_id=v_layout,table_capacity=v_cap where id=r.id;
  update guests set table_id=p_destination_table_id::text,table_name=v_name where reservation_id=r.id::text and deleted_at is null and coalesce(reservation_status,'')<>'Cancelled';
  if src is not null and src<>p_destination_table_id then update tables set reservation_ids=array_remove(reservation_ids,r.id::text),guest_ids=array(select unnest(guest_ids) except select id::text from guests where reservation_id=r.id::text),status='Available' where id=src and deleted_at is null; end if;
  
 end if;
 select coalesce(array_agg(id::text order by id),'{}') into gids from guests where reservation_id=r.id::text and deleted_at is null;
 return jsonb_build_object('reservation_id',r.id,'source_table_id',src,'destination_table_id',p_destination_table_id,'guest_ids',gids,'changed',changed,'reservation',jsonb_build_object('resource_id',case when changed then p_destination_table_id else r.resource_id end,'table_id',case when changed then p_destination_table_id::text else r.table_id end,'table_name',case when changed then v_name else r.table_name end,'table_capacity',case when changed then v_cap else r.table_capacity end));
end; $$;


create or replace function public.move_guest_to_resource_atomic(
  p_guest_id uuid,
  p_destination_resource_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_guest public.guests%rowtype;
  v_reservation public.reservations%rowtype;
  v_destination public.resources%rowtype;
  v_source_id uuid;
  v_source_text text;
  v_destination_layout_resource uuid;
  v_destination_layout uuid;
  v_canonical_resource uuid;
  v_legacy_resource uuid;
  v_assigned integer;
  v_changed boolean := true;
begin
  if auth.uid() is null then
    raise exception 'guest_move_unauthenticated' using errcode = '28000';
  end if;

  select * into v_guest
  from public.guests
  where id = p_guest_id and deleted_at is null
  for update;
  if not found then
    raise exception 'guest_not_found' using errcode = 'P0002';
  end if;

  select * into v_reservation
  from public.reservations
  where id::text = v_guest.reservation_id and deleted_at is null
  for update;
  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0002';
  end if;

  if v_reservation.status not in ('Pending', 'Confirmed', 'Checked In') then
    raise exception 'reservation_status_not_movable' using errcode = '22023';
  end if;
  if v_guest.admission_status = 'Anulada' or v_guest.reservation_status = 'Cancelled' then
    raise exception 'guest_not_movable' using errcode = '22023';
  end if;
  if not (v_reservation.event_id = any(public.current_event_ids())) then
    raise exception 'guest_move_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.events e
    join public.profiles p on p.organization_id = e.organization_id
      and p.user_id = public.current_app_user_id() and p.deleted_at is null
    join public.roles r on r.id = p.role_id and r.deleted_at is null
    where e.id = v_reservation.event_id and 'resource.assign' = any(r.permissions)
  ) then
    raise exception 'resource_permission_denied' using errcode = '42501';
  end if;

  v_source_text := nullif(trim(v_guest.table_id), '');
  if v_source_text is not null then
    begin
      v_source_id := v_source_text::uuid;
    exception when invalid_text_representation then
      raise exception 'physical_location_consistency_error' using errcode = '22023';
    end;
  end if;

  -- Reservation and Guest are locked first; all Resource rows are then locked
  -- in UUID order, so concurrent moves share one deterministic lock order.
  perform 1
  from public.resources
  where id in (p_destination_resource_id, v_source_id) and deleted_at is null
  order by id
  for update;

  select * into v_destination
  from public.resources
  where id = p_destination_resource_id and deleted_at is null;
  if not found then
    raise exception 'destination_not_found' using errcode = 'P0002';
  end if;

  select elr.id, elr.event_layout_id, elr.source_resource_id, vlr.source_resource_id
  into v_destination_layout_resource, v_destination_layout, v_canonical_resource, v_legacy_resource
  from public.event_layout_resources elr
  join public.event_layouts el on el.id = elr.event_layout_id
  left join public.venue_layout_resources vlr on vlr.id = elr.source_venue_layout_resource_id
  where el.event_id = v_reservation.event_id
    and el.venue_id = v_destination.venue_id
    and elr.deleted_at is null and elr.status = 'active'
    and (elr.source_resource_id = v_destination.id
      or (elr.source_resource_id is null and vlr.source_resource_id = v_destination.id)
      or (elr.source_resource_id is not null and vlr.source_resource_id = v_destination.id and elr.source_resource_id <> vlr.source_resource_id))
  order by case when elr.source_resource_id is not null and vlr.source_resource_id is not null and elr.source_resource_id<>vlr.source_resource_id then 0 else 1 end, elr.id
  limit 1;
  if v_destination_layout_resource is null then
    raise exception 'destination_context_invalid' using errcode = '42501';
  end if;
  if v_canonical_resource is not null and v_legacy_resource is not null and v_canonical_resource <> v_legacy_resource then
    raise exception 'event_layout_resource_identity_mismatch' using errcode = '22023';
  end if;
  if v_canonical_resource is not null and v_canonical_resource <> v_destination.id then
    raise exception 'event_layout_resource_identity_mismatch' using errcode = '22023';
  end if;
  if v_destination.status in ('inactive', 'archived', 'Closed', 'closed') then
    raise exception 'destination_closed' using errcode = '22023';
  end if;

  if v_source_id is not null then
    if v_source_id <> p_destination_resource_id and not exists (
      select 1 from public.resources where id = v_source_id and deleted_at is null
    ) then
      raise exception 'physical_location_consistency_error' using errcode = '22023';
    end if;
  end if;

  if v_source_id = p_destination_resource_id then
    return jsonb_build_object(
      'changed', false,
      'guest_id', v_guest.id,
      'reservation_id', v_reservation.id,
      'source_resource_id', p_destination_resource_id,
      'destination_resource_id', v_destination.id,
      'destination_resource_name', v_destination.name,
      'table_id', v_guest.table_id,
      'table_name', v_guest.table_name
    );
  end if;

  select count(*) into v_assigned
  from public.guests g
  where g.event_id = v_reservation.event_id
    and g.deleted_at is null
    and g.table_id = p_destination_resource_id::text
    and g.admission_status <> 'Anulada'
    and g.reservation_status <> 'Cancelled';
  if v_assigned >= greatest(v_destination.capacity, 0) then
    raise exception 'physical_capacity_exceeded' using errcode = '22023';
  end if;

  update public.guests
  set table_id = v_destination.id::text,
      table_name = v_destination.name
  where id = v_guest.id;

  return jsonb_build_object(
    'changed', v_changed,
    'guest_id', v_guest.id,
    'reservation_id', v_reservation.id,
    'source_resource_id', v_source_id,
    'destination_resource_id', v_destination.id,
    'destination_resource_name', v_destination.name,
    'table_id', v_destination.id::text,
    'table_name', v_destination.name
  );
end;
$$;

alter function public.move_guest_to_resource_atomic(uuid, uuid) owner to postgres;
revoke all on function public.move_guest_to_resource_atomic(uuid, uuid) from public, anon, service_role;
grant execute on function public.move_guest_to_resource_atomic(uuid, uuid) to authenticated;
