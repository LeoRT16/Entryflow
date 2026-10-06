-- Atomic lifecycle transitions for publish, manual finish and cancellation.
create or replace function public.transition_event_status(p_event_id uuid, p_next_status text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e events%rowtype; actor text; role_name text; timeline_kind text; timeline_title text;
begin
 if auth.uid() is null then raise exception 'event_transition_unauthenticated' using errcode='28000'; end if;
 select * into e from events where id=p_event_id and deleted_at is null for update;
 if not found then raise exception 'event_not_found' using errcode='P0002'; end if;
 if not is_platform_root() and not exists (select 1 from profiles p join roles r on r.id=p.role_id and r.deleted_at is null where p.user_id=current_app_user_id() and p.organization_id=e.organization_id and p.deleted_at is null and 'event.edit'=any(r.permissions)) then raise exception 'event_transition_forbidden' using errcode='42501'; end if;
 if not ((e.status='draft' and p_next_status in ('published','cancelled')) or (e.status='published' and p_next_status in ('cancelled')) or (e.status='live' and p_next_status='finished')) then raise exception 'event_transition_invalid' using errcode='22023'; end if;
 update events set status=p_next_status,updated_at=now() where id=e.id;
 timeline_kind:=case p_next_status when 'published' then 'event.published' when 'finished' then 'event.finished' else 'event.cancelled' end;
 timeline_title:=case p_next_status when 'published' then 'Evento publicado' when 'finished' then 'Evento finalizado' else 'Evento cancelado' end;
 select coalesce(nullif(trim(u.display_name),''),'Operación'),coalesce(nullif(trim(r.name),''),'Operación') into actor,role_name from users u left join profiles p on p.user_id=u.id and p.organization_id=e.organization_id and p.deleted_at is null left join roles r on r.id=p.role_id and r.deleted_at is null where u.id=current_app_user_id() limit 1;
 insert into timeline_events(event_id,timestamp,kind,icon,tone,title,description,metadata,created_at,updated_at) values(e.id,to_char(now(),'HH24:MI'),timeline_kind,'calendar',case when p_next_status='cancelled' then 'danger' else 'warning' end,timeline_title,format('%s cambió de %s a %s.',e.name,e.status,p_next_status),jsonb_build_object('actor',actor,'actorRole',role_name,'organizationId',e.organization_id,'eventId',e.id,'previousStatus',e.status,'nextStatus',p_next_status),now(),now());
 return jsonb_build_object('eventId',e.id,'previousStatus',e.status,'nextStatus',p_next_status);
end; $$;
revoke all on function public.transition_event_status(uuid,text) from public,anon;
grant execute on function public.transition_event_status(uuid,text) to authenticated;
