begin;
create extension if not exists pgtap;
select plan(33);
select has_function('public','move_guest_to_resource_atomic',array['uuid','uuid'],'guest move RPC exists');
select function_privs_are('public','move_guest_to_resource_atomic',array['uuid','uuid'],'authenticated',array['EXECUTE'],'authenticated can execute');
select function_privs_are('public','move_guest_to_resource_atomic',array['uuid','uuid'],'anon',array[]::text[],'anon cannot execute');
select function_privs_are('public','move_guest_to_resource_atomic',array['uuid','uuid'],'service_role',array[]::text[],'service role direct execute denied');

insert into auth.users(id,email,encrypted_password,raw_app_meta_data,raw_user_meta_data) values ('c3000000-0000-4000-8000-000000000001','move-owner@example.test','x','{}','{}');
insert into public.organizations(id,name,slug,status,timezone) values ('c3000000-0000-4000-8000-000000000010','Move Org','move-org','active','UTC');
insert into public.roles(id,name,slug,permissions) values ('c3000000-0000-4000-8000-000000000020','Move Editor','move-editor',array['resource.assign']);
insert into public.users(id,auth_user_id,email,display_name) values ('c3000000-0000-4000-8000-000000000030','c3000000-0000-4000-8000-000000000001','move-owner@example.test','Move Owner');
insert into public.profiles(id,user_id,organization_id,role_id,display_name) values ('c3000000-0000-4000-8000-000000000040','c3000000-0000-4000-8000-000000000030','c3000000-0000-4000-8000-000000000010','c3000000-0000-4000-8000-000000000020','Move Owner');
insert into public.venues(id,organization_id,name,status) values ('c3000000-0000-4000-8000-000000000055','c3000000-0000-4000-8000-000000000010','Move Venue','active');
insert into public.resources(id,venue_id,type,name,capacity,status) values
 ('c3000000-0000-4000-8000-000000000060','c3000000-0000-4000-8000-000000000055','table','Move A',4,'active'),
 ('c3000000-0000-4000-8000-000000000061','c3000000-0000-4000-8000-000000000055','table','Move B',2,'active'),
 ('c3000000-0000-4000-8000-000000000062','c3000000-0000-4000-8000-000000000055','table','Move Closed',2,'Closed');
insert into public.venue_layouts(id,venue_id,name,status) values ('c3000000-0000-4000-8000-000000000056','c3000000-0000-4000-8000-000000000055','Move Venue Layout','active');
insert into public.venue_layout_resources(id,venue_layout_id,type,name,capacity,status,source_resource_id) values
 ('c3000000-0000-4000-8000-000000000057','c3000000-0000-4000-8000-000000000056','table','Move A',4,'active','c3000000-0000-4000-8000-000000000060'),
 ('c3000000-0000-4000-8000-000000000058','c3000000-0000-4000-8000-000000000056','table','Move B',2,'active','c3000000-0000-4000-8000-000000000061'),
 ('c3000000-0000-4000-8000-000000000059','c3000000-0000-4000-8000-000000000056','table','Move Closed',2,'active','c3000000-0000-4000-8000-000000000062');
insert into public.events(id,organization_id,name,event_type,status,start_at,timezone,venue,operational_model) values ('c3000000-0000-4000-8000-000000000050','c3000000-0000-4000-8000-000000000010','Move Event','event','active','2026-01-01T00:00:00Z','UTC','Move Venue','general');
insert into public.event_layouts(id,event_id,venue_id,name,status) values ('c3000000-0000-4000-8000-000000000054','c3000000-0000-4000-8000-000000000050','c3000000-0000-4000-8000-000000000055','Move Event Layout','active');
insert into public.event_layout_resources(id,event_layout_id,source_venue_layout_resource_id,type,name,capacity,status) values
 ('c3000000-0000-4000-8000-000000000063','c3000000-0000-4000-8000-000000000054','c3000000-0000-4000-8000-000000000057','table','Move A',4,'active'),
 ('c3000000-0000-4000-8000-000000000064','c3000000-0000-4000-8000-000000000054','c3000000-0000-4000-8000-000000000058','table','Move B',2,'active'),
 ('c3000000-0000-4000-8000-000000000065','c3000000-0000-4000-8000-000000000054','c3000000-0000-4000-8000-000000000059','table','Move Closed',2,'active');
