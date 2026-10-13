-- Never create a revision for an event row that no longer exists.
CREATE OR REPLACE FUNCTION public.bump_reporting_event_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare old_event uuid; new_event uuid; venue uuid; org uuid;
begin
  if TG_TABLE_NAME = 'events' and TG_OP = 'DELETE' then
    return old;
  end if;
  if TG_TABLE_NAME in ('events','reservations','guests','checkins','tables','timeline_events','reservation_extra_wristband_sales','event_layouts') then
    -- Serialize dependency mutation with finalization's event lock.
    if TG_TABLE_NAME <> 'events' then
      new_event := case when TG_OP <> 'DELETE' then (to_jsonb(NEW)->>'event_id')::uuid else null end;
      old_event := case when TG_OP <> 'INSERT' then (to_jsonb(OLD)->>'event_id')::uuid else null end;
      perform 1 from events where id=coalesce(new_event,old_event) for update;
    end if;
    old_event := case when TG_OP <> 'INSERT' then (to_jsonb(OLD)->>'event_id')::uuid end;
    new_event := case when TG_OP <> 'DELETE' then (to_jsonb(NEW)->>'event_id')::uuid end;
    if TG_TABLE_NAME='events' then
      old_event := case when TG_OP <> 'INSERT' then OLD.id end;
      new_event := case when TG_OP <> 'DELETE' then NEW.id end;
    end if;
    if old_event is not null and exists (select 1 from events where id=old_event) then
      insert into reporting_event_revisions(event_id,revision,updated_at) values(old_event,1,now())
      on conflict(event_id) do update set revision=reporting_event_revisions.revision+1,updated_at=now();
    end if;
    if new_event is not null and new_event is distinct from old_event and exists (select 1 from events where id=new_event) then
      insert into reporting_event_revisions(event_id,revision,updated_at) values(new_event,1,now())
      on conflict(event_id) do update set revision=reporting_event_revisions.revision+1,updated_at=now();
    elsif new_event is not null and old_event is null and exists (select 1 from events where id=new_event) then
      insert into reporting_event_revisions(event_id,revision,updated_at) values(new_event,1,now())
      on conflict(event_id) do update set revision=reporting_event_revisions.revision+1,updated_at=now();
    end if;
  elsif TG_TABLE_NAME in ('venues','sectors','resources') then
    org := case when TG_OP <> 'INSERT' then (to_jsonb(OLD)->>'organization_id')::uuid end;
    if org is null then
      venue := case when TG_OP <> 'INSERT' then (to_jsonb(OLD)->>'venue_id')::uuid end;
      select organization_id into org from venues where id=venue;
    end if;
    if org is null then
      venue := case when TG_OP <> 'DELETE' then (to_jsonb(NEW)->>'venue_id')::uuid end;
      select organization_id into org from venues where id=venue;
    end if;
    if org is not null then
      insert into reporting_event_revisions(event_id,revision,updated_at)
      select id,1,now() from events where organization_id=org and deleted_at is null
      on conflict(event_id) do update set revision=reporting_event_revisions.revision+1,updated_at=now();
    end if;
  elsif TG_TABLE_NAME in ('event_layout_sectors','event_layout_resources') then
    insert into reporting_event_revisions(event_id,revision,updated_at)
    select el.event_id,1,now() from event_layouts el where el.event_id in (select id from events) and el.id=coalesce((case when TG_OP <> 'DELETE' then to_jsonb(NEW)->>'event_layout_id' else null end),(case when TG_OP <> 'INSERT' then to_jsonb(OLD)->>'event_layout_id' else null end))::uuid
    on conflict(event_id) do update set revision=reporting_event_revisions.revision+1,updated_at=now();
  end if;
  return coalesce(NEW,OLD);
end; $function$

