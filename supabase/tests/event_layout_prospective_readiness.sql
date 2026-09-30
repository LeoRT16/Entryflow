begin;
create extension if not exists pgtap;
select plan(9);
insert into auth.users(id,email,encrypted_password,raw_app_meta_data,raw_user_meta_data) values ('e6500000-0000-4000-8000-000000000001','prospective@test','x','{}','{}');
insert into public.users(id,auth_user_id,email,display_name) values ('e6500000-0000-4000-8000-000000000001','e6500000-0000-4000-8000-000000000001','prospective@test','Prospective');
insert into public.organizations(id,name,slug,status,timezone) values ('e6500000-0000-4000-8000-000000000010','Prospective Org','prospective-org','active','UTC');
insert into public.roles(id,name,slug,permissions) values ('e6500000-0000-4000-8000-000000000020','Editor','prospective-editor',array['event.edit']);
insert into public.profiles(id,user_id,organization_id,role_id,display_name) values ('e6500000-0000-4000-8000-000000000030','e6500000-0000-4000-8000-000000000001','e6500000-0000-4000-8000-000000000010','e6500000-0000-4000-8000-000000000020','Prospective');
insert into public.venues(id,organization_id,name,status) values ('e6500000-0000-4000-8000-000000000040','e6500000-0000-4000-8000-000000000010','Venue','active');
insert into public.resources(id,venue_id,type,name,capacity,status) values ('e6500000-0000-4000-8000-000000000050','e6500000-0000-4000-8000-000000000040','table','Table',4,'active');
insert into public.events(id,organization_id,venue_id,name,event_type,status,start_at,timezone,venue,operational_model) values
 ('e6500000-0000-4000-8000-000000000060','e6500000-0000-4000-8000-000000000010','e6500000-0000-4000-8000-000000000040','Legacy Event','event','draft','2026-10-10','UTC','Venue','general'),
 ('e6500000-0000-4000-8000-000000000061','e6500000-0000-4000-8000-000000000010',null,'No Venue','event','draft','2026-10-11','UTC','TBD','general'),
 ('e6500000-0000-4000-8000-000000000062','e6500000-0000-4000-8000-000000000010','e6500000-0000-4000-8000-000000000040','Partial Event','event','draft','2026-10-12','UTC','Venue','general');
insert into public.reservations(id,code,name,event_id,event_name,date,time,table_name,holder_name,holder_document,reservation_type,payment_status,status) values ('e6500000-0000-4000-8000-000000000070','LEG-1','Legacy','e6500000-0000-4000-8000-000000000060','Legacy Event','2026-10-10','20:00','Legacy','Holder','doc','Mesa','Pendiente','Confirmed');
insert into public.guests(id,event_id,guest_name,reservation_name,reservation_code,reservation_id,event_name,event_status,invitation_sequence,invitation_code,carnet,delivery_status,admission_status,reservation_status,qr_status) values ('e6500000-0000-4000-8000-000000000071','e6500000-0000-4000-8000-000000000060','Legacy Guest','Legacy','LEG-1','e6500000-0000-4000-8000-000000000070','Legacy Event','Próximo','1','LEG-1-01','doc','Enviada','Pendiente','Confirmed','Válido');
insert into public.event_layouts(id,event_id,venue_id,name,status) values ('e6500000-0000-4000-8000-000000000080','e6500000-0000-4000-8000-000000000060','e6500000-0000-4000-8000-000000000040','Archived','archived');
insert into public.event_layouts(id,event_id,venue_id,name,status) values ('e6500000-0000-4000-8000-000000000081','e6500000-0000-4000-8000-000000000062','e6500000-0000-4000-8000-000000000040','Partial','active');
select set_config('request.jwt.claims','{"sub":"e6500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((public.materialize_event_layout_atomic('e6500000-0000-4000-8000-000000000060')->>'changed'),'true','legacy event materializes prospectively');
select is((select count(*)::int from event_layouts where event_id='e6500000-0000-4000-8000-000000000060' and status='active'),1,'legacy event gets one active layout beside archive');
select is((select table_id from guests where id='e6500000-0000-4000-8000-000000000071'),null::text,'legacy guest remains physically unassigned');
select is((select event_layout_id from reservations where id='e6500000-0000-4000-8000-000000000070'),null::uuid,'legacy reservation remains without fabricated layout');
select is((select count(*)::int from event_layout_resources elr join event_layouts el on el.id=elr.event_layout_id where el.event_id='e6500000-0000-4000-8000-000000000060' and elr.source_resource_id='e6500000-0000-4000-8000-000000000050'),1,'prospective snapshot has canonical resource identity');
select is((public.materialize_event_layout_atomic('e6500000-0000-4000-8000-000000000060')->>'changed'),'false','prospective materialization idempotent');
select throws_ok($$select public.materialize_event_layout_atomic('e6500000-0000-4000-8000-000000000061')$$,'22023','event_venue_required','event without venue rejected');
select throws_ok($$select public.materialize_event_layout_atomic('e6500000-0000-4000-8000-000000000062')$$,'22023','event_layout_consistency_error','partial active graph rejected');
select is((select count(*)::int from event_layouts where event_id='e6500000-0000-4000-8000-000000000062'),1,'partial graph is not silently duplicated');
select * from finish();
rollback;
