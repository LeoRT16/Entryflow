-- Platform authority is intentionally separate from organization memberships.
create table if not exists public.platform_principals (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null default 'root' check (role = 'root'),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists platform_principals_active_user_idx
  on public.platform_principals (auth_user_id)
  where status = 'active' and deleted_at is null;

alter table public.platform_principals enable row level security;

drop policy if exists "Platform principals are private" on public.platform_principals;
create policy "Platform principals are private"
  on public.platform_principals
  for select to authenticated
  using (auth_user_id = auth.uid() and status = 'active' and deleted_at is null);

revoke all on public.platform_principals from anon, authenticated;
grant select on public.platform_principals to authenticated;

create or replace function public.is_platform_root()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.platform_principals
    where auth_user_id = auth.uid() and role = 'root' and status = 'active' and deleted_at is null
  );
$$;

revoke all on function public.is_platform_root() from public, anon;
grant execute on function public.is_platform_root() to authenticated, service_role;

drop policy if exists "Tenant-scoped organization read" on public.organizations;
create policy "Tenant-scoped organization read"
  on public.organizations for select to authenticated
  using (
    organizations.deleted_at is null
    and organizations.status = 'active'
    and (public.is_platform_root() or organizations.id = any(public.current_organization_ids()))
  );

comment on table public.platform_principals is 'Authoritative platform-level principals. Root assignment is an explicit server-side/bootstrap operation and never an organization membership.';
