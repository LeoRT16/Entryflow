alter table public.users
  add column if not exists auth_user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conname = 'users_auth_user_id_fkey'
      and c.conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_auth_user_id_fkey
      foreign key (auth_user_id)
      references auth.users(id)
      on delete set null;
  end if;
end $$;

create unique index if not exists users_auth_user_id_unique
  on public.users (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists profiles_user_id_organization_id_active_unique
  on public.profiles (user_id, organization_id)
  where deleted_at is null;
