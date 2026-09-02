alter table public.guests
  add column if not exists access_ordinal integer;

update public.guests g
set access_ordinal = substring(g.invitation_code from char_length(r.code) + 2)::integer
from public.reservations r
where g.reservation_id = r.id::text
  and g.access_ordinal is null
  and left(g.invitation_code, char_length(r.code) + 1) = r.code || '-'
  and substring(g.invitation_code from char_length(r.code) + 2) ~ '^[0-9]+$';

create or replace function public.next_guest_access_ordinal(p_reservation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next integer;
begin
  perform 1
  from public.reservations
  where id = p_reservation_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Reservation not found.' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.guests
    where reservation_id = p_reservation_id::text
      and access_ordinal is null
      and deleted_at is null
  ) then
    raise exception 'Reservation has a Guest without an access ordinal.' using errcode = '23514';
  end if;

  select coalesce(max(access_ordinal), 0) + 1
  into v_next
  from public.guests
  where reservation_id = p_reservation_id::text;

  return v_next;
end;
$$;

create or replace function public.create_guest_with_access_ordinal(
  p_reservation_id uuid,
  p_guest jsonb
)
returns public.guests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_guest public.guests%rowtype;
  v_ordinal integer;
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

  v_guest := jsonb_populate_record(null::public.guests, p_guest);
  v_ordinal := public.next_guest_access_ordinal(p_reservation_id);
  v_guest.id := coalesce(v_guest.id, gen_random_uuid());
  v_guest.event_id := v_reservation.event_id;
  v_guest.reservation_id := p_reservation_id::text;
  v_guest.reservation_name := v_reservation.name;
  v_guest.reservation_code := v_reservation.code;
  v_guest.event_name := v_reservation.event_name;
  v_guest.invitation_code := format('%s-%s', v_reservation.code, lpad(v_ordinal::text, 2, '0'));
  v_guest.access_ordinal := v_ordinal;
  v_guest.created_at := now();
  v_guest.updated_at := now();
  v_guest.deleted_at := null;

  insert into public.guests
  select v_guest.*
  returning * into v_guest;

  return v_guest;
end;
$$;

