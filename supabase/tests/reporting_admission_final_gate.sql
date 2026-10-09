begin;
create extension if not exists pgtap;
select plan(25);

-- Synthetic identities and tenant.
insert into auth.users(id,email) values
 ('f9000000-0000-0000-0000-000000000001','door-final@test'),
 ('f9000000-0000-0000-0000-000000000002','admin-final@test'),
 ('f9000000-0000-0000-0000-000000000003','unauthorized-final@test'),
 ('f9000000-0000-0000-0000-000000000004','other-final@test');
insert into roles(id,name,slug,permissions) values
 ('f9000000-0000-0000-0000-000000000010','Door','door',array['checkin.perform']),
 ('f9000000-0000-0000-0000-000000000011','Admin','administrator',array['event.edit','organization.manage','reservation.edit']),
 ('f9000000-0000-0000-0000-000000000012','No permissions','none',array[]::text[]);
insert into organizations(id,name,slug,status,timezone) values
 ('f9000000-0000-0000-0000-000000000020','Final org','final-org','active','UTC'),
 ('f9000000-0000-0000-0000-000000000021','Other org','other-org','active','UTC');
insert into users(id,auth_user_id,email,display_name) values
 ('f9000000-0000-0000-0000-000000000030','f9000000-0000-0000-0000-000000000001','door-final@test','Door'),
 ('f9000000-0000-0000-0000-000000000031','f9000000-0000-0000-0000-000000000002','admin-final@test','Admin'),
 ('f9000000-0000-0000-0000-000000000032','f9000000-0000-0000-0000-000000000003','unauthorized-final@test','Nope'),
 ('f9000000-0000-0000-0000-000000000033','f9000000-0000-0000-0000-000000000004','other-final@test','Other');
insert into profiles(id,user_id,organization_id,role_id,display_name) values
 ('f9000000-0000-0000-0000-000000000040','f9000000-0000-0000-0000-000000000030','f9000000-0000-0000-0000-000000000020','f9000000-0000-0000-0000-000000000010','Door'),
 ('f9000000-0000-0000-0000-000000000041','f9000000-0000-0000-0000-000000000031','f9000000-0000-0000-0000-000000000020','f9000000-0000-0000-0000-000000000011','Admin'),
 ('f9000000-0000-0000-0000-000000000042','f9000000-0000-0000-0000-000000000032','f9000000-0000-0000-0000-000000000020','f9000000-0000-0000-0000-000000000012','Nope'),
 ('f9000000-0000-0000-0000-000000000043','f9000000-0000-0000-0000-000000000033','f9000000-0000-0000-0000-000000000021','f9000000-0000-0000-0000-000000000011','Other');
insert into events(id,organization_id,name,event_type,status,start_at,timezone,venue,operational_model,capacity) values
 ('f9000000-0000-0000-0000-000000000050','f9000000-0000-0000-0000-000000000020','Final event','nightlife','live','2026-10-01','UTC','Venue','mixed',100),
 ('f9000000-0000-0000-0000-000000000051','f9000000-0000-0000-0000-000000000021','Other event','nightlife','live','2026-10-01','UTC','Venue','mixed',100);
insert into reporting_destinations(id,organization_id,event_id,provider,enabled,spreadsheet_id,last_requested_sequence) values
 ('f9000000-0000-0000-0000-000000000060','f9000000-0000-0000-0000-000000000020','f9000000-0000-0000-0000-000000000050','google_sheets',true,'sheet',0);
insert into reservations(id,code,name,event_id,event_name,date,time,table_name,holder_name,reservation_type,payment_status,status) values
 ('f9000000-0000-0000-0000-000000000070','FR','R','f9000000-0000-0000-0000-000000000050','Final event','2026-10-01','20:00','','Holder','Cortesía','Pendiente','Confirmed');
