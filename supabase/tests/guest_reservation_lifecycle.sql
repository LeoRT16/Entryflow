begin;
create extension if not exists pgtap;
select plan(48);

select ok(has_function_privilege('authenticated', 'public.soft_delete_guest(uuid)', 'EXECUTE'), 'authenticated executes guest delete');
select ok(not has_function_privilege('anon', 'public.soft_delete_guest(uuid)', 'EXECUTE'), 'anon cannot execute guest delete');
select ok(has_function_privilege('authenticated', 'public.soft_delete_reservation(uuid)', 'EXECUTE'), 'authenticated executes reservation delete');
select ok(not has_function_privilege('public', 'public.soft_delete_reservation(uuid)', 'EXECUTE'), 'PUBLIC cannot execute reservation delete');
select ok(has_function_privilege('authenticated', 'public.cancel_reservation_atomic(uuid)', 'EXECUTE'), 'authenticated executes reservation cancel');
select ok(not has_function_privilege('service_role', 'public.cancel_reservation_atomic(uuid)', 'EXECUTE'), 'service role cannot execute reservation cancel');

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'lifecycle-owner@entryflow.test'),
  ('a1000000-0000-4000-8000-000000000002', 'lifecycle-foreign@entryflow.test');
insert into public.roles (id, name, slug, permissions) values
  ('a1100000-0000-4000-8000-000000000001', 'Lifecycle manager', 'lifecycle-manager-a1', array['guest.remove','reservation.cancel']);
insert into public.organizations (id, name, slug, status, timezone) values
  ('a1200000-0000-4000-8000-000000000001', 'Lifecycle owner', 'lifecycle-owner-a1', 'active', 'America/La_Paz'),
  ('a1200000-0000-4000-8000-000000000002', 'Lifecycle foreign', 'lifecycle-foreign-a1', 'active', 'America/La_Paz');
