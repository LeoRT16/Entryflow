begin;
create extension if not exists pgtap;
select plan(23);

insert into auth.users(id,email) values('e4000000-0000-4000-8000-000000000010','spreadsheet-owner@test.local');
insert into public.roles(id,name,slug,permissions) values('e4000000-0000-4000-8000-000000000011','Spreadsheet owner','spreadsheet-owner',array['event.edit','organization.manage']);
insert into public.organizations(id,name,slug,status,timezone) values('e4000000-0000-4000-8000-000000000012','Spreadsheet test org','spreadsheet-test-org','active','UTC');
insert into public.users(id,auth_user_id,email,display_name) values('e4000000-0000-4000-8000-000000000013','e4000000-0000-4000-8000-000000000010','spreadsheet-owner@test.local','Spreadsheet Test Owner');
insert into public.profiles(id,user_id,organization_id,role_id,display_name) values('e4000000-0000-4000-8000-000000000014','e4000000-0000-4000-8000-000000000013','e4000000-0000-4000-8000-000000000012','e4000000-0000-4000-8000-000000000011','Spreadsheet Test Owner');
insert into public.events(id,organization_id,name,event_type,status,start_at,timezone,venue,operational_model) values('e4000000-0000-4000-8000-000000000015','e4000000-0000-4000-8000-000000000012','Provisioning test','nightlife','published','2026-09-20T20:00:00Z','UTC','Test venue','mixed');
insert into public.reporting_drive_integrations(id,organization_id,enabled,status,oauth_secret_id) values('e4000000-0000-4000-8000-000000000016','e4000000-0000-4000-8000-000000000012',true,'connected','e4000000-0000-4000-8000-000000000017');
insert into public.event_drive_locations(id,organization_id,event_id,drive_integration_id,status,revision) values('e4000000-0000-4000-8000-000000000018','e4000000-0000-4000-8000-000000000012','e4000000-0000-4000-8000-000000000015','e4000000-0000-4000-8000-000000000016','pending',7);

select ok((select column_default like '%service_account%' from information_schema.columns where table_schema='public' and table_name='reporting_destinations' and column_name='writer_mode'),'legacy destinations keep the Service Account writer default');
select ok((select count(*)=0 from information_schema.columns where table_schema='public' and table_name='reporting_spreadsheet_provisioning' and column_name='spreadsheet_id'),'provisioning state has no duplicate definitive spreadsheet id');
select ok(not has_function_privilege('authenticated','public.request_reporting_spreadsheet_provisioning(uuid)','execute'),'authenticated callers cannot invoke service-only provisioning RPC');
select ok(not has_function_privilege('anon','public.claim_reporting_spreadsheet_provisioning_jobs(text,integer)','execute'),'anon cannot claim provisioning work');
select ok(has_function_privilege('service_role','public.claim_reporting_spreadsheet_provisioning_jobs(text,integer)','execute'),'service_role can claim provisioning work');
select ok(not has_table_privilege('authenticated','public.reporting_destinations','update'),'authenticated cannot bypass destination identity RPCs');

set local role service_role;
select * from public.request_reporting_spreadsheet_provisioning('e4000000-0000-4000-8000-000000000015') \gset
select is(:'provisioning_status'::text,'blocked'::text,'missing Event Drive folder leaves durable blocked state');
select ok((select spreadsheet_id is null and enabled=false and writer_mode='oauth_user' and sheet_schema_version=2 from public.reporting_destinations where event_id='e4000000-0000-4000-8000-000000000015'),'OAuth destination remains disabled and has no spreadsheet identity');
update public.event_drive_locations set status='ready',event_drive_folder_id='synthetic-event-folder' where event_id='e4000000-0000-4000-8000-000000000015';
select * from public.request_reporting_spreadsheet_provisioning('e4000000-0000-4000-8000-000000000015') \gset
select is(:'provisioning_status'::text,'pending'::text,'request requeues once the validated Event Drive folder exists');

