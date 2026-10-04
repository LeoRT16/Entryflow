-- Explicitly activate one published event and atomically finish the previous live event.
create unique index if not exists events_one_live_per_organization_idx
  on public.events (organization_id)
  where status = 'live' and deleted_at is null;

create or replace function public.activate_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target events%rowtype;
  previous_live events%rowtype;
  actor text;
  role_name text;
begin
  if auth.uid() is null then
    raise exception 'event_activation_unauthenticated' using errcode = '28000';
  end if;

  select * into target from events where id = p_event_id and deleted_at is null for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if not is_platform_root() and not exists (
    select 1 from profiles p join roles r on r.id = p.role_id and r.deleted_at is null
    where p.user_id = current_app_user_id()
      and p.organization_id = target.organization_id
      and p.deleted_at is null
      and 'event.edit' = any(r.permissions)
  ) then raise exception 'event_activation_forbidden' using errcode = '42501'; end if;
  if target.status <> 'published' then raise exception 'event_activation_requires_published' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(target.organization_id::text, 0));
  select * into previous_live from events
    where organization_id = target.organization_id and status = 'live' and deleted_at is null and id <> target.id
    order by updated_at desc nulls last, id
    limit 1 for update;

  if previous_live.id is not null then
    update events set status = 'finished', updated_at = now() where id = previous_live.id;
  end if;
  update events set status = 'live', updated_at = now() where id = target.id;

  select coalesce(nullif(trim(u.display_name), ''), 'Operación'), coalesce(nullif(trim(r.name), ''), 'Operación')
    into actor, role_name
    from users u left join profiles p on p.user_id = u.id and p.organization_id = target.organization_id and p.deleted_at is null
    left join roles r on r.id = p.role_id and r.deleted_at is null
    where u.id = current_app_user_id() limit 1;
  if previous_live.id is not null then
    insert into timeline_events(event_id, timestamp, kind, icon, tone, title, description, metadata)
      values (previous_live.id, to_char(now(), 'HH24:MI'), 'event.finished', 'calendar', 'warning', 'Evento finalizado',
        format('%s dejó de estar en vivo al activar otro evento.', previous_live.name),
        jsonb_build_object('actor', actor, 'actorRole', role_name, 'organizationId', target.organization_id,
          'eventId', previous_live.id, 'previousStatus', 'live', 'nextStatus', 'finished', 'replacedByEventId', target.id));
  end if;
  insert into timeline_events(event_id, timestamp, kind, icon, tone, title, description, metadata)
    values (target.id, to_char(now(), 'HH24:MI'), 'event.activated', 'calendar', 'success', 'Evento activado',
      format('%s pasó a estar en vivo.', target.name),
      jsonb_build_object('actor', actor, 'actorRole', role_name, 'organizationId', target.organization_id,
        'eventId', target.id, 'previousLiveEventId', nullif(previous_live.id::text, ''),
        'previousStatus', 'published', 'nextStatus', 'live'));
  return jsonb_build_object('activatedEventId', target.id, 'previousLiveEventId', nullif(previous_live.id::text, ''));
end;
$$;

revoke all on function public.activate_event(uuid) from public, anon;
grant execute on function public.activate_event(uuid) to authenticated;
