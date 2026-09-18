begin;
create extension if not exists pgtap;
select plan(1);

do $$
declare
  v_organization_id uuid := 'd6200000-0000-4000-8000-000000000001';
  sample text;
  accepted_values text[] := array[
    '2026-08-29',
    '2026-08-29T21:00',
    '2026-08-29 21:00',
    '2026-08-29T21:00:00',
    '2026-08-29T21:00:00-04:00',
    '2026-08-30T01:00:00Z',
    '2026-09-02T21:00:00.000Z'
  ];
  rejected_values text[] := array[
    '29 de agosto de 2026 21:00',
    '8 de agosto de 2026 21:00',
    '',
    'garbage',
    '2026-02-29',
    '2026-08-29T21:00:00+14:01',
    '2026-08-29T21:00:00.000'
  ];
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_start_at_canonical_check'
      and contype = 'c'
      and convalidated
  ) then
    raise exception 'canonical start_at constraint missing or not validated';
  end if;

  insert into public.organizations(id, name, slug, status, timezone)
  values (v_organization_id, 'Event start_at contract test', 'event-start-at-contract-test', 'active', 'UTC');

  foreach sample in array accepted_values loop
    insert into public.events(id, organization_id, name, event_type, status, start_at, timezone, venue, operational_model)
    values (gen_random_uuid(), v_organization_id, 'Accepted start_at fixture', 'test', 'draft', sample, 'America/La_Paz', 'Test venue', 'mixed');
  end loop;

  foreach sample in array rejected_values loop
    begin
      insert into public.events(id, organization_id, name, event_type, status, start_at, timezone, venue, operational_model)
      values (gen_random_uuid(), v_organization_id, 'Rejected start_at fixture', 'test', 'draft', sample, 'America/La_Paz', 'Test venue', 'mixed');
      raise exception 'invalid start_at unexpectedly accepted: %', sample;
    exception when check_violation or datetime_field_overflow then
      null;
    end;
  end loop;

  begin
    insert into public.events(id, organization_id, name, event_type, status, start_at, timezone, venue, operational_model)
    values (gen_random_uuid(), v_organization_id, 'Null start_at fixture', 'test', 'draft', null, 'America/La_Paz', 'Test venue', 'mixed');
    raise exception 'NULL start_at unexpectedly accepted';
  exception when not_null_violation then
    null;
  end;

  if exists (
    select 1 from public.events e
    where e.organization_id = v_organization_id
      and e.name in ('Accepted start_at fixture', 'Rejected start_at fixture', 'Null start_at fixture')
      and e.start_at !~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])([T ]([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?|T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?(\.[0-9]{1,9})?(Z|[+-]((0[0-9]|1[0-3]):[0-5][0-9]|14:00)))?$'
  ) then
    raise exception 'invalid event start_at fixture persisted';
  end if;
end;
$$;

select pass('event start_at contract checks');
select * from finish();
rollback;
