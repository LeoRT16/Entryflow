create table if not exists public.reporting_retry_audit (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.reporting_outbox(id),
  organization_id uuid not null references public.organizations(id),
  destination_id uuid not null references public.reporting_destinations(id),
  event_id uuid not null references public.events(id),
  actor_user_id uuid not null,
  previous_status text not null,
  previous_error text,
  requested_sequence bigint not null,
  created_at timestamptz not null default now()
);
alter table public.reporting_retry_audit enable row level security;
revoke all on public.reporting_retry_audit from public, anon, authenticated;

create or replace function public.retry_reporting_terminal_work(p_outbox_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.reporting_outbox%rowtype; d public.reporting_destinations%rowtype; actor uuid:=public.current_app_user_id();
begin
  if actor is null then raise exception 'reporting_unauthenticated' using errcode='28000'; end if;
  select * into o from public.reporting_outbox where id=p_outbox_id for update;
  if not found then raise exception 'reporting_outbox_not_found' using errcode='P0002'; end if;
  select * into d from public.reporting_destinations where id=o.destination_id and deleted_at is null for update;
  if not found or not exists (select 1 from public.profiles p join public.roles r on r.id=p.role_id and r.deleted_at is null where p.user_id=actor and p.organization_id=o.organization_id and p.deleted_at is null and ('event.edit'=any(r.permissions) or 'organization.manage'=any(r.permissions))) then raise exception 'reporting_forbidden' using errcode='42501'; end if;
  if o.status<>'dead' or lower(split_part(coalesce(o.last_error,''),':',1)) not in ('google_rate_limited','google_temporarily_unavailable','google_network_unavailable','reporting_sync_failed','worker_failed','worker_lease_expired') then raise exception 'reporting_retry_not_allowed' using errcode='55000'; end if;
  insert into public.reporting_retry_audit(outbox_id,organization_id,destination_id,event_id,actor_user_id,previous_status,previous_error,requested_sequence) values(o.id,o.organization_id,o.destination_id,o.event_id,actor,o.status,o.last_error,o.requested_sequence);
  update public.reporting_outbox set status='pending',available_at=now(),locked_at=null,locked_by=null,active_sync_run_id=null,last_error=null where id=o.id and status='dead';
  return found;
end; $$;
revoke all on function public.retry_reporting_terminal_work(uuid) from public,anon;
grant execute on function public.retry_reporting_terminal_work(uuid) to authenticated;
