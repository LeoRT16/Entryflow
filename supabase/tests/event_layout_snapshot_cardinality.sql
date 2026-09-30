begin;
create extension if not exists pgtap;
select plan(4);
select ok(not exists (select 1 from pg_constraint where conrelid='public.event_layouts'::regclass and conname='event_layouts_event_id_key'),'global event_id uniqueness removed');
select ok(exists (select 1 from pg_indexes where schemaname='public' and tablename='event_layouts' and indexname='event_layouts_event_id_active_unique' and indexdef ilike '%where%deleted_at is null%status = ''active''%'),'partial active uniqueness exists');
select ok(exists (select 1 from pg_proc where proname='materialize_event_layout_atomic'),'materializer exists');
select ok(exists (select 1 from pg_proc where proname='assign_reservation_table_atomic'),'assignment RPC exists');
select * from finish();
rollback;
