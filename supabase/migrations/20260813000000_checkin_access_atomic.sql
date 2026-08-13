create unique index if not exists checkins_access_grant_id_active_unique
  on public.checkins (access_grant_id)
  where deleted_at is null and access_grant_id is not null;