insert into public.users (id, auth_user_id, email, display_name) values
  ('a1300000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'lifecycle-owner@entryflow.test', 'Lifecycle Owner'),
  ('a1300000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'lifecycle-foreign@entryflow.test', 'Lifecycle Foreign');
insert into public.profiles (id, user_id, organization_id, role_id, display_name) values
  ('a1400000-0000-4000-8000-000000000001', 'a1300000-0000-4000-8000-000000000001', 'a1200000-0000-4000-8000-000000000001', 'a1100000-0000-4000-8000-000000000001', 'Lifecycle Owner'),
  ('a1400000-0000-4000-8000-000000000002', 'a1300000-0000-4000-8000-000000000002', 'a1200000-0000-4000-8000-000000000002', 'a1100000-0000-4000-8000-000000000001', 'Lifecycle Foreign');
insert into public.venues (id, organization_id, name, status) values
  ('a1500000-0000-4000-8000-000000000001', 'a1200000-0000-4000-8000-000000000001', 'Lifecycle venue', 'active'),
  ('a1500000-0000-4000-8000-000000000002', 'a1200000-0000-4000-8000-000000000002', 'Foreign venue', 'active');
insert into public.events (id, organization_id, venue_id, name, event_type, status, start_at, timezone, venue, operational_model) values
  ('a1600000-0000-4000-8000-000000000001', 'a1200000-0000-4000-8000-000000000001', 'a1500000-0000-4000-8000-000000000001', 'Lifecycle event', 'nightlife', 'published', '2026-09-10T20:00:00-04:00', 'America/La_Paz', 'Lifecycle venue', 'mixed'),
  ('a1600000-0000-4000-8000-000000000002', 'a1200000-0000-4000-8000-000000000002', 'a1500000-0000-4000-8000-000000000002', 'Foreign event', 'nightlife', 'published', '2026-09-10T20:00:00-04:00', 'America/La_Paz', 'Foreign venue', 'mixed');
insert into public.tables (id, name, capacity, location, status, event_id, reservation_ids, guest_ids) values
  ('a1700000-0000-4000-8000-000000000001', 'Lifecycle table', 10, 'Patio', 'Reserved', 'a1600000-0000-4000-8000-000000000001', array['a2000000-0000-4000-8000-000000000001'], array['a3000000-0000-4000-8000-000000000001']),
  ('a1700000-0000-4000-8000-000000000002', 'Cancel table', 10, 'Patio', 'Reserved', 'a1600000-0000-4000-8000-000000000001', array['a4000000-0000-4000-8000-000000000001'], array['a5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002']);

insert into public.reservations (id, code, name, event_id, event_name, date, time, table_name, table_id, holder_name, reservation_type, payment_status, amount, advance, status, guest_ids, commercial_snapshot, reference, notes, timeline) values
  ('a2000000-0000-4000-8000-000000000001','G-PARENT','Guest parent','a1600000-0000-4000-8000-000000000001','Lifecycle event','2026-09-10','20:00','Lifecycle table','a1700000-0000-4000-8000-000000000001','Owner','Mesa','Pendiente','0','0','Pending',array['a3000000-0000-4000-8000-000000000001'],'null',null,'','[]'),
  ('a2000000-0000-4000-8000-000000000002','G-HISTORY','Guest history parent','a1600000-0000-4000-8000-000000000001','Lifecycle event','2026-09-10','20:00','','','Owner','Mesa','Pendiente','0','0','Pending',array[]::text[],null,null,'','[]'),
  ('a2100000-0000-4000-8000-000000000001','D-CLEAN','Clean draft','a1600000-0000-4000-8000-000000000001','Lifecycle event','2026-09-10','20:00','Lifecycle table','a1700000-0000-4000-8000-000000000001','Owner','Mesa','Pendiente','0','0','Draft',array[]::text[],null,null,'','[]'),
  ('a2100000-0000-4000-8000-000000000002','D-GUEST','Draft guest','a1600000-0000-4000-8000-000000000001','Lifecycle event','2026-09-10','20:00','','','Owner','Mesa','Pendiente','0','0','Draft',array[]::text[],null,null,'','[]'),
  ('a2100000-0000-4000-8000-000000000003','D-COM','Draft commercial','a1600000-0000-4000-8000-000000000001','Lifecycle event','2026-09-10','20:00','','','Owner','Mesa','Pendiente','0','0','Draft',array[]::text[],jsonb_build_object('currency','BOB'),null,'','[]'),
  ('a2100000-0000-4000-8000-000000000004','D-EXTRA','Draft extra','a1600000-0000-4000-8000-000000000001','Lifecycle event','2026-09-10','20:00','','','Owner','Mesa','Pendiente','0','0','Draft',array[]::text[],null,null,'','[]'),
  ('a2100000-0000-4000-8000-000000000005','D-TIME','Draft timeline','a1600000-0000-4000-8000-000000000001','Lifecycle event','2026-09-10','20:00','','','Owner','Mesa','Pendiente','0','0','Draft',array[]::text[],null,null,'','[]'),
  ('a2100000-0000-4000-8000-000000000006','PENDING','Pending','a1600000-0000-4000-8000-000000000001','Lifecycle event','2026-09-10','20:00','','','Owner','Mesa','Pendiente','0','0','Pending',array[]::text[],null,null,'','[]'),
  ('a2100000-0000-4000-8000-000000000007','COMPLETED','Completed','a1600000-0000-4000-8000-000000000001','Lifecycle event','2026-09-10','20:00','','','Owner','Mesa','Pendiente','0','0','Completed',array[]::text[],null,null,'','[]'),
  ('a2100000-0000-4000-8000-000000000008','FOREIGN','Foreign draft','a1600000-0000-4000-8000-000000000002','Foreign event','2026-09-10','20:00','','','Owner','Mesa','Pendiente','0','0','Draft',array[]::text[],null,null,'','[]'),
  ('a2100000-0000-4000-8000-000000000009','D-ACTIVITY','Draft activity','a1600000-0000-4000-8000-000000000001','Lifecycle event','2026-09-10','20:00','','','Owner','Mesa','Pendiente','0','0','Draft',array[]::text[],null,null,'','[]'),
  ('a4000000-0000-4000-8000-000000000001','C-PENDING','Cancel pending','a1600000-0000-4000-8000-000000000001','Lifecycle event','2026-09-10','20:00','Cancel table','a1700000-0000-4000-8000-000000000002','Owner','Mesa','Pendiente','100','0','Pending',array['a5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002'],jsonb_build_object('currency','BOB'),null,'','[]'),
  ('a4000000-0000-4000-8000-000000000002','C-CONFIRM','Cancel confirmed','a1600000-0000-4000-8000-000000000001','Lifecycle event','2026-09-10','20:00','','','Owner','Mesa','Pagado','100','100','Confirmed',array[]::text[],jsonb_build_object('currency','BOB'),null,'','[]'),
  ('a4000000-0000-4000-8000-000000000003','C-TERM','Cancel terminal','a1600000-0000-4000-8000-000000000001','Lifecycle event','2026-09-10','20:00','','','Owner','Mesa','Pagado','100','100','No Show',array[]::text[],jsonb_build_object('currency','BOB'),null,'','[]'),
  ('a4000000-0000-4000-8000-000000000004','C-EXTRA','Cancel extras','a1600000-0000-4000-8000-000000000001','Lifecycle event','2026-09-10','20:00','','','Owner','Mesa','Pagado','100','100','Confirmed',array[]::text[],jsonb_build_object('currency','BOB'),null,'','[]');

insert into public.guests (id,event_id,guest_name,reservation_name,reservation_code,reservation_id,event_name,table_id,event_status,invitation_sequence,invitation_code,carnet,delivery_status,admission_status,reservation_status,qr_status,delivery_history,operator_activity,deleted_at) values
  ('a3000000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000001','Clean','Guest parent','G-PARENT','a2000000-0000-4000-8000-000000000001','Lifecycle event','a1700000-0000-4000-8000-000000000001','Próximo','1 de 1','A-G-01','CI','Pendiente de envío','Pendiente','Pending','Válido','[]','[]',null),
  ('a3000000-0000-4000-8000-000000000002','a1600000-0000-4000-8000-000000000001','Checkin','Guest history parent','G-HISTORY','a2000000-0000-4000-8000-000000000002','Lifecycle event',null,'Próximo','1','A-G-02','CI','Pendiente de envío','Pendiente','Pending','Válido','[]','[]',null),
  ('a3000000-0000-4000-8000-000000000003','a1600000-0000-4000-8000-000000000001','WhatsApp','Guest history parent','G-HISTORY','a2000000-0000-4000-8000-000000000002','Lifecycle event',null,'Próximo','1','A-G-03','CI','Pendiente de envío','Pendiente','Pending','Válido','[]','[]',null),
  ('a3000000-0000-4000-8000-000000000004','a1600000-0000-4000-8000-000000000001','Timeline','Guest history parent','G-HISTORY','a2000000-0000-4000-8000-000000000002','Lifecycle event',null,'Próximo','1','A-G-04','CI','Pendiente de envío','Pendiente','Pending','Válido','[]','[]',null),
  ('a3000000-0000-4000-8000-000000000005','a1600000-0000-4000-8000-000000000001','Embedded','Guest history parent','G-HISTORY','a2000000-0000-4000-8000-000000000002','Lifecycle event',null,'Próximo','1','A-G-05','CI','Pendiente de envío','Pendiente','Pending','Válido','[{"title":"sent"}]','[]',null),
  ('a3000000-0000-4000-8000-000000000006','a1600000-0000-4000-8000-000000000001','Extra','Guest history parent','G-HISTORY','a2000000-0000-4000-8000-000000000002','Lifecycle event',null,'Próximo','1','A-G-06','CI','Pendiente de envío','Pendiente','Pending','Válido','[]','[]',null),
  ('a3000000-0000-4000-8000-000000000007','a1600000-0000-4000-8000-000000000002','Foreign','Foreign draft','FOREIGN','a2100000-0000-4000-8000-000000000008','Foreign event',null,'Próximo','1','A-G-07','CI','Pendiente de envío','Pendiente','Pending','Válido','[]','[]',null),
  ('a3000000-0000-4000-8000-000000000008','a1600000-0000-4000-8000-000000000001','Deleted','Guest history parent','G-HISTORY','a2000000-0000-4000-8000-000000000002','Lifecycle event',null,'Próximo','1','A-G-08','CI','Pendiente de envío','Pendiente','Pending','Válido','[]','[]',now()),
  ('a3000000-0000-4000-8000-000000000009','a1600000-0000-4000-8000-000000000001','Draft guest','Draft guest','D-GUEST','a2100000-0000-4000-8000-000000000002','Lifecycle event',null,'Próximo','1','A-G-09','CI','Pendiente de envío','Pendiente','Draft','Válido','[]','[]',now()),
  ('a3000000-0000-4000-8000-000000000010','a1600000-0000-4000-8000-000000000001','Activity','Guest history parent','G-HISTORY','a2000000-0000-4000-8000-000000000002','Lifecycle event',null,'Próximo','1','A-G-12','CI','Pendiente de envío','Pendiente','Pending','Válido','[]','[]',null),
  ('a3000000-0000-4000-8000-000000000011','a1600000-0000-4000-8000-000000000001','Operator','Guest history parent','G-HISTORY','a2000000-0000-4000-8000-000000000002','Lifecycle event',null,'Próximo','1','A-G-13','CI','Pendiente de envío','Pendiente','Pending','Válido','[]','[{"action":"created"}]',null),
  ('a5000000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000001','Pending guest','Cancel pending','C-PENDING','a4000000-0000-4000-8000-000000000001','Lifecycle event','a1700000-0000-4000-8000-000000000002','Próximo','1','A-G-10','CI','Enviada','Pendiente','Pending','Válido','[]','[]',null),
  ('a5000000-0000-4000-8000-000000000002','a1600000-0000-4000-8000-000000000001','Entered guest','Cancel pending','C-PENDING','a4000000-0000-4000-8000-000000000001','Lifecycle event','a1700000-0000-4000-8000-000000000002','Próximo','2','A-G-11','CI','Enviada','Ingresó','Pending','Usado','[]','[]',null);

insert into public.checkins (id,guest_id,reservation_id,event_id,method,checked_in_at,operator,status) values
  ('a6000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002','a1600000-0000-4000-8000-000000000001','Manual','20:00','Owner','Checked In'),
  ('a6000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000001','Manual','20:00','Owner','Checked In');
insert into public.whatsapp_delivery_attempts (id,organization_id,event_id,guest_id,reservation_id,message_id,delivery_status,template_name,template_language) values
  ('a6100000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000002','lifecycle-message-a1','accepted','invite','es');
insert into public.timeline_events (id,event_id,timestamp,kind,icon,tone,title,description,reservation_id,guest_id) values
  ('a6200000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000001','20:00','guest.test','guest','info','Guest history','History',null,'a3000000-0000-4000-8000-000000000004'),
  ('a6200000-0000-4000-8000-000000000002','a1600000-0000-4000-8000-000000000001','20:00','reservation.test','reservation','info','Reservation history','History','a2100000-0000-4000-8000-000000000005',null);
insert into public.activity_logs (id,event_id,timestamp,kind,icon,tone,title,description,reservation_id,guest_id) values
  ('a6200000-0000-4000-8000-000000000003','a1600000-0000-4000-8000-000000000001','20:00','guest.test','guest','info','Guest activity','History',null,'a3000000-0000-4000-8000-000000000010'),
  ('a6200000-0000-4000-8000-000000000004','a1600000-0000-4000-8000-000000000001','20:00','reservation.test','reservation','info','Reservation activity','History','a2100000-0000-4000-8000-000000000009',null);
insert into public.reservation_extra_wristband_sales (id,reservation_id,event_id,quantity,unit_price,total_price,currency,status) values
  ('a6300000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000004','a1600000-0000-4000-8000-000000000001',1,10,10,'BOB','cancelled'),
  ('a6300000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000004','a1600000-0000-4000-8000-000000000001',1,10,10,'BOB','active'),
  ('a6300000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000002','a1600000-0000-4000-8000-000000000001',1,10,10,'BOB','cancelled');
update public.guests set extra_wristband_sale_id='a6300000-0000-4000-8000-000000000003' where id='a3000000-0000-4000-8000-000000000006';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select is(public.soft_delete_guest('a3000000-0000-4000-8000-000000000001'),true,'clean Guest deletes');
select is((select count(*) from public.guests where id='a3000000-0000-4000-8000-000000000001'),0::bigint,'deleted Guest hidden by SELECT');
select is((select 'a3000000-0000-4000-8000-000000000001'=any(guest_ids) from public.reservations where id='a2000000-0000-4000-8000-000000000001'),false,'reservation guest_ids cleaned');
select is((select 'a3000000-0000-4000-8000-000000000001'=any(guest_ids) from public.tables where id='a1700000-0000-4000-8000-000000000001'),false,'table guest_ids cleaned');
select throws_ok($$select public.soft_delete_guest('a3000000-0000-4000-8000-000000000002')$$,'P0001','guest_has_history','Guest check-in blocks delete');
select throws_ok($$select public.soft_delete_guest('a3000000-0000-4000-8000-000000000003')$$,'P0001','guest_has_history','Guest WhatsApp blocks delete');
select throws_ok($$select public.soft_delete_guest('a3000000-0000-4000-8000-000000000004')$$,'P0001','guest_has_history','Guest timeline blocks delete');
select throws_ok($$select public.soft_delete_guest('a3000000-0000-4000-8000-000000000005')$$,'P0001','guest_has_history','Guest embedded history blocks delete');
select throws_ok($$select public.soft_delete_guest('a3000000-0000-4000-8000-000000000006')$$,'P0001','guest_has_history','extra-sale Guest blocks delete');
select throws_ok($$select public.soft_delete_guest('a3000000-0000-4000-8000-000000000010')$$,'P0001','guest_has_history','Guest activity log blocks delete');
select throws_ok($$select public.soft_delete_guest('a3000000-0000-4000-8000-000000000011')$$,'P0001','guest_has_history','Guest operator history blocks delete');
select throws_ok($$select public.soft_delete_guest('a3000000-0000-4000-8000-000000000007')$$,'42501','guest_forbidden','foreign Guest forbidden');
select throws_ok($$select public.soft_delete_guest('a3000000-0000-4000-8000-000000000008')$$,'P0002','guest_already_deleted','deleted Guest explicit');

select is(public.soft_delete_reservation('a2100000-0000-4000-8000-000000000001'),true,'clean Draft deletes');
select is((select count(*) from public.reservations where id='a2100000-0000-4000-8000-000000000001'),0::bigint,'deleted Draft hidden by SELECT');
select throws_ok($$select public.soft_delete_reservation('a2100000-0000-4000-8000-000000000002')$$,'P0001','reservation_has_history','historical Guest blocks Draft delete');
select throws_ok($$select public.soft_delete_reservation('a2100000-0000-4000-8000-000000000003')$$,'P0001','reservation_has_history','commercial snapshot blocks Draft delete');
select throws_ok($$select public.soft_delete_reservation('a2100000-0000-4000-8000-000000000004')$$,'P0001','reservation_has_history','extra sale blocks Draft delete');
select throws_ok($$select public.soft_delete_reservation('a2100000-0000-4000-8000-000000000005')$$,'P0001','reservation_has_history','timeline blocks Draft delete');
select throws_ok($$select public.soft_delete_reservation('a2100000-0000-4000-8000-000000000009')$$,'P0001','reservation_has_history','activity blocks Draft delete');
select throws_ok($$select public.soft_delete_reservation('a2100000-0000-4000-8000-000000000006')$$,'P0001','reservation_not_draft','Pending cannot delete');
select throws_ok($$select public.soft_delete_reservation('a2100000-0000-4000-8000-000000000007')$$,'P0001','reservation_not_draft','terminal Reservation cannot delete');
select throws_ok($$select public.soft_delete_reservation('a4000000-0000-4000-8000-000000000003')$$,'P0001','reservation_not_draft','No Show cannot delete');
select throws_ok($$select public.soft_delete_reservation('a2100000-0000-4000-8000-000000000008')$$,'42501','reservation_forbidden','foreign Reservation forbidden');

select is(public.cancel_reservation_atomic('a4000000-0000-4000-8000-000000000001'),true,'Pending Reservation cancels');
select is((select status from public.reservations where id='a4000000-0000-4000-8000-000000000001'),'Cancelled','Reservation is Cancelled');
select throws_ok($$select public.soft_delete_reservation('a4000000-0000-4000-8000-000000000001')$$,'P0001','reservation_not_draft','Cancelled Reservation cannot delete');
select is((select admission_status from public.guests where id='a5000000-0000-4000-8000-000000000001'),'Anulada','pending Guest cancelled');
select is((select admission_status from public.guests where id='a5000000-0000-4000-8000-000000000002'),'Ingresó','entered Guest admission preserved');
select is((select qr_status from public.guests where id='a5000000-0000-4000-8000-000000000002'),'Usado','entered Guest QR preserved');
select is((select status from public.tables where id='a1700000-0000-4000-8000-000000000002'),'Available','table released');
select is((select count(*) from public.timeline_events where reservation_id='a4000000-0000-4000-8000-000000000001' and kind='reservation.cancelled'),1::bigint,'cancel timeline persisted');
select is(public.cancel_reservation_atomic('a4000000-0000-4000-8000-000000000002'),true,'Confirmed Reservation cancels');
select throws_ok($$select public.cancel_reservation_atomic('a4000000-0000-4000-8000-000000000003')$$,'P0001','reservation_already_terminal','terminal cancel rejected');
select throws_ok($$select public.cancel_reservation_atomic('a4000000-0000-4000-8000-000000000004')$$,'P0001','reservation_has_active_extras','active extras must cancel first');
select is((select status from public.reservations where id='a4000000-0000-4000-8000-000000000004'),'Confirmed','failed cancel leaves Reservation unchanged');

select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.soft_delete_guest('a3000000-0000-4000-8000-000000000002')$$,'28000','guest_unauthenticated','unauthenticated Guest delete rejected');
select throws_ok($$select public.soft_delete_reservation('a2100000-0000-4000-8000-000000000006')$$,'28000','reservation_unauthenticated','unauthenticated Reservation delete rejected');
select throws_ok($$select public.cancel_reservation_atomic('a4000000-0000-4000-8000-000000000004')$$,'28000','reservation_unauthenticated','unauthenticated cancel rejected');

reset role;
select is((select proowner::regrole::text from pg_proc where oid='public.soft_delete_guest(uuid)'::regprocedure),'postgres','Guest RPC owner controlled');
select is((select proowner::regrole::text from pg_proc where oid='public.soft_delete_reservation(uuid)'::regprocedure),'postgres','Reservation delete RPC owner controlled');
select is((select proowner::regrole::text from pg_proc where oid='public.cancel_reservation_atomic(uuid)'::regprocedure),'postgres','Reservation cancel RPC owner controlled');
select * from finish();
rollback;
