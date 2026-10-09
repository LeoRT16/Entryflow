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
   if nullif(trim(g->>'guest_name'),'') is null or nullif(trim(g->>'carnet'),'') is null or nullif(trim(g->>'whatsapp'),'') is null then raise exception 'courtesy_guest_incomplete' using errcode='22023'; end if;
 end loop;
 insert into reservations(id,code,name,event_id,event_name,date,time,table_name,table_id,table_capacity,holder_name,holder_document,holder_whatsapp,holder_email,reservation_type,payment_status,amount,advance,notes,guest_ids,status,timeline,commercial_snapshot,reference)
 values(rid,p_reservation->>'code',p_reservation->>'name',e.id,e.name,p_reservation->>'date',p_reservation->>'time','',null,0,'','','','', 'Cortesía','Pendiente','0','0',coalesce(p_reservation->>'notes',''),array[]::text[],coalesce(p_reservation->>'status','Confirmed'),'[]'::jsonb,null,p_reservation->>'reference') returning * into r;
 for g in select * from jsonb_array_elements(coalesce(p_guests,'[]'::jsonb)) loop
   gid:=coalesce((g->>'id')::uuid,gen_random_uuid()); select coalesce(max(access_ordinal),0)+1 into ord from guests where reservation_id=rid::text;
   insert into guests(id,event_id,guest_name,reservation_name,reservation_code,reservation_id,event_name,table_id,table_name,event_status,invitation_sequence,invitation_code,carnet,whatsapp,delivery_status,admission_status,reservation_status,qr_status,recent_change,no_whatsapp,no_invitation_sent,manual_admission,delivery_history,operator_activity,created_at,updated_at,access_ordinal)
   values(gid,e.id,g->>'guest_name',r.name,r.code,r.id::text,e.name,null,null,'Próximo',ord::text,format('%s-%s',r.code,lpad(ord::text,2,'0')),g->>'carnet',g->>'whatsapp',coalesce(g->>'delivery_status','Enviada'),'Pendiente',r.status,coalesce(g->>'qr_status','Válido'),true,false,false,false,'[]'::jsonb,'[]'::jsonb,now(),now(),ord);
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

