begin;
create extension if not exists pgtap;
select plan(104);
select has_function('public','assign_reservation_table_atomic',array['uuid','uuid'],'assign RPC exists');
select has_function('public','release_reservation_table_atomic',array['uuid','uuid'],'release RPC exists');
select has_function('public','close_table_atomic',array['uuid'],'close RPC exists');
select function_privs_are('public','assign_reservation_table_atomic',array['uuid','uuid'],'authenticated',array['EXECUTE'],'authenticated assign execute');
select function_privs_are('public','release_reservation_table_atomic',array['uuid','uuid'],'authenticated',array['EXECUTE'],'authenticated release execute');
select function_privs_are('public','close_table_atomic',array['uuid'],'authenticated',array['EXECUTE'],'authenticated close execute');
select function_privs_are('public','assign_reservation_table_atomic',array['uuid','uuid'],'anon',array[]::text[],'anon assign denied');
select function_privs_are('public','release_reservation_table_atomic',array['uuid','uuid'],'anon',array[]::text[],'anon release denied');
select function_privs_are('public','close_table_atomic',array['uuid'],'anon',array[]::text[],'anon close denied');
insert into auth.users(id,email,encrypted_password,raw_app_meta_data,raw_user_meta_data) values ('b2000000-0000-4000-8000-000000000001','table-owner@example.test','x','{}','{}');
insert into public.organizations(id,name,slug,status,timezone) values ('b2000000-0000-4000-8000-000000000010','Table Org','table-org','active','UTC');
insert into public.roles(id,name,slug,permissions) values ('b2000000-0000-4000-8000-000000000020','Table Editor','table-editor',array['resource.assign','resource.manage']);
insert into public.users(id,auth_user_id,email,display_name) values ('b2000000-0000-4000-8000-000000000030','b2000000-0000-4000-8000-000000000001','table-owner@example.test','Table Owner');
insert into public.profiles(id,user_id,organization_id,role_id,display_name) values ('b2000000-0000-4000-8000-000000000040','b2000000-0000-4000-8000-000000000030','b2000000-0000-4000-8000-000000000010','b2000000-0000-4000-8000-000000000020','Table Owner');
insert into public.events(id,organization_id,name,event_type,status,start_at,timezone,venue,operational_model) values ('b2000000-0000-4000-8000-000000000050','b2000000-0000-4000-8000-000000000010','Table Event','event','active','2026-01-01T00:00:00Z','UTC','Venue','general');
insert into public.venues(id,organization_id,name,status) values ('b2000000-0000-4000-8000-000000000055','b2000000-0000-4000-8000-000000000010','Venue','active');
insert into public.resources(id,venue_id,type,name,capacity,status) values ('b2000000-0000-4000-8000-000000000060','b2000000-0000-4000-8000-000000000055','table','Mesa A',5,'active'),('b2000000-0000-4000-8000-000000000061','b2000000-0000-4000-8000-000000000055','table','Mesa B',8,'active');
insert into public.venue_layouts(id,venue_id,name,status) values ('b2000000-0000-4000-8000-000000000056','b2000000-0000-4000-8000-000000000055','Default','active');
insert into public.venue_layout_resources(id,venue_layout_id,type,name,capacity,status,source_resource_id) values ('b2000000-0000-4000-8000-000000000057','b2000000-0000-4000-8000-000000000056','table','Mesa A',5,'active','b2000000-0000-4000-8000-000000000060'),('b2000000-0000-4000-8000-000000000058','b2000000-0000-4000-8000-000000000056','table','Mesa B',8,'active','b2000000-0000-4000-8000-000000000061');
insert into public.event_layouts(id,event_id,venue_id,name,status) values ('b2000000-0000-4000-8000-000000000059','b2000000-0000-4000-8000-000000000050','b2000000-0000-4000-8000-000000000055','Event Layout','active');
insert into public.event_layout_resources(id,event_layout_id,source_venue_layout_resource_id,type,name,capacity,status) values ('b2000000-0000-4000-8000-000000000062','b2000000-0000-4000-8000-000000000059','b2000000-0000-4000-8000-000000000057','table','Mesa A',5,'active'),('b2000000-0000-4000-8000-000000000063','b2000000-0000-4000-8000-000000000059','b2000000-0000-4000-8000-000000000058','table','Mesa B',8,'active');
insert into public.reservations(id,code,name,event_id,event_name,date,time,table_name,holder_name,holder_document,reservation_type,payment_status,status,table_capacity) values ('b2000000-0000-4000-8000-000000000070','TABLE-1','Table Reservation','b2000000-0000-4000-8000-000000000050','Table Event','2026-01-01','20:00','Sin mesa','Holder','doc','General','Pending','Pending',0);
insert into public.guests(id,event_id,guest_name,reservation_name,reservation_code,reservation_id,event_name,event_status,invitation_sequence,invitation_code,carnet,delivery_status,admission_status,reservation_status,qr_status) values ('b2000000-0000-4000-8000-000000000080','b2000000-0000-4000-8000-000000000050','Guest','Holder','TABLE-1','b2000000-0000-4000-8000-000000000070','Table Event','active','1','TABLE-1-01','C','pending','Pendiente','Pending','Activo');
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000070','b2000000-0000-4000-8000-000000000060')->>'changed'),'true','assign succeeds');
select is((select table_id from public.reservations where id='b2000000-0000-4000-8000-000000000070'),'b2000000-0000-4000-8000-000000000060','reservation assigned');
select is((select table_capacity from public.reservations where id='b2000000-0000-4000-8000-000000000070'),5,'capacity snapshot');
select is((select table_id from public.guests where id='b2000000-0000-4000-8000-000000000080'),'b2000000-0000-4000-8000-000000000060','guest assigned');
select is((public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000070','b2000000-0000-4000-8000-000000000060')->>'changed'),'false','coherent idempotency');
select is((public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000070','b2000000-0000-4000-8000-000000000061')->>'changed'),'true','move succeeds');
select is((select table_capacity from public.reservations where id='b2000000-0000-4000-8000-000000000070'),8,'move capacity snapshot');
select is((select event_layout_resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000070'),'b2000000-0000-4000-8000-000000000063','move layout mapping');
select is((select table_id from public.guests where id='b2000000-0000-4000-8000-000000000080'),'b2000000-0000-4000-8000-000000000061','guest moved');
select is((public.release_reservation_table_atomic('b2000000-0000-4000-8000-000000000070','b2000000-0000-4000-8000-000000000061')->>'changed'),'true','release succeeds');
select ok((select table_id is null and resource_id is null and table_capacity=8 from public.reservations where id='b2000000-0000-4000-8000-000000000070'),'release clears assignment and preserves capacity');
select ok((select table_id is null from public.guests where id='b2000000-0000-4000-8000-000000000080'),'release clears guest assignment');
insert into public.reservations(id,code,name,event_id,event_name,date,time,table_name,holder_name,holder_document,reservation_type,payment_status,status) values
('b2000000-0000-4000-8000-000000000071','TABLE-2','Conflict','b2000000-0000-4000-8000-000000000050','Table Event','2026-01-01','20:00','Sin mesa','Holder','doc','General','Pending','Pending'),
('b2000000-0000-4000-8000-000000000072','TABLE-3','Checked','b2000000-0000-4000-8000-000000000050','Table Event','2026-01-01','20:00','Sin mesa','Holder','doc','General','Pending','Pending'),
('b2000000-0000-4000-8000-000000000073','TABLE-4','Completed','b2000000-0000-4000-8000-000000000050','Table Event','2026-01-01','20:00','Sin mesa','Holder','doc','General','Pending','Pending'),
('b2000000-0000-4000-8000-000000000074','TABLE-5','Cancelled','b2000000-0000-4000-8000-000000000050','Table Event','2026-01-01','20:00','Sin mesa','Holder','doc','General','Pending','Pending'),
('b2000000-0000-4000-8000-000000000075','TABLE-6','No Show','b2000000-0000-4000-8000-000000000050','Table Event','2026-01-01','20:00','Sin mesa','Holder','doc','General','Pending','Pending');
select is((public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000070','b2000000-0000-4000-8000-000000000060')->>'changed'),'true','reassign source for occupancy');
select throws_ok($$select public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000071','b2000000-0000-4000-8000-000000000060')$$,'23505','table_already_assigned','occupied resource rejected');
select is((select resource_id::text from public.reservations where id='b2000000-0000-4000-8000-000000000070'),'b2000000-0000-4000-8000-000000000060','occupant preserved');
select is((select resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000071'),null,'conflicting reservation unchanged');
update public.reservations set status=case id when 'b2000000-0000-4000-8000-000000000072' then 'Checked In' when 'b2000000-0000-4000-8000-000000000073' then 'Completed' when 'b2000000-0000-4000-8000-000000000074' then 'Cancelled' when 'b2000000-0000-4000-8000-000000000075' then 'No Show' end where id in ('b2000000-0000-4000-8000-000000000072','b2000000-0000-4000-8000-000000000073','b2000000-0000-4000-8000-000000000074','b2000000-0000-4000-8000-000000000075');
select throws_ok($$select public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000072','b2000000-0000-4000-8000-000000000061')$$,'22023','reservation_terminal','checked in assign rejected');
select throws_ok($$select public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000073','b2000000-0000-4000-8000-000000000061')$$,'22023','reservation_terminal','completed assign rejected');
select throws_ok($$select public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000074','b2000000-0000-4000-8000-000000000061')$$,'22023','reservation_terminal','cancelled assign rejected');
select throws_ok($$select public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000075','b2000000-0000-4000-8000-000000000061')$$,'22023','reservation_terminal','no show assign rejected');
insert into public.reservations(id,code,name,event_id,event_name,date,time,table_name,holder_name,holder_document,reservation_type,payment_status,status,commercial_snapshot,table_capacity) values
('b2000000-0000-4000-8000-000000000076','REL-CI','Release CI','b2000000-0000-4000-8000-000000000050','Table Event','2026-01-01','20:00','Sin mesa','Holder','doc','General','Pending','Pending','{"case":"ci"}',5),
('b2000000-0000-4000-8000-000000000077','REL-CO','Release Completed','b2000000-0000-4000-8000-000000000050','Table Event','2026-01-01','20:00','Sin mesa','Holder','doc','General','Pending','Pending','{"case":"co"}',5),
('b2000000-0000-4000-8000-000000000078','REL-CA','Release Cancelled','b2000000-0000-4000-8000-000000000050','Table Event','2026-01-01','20:00','Sin mesa','Holder','doc','General','Pending','Pending','{"case":"ca"}',5),
('b2000000-0000-4000-8000-000000000079','REL-NS','Release No Show','b2000000-0000-4000-8000-000000000050','Table Event','2026-01-01','20:00','Sin mesa','Holder','doc','General','Pending','Pending','{"case":"ns"}',5),
('b2000000-0000-4000-8000-000000000080','REL-ST','Release Stale','b2000000-0000-4000-8000-000000000050','Table Event','2026-01-01','20:00','Sin mesa','Holder','doc','General','Pending','Pending','{"case":"stale","nested":{"v":7}}',7);
update public.reservations set resource_id='b2000000-0000-4000-8000-000000000061',event_layout_id='b2000000-0000-4000-8000-000000000059',table_id='b2000000-0000-4000-8000-000000000061',table_name='Mesa B',event_layout_resource_id='b2000000-0000-4000-8000-000000000063' where id in ('b2000000-0000-4000-8000-000000000076','b2000000-0000-4000-8000-000000000077','b2000000-0000-4000-8000-000000000078','b2000000-0000-4000-8000-000000000079','b2000000-0000-4000-8000-000000000080');
insert into public.guests(id,event_id,guest_name,reservation_name,reservation_code,reservation_id,event_name,event_status,invitation_sequence,invitation_code,carnet,delivery_status,admission_status,reservation_status,qr_status,table_id,table_name) values
('b2000000-0000-4000-8000-000000000081','b2000000-0000-4000-8000-000000000050','Release CI Guest','Holder','REL-CI','b2000000-0000-4000-8000-000000000076','Table Event','active','1','REL-CI-01','RCI','pending','Pendiente','Checked In','Activo','b2000000-0000-4000-8000-000000000061','Mesa B'),
('b2000000-0000-4000-8000-000000000082','b2000000-0000-4000-8000-000000000050','Release CO Guest','Holder','REL-CO','b2000000-0000-4000-8000-000000000077','Table Event','active','1','REL-CO-01','RCO','pending','Pendiente','Completed','Activo','b2000000-0000-4000-8000-000000000061','Mesa B'),
('b2000000-0000-4000-8000-000000000083','b2000000-0000-4000-8000-000000000050','Release CA Guest','Holder','REL-CA','b2000000-0000-4000-8000-000000000078','Table Event','active','1','REL-CA-01','RCA','pending','Pendiente','Cancelled','Activo','b2000000-0000-4000-8000-000000000061','Mesa B'),
('b2000000-0000-4000-8000-000000000084','b2000000-0000-4000-8000-000000000050','Release NS Guest','Holder','REL-NS','b2000000-0000-4000-8000-000000000079','Table Event','active','1','REL-NS-01','RNS','pending','Pendiente','No Show','Activo','b2000000-0000-4000-8000-000000000061','Mesa B'),
('b2000000-0000-4000-8000-000000000085','b2000000-0000-4000-8000-000000000050','Release ST Guest','Holder','REL-ST','b2000000-0000-4000-8000-000000000080','Table Event','active','1','REL-ST-01','RST','pending','Pendiente','Pending','Activo','b2000000-0000-4000-8000-000000000061','Mesa B');

update public.reservations set status=case id when 'b2000000-0000-4000-8000-000000000076' then 'Checked In' when 'b2000000-0000-4000-8000-000000000077' then 'Completed' when 'b2000000-0000-4000-8000-000000000078' then 'Cancelled' when 'b2000000-0000-4000-8000-000000000079' then 'No Show' else status end where id in ('b2000000-0000-4000-8000-000000000076','b2000000-0000-4000-8000-000000000077','b2000000-0000-4000-8000-000000000078','b2000000-0000-4000-8000-000000000079');
select throws_ok($$select public.release_reservation_table_atomic('b2000000-0000-4000-8000-000000000076','b2000000-0000-4000-8000-000000000061')$$,'22023','reservation_terminal','Release Checked In rejected');
select throws_ok($$select public.release_reservation_table_atomic('b2000000-0000-4000-8000-000000000077','b2000000-0000-4000-8000-000000000061')$$,'22023','reservation_terminal','Release Completed rejected');
select throws_ok($$select public.release_reservation_table_atomic('b2000000-0000-4000-8000-000000000078','b2000000-0000-4000-8000-000000000061')$$,'22023','reservation_terminal','Release Cancelled rejected');
select throws_ok($$select public.release_reservation_table_atomic('b2000000-0000-4000-8000-000000000079','b2000000-0000-4000-8000-000000000061')$$,'22023','reservation_terminal','Release No Show rejected');
select is((select resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000076'),'b2000000-0000-4000-8000-000000000061','Checked In assignment preserved');
select is((select resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000077'),'b2000000-0000-4000-8000-000000000061','Completed assignment preserved');
select is((select resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000078'),'b2000000-0000-4000-8000-000000000061','Cancelled assignment preserved');
select is((select resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000079'),'b2000000-0000-4000-8000-000000000061','No Show assignment preserved');
select is((select table_id from public.guests where reservation_id='b2000000-0000-4000-8000-000000000076'),'b2000000-0000-4000-8000-000000000061','Checked In guest assignment preserved');
select is((select table_id from public.guests where reservation_id='b2000000-0000-4000-8000-000000000077'),'b2000000-0000-4000-8000-000000000061','Completed guest assignment preserved');
select is((select table_id from public.guests where reservation_id='b2000000-0000-4000-8000-000000000078'),'b2000000-0000-4000-8000-000000000061','Cancelled guest assignment preserved');
select is((select table_id from public.guests where reservation_id='b2000000-0000-4000-8000-000000000079'),'b2000000-0000-4000-8000-000000000061','No Show guest assignment preserved');

select throws_ok($$select public.release_reservation_table_atomic('b2000000-0000-4000-8000-000000000080','b2000000-0000-4000-8000-000000000060')$$,'40001','stale_release','stale release rejected');
select is((select resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000080'),'b2000000-0000-4000-8000-000000000061','stale keeps resource');
select is((select table_id from public.reservations where id='b2000000-0000-4000-8000-000000000080'),'b2000000-0000-4000-8000-000000000061','stale keeps table');
select is((select event_layout_resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000080'),'b2000000-0000-4000-8000-000000000063','stale keeps layout');
select is((select table_capacity from public.reservations where id='b2000000-0000-4000-8000-000000000080'),7,'stale keeps capacity');
select is((select table_id from public.guests where reservation_id='b2000000-0000-4000-8000-000000000080'),'b2000000-0000-4000-8000-000000000061','stale keeps guest assignment');
select is((select commercial_snapshot from public.reservations where id='b2000000-0000-4000-8000-000000000080'),'{"case":"stale","nested":{"v":7}}'::jsonb,'stale keeps commercial snapshot');

-- T2 authorization and context isolation
insert into public.roles(id,name,slug,permissions) values
('b2000000-0000-4000-8000-000000000100','No Assign','no-assign',array['resource.manage']),
('b2000000-0000-4000-8000-000000000101','No Manage','no-manage',array['resource.assign']);
insert into auth.users(id,email,encrypted_password,raw_app_meta_data,raw_user_meta_data) values
('b2000000-0000-4000-8000-000000000102','limited@example.test','x','{}','{}'),
('b2000000-0000-4000-8000-000000000103','workspace-a@example.test','x','{}','{}');
insert into public.users(id,auth_user_id,email,display_name) values
('b2000000-0000-4000-8000-000000000104','b2000000-0000-4000-8000-000000000102','limited@example.test','Limited'),
('b2000000-0000-4000-8000-000000000105','b2000000-0000-4000-8000-000000000103','workspace-a@example.test','Workspace A');
insert into public.profiles(id,user_id,organization_id,role_id,display_name) values
('b2000000-0000-4000-8000-000000000106','b2000000-0000-4000-8000-000000000104','b2000000-0000-4000-8000-000000000010','b2000000-0000-4000-8000-000000000100','Limited'),
('b2000000-0000-4000-8000-000000000107','b2000000-0000-4000-8000-000000000105','b2000000-0000-4000-8000-000000000010','b2000000-0000-4000-8000-000000000020','Workspace A');
insert into public.roles(id,name,slug,permissions) values ('b2000000-0000-4000-8000-000000000133','No Manage Only','no-manage-only',array['resource.assign']);
insert into auth.users(id,email,encrypted_password,raw_app_meta_data,raw_user_meta_data) values ('b2000000-0000-4000-8000-000000000134','nom.manage@example.test','x','{}','{}');
insert into public.users(id,auth_user_id,email,display_name) values ('b2000000-0000-4000-8000-000000000135','b2000000-0000-4000-8000-000000000134','nom.manage@example.test','No Manage');
insert into public.profiles(id,user_id,organization_id,role_id,display_name) values ('b2000000-0000-4000-8000-000000000136','b2000000-0000-4000-8000-000000000135','b2000000-0000-4000-8000-000000000010','b2000000-0000-4000-8000-000000000133','No Manage');
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000102","role":"authenticated"}',true);
select throws_ok($$select public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000070','b2000000-0000-4000-8000-000000000060')$$,'42501','resource_permission_denied','assign without resource.assign rejected');
select is((select resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000070'),'b2000000-0000-4000-8000-000000000060','assign denied reservation unchanged');
select is((select table_id from public.guests where reservation_id='b2000000-0000-4000-8000-000000000070'),'b2000000-0000-4000-8000-000000000060','assign denied guests unchanged');
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000102","role":"authenticated"}',true);
select throws_ok($$select public.release_reservation_table_atomic('b2000000-0000-4000-8000-000000000070','b2000000-0000-4000-8000-000000000060')$$,'42501','resource_permission_denied','release without resource.assign rejected');
select is((select resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000070'),'b2000000-0000-4000-8000-000000000060','release denied reservation unchanged');
select is((select table_id from public.guests where reservation_id='b2000000-0000-4000-8000-000000000070'),'b2000000-0000-4000-8000-000000000060','release denied guests unchanged');
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000134","role":"authenticated"}',true);
select throws_ok($$select public.close_table_atomic('b2000000-0000-4000-8000-000000000061')$$,'42501','resource_permission_denied','close without resource.manage rejected');
select is((select status from public.resources where id='b2000000-0000-4000-8000-000000000061'),'active','close denied resource unchanged');
select is((select resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000070'),'b2000000-0000-4000-8000-000000000060','close denied assignment unchanged');
-- Organization B fixtures
insert into public.organizations(id,name,slug,status,timezone) values ('b2000000-0000-4000-8000-000000000110','Org B','org-b','active','UTC');
insert into public.venues(id,organization_id,name,status) values ('b2000000-0000-4000-8000-000000000111','b2000000-0000-4000-8000-000000000110','Venue B','active');
insert into public.resources(id,venue_id,type,name,capacity,status) values ('b2000000-0000-4000-8000-000000000112','b2000000-0000-4000-8000-000000000111','table','B Table',4,'active');
insert into public.venue_layouts(id,venue_id,name,status) values ('b2000000-0000-4000-8000-000000000113','b2000000-0000-4000-8000-000000000111','B Layout','active');
insert into public.venue_layout_resources(id,venue_layout_id,type,name,capacity,status,source_resource_id) values ('b2000000-0000-4000-8000-000000000114','b2000000-0000-4000-8000-000000000113','table','B Table',4,'active','b2000000-0000-4000-8000-000000000112');
insert into public.events(id,organization_id,name,event_type,status,start_at,timezone,venue,operational_model) values ('b2000000-0000-4000-8000-000000000115','b2000000-0000-4000-8000-000000000110','Event B','event','active','2026-01-02T00:00:00Z','UTC','Venue B','general');
insert into public.event_layouts(id,event_id,venue_id,name,status) values ('b2000000-0000-4000-8000-000000000116','b2000000-0000-4000-8000-000000000115','b2000000-0000-4000-8000-000000000111','B Event Layout','active');
insert into public.event_layout_resources(id,event_layout_id,source_venue_layout_resource_id,type,name,capacity,status) values ('b2000000-0000-4000-8000-000000000117','b2000000-0000-4000-8000-000000000116','b2000000-0000-4000-8000-000000000114','table','B Table',4,'active');
insert into public.reservations(id,code,name,event_id,event_name,date,time,table_name,holder_name,holder_document,reservation_type,payment_status,status,resource_id,table_id,event_layout_resource_id,event_layout_id,table_capacity) values ('b2000000-0000-4000-8000-000000000118','B-RES','B Reservation','b2000000-0000-4000-8000-000000000115','Event B','2026-01-02','20:00','B Table','Holder','doc','General','Pending','Pending','b2000000-0000-4000-8000-000000000112','b2000000-0000-4000-8000-000000000112','b2000000-0000-4000-8000-000000000117','b2000000-0000-4000-8000-000000000116',4);
insert into public.guests(id,event_id,guest_name,reservation_name,reservation_code,reservation_id,event_name,event_status,invitation_sequence,invitation_code,carnet,delivery_status,admission_status,reservation_status,qr_status,table_id,table_name) values ('b2000000-0000-4000-8000-000000000119','b2000000-0000-4000-8000-000000000115','B Guest','Holder','B-RES','b2000000-0000-4000-8000-000000000118','Event B','active','1','B-RES-01','B','pending','Pendiente','Pending','Activo','b2000000-0000-4000-8000-000000000112','B Table');
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000103","role":"authenticated"}',true);
select throws_ok($$select public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000118','b2000000-0000-4000-8000-000000000112')$$,'42501','reservation_forbidden','cross-workspace assign rejected');
select is((select resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000118'),'b2000000-0000-4000-8000-000000000112','cross-workspace assign atomic');
select throws_ok($$select public.release_reservation_table_atomic('b2000000-0000-4000-8000-000000000118','b2000000-0000-4000-8000-000000000112')$$,'42501','reservation_forbidden','cross-workspace release rejected');
select is((select table_id from public.reservations where id='b2000000-0000-4000-8000-000000000118'),'b2000000-0000-4000-8000-000000000112','cross-workspace release atomic');
select throws_ok($$select public.close_table_atomic('b2000000-0000-4000-8000-000000000112')$$,'42501','resource_forbidden','cross-workspace close rejected');
select is((select status from public.resources where id='b2000000-0000-4000-8000-000000000112'),'active','cross-workspace close atomic');
-- Same-organization resources reserved by a different event / venue
insert into public.resources(id,venue_id,type,name,capacity,status) values ('b2000000-0000-4000-8000-000000000126','b2000000-0000-4000-8000-000000000055','table','A2 Table',6,'active');
insert into public.venue_layout_resources(id,venue_layout_id,type,name,capacity,status,source_resource_id) values ('b2000000-0000-4000-8000-000000000128','b2000000-0000-4000-8000-000000000056','table','A2 Table',6,'active','b2000000-0000-4000-8000-000000000126');
insert into public.venues(id,organization_id,name,status) values ('b2000000-0000-4000-8000-000000000129','b2000000-0000-4000-8000-000000000010','Venue A2','active');
insert into public.resources(id,venue_id,type,name,capacity,status) values ('b2000000-0000-4000-8000-000000000130','b2000000-0000-4000-8000-000000000129','table','Other Venue Table',3,'active');
insert into public.venue_layouts(id,venue_id,name,status) values ('b2000000-0000-4000-8000-000000000131','b2000000-0000-4000-8000-000000000129','Other Venue Layout','active');
insert into public.venue_layout_resources(id,venue_layout_id,type,name,capacity,status,source_resource_id) values ('b2000000-0000-4000-8000-000000000132','b2000000-0000-4000-8000-000000000131','table','Other Venue Table',3,'active','b2000000-0000-4000-8000-000000000130');
-- Same user/org, different event/resource context
insert into public.events(id,organization_id,name,event_type,status,start_at,timezone,venue,operational_model) values ('b2000000-0000-4000-8000-000000000122','b2000000-0000-4000-8000-000000000010','Event A2','event','active','2026-01-03T00:00:00Z','UTC','Venue','general');
-- Event B2 uses existing resource B with its own mapping; Reservation remains in Event A.
insert into public.event_layouts(id,event_id,venue_id,name,status) values ('b2000000-0000-4000-8000-000000000123','b2000000-0000-4000-8000-000000000122','b2000000-0000-4000-8000-000000000055','Event A2 Layout','active');
insert into public.event_layout_resources(id,event_layout_id,source_venue_layout_resource_id,type,name,capacity,status) values ('b2000000-0000-4000-8000-000000000124','b2000000-0000-4000-8000-000000000123','b2000000-0000-4000-8000-000000000128','table','A2 Table',6,'active');
insert into public.reservations(id,code,name,event_id,event_name,date,time,table_name,holder_name,holder_document,reservation_type,payment_status,status) values ('b2000000-0000-4000-8000-000000000125','A2-RES','A2 Reservation','b2000000-0000-4000-8000-000000000050','Table Event','2026-01-01','20:00','Sin mesa','Holder','doc','General','Pending','Pending');
select throws_ok($$select public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000125','b2000000-0000-4000-8000-000000000126')$$,'P0002','event_layout_resource_not_found','cross-event assign rejected');
select is((select resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000125'),null,'cross-event reservation atomic');
select is((select count(*)::int from public.event_layout_resources where id='b2000000-0000-4000-8000-000000000117'),1,'cross-event layout B unchanged');
-- Cross-venue is constrained by the EventLayoutResource chain: no mapping exists for Venue B resource in Event A.
select throws_ok($$select public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000125','b2000000-0000-4000-8000-000000000130')$$,'P0002','event_layout_resource_not_found','cross-venue rejected by context invariant');

-- T3 same-destination consistency and frozen snapshots
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000070','b2000000-0000-4000-8000-000000000060')->>'changed'),'false','coherent same destination idempotent');
select is((select resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000070'),'b2000000-0000-4000-8000-000000000060','coherent resource preserved');
select is((select table_id from public.reservations where id='b2000000-0000-4000-8000-000000000070'),'b2000000-0000-4000-8000-000000000060','coherent table preserved');
select is((select event_layout_resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000070'),'b2000000-0000-4000-8000-000000000062','coherent layout preserved');
select is((select table_capacity from public.reservations where id='b2000000-0000-4000-8000-000000000070'),5,'coherent capacity preserved');
select is((select table_id from public.guests where reservation_id='b2000000-0000-4000-8000-000000000070'),'b2000000-0000-4000-8000-000000000060','coherent guest preserved');
update public.resources set capacity=9 where id='b2000000-0000-4000-8000-000000000060';
select is((public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000070','b2000000-0000-4000-8000-000000000060')->>'changed'),'false','frozen capacity remains coherent');
select is((select table_capacity from public.reservations where id='b2000000-0000-4000-8000-000000000070'),5,'historical table capacity preserved');
update public.reservations set event_layout_resource_id='b2000000-0000-4000-8000-000000000063' where id='b2000000-0000-4000-8000-000000000070';
select throws_ok($$select public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000070','b2000000-0000-4000-8000-000000000060')$$,'22023','assignment_consistency_error','corrupt layout rejected');
select is((select event_layout_resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000070'),'b2000000-0000-4000-8000-000000000063','corrupt layout not repaired');
select is((select resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000070'),'b2000000-0000-4000-8000-000000000060','layout rejection resource preserved');
select is((select table_capacity from public.reservations where id='b2000000-0000-4000-8000-000000000070'),5,'layout rejection capacity preserved');
update public.reservations set event_layout_resource_id='b2000000-0000-4000-8000-000000000062' where id='b2000000-0000-4000-8000-000000000070';
update public.guests set table_id='b2000000-0000-4000-8000-000000000061',table_name='Mesa B' where reservation_id='b2000000-0000-4000-8000-000000000070';
select throws_ok($$select public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000070','b2000000-0000-4000-8000-000000000060')$$,'22023','assignment_consistency_error','corrupt guest rejected');
select is((select table_id from public.guests where reservation_id='b2000000-0000-4000-8000-000000000070'),'b2000000-0000-4000-8000-000000000061','corrupt guest not repaired');
select is((select resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000070'),'b2000000-0000-4000-8000-000000000060','guest rejection reservation preserved');
select is((select event_layout_resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000070'),'b2000000-0000-4000-8000-000000000062','guest rejection layout preserved');
update public.guests set table_id='b2000000-0000-4000-8000-000000000060',table_name='Mesa A' where reservation_id='b2000000-0000-4000-8000-000000000070';
update public.resources set capacity=5 where id='b2000000-0000-4000-8000-000000000060';
insert into public.resources(id,venue_id,type,name,capacity,status) values ('b2000000-0000-4000-8000-000000000150','b2000000-0000-4000-8000-000000000055','table','T4 Move Table',6,'active');
insert into public.venue_layout_resources(id,venue_layout_id,type,name,capacity,status,source_resource_id) values ('b2000000-0000-4000-8000-000000000151','b2000000-0000-4000-8000-000000000056','table','T4 Move Table',6,'active','b2000000-0000-4000-8000-000000000150');
insert into public.event_layout_resources(id,event_layout_id,source_venue_layout_resource_id,type,name,capacity,status) values ('b2000000-0000-4000-8000-000000000152','b2000000-0000-4000-8000-000000000059','b2000000-0000-4000-8000-000000000151','table','T4 Move Table',6,'active');
-- T4 preservation: commercial/admission/QR fields and assigned Close.
update public.reservations set commercial_snapshot='{"phase":"t4","nested":{"marker":"KEEP"}}'::jsonb where id='b2000000-0000-4000-8000-000000000070';
select is((public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000070','b2000000-0000-4000-8000-000000000060')->>'changed'),'false','T4 coherent assign');
select is((select commercial_snapshot from public.reservations where id='b2000000-0000-4000-8000-000000000070'),'{"phase":"t4","nested":{"marker":"KEEP"}}'::jsonb,'T4 assign commercial preserved');
select is((public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000070','b2000000-0000-4000-8000-000000000150')->>'changed'),'true','T4 move');
select is((select commercial_snapshot from public.reservations where id='b2000000-0000-4000-8000-000000000070'),'{"phase":"t4","nested":{"marker":"KEEP"}}'::jsonb,'T4 move commercial preserved');
select is((public.release_reservation_table_atomic('b2000000-0000-4000-8000-000000000070','b2000000-0000-4000-8000-000000000150')->>'changed'),'true','T4 release');
select is((select table_capacity from public.reservations where id='b2000000-0000-4000-8000-000000000070'),6,'T4 release capacity preserved');
select is((select commercial_snapshot from public.reservations where id='b2000000-0000-4000-8000-000000000070'),'{"phase":"t4","nested":{"marker":"KEEP"}}'::jsonb,'T4 release commercial preserved');
update public.guests set admission_status='T4-ADMISSION',qr_status='T4-QR' where reservation_id='b2000000-0000-4000-8000-000000000080';
insert into public.checkins(id,guest_id,reservation_id,event_id,access_type,method,checked_in_at,operator,gate,notes,audit_trail,reentry_allowed,max_entries,attempt_count,status,source) values ('b2000000-0000-4000-8000-000000000140','b2000000-0000-4000-8000-000000000085','b2000000-0000-4000-8000-000000000080','b2000000-0000-4000-8000-000000000050','general','manual','2026-01-01T20:01:00Z','operator','gate','sentinel','{"marker":"KEEP-CHECKIN"}',true,3,1,'completed','t4');
select is((public.close_table_atomic('b2000000-0000-4000-8000-000000000061')->>'changed'),'true','assigned close changed');
select is((select resource_id from public.reservations where id='b2000000-0000-4000-8000-000000000080'),'b2000000-0000-4000-8000-000000000061','assigned close preserves reservation');
select is((select table_id from public.guests where reservation_id='b2000000-0000-4000-8000-000000000080'),'b2000000-0000-4000-8000-000000000061','assigned close preserves guest');
select is((select audit_trail from public.checkins where id='b2000000-0000-4000-8000-000000000140'),'{"marker":"KEEP-CHECKIN"}'::jsonb,'assigned close preserves checkin');
select is((public.close_table_atomic('b2000000-0000-4000-8000-000000000061')->>'changed'),'false','second assigned close idempotent');
select is((select commercial_snapshot from public.reservations where id='b2000000-0000-4000-8000-000000000080'),'{"case":"stale","nested":{"v":7}}'::jsonb,'second close commercial preserved');
select is((select admission_status from public.guests where reservation_id='b2000000-0000-4000-8000-000000000080'),'T4-ADMISSION','close admission preserved');
select is((select qr_status from public.guests where reservation_id='b2000000-0000-4000-8000-000000000080'),'T4-QR','close QR preserved');
select is((select audit_trail from public.checkins where id='b2000000-0000-4000-8000-000000000140'),'{"marker":"KEEP-CHECKIN"}'::jsonb,'second close checkin preserved');
select is((public.close_table_atomic('b2000000-0000-4000-8000-000000000060')->>'status'),'Closed','close succeeds');
select is((select status from public.resources where id='b2000000-0000-4000-8000-000000000060'),'Closed','closed state persists');
select is((public.close_table_atomic('b2000000-0000-4000-8000-000000000060')->>'changed'),'false','second close idempotent');
select throws_ok($$select public.assign_reservation_table_atomic('b2000000-0000-4000-8000-000000000070','b2000000-0000-4000-8000-000000000060')$$,'22023','table_closed','closed destination rejected');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.close_table_atomic('b2000000-0000-4000-8000-000000000061')$$,'28000','reservation_unauthenticated','unauthenticated close rejected');
select * from finish(); rollback;
