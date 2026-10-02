-- Phase 5D: cancelled reservation Guests cannot retain a usable access grant.
create or replace function public.revoke_guest_access_on_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.admission_status = 'Anulada' or new.reservation_status = 'Cancelled')
     and new.admission_status <> 'Ingresó'
     and (old.admission_status is distinct from new.admission_status
       or old.reservation_status is distinct from new.reservation_status) then
    update public.accreditation_access_grants as ag
    set status = 'revoked',
        revoked_at = coalesce(ag.revoked_at, now()),
        updated_at = now()
    from public.accreditation_enrollments as e
    where e.id = ag.enrollment_id
      and e.reservation_guest_id = new.id
      and ag.status = 'active'
      and not exists (
        select 1
        from public.accreditation_checkins as ac
        where ac.access_grant_id = ag.id
      )
      and not exists (
        select 1
        from public.checkins as ci
        where ci.guest_id = new.id
          and ci.access_grant_id = ag.id
          and ci.deleted_at is null
          and ci.status in ('Checked In', 'Checked Out', 'Completed')
      );
  end if;
  return new;
end;
$$;

drop trigger if exists guests_revoke_access_on_cancellation on public.guests;
create trigger guests_revoke_access_on_cancellation
after update of admission_status, reservation_status on public.guests
for each row execute function public.revoke_guest_access_on_cancellation();

alter function public.revoke_guest_access_on_cancellation() owner to postgres;
revoke all on function public.revoke_guest_access_on_cancellation() from public, anon, authenticated, service_role;
