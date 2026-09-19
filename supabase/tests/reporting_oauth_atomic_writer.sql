begin;
create extension if not exists pgtap;
select plan(28);

select ok(to_regprocedure('public.request_reporting_oauth_sync(uuid)') is not null,'OAuth sync request RPC exists');
select ok(to_regprocedure('public.claim_reporting_oauth_sync_work(text,integer)') is not null,'OAuth claim RPC exists');
select ok(to_regprocedure('public.complete_reporting_oauth_sync_success(uuid,uuid,bigint,text,timestamp with time zone)') is not null,'OAuth completion accepts a caller-supplied timestamp');
select ok(to_regprocedure('public.complete_reporting_oauth_sync_failure(uuid,uuid,text,text,boolean,timestamp with time zone)') is not null,'OAuth failure RPC exists');
select ok(has_function_privilege('service_role','public.claim_reporting_oauth_sync_work(text,integer)','execute'),'service_role can claim OAuth sync work');
select ok(not has_function_privilege('authenticated','public.claim_reporting_oauth_sync_work(text,integer)','execute'),'authenticated cannot claim OAuth sync work');
select ok(not has_function_privilege('anon','public.claim_reporting_oauth_sync_work(text,integer)','execute'),'anon cannot claim OAuth sync work');
select ok(has_function_privilege('authenticated','public.request_reporting_oauth_sync(uuid)','execute'),'authenticated callers may request an enabled OAuth sync');
select ok(not has_function_privilege('anon','public.request_reporting_oauth_sync(uuid)','execute'),'anon cannot request OAuth sync');
select ok(has_function_privilege('service_role','public.complete_reporting_oauth_sync_success(uuid,uuid,bigint,text,timestamp with time zone)','execute'),'service_role can complete OAuth sync');
select ok(not has_function_privilege('authenticated','public.complete_reporting_oauth_sync_success(uuid,uuid,bigint,text,timestamp with time zone)','execute'),'authenticated cannot complete OAuth sync');
select ok(not has_function_privilege('anon','public.complete_reporting_oauth_sync_success(uuid,uuid,bigint,text,timestamp with time zone)','execute'),'anon cannot complete OAuth sync');
select ok(not has_function_privilege('authenticated','public.complete_reporting_oauth_sync_failure(uuid,uuid,text,text,boolean,timestamp with time zone)','execute'),'authenticated cannot complete OAuth failures');
select ok(not has_function_privilege('anon','public.complete_reporting_oauth_sync_failure(uuid,uuid,text,text,boolean,timestamp with time zone)','execute'),'anon cannot complete OAuth failures');
select ok(has_function_privilege('service_role','public.complete_reporting_oauth_sync_failure(uuid,uuid,text,text,boolean,timestamp with time zone)','execute'),'service_role can complete OAuth failures');
select ok(position('enabled=false' in lower(pg_get_functiondef('public.request_reporting_spreadsheet_provisioning(uuid)'::regprocedure)))>0,'OAuth provisioning leaves destinations disabled');
select ok(position('enabled=false' in lower(pg_get_functiondef('public.complete_reporting_spreadsheet_provisioning_job(uuid,uuid,bigint,bigint,text,text,text,boolean)'::regprocedure)))>0,'OAuth provisioning completion keeps destinations disabled');

insert into auth.users(id,email) values('e6000000-0000-4000-8000-000000000010','oauth-writer@test.local');
insert into public.roles(id,name,slug,permissions) values('e6000000-0000-4000-8000-000000000011','OAuth writer','oauth-writer',array['event.edit','organization.manage']);
insert into public.organizations(id,name,slug,status,timezone) values('e6000000-0000-4000-8000-000000000012','OAuth writer org','oauth-writer-org','active','UTC');
insert into public.users(id,auth_user_id,email,display_name) values('e6000000-0000-4000-8000-000000000013','e6000000-0000-4000-8000-000000000010','oauth-writer@test.local','OAuth Writer');
insert into public.profiles(id,user_id,organization_id,role_id,display_name) values('e6000000-0000-4000-8000-000000000014','e6000000-0000-4000-8000-000000000013','e6000000-0000-4000-8000-000000000012','e6000000-0000-4000-8000-000000000011','OAuth Writer');
insert into public.events(id,organization_id,name,event_type,status,start_at,timezone,venue,operational_model) values('e6000000-0000-4000-8000-000000000015','e6000000-0000-4000-8000-000000000012','OAuth writer test','nightlife','published','2026-09-20T20:00:00Z','UTC','Test venue','mixed');
insert into public.reporting_drive_integrations(id,organization_id,enabled,status,oauth_secret_id) values('e6000000-0000-4000-8000-000000000016','e6000000-0000-4000-8000-000000000012',true,'connected','e6000000-0000-4000-8000-000000000017');
insert into public.reporting_destinations(id,organization_id,event_id,provider,enabled,spreadsheet_id,sheet_schema_version,writer_mode,last_requested_sequence)
  values('e6000000-0000-4000-8000-000000000018','e6000000-0000-4000-8000-000000000012','e6000000-0000-4000-8000-000000000015','google_sheets',true,'synthetic-sheet',2,'oauth_user',1);