insert into guests(id,event_id,guest_name,reservation_name,reservation_code,reservation_id,event_name,event_status,invitation_sequence,invitation_code,carnet,delivery_status,admission_status,reservation_status,qr_status) values
 ('f9000000-0000-0000-0000-000000000080','f9000000-0000-0000-0000-000000000050','Guest','R','FR','f9000000-0000-0000-0000-000000000070','Final event','live','1','FR-01','C','Enviada','Pendiente','Confirmed','Válido');
insert into accreditation_enrollments(id,organization_id,event_id,name,status,reservation_guest_id) values
 ('f9000000-0000-0000-0000-000000000090','f9000000-0000-0000-0000-000000000020','f9000000-0000-0000-0000-000000000050','Guest','active','f9000000-0000-0000-0000-000000000080');
insert into accreditation_access_grants(id,organization_id,event_id,enrollment_id,access_code,qr_token,status) values
 ('f9000000-0000-0000-0000-0000000000a0','f9000000-0000-0000-0000-000000000020','f9000000-0000-0000-0000-000000000050','f9000000-0000-0000-0000-000000000090','FINAL-CODE','FINAL-QR','active');

-- Door is authenticated, scoped, and can execute the canonical check-in RPC.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f9000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select ok(has_function_privilege('authenticated','public.persist_completed_checkin_atomic(uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text)','execute'),'Door can execute check-in RPC');
select ok(not exists(select 1 from roles where slug='door' and 'event.edit'=any(permissions)),'Door role has no event.edit');
select throws_ok($x$select * from public.request_reporting_sync_internal('f9000000-0000-0000-0000-000000000050')$x$,'42501','permission denied for function request_reporting_sync_internal','Door cannot execute internal helper');
select * from public.persist_completed_checkin_atomic('f9000000-0000-0000-0000-000000000080','f9000000-0000-0000-0000-0000000000a0','f9000000-0000-0000-0000-000000000040','qr','QR','Door','Gate','2026-10-01T20:00:00Z','', '{}','{}','FINAL-QR','qr_token');
select is((select admission_status from guests where id='f9000000-0000-0000-0000-000000000080'),'Ingresó','authorized admission persists');
select is((select count(*) from checkins where guest_id='f9000000-0000-0000-0000-000000000080'),1::bigint,'checkin row persisted');

-- Invalid credential and duplicate admission are rejected.
select throws_ok($x$select * from public.persist_completed_checkin_atomic('f9000000-0000-0000-0000-000000000080','f9000000-0000-0000-0000-0000000000a0','f9000000-0000-0000-0000-000000000040','qr','QR','Door','Gate','2026-10-01T20:01:00Z','', '{}','{}','WRONG','qr_token')$x$,'55000','checkin_already_admitted','invalid/duplicate admission is rejected');

