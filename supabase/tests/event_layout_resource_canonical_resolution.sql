begin;
create extension if not exists pgtap;
select plan(29);
insert into auth.users(id,email,encrypted_password,raw_app_meta_data,raw_user_meta_data) values ('d6300000-0000-4000-8000-000000000001','canonical@test','x','{}','{}');
insert into public.organizations(id,name,slug,status,timezone) values ('d6300000-0000-4000-8000-000000000010','Canonical Org','canonical-org','active','UTC');
insert into public.roles(id,name,slug,permissions) values ('d6300000-0000-4000-8000-000000000011','Assign','canonical-assign',array['resource.assign','event.edit']::text[]);
insert into public.users(id,auth_user_id,email,display_name) values ('d6300000-0000-4000-8000-000000000012','d6300000-0000-4000-8000-000000000001','canonical@test','Canonical');
insert into public.profiles(id,user_id,organization_id,role_id,display_name) values ('d6300000-0000-4000-8000-000000000013','d6300000-0000-4000-8000-000000000012','d6300000-0000-4000-8000-000000000010','d6300000-0000-4000-8000-000000000011','Canonical');
insert into public.venues(id,organization_id,name,status) values ('d6300000-0000-4000-8000-000000000020','d6300000-0000-4000-8000-000000000010','Canonical Venue','active');
insert into public.resources(id,venue_id,type,name,capacity,status) values ('d6300000-0000-4000-8000-000000000030','d6300000-0000-4000-8000-000000000020','table','R1',4,'active'),('d6300000-0000-4000-8000-000000000031','d6300000-0000-4000-8000-000000000020','table','R2',4,'active');
insert into public.events(id,organization_id,venue_id,name,event_type,status,start_at,timezone,venue,operational_model) values ('d6300000-0000-4000-8000-000000000040','d6300000-0000-4000-8000-000000000010','d6300000-0000-4000-8000-000000000020','Canonical Event','event','active','2026-10-03T20:00:00Z','UTC','Canonical Venue','general');
insert into public.reservations(id,code,name,event_id,event_name,date,time,table_name,holder_name,reservation_type,payment_status,status,resource_id,commercial_snapshot) values ('d6300000-0000-4000-8000-000000000050','CAN-1','Canonical Reservation','d6300000-0000-4000-8000-000000000040','Canonical Event','2026-10-03','20:00','Sin mesa','Holder','Mesa','Pagado','Confirmed',null,'{"amount":400}');
insert into public.guests(id,event_id,guest_name,reservation_name,reservation_code,reservation_id,event_name,event_status,invitation_sequence,invitation_code,carnet,delivery_status,admission_status,reservation_status,qr_status) values ('d6300000-0000-4000-8000-000000000060','d6300000-0000-4000-8000-000000000040','Canonical Guest','Canonical Reservation','CAN-1','d6300000-0000-4000-8000-000000000050','Canonical Event','active','1','CAN-1-01','C','pending','Pendiente','Confirmed','Activo');
select set_config('request.jwt.claims','{"sub":"d6300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((public.materialize_event_layout_atomic('d6300000-0000-4000-8000-000000000040')->>'changed'),'true','direct graph materialized');
select is((public.assign_reservation_table_atomic('d6300000-0000-4000-8000-000000000050','d6300000-0000-4000-8000-000000000030')->>'changed'),'true','Assign resolves canonical direct Resource');
select is((select resource_id from public.reservations where id='d6300000-0000-4000-8000-000000000050'),'d6300000-0000-4000-8000-000000000030'::uuid,'Assign persists Resource identity');
select is((select event_layout_resource_id is not null from public.reservations where id='d6300000-0000-4000-8000-000000000050'),true,'Assign persists EventLayoutResource identity');
select is((public.move_guest_to_resource_atomic('d6300000-0000-4000-8000-000000000060','d6300000-0000-4000-8000-000000000031')->>'changed'),'true','Guest Move resolves canonical direct Resource');
select is((select table_id from public.guests where id='d6300000-0000-4000-8000-000000000060'),'d6300000-0000-4000-8000-000000000031','Guest Move persists destination');
select is((select table_name from public.guests where id='d6300000-0000-4000-8000-000000000060'),'R2','Guest Move persists canonical name');
select is((select resource_id from public.reservations where id='d6300000-0000-4000-8000-000000000050'),'d6300000-0000-4000-8000-000000000030'::uuid,'Guest Move leaves Reservation ownership unchanged');
select is((select commercial_snapshot from public.reservations where id='d6300000-0000-4000-8000-000000000050'),'{"amount":400}'::jsonb,'Guest Move preserves commercial snapshot');
select throws_ok($$select public.assign_reservation_table_atomic('d6300000-0000-4000-8000-000000000050','d6300000-0000-4000-8000-000000000099')$$,'P0002','table_not_found','unknown Resource rejected');
select is((select count(*)::int from public.event_layout_resources elr join public.event_layouts el on el.id=elr.event_layout_id where el.event_id='d6300000-0000-4000-8000-000000000040' and elr.source_resource_id in ('d6300000-0000-4000-8000-000000000030'::uuid,'d6300000-0000-4000-8000-000000000031'::uuid)),2,'canonical mappings remain authoritative');
insert into public.venues(id,organization_id,name,status) values ('d6300000-0000-4000-8000-000000000021','d6300000-0000-4000-8000-000000000010','Other Venue','active');
insert into public.resources(id,venue_id,type,name,capacity,status) values
 ('d6300000-0000-4000-8000-000000000032','d6300000-0000-4000-8000-000000000020','table','R3 Legacy',4,'active'),
 ('d6300000-0000-4000-8000-000000000033','d6300000-0000-4000-8000-000000000020','table','R4 Matching',4,'active'),
 ('d6300000-0000-4000-8000-000000000034','d6300000-0000-4000-8000-000000000020','table','R5 Wrong',4,'active'),
 ('d6300000-0000-4000-8000-000000000035','d6300000-0000-4000-8000-000000000020','table','R6 Partial',4,'active'),
 ('d6300000-0000-4000-8000-000000000036','d6300000-0000-4000-8000-000000000021','table','R7 Foreign',4,'active'),
 ('d6300000-0000-4000-8000-000000000037','d6300000-0000-4000-8000-000000000020','table','R8 Mismatch',4,'active');
insert into public.venue_layouts(id,venue_id,name,is_default,status) values ('d6300000-0000-4000-8000-000000000070','d6300000-0000-4000-8000-000000000020','Legacy Source',false,'active');
insert into public.venue_layout_resources(id,venue_layout_id,source_resource_id,type,name,capacity,status) values
 ('d6300000-0000-4000-8000-000000000071','d6300000-0000-4000-8000-000000000070','d6300000-0000-4000-8000-000000000032','table','R3 Legacy',4,'active'),
 ('d6300000-0000-4000-8000-000000000072','d6300000-0000-4000-8000-000000000070','d6300000-0000-4000-8000-000000000033','table','R4 Matching',4,'active'),
 ('d6300000-0000-4000-8000-000000000073','d6300000-0000-4000-8000-000000000070','d6300000-0000-4000-8000-000000000036','table','R7 Foreign',4,'active'),
 ('d6300000-0000-4000-8000-000000000074','d6300000-0000-4000-8000-000000000070','d6300000-0000-4000-8000-000000000037','table','R8 Mismatch',4,'active');
insert into public.event_layout_resources(event_layout_id,source_venue_layout_resource_id,type,name,capacity,status)
values ((select id from public.event_layouts where event_id='d6300000-0000-4000-8000-000000000040'),'d6300000-0000-4000-8000-000000000071','table','Legacy ELR',4,'active');
insert into public.event_layout_resources(event_layout_id,source_venue_layout_resource_id,source_resource_id,type,name,capacity,status)
values
 ((select id from public.event_layouts where event_id='d6300000-0000-4000-8000-000000000040'),'d6300000-0000-4000-8000-000000000072','d6300000-0000-4000-8000-000000000033','table','Matching ELR',4,'active'),
 ((select id from public.event_layouts where event_id='d6300000-0000-4000-8000-000000000040'),'d6300000-0000-4000-8000-000000000073','d6300000-0000-4000-8000-000000000036','table','Foreign ELR',4,'active');
insert into public.reservations(id,code,name,event_id,event_name,date,time,table_name,holder_name,reservation_type,payment_status,status,resource_id,commercial_snapshot) values
 ('d6300000-0000-4000-8000-000000000051','CAN-LEG','Legacy Reservation','d6300000-0000-4000-8000-000000000040','Canonical Event','2026-10-03','20:00','Sin mesa','Legacy Holder','Mesa','Pagado','Confirmed',null,'{"amount":410}'),
 ('d6300000-0000-4000-8000-000000000052','CAN-MIS','Mismatch Reservation','d6300000-0000-4000-8000-000000000040','Canonical Event','2026-10-03','20:00','Sin mesa','Mismatch Holder','Mesa','Pagado','Confirmed',null,'{"amount":420}'),
 ('d6300000-0000-4000-8000-000000000053','CAN-WRG','Wrong Reservation','d6300000-0000-4000-8000-000000000040','Canonical Event','2026-10-03','20:00','Sin mesa','Wrong Holder','Mesa','Pagado','Confirmed',null,'{"amount":430}'),
 ('d6300000-0000-4000-8000-000000000054','CAN-PAR','Partial Reservation','d6300000-0000-4000-8000-000000000040','Canonical Event','2026-10-03','20:00','Sin mesa','Partial Holder','Mesa','Pagado','Confirmed',null,'{"amount":440}');
insert into public.guests(id,event_id,guest_name,reservation_name,reservation_code,reservation_id,event_name,event_status,invitation_sequence,invitation_code,carnet,delivery_status,admission_status,reservation_status,qr_status) values
 ('d6300000-0000-4000-8000-000000000061','d6300000-0000-4000-8000-000000000040','Legacy Guest','Legacy Reservation','CAN-LEG','d6300000-0000-4000-8000-000000000051','Canonical Event','active','1','CAN-LEG-01','L','pending','Pendiente','Confirmed','Activo'),
 ('d6300000-0000-4000-8000-000000000062','d6300000-0000-4000-8000-000000000040','Legacy Move Guest','Legacy Move','CAN-MOV','d6300000-0000-4000-8000-000000000051','Canonical Event','active','2','CAN-MOV-01','LM','pending','Pendiente','Confirmed','Activo'),
 ('d6300000-0000-4000-8000-000000000063','d6300000-0000-4000-8000-000000000040','Mismatch Guest','Mismatch Reservation','CAN-MIS','d6300000-0000-4000-8000-000000000052','Canonical Event','active','1','CAN-MIS-01','M','pending','Pendiente','Confirmed','Activo');
select is((public.assign_reservation_table_atomic('d6300000-0000-4000-8000-000000000051','d6300000-0000-4000-8000-000000000032')->>'changed'),'true','legacy Assign succeeds');
select is((select resource_id from public.reservations where id='d6300000-0000-4000-8000-000000000051'),'d6300000-0000-4000-8000-000000000032'::uuid,'legacy Assign resource persisted');
select is((select event_layout_resource_id is not null from public.reservations where id='d6300000-0000-4000-8000-000000000051'),true,'legacy Assign ELR persisted');
select is((select source_resource_id from public.event_layout_resources where source_venue_layout_resource_id='d6300000-0000-4000-8000-000000000071'),null::uuid,'legacy mapping not backfilled');
select is((public.move_guest_to_resource_atomic('d6300000-0000-4000-8000-000000000062','d6300000-0000-4000-8000-000000000032')->>'changed'),'false','legacy Guest Move resolves same destination');
select is((select table_id from public.guests where id='d6300000-0000-4000-8000-000000000062'),'d6300000-0000-4000-8000-000000000032','legacy Guest Move location');
select is((select commercial_snapshot from public.reservations where id='d6300000-0000-4000-8000-000000000051'),'{"amount":410}'::jsonb,'legacy Guest Move commercial preserved');
select is((public.assign_reservation_table_atomic('d6300000-0000-4000-8000-000000000051','d6300000-0000-4000-8000-000000000033')->>'changed'),'true','matching dual provenance accepted');
insert into public.event_layout_resources(event_layout_id,source_venue_layout_resource_id,source_resource_id,type,name,capacity,status) values ((select id from public.event_layouts where event_id='d6300000-0000-4000-8000-000000000040'),'d6300000-0000-4000-8000-000000000074','d6300000-0000-4000-8000-000000000032','table','Mismatch ELR',4,'active');
select throws_ok($$select public.assign_reservation_table_atomic('d6300000-0000-4000-8000-000000000052','d6300000-0000-4000-8000-000000000032')$$,'22023','event_layout_resource_identity_mismatch','mismatch Assign rejected');
select is((select resource_id from public.reservations where id='d6300000-0000-4000-8000-000000000052'),null::uuid,'mismatch Assign preserves resource');
select is((select commercial_snapshot from public.reservations where id='d6300000-0000-4000-8000-000000000052'),'{"amount":420}'::jsonb,'mismatch Assign preserves commercial');
select throws_ok($$select public.move_guest_to_resource_atomic('d6300000-0000-4000-8000-000000000063','d6300000-0000-4000-8000-000000000032')$$,'22023','event_layout_resource_identity_mismatch','mismatch Guest Move rejected');
select is((select table_id from public.guests where id='d6300000-0000-4000-8000-000000000063'),null::text,'mismatch Guest Move preserves guest');
select is((select admission_status from public.guests where id='d6300000-0000-4000-8000-000000000063'),'Pendiente','mismatch preserves admission');
select throws_ok($$select public.assign_reservation_table_atomic('d6300000-0000-4000-8000-000000000053','d6300000-0000-4000-8000-000000000036')$$,'P0002','event_layout_resource_not_found','wrong context Assign rejected');
select is((select resource_id from public.reservations where id='d6300000-0000-4000-8000-000000000053'),null::uuid,'wrong context preserves Reservation');
select throws_ok($$select public.assign_reservation_table_atomic('d6300000-0000-4000-8000-000000000054','d6300000-0000-4000-8000-000000000035')$$,'P0002','event_layout_resource_not_found','partial Assign rejected');
select is((select resource_id from public.reservations where id='d6300000-0000-4000-8000-000000000054'),null::uuid,'partial Assign preserves Reservation');
select * from finish();
rollback;
