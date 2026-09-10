create or replace function public.soft_delete_resource(p_resource_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resource public.resources%rowtype;
begin
  if auth.uid() is null then
    raise exception 'resource_unauthenticated' using errcode = '28000';
  end if;

  select * into v_resource
  from public.resources
  where id = p_resource_id
  for update;

  if not found then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;

  if v_resource.deleted_at is not null then
    raise exception 'resource_already_deleted' using errcode = 'P0002';
  end if;

  if not (v_resource.venue_id = any(public.current_venue_ids())) then
    raise exception 'resource_forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.venues as v
    join public.profiles as p
      on p.organization_id = v.organization_id
     and p.user_id = public.current_app_user_id()
     and p.deleted_at is null
    join public.roles as r
      on r.id = p.role_id
     and r.deleted_at is null
    where v.id = v_resource.venue_id
      and v.deleted_at is null
      and 'resource.manage' = any(r.permissions)
  ) then
    raise exception 'resource_forbidden' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.reservations as reservation
    where reservation.resource_id = p_resource_id
       or reservation.table_id = p_resource_id::text
  ) or exists (
    select 1
    from public.guests as guest
    where guest.table_id = p_resource_id::text
       or exists (
         select 1
         from public.reservations as reservation
         where reservation.id::text = guest.reservation_id
           and (
             reservation.resource_id = p_resource_id
             or reservation.table_id = p_resource_id::text
           )
       )
  ) or exists (
    select 1
    from public.venue_layout_resources as venue_layout_resource
    where venue_layout_resource.source_resource_id = p_resource_id
  ) or exists (
    select 1
    from public.event_layout_resources as event_layout_resource
    join public.venue_layout_resources as venue_layout_resource
      on venue_layout_resource.id = event_layout_resource.source_venue_layout_resource_id
    where venue_layout_resource.source_resource_id = p_resource_id
  ) or exists (
    select 1
    from public.tables as legacy_table
    where legacy_table.id = p_resource_id
  ) or exists (
    select 1
    from public.timeline_events as timeline_event
    where timeline_event.table_id = p_resource_id::text
  ) then
    raise exception 'resource_has_history' using errcode = 'P0001';
  end if;

  update public.resources
  set deleted_at = now(),
      updated_at = now()
  where id = p_resource_id;

  return true;
end;
$$;

alter function public.soft_delete_resource(uuid) owner to postgres;
revoke all on function public.soft_delete_resource(uuid) from public;
revoke all on function public.soft_delete_resource(uuid) from anon;
revoke all on function public.soft_delete_resource(uuid) from service_role;
grant execute on function public.soft_delete_resource(uuid) to authenticated;

comment on function public.soft_delete_resource(uuid) is
  'Authoritatively validates tenant scope, resource.manage permission, and all canonical Resource history before soft deletion.';
