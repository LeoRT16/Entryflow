-- Personal Google Drive OAuth persistence (2.4B). No provider calls are made here.
create table if not exists public.reporting_drive_integrations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  provider text not null default 'google_drive' check (provider='google_drive'),
  auth_mode text not null default 'oauth_user' check (auth_mode='oauth_user'),
  provider_account_id text, google_account_email text, oauth_secret_id uuid,
  organization_drive_folder_id text, enabled boolean not null default false,
  status text not null default 'disabled' check (status in ('connected','needs_reauth','error','disabled')),
  manage_root_name boolean not null default true, last_applied_root_name text,
  last_verified_at timestamptz, last_error_code text, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  check (provider_account_id is null or length(trim(provider_account_id))>0),
  check (google_account_email is null or length(trim(google_account_email))>0),
  check (organization_drive_folder_id is null or length(trim(organization_drive_folder_id))>0),
  check (last_error_code is null or length(trim(last_error_code))>0)
);
create unique index if not exists events_id_organization_unique_idx on public.events(id,organization_id);
create unique index if not exists reporting_drive_integrations_org_active_idx on public.reporting_drive_integrations(organization_id) where deleted_at is null;
create unique index if not exists reporting_drive_integrations_root_active_idx on public.reporting_drive_integrations(organization_drive_folder_id) where deleted_at is null and organization_drive_folder_id is not null;
create unique index if not exists reporting_drive_integrations_id_org_idx on public.reporting_drive_integrations(id,organization_id);

create table if not exists public.event_drive_locations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, event_id uuid not null,
  drive_integration_id uuid not null, event_drive_folder_id text, final_reports_folder_id text,
  status text not null default 'pending' check (status in ('pending','provisioning','ready','drifted','needs_action','disabled')),
  revision bigint not null default 1 check (revision>=1), last_applied_event_name text, last_applied_event_date text,
  last_verified_at timestamptz, last_error_code text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz,
  foreign key (event_id,organization_id) references public.events(id,organization_id),
  foreign key (drive_integration_id,organization_id) references public.reporting_drive_integrations(id,organization_id),
  check (event_drive_folder_id is null or length(trim(event_drive_folder_id))>0),
  check (final_reports_folder_id is null or length(trim(final_reports_folder_id))>0),
  check (event_drive_folder_id is null or final_reports_folder_id is null or event_drive_folder_id<>final_reports_folder_id),
  check (last_error_code is null or length(trim(last_error_code))>0)
);
create unique index if not exists event_drive_locations_event_active_idx on public.event_drive_locations(event_id) where deleted_at is null;
create unique index if not exists event_drive_locations_event_folder_idx on public.event_drive_locations(event_drive_folder_id) where deleted_at is null and event_drive_folder_id is not null;
create unique index if not exists event_drive_locations_reports_folder_idx on public.event_drive_locations(final_reports_folder_id) where deleted_at is null and final_reports_folder_id is not null;
create unique index if not exists event_drive_locations_id_org_idx on public.event_drive_locations(id,organization_id);

create table if not exists public.drive_provisioning_outbox (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  integration_id uuid not null, event_location_id uuid, operation_key text not null unique,
  kind text not null check (kind in ('provision_event','reconcile_event','rename_event','verify_event')),
  target_revision bigint not null check (target_revision>=1), status text not null default 'pending'
    check (status in ('pending','processing','retry','uncertain','succeeded','needs_action','dead','cancelled')),
  attempts integer not null default 0 check (attempts>=0), available_at timestamptz not null default now(),
  lease_expires_at timestamptz, claim_token uuid, reserved_file_id text, result_file_id text,
  last_error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), processed_at timestamptz,
  foreign key (integration_id,organization_id) references public.reporting_drive_integrations(id,organization_id),
  foreign key (event_location_id,organization_id) references public.event_drive_locations(id,organization_id),
  check (length(trim(operation_key))>0), check (last_error_code is null or length(trim(last_error_code))>0)
);
create index if not exists drive_provisioning_outbox_claim_idx on public.drive_provisioning_outbox(status,available_at);
create index if not exists drive_provisioning_outbox_location_idx on public.drive_provisioning_outbox(event_location_id,target_revision);

