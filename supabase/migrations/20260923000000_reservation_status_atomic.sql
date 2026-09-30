create or replace function public.set_reservation_status_atomic(
  p_reservation_id uuid,
  p_target_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_target text := trim(coalesce(p_target_status, ''));
  v_previous text;
  v_changed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'reservation_unauthenticated' using errcode = '28000';
  end if;

  if v_target not in ('Pending', 'Confirmed') then
    raise exception 'reservation_status_transition_not_allowed' using errcode = '22023';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id and deleted_at is null
  for update;

  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0002';
  end if;

  if not (v_reservation.event_id = any(public.current_event_ids())) then
    raise exception 'reservation_forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.events e
    join public.profiles p on p.organization_id = e.organization_id
      and p.user_id = public.current_app_user_id() and p.deleted_at is null
    join public.roles r on r.id = p.role_id and r.deleted_at is null
    where e.id = v_reservation.event_id and 'reservation.edit' = any(r.permissions)
  ) then
    raise exception 'reservation_forbidden' using errcode = '42501';
  end if;

  v_previous := v_reservation.status;
  if v_previous = v_target then
    return jsonb_build_object(
      'reservation_id', v_reservation.id,
      'previous_status', v_previous,
      'status', v_previous,
      'changed', false
    );
  end if;

  if not (
    (v_previous = 'Draft' and v_target in ('Pending', 'Confirmed'))
    or (v_previous = 'Pending' and v_target = 'Confirmed')
    or (v_previous = 'Confirmed' and v_target = 'Pending')
  ) then
    raise exception 'reservation_status_transition_not_allowed' using errcode = '22023';
  end if;

  update public.reservations
  set status = v_target, updated_at = now()
  where id = v_reservation.id;

  update public.guests
  set reservation_status = v_target, updated_at = now()
  where reservation_id = v_reservation.id::text and deleted_at is null;

  v_changed := true;
  return jsonb_build_object(
    'reservation_id', v_reservation.id,
    'previous_status', v_previous,
    'status', v_target,
    'changed', v_changed
  );
end;
$$;

alter function public.set_reservation_status_atomic(uuid, text) owner to postgres;
revoke all on function public.set_reservation_status_atomic(uuid, text) from public, anon, service_role;
grant execute on function public.set_reservation_status_atomic(uuid, text) to authenticated;
