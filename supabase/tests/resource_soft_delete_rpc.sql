begin;

create extension if not exists pgtap;

select plan(18);

select ok(
  has_function_privilege('authenticated', 'public.soft_delete_resource(uuid)', 'EXECUTE'),
  'authenticated can execute soft_delete_resource'
);
select ok(
  not has_function_privilege('anon', 'public.soft_delete_resource(uuid)', 'EXECUTE'),
  'anon cannot execute soft_delete_resource'
);
select ok(
  not has_function_privilege('public', 'public.soft_delete_resource(uuid)', 'EXECUTE'),
  'PUBLIC cannot execute soft_delete_resource'
);

insert into auth.users (id, email) values
  ('81000000-0000-4000-8000-000000000001', 'rpc-owner@entryflow.test'),
  ('81000000-0000-4000-8000-000000000002', 'rpc-foreign@entryflow.test');

insert into public.roles (id, name, slug, permissions)
values (
  '81100000-0000-4000-8000-000000000001',
  'RPC Resource Manager',
  'rpc-resource-manager-91000000',
  array['resource.manage']::text[]
);

insert into public.organizations (id, name, slug, status, timezone) values
  ('81200000-0000-4000-8000-000000000001', 'RPC Owner Organization', 'rpc-owner-organization-91000000', 'active', 'America/La_Paz'),
  ('81200000-0000-4000-8000-000000000002', 'RPC Foreign Organization', 'rpc-foreign-organization-91000000', 'active', 'America/La_Paz');

