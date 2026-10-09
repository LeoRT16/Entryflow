-- Durable final Event PDF workflow. Finalization creates one immutable snapshot
-- and one idempotent job; the Reporting worker completes the external upload.
create table if not exists public.reporting_final_snapshots (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  event_id uuid not null, version integer not null default 1,
  report jsonb not null, created_at timestamptz not null default now(),
  unique(event_id), foreign key (event_id,organization_id) references public.events(id,organization_id)
);
create table if not exists public.reporting_final_report_jobs (
  id uuid primary key default gen_random_uuid(), snapshot_id uuid not null unique references public.reporting_final_snapshots(id),
  organization_id uuid not null, event_id uuid not null, status text not null default 'pending'
    check(status in ('pending','processing','synced','retry','dead','needs_reauth','needs_action')),
  attempts integer not null default 0, available_at timestamptz not null default now(),
  lease_expires_at timestamptz, claim_token uuid, drive_file_id text, drive_file_url text,
  last_error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(event_id), foreign key (event_id,organization_id) references public.events(id,organization_id),
  check((status='processing') = (claim_token is not null and lease_expires_at is not null))
);
create index if not exists reporting_final_report_jobs_claim_idx on public.reporting_final_report_jobs(status,available_at);
alter table public.reporting_final_snapshots enable row level security;
alter table public.reporting_final_report_jobs enable row level security;
revoke all on public.reporting_final_snapshots,public.reporting_final_report_jobs from public,anon,authenticated;
grant select on public.reporting_final_snapshots,public.reporting_final_report_jobs to authenticated;

create or replace function public.transition_event_status(p_event_id uuid,p_next_status text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e events%rowtype; actor text; role_name text; timeline_kind text; timeline_title text; snap uuid; job uuid;
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
 if p_next_status='finished' then
   insert into reporting_final_snapshots(organization_id,event_id,report) values(e.organization_id,e.id,jsonb_build_object('version',1,'metadata',jsonb_build_object('organizationId',e.organization_id,'eventId',e.id,'eventName',e.name,'eventStatus','finished','finalizedAt',now()))) on conflict(event_id) do nothing returning id into snap;
   select id into snap from reporting_final_snapshots where event_id=e.id;
   insert into reporting_final_report_jobs(snapshot_id,organization_id,event_id) values(snap,e.organization_id,e.id) on conflict(event_id) do nothing returning id into job;
 end if;
 return jsonb_build_object('eventId',e.id,'previousStatus',e.status,'nextStatus',p_next_status,'finalSnapshotId',snap,'finalReportJobId',job);
end; $$;
revoke all on function public.transition_event_status(uuid,text) from public,anon;
grant execute on function public.transition_event_status(uuid,text) to authenticated;

create or replace function public.claim_reporting_final_report_jobs(p_worker_id text,p_limit integer default 1)
returns table(job_id uuid,snapshot_id uuid,event_id uuid,organization_id uuid,claim_token uuid)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 return query with picked as (select j.id from reporting_final_report_jobs j where j.status in ('pending','retry') and j.available_at<=now() order by j.created_at for update skip locked limit p_limit)
 update reporting_final_report_jobs j set status='processing',attempts=j.attempts+1,claim_token=gen_random_uuid(),lease_expires_at=now()+interval '5 minutes',updated_at=now() from picked where j.id=picked.id returning j.id,j.snapshot_id,j.event_id,j.organization_id,j.claim_token;
end; $$;
revoke all on function public.claim_reporting_final_report_jobs(text,integer) from public,anon,authenticated; grant execute on function public.claim_reporting_final_report_jobs(text,integer) to service_role;
create or replace function public.complete_reporting_final_report_job(p_job_id uuid,p_claim_token uuid,p_report jsonb,p_drive_file_id text,p_drive_file_url text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update reporting_final_snapshots s set report=p_report where s.id=(select snapshot_id from reporting_final_report_jobs where id=p_job_id and claim_token=p_claim_token);
 update reporting_final_report_jobs set status='synced',claim_token=null,lease_expires_at=null,drive_file_id=p_drive_file_id,drive_file_url=p_drive_file_url,last_error_code=null,updated_at=now() where id=p_job_id and claim_token=p_claim_token;
 return found;
end; $$;
revoke all on function public.complete_reporting_final_report_job(uuid,uuid,jsonb,text,text) from public,anon,authenticated; grant execute on function public.complete_reporting_final_report_job(uuid,uuid,jsonb,text,text) to service_role;
create or replace function public.fail_reporting_final_report_job(p_job_id uuid,p_claim_token uuid,p_error_code text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin update reporting_final_report_jobs set status=case when attempts>=5 then 'dead' else 'retry' end,available_at=now()+make_interval(mins=>least(60,greatest(1,attempts*5))),claim_token=null,lease_expires_at=null,last_error_code=left(p_error_code,128),updated_at=now() where id=p_job_id and claim_token=p_claim_token; return found; end; $$;
revoke all on function public.fail_reporting_final_report_job(uuid,uuid,text) from public,anon,authenticated; grant execute on function public.fail_reporting_final_report_job(uuid,uuid,text) to service_role;
