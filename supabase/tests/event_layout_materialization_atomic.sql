begin;
create extension if not exists pgtap;
select plan(27);

insert into auth.users(id,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
values ('d6200000-0000-4000-8000-000000000001','layout-owner@test','x','{}','{}');
insert into public.organizations(id,name,slug,status,timezone) values
 ('d6200000-0000-4000-8000-000000000010','Materialization Org','materialization-org','active','UTC');
insert into public.roles(id,name,slug,permissions) values
 ('d6200000-0000-4000-8000-000000000011','Layout Editor','layout-editor',array['event.edit']::text[]);
insert into public.users(id,auth_user_id,email,display_name) values
 ('d6200000-0000-4000-8000-000000000012','d6200000-0000-4000-8000-000000000001','layout-owner@test','Layout Owner');
insert into public.profiles(id,user_id,organization_id,role_id,display_name) values
 ('d6200000-0000-4000-8000-000000000013','d6200000-0000-4000-8000-000000000012','d6200000-0000-4000-8000-000000000010','d6200000-0000-4000-8000-000000000011','Layout Owner');
insert into public.venues(id,organization_id,name,status) values
 ('d6200000-0000-4000-8000-000000000020','d6200000-0000-4000-8000-000000000010','Direct Venue','active'),
 ('d6200000-0000-4000-8000-000000000021','d6200000-0000-4000-8000-000000000010','Layout Venue','active');
insert into public.sectors(id,venue_id,name,capacity,status) values
 ('d6200000-0000-4000-8000-000000000030','d6200000-0000-4000-8000-000000000020','Direct Sector',8,'active'),
 ('d6200000-0000-4000-8000-000000000031','d6200000-0000-4000-8000-000000000021','Layout Sector',8,'active');
insert into public.resources(id,venue_id,sector_id,type,name,capacity,status) values
 ('d6200000-0000-4000-8000-000000000040','d6200000-0000-4000-8000-000000000020','d6200000-0000-4000-8000-000000000030','table','Direct Table',4,'Available'),
 ('d6200000-0000-4000-8000-000000000041','d6200000-0000-4000-8000-000000000021','d6200000-0000-4000-8000-000000000031','table','Layout Table',6,'active');
insert into public.events(id,organization_id,venue_id,name,event_type,status,start_at,timezone,venue,operational_model) values
 ('d6200000-0000-4000-8000-000000000050','d6200000-0000-4000-8000-000000000010','d6200000-0000-4000-8000-000000000020','Direct Event','event','active','2026-10-01T20:00:00Z','UTC','Direct Venue','general'),
 ('d6200000-0000-4000-8000-000000000051','d6200000-0000-4000-8000-000000000010','d6200000-0000-4000-8000-000000000021','Layout Event','event','active','2026-10-02T20:00:00Z','UTC','Layout Venue','general');
insert into public.venue_layouts(id,venue_id,name,is_default,status) values
 ('d6200000-0000-4000-8000-000000000060','d6200000-0000-4000-8000-000000000021','Default Layout',true,'active');
insert into public.venue_layout_sectors(id,venue_layout_id,source_sector_id,name,capacity,status) values
 ('d6200000-0000-4000-8000-000000000061','d6200000-0000-4000-8000-000000000060','d6200000-0000-4000-8000-000000000031','Layout Sector',8,'active');
insert into public.venue_layout_resources(id,venue_layout_id,venue_layout_sector_id,source_resource_id,type,name,capacity,status) values
 ('d6200000-0000-4000-8000-000000000062','d6200000-0000-4000-8000-000000000060','d6200000-0000-4000-8000-000000000061','d6200000-0000-4000-8000-000000000041','table','Layout Table',6,'active');

select throws_ok($$select public.materialize_event_layout_atomic('d6200000-0000-4000-8000-000000000050')$$,'28000','event_layout_unauthenticated','unauthenticated rejected');
select set_config('request.jwt.claims','{"sub":"d6200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((public.materialize_event_layout_atomic('d6200000-0000-4000-8000-000000000050')->>'changed'),'true','direct materialization changes');
select is((select source_venue_layout_id from public.event_layouts where event_id='d6200000-0000-4000-8000-000000000050'),null::uuid,'direct path has no venue layout provenance');
select is((select count(*)::int from public.event_layout_resources elr join public.event_layouts el on el.id=elr.event_layout_id where el.event_id='d6200000-0000-4000-8000-000000000050' and elr.source_resource_id='d6200000-0000-4000-8000-000000000040'),1,'direct source identity copied');
select is((select count(*)::int from public.event_layout_resources elr join public.event_layouts el on el.id=elr.event_layout_id where el.event_id='d6200000-0000-4000-8000-000000000050' and elr.source_venue_layout_resource_id is not null),0,'direct path has no legacy provenance');
select is((select count(*)::int from public.event_layout_resources elr join public.event_layouts el on el.id=elr.event_layout_id where el.event_id='d6200000-0000-4000-8000-000000000050' and elr.event_layout_sector_id is not null),0,'direct path does not invent sector identity');
select is((public.materialize_event_layout_atomic('d6200000-0000-4000-8000-000000000050')->>'changed'),'false','direct materialization is idempotent');
select is((select count(*)::int from public.event_layouts where event_id='d6200000-0000-4000-8000-000000000050' and deleted_at is null),1,'direct path has one event layout');
select is((select count(*)::int from public.event_layout_resources elr join public.event_layouts el on el.id=elr.event_layout_id where el.event_id='d6200000-0000-4000-8000-000000000050' and elr.deleted_at is null),1,'direct path has one resource snapshot');
select is((public.materialize_event_layout_atomic('d6200000-0000-4000-8000-000000000051')->>'changed'),'true','venue layout materialization changes');
select is((select source_venue_layout_id from public.event_layouts where event_id='d6200000-0000-4000-8000-000000000051'),'d6200000-0000-4000-8000-000000000060'::uuid,'venue layout provenance copied');
select is((select count(*)::int from public.event_layout_sectors els join public.event_layouts el on el.id=els.event_layout_id where el.event_id='d6200000-0000-4000-8000-000000000051'),1,'venue layout sector copied');
select is((select count(*)::int from public.event_layout_resources elr join public.event_layouts el on el.id=elr.event_layout_id where el.event_id='d6200000-0000-4000-8000-000000000051' and elr.source_venue_layout_resource_id='d6200000-0000-4000-8000-000000000062' and elr.source_resource_id='d6200000-0000-4000-8000-000000000041'),1,'venue layout resource provenance and identity copied');
select is((public.materialize_event_layout_atomic('d6200000-0000-4000-8000-000000000051')->>'changed'),'false','venue layout materialization is idempotent');
update public.resources set name='Mutated Source',capacity=99 where id='d6200000-0000-4000-8000-000000000041';
select is((public.materialize_event_layout_atomic('d6200000-0000-4000-8000-000000000051')->>'changed'),'false','source mutation does not refresh snapshot');
select is((select elr.name from public.event_layout_resources elr join public.event_layouts el on el.id=elr.event_layout_id where el.event_id='d6200000-0000-4000-8000-000000000051'),'Layout Table','snapshot remains immutable');
select throws_ok($$select public.materialize_event_layout_atomic('d6200000-0000-4000-8000-000000000099')$$,'P0002','event_not_found','missing event rejected');
select is((select count(*)::int from public.event_layouts where event_id='d6200000-0000-4000-8000-000000000050'),1,'no duplicate direct graph');
select is((select count(*)::int from public.event_layout_resources where source_resource_id is null and event_layout_id=(select id from public.event_layouts where event_id='d6200000-0000-4000-8000-000000000051')),0,'all new physical resources have identity');
select is((select count(*)::int from public.reservations where event_id in ('d6200000-0000-4000-8000-000000000050','d6200000-0000-4000-8000-000000000051')),0,'reservations untouched');
select ok(has_function_privilege('authenticated','public.materialize_event_layout_atomic(uuid)','EXECUTE'),'authenticated execute granted');
select ok(not has_function_privilege('anon','public.materialize_event_layout_atomic(uuid)','EXECUTE'),'anon execute denied');
select ok(not has_function_privilege('public','public.materialize_event_layout_atomic(uuid)','EXECUTE'),'public execute denied');
insert into auth.users(id,email,encrypted_password,raw_app_meta_data,raw_user_meta_data) values ('d6200000-0000-4000-8000-000000000002','layout-foreign@test','x','{}','{}'),('d6200000-0000-4000-8000-000000000003','layout-noedit@test','x','{}','{}');
insert into public.organizations(id,name,slug,status,timezone) values ('d6200000-0000-4000-8000-000000000099','Foreign Org','foreign-materialization-org','active','UTC');
insert into public.users(id,auth_user_id,email,display_name) values ('d6200000-0000-4000-8000-000000000092','d6200000-0000-4000-8000-000000000002','layout-foreign@test','Foreign'),('d6200000-0000-4000-8000-000000000093','d6200000-0000-4000-8000-000000000003','layout-noedit@test','No Edit');
insert into public.roles(id,name,slug,permissions) values ('d6200000-0000-4000-8000-000000000094','No Edit','layout-noedit',array[]::text[]);
insert into public.profiles(id,user_id,organization_id,role_id,display_name) values ('d6200000-0000-4000-8000-000000000095','d6200000-0000-4000-8000-000000000092','d6200000-0000-4000-8000-000000000099','d6200000-0000-4000-8000-000000000011','Foreign'),('d6200000-0000-4000-8000-000000000096','d6200000-0000-4000-8000-000000000093','d6200000-0000-4000-8000-000000000010','d6200000-0000-4000-8000-000000000094','No Edit');
select set_config('request.jwt.claims','{"sub":"d6200000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.materialize_event_layout_atomic('d6200000-0000-4000-8000-000000000050')$$,'42501','event_layout_forbidden','wrong organization rejected');
select is((select count(*)::int from public.event_layouts where event_id='d6200000-0000-4000-8000-000000000050'),1,'wrong organization creates no graph');
select set_config('request.jwt.claims','{"sub":"d6200000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.materialize_event_layout_atomic('d6200000-0000-4000-8000-000000000050')$$,'42501','event_layout_forbidden','missing event.edit rejected');
select is((select count(*)::int from public.event_layout_resources elr join public.event_layouts el on el.id=elr.event_layout_id where el.event_id='d6200000-0000-4000-8000-000000000050'),1,'missing event.edit creates no graph');
select * from finish();
rollback;
