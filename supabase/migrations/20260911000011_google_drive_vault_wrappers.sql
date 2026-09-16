-- Server-only façade over Supabase Vault. The vault schema remains private.
create or replace function public.drive_vault_create_secret(p_secret text,p_name text,p_description text default '') returns uuid
language sql security definer set search_path=public,vault,pg_temp as $$ select vault.create_secret(p_secret,p_name,p_description,null::uuid); $$;
create or replace function public.drive_vault_read_secret(p_secret_id uuid) returns text
language sql security definer set search_path=public,vault,pg_temp as $$ select decrypted_secret from vault.decrypted_secrets where id=p_secret_id; $$;
create or replace function public.drive_vault_update_secret(p_secret_id uuid,p_secret text) returns void
language sql security definer set search_path=public,vault,pg_temp as $$ select vault.update_secret(p_secret_id,p_secret,null::text,null::text,null::uuid); $$;
create or replace function public.drive_vault_delete_secret(p_secret_id uuid) returns boolean
language plpgsql security definer set search_path=public,vault,pg_temp as $$ begin delete from vault.secrets where id=p_secret_id; return found; end; $$;
revoke all on function public.drive_vault_create_secret(text,text,text) from public,anon,authenticated;
revoke all on function public.drive_vault_read_secret(uuid) from public,anon,authenticated;
revoke all on function public.drive_vault_update_secret(uuid,text) from public,anon,authenticated;
revoke all on function public.drive_vault_delete_secret(uuid) from public,anon,authenticated;
grant execute on function public.drive_vault_create_secret(text,text,text) to service_role;
grant execute on function public.drive_vault_read_secret(uuid) to service_role;
grant execute on function public.drive_vault_update_secret(uuid,text) to service_role;
grant execute on function public.drive_vault_delete_secret(uuid) to service_role;
