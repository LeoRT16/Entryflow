alter table public.reservations
  add column if not exists reference text;
