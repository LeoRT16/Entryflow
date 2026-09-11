create table if not exists public.reporting_destinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  event_id uuid not null references public.events(id),
  provider text not null default 'google_sheets' check (provider = 'google_sheets'),
  enabled boolean not null default true,
  spreadsheet_id text,
  drive_folder_id text,
  sheet_schema_version integer not null default 1 check (sheet_schema_version > 0),
  config jsonb not null default '{}'::jsonb,
  last_requested_sequence bigint not null default 0 check (last_requested_sequence >= 0),
  last_processed_sequence bigint not null default 0 check (last_processed_sequence >= 0),
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists reporting_destinations_active_event_provider_idx
  on public.reporting_destinations(event_id, provider) where deleted_at is null;
create index if not exists reporting_destinations_enabled_idx
  on public.reporting_destinations(enabled, deleted_at);

create table if not exists public.reporting_outbox (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.reporting_destinations(id),
  organization_id uuid not null references public.organizations(id),
  event_id uuid not null references public.events(id),
  requested_sequence bigint not null check (requested_sequence > 0),
  status text not null default 'pending' check (status in ('pending','processing','retry','synced','failed','dead')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  active_sync_run_id uuid,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(destination_id)
);
create index if not exists reporting_outbox_claim_idx on public.reporting_outbox(status, available_at);
create index if not exists reporting_outbox_event_idx on public.reporting_outbox(event_id);
alter table public.reporting_outbox add column if not exists active_sync_run_id uuid;

create table if not exists public.reporting_sync_runs (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.reporting_destinations(id),
  organization_id uuid not null references public.organizations(id),
  event_id uuid not null references public.events(id),
  requested_sequence bigint not null check (requested_sequence > 0),
  processed_sequence bigint,
  dataset_hash text,
  sheet_schema_version integer not null check (sheet_schema_version > 0),
  status text not null check (status in ('processing','synced','retry','failed','dead')),
  attempt integer not null check (attempt > 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists reporting_sync_runs_destination_idx on public.reporting_sync_runs(destination_id, started_at desc);
create index if not exists reporting_sync_runs_event_idx on public.reporting_sync_runs(event_id, started_at desc);

create or replace function public.reporting_touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists reporting_destinations_touch_updated_at on public.reporting_destinations;
create trigger reporting_destinations_touch_updated_at before update on public.reporting_destinations for each row execute function public.reporting_touch_updated_at();
drop trigger if exists reporting_outbox_touch_updated_at on public.reporting_outbox;
create trigger reporting_outbox_touch_updated_at before update on public.reporting_outbox for each row execute function public.reporting_touch_updated_at();

alter table public.reporting_destinations enable row level security;
alter table public.reporting_outbox enable row level security;
alter table public.reporting_sync_runs enable row level security;

drop policy if exists "Reporting destination tenant select" on public.reporting_destinations;
create policy "Reporting destination tenant select" on public.reporting_destinations for select to authenticated using (event_id = any(public.current_event_ids()) and deleted_at is null);
drop policy if exists "Reporting destination tenant write" on public.reporting_destinations;
create policy "Reporting destination tenant write" on public.reporting_destinations for all to authenticated
  using (event_id = any(public.current_event_ids()) and exists (select 1 from public.events e join public.profiles p on p.organization_id=e.organization_id and p.user_id=public.current_app_user_id() and p.deleted_at is null join public.roles r on r.id=p.role_id and r.deleted_at is null where e.id=reporting_destinations.event_id and ('event.edit'=any(r.permissions) or 'organization.manage'=any(r.permissions))))
  with check (event_id = any(public.current_event_ids()) and exists (select 1 from public.events e join public.profiles p on p.organization_id=e.organization_id and p.user_id=public.current_app_user_id() and p.deleted_at is null join public.roles r on r.id=p.role_id and r.deleted_at is null where e.id=reporting_destinations.event_id and ('event.edit'=any(r.permissions) or 'organization.manage'=any(r.permissions))));
drop policy if exists "Reporting outbox tenant select" on public.reporting_outbox;
create policy "Reporting outbox tenant select" on public.reporting_outbox for select to authenticated using (event_id = any(public.current_event_ids()));
drop policy if exists "Reporting runs tenant select" on public.reporting_sync_runs;
create policy "Reporting runs tenant select" on public.reporting_sync_runs for select to authenticated using (event_id = any(public.current_event_ids()));

create or replace function public.request_reporting_sync(p_event_id uuid)
returns table(outbox_id uuid, destination_id uuid, requested_sequence bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.reporting_destinations%rowtype; o public.reporting_outbox%rowtype; next_sequence bigint;
begin
  if auth.uid() is null then raise exception 'reporting_unauthenticated' using errcode='28000'; end if;
  select rd.* into d from public.reporting_destinations rd where rd.event_id=p_event_id and rd.provider='google_sheets' and rd.enabled and rd.deleted_at is null for update;
  if not found then raise exception 'reporting_destination_not_found' using errcode='P0002'; end if;
  if not (p_event_id = any(public.current_event_ids())) then raise exception 'reporting_forbidden' using errcode='42501'; end if;
  if not exists (select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.user_id=public.current_app_user_id() and p.organization_id=d.organization_id and p.deleted_at is null and r.deleted_at is null and ('event.edit'=any(r.permissions) or 'organization.manage'=any(r.permissions))) then
    raise exception 'reporting_forbidden' using errcode='42501';
  end if;
  next_sequence := d.last_requested_sequence + 1;
  update public.reporting_destinations set last_requested_sequence=next_sequence, last_error=null where id=d.id;
  insert into public.reporting_outbox(destination_id,organization_id,event_id,requested_sequence,status,available_at,attempts,last_error,locked_at,locked_by,processed_at)
    values(d.id,d.organization_id,d.event_id,next_sequence,'pending',now(),0,null,null,null,null)
  on conflict on constraint reporting_outbox_destination_id_key do update set requested_sequence=excluded.requested_sequence,status='pending',available_at=now(),last_error=null,locked_at=null,locked_by=null;
  select ob.* into o from public.reporting_outbox ob where ob.destination_id=d.id;
  return query select o.id,d.id,o.requested_sequence;
end; $$;

create or replace function public.claim_reporting_sync_work(p_worker_id text, p_limit integer default 1)
returns table(outbox_id uuid, sync_run_id uuid, destination_id uuid, event_id uuid, requested_sequence bigint, attempts integer, provider text, spreadsheet_id text, sheet_schema_version integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare o record; run_id uuid;
begin
  if nullif(trim(p_worker_id),'') is null or p_limit < 1 or p_limit > 50 then raise exception 'reporting_invalid_claim' using errcode='22023'; end if;
  for o in select ob.*, d.provider, d.spreadsheet_id, d.sheet_schema_version from public.reporting_outbox ob join public.reporting_destinations d on d.id=ob.destination_id where d.enabled and d.deleted_at is null and ((ob.status in ('pending','retry') and ob.available_at <= now()) or (ob.status='processing' and ob.locked_at < now()-interval '5 minutes')) order by ob.available_at,ob.created_at for update of ob skip locked limit p_limit loop
    update public.reporting_outbox set status='processing',locked_at=now(),locked_by=p_worker_id,attempts=ob.attempts+1 where id=o.id;
    run_id:=gen_random_uuid();
    insert into public.reporting_sync_runs(id,destination_id,organization_id,event_id,requested_sequence,sheet_schema_version,status,attempt) values(run_id,o.destination_id,o.organization_id,o.event_id,o.requested_sequence,o.sheet_schema_version,'processing',o.attempts+1);
    update public.reporting_outbox set active_sync_run_id=run_id where id=o.id;
    return query select o.id,run_id,o.destination_id,o.event_id,o.requested_sequence,o.attempts+1,o.provider,o.spreadsheet_id,o.sheet_schema_version;
  end loop;
end; $$;

create or replace function public.complete_reporting_sync_success(p_outbox_id uuid,p_sync_run_id uuid,p_processed_sequence bigint,p_dataset_hash text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.reporting_outbox%rowtype; d public.reporting_destinations%rowtype; next_status text;
begin
  select * into o from public.reporting_outbox where id=p_outbox_id for update;
  if not found or o.status <> 'processing' or o.active_sync_run_id <> p_sync_run_id then raise exception 'reporting_outbox_not_processing' using errcode='P0001'; end if;
  select * into d from public.reporting_destinations where id=o.destination_id for update;
  next_status := case when d.last_requested_sequence > p_processed_sequence then 'pending' else 'synced' end;
  update public.reporting_destinations set last_processed_sequence=greatest(last_processed_sequence,p_processed_sequence),last_sync_at=now(),last_success_at=now(),last_error=null where id=d.id;
  update public.reporting_outbox set status=next_status,processed_at=case when next_status='synced' then now() else processed_at end,locked_at=null,locked_by=null,active_sync_run_id=null,last_error=null where id=o.id;
  update public.reporting_sync_runs set status='synced',processed_sequence=p_processed_sequence,dataset_hash=left(p_dataset_hash,256),finished_at=now() where id=p_sync_run_id;
  return true;
end; $$;

create or replace function public.complete_reporting_sync_failure(p_outbox_id uuid,p_sync_run_id uuid,p_error_code text,p_error_message text,p_recoverable boolean,p_next_available_at timestamptz default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.reporting_outbox%rowtype; next_status text;
begin
  select * into o from public.reporting_outbox where id=p_outbox_id for update;
  if not found or o.status <> 'processing' or o.active_sync_run_id <> p_sync_run_id then raise exception 'reporting_outbox_not_processing' using errcode='P0001'; end if;
  next_status := case when p_recoverable and o.attempts < 8 then 'retry' when p_recoverable then 'dead' else 'failed' end;
  update public.reporting_outbox set status=next_status,available_at=coalesce(p_next_available_at,now()),locked_at=null,locked_by=null,active_sync_run_id=null,last_error=left(coalesce(p_error_code,'error')||': '||coalesce(p_error_message,'sync failed'),1024) where id=o.id;
  update public.reporting_destinations set last_error=left(coalesce(p_error_code,'error')||': '||coalesce(p_error_message,'sync failed'),1024) where id=o.destination_id;
  update public.reporting_sync_runs set status=next_status,error_code=left(p_error_code,128),error_message=left(p_error_message,1024),finished_at=now() where id=p_sync_run_id;
  return true;
end; $$;

revoke all on function public.request_reporting_sync(uuid) from public;
grant execute on function public.request_reporting_sync(uuid) to authenticated;
revoke all on function public.claim_reporting_sync_work(text,integer) from public,authenticated,anon;
grant execute on function public.claim_reporting_sync_work(text,integer) to service_role;
revoke all on function public.complete_reporting_sync_success(uuid,uuid,bigint,text) from public,authenticated,anon;
grant execute on function public.complete_reporting_sync_success(uuid,uuid,bigint,text) to service_role;
revoke all on function public.complete_reporting_sync_failure(uuid,uuid,text,text,boolean,timestamptz) from public,authenticated,anon;
grant execute on function public.complete_reporting_sync_failure(uuid,uuid,text,text,boolean,timestamptz) to service_role;
