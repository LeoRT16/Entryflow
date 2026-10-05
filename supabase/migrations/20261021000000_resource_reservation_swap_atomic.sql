-- Phase 6.7C.1: atomic reservation resource change/swap with durable idempotency.
create table if not exists public.resource_reservation_operations (
  idempotency_key text primary key,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function public.swap_resource_reservations_atomic(
  p_reservation_a uuid, p_reservation_b uuid, p_resource_a uuid, p_resource_b uuid, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  ra reservations%rowtype; rb reservations%rowtype; rsrc resources%rowtype; rdst resources%rowtype;
  idem_key text := nullif(trim(p_idempotency_key), ''); hash text; prior resource_reservation_operations%rowtype;
  moving_a uuid[]; moving_b uuid[]; result jsonb; actor text;
begin
  if auth.uid() is null then raise exception 'resource_swap_unauthenticated' using errcode='28000'; end if;
  if idem_key is null then raise exception 'resource_swap_idempotency_required' using errcode='22023'; end if;
  hash := md5(concat_ws(':', p_reservation_a::text, coalesce(p_reservation_b::text,''), p_resource_a::text, p_resource_b::text));
  select * into prior from resource_reservation_operations where idempotency_key=idem_key for update;
  if found then
    if prior.payload_hash <> hash then raise exception 'resource_swap_idempotency_conflict' using errcode='23505'; end if;
    return prior.result;
  end if;
  select * into ra from reservations where id=p_reservation_a and deleted_at is null for update;
  if not found then raise exception 'resource_swap_reservation_not_found' using errcode='P0002'; end if;
  if p_reservation_b is not null then
    select * into rb from reservations where id=p_reservation_b and deleted_at is null for update;
    if not found then raise exception 'resource_swap_reservation_not_found' using errcode='P0002'; end if;
  end if;
  if p_reservation_b is not null and ra.event_id <> rb.event_id then raise exception 'resource_swap_event_mismatch' using errcode='22023'; end if;
  if lower(trim(ra.status)) in ('cancelled','completed','no show') or (p_reservation_b is not null and lower(trim(rb.status)) in ('cancelled','completed','no show')) then raise exception 'resource_swap_reservation_terminal' using errcode='22023'; end if;
  if not exists (select 1 from profiles p join roles ro on ro.id=p.role_id and ro.deleted_at is null join events e on e.organization_id=p.organization_id where p.user_id=current_app_user_id() and e.id=ra.event_id and p.deleted_at is null and 'resource.assign'=any(ro.permissions) and 'reservation.edit'=any(ro.permissions)) then raise exception 'resource_swap_permission_denied' using errcode='42501'; end if;
  perform 1 from resources where id in (p_resource_a,p_resource_b) and deleted_at is null order by id for update;
  select * into rsrc from resources where id=p_resource_a and deleted_at is null;
  select * into rdst from resources where id=p_resource_b and deleted_at is null;
  if rsrc.id is null or rdst.id is null then raise exception 'resource_swap_resource_not_found' using errcode='P0002'; end if;
  if rsrc.venue_id <> rdst.venue_id then raise exception 'resource_swap_venue_mismatch' using errcode='22023'; end if;
  if not exists (select 1 from event_layout_resources elr join event_layouts el on el.id=elr.event_layout_id where el.event_id=ra.event_id and elr.deleted_at is null and elr.status='active' and elr.source_resource_id in (p_resource_a,p_resource_b) group by el.event_id having count(distinct elr.source_resource_id)=2) then raise exception 'resource_swap_event_resource_mismatch' using errcode='22023'; end if;
  if lower(rsrc.status) in ('closed','blocked','inactive','archived') or lower(rdst.status) in ('closed','blocked','inactive','archived') then raise exception 'resource_swap_resource_unavailable' using errcode='22023'; end if;
  if ra.resource_id is distinct from p_resource_a then raise exception 'resource_swap_stale_assignment' using errcode='40001'; end if;
  if p_reservation_b is not null and rb.resource_id is distinct from p_resource_b then raise exception 'resource_swap_stale_assignment' using errcode='40001'; end if;
  if p_reservation_b is null and exists(select 1 from reservations x where x.deleted_at is null and x.event_id=ra.event_id and x.resource_id=p_resource_b and lower(trim(x.status)) in ('draft','pending','confirmed')) then raise exception 'resource_swap_destination_occupied' using errcode='23505'; end if;
  if p_reservation_b is not null and exists(select 1 from reservations x where x.id not in (ra.id,rb.id) and x.deleted_at is null and x.event_id=ra.event_id and x.resource_id in (p_resource_a,p_resource_b) and lower(trim(x.status)) in ('draft','pending','confirmed')) then raise exception 'resource_swap_resource_conflict' using errcode='23505'; end if;
  select coalesce(array_agg(g.id order by g.id),'{}') into moving_a from guests g where g.reservation_id=ra.id::text and g.deleted_at is null and g.table_id=p_resource_a::text and g.extra_wristband_sale_id is null;
  if p_reservation_b is not null then
    select coalesce(array_agg(g.id order by g.id),'{}') into moving_b from guests g where g.reservation_id=rb.id::text and g.deleted_at is null and g.table_id=p_resource_b::text and g.extra_wristband_sale_id is null;
  end if;
  if p_reservation_b is null then
    if coalesce((select count(*) from guests g where g.table_id=p_resource_b::text and g.deleted_at is null and g.extra_wristband_sale_id is null),0)+coalesce(array_length(moving_a,1),0)>rdst.capacity then
      raise exception 'resource_swap_capacity_exceeded' using errcode='22023';
    end if;
  else
    if coalesce((select count(*) from guests g where g.table_id=p_resource_b::text and g.deleted_at is null and g.extra_wristband_sale_id is null and g.reservation_id<>ra.id::text),0)+coalesce(array_length(moving_a,1),0)>rdst.capacity
      or coalesce((select count(*) from guests g where g.table_id=p_resource_a::text and g.deleted_at is null and g.extra_wristband_sale_id is null and g.reservation_id<>rb.id::text),0)+coalesce(array_length(moving_b,1),0)>rsrc.capacity then
      raise exception 'resource_swap_capacity_exceeded' using errcode='22023';
    end if;
  end if;
  update reservations set resource_id=p_resource_b,table_id=p_resource_b::text,table_name=rdst.name,table_capacity=rdst.capacity,updated_at=now() where id=ra.id;
  update guests set table_id=p_resource_b::text,table_name=rdst.name,updated_at=now() where id=any(moving_a);
  if p_reservation_b is not null then
    update reservations set resource_id=p_resource_a,table_id=p_resource_a::text,table_name=rsrc.name,table_capacity=rsrc.capacity,updated_at=now() where id=rb.id;
    update guests set table_id=p_resource_a::text,table_name=rsrc.name,updated_at=now() where id=any(moving_b);
  end if;
  select coalesce(nullif(trim(u.display_name),''),'Operación') into actor from users u where u.id=current_app_user_id();
  insert into timeline_events(event_id,timestamp,kind,icon,tone,title,description,reservation_id,reservation_code,reservation_name,metadata,created_at,updated_at) values(ra.event_id,to_char(now(),'HH24:MI'),'resource.swap','table','info',case when p_reservation_b is null then 'Mesa cambiada' else 'Mesas intercambiadas' end,format('%s %s.',actor,case when p_reservation_b is null then 'cambió una reserva de mesa' else 'intercambió dos reservas de mesa' end),ra.id::text,ra.code,ra.name,jsonb_build_object('actor',actor,'venueId',rsrc.venue_id,'resourceAId',p_resource_a,'resourceBId',p_resource_b,'reservationAId',ra.id,'reservationBId',p_reservation_b,'idempotencyKey',idem_key),now(),now());
  result := jsonb_build_object('changed',true,'reservationAId',ra.id,'reservationBId',p_reservation_b,'resourceAId',p_resource_a,'resourceBId',p_resource_b);
  insert into resource_reservation_operations(idempotency_key,payload_hash,result) values(idem_key,hash,result);
  return result;
end; $$;
revoke all on function public.swap_resource_reservations_atomic(uuid,uuid,uuid,uuid,text) from public,anon;
grant execute on function public.swap_resource_reservations_atomic(uuid,uuid,uuid,uuid,text) to authenticated;