create or replace function public.create_extra_wristband_sale(
  p_reservation_id uuid,
  p_event_id uuid,
  p_people jsonb,
  p_actor text
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_event public.events%rowtype;
  v_price numeric;
  v_sale_id uuid := gen_random_uuid();
  v_guest_ids text[] := '{}';
  v_timeline_id uuid := gen_random_uuid();
  v_quantity integer;
  v_person jsonb;
  v_guest_id uuid;
  v_ordinal integer;
  v_index integer := 0;
  v_actor text;
  v_currency text;
begin
  select * into v_reservation
  from public.reservations
  where id = p_reservation_id and deleted_at is null
  for update;

  if not found then raise exception 'Reservation not found.' using errcode = 'P0002'; end if;
  if v_reservation.event_id <> p_event_id then raise exception 'Reservation does not belong to the event.' using errcode = '42501'; end if;
  if not (p_event_id = any(public.current_event_ids())) then raise exception 'Event is outside the active workspace.' using errcode = '42501'; end if;
  if v_reservation.reservation_type <> 'Mesa' then raise exception 'Extra wristbands are only available for Mesa reservations.' using errcode = '22023'; end if;
  if v_reservation.status in ('Cancelled', 'Completed', 'No Show') then raise exception 'Reservation is closed.' using errcode = '22023'; end if;

  select * into v_event from public.events where id = p_event_id and deleted_at is null;
  if not found then raise exception 'Event not found.' using errcode = 'P0002'; end if;
  select coalesce(nullif(trim(u.display_name), ''), 'Operación') into v_actor
  from public.users u where u.id = public.current_app_user_id();
  v_actor := coalesce(v_actor, 'Operación');
  v_currency := coalesce(nullif(trim(v_event.metadata #>> '{commercial,currency}'), ''), 'BOB');
  if jsonb_typeof(v_event.metadata #> '{commercial,reservation,extraWristbandPrice}') <> 'number' then
    raise exception 'Event has no extra wristband price configured.' using errcode = '22023';
  end if;
  v_price := (v_event.metadata #>> '{commercial,reservation,extraWristbandPrice}')::numeric;
  if v_price < 0 then raise exception 'Extra wristband price cannot be negative.' using errcode = '22023'; end if;
  if jsonb_typeof(p_people) <> 'array' or jsonb_array_length(p_people) < 1 then raise exception 'At least one person is required.' using errcode = '22023'; end if;
  v_quantity := jsonb_array_length(p_people);

  insert into public.reservation_extra_wristband_sales (id, reservation_id, event_id, quantity, unit_price, total_price, currency, created_by)
  values (v_sale_id, v_reservation.id, v_reservation.event_id, v_quantity, v_price, v_price * v_quantity, v_currency, v_actor);

  for v_person in select value from jsonb_array_elements(p_people)
  loop
    v_index := v_index + 1;
    if nullif(trim(v_person->>'name'), '') is null or nullif(trim(v_person->>'carnet'), '') is null or nullif(trim(v_person->>'whatsapp'), '') is null then
      raise exception 'Every person needs name, carnet and WhatsApp.' using errcode = '22023';
    end if;
    v_guest_id := gen_random_uuid();
    v_ordinal := public.next_guest_access_ordinal(v_reservation.id);
    v_guest_ids := array_append(v_guest_ids, v_guest_id::text);
    insert into public.guests (
      id, event_id, guest_name, reservation_name, reservation_code, reservation_id, access_ordinal, event_name,
      table_id, table_name, event_status, invitation_sequence, invitation_code, carnet, whatsapp,
      delivery_status, admission_status, reservation_status, manual_admission, delivery_history,
      operator_activity, qr_status, extra_wristband_sale_id
    ) values (
      v_guest_id, v_reservation.event_id, trim(v_person->>'name'), v_reservation.name, v_reservation.code, v_reservation.id::text, v_ordinal, v_reservation.event_name,
      v_reservation.table_id, v_reservation.table_name, case when v_event.status = 'live' then 'En curso' else 'Próximo' end,
      format('%s de %s', v_ordinal, v_ordinal + v_quantity - v_index), format('%s-%s', v_reservation.code, lpad(v_ordinal::text, 2, '0')),
      trim(v_person->>'carnet'), trim(v_person->>'whatsapp'), 'Enviada', 'Pendiente', v_reservation.status, false,
      jsonb_build_array(jsonb_build_object('time', to_char(now(), 'HH24:MI'), 'title', 'Enviada', 'detail', 'Invitación generada en la operación de manillas extra')),
      jsonb_build_array(jsonb_build_object('time', to_char(now(), 'HH24:MI'), 'action', 'Manilla extra agregada', 'operator', coalesce(v_actor, 'Operación'))),
      'Válido', v_sale_id
    );
  end loop;

  update public.reservations
  set guest_ids = guest_ids || v_guest_ids, updated_at = now()
  where id = v_reservation.id;

  insert into public.timeline_events (id, event_id, timestamp, kind, icon, tone, title, description, reservation_id, reservation_code, reservation_name, metadata)
  values (v_timeline_id, v_reservation.event_id, to_char(now(), 'HH24:MI'), 'reservation.extra_wristbands_added', 'guest', 'info',
    format('Se agregaron %s manillas extra', v_quantity), format('%s personas se vincularon a %s.', v_quantity, v_reservation.name),
    v_reservation.id::text, v_reservation.code, v_reservation.name,
    jsonb_build_object('saleId', v_sale_id, 'reservationId', v_reservation.id, 'quantity', v_quantity, 'unitPrice', v_price, 'totalPrice', v_price * v_quantity, 'currency', v_currency, 'guestIds', v_guest_ids, 'operator', v_actor));

  return jsonb_build_object('saleId', v_sale_id, 'guestIds', v_guest_ids, 'timelineEventId', v_timeline_id);
end;
$$;

alter table public.guests
  add constraint guests_reservation_access_ordinal_unique unique (reservation_id, access_ordinal);

create unique index guests_event_invitation_code_unique
  on public.guests (event_id, invitation_code);

revoke all on function public.next_guest_access_ordinal(uuid) from public;
revoke all on function public.create_guest_with_access_ordinal(uuid, jsonb) from public;
grant execute on function public.create_guest_with_access_ordinal(uuid, jsonb) to authenticated;
grant execute on function public.create_extra_wristband_sale(uuid, uuid, jsonb, text) to authenticated;
