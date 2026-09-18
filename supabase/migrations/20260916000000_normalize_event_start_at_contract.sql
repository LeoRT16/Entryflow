-- Normalize the three audited legacy values, then enforce the canonical
-- start_at text contract for all events (including archived/deleted events).
do $$
declare
  expected record;
  current_count integer;
  expected_updates integer := 0;
  first_update_rows integer;
  second_update_rows integer;
  invalid_rows integer;
begin
  for expected in
    select * from (values
      ('0c5dad92-4ae6-4521-8f6f-40e7f0e90cc9'::uuid, 'Sábado 29 de Agosto', '29 de agosto de 2026 21:00', '2026-08-29T21:00'),
      ('3ea14cb8-f6aa-4706-8b53-a149d3f0ae9d'::uuid, 'Conferencia', '8 de agosto de 2026 21:00', '2026-08-08T21:00'),
      ('b8e1a6f2-42ab-46cb-a0a1-5fd6fce49c14'::uuid, 'Concierto', '8 de agosto de 2026 21:00', '2026-08-08T21:00')
    ) as known(id, name, legacy_start_at, canonical_start_at)
  loop
    select count(*) into current_count
    from public.events e
    where e.id = expected.id;

    if current_count = 1 then
      if not exists (
        select 1 from public.events e
        where e.id = expected.id
          and e.name = expected.name
          and e.timezone = 'America/La_Paz'
          and e.start_at in (expected.legacy_start_at, expected.canonical_start_at)
      ) then
        raise exception 'event_start_at_known_row_precondition_failed: %', expected.id;
      end if;

      if exists (
        select 1 from public.events e
        where e.id = expected.id and e.start_at = expected.legacy_start_at
      ) then
        expected_updates := expected_updates + 1;
      end if;
    end if;
  end loop;

  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.events'::regclass
      and t.tgname = 'set_updated_at_events'
      and not t.tgisinternal
      and t.tgenabled = 'O'
  ) then
    raise exception 'event_start_at_updated_at_trigger_precondition_failed';
  end if;

  -- This data-only normalization must preserve updated_at as well as every
  -- other Event field. The trigger is restored before leaving this block.
  execute 'alter table public.events disable trigger set_updated_at_events';

  update public.events
  set start_at = '2026-08-29T21:00'
  where id = '0c5dad92-4ae6-4521-8f6f-40e7f0e90cc9'
  and name = 'Sábado 29 de Agosto'
  and timezone = 'America/La_Paz'
  and start_at = '29 de agosto de 2026 21:00';
  get diagnostics first_update_rows = row_count;

  update public.events
  set start_at = '2026-08-08T21:00'
  where id in (
      '3ea14cb8-f6aa-4706-8b53-a149d3f0ae9d',
      'b8e1a6f2-42ab-46cb-a0a1-5fd6fce49c14'
    )
    and start_at in ('8 de agosto de 2026 21:00')
    and timezone = 'America/La_Paz'
    and (name, id) in (
      ('Conferencia', '3ea14cb8-f6aa-4706-8b53-a149d3f0ae9d'::uuid),
      ('Concierto', 'b8e1a6f2-42ab-46cb-a0a1-5fd6fce49c14'::uuid)
    );
  get diagnostics second_update_rows = row_count;
  execute 'alter table public.events enable trigger set_updated_at_events';

  if first_update_rows + second_update_rows <> expected_updates then
    raise exception 'event_start_at_normalization_row_count_mismatch';
  end if;

  select count(*) into invalid_rows
  from public.events e
  where case
    when e.start_at ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])([T ]([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?|T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,9})?)?(Z|[+-]((0[0-9]|1[0-3]):[0-5][0-9]|14:00)))?$'
    then to_char(to_date(left(e.start_at, 10), 'YYYY-MM-DD')::timestamp without time zone, 'YYYY-MM-DD') <> left(e.start_at, 10)
    else true
  end;

  if invalid_rows <> 0 then
    raise exception 'event_start_at_unclassified_rows_remain: %', invalid_rows;
  end if;
end;
$$;

alter table public.events
  add constraint events_start_at_canonical_check
  check (
    case
      when start_at ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])([T ]([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?|T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,9})?)?(Z|[+-]((0[0-9]|1[0-3]):[0-5][0-9]|14:00)))?$'
      then to_char(to_date(left(start_at, 10), 'YYYY-MM-DD')::timestamp without time zone, 'YYYY-MM-DD') = left(start_at, 10)
      else false
    end
  );