drop trigger if exists reporting_drive_integrations_touch on public.reporting_drive_integrations;
create trigger reporting_drive_integrations_touch before update on public.reporting_drive_integrations for each row execute function public.set_updated_at();
drop trigger if exists event_drive_locations_touch on public.event_drive_locations;
create trigger event_drive_locations_touch before update on public.event_drive_locations for each row execute function public.set_updated_at();
drop trigger if exists drive_provisioning_outbox_touch on public.drive_provisioning_outbox;
create trigger drive_provisioning_outbox_touch before update on public.drive_provisioning_outbox for each row execute function public.set_updated_at();

alter table public.reporting_drive_integrations enable row level security;
alter table public.event_drive_locations enable row level security;
alter table public.drive_provisioning_outbox enable row level security;
revoke all on public.reporting_drive_integrations, public.event_drive_locations, public.drive_provisioning_outbox from anon, authenticated;
grant select (id,organization_id,provider,auth_mode,provider_account_id,google_account_email,organization_drive_folder_id,enabled,status,manage_root_name,last_applied_root_name,last_verified_at,last_error_code,created_at,updated_at,deleted_at) on public.reporting_drive_integrations to authenticated;
grant select on public.event_drive_locations, public.drive_provisioning_outbox to authenticated;
drop policy if exists "Drive integration tenant read" on public.reporting_drive_integrations;
create policy "Drive integration tenant read" on public.reporting_drive_integrations for select to authenticated using (organization_id=any(public.current_organization_ids()) and deleted_at is null);
drop policy if exists "Drive location tenant read" on public.event_drive_locations;
create policy "Drive location tenant read" on public.event_drive_locations for select to authenticated using (event_id=any(public.current_event_ids()) and deleted_at is null);
drop policy if exists "Drive outbox tenant read" on public.drive_provisioning_outbox;
create policy "Drive outbox tenant read" on public.drive_provisioning_outbox for select to authenticated using (event_location_id is not null and event_location_id in (select id from public.event_drive_locations where event_id=any(public.current_event_ids()) and deleted_at is null));

create or replace function public.request_drive_event_provisioning_internal(p_event_id uuid,p_kind text default 'provision_event') returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.events%rowtype; i public.reporting_drive_integrations%rowtype; l public.event_drive_locations%rowtype; k text; key text; o uuid;
begin
  if p_kind not in ('provision_event','reconcile_event','rename_event','verify_event') then raise exception 'drive_invalid_kind' using errcode='22023'; end if;
  select * into e from public.events where id=p_event_id and deleted_at is null;
  if not found then return null; end if;
  select * into i from public.reporting_drive_integrations where organization_id=e.organization_id and enabled and status='connected' and deleted_at is null;
  if not found then return null; end if;
  insert into public.event_drive_locations(organization_id,event_id,drive_integration_id) values(e.organization_id,e.id,i.id)
    on conflict (event_id) where deleted_at is null do update set drive_integration_id=excluded.drive_integration_id;
  select * into l from public.event_drive_locations where event_id=e.id and deleted_at is null;
  key := 'drive:event:'||e.id::text||':revision:'||l.revision::text||':'||p_kind;
  insert into public.drive_provisioning_outbox(organization_id,integration_id,event_location_id,operation_key,kind,target_revision)
    values(e.organization_id,i.id,l.id,key,p_kind,l.revision)
    on conflict (operation_key) do update set available_at=now(), status=case when drive_provisioning_outbox.status in ('processing','succeeded') then drive_provisioning_outbox.status else 'pending' end
    returning id into o;
  return o;
end; $$;
revoke all on function public.request_drive_event_provisioning_internal(uuid,text) from public,anon,authenticated;
grant execute on function public.request_drive_event_provisioning_internal(uuid,text) to service_role;

