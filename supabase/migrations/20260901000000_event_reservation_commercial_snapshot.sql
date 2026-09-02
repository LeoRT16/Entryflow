alter table public.reservations
  add column if not exists commercial_snapshot jsonb;
