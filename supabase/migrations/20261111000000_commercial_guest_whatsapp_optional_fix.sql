-- Additive deployed corrective fix: align courtesy reservation INSERT columns and values.
create or replace function public.create_courtesy_reservation_atomic(p_reservation jsonb, p_guests jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r reservations%rowtype; e events%rowtype; g jsonb; outg jsonb:='[]'; rid uuid; gid uuid; ord integer; access_code text; qr_token text;
begin
 if auth.uid() is null then raise exception 'reservation_unauthenticated' using errcode='28000'; end if;
 rid:=coalesce((p_reservation->>'id')::uuid,gen_random_uuid());
 select * into e from events where id=(p_reservation->>'event_id')::uuid and deleted_at is null for update;
 if not found then raise exception 'event_not_found' using errcode='P0002'; end if;
 if not public.is_platform_root() and not exists(select 1 from profiles p join roles ro on ro.id=p.role_id and ro.deleted_at is null where p.user_id=current_app_user_id() and p.organization_id=e.organization_id and p.deleted_at is null and 'reservation.create'=any(ro.permissions)) then raise exception 'reservation_forbidden' using errcode='42501'; end if;
 if e.status in ('finished','completed') then raise exception 'event_terminal' using errcode='22023'; end if;
 if p_reservation->>'reservation_type' <> 'Cortesía' then raise exception 'courtesy_type_required' using errcode='22023'; end if;
 if jsonb_array_length(coalesce(p_guests,'[]'::jsonb)) < 1 then raise exception 'courtesy_guest_required' using errcode='22023'; end if;
 for g in select * from jsonb_array_elements(coalesce(p_guests,'[]'::jsonb)) loop
   if nullif(trim(g->>'guest_name'),'') is null or nullif(trim(g->>'carnet'),'') is null then raise exception 'courtesy_guest_incomplete' using errcode='22023'; end if;
 end loop;
 insert into reservations(id,code,name,event_id,event_name,date,time,table_name,table_id,table_capacity,holder_name,holder_document,holder_whatsapp,holder_email,reservation_type,payment_status,amount,advance,notes,guest_ids,status,timeline,commercial_snapshot,reference)
 values(rid,p_reservation->>'code',p_reservation->>'name',e.id,e.name,p_reservation->>'date',p_reservation->>'time','',null,0,'','','','', 'Cortesía','Pendiente','0','0',coalesce(p_reservation->>'notes',''),array[]::text[],coalesce(p_reservation->>'status','Confirmed'),'[]'::jsonb,null,p_reservation->>'reference') returning * into r;
 for g in select * from jsonb_array_elements(coalesce(p_guests,'[]'::jsonb)) loop
   gid:=coalesce((g->>'id')::uuid,gen_random_uuid()); select coalesce(max(access_ordinal),0)+1 into ord from guests where reservation_id=rid::text;
   insert into guests(id,event_id,guest_name,reservation_name,reservation_code,reservation_id,event_name,table_id,table_name,event_status,invitation_sequence,invitation_code,carnet,whatsapp,delivery_status,admission_status,reservation_status,qr_status,recent_change,no_whatsapp,no_invitation_sent,manual_admission,delivery_history,operator_activity,created_at,updated_at,access_ordinal)
   values(gid,e.id,g->>'guest_name',r.name,r.code,r.id::text,e.name,null,null,'Próximo',ord::text,format('%s-%s',r.code,lpad(ord::text,2,'0')),g->>'carnet',coalesce(g->>'whatsapp',''),coalesce(g->>'delivery_status','Enviada'),'Pendiente',r.status,coalesce(g->>'qr_status','Válido'),true,false,false,false,'[]'::jsonb,'[]'::jsonb,now(),now(),ord);
   access_code:='ACC-'||encode(extensions.gen_random_bytes(6),'hex'); qr_token:='qr_'||encode(extensions.gen_random_bytes(24),'hex');
   perform * from public.prepare_guest_access_atomic(gid,access_code,qr_token);
   outg:=outg||jsonb_build_object('id',gid,'access_ordinal',ord,'invitation_code',format('%s-%s',r.code,lpad(ord::text,2,'0')));
 end loop;
 update reservations set guest_ids=array(select x->>'id' from jsonb_array_elements(outg) x),updated_at=now() where id=rid returning * into r;
 return jsonb_build_object('reservation',to_jsonb(r),'guests',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('access_grant_id',ag.id,'access_code',ag.access_code,'qr_token',ag.qr_token)) from guests x join accreditation_enrollments ae on ae.reservation_guest_id=x.id and ae.event_id=r.event_id and ae.deleted_at is null join accreditation_access_grants ag on ag.enrollment_id=ae.id and ag.status='active' where x.reservation_id=rid::text and x.deleted_at is null),'[]'::jsonb));