create or replace function public.claim_drive_provisioning_jobs(p_worker_id text,p_limit integer default 1)
returns table(outbox_id uuid,event_location_id uuid,organization_id uuid,integration_id uuid,operation_key text,kind text,target_revision bigint,attempts integer,claim_token uuid)
language plpgsql security definer set search_path=public,pg_temp as $$ declare r record; t uuid; begin
 if nullif(trim(p_worker_id),'') is null or p_limit<1 or p_limit>50 then raise exception 'drive_invalid_claim' using errcode='22023'; end if;
 for r in select o.* from public.drive_provisioning_outbox o join public.reporting_drive_integrations i on i.id=o.integration_id and i.organization_id=o.organization_id where i.enabled and i.status='connected' and i.deleted_at is null and ((o.status in ('pending','retry') and o.available_at<=now()) or (o.status='processing' and o.lease_expires_at<now())) order by o.available_at,o.created_at for update of o skip locked limit p_limit loop
   t:=gen_random_uuid(); update public.drive_provisioning_outbox set status='processing',attempts=r.attempts+1,claim_token=t,lease_expires_at=now()+interval '5 minutes' where id=r.id;
   return query select r.id,r.event_location_id,r.organization_id,r.integration_id,r.operation_key,r.kind,r.target_revision,r.attempts+1,t;
 end loop; end; $$;
revoke all on function public.claim_drive_provisioning_jobs(text,integer) from public,anon,authenticated; grant execute on function public.claim_drive_provisioning_jobs(text,integer) to service_role;

create or replace function public.complete_drive_provisioning_job(p_outbox_id uuid,p_claim_token uuid,p_target_revision bigint,p_event_drive_folder_id text default null,p_final_reports_folder_id text default null,p_result_file_id text default null) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$ declare o public.drive_provisioning_outbox%rowtype; l public.event_drive_locations%rowtype; i public.reporting_drive_integrations%rowtype; begin
 select * into o from public.drive_provisioning_outbox where id=p_outbox_id for update; if not found or o.status<>'processing' or o.claim_token<>p_claim_token or o.target_revision<>p_target_revision then return false; end if;
 select * into l from public.event_drive_locations where id=o.event_location_id and deleted_at is null for update; if not found or l.revision<>p_target_revision then return false; end if;
 select * into i from public.reporting_drive_integrations where id=o.integration_id and organization_id=o.organization_id and deleted_at is null; if not found or not i.enabled or i.status='disabled' or l.status='disabled' then return false; end if;
 update public.event_drive_locations set event_drive_folder_id=coalesce(p_event_drive_folder_id,event_drive_folder_id),final_reports_folder_id=coalesce(p_final_reports_folder_id,final_reports_folder_id),status='ready' where id=l.id;
 update public.drive_provisioning_outbox set status='succeeded',processed_at=now(),claim_token=null,lease_expires_at=null,result_file_id=p_result_file_id where id=o.id; return true; end; $$;
revoke all on function public.complete_drive_provisioning_job(uuid,uuid,bigint,text,text,text) from public,anon,authenticated; grant execute on function public.complete_drive_provisioning_job(uuid,uuid,bigint,text,text,text) to service_role;

create or replace function public.request_drive_event_revision(p_event_id uuid,p_kind text default 'rename_event') returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$ declare l public.event_drive_locations%rowtype; begin
 if p_kind not in ('provision_event','reconcile_event','rename_event','verify_event') then raise exception 'drive_invalid_kind' using errcode='22023'; end if;
 select * into l from public.event_drive_locations where event_id=p_event_id and deleted_at is null for update;
 if not found then return public.request_drive_event_provisioning_internal(p_event_id,p_kind); end if;
 update public.event_drive_locations set revision=revision+1,status=case when status='disabled' then status else 'pending' end where id=l.id;
 return public.request_drive_event_provisioning_internal(p_event_id,p_kind);
end; $$;
revoke all on function public.request_drive_event_revision(uuid,text) from public,anon,authenticated; grant execute on function public.request_drive_event_revision(uuid,text) to service_role;

create or replace function public.fail_drive_provisioning_job(p_outbox_id uuid,p_claim_token uuid,p_status text,p_error_code text,p_next_available_at timestamptz default null) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$ begin if p_status not in ('retry','uncertain','needs_action','dead','cancelled') then raise exception 'drive_invalid_failure_status' using errcode='22023'; end if; update public.drive_provisioning_outbox set status=p_status,last_error_code=nullif(trim(p_error_code),''),available_at=coalesce(p_next_available_at,available_at),claim_token=null,lease_expires_at=null where id=p_outbox_id and status='processing' and claim_token=p_claim_token; return found; end; $$;
revoke all on function public.fail_drive_provisioning_job(uuid,uuid,text,text,timestamptz) from public,anon,authenticated; grant execute on function public.fail_drive_provisioning_job(uuid,uuid,text,text,timestamptz) to service_role;
