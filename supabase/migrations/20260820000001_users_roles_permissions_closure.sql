create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id
  from public.users as u
  where u.auth_user_id = auth.uid()
    and u.deleted_at is null
  limit 1;
$$;

create or replace function public.current_organization_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    array_agg(distinct p.organization_id order by p.organization_id),
    '{}'::uuid[]
  )
  from public.profiles as p
  join public.organizations as o
    on o.id = p.organization_id
  where p.user_id = public.current_app_user_id()
    and p.deleted_at is null
    and o.deleted_at is null
    and o.status = 'active';
$$;

alter table public.organizations enable row level security;
alter table public.roles enable row level security;
alter table public.users enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "Allow all access" on public.organizations;
drop policy if exists "Allow all access" on public.roles;
drop policy if exists "Allow all access" on public.users;
drop policy if exists "Allow all access" on public.profiles;

drop policy if exists "Tenant-scoped organization read" on public.organizations;
drop policy if exists "Tenant-scoped role read" on public.roles;
drop policy if exists "Tenant-scoped user read" on public.users;
drop policy if exists "Tenant-scoped profile read" on public.profiles;

create policy "Tenant-scoped organization read"
  on public.organizations
  for select
  to authenticated
  using (
    organizations.deleted_at is null
    and organizations.status = 'active'
    and organizations.id = any(public.current_organization_ids())
  );

create policy "Tenant-scoped role read"
  on public.roles
  for select
  to authenticated
  using (
    roles.deleted_at is null
    and coalesce(array_length(public.current_organization_ids(), 1), 0) > 0
  );

create policy "Tenant-scoped user read"
  on public.users
  for select
  to authenticated
  using (
    users.deleted_at is null
    and exists (
      select 1
      from public.profiles as p
      where p.user_id = users.id
        and p.deleted_at is null
        and p.organization_id = any(public.current_organization_ids())
    )
  );

create policy "Tenant-scoped profile read"
  on public.profiles
  for select
  to authenticated
  using (
    profiles.deleted_at is null
    and profiles.organization_id = any(public.current_organization_ids())
  );

comment on function public.current_app_user_id() is 'Resolves the current public user id from auth.uid() without relying on browser RLS-visible membership joins.';
comment on function public.current_organization_ids() is 'Resolves active organization ids for the current public user via SECURITY DEFINER access.';
comment on policy "Tenant-scoped organization read" on public.organizations is 'Browser clients can read active organizations they already belong to through the security-definer membership helper.';
comment on policy "Tenant-scoped role read" on public.roles is 'Browser clients can read active role presets when they already have at least one active organization membership.';
comment on policy "Tenant-scoped user read" on public.users is 'Browser clients can read active user rows that belong to their accessible organizations, including pending invited users with null auth_user_id.';
comment on policy "Tenant-scoped profile read" on public.profiles is 'Browser clients can read active profiles that belong to their accessible organizations.';