insert into public.reporting_outbox(destination_id,organization_id,event_id,requested_sequence,status)
  values('e6000000-0000-4000-8000-000000000018','e6000000-0000-4000-8000-000000000012','e6000000-0000-4000-8000-000000000015',1,'pending');
insert into public.reporting_spreadsheet_provisioning(destination_id,organization_id,event_id,status)
  values('e6000000-0000-4000-8000-000000000018','e6000000-0000-4000-8000-000000000012','e6000000-0000-4000-8000-000000000015','ready');

set local role service_role;
select is((select count(*) from public.claim_reporting_sync_work('legacy-worker',1)),0::bigint,'legacy Service Account claim cannot consume OAuth jobs');
update public.reporting_drive_integrations set enabled=false where organization_id='e6000000-0000-4000-8000-000000000012';
select is((select count(*) from public.claim_reporting_oauth_sync_work('oauth-worker',1)),0::bigint,'disabled integration cannot claim OAuth snapshot work');
update public.reporting_drive_integrations set enabled=true where organization_id='e6000000-0000-4000-8000-000000000012';
select * from public.claim_reporting_oauth_sync_work('oauth-worker',1) \gset claim_
select ok(:'claim_sync_run_id' is not null,'OAuth worker claims a V2 sync run');
select is(public.complete_reporting_oauth_sync_success(:'claim_outbox_id'::uuid,:'claim_sync_run_id'::uuid,:'claim_requested_sequence'::bigint,'synthetic-hash','2026-09-18T17:45:00Z'::timestamptz),true,'OAuth success completion accepts the logical sync time');
select ok((select last_sync_at='2026-09-18T17:45:00Z'::timestamptz and last_success_at='2026-09-18T17:45:00Z'::timestamptz from public.reporting_destinations where id='e6000000-0000-4000-8000-000000000018'),'sheet sync time and persisted success time share one instant');
select ok((select processed_at='2026-09-18T17:45:00Z'::timestamptz from public.reporting_outbox where destination_id='e6000000-0000-4000-8000-000000000018'),'successful outbox processing records the same instant');
select ok((select finished_at='2026-09-18T17:45:00Z'::timestamptz and sheet_schema_version=2 from public.reporting_sync_runs where id=:'claim_sync_run_id'::uuid),'sync run records the same instant and schema V2');

update public.reporting_destinations set last_requested_sequence=2 where id='e6000000-0000-4000-8000-000000000018';
update public.reporting_outbox set requested_sequence=2,status='pending',attempts=1 where destination_id='e6000000-0000-4000-8000-000000000018';
select * from public.claim_reporting_oauth_sync_work('oauth-worker',1) \gset fail_
select is(public.complete_reporting_oauth_sync_failure(:'fail_outbox_id'::uuid,:'fail_sync_run_id'::uuid,'google_invalid_grant','needs_reauth',false,null),true,'invalid_grant failure is finalized');
select is((select status from public.reporting_drive_integrations where organization_id='e6000000-0000-4000-8000-000000000012'),'needs_reauth'::text,'invalid_grant marks OAuth integration needs_reauth');
select is((select last_success_at from public.reporting_destinations where id='e6000000-0000-4000-8000-000000000018'),'2026-09-18T17:45:00Z'::timestamptz,'failed write does not advance success timestamp');
select is((select status from public.reporting_sync_runs where id=:'fail_sync_run_id'::uuid),'failed'::text,'failed run records failure without success');

select * from finish();
rollback;
