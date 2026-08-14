alter table public.users
  add column if not exists must_change_password boolean not null default false;

update public.users
set must_change_password = coalesce(must_change_password, false)
where must_change_password is distinct from true;
