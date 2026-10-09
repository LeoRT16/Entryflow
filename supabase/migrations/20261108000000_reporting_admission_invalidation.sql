-- Invalidate the event report whenever admission state changes effectively.
create or replace function public.invalidate_reporting_after_admission_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.admission_status = 'Ingresó' and old.admission_status is distinct from new.admission_status)
     or (old.admission_status = 'Ingresó' and new.admission_status is distinct from old.admission_status)
     or (new.check_in_time is distinct from old.check_in_time and (new.admission_status = 'Ingresó' or old.admission_status = 'Ingresó')) then
    perform public.request_reporting_sync_internal(new.event_id);
  end if;
  return new;
end;
$$;

drop trigger if exists guests_reporting_admission_invalidation on public.guests;
create trigger guests_reporting_admission_invalidation
after update of admission_status, check_in_time, check_in_method on public.guests
for each row execute function public.invalidate_reporting_after_admission_change();

revoke all on function public.invalidate_reporting_after_admission_change() from public, anon, authenticated;
