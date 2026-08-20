create table if not exists public.whatsapp_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  message_id text not null unique,
  attempt_number integer not null default 1,
  delivery_status text not null,
  status_history jsonb not null default '[]'::jsonb,
  accepted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  failure_message text,
  failure_details jsonb,
  template_name text not null,
  template_language text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists whatsapp_delivery_attempts_organization_id_idx on public.whatsapp_delivery_attempts (organization_id);
create index if not exists whatsapp_delivery_attempts_event_id_idx on public.whatsapp_delivery_attempts (event_id);
create index if not exists whatsapp_delivery_attempts_guest_id_idx on public.whatsapp_delivery_attempts (guest_id);
create index if not exists whatsapp_delivery_attempts_reservation_id_idx on public.whatsapp_delivery_attempts (reservation_id);
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_delivery_attempts'
  ) then
    alter publication supabase_realtime add table public.whatsapp_delivery_attempts;
  end if;
end;
$$;

drop trigger if exists set_updated_at_whatsapp_delivery_attempts on public.whatsapp_delivery_attempts;
create trigger set_updated_at_whatsapp_delivery_attempts before update on public.whatsapp_delivery_attempts for each row execute function public.set_updated_at();

alter table public.whatsapp_delivery_attempts enable row level security;

drop policy if exists "Allow all access" on public.whatsapp_delivery_attempts;
create policy "Authenticated can read whatsapp delivery attempts for accessible organizations"
  on public.whatsapp_delivery_attempts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users as u
      join public.profiles as p
        on p.user_id = u.id
      join public.organizations as o
        on o.id = p.organization_id
      join public.events as e
        on e.id = whatsapp_delivery_attempts.event_id
       and e.organization_id = o.id
       and e.deleted_at is null
      where u.auth_user_id = auth.uid()
        and u.deleted_at is null
        and p.deleted_at is null
        and o.deleted_at is null
        and o.status = 'active'
        and p.organization_id = whatsapp_delivery_attempts.organization_id
    )
  );
