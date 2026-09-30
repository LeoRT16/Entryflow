alter table public.event_layout_resources
  add column if not exists source_resource_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_layout_resources_source_resource_id_fkey'
      and conrelid = 'public.event_layout_resources'::regclass
  ) then
    alter table public.event_layout_resources
      add constraint event_layout_resources_source_resource_id_fkey
      foreign key (source_resource_id) references public.resources(id) on delete set null;
  end if;
end;
$$;

create unique index if not exists event_layout_resources_source_resource_active_unique
  on public.event_layout_resources (event_layout_id, source_resource_id)
  where deleted_at is null and source_resource_id is not null and status = 'active';
