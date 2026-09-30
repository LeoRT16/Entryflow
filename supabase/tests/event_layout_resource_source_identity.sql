begin;
create extension if not exists pgtap;
select plan(14);

insert into public.organizations(id,name,slug,status,timezone)
values ('d6100000-0000-4000-8000-000000000001','Source Identity Org','source-identity-org','active','UTC');
insert into public.venues(id,organization_id,name,status)
values ('d6100000-0000-4000-8000-000000000002','d6100000-0000-4000-8000-000000000001','Source Identity Venue','active');
insert into public.resources(id,venue_id,type,name,capacity,status)
values
 ('d6100000-0000-4000-8000-000000000010','d6100000-0000-4000-8000-000000000002','table','Source A',4,'active'),
 ('d6100000-0000-4000-8000-000000000011','d6100000-0000-4000-8000-000000000002','table','Source B',4,'active'),
 ('d6100000-0000-4000-8000-000000000012','d6100000-0000-4000-8000-000000000002','table','Source C',4,'active');
insert into public.events(id,organization_id,name,event_type,status,start_at,timezone,venue,operational_model)
values
 ('d6100000-0000-4000-8000-000000000020','d6100000-0000-4000-8000-000000000001','Source Identity Event A','event','active','2026-09-25T20:00:00Z','UTC','Source Identity Venue','general'),
 ('d6100000-0000-4000-8000-000000000021','d6100000-0000-4000-8000-000000000001','Source Identity Event B','event','active','2026-09-26T20:00:00Z','UTC','Source Identity Venue','general');
insert into public.event_layouts(id,event_id,venue_id,name,status)
values
 ('d6100000-0000-4000-8000-000000000030','d6100000-0000-4000-8000-000000000020','d6100000-0000-4000-8000-000000000002','Layout A','active'),
 ('d6100000-0000-4000-8000-000000000031','d6100000-0000-4000-8000-000000000021','d6100000-0000-4000-8000-000000000002','Layout B','active');

select has_column('public','event_layout_resources','source_resource_id','source_resource_id column exists');
select has_index('public','event_layout_resources','event_layout_resources_source_resource_active_unique','active direct source identity index exists');
select lives_ok($$insert into public.event_layout_resources(id,event_layout_id,type,name,capacity,status,source_resource_id)
  values ('d6100000-0000-4000-8000-000000000040','d6100000-0000-4000-8000-000000000030','table','Direct A',4,'active','d6100000-0000-4000-8000-000000000010')$$,'valid direct source resource is accepted');
select is((select source_resource_id from public.event_layout_resources where id='d6100000-0000-4000-8000-000000000040'),'d6100000-0000-4000-8000-000000000010'::uuid,'direct source id is persisted');
select throws_ok($$insert into public.event_layout_resources(id,event_layout_id,type,name,capacity,status,source_resource_id)
  values ('d6100000-0000-4000-8000-000000000041','d6100000-0000-4000-8000-000000000030','table','Invalid FK',4,'active','d6100000-0000-4000-8000-000000000099')$$,'23503',NULL,'invalid direct source resource is rejected');
select lives_ok($$insert into public.event_layout_resources(id,event_layout_id,type,name,capacity,status,source_resource_id)
  values ('d6100000-0000-4000-8000-000000000042','d6100000-0000-4000-8000-000000000030','table','Legacy Null',4,'active',null)$$,'legacy null source identity remains valid');
select lives_ok($$insert into public.event_layout_resources(id,event_layout_id,type,name,capacity,status,source_venue_layout_resource_id,source_resource_id)
  values ('d6100000-0000-4000-8000-000000000043','d6100000-0000-4000-8000-000000000030','table','Provenance Coexistence',4,'active',null,'d6100000-0000-4000-8000-000000000011')$$,'direct identity coexists with legacy provenance');
select throws_ok($$insert into public.event_layout_resources(id,event_layout_id,type,name,capacity,status,source_resource_id)
  values ('d6100000-0000-4000-8000-000000000044','d6100000-0000-4000-8000-000000000030','table','Duplicate Active',4,'active','d6100000-0000-4000-8000-000000000010')$$,'23505',NULL,'duplicate active direct source mapping is rejected');
select lives_ok($$insert into public.event_layout_resources(id,event_layout_id,type,name,capacity,status,source_resource_id)
  values ('d6100000-0000-4000-8000-000000000045','d6100000-0000-4000-8000-000000000031','table','Same Source Other Layout',4,'active','d6100000-0000-4000-8000-000000000010')$$,'same source may map in another event layout');
select lives_ok($$insert into public.event_layout_resources(id,event_layout_id,type,name,capacity,status,source_resource_id)
  values ('d6100000-0000-4000-8000-000000000046','d6100000-0000-4000-8000-000000000030','table','Inactive Duplicate',4,'inactive','d6100000-0000-4000-8000-000000000010')$$,'inactive duplicate does not block active mapping');
select lives_ok($$insert into public.event_layout_resources(id,event_layout_id,type,name,capacity,status,source_resource_id,deleted_at)
  values ('d6100000-0000-4000-8000-000000000047','d6100000-0000-4000-8000-000000000030','table','Deleted Duplicate',4,'active','d6100000-0000-4000-8000-000000000010',now())$$,'soft deleted duplicate does not block active mapping');
select lives_ok($$delete from public.resources where id='d6100000-0000-4000-8000-000000000011'$$,'source resource deletion is permitted');
select is((select source_resource_id from public.event_layout_resources where id='d6100000-0000-4000-8000-000000000043'),NULL::uuid,'source deletion nulls direct identity');
select is((select source_resource_id from public.event_layout_resources where id='d6100000-0000-4000-8000-000000000040'),'d6100000-0000-4000-8000-000000000010'::uuid,'unrelated source identity remains intact');
select * from finish();
rollback;