insert into public.reservations(id,code,name,event_id,event_name,date,time,table_name,holder_name,holder_document,reservation_type,payment_status,status,resource_id,table_id,commercial_snapshot) values
 ('c3000000-0000-4000-8000-000000000070','MOVE-1','Move One','c3000000-0000-4000-8000-000000000050','Move Event','2026-01-01','20:00','Move A','Holder','doc','Mesa','Pagado','Confirmed','c3000000-0000-4000-8000-000000000060','c3000000-0000-4000-8000-000000000060','{"amount":400}');
insert into public.guests(id,event_id,guest_name,reservation_name,reservation_code,reservation_id,event_name,event_status,invitation_sequence,invitation_code,carnet,delivery_status,admission_status,reservation_status,qr_status,table_id,table_name) values
 ('c3000000-0000-4000-8000-000000000080','c3000000-0000-4000-8000-000000000050','Move Guest','Move One','MOVE-1','c3000000-0000-4000-8000-000000000070','Move Event','active','1','MOVE-1-01','C','pending','Pendiente','Confirmed','Activo','c3000000-0000-4000-8000-000000000060','Move A'),
 ('c3000000-0000-4000-8000-000000000081','c3000000-0000-4000-8000-000000000050','Null Guest','Move One','MOVE-1','c3000000-0000-4000-8000-000000000070','Move Event','active','2','MOVE-1-02','C2','pending','Pendiente','Confirmed','Activo',null,null);
