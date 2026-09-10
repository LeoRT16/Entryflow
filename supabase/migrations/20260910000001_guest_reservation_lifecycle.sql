create or replace function public.soft_delete_guest(p_guest_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_guest public.guests%rowtype;
  v_reservation public.reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'guest_unauthenticated' using errcode = '28000';
  end if;

  select * into v_guest from public.guests where id = p_guest_id for update;
  if not found then raise exception 'guest_not_found' using errcode = 'P0002'; end if;
  if v_guest.deleted_at is not null then raise exception 'guest_already_deleted' using errcode = 'P0002'; end if;

  select * into v_reservation
  from public.reservations
  where id::text = v_guest.reservation_id
  for update;
  if not found or v_reservation.deleted_at is not null then
    raise exception 'guest_cannot_delete' using errcode = 'P0001';
  end if;

  if not (v_guest.event_id = any(public.current_event_ids())) or v_reservation.event_id <> v_guest.event_id then
    raise exception 'guest_forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.events e
    join public.profiles p on p.organization_id = e.organization_id
      and p.user_id = public.current_app_user_id() and p.deleted_at is null
    join public.roles r on r.id = p.role_id and r.deleted_at is null
    where e.id = v_guest.event_id and e.deleted_at is null and 'guest.remove' = any(r.permissions)
  ) then
    raise exception 'guest_forbidden' using errcode = '42501';
  end if;

  if lower(trim(v_reservation.status)) in ('cancelled', 'completed', 'no show') then
    raise exception 'guest_reservation_terminal' using errcode = 'P0001';
  end if;

  if v_reservation.reservation_type in ('Preventa', 'Cortesía')
     or v_guest.extra_wristband_sale_id is not null
     or v_guest.admission_status <> 'Pendiente'
     or lower(trim(v_guest.delivery_status)) <> 'pendiente de envío'
     or v_guest.check_in_time is not null
     or v_guest.check_in_method is not null
     or v_guest.gate is not null
     or coalesce(v_guest.delivery_history, '[]'::jsonb) not in ('[]'::jsonb, 'null'::jsonb)
     or coalesce(v_guest.operator_activity, '[]'::jsonb) not in ('[]'::jsonb, 'null'::jsonb)
     or (v_guest.incidents is not null and v_guest.incidents <> '[]'::jsonb)
     or (v_guest.audit_rows is not null and v_guest.audit_rows <> '[]'::jsonb)
     or nullif(trim(coalesce(v_guest.internal_notes, '')), '') is not null
     or exists (select 1 from public.checkins c where c.guest_id = v_guest.id)
     or exists (select 1 from public.whatsapp_delivery_attempts w where w.guest_id = v_guest.id)
     or exists (select 1 from public.timeline_events t where t.guest_id = v_guest.id::text)
     or exists (select 1 from public.activity_logs a where a.guest_id = v_guest.id::text)
  then
    raise exception 'guest_has_history' using errcode = 'P0001';
  end if;

  update public.guests set deleted_at = now(), updated_at = now() where id = v_guest.id;
  update public.reservations
    set guest_ids = array_remove(guest_ids, v_guest.id::text), updated_at = now()
    where id = v_reservation.id;
  update public.tables
    set guest_ids = array_remove(guest_ids, v_guest.id::text), updated_at = now()
    where v_guest.id::text = any(guest_ids);

  return true;
end;
$$;