select * from public.claim_reporting_spreadsheet_provisioning_jobs('worker-a',1) \gset a_
select ok(:'a_claim_token' is not null,'first worker owns a lease');
select is((select count(*) from public.claim_reporting_spreadsheet_provisioning_jobs('worker-b',1)),0::bigint,'second worker cannot claim the same destination');
update public.reporting_drive_integrations set enabled=false where organization_id='e4000000-0000-4000-8000-000000000012';
select is(public.begin_reporting_spreadsheet_create(:'a_outbox_id'::uuid,:'a_claim_token'::uuid,:'a_target_revision'::bigint,'synthetic-event-folder'),false,'create is denied if OAuth integration is disabled after claim');
update public.reporting_drive_integrations set enabled=true where organization_id='e4000000-0000-4000-8000-000000000012';
select is(public.begin_reporting_spreadsheet_create(:'a_outbox_id'::uuid,:'a_claim_token'::uuid,:'a_target_revision'::bigint,'synthetic-event-folder'),true,'create begins only under the valid lease');
update public.reporting_spreadsheet_provisioning set lease_expires_at=now()-interval '1 second' where id=:'a_outbox_id'::uuid;
select * from public.claim_reporting_spreadsheet_provisioning_jobs('worker-b',1) \gset b_
select ok(:'b_claim_token' is distinct from :'a_claim_token','reclaim rotates the claim token');
select is(:'b_reconcile_only'::boolean,true,'expired create lease reclaims in reconciliation-only mode');
select is(public.begin_reporting_spreadsheet_create(:'a_outbox_id'::uuid,:'a_claim_token'::uuid,:'a_target_revision'::bigint,'synthetic-event-folder'),false,'stale worker cannot begin create');
select is(public.complete_reporting_spreadsheet_provisioning_job(:'a_outbox_id'::uuid,:'a_claim_token'::uuid,:'a_target_revision'::bigint,:'a_target_generation'::bigint,'synthetic-event-folder','stale-sheet','stale-title',true),'stale','stale worker cannot persist spreadsheet id');
select is(public.complete_reporting_spreadsheet_provisioning_job(:'b_outbox_id'::uuid,:'b_claim_token'::uuid,:'b_target_revision'::bigint,:'b_target_generation'::bigint,'synthetic-event-folder','synthetic-sheet-id','EntryFlow — Provisioning test — 2026-09-20',true),'completed','current worker persists one definitive id');
select ok((select spreadsheet_id='synthetic-sheet-id' and enabled=false and writer_mode='oauth_user' and last_applied_spreadsheet_title='EntryFlow — Provisioning test — 2026-09-20' from public.reporting_destinations where event_id='e4000000-0000-4000-8000-000000000015'),'only the destination owns the ID and title baseline');

update public.reporting_destinations set enabled=true where event_id='e4000000-0000-4000-8000-000000000015';
insert into public.reporting_outbox(destination_id,organization_id,event_id,requested_sequence,status) select id,organization_id,event_id,1,'pending' from public.reporting_destinations where event_id='e4000000-0000-4000-8000-000000000015';
select is((select count(*) from public.claim_reporting_sync_work('legacy-worker',1)),0::bigint,'legacy Service Account sync worker cannot claim OAuth destination');
select set_config('request.jwt.claims','{"sub":"e4000000-0000-4000-8000-000000000010","role":"authenticated"}',true);
select throws_ok('select * from public.request_reporting_sync(''e4000000-0000-4000-8000-000000000015'')','55000','reporting_writer_not_enabled','OAuth destination cannot enqueue legacy sync');
select set_config('request.jwt.claims','{"role":"service_role"}',true);

update public.reporting_spreadsheet_provisioning set status='retry',available_at=now() where destination_id=(select id from public.reporting_destinations where event_id='e4000000-0000-4000-8000-000000000015');
select * from public.claim_reporting_spreadsheet_provisioning_jobs('reauth-worker',1) \gset r_
select is(public.fail_reporting_spreadsheet_provisioning_job(:'r_outbox_id'::uuid,:'r_claim_token'::uuid,:'r_target_revision'::bigint,'needs_reauth','google_invalid_grant',null),true,'invalid_grant marks reauthentication required');
select ok((select status='needs_reauth' and oauth_secret_id='e4000000-0000-4000-8000-000000000017' from public.reporting_drive_integrations where organization_id='e4000000-0000-4000-8000-000000000012'),'reauth preserves the Vault secret reference');

select * from finish();
rollback;