select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((public.move_guest_to_resource_atomic('c3000000-0000-4000-8000-000000000080','c3000000-0000-4000-8000-000000000061')->>'changed'),'true','confirmed Mesa move succeeds');
select is((select table_id from public.guests where id='c3000000-0000-4000-8000-000000000080'),'c3000000-0000-4000-8000-000000000061','destination resource persisted');
select is((select table_name from public.guests where id='c3000000-0000-4000-8000-000000000080'),'Move B','canonical destination name persisted');
select is((select resource_id from public.reservations where id='c3000000-0000-4000-8000-000000000070'),'c3000000-0000-4000-8000-000000000060','Reservation resource preserved');
select is((select reservation_id from public.guests where id='c3000000-0000-4000-8000-000000000080'),'c3000000-0000-4000-8000-000000000070','ownership preserved');
select is((select commercial_snapshot from public.reservations where id='c3000000-0000-4000-8000-000000000070'),'{"amount":400}'::jsonb,'commercial snapshot preserved');
select is((public.move_guest_to_resource_atomic('c3000000-0000-4000-8000-000000000080','c3000000-0000-4000-8000-000000000061')->>'changed'),'false','same destination idempotent');
select throws_ok($$select public.move_guest_to_resource_atomic('c3000000-0000-4000-8000-000000000080','c3000000-0000-4000-8000-000000000062')$$,'22023','destination_closed','closed destination rejected');
select is((public.move_guest_to_resource_atomic('c3000000-0000-4000-8000-000000000081','c3000000-0000-4000-8000-000000000061')->>'changed'),'true','null source move succeeds');
update public.resources set capacity=1 where id='c3000000-0000-4000-8000-000000000061';
update public.guests set table_id='c3000000-0000-4000-8000-000000000060', table_name='Move A' where id='c3000000-0000-4000-8000-000000000080';
select throws_ok($$select public.move_guest_to_resource_atomic('c3000000-0000-4000-8000-000000000080','c3000000-0000-4000-8000-000000000061')$$,'22023','physical_capacity_exceeded','full destination rejected');
select is((select reservation_status from public.guests where id='c3000000-0000-4000-8000-000000000080'),'Confirmed','reservation status preserved');
select is((select admission_status from public.guests where id='c3000000-0000-4000-8000-000000000080'),'Pendiente','admission status preserved');
select is((select qr_status from public.guests where id='c3000000-0000-4000-8000-000000000080'),'Activo','QR status preserved');
select throws_ok($$select public.move_guest_to_resource_atomic('c3000000-0000-4000-8000-000000000099','c3000000-0000-4000-8000-000000000061')$$,'P0002','guest_not_found','missing guest rejected');
update public.reservations set status='Draft' where id='c3000000-0000-4000-8000-000000000070';
select throws_ok($$select public.move_guest_to_resource_atomic('c3000000-0000-4000-8000-000000000080','c3000000-0000-4000-8000-000000000061')$$,'22023','reservation_status_not_movable','draft rejected');
update public.reservations set status='Completed' where id='c3000000-0000-4000-8000-000000000070';
select throws_ok($$select public.move_guest_to_resource_atomic('c3000000-0000-4000-8000-000000000080','c3000000-0000-4000-8000-000000000061')$$,'22023','reservation_status_not_movable','completed rejected');
update public.reservations set status='Cancelled' where id='c3000000-0000-4000-8000-000000000070';
select throws_ok($$select public.move_guest_to_resource_atomic('c3000000-0000-4000-8000-000000000080','c3000000-0000-4000-8000-000000000061')$$,'22023','reservation_status_not_movable','cancelled rejected');
update public.reservations set status='No Show' where id='c3000000-0000-4000-8000-000000000070';
select throws_ok($$select public.move_guest_to_resource_atomic('c3000000-0000-4000-8000-000000000080','c3000000-0000-4000-8000-000000000061')$$,'22023','reservation_status_not_movable','no show rejected');
update public.reservations set status='Confirmed' where id='c3000000-0000-4000-8000-000000000070';
select throws_ok($$select public.move_guest_to_resource_atomic('c3000000-0000-4000-8000-000000000080','c3000000-0000-4000-8000-000000000099')$$,'P0002','destination_not_found','missing destination rejected');
update public.guests set table_id='not-a-uuid' where id='c3000000-0000-4000-8000-000000000080';
select throws_ok($$select public.move_guest_to_resource_atomic('c3000000-0000-4000-8000-000000000080','c3000000-0000-4000-8000-000000000061')$$,'22023','physical_location_consistency_error','invalid source rejected');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.move_guest_to_resource_atomic('c3000000-0000-4000-8000-000000000080','c3000000-0000-4000-8000-000000000061')$$,'28000','guest_move_unauthenticated','unauthenticated rejected');
select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.guests set table_id='c3000000-0000-4000-8000-000000000060' where id='c3000000-0000-4000-8000-000000000080';
update public.guests set admission_status='Anulada' where id='c3000000-0000-4000-8000-000000000080';
select throws_ok($$select public.move_guest_to_resource_atomic('c3000000-0000-4000-8000-000000000080','c3000000-0000-4000-8000-000000000061')$$,'22023','guest_not_movable','cancelled guest rejected');
select is((select table_id from public.guests where id='c3000000-0000-4000-8000-000000000080'),'c3000000-0000-4000-8000-000000000060','rejected move preserves location');
select throws_ok($$select public.move_guest_to_resource_atomic('c3000000-0000-4000-8000-000000000080','c3000000-0000-4000-8000-000000000061')$$,'22023','guest_not_movable','admission cancelled rejected');
select is((select table_name from public.guests where id='c3000000-0000-4000-8000-000000000080'),'Move A','rejected move preserves name');
select throws_ok($$select public.move_guest_to_resource_atomic('c3000000-0000-4000-8000-000000000080','c3000000-0000-4000-8000-000000000061')$$,'22023','guest_not_movable','repeated terminal rejection stable');
select is((select count(*)::int from public.checkins where guest_id='c3000000-0000-4000-8000-000000000080'),0,'move creates no checkin');
select is((select count(*)::int from public.timeline_events where guest_id='c3000000-0000-4000-8000-000000000080'),0,'move creates no timeline');
select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000999","role":"authenticated"}',true);
select throws_ok($$select public.move_guest_to_resource_atomic('c3000000-0000-4000-8000-000000000081','c3000000-0000-4000-8000-000000000061')$$,'42501','guest_move_forbidden','cross organization/context user rejected');
select * from finish();
rollback;