insert into public.users (id, auth_user_id, email, display_name) values
  ('81300000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'rpc-owner@entryflow.test', 'RPC Owner'),
  ('81300000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', 'rpc-foreign@entryflow.test', 'RPC Foreign');

insert into public.profiles (id, user_id, organization_id, role_id, display_name) values
  ('81400000-0000-4000-8000-000000000001', '81300000-0000-4000-8000-000000000001', '81200000-0000-4000-8000-000000000001', '81100000-0000-4000-8000-000000000001', 'RPC Owner'),
  ('81400000-0000-4000-8000-000000000002', '81300000-0000-4000-8000-000000000002', '81200000-0000-4000-8000-000000000002', '81100000-0000-4000-8000-000000000001', 'RPC Foreign');

insert into public.venues (id, organization_id, name, status) values
  ('81500000-0000-4000-8000-000000000001', '81200000-0000-4000-8000-000000000001', 'RPC Owner Venue', 'active'),
  ('81500000-0000-4000-8000-000000000002', '81200000-0000-4000-8000-000000000002', 'RPC Foreign Venue', 'active');

insert into public.events (
  id, organization_id, venue_id, name, event_type, status, start_at, timezone,
  venue, operational_model
) values (
  '81600000-0000-4000-8000-000000000001',
  '81200000-0000-4000-8000-000000000001',
  '81500000-0000-4000-8000-000000000001',
  'RPC Resource Event', 'nightlife', 'published', '2026-09-10T20:00:00-04:00',
  'America/La_Paz', 'RPC Owner Venue', 'mixed'
);

insert into public.resources (id, venue_id, type, name, capacity, status)
select fixture.id, '81500000-0000-4000-8000-000000000001', 'table', fixture.name, 1, 'Available'
from (values
  ('91000000-0000-4000-8000-000000000001'::uuid, 'RPC clean'),
  ('91000000-0000-4000-8000-000000000002'::uuid, 'RPC reservation'),
  ('91000000-0000-4000-8000-000000000003'::uuid, 'RPC guest'),
  ('91000000-0000-4000-8000-000000000004'::uuid, 'RPC venue layout'),
  ('91000000-0000-4000-8000-000000000005'::uuid, 'RPC event layout'),
  ('91000000-0000-4000-8000-000000000006'::uuid, 'RPC legacy table'),
  ('91000000-0000-4000-8000-000000000007'::uuid, 'RPC timeline'),
  ('91000000-0000-4000-8000-000000000008'::uuid, 'RPC deleted')
) as fixture(id, name);

update public.resources
set deleted_at = now()
where id = '91000000-0000-4000-8000-000000000008';

insert into public.reservations (
  id, code, name, event_id, event_name, date, time, table_name,
  holder_name, reservation_type, payment_status, status, resource_id, deleted_at
) values (
  '92000000-0000-4000-8000-000000000002', 'RPC-RESOURCE-HISTORY', 'RPC history',
  '81600000-0000-4000-8000-000000000001', 'RPC event', '2026-09-10', '20:00',
  'RPC reservation', 'RPC owner', 'Mesa', 'Pendiente', 'Pending',
  '91000000-0000-4000-8000-000000000002', now()
);

insert into public.guests (
  id, event_id, guest_name, reservation_name, reservation_code, reservation_id,
  event_name, table_id, event_status, invitation_sequence, invitation_code,
  carnet, delivery_status, admission_status, reservation_status, qr_status
) values (
  '93000000-0000-4000-8000-000000000003',
  '81600000-0000-4000-8000-000000000001', 'RPC guest', 'RPC direct resource',
  'RPC-GUEST', '93000000-0000-4000-8000-000000000099', 'RPC event',
  '91000000-0000-4000-8000-000000000003', 'Live', 'RPC-1', 'RPC-GUEST-UNIQUE',
  'RPC-CI', 'Pendiente', 'Pendiente', 'Pending', 'Pendiente'
);

insert into public.venue_layouts (id, venue_id, name)
values ('94000000-0000-4000-8000-000000000001', '81500000-0000-4000-8000-000000000001', 'RPC layout');

insert into public.venue_layout_resources (
  id, venue_layout_id, source_resource_id, type, name, capacity
) values
  ('94000000-0000-4000-8000-000000000004', '94000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000004', 'table', 'RPC venue resource', 1),
  ('94000000-0000-4000-8000-000000000005', '94000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000005', 'table', 'RPC event resource source', 1);

insert into public.event_layouts (id, event_id, venue_id, name)
values (
  '95000000-0000-4000-8000-000000000001',
  '81600000-0000-4000-8000-000000000001',
  '81500000-0000-4000-8000-000000000001',
  'RPC event layout'
);

insert into public.event_layout_resources (
  id, event_layout_id, source_venue_layout_resource_id, type, name, capacity
) values (
  '95000000-0000-4000-8000-000000000005',
  '95000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000005',
  'table', 'RPC event resource', 1
);

insert into public.tables (id, name, location, status, event_id)
values (
  '91000000-0000-4000-8000-000000000006', 'RPC legacy', 'RPC', 'Available',
  '81600000-0000-4000-8000-000000000001'
);

insert into public.timeline_events (
  id, event_id, timestamp, kind, icon, tone, title, description, table_id
) values (
  '97000000-0000-4000-8000-000000000007',
  '81600000-0000-4000-8000-000000000001', '20:00', 'resource.test',
  'table', 'neutral', 'RPC timeline', 'Canonical table_id reference',
  '91000000-0000-4000-8000-000000000007'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(
  public.soft_delete_resource('91000000-0000-4000-8000-000000000001'),
  true,
  'owner can soft-delete a clean Resource'
);
select is(
  (select count(*) from public.resources where id = '91000000-0000-4000-8000-000000000001'),
  0::bigint,
  'normal authenticated SELECT cannot see the deleted Resource'
);

select throws_ok(
  $$select public.soft_delete_resource('91000000-0000-4000-8000-000000000002')$$,
  'P0001', 'resource_has_history', 'Reservation history blocks deletion'
);
select throws_ok(
  $$select public.soft_delete_resource('91000000-0000-4000-8000-000000000003')$$,
  'P0001', 'resource_has_history', 'direct Guest history blocks deletion'
);
select throws_ok(
  $$select public.soft_delete_resource('91000000-0000-4000-8000-000000000004')$$,
  'P0001', 'resource_has_history', 'venue layout history blocks deletion'
);
select throws_ok(
  $$select public.soft_delete_resource('91000000-0000-4000-8000-000000000005')$$,
  'P0001', 'resource_has_history', 'event layout history blocks deletion'
);
select throws_ok(
  $$select public.soft_delete_resource('91000000-0000-4000-8000-000000000006')$$,
  'P0001', 'resource_has_history', 'legacy table history blocks deletion'
);
select throws_ok(
  $$select public.soft_delete_resource('91000000-0000-4000-8000-000000000007')$$,
  'P0001', 'resource_has_history', 'structured timeline table_id blocks deletion'
);
select throws_ok(
  $$select public.soft_delete_resource('91000000-0000-4000-8000-000000000008')$$,
  'P0002', 'resource_already_deleted', 'already deleted Resource is explicit'
);
select throws_ok(
  $$select public.soft_delete_resource('99000000-0000-4000-8000-000000000099')$$,
  'P0002', 'resource_not_found', 'missing Resource is explicit'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.soft_delete_resource('91000000-0000-4000-8000-000000000002')$$,
  '42501', 'resource_forbidden', 'user outside the tenant is rejected'
);

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.soft_delete_resource('91000000-0000-4000-8000-000000000002')$$,
  '28000', 'resource_unauthenticated', 'missing auth.uid is rejected'
);

reset role;
select ok(
  (select deleted_at is not null from public.resources where id = '91000000-0000-4000-8000-000000000001'),
  'successful RPC persists deleted_at inside its transaction'
);
select is(
  (
    select count(*)
    from public.resources
    where id between '91000000-0000-4000-8000-000000000002' and '91000000-0000-4000-8000-000000000007'
      and deleted_at is null
  ),
  6::bigint,
  'failed validations leave every Resource unchanged'
);
select is(
  (select proowner::regrole::text from pg_proc where oid = 'public.soft_delete_resource(uuid)'::regprocedure),
  'postgres',
  'RPC owner is controlled explicitly'
);

select * from finish();
rollback;
