-- Activation and final reporting share one transactional finalization primitive.
-- PDF delivery remains asynchronous: the durable job is committed here and the worker
-- can safely retry when Google Drive is unavailable.

create or replace function public.finalize_event_with_final_report(
  p_event_id uuid,
  p_report jsonb,
  p_expected_revision bigint,
  p_replaced_by_event_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  e events%rowtype;
  actor text;
  role_name text;
  current_revision bigint;
  snapshot_id uuid;
  job_id uuid;
  report_hash text;
begin
  if auth.uid() is null then
    raise exception 'event_transition_unauthenticated' using errcode = '28000';
  end if;

  select * into e from events where id = p_event_id and deleted_at is null for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if not public.is_platform_root() and not exists (
    select 1 from profiles p join roles r on r.id = p.role_id and r.deleted_at is null
    where p.user_id = public.current_app_user_id()
      and p.organization_id = e.organization_id
      and p.deleted_at is null
      and 'event.edit' = any(r.permissions)
  ) then raise exception 'event_transition_forbidden' using errcode = '42501'; end if;
  if e.status <> 'live' then raise exception 'event_transition_invalid' using errcode = '22023'; end if;
  if p_report is null or p_expected_revision is null then raise exception 'final_report_required' using errcode = '22023'; end if;

  select revision into current_revision from reporting_event_revisions where event_id = e.id for update;
  if current_revision is distinct from p_expected_revision then
    raise exception 'final_report_revision_conflict' using errcode = '40001';
  end if;

  report_hash := md5(p_report::text);
  insert into reporting_final_snapshots(organization_id,event_id,event_revision,report,snapshot_hash)
    values(e.organization_id,e.id,current_revision,p_report,report_hash)
    on conflict(event_id) do nothing
    returning id into snapshot_id;
  if snapshot_id is null then select id into snapshot_id from reporting_final_snapshots where event_id = e.id; end if;
  insert into reporting_final_report_jobs(snapshot_id,organization_id,event_id)
    values(snapshot_id,e.organization_id,e.id)
    on conflict(event_id) do nothing
    returning id into job_id;
  if job_id is null then select id into job_id from reporting_final_report_jobs where event_id = e.id; end if;

  update events set status = 'finished', updated_at = now() where id = e.id;
  select coalesce(nullif(trim(u.display_name),''),'Operación'), coalesce(nullif(trim(r.name),''),'Operación')
    into actor,role_name
    from users u left join profiles p on p.user_id = u.id and p.organization_id = e.organization_id and p.deleted_at is null
    left join roles r on r.id = p.role_id and r.deleted_at is null
    where u.id = public.current_app_user_id() limit 1;
  insert into timeline_events(event_id,timestamp,kind,icon,tone,title,description,metadata,created_at,updated_at)
    values(e.id,to_char(now(),'HH24:MI'),'event.finished','calendar','warning','Evento finalizado',
      format('%s cambió de %s a finished.',e.name,e.status),
      jsonb_build_object('actor',actor,'actorRole',role_name,'organizationId',e.organization_id,
        'eventId',e.id,'previousStatus',e.status,'nextStatus','finished',
        'replacedByEventId',p_replaced_by_event_id),now(),now());
  return jsonb_build_object('eventId',e.id,'previousStatus',e.status,'nextStatus','finished',
    'finalSnapshotId',snapshot_id,'finalReportJobId',job_id,'reportingRevision',current_revision);
end;
$$;

create or replace function public.transition_event_status(p_event_id uuid,p_next_status text,p_report jsonb default null,p_expected_revision bigint default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e events%rowtype; actor text; role_name text; timeline_kind text; timeline_title text;
begin
  if p_next_status = 'finished' then
    return public.finalize_event_with_final_report(p_event_id,p_report,p_expected_revision,null);
  end if;
  if auth.uid() is null then raise exception 'event_transition_unauthenticated' using errcode='28000'; end if;
  select * into e from events where id=p_event_id and deleted_at is null for update;
  if not found then raise exception 'event_not_found' using errcode='P0002'; end if;
  if not public.is_platform_root() and not exists (select 1 from profiles p join roles r on r.id=p.role_id and r.deleted_at is null where p.user_id=public.current_app_user_id() and p.organization_id=e.organization_id and p.deleted_at is null and 'event.edit'=any(r.permissions)) then raise exception 'event_transition_forbidden' using errcode='42501'; end if;
  if not ((e.status='draft' and p_next_status in ('published','cancelled')) or (e.status='published' and p_next_status in ('cancelled'))) then raise exception 'event_transition_invalid' using errcode='22023'; end if;
  update events set status=p_next_status,updated_at=now() where id=e.id;
  timeline_kind:=case p_next_status when 'published' then 'event.published' else 'event.cancelled' end;
  timeline_title:=case p_next_status when 'published' then 'Evento publicado' else 'Evento cancelado' end;
  select coalesce(nullif(trim(u.display_name),''),'Operación'),coalesce(nullif(trim(r.name),''),'Operación') into actor,role_name from users u left join profiles p on p.user_id=u.id and p.organization_id=e.organization_id and p.deleted_at is null left join roles r on r.id=p.role_id and r.deleted_at is null where u.id=public.current_app_user_id() limit 1;
  insert into timeline_events(event_id,timestamp,kind,icon,tone,title,description,metadata,created_at,updated_at) values(e.id,to_char(now(),'HH24:MI'),timeline_kind,'calendar',case when p_next_status='cancelled' then 'danger' else 'warning' end,timeline_title,format('%s cambió de %s a %s.',e.name,e.status,p_next_status),jsonb_build_object('actor',actor,'actorRole',role_name,'organizationId',e.organization_id,'eventId',e.id,'previousStatus',e.status,'nextStatus',p_next_status),now(),now());
  return jsonb_build_object('eventId',e.id,'previousStatus',e.status,'nextStatus',p_next_status);
end; $$;

drop function if exists public.activate_event(uuid);
create function public.activate_event(
  p_event_id uuid,
  p_previous_live_report jsonb default null,
  p_previous_live_expected_revision bigint default null
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target events%rowtype; previous_live events%rowtype; finalized jsonb; actor text; role_name text;
begin
  if auth.uid() is null then raise exception 'event_activation_unauthenticated' using errcode='28000'; end if;
  select * into target from events where id=p_event_id and deleted_at is null for update;
  if not found then raise exception 'event_not_found' using errcode='P0002'; end if;
  if not public.is_platform_root() and not exists (select 1 from profiles p join roles r on r.id=p.role_id and r.deleted_at is null where p.user_id=public.current_app_user_id() and p.organization_id=target.organization_id and p.deleted_at is null and 'event.edit'=any(r.permissions)) then raise exception 'event_activation_forbidden' using errcode='42501'; end if;
  if target.status <> 'published' then raise exception 'event_activation_requires_published' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target.organization_id::text,0));
  select * into previous_live from events where organization_id=target.organization_id and status='live' and deleted_at is null and id<>target.id order by updated_at desc nulls last,id limit 1 for update;
  if previous_live.id is not null then
    if p_previous_live_report is null or p_previous_live_expected_revision is null then raise exception 'previous_live_final_report_required' using errcode='22023'; end if;
    finalized := public.finalize_event_with_final_report(previous_live.id,p_previous_live_report,p_previous_live_expected_revision,target.id);
  end if;
  update events set status='live',updated_at=now() where id=target.id;
  select coalesce(nullif(trim(u.display_name),''),'Operación'),coalesce(nullif(trim(r.name),''),'Operación') into actor,role_name from users u left join profiles p on p.user_id=u.id and p.organization_id=target.organization_id and p.deleted_at is null left join roles r on r.id=p.role_id and r.deleted_at is null where u.id=public.current_app_user_id() limit 1;
  insert into timeline_events(event_id,timestamp,kind,icon,tone,title,description,metadata) values(target.id,to_char(now(),'HH24:MI'),'event.activated','calendar','success','Evento activado',format('%s pasó a estar en vivo.',target.name),jsonb_build_object('actor',actor,'actorRole',role_name,'organizationId',target.organization_id,'eventId',target.id,'previousLiveEventId',nullif(previous_live.id::text,''),'previousStatus','published','nextStatus','live'));
  return jsonb_build_object('activatedEventId',target.id,'previousLiveEventId',nullif(previous_live.id::text,''),'previousLiveFinalization',finalized);
end; $$;
revoke all on function public.finalize_event_with_final_report(uuid,jsonb,bigint,uuid) from public,anon,authenticated;
revoke all on function public.activate_event(uuid,jsonb,bigint) from public,anon;
grant execute on function public.activate_event(uuid,jsonb,bigint) to authenticated;
