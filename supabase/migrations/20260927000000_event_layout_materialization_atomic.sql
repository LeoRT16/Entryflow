create or replace function public.materialize_event_layout_atomic(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events%rowtype;
  v_venue public.venues%rowtype;
  v_layout public.venue_layouts%rowtype;
  v_event_layout public.event_layouts%rowtype;
  v_event_layout_count integer;
  v_resource_count integer;
  v_layout_count integer;
  v_changed boolean;
  v_source_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'event_layout_unauthenticated' using errcode = '28000';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.deleted_at is not null then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.profiles p
    join public.roles r on r.id = p.role_id and r.deleted_at is null
    where p.user_id = public.current_app_user_id()
      and p.organization_id = v_event.organization_id
      and p.deleted_at is null
      and 'event.edit' = any(r.permissions)
  ) then
    raise exception 'event_layout_forbidden' using errcode = '42501';
  end if;
  if v_event.venue_id is null then
    raise exception 'event_venue_required' using errcode = '22023';
  end if;

  select * into v_venue from public.venues where id = v_event.venue_id for update;
  if not found or v_venue.deleted_at is not null then
    raise exception 'event_venue_not_found' using errcode = 'P0002';
  end if;
  if v_venue.organization_id <> v_event.organization_id then
    raise exception 'event_venue_organization_mismatch' using errcode = '22023';
  end if;

  -- The event row lock serializes the graph creation for this event.
  select count(*) into v_event_layout_count
  from public.event_layouts where event_id = p_event_id and deleted_at is null;
  if v_event_layout_count > 1 then
    raise exception 'event_layout_consistency_error' using errcode = '22023';
  end if;
  if v_event_layout_count = 1 then
    select * into v_event_layout from public.event_layouts
    where event_id = p_event_id and deleted_at is null;
    if v_event_layout.venue_id <> v_event.venue_id then
      raise exception 'event_layout_venue_mismatch' using errcode = '22023';
    end if;
    select count(*) into v_resource_count from public.event_layout_resources
      where event_layout_id = v_event_layout.id and deleted_at is null;
    if v_resource_count = 0 or exists (
      select 1 from public.event_layout_resources elr
      left join public.resources r on r.id = elr.source_resource_id
      where elr.event_layout_id = v_event_layout.id and elr.deleted_at is null
        and (elr.source_resource_id is null or r.id is null or r.venue_id <> v_event.venue_id or r.deleted_at is not null)
    ) then
      raise exception 'event_layout_consistency_error' using errcode = '22023';
    end if;
    return jsonb_build_object('changed', false, 'event_id', p_event_id,
      'event_layout_id', v_event_layout.id, 'venue_id', v_event.venue_id,
      'source_venue_layout_id', v_event_layout.source_venue_layout_id,
      'resource_count', v_resource_count);
  end if;

  select count(*) into v_layout_count from public.venue_layouts
    where venue_id = v_venue.id and deleted_at is null and status = 'active' and is_default;
  if v_layout_count > 1 then
    raise exception 'venue_layout_ambiguous' using errcode = '22023';
  elsif v_layout_count = 1 then
    select * into v_layout from public.venue_layouts
      where venue_id = v_venue.id and deleted_at is null and status = 'active' and is_default;
  else
    select count(*) into v_layout_count from public.venue_layouts
      where venue_id = v_venue.id and deleted_at is null and status = 'active';
    if v_layout_count = 1 then
      select * into v_layout from public.venue_layouts
        where venue_id = v_venue.id and deleted_at is null and status = 'active';
    end if;
  end if;

  if v_layout.id is not null then
    select count(*) into v_resource_count from public.venue_layout_resources vlr
      join public.resources r on r.id = vlr.source_resource_id
      where vlr.venue_layout_id = v_layout.id and vlr.deleted_at is null and vlr.status = 'active'
        and r.venue_id = v_venue.id and r.deleted_at is null and lower(r.status) in ('active','available');
    if v_resource_count = 0 or exists (
      select 1 from public.venue_layout_resources vlr
      left join public.resources r on r.id = vlr.source_resource_id
      where vlr.venue_layout_id = v_layout.id and vlr.deleted_at is null and vlr.status = 'active'
        and (vlr.source_resource_id is null or r.id is null or r.venue_id <> v_venue.id or r.deleted_at is not null or lower(r.status) not in ('active','available'))
    ) then
      raise exception 'event_layout_source_resource_invalid' using errcode = '22023';
    end if;
  else
    select count(*) into v_resource_count from public.resources r
      where r.venue_id = v_venue.id and r.deleted_at is null and lower(r.status) in ('active','available');
    if v_resource_count = 0 then
      raise exception 'event_layout_resources_required' using errcode = '22023';
    end if;
  end if;

  insert into public.event_layouts(event_id,venue_id,source_venue_layout_id,name,description,status,metadata)
  values (p_event_id,v_venue.id,case when v_layout.id is null then null else v_layout.id end,
    v_event.name || ' Layout',v_layout.description,'active',coalesce(v_layout.metadata,'{}'::jsonb))
  returning * into v_event_layout;

  drop table if exists _event_layout_sector_map;
  create temporary table _event_layout_sector_map(source_id uuid primary key,target_id uuid not null) on commit drop;
  if v_layout.id is not null then
    insert into public.event_layout_sectors(event_layout_id,source_venue_layout_sector_id,name,description,capacity,status,display_order,metadata)
    select v_event_layout.id,vls.id,vls.name,vls.description,vls.capacity,'active',vls.display_order,vls.metadata
    from public.venue_layout_sectors vls where vls.venue_layout_id=v_layout.id and vls.deleted_at is null and vls.status='active';
    insert into _event_layout_sector_map(source_id,target_id)
    select source_venue_layout_sector_id,id from public.event_layout_sectors
    where event_layout_id=v_event_layout.id and deleted_at is null and source_venue_layout_sector_id is not null;
    insert into public.event_layout_resources(event_layout_id,event_layout_sector_id,source_venue_layout_resource_id,source_resource_id,type,name,capacity,status,display_order,notes,metadata)
    select v_event_layout.id,m.target_id,vlr.id,vlr.source_resource_id,vlr.type,vlr.name,vlr.capacity,'active',vlr.display_order,vlr.notes,vlr.metadata
    from public.venue_layout_resources vlr left join _event_layout_sector_map m on m.source_id=vlr.venue_layout_sector_id
    where vlr.venue_layout_id=v_layout.id and vlr.deleted_at is null and vlr.status='active';
  else
    -- event_layout_sectors has no canonical source_sector_id column, so a direct
    -- Resource synthesis cannot safely invent a sector identity. Preserve the
    -- Resource identity and leave the snapshot sector relation NULL.
    insert into public.event_layout_resources(event_layout_id,event_layout_sector_id,source_venue_layout_resource_id,source_resource_id,type,name,capacity,status,display_order,notes,metadata)
    select v_event_layout.id,null::uuid,null,r.id,r.type,r.name,r.capacity,'active',r.display_order,r.notes,r.metadata
    from public.resources r
    where r.venue_id=v_venue.id and r.deleted_at is null and lower(r.status) in ('active','available');
  end if;
  select count(*) into v_resource_count from public.event_layout_resources where event_layout_id=v_event_layout.id and deleted_at is null;
  return jsonb_build_object('changed',true,'event_id',p_event_id,'event_layout_id',v_event_layout.id,'venue_id',v_venue.id,'source_venue_layout_id',v_event_layout.source_venue_layout_id,'resource_count',v_resource_count);
end;
$$;

revoke all on function public.materialize_event_layout_atomic(uuid) from public, anon;
grant execute on function public.materialize_event_layout_atomic(uuid) to authenticated;
