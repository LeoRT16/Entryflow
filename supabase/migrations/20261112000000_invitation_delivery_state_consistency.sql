-- QR/access issuance does not constitute WhatsApp delivery. Normalize only
-- newly written legacy rows that have no recipient and no provider evidence.
create or replace function public.normalize_guest_invitation_delivery_state()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if nullif(trim(coalesce(new.whatsapp, '')), '') is null
     and coalesce(new.delivery_status, '') in ('Enviada', 'Reenviada')
     and not exists (
       select 1
       from jsonb_array_elements(
         case when jsonb_typeof(new.delivery_history) = 'array'
           then new.delivery_history
           else '[]'::jsonb
         end
       ) as history_entry
       where history_entry->>'title' in ('Aceptado', 'Enviado', 'Entregado', 'Vista', 'Leída', 'Leido', 'Falló', 'Fallida')
          or (
            history_entry->>'title' in ('Enviada', 'Reenviada')
            and (history_entry->>'detail') ~* '(whatsapp|proveedor|meta|entreg)'
          )
     ) then
    new.delivery_status := 'Pendiente de envío';
    new.no_invitation_sent := true;
  end if;
  return new;
end;
$$;

drop trigger if exists guests_invitation_delivery_state_consistency on public.guests;
create trigger guests_invitation_delivery_state_consistency
before insert or update of whatsapp, delivery_status, delivery_history on public.guests
for each row execute function public.normalize_guest_invitation_delivery_state();

revoke all on function public.normalize_guest_invitation_delivery_state() from public, anon, authenticated, service_role;
