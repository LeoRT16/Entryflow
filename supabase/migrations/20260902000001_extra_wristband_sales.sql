create table if not exists public.reservation_extra_wristband_sales (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  total_price numeric not null check (total_price >= 0),
  currency text not null,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_by text,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by text,
  cancellation_reason text,
  constraint extra_wristband_sales_total_check check (total_price = unit_price * quantity)
);

alter table public.guests
  add column if not exists extra_wristband_sale_id uuid references public.reservation_extra_wristband_sales(id);

create index if not exists reservation_extra_wristband_sales_reservation_id_idx on public.reservation_extra_wristband_sales (reservation_id);
create index if not exists reservation_extra_wristband_sales_event_id_idx on public.reservation_extra_wristband_sales (event_id);
create index if not exists guests_extra_wristband_sale_id_idx on public.guests (extra_wristband_sale_id);

alter table public.reservation_extra_wristband_sales enable row level security;

drop policy if exists "Tenant-scoped extra wristband sale select" on public.reservation_extra_wristband_sales;
drop policy if exists "Tenant-scoped extra wristband sale write" on public.reservation_extra_wristband_sales;

create policy "Tenant-scoped extra wristband sale select"
  on public.reservation_extra_wristband_sales for select to authenticated
  using (event_id = any(public.current_event_ids()));

create policy "Tenant-scoped extra wristband sale write"
  on public.reservation_extra_wristband_sales for all to authenticated
  using (event_id = any(public.current_event_ids()))
  with check (event_id = any(public.current_event_ids()));

drop function if exists public.create_extra_wristband_sale(uuid, uuid, text, jsonb, text);

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
    v_guest_ids := array_append(v_guest_ids, v_guest_id::text);
    insert into public.guests (
      id, event_id, guest_name, reservation_name, reservation_code, reservation_id, event_name,
      table_id, table_name, event_status, invitation_sequence, invitation_code, carnet, whatsapp,
      delivery_status, admission_status, reservation_status, manual_admission, delivery_history,
      operator_activity, qr_status, extra_wristband_sale_id
    ) values (
      v_guest_id, v_reservation.event_id, trim(v_person->>'name'), v_reservation.name, v_reservation.code, v_reservation.id::text, v_reservation.event_name,
      v_reservation.table_id, v_reservation.table_name, case when v_event.status = 'live' then 'En curso' else 'Próximo' end,
      format('%s de %s', v_index, v_quantity), format('%s-%s', v_reservation.code, lpad(v_index::text, 2, '0')),
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

create or replace function public.cancel_extra_wristband_sale(p_sale_id uuid, p_reason text, p_actor text)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sale public.reservation_extra_wristband_sales%rowtype;
  v_reservation public.reservations%rowtype;
  v_guest_ids text[];
  v_timeline_id uuid := gen_random_uuid();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_reason is null then raise exception 'Cancellation reason is required.' using errcode = '22023'; end if;
  select * into v_sale from public.reservation_extra_wristband_sales where id = p_sale_id and status = 'active' for update;
  if not found then raise exception 'Active extra wristband sale not found.' using errcode = 'P0002'; end if;
  if not (v_sale.event_id = any(public.current_event_ids())) then raise exception 'Event is outside the active workspace.' using errcode = '42501'; end if;
  select * into v_reservation from public.reservations where id = v_sale.reservation_id and deleted_at is null;
  if exists (select 1 from public.guests where extra_wristband_sale_id = v_sale.id and (admission_status = 'Ingresó' or exists (select 1 from public.checkins c where c.guest_id = guests.id and c.deleted_at is null and c.status = 'Checked In'))) then
    raise exception 'Cannot cancel a sale with a person who already checked in.' using errcode = '22023';
  end if;
  select coalesce(array_agg(id::text), '{}') into v_guest_ids from public.guests where extra_wristband_sale_id = v_sale.id and deleted_at is null;
  update public.reservation_extra_wristband_sales set status = 'cancelled', cancelled_at = now(), cancelled_by = coalesce((select nullif(trim(u.display_name), '') from public.users u where u.id = public.current_app_user_id()), 'Operación'), cancellation_reason = v_reason where id = v_sale.id;
  update public.guests set admission_status = 'Anulada', qr_status = 'Anulado', reservation_status = 'Cancelled', updated_at = now() where extra_wristband_sale_id = v_sale.id and deleted_at is null;
  insert into public.timeline_events (id, event_id, timestamp, kind, icon, tone, title, description, reservation_id, reservation_code, reservation_name, metadata)
  values (v_timeline_id, v_sale.event_id, to_char(now(), 'HH24:MI'), 'reservation.extra_wristbands_cancelled', 'alert', 'warning',
    format('Se anuló una venta de %s manillas extra', v_sale.quantity), format('La venta de %s manillas extra fue anulada.', v_sale.quantity), v_sale.reservation_id::text, v_reservation.code, v_reservation.name,
    jsonb_build_object('saleId', v_sale.id, 'quantity', v_sale.quantity, 'totalPrice', v_sale.total_price, 'reason', v_reason, 'guestIds', v_guest_ids, 'operator', coalesce((select nullif(trim(u.display_name), '') from public.users u where u.id = public.current_app_user_id()), 'Operación')));
  return jsonb_build_object('saleId', v_sale.id, 'guestIds', v_guest_ids, 'timelineEventId', v_timeline_id);
end;
$$;

revoke all on function public.create_extra_wristband_sale(uuid, uuid, jsonb, text) from public;
revoke all on function public.cancel_extra_wristband_sale(uuid, text, text) from public;
grant execute on function public.create_extra_wristband_sale(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.cancel_extra_wristband_sale(uuid, text, text) to authenticated;

comment on table public.reservation_extra_wristband_sales is 'Historical Mesa manilla-extra operations; never a payment ledger.';
comment on column public.guests.extra_wristband_sale_id is 'Nullable provenance link for Guests created by a Mesa manilla-extra operation.';
