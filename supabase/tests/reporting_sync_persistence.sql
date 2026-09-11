begin;
create extension if not exists pgtap;
select plan(19);

insert into auth.users (id, email) values ('b1000000-0000-4000-8000-000000000010','reporting-sync-owner@test.local');
insert into public.roles (id, name, slug, permissions) values ('b1000000-0000-4000-8000-000000000011','Reporting test owner','reporting-test-owner',array['event.edit','organization.manage']);
insert into public.organizations (id, name, slug, status, timezone) values ('b1000000-0000-4000-8000-000000000012','Reporting test organization','reporting-test-org','active','UTC');
insert into public.users (id, auth_user_id, email, display_name) values ('b1000000-0000-4000-8000-000000000013','b1000000-0000-4000-8000-000000000010','reporting-sync-owner@test.local','Reporting Test Owner');
insert into public.profiles (id, user_id, organization_id, role_id, display_name) values ('b1000000-0000-4000-8000-000000000014','b1000000-0000-4000-8000-000000000013','b1000000-0000-4000-8000-000000000012','b1000000-0000-4000-8000-000000000011','Reporting Test Owner');
insert into public.events (id, organization_id, name, event_type, status, start_at, timezone, venue, operational_model) values ('b1000000-0000-4000-8000-000000000015','b1000000-0000-4000-8000-000000000012','Reporting sync test','nightlife','published','2026-09-10T20:00:00Z','UTC','Test venue','mixed');
insert into public.reporting_destinations (id, organization_id, event_id, spreadsheet_id)
values ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000012','b1000000-0000-4000-8000-000000000015','test-sheet');

select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000010","role":"authenticated"}',true);
select ok(has_function_privilege('authenticated','public.request_reporting_sync(uuid)','EXECUTE'),'authenticated can request sync');
select ok(not has_function_privilege('authenticated','public.complete_reporting_sync_success(uuid,uuid,bigint,text)','EXECUTE'),'authenticated cannot forge success');
select ok(not has_function_privilege('authenticated','public.claim_reporting_sync_work(text,integer)','EXECUTE'),'authenticated cannot claim worker work');
select ok((select count(*) from information_schema.columns where table_schema='public' and table_name='reporting_sync_runs' and column_name in ('access_code','carnet','whatsapp','payload'))=0,'sync runs contain no PII payload columns');

select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000010","role":"authenticated"}',true);
select ok((select requested_sequence=1 from public.request_reporting_sync('b1000000-0000-4000-8000-000000000015')),'first request increments sequence');
select ok((select count(*)=1 from public.reporting_outbox where destination_id='b1000000-0000-4000-8000-000000000001'),'one coalesced outbox row');
select ok((select requested_sequence=2 from public.request_reporting_sync('b1000000-0000-4000-8000-000000000015')),'second request increments sequence');
select ok((select count(*)=1 from public.reporting_outbox where destination_id='b1000000-0000-4000-8000-000000000001'),'repeated request remains one row');
do $$ begin for i in 1..100 loop perform public.request_reporting_sync('b1000000-0000-4000-8000-000000000015'); end loop; end $$;
select is((select last_requested_sequence from public.reporting_destinations where id='b1000000-0000-4000-8000-000000000001'),102::bigint,'100 requests advance to latest sequence');

select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000010","role":"authenticated"}',true);
select is((select last_requested_sequence from public.reporting_destinations where id='b1000000-0000-4000-8000-000000000001'),102::bigint,'destination sequence is latest');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select ok((select count(*)=1 from public.claim_reporting_sync_work('worker-a',1)),'worker claims once');
select ok((select status='processing' and locked_by='worker-a' from public.reporting_outbox where destination_id='b1000000-0000-4000-8000-000000000001'),'claim acquires lease');
select is((select count(*) from public.claim_reporting_sync_work('worker-b',1)),0::bigint,'second worker cannot double claim');
select ok((select count(*)=1 from public.reporting_sync_runs where destination_id='b1000000-0000-4000-8000-000000000001'),'claim creates sync run');

select is(public.complete_reporting_sync_success((select id from public.reporting_outbox where destination_id='b1000000-0000-4000-8000-000000000001'),(select id from public.reporting_sync_runs where destination_id='b1000000-0000-4000-8000-000000000001'),'102','hash-a'),true,'success completes current sequence');
select is((select status from public.reporting_outbox where destination_id='b1000000-0000-4000-8000-000000000001'),'synced','outbox synced');
select is((select last_processed_sequence from public.reporting_destinations where id='b1000000-0000-4000-8000-000000000001'),102::bigint,'destination processed sequence updated');
select is((select status from public.reporting_sync_runs where destination_id='b1000000-0000-4000-8000-000000000001'),'synced','run is immutable audit result');
select ok((select exists(select 1 from pg_indexes where indexname='reporting_outbox_claim_idx')),'worker claim index exists');

select * from finish();
rollback;