create or replace function public.soft_delete_reservation(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'reservation_unauthenticated' using errcode = '28000';
  end if;

  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  if not found then raise exception 'reservation_not_found' using errcode = 'P0002'; end if;
  if v_reservation.deleted_at is not null then raise exception 'reservation_already_deleted' using errcode = 'P0002'; end if;

  if not (v_reservation.event_id = any(public.current_event_ids())) then
    raise exception 'reservation_forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.events e
    join public.profiles p on p.organization_id = e.organization_id
      and p.user_id = public.current_app_user_id() and p.deleted_at is null
    join public.roles r on r.id = p.role_id and r.deleted_at is null
    where e.id = v_reservation.event_id and e.deleted_at is null and 'reservation.cancel' = any(r.permissions)
  ) then
    raise exception 'reservation_forbidden' using errcode = '42501';
  end if;

  if lower(trim(v_reservation.status)) <> 'draft' then
    raise exception 'reservation_not_draft' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.guests g where g.reservation_id = v_reservation.id::text)
     or exists (select 1 from public.checkins c where c.reservation_id = v_reservation.id)
     or exists (select 1 from public.reservation_extra_wristband_sales s where s.reservation_id = v_reservation.id)
     or exists (select 1 from public.whatsapp_delivery_attempts w where w.reservation_id = v_reservation.id)
     or exists (select 1 from public.timeline_events t where t.reservation_id = v_reservation.id::text)
     or exists (select 1 from public.activity_logs a where a.reservation_id = v_reservation.id::text)
     or v_reservation.commercial_snapshot is not null
     or trim(coalesce(v_reservation.amount, '')) !~ '^[+-]?(0+([.,]0+)?)?$'
     or trim(coalesce(v_reservation.advance, '')) !~ '^[+-]?(0+([.,]0+)?)?$'
     or lower(trim(coalesce(v_reservation.payment_status, ''))) not in ('', 'pendiente')
     or nullif(trim(coalesce(v_reservation.reference, '')), '') is not null
     or nullif(trim(coalesce(v_reservation.notes, '')), '') is not null
     or coalesce(v_reservation.timeline, '[]'::jsonb) not in ('[]'::jsonb, 'null'::jsonb)
  then
    raise exception 'reservation_has_history' using errcode = 'P0001';
  end if;

  update public.tables
    set reservation_ids = array_remove(reservation_ids, v_reservation.id::text),
        guest_ids = array(select item from unnest(guest_ids) item where not (item = any(v_reservation.guest_ids))),
        status = case
          when not exists (
            select 1 from public.reservations other
            where other.id <> v_reservation.id and other.deleted_at is null
              and lower(trim(other.status)) not in ('cancelled', 'completed', 'no show')
              and (other.table_id = public.tables.id::text or other.resource_id = public.tables.id)
          ) then 'Available'
          else status
        end,
        closed = case
          when not exists (
            select 1 from public.reservations other
            where other.id <> v_reservation.id and other.deleted_at is null
              and lower(trim(other.status)) not in ('cancelled', 'completed', 'no show')
              and (other.table_id = public.tables.id::text or other.resource_id = public.tables.id)
          ) then false
          else closed
        end,
        updated_at = now()
    where id::text = v_reservation.table_id
       or id = v_reservation.resource_id
       or v_reservation.id::text = any(reservation_ids);

  update public.reservations set deleted_at = now(), updated_at = now() where id = v_reservation.id;
  return true;
end;
$$;

