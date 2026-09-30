create or replace function public.assign_reservation_table_atomic(p_reservation_id uuid,p_destination_table_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r reservations%rowtype; res resources%rowtype; gids text[]; src uuid; changed boolean:=true; v_name text; v_cap int; v_sector uuid; v_sector_name text; v_layout uuid; v_elr uuid;
begin
 if auth.uid() is null then raise exception 'reservation_unauthenticated' using errcode='28000'; end if;
 select * into r from reservations where id=p_reservation_id and deleted_at is null for update;
 if not found then raise exception 'reservation_not_found' using errcode='P0002'; end if;
 if r.status not in ('Draft','Pending','Confirmed') then raise exception 'reservation_terminal' using errcode='22023'; end if;
 if not (r.event_id=any(current_event_ids())) then raise exception 'reservation_forbidden' using errcode='42501'; end if;
 if not exists(select 1 from events e join profiles p on p.organization_id=e.organization_id and p.user_id=current_app_user_id() and p.deleted_at is null join roles ro on ro.id=p.role_id and ro.deleted_at is null where e.id=r.event_id and 'resource.assign'=any(ro.permissions)) then raise exception 'resource_permission_denied' using errcode='42501'; end if;
 src:=nullif(r.resource_id::text,'')::uuid;
 perform 1 from resources where id in (src,p_destination_table_id) and deleted_at is null order by id for update;
 select * into res from resources where id=p_destination_table_id and deleted_at is null;
 if not found then raise exception 'table_not_found' using errcode='P0002'; end if;
 v_name:=res.name; v_cap:=res.capacity; v_sector:=res.sector_id; select name into v_sector_name from sectors where id=res.sector_id;
 select elr.id, elr.event_layout_id into v_elr, v_layout from event_layout_resources elr join event_layouts el on el.id=elr.event_layout_id left join venue_layout_resources vlr on vlr.id=elr.source_venue_layout_resource_id where el.event_id=r.event_id and (vlr.source_resource_id=res.id or elr.source_venue_layout_resource_id=res.id) and elr.deleted_at is null and elr.status='active' order by elr.id limit 1;
 if v_elr is null then raise exception 'event_layout_resource_not_found' using errcode='P0002'; end if;
 if res.status in ('inactive','archived','Closed','closed') then raise exception 'table_closed' using errcode='22023'; end if;
 if exists(select 1 from reservations x where x.id<>r.id and x.deleted_at is null and x.event_id=r.event_id and (x.table_id=p_destination_table_id::text or x.resource_id=p_destination_table_id) and x.status in ('Draft','Pending','Confirmed')) then raise exception 'table_already_assigned' using errcode='23505'; end if;
 perform 1 from guests where reservation_id=r.id::text and deleted_at is null order by id for update;
 if r.resource_id=p_destination_table_id then
  if r.table_id is distinct from p_destination_table_id::text or r.table_name is distinct from v_name or r.event_layout_resource_id is distinct from v_elr or exists(select 1 from guests where reservation_id=r.id::text and deleted_at is null and coalesce(reservation_status,'')<>'Cancelled' and table_id is distinct from p_destination_table_id::text) then raise exception 'assignment_consistency_error' using errcode='22023'; end if;
  changed:=false;
 else
  update reservations set resource_id=p_destination_table_id,table_id=p_destination_table_id::text,table_name=v_name,event_layout_resource_id=v_elr,event_layout_id=v_layout,table_capacity=v_cap where id=r.id;
  update guests set table_id=p_destination_table_id::text,table_name=v_name where reservation_id=r.id::text and deleted_at is null and coalesce(reservation_status,'')<>'Cancelled';
  if src is not null and src<>p_destination_table_id then update tables set reservation_ids=array_remove(reservation_ids,r.id::text),guest_ids=array(select unnest(guest_ids) except select id::text from guests where reservation_id=r.id::text),status='Available' where id=src and deleted_at is null; end if;
  
 end if;
 select coalesce(array_agg(id::text order by id),'{}') into gids from guests where reservation_id=r.id::text and deleted_at is null;
 return jsonb_build_object('reservation_id',r.id,'source_table_id',src,'destination_table_id',p_destination_table_id,'guest_ids',gids,'changed',changed,'reservation',jsonb_build_object('resource_id',case when changed then p_destination_table_id else r.resource_id end,'table_id',case when changed then p_destination_table_id::text else r.table_id end,'table_name',case when changed then v_name else r.table_name end,'table_capacity',case when changed then v_cap else r.table_capacity end));
end; $$;

create or replace function public.release_reservation_table_atomic(p_reservation_id uuid,p_expected_table_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r reservations%rowtype; gids text[]; src uuid;
begin
 if auth.uid() is null then raise exception 'reservation_unauthenticated' using errcode='28000'; end if;
 select * into r from reservations where id=p_reservation_id and deleted_at is null for update;
 if not found then raise exception 'reservation_not_found' using errcode='P0002'; end if;
 if r.status not in ('Draft','Pending','Confirmed') then raise exception 'reservation_terminal' using errcode='22023'; end if;
 if r.resource_id is null or r.resource_id<>p_expected_table_id then raise exception 'stale_release' using errcode='40001'; end if;
 perform 1 from resources where id=r.resource_id and deleted_at is null for update;
 if not (r.event_id=any(current_event_ids())) then raise exception 'reservation_forbidden' using errcode='42501'; end if;
 if not exists(select 1 from events e join profiles p on p.organization_id=e.organization_id and p.user_id=current_app_user_id() and p.deleted_at is null join roles ro on ro.id=p.role_id and ro.deleted_at is null where e.id=r.event_id and 'resource.assign'=any(ro.permissions)) then raise exception 'resource_permission_denied' using errcode='42501'; end if;
 src:=p_expected_table_id; perform 1 from guests where reservation_id=r.id::text and deleted_at is null order by id for update;
 update reservations set resource_id=null,table_id=null,event_layout_resource_id=null,event_layout_id=null,table_name='Sin mesa' where id=r.id;
 update guests set table_id=null,table_name=null where reservation_id=r.id::text and deleted_at is null and coalesce(reservation_status,'')<>'Cancelled';
 
 select coalesce(array_agg(id::text order by id),'{}') into gids from guests where reservation_id=r.id::text and deleted_at is null;
 return jsonb_build_object('reservation_id',r.id,'released_table_id',src,'guest_ids',gids,'changed',true,'reservation',jsonb_build_object('resource_id',null,'table_id',null,'table_capacity',r.table_capacity));
end; $$;

create or replace function public.close_table_atomic(p_table_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare res resources%rowtype;
begin
 if auth.uid() is null then raise exception 'reservation_unauthenticated' using errcode='28000'; end if;
 select * into res from resources where id=p_table_id and deleted_at is null for update;
 if not found then raise exception 'table_not_found' using errcode='P0002'; end if;
 if not exists(select 1 from venues v where v.id=res.venue_id and v.organization_id=any(current_organization_ids()) and v.deleted_at is null) then raise exception 'resource_forbidden' using errcode='42501'; end if;
 if not exists(select 1 from events e where e.organization_id=any(current_organization_ids())) then raise exception 'table_forbidden' using errcode='42501'; end if;
 if not exists(select 1 from events e join profiles p on p.organization_id=e.organization_id and p.user_id=current_app_user_id() and p.deleted_at is null join roles ro on ro.id=p.role_id and ro.deleted_at is null where e.organization_id=any(current_organization_ids()) and 'resource.manage'=any(ro.permissions)) then raise exception 'resource_permission_denied' using errcode='42501'; end if;
 update resources set status='Closed' where id=res.id;
 return jsonb_build_object('table_id',res.id,'status','Closed','closed',true,'changed',res.status <> 'Closed');
end; $$;
revoke all on function public.assign_reservation_table_atomic(uuid,uuid) from public,anon,service_role;
revoke all on function public.release_reservation_table_atomic(uuid,uuid) from public,anon,service_role;
revoke all on function public.close_table_atomic(uuid) from public,anon,service_role;
grant execute on function public.assign_reservation_table_atomic(uuid,uuid) to authenticated;
grant execute on function public.release_reservation_table_atomic(uuid,uuid) to authenticated;
grant execute on function public.close_table_atomic(uuid) to authenticated;
