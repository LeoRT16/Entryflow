create or replace function public.cancel_reservation_guest_atomic(
  p_reservation_id uuid,
  p_guest_id uuid,
  p_reason text,
  p_timeline_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_guest public.guests%rowtype;
  v_timeline public.timeline_events%rowtype;
  v_actor text;
  v_role text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_timeline_id uuid := coalesce(p_timeline_id, gen_random_uuid());
begin
  if v_reason is null then
    raise exception 'Cancellation reason is required.' using errcode = '22023';
  end if;

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

  select * into v_guest
  from public.guests
  where id = p_guest_id
    and reservation_id = p_reservation_id::text
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Guest not found.' using errcode = 'P0002';
  end if;

  if v_guest.admission_status = 'Ingresó'
     or exists (
       select 1
       from public.checkins as c
       where c.guest_id = v_guest.id
         and c.deleted_at is null
         and c.status = 'Checked In'
     ) then
    raise exception 'Cannot cancel a Guest who already checked in.' using errcode = '22023';
  end if;

  select
    coalesce(nullif(trim(u.display_name), ''), 'Operación'),
    coalesce(nullif(trim(r.name), ''), 'Operación')
  into v_actor, v_role
  from public.users as u
  left join public.profiles as p on p.user_id = u.id and p.organization_id = (select organization_id from public.events where id = v_reservation.event_id) and p.deleted_at is null
  left join public.roles as r on r.id = p.role_id and r.deleted_at is null
  where u.id = public.current_app_user_id()
  limit 1;
  v_actor := coalesce(v_actor, 'Operación');
  v_role := coalesce(v_role, 'Operación');

  update public.guests
  set admission_status = 'Anulada',
      reservation_status = 'Cancelled',
      qr_status = 'Anulado',
      check_in_time = null,
      check_in_method = null,
      gate = null,
      table_id = null,
      table_name = null,
      operator_activity = coalesce(operator_activity, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'time', to_char(now(), 'HH24:MI'),
        'action', case when v_reservation.reservation_type = 'Cortesía' then 'Cortesía anulada' else 'Invitado cancelado' end,
        'operator', v_actor,
        'reason', v_reason
      )),
      updated_at = now()
  where id = v_guest.id
  returning * into v_guest;

  v_timeline.id := v_timeline_id;
  v_timeline.event_id := v_reservation.event_id;
  v_timeline.timestamp := to_char(now(), 'HH24:MI');
  v_timeline.kind := 'guest.cancelled';
  v_timeline.icon := 'guest';
  v_timeline.tone := 'danger';
  v_timeline.title := case when v_reservation.reservation_type = 'Cortesía' then 'Cortesía anulada' else 'Invitado cancelado' end;
  v_timeline.description := format('%s fue anulado.', v_guest.guest_name);
  v_timeline.reservation_id := v_reservation.id::text;
  v_timeline.reservation_code := v_reservation.code;
  v_timeline.reservation_name := v_reservation.name;
  v_timeline.guest_id := v_guest.id::text;
  v_timeline.guest_name := v_guest.guest_name;
  v_timeline.metadata := jsonb_build_object(
    'actor', v_actor,
    'actorRole', v_role,
    'context', case when v_reservation.reservation_type = 'Cortesía' and v_reservation.reference is not null then format('Cortesía · %s', v_reservation.reference) else v_reservation.name end,
    'target', v_guest.guest_name,
    'reason', v_reason,
    'reference', v_reservation.reference,
    'guestId', v_guest.id,
    'reservationId', v_reservation.id
  );
  v_timeline.created_at := now();
  v_timeline.updated_at := now();
  v_timeline.deleted_at := null;
  insert into public.timeline_events select v_timeline.*;

  return jsonb_build_object(
    'guest', to_jsonb(v_guest),
    'timelineEvent', to_jsonb(v_timeline)
  );
end;
$$;

revoke all on function public.cancel_reservation_guest_atomic(uuid, uuid, text, uuid) from public;
grant execute on function public.cancel_reservation_guest_atomic(uuid, uuid, text, uuid) to authenticated;