create or replace function public.cancel_reservation_atomic(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_timeline_id uuid := gen_random_uuid();
  v_actor text;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'reservation_unauthenticated' using errcode = '28000';
  end if;

  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  if not found then raise exception 'reservation_not_found' using errcode = 'P0002'; end if;
  if v_reservation.deleted_at is not null then raise exception 'reservation_already_deleted' using errcode = 'P0002'; end if;

  if not (v_reservation.event_id = any(public.current_event_ids())) then
    raise exception 'reservation_forbidden' using errcode = '42501';
  end if;

  select nullif(trim(u.display_name), ''), nullif(trim(r.name), '') into v_actor, v_role
  from public.events e
  join public.profiles p on p.organization_id = e.organization_id
    and p.user_id = public.current_app_user_id() and p.deleted_at is null
  join public.roles r on r.id = p.role_id and r.deleted_at is null
  join public.users u on u.id = p.user_id and u.deleted_at is null
  where e.id = v_reservation.event_id and e.deleted_at is null and 'reservation.cancel' = any(r.permissions)
  limit 1;
  if not found then raise exception 'reservation_forbidden' using errcode = '42501'; end if;

  if lower(trim(v_reservation.status)) not in ('pending', 'confirmed') then
    raise exception 'reservation_already_terminal' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.reservation_extra_wristband_sales s
    where s.reservation_id = v_reservation.id and s.status = 'active'
  ) then
    raise exception 'reservation_has_active_extras' using errcode = 'P0001';
  end if;

  update public.reservations
  set status = 'Cancelled', updated_at = now()
  where id = v_reservation.id;

  update public.guests g
  set reservation_status = 'Cancelled',
      admission_status = case when g.admission_status = 'Ingresó' or exists (select 1 from public.checkins c where c.guest_id = g.id) then g.admission_status else 'Anulada' end,
      qr_status = case when g.admission_status = 'Ingresó' or exists (select 1 from public.checkins c where c.guest_id = g.id) then g.qr_status else 'Anulado' end,
      table_id = case when g.admission_status = 'Ingresó' or exists (select 1 from public.checkins c where c.guest_id = g.id) then g.table_id else null end,
      table_name = case when g.admission_status = 'Ingresó' or exists (select 1 from public.checkins c where c.guest_id = g.id) then g.table_name else null end,
      operator_activity = coalesce(g.operator_activity, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'time', to_char(now(), 'HH24:MI'), 'action', 'Reserva cancelada', 'operator', coalesce(v_actor, 'Operación')
      )),
      updated_at = now()
  where g.reservation_id = v_reservation.id::text and g.deleted_at is null;

  update public.tables
    set reservation_ids = array_remove(reservation_ids, v_reservation.id::text),
        guest_ids = array(select item from unnest(guest_ids) item where not (item = any(v_reservation.guest_ids))),
        status = case
          when not exists (
            select 1 from public.reservations other
            where other.id <> v_reservation.id and other.deleted_at is null
              and lower(trim(other.status)) not in ('cancelled', 'completed', 'no show')
              and (other.table_id = public.tables.id::text or other.resource_id = public.tables.id)
          ) then 'Available'
          else status
        end,
        closed = case
          when not exists (
            select 1 from public.reservations other
            where other.id <> v_reservation.id and other.deleted_at is null
              and lower(trim(other.status)) not in ('cancelled', 'completed', 'no show')
              and (other.table_id = public.tables.id::text or other.resource_id = public.tables.id)
          ) then false
          else closed
        end,
        updated_at = now()
    where id::text = v_reservation.table_id
       or id = v_reservation.resource_id
       or v_reservation.id::text = any(reservation_ids);

  insert into public.timeline_events (
    id, event_id, timestamp, kind, icon, tone, title, description,
    reservation_id, reservation_code, reservation_name, table_id, table_name, metadata
  ) values (
    v_timeline_id, v_reservation.event_id, to_char(now(), 'HH24:MI'), 'reservation.cancelled',
    'reservation', 'danger', 'Reserva cancelada', format('%s fue cancelada.', v_reservation.name),
    v_reservation.id::text, v_reservation.code, v_reservation.name,
    coalesce(v_reservation.resource_id::text, v_reservation.table_id), v_reservation.table_name,
    jsonb_build_object('actor', coalesce(v_actor, 'Operación'), 'actorRole', coalesce(v_role, 'Operación'),
      'context', v_reservation.event_name, 'target', v_reservation.name, 'reservationId', v_reservation.id)
  );

  return true;
end;
$$;

alter function public.soft_delete_guest(uuid) owner to postgres;
alter function public.soft_delete_reservation(uuid) owner to postgres;
alter function public.cancel_reservation_atomic(uuid) owner to postgres;

revoke all on function public.soft_delete_guest(uuid) from public;
revoke all on function public.soft_delete_guest(uuid) from anon;
revoke all on function public.soft_delete_guest(uuid) from service_role;
grant execute on function public.soft_delete_guest(uuid) to authenticated;

revoke all on function public.soft_delete_reservation(uuid) from public;
revoke all on function public.soft_delete_reservation(uuid) from anon;
revoke all on function public.soft_delete_reservation(uuid) from service_role;
grant execute on function public.soft_delete_reservation(uuid) to authenticated;

revoke all on function public.cancel_reservation_atomic(uuid) from public;
revoke all on function public.cancel_reservation_atomic(uuid) from anon;
revoke all on function public.cancel_reservation_atomic(uuid) from service_role;
grant execute on function public.cancel_reservation_atomic(uuid) to authenticated;
