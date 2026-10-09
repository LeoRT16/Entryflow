-- R3/R4: optimistic reporting revisions and immutable canonical final snapshots.
create table if not exists public.reporting_event_revisions(
  event_id uuid primary key references public.events(id) on delete cascade,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.reporting_event_revisions(event_id)
select id from public.events where deleted_at is null
on conflict (event_id) do nothing;

create or replace function public.bump_reporting_event_revision()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare old_event uuid; new_event uuid; venue uuid; org uuid;
begin
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
    if old_event is not null then
      insert into reporting_event_revisions(event_id,revision,updated_at) values(old_event,1,now())
      on conflict(event_id) do update set revision=reporting_event_revisions.revision+1,updated_at=now();
    end if;
    if new_event is not null and new_event is distinct from old_event then
      insert into reporting_event_revisions(event_id,revision,updated_at) values(new_event,1,now())
      on conflict(event_id) do update set revision=reporting_event_revisions.revision+1,updated_at=now();
    elsif new_event is not null and old_event is null then
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
    select el.event_id,1,now() from event_layouts el where el.id=coalesce((case when TG_OP <> 'DELETE' then to_jsonb(NEW)->>'event_layout_id' else null end),(case when TG_OP <> 'INSERT' then to_jsonb(OLD)->>'event_layout_id' else null end))::uuid
    on conflict(event_id) do update set revision=reporting_event_revisions.revision+1,updated_at=now();
  end if;
  return coalesce(NEW,OLD);
end; $$;

do $$ declare t text; begin
  foreach t in array array['events','reservations','guests','checkins','tables','timeline_events','reservation_extra_wristband_sales','event_layouts','event_layout_sectors','event_layout_resources','venues','sectors','resources'] loop
    execute format('drop trigger if exists reporting_revision_%I on public.%I',t,t);
    execute format('create trigger reporting_revision_%I after insert or update or delete on public.%I for each row execute function public.bump_reporting_event_revision()',t,t);
  end loop;
end $$;

alter table public.reporting_final_snapshots add column if not exists event_revision bigint;
alter table public.reporting_final_snapshots add column if not exists snapshot_hash text;
revoke update,delete on public.reporting_final_snapshots from authenticated;

drop function if exists public.transition_event_status(uuid,text);

create or replace function public.transition_event_status(p_event_id uuid,p_next_status text,p_report jsonb default null,p_expected_revision bigint default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e events%rowtype; actor text; role_name text; timeline_kind text; timeline_title text; snap uuid; job uuid; current_revision bigint; hash text;
begin
 if auth.uid() is null then raise exception 'event_transition_unauthenticated' using errcode='28000'; end if;
 select * into e from events where id=p_event_id and deleted_at is null for update;
 if not found then raise exception 'event_not_found' using errcode='P0002'; end if;
 if not is_platform_root() and not exists (select 1 from profiles p join roles r on r.id=p.role_id and r.deleted_at is null where p.user_id=current_app_user_id() and p.organization_id=e.organization_id and p.deleted_at is null and 'event.edit'=any(r.permissions)) then raise exception 'event_transition_forbidden' using errcode='42501'; end if;
 if not ((e.status='draft' and p_next_status in ('published','cancelled')) or (e.status='published' and p_next_status in ('cancelled')) or (e.status='live' and p_next_status='finished')) then raise exception 'event_transition_invalid' using errcode='22023'; end if;
 select revision into current_revision from reporting_event_revisions where event_id=e.id for update;
 if p_next_status='finished' then
   if p_report is null or p_expected_revision is null then raise exception 'final_report_required' using errcode='22023'; end if;
   if current_revision is distinct from p_expected_revision then raise exception 'final_report_revision_conflict' using errcode='40001'; end if;
   hash := md5(p_report::text);
 end if;
 update events set status=p_next_status,updated_at=now() where id=e.id;
 timeline_kind:=case p_next_status when 'published' then 'event.published' when 'finished' then 'event.finished' else 'event.cancelled' end;
 timeline_title:=case p_next_status when 'published' then 'Evento publicado' when 'finished' then 'Evento finalizado' else 'Evento cancelado' end;
 select coalesce(nullif(trim(u.display_name),''),'Operación'),coalesce(nullif(trim(r.name),''),'Operación') into actor,role_name from users u left join profiles p on p.user_id=u.id and p.organization_id=e.organization_id and p.deleted_at is null left join roles r on r.id=p.role_id and r.deleted_at is null where u.id=current_app_user_id() limit 1;
 insert into timeline_events(event_id,timestamp,kind,icon,tone,title,description,metadata,created_at,updated_at) values(e.id,to_char(now(),'HH24:MI'),timeline_kind,'calendar',case when p_next_status='cancelled' then 'danger' else 'warning' end,timeline_title,format('%s cambió de %s a %s.',e.name,e.status,p_next_status),jsonb_build_object('actor',actor,'actorRole',role_name,'organizationId',e.organization_id,'eventId',e.id,'previousStatus',e.status,'nextStatus',p_next_status),now(),now());
 if p_next_status='finished' then
   insert into reporting_final_snapshots(organization_id,event_id,event_revision,report,snapshot_hash) values(e.organization_id,e.id,current_revision,p_report,hash) on conflict(event_id) do nothing returning id into snap;
   if snap is null then select id into snap from reporting_final_snapshots where event_id=e.id; end if;
   insert into reporting_final_report_jobs(snapshot_id,organization_id,event_id) values(snap,e.organization_id,e.id) on conflict(event_id) do nothing returning id into job;
 end if;
 return jsonb_build_object('eventId',e.id,'previousStatus',e.status,'nextStatus',p_next_status,'finalSnapshotId',snap,'finalReportJobId',job,'reportingRevision',current_revision);
end; $$;
revoke all on function public.transition_event_status(uuid,text,jsonb,bigint) from public,anon;
grant execute on function public.transition_event_status(uuid,text,jsonb,bigint) to authenticated;

create or replace function public.complete_reporting_final_report_job(p_job_id uuid,p_claim_token uuid,p_drive_file_id text,p_drive_file_url text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin update reporting_final_report_jobs set status='synced',claim_token=null,lease_expires_at=null,drive_file_id=p_drive_file_id,drive_file_url=p_drive_file_url,last_error_code=null,updated_at=now() where id=p_job_id and claim_token=p_claim_token; return found; end; $$;
revoke all on function public.complete_reporting_final_report_job(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.complete_reporting_final_report_job(uuid,uuid,text,text) to service_role;
-- Retire the legacy completion signature: snapshots are immutable after finalization.
create or replace function public.complete_reporting_final_report_job(p_job_id uuid,p_claim_token uuid,p_report jsonb,p_drive_file_id text,p_drive_file_url text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 return public.complete_reporting_final_report_job(p_job_id,p_claim_token,p_drive_file_id,p_drive_file_url);
end; $$;
revoke all on function public.complete_reporting_final_report_job(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.complete_reporting_final_report_job(uuid,uuid,jsonb,text,text) to service_role;

create policy "Final report job tenant status read" on public.reporting_final_report_jobs
for select to authenticated using (public.is_platform_root() or organization_id = any(public.current_organization_ids()));
-- Snapshot JSON is server/worker-only; no client SELECT policy is intentional.
create or replace function public.retry_reporting_final_report_job(p_event_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare j reporting_final_report_jobs%rowtype; begin
 if auth.uid() is null then raise exception 'final_report_retry_unauthenticated' using errcode='28000'; end if;
 select j.* into j from reporting_final_report_jobs j join events e on e.id=j.event_id where j.event_id=p_event_id and (public.is_platform_root() or j.organization_id=any(public.current_organization_ids())) for update;
 if not found then raise exception 'final_report_job_not_found' using errcode='P0002'; end if;
 if not public.is_platform_root() and not exists(select 1 from profiles p join roles r on r.id=p.role_id where p.user_id=current_app_user_id() and p.organization_id=j.organization_id and p.deleted_at is null and r.deleted_at is null and ('event.edit'=any(r.permissions) or r.slug in ('reception','administrator','owner'))) then raise exception 'final_report_retry_forbidden' using errcode='42501'; end if;
 if j.status not in ('retry','dead','needs_action') then raise exception 'final_report_retry_not_eligible' using errcode='55000'; end if;
 update reporting_final_report_jobs set status='pending',available_at=now(),claim_token=null,lease_expires_at=null,last_error_code=null,updated_at=now() where id=j.id;
 return true;
end; $$;
revoke all on function public.retry_reporting_final_report_job(uuid) from public,anon;
grant execute on function public.retry_reporting_final_report_job(uuid) to authenticated;