end; $$;
alter function public.create_courtesy_reservation_atomic(jsonb,jsonb) owner to postgres;
revoke all on function public.create_courtesy_reservation_atomic(jsonb,jsonb) from public,anon,service_role;
grant execute on function public.create_courtesy_reservation_atomic(jsonb,jsonb) to authenticated;



-- Restore canonical ordinal and accreditation access generation while preserving the 20261106000000 security boundary.
-- Correct extra-wristband writes for resource-backed Mesa reservations without weakening tenant RLS.
create or replace function public.create_extra_wristband_sale(
  p_reservation_id uuid,
  p_event_id uuid,
  p_people jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
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
  v_resource_id uuid;
  v_ordinal integer;
  v_access_code text;
  v_qr_token text;
begin
  if auth.uid() is null then raise exception 'extra_wristband_unauthenticated' using errcode = '28000'; end if;
  select * into v_reservation
  from public.reservations
  where id = p_reservation_id and deleted_at is null
  for update;

  if not found then raise exception 'Reservation not found.' using errcode = 'P0002'; end if;
  if not (v_reservation.event_id = any(public.current_event_ids())) then raise exception 'Event is outside the active workspace.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p join public.roles ro on ro.id=p.role_id and ro.deleted_at is null where p.user_id=public.current_app_user_id() and p.organization_id=(select organization_id from public.events where id=v_reservation.event_id) and p.deleted_at is null and 'reservation.edit'=any(ro.permissions)) then raise exception 'Missing reservation.edit permission.' using errcode = '42501'; end if;
  if v_reservation.event_id <> p_event_id then raise exception 'Reservation does not belong to the event.' using errcode = '42501'; end if;
  if not (p_event_id = any(public.current_event_ids())) then raise exception 'Event is outside the active workspace.' using errcode = '42501'; end if;
  select * into v_event from public.events where id = p_event_id and deleted_at is null;
  if not found then raise exception 'Event not found.' using errcode = 'P0002'; end if;
  if v_reservation.reservation_type <> 'Mesa' then raise exception 'Extra wristbands are only available for Mesa reservations.' using errcode = '22023'; end if;

  select r.id into v_resource_id
  from public.resources r
  where r.deleted_at is null
    and r.venue_id = v_event.venue_id
    and r.id = any(public.current_resource_ids())
    and (r.id = v_reservation.resource_id or r.id::text = v_reservation.table_id)
  limit 1;
  if v_resource_id is null then raise exception 'Reservation resource is invalid for this event.' using errcode = '42501'; end if;
  if not public.resource_belongs_to_event(v_resource_id, p_event_id) then raise exception 'Reservation resource is outside the event venue.' using errcode = '42501'; end if;
  if v_reservation.status in ('Cancelled', 'Completed', 'No Show') then raise exception 'Reservation is closed.' using errcode = '22023'; end if;

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
    if nullif(trim(v_person->>'name'), '') is null or nullif(trim(v_person->>'carnet'), '') is null then
      raise exception 'Every person needs name and carnet.' using errcode = '22023';
    end if;
    v_guest_id := gen_random_uuid();
    v_ordinal := public.next_guest_access_ordinal(v_reservation.id);
    v_access_code := 'ACC-' || encode(extensions.gen_random_bytes(6), 'hex');
    v_qr_token := 'qr_' || encode(extensions.gen_random_bytes(24), 'hex');
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
      trim(v_person->>'carnet'), coalesce(trim(v_person->>'whatsapp'), ''), 'Enviada', 'Pendiente', v_reservation.status, false,
      jsonb_build_array(jsonb_build_object('time', to_char(now(), 'HH24:MI'), 'title', 'Enviada', 'detail', 'Invitación generada en la operación de manillas extra')),
      jsonb_build_array(jsonb_build_object('time', to_char(now(), 'HH24:MI'), 'action', 'Manilla extra agregada', 'operator', coalesce(v_actor, 'Operación'))),
      'Válido', v_sale_id
    );
    perform * from public.prepare_guest_access_atomic(v_guest_id, v_access_code, v_qr_token);
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



alter function public.create_extra_wristband_sale(uuid, uuid, jsonb, text) owner to postgres;
revoke all on function public.create_extra_wristband_sale(uuid, uuid, jsonb, text) from public, anon, service_role;
grant execute on function public.create_extra_wristband_sale(uuid, uuid, jsonb, text) to authenticated;


