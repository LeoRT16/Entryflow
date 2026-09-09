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

revoke all on function public.add_reservation_guest_atomic(uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.add_reservation_guest_atomic(uuid, jsonb, jsonb, jsonb) to authenticated;
