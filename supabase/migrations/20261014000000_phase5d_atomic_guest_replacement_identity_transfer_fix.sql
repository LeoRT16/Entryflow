-- Phase 5D corrective fix: transfer canonical invitation identity while preserving historical uniqueness.
create or replace function public.replace_reservation_guest_atomic(
  p_reservation_id uuid,
  p_guest_id uuid,
  p_replacement jsonb,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r reservations%rowtype; a guests%rowtype; b guests%rowtype; e accreditation_enrollments%rowtype; ag accreditation_access_grants%rowtype; be accreditation_enrollments%rowtype; bg accreditation_access_grants%rowtype; s reservation_access_slots%rowtype; ev events%rowtype; actor text; role_name text; old_table_id text; old_table_name text; old_guest_ids text[]; new_code text; new_qr text; timeline_id uuid:=gen_random_uuid();
begin
 if auth.uid() is null then raise exception 'replacement_unauthenticated' using errcode='28000'; end if;
 if nullif(trim(p_replacement->>'guest_name'),'') is null then raise exception 'replacement_guest_name_required' using errcode='22023'; end if;
 select * into r from reservations where id=p_reservation_id and deleted_at is null for update; if not found then raise exception 'reservation_not_found' using errcode='P0002'; end if;
 select * into ev from events where id=r.event_id and deleted_at is null; if not found then raise exception 'event_not_found' using errcode='P0002'; end if;
 if not is_platform_root() and not exists (select 1 from profiles p join roles ro on ro.id=p.role_id and ro.deleted_at is null where p.user_id=current_app_user_id() and p.organization_id=ev.organization_id and p.deleted_at is null and ro.slug <> 'door' and ('reservation.edit'=any(ro.permissions) or ro.slug in ('reception','administrator','owner'))) then raise exception 'replacement_forbidden' using errcode='42501'; end if;
 select * into a from guests where id=p_guest_id and reservation_id=p_reservation_id::text and deleted_at is null for update; if not found then raise exception 'guest_not_found' using errcode='P0002'; end if;
 if a.admission_status in ('Ingresó','Anulada') or a.reservation_status='Cancelled' or a.replaced_by_guest_id is not null then raise exception 'replacement_admitted_guest' using errcode='55000'; end if;
 select * into e from accreditation_enrollments where reservation_guest_id=a.id and event_id=r.event_id and deleted_at is null for update; if not found then raise exception 'replacement_enrollment_not_found' using errcode='55000'; end if;
 select * into ag from accreditation_access_grants where enrollment_id=e.id for update; if not found or ag.status<>'active' then raise exception 'replacement_grant_invalid' using errcode='55000'; end if;
 if exists(select 1 from accreditation_checkins where access_grant_id=ag.id)
    or exists(select 1 from checkins c where c.guest_id=a.id and c.access_grant_id=ag.id and c.deleted_at is null and c.status in ('Checked In','Checked Out','Completed')) then raise exception 'replacement_consumed_grant' using errcode='55000'; end if;
 select * into s from reservation_access_slots where reservation_id=r.id and access_ordinal=coalesce(a.access_ordinal,substring(a.invitation_code from char_length(r.code)+2)::integer) for update;
 if not found then insert into reservation_access_slots(reservation_id,event_id,access_ordinal,current_guest_id) values(r.id,r.event_id,coalesce(a.access_ordinal,substring(a.invitation_code from char_length(r.code)+2)::integer),a.id) returning * into s; else if s.current_guest_id<>a.id then raise exception 'replacement_slot_not_current' using errcode='55000'; end if; end if;
 old_table_id:=a.table_id; old_table_name:=a.table_name;
 update guests set access_slot_id=s.id where id=a.id;
 update accreditation_access_grants set status='revoked', revoked_at=now(), updated_at=now() where id=ag.id and status='active';
 update guests set admission_status='Anulada', reservation_status='Cancelled', qr_status='Anulado', table_id=null, table_name=null, replaced_by_guest_id=null, updated_at=now() where id=a.id;
 update guests set access_ordinal=null, invitation_code=format('%s-HIST-%s', a.invitation_code, replace(a.id::text,'-','')), updated_at=now() where id=a.id;
 new_code:= 'ACC-'||encode(extensions.gen_random_bytes(6),'hex'); new_qr:='qr_'||encode(extensions.gen_random_bytes(24),'hex');
 b:=jsonb_populate_record(null::guests,p_replacement); b.id:=gen_random_uuid(); b.event_id:=r.event_id; b.reservation_id:=r.id::text; b.reservation_name:=r.name; b.reservation_code:=r.code; b.event_name:=r.event_name; b.table_id:=old_table_id; b.table_name:=old_table_name; b.event_status:=a.event_status; b.access_ordinal:=s.access_ordinal; b.invitation_sequence:=coalesce(nullif(p_replacement->>'invitation_sequence',''),a.invitation_sequence); b.invitation_code:=format('%s-%s',r.code,lpad(s.access_ordinal::text,2,'0')); b.admission_status:='Pendiente'; b.reservation_status:=r.status; b.qr_status:='Válido'; b.delivery_status:=coalesce(nullif(b.delivery_status,''),'Enviada'); b.carnet:=coalesce(b.carnet,''); b.whatsapp:=coalesce(b.whatsapp,''); b.recent_change:=true; b.no_whatsapp:=coalesce(b.no_whatsapp,false); b.no_invitation_sent:=coalesce(b.no_invitation_sent,false); b.manual_admission:=false; b.delivery_history:='[]'::jsonb; b.operator_activity:='[]'::jsonb; b.access_slot_id:=s.id; b.replacement_of_guest_id:=a.id; b.replaced_by_guest_id:=null; b.created_at:=now(); b.updated_at:=now(); b.deleted_at:=null;
 insert into guests select b.* returning * into b;
 update guests set replaced_by_guest_id=b.id where id=a.id;
 update reservation_access_slots set current_guest_id=b.id,updated_at=now() where id=s.id;
 insert into accreditation_enrollments(organization_id,event_id,name,phone,status,metadata,reservation_guest_id) values(ev.organization_id,r.event_id,b.guest_name,b.whatsapp,'active',jsonb_build_object('reservationId',r.id,'guestId',b.id,'replacementOfGuestId',a.id,'accessSlotId',s.id),b.id) returning * into be;
 insert into accreditation_access_grants(organization_id,event_id,enrollment_id,access_code,qr_token,status,metadata) values(ev.organization_id,r.event_id,be.id,new_code,new_qr,'active',jsonb_build_object('reservationId',r.id,'guestId',b.id,'replacementOfGuestId',a.id,'accessSlotId',s.id)) returning * into bg;
 old_guest_ids:=r.guest_ids; if not (b.id::text=any(old_guest_ids)) then update reservations set guest_ids=array_append(old_guest_ids,b.id::text),updated_at=now() where id=r.id; end if;
 select coalesce(nullif(trim(u.display_name),''),'Operación'),coalesce(nullif(trim(ro.name),''),'Operación') into actor,role_name from users u left join profiles p on p.user_id=u.id and p.organization_id=ev.organization_id and p.deleted_at is null left join roles ro on ro.id=p.role_id and ro.deleted_at is null where u.id=current_app_user_id() limit 1;
 insert into timeline_events(id,event_id,timestamp,kind,icon,tone,title,description,reservation_id,reservation_code,reservation_name,guest_id,guest_name,metadata,created_at,updated_at) values(timeline_id,r.event_id,to_char(now(),'HH24:MI'),'guest.replaced','guest','info','Invitado reemplazado',format('%s fue reemplazado por %s.',a.guest_name,b.guest_name),r.id::text,r.code,r.name,b.id::text,b.guest_name,jsonb_build_object('actor',actor,'actorRole',role_name,'reason',nullif(trim(p_reason),''),'slotId',s.id,'accessOrdinal',s.access_ordinal,'sourceGuestId',a.id,'replacementGuestId',b.id,'sourceAccessGrantId',ag.id,'replacementAccessGrantId',bg.id),now(),now());
 return jsonb_build_object('guest',to_jsonb(b),'sourceGuestId',a.id,'accessGrantId',bg.id,'accessCode',new_code,'qrToken',new_qr,'slotId',s.id,'timelineId',timeline_id);
end; $$;
revoke all on function public.replace_reservation_guest_atomic(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.replace_reservation_guest_atomic(uuid,uuid,jsonb,text) to authenticated;