-- Finalization creates a snapshot and PDF job, then terminal admission is rejected.
select set_config('request.jwt.claims','{"sub":"f9000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select (public.transition_event_status('f9000000-0000-0000-0000-000000000050','finished','{"eventId":"f9000000-0000-0000-0000-000000000050"}',(select revision from reporting_event_revisions where event_id='f9000000-0000-0000-0000-000000000050'))->>'finalSnapshotId') is not null;
select ok((select count(*)=1 from reporting_final_report_jobs where event_id='f9000000-0000-0000-0000-000000000050'),'PDF job exists');
select throws_ok($x$select * from public.persist_completed_checkin_atomic('f9000000-0000-0000-0000-000000000080','f9000000-0000-0000-0000-0000000000a0','f9000000-0000-0000-0000-000000000040','qr','QR','Door','Gate','2026-10-01T20:02:00Z','', '{}','{}','FINAL-QR','qr_token')$x$,'55000','checkin_event_terminal','finished event rejects admission');

-- Snapshot is persisted and protected from ordinary authenticated UPDATE/DELETE.
select set_config('request.jwt.claims','{"sub":"f9000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select ok((select has_table_privilege('authenticated','public.reporting_final_snapshots','update')=false),'authenticated cannot update snapshots');
select ok((select has_table_privilege('authenticated','public.reporting_final_snapshots','delete')=false),'authenticated cannot delete snapshots');
set local role service_role;
select ok((select count(*)=1 from reporting_final_snapshots where event_id='f9000000-0000-0000-0000-000000000050'),'snapshot exists under privileged test context');
select ok((select count(*)=1 from reporting_final_report_jobs where event_id='f9000000-0000-0000-0000-000000000050'),'authorized report state is visible through final report job');


-- Additional independent live fixture for authorization and rollback.
set local role postgres;
insert into events(id,organization_id,name,event_type,status,start_at,timezone,venue,operational_model,capacity) values
 ('f9000000-0000-0000-0000-000000000052','f9000000-0000-0000-0000-000000000020','Open event','nightlife','live','2026-10-01','UTC','Venue','mixed',100),
 ('f9000000-0000-0000-0000-000000000053','f9000000-0000-0000-0000-000000000020','Cancelled event','nightlife','cancelled','2026-10-01','UTC','Venue','mixed',100);
insert into reporting_destinations(id,organization_id,event_id,provider,enabled,spreadsheet_id,last_requested_sequence) values
 ('f9000000-0000-0000-0000-000000000062','f9000000-0000-0000-0000-000000000020','f9000000-0000-0000-0000-000000000052','google_sheets',true,'sheet-open',0);
insert into reservations(id,code,name,event_id,event_name,date,time,table_name,holder_name,reservation_type,payment_status,status) values
 ('f9000000-0000-0000-0000-000000000072','FO','R','f9000000-0000-0000-0000-000000000052','Open event','2026-10-01','20:00','','Holder','Cortesía','Pendiente','Confirmed'),
 ('f9000000-0000-0000-0000-000000000073','FC','R','f9000000-0000-0000-0000-000000000053','Cancelled event','2026-10-01','20:00','','Holder','Cortesía','Pendiente','Confirmed');
insert into guests(id,event_id,guest_name,reservation_name,reservation_code,reservation_id,event_name,event_status,invitation_sequence,invitation_code,carnet,delivery_status,admission_status,reservation_status,qr_status) values
 ('f9000000-0000-0000-0000-000000000082','f9000000-0000-0000-0000-000000000052','Open guest','R','FO','f9000000-0000-0000-0000-000000000072','Open event','live','1','FO-01','CO','Enviada','Pendiente','Confirmed','Válido'),
 ('f9000000-0000-0000-0000-000000000083','f9000000-0000-0000-0000-000000000053','Cancelled guest','R','FC','f9000000-0000-0000-0000-000000000073','Cancelled event','cancelled','1','FC-01','CC','Enviada','Pendiente','Confirmed','Válido');
insert into accreditation_enrollments(id,organization_id,event_id,name,status,reservation_guest_id) values
 ('f9000000-0000-0000-0000-000000000092','f9000000-0000-0000-0000-000000000020','f9000000-0000-0000-0000-000000000052','Open guest','active','f9000000-0000-0000-0000-000000000082'),
 ('f9000000-0000-0000-0000-000000000093','f9000000-0000-0000-0000-000000000020','f9000000-0000-0000-0000-000000000053','Cancelled guest','active','f9000000-0000-0000-0000-000000000083');
insert into accreditation_access_grants(id,organization_id,event_id,enrollment_id,access_code,qr_token,status) values
 ('f9000000-0000-0000-0000-0000000000b0','f9000000-0000-0000-0000-000000000020','f9000000-0000-0000-0000-000000000052','f9000000-0000-0000-0000-000000000092','OPEN-CODE','OPEN-QR','active'),
 ('f9000000-0000-0000-0000-0000000000b1','f9000000-0000-0000-0000-000000000020','f9000000-0000-0000-0000-000000000053','f9000000-0000-0000-0000-000000000093','CANCEL-CODE','CANCEL-QR','active');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f9000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select throws_ok($x$select * from public.persist_completed_checkin_atomic('f9000000-0000-0000-0000-000000000082','f9000000-0000-0000-0000-0000000000b0','f9000000-0000-0000-0000-000000000042','qr','QR','Nope','Gate','2026-10-01T20:03:00Z','', '{}','{}','OPEN-QR','qr_token')$x$,'42501','checkin_out_of_scope','user without permissions is rejected');
select set_config('request.jwt.claims','{"sub":"f9000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select throws_ok($x$select * from public.persist_completed_checkin_atomic('f9000000-0000-0000-0000-000000000082','f9000000-0000-0000-0000-0000000000b0','f9000000-0000-0000-0000-000000000043','qr','QR','Other','Gate','2026-10-01T20:04:00Z','', '{}','{}','OPEN-QR','qr_token')$x$,'42501','checkin_out_of_scope','cross-organization checkin is rejected');
select ok((select count(*)=0 from reporting_final_report_jobs where event_id='f9000000-0000-0000-0000-000000000050'),'cross-organization job is not visible');
update guests set guest_name='forged' where id='f9000000-0000-0000-0000-000000000082';
set local role service_role;
select is((select guest_name from guests where id='f9000000-0000-0000-0000-000000000082'),'Open guest','unauthorized direct guest update does not mutate guest');
set local role authenticated;
-- Controlled local rollback: sequence overflow makes invalidation fail after check-in writes begin.
select set_config('request.jwt.claims','{"sub":"f9000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role postgres;
update reporting_destinations set last_requested_sequence=9223372036854775807 where id='f9000000-0000-0000-0000-000000000062';
set local role authenticated;
select throws_ok($x$select * from public.persist_completed_checkin_atomic('f9000000-0000-0000-0000-000000000082','f9000000-0000-0000-0000-0000000000b0','f9000000-0000-0000-0000-000000000040','qr','QR','Door','Gate','2026-10-01T20:05:00Z','', '{}','{}','OPEN-QR','qr_token')$x$,'22003',NULL,'reporting overflow propagates');
select is((select admission_status from guests where id='f9000000-0000-0000-0000-000000000082'),'Pendiente','rollback leaves guest pending');
select is((select count(*) from checkins where guest_id='f9000000-0000-0000-0000-000000000082'),0::bigint,'rollback leaves no checkin');
select is((select count(*) from accreditation_checkins where enrollment_id='f9000000-0000-0000-0000-000000000092'),0::bigint,'rollback leaves no accreditation checkin');
select is((select last_requested_sequence from reporting_destinations where id='f9000000-0000-0000-0000-000000000062'),9223372036854775807::bigint,'rollback leaves outbox destination unchanged');
-- Terminal transitions reject both admission and reversal without requesting Reporting.
select throws_ok($x$select * from public.persist_completed_checkin_atomic('f9000000-0000-0000-0000-000000000083','f9000000-0000-0000-0000-0000000000b1','f9000000-0000-0000-0000-000000000040','qr','QR','Door','Gate','2026-10-01T20:06:00Z','', '{}','{}','CANCEL-QR','qr_token')$x$,'55000','checkin_event_terminal','cancelled event rejects admission');
select set_config('request.jwt.claims','{"sub":"f9000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select throws_ok($x$update guests set admission_status='Pendiente' where id='f9000000-0000-0000-0000-000000000080'$x$,'55000','checkin_event_terminal','finished event rejects reversal');
select ok((select last_requested_sequence=9223372036854775807 from reporting_destinations where id='f9000000-0000-0000-0000-000000000062'),'rejected terminal admission creates no Reporting request');
set local role service_role;
select ok((select count(*)=1 from reporting_final_snapshots where event_id='f9000000-0000-0000-0000-000000000050'),'final snapshot remains intact');

select * from finish();
rollback;