-- Correct Cortesía append timeline metadata from the persisted access grant.
create or replace function public.add_courtesy_guest_atomic(p_reservation_id uuid, p_guest jsonb, p_access_event jsonb)
returns public.guests language plpgsql security definer set search_path=public,pg_temp as $$
declare r reservations%rowtype; e events%rowtype; g guests%rowtype; access_code text; qr_token text; timeline_id uuid; grant_id uuid; canonical_code text; canonical_qr text;
begin
 if auth.uid() is null then raise exception 'guest_unauthenticated' using errcode='28000'; end if;
 select * into r from reservations where id=p_reservation_id and deleted_at is null for update;
 if not found or r.reservation_type <> 'Cortesía' then raise exception 'courtesy_not_found' using errcode='P0002'; end if;
 select * into e from events where id=r.event_id and deleted_at is null;
 if not public.is_platform_root() and not exists(select 1 from profiles p join roles ro on ro.id=p.role_id and ro.deleted_at is null where p.user_id=current_app_user_id() and p.organization_id=e.organization_id and p.deleted_at is null and 'reservation.edit'=any(ro.permissions)) then raise exception 'reservation_forbidden' using errcode='42501'; end if;
 if r.status in ('Cancelled','Completed','No Show') or e.status in ('finished','completed') then raise exception 'reservation_closed' using errcode='22023'; end if;
 if nullif(trim(p_guest->>'guest_name'),'') is null or nullif(trim(p_guest->>'carnet'),'') is null then raise exception 'courtesy_guest_incomplete' using errcode='22023'; end if;
 g:=public.create_guest_with_access_ordinal(r.id,p_guest || jsonb_build_object('whatsapp',coalesce(p_guest->>'whatsapp',''), 'event_status', coalesce(p_guest->>'event_status', case when e.status = 'live' then 'En curso' else 'Próximo' end), 'reservation_status', coalesce(p_guest->>'reservation_status', r.status), 'delivery_status', coalesce(p_guest->>'delivery_status','Enviada'), 'admission_status', coalesce(p_guest->>'admission_status','Pendiente'), 'qr_status', coalesce(p_guest->>'qr_status','Válido'), 'invitation_sequence', coalesce(p_guest->>'invitation_sequence',''), 'recent_change', true, 'no_whatsapp', (coalesce(p_guest->>'whatsapp','') = ''), 'no_invitation_sent', false, 'manual_admission', false, 'delivery_history', '[]'::jsonb, 'operator_activity', '[]'::jsonb)); access_code:='ACC-'||encode(extensions.gen_random_bytes(6),'hex'); qr_token:='qr_'||encode(extensions.gen_random_bytes(24),'hex'); perform * from public.prepare_guest_access_atomic(g.id,access_code,qr_token); update reservations set guest_ids=array_append(coalesce(guest_ids,'{}'),g.id::text),updated_at=now() where id=r.id;
 select ag.id,ag.access_code,ag.qr_token,guest_row.invitation_code into grant_id,access_code,canonical_qr,canonical_code from accreditation_enrollments ae join accreditation_access_grants ag on ag.enrollment_id=ae.id and ag.status='active' join guests guest_row on guest_row.id=ae.reservation_guest_id where ae.reservation_guest_id=g.id and ae.event_id=r.event_id and ae.deleted_at is null order by ag.id limit 1;
 if not found then raise exception 'courtesy_access_artifact_missing' using errcode='55000'; end if;
 if p_access_event is not null then
   timeline_id:=(p_access_event->>'id')::uuid;
   insert into timeline_events(id,event_id,timestamp,kind,icon,tone,title,description,reservation_id,reservation_code,reservation_name,guest_id,guest_name,metadata,created_at,updated_at)
   values(timeline_id,r.event_id,coalesce(p_access_event->>'timestamp',to_char(now(),'HH24:MI')),p_access_event->>'kind',coalesce(p_access_event->>'icon','guest'),coalesce(p_access_event->>'tone','info'),p_access_event->>'title',p_access_event->>'description',r.id::text,r.code,r.name,g.id::text,g.guest_name,coalesce(p_access_event->'metadata','{}'::jsonb)||jsonb_build_object('accessGrantId',grant_id,'code',canonical_code,'qrToken',canonical_qr,'guestId',g.id),now(),now());
 end if;
 return g;
end; $$;
alter function public.add_courtesy_guest_atomic(uuid,jsonb,jsonb) owner to postgres;
revoke all on function public.add_courtesy_guest_atomic(uuid,jsonb,jsonb) from public,anon,service_role;
grant execute on function public.add_courtesy_guest_atomic(uuid,jsonb,jsonb) to authenticated;
