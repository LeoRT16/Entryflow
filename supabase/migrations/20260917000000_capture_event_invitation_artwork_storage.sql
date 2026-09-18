-- Capture the existing invitation artwork storage contract without changing
-- its production behavior. Existing objects are validated before use.

do $$
declare
  v_function oid := to_regprocedure('public.can_upload_event_invitation_artwork(text)');
  v_source text := $source$
declare
  v_auth_uid uuid := auth.uid();
  v_org_id text := split_part(object_name, '/', 2);
  v_event_id text := split_part(object_name, '/', 4);
begin
  if v_auth_uid is null then
    return false;
  end if;

  return exists (
    select 1
    from public.users u
    join public.profiles p on p.user_id = u.id
    join public.events e on e.organization_id = p.organization_id
    where u.auth_user_id = v_auth_uid
      and u.deleted_at is null
      and p.deleted_at is null
      and e.deleted_at is null
      and p.organization_id::text = v_org_id
      and e.id::text = v_event_id
      and e.organization_id = p.organization_id
  );
end;
$source$;
  v_acl_ok boolean;
begin
  if v_function is not null then
    if not exists (
      select 1
      from pg_proc p
      where p.oid = v_function
        and p.prorettype = 'boolean'::regtype
        and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
        and p.provolatile = 'v'
        and not p.proisstrict
        and p.prosecdef
        and p.proconfig = array['search_path=public, pg_catalog']::text[]
        and pg_get_userbyid(p.proowner) = 'postgres'
        and regexp_replace(btrim(p.prosrc), '\s+', ' ', 'g')
          = regexp_replace(btrim(v_source), '\s+', ' ', 'g')
    ) then
      raise exception 'Existing public.can_upload_event_invitation_artwork(text) differs from captured contract';
    end if;

    select
      count(*) = 4
      and count(*) filter (where grantee = 0 and privilege_type = 'EXECUTE') = 0
      and count(*) filter (where grantee = (select oid from pg_roles where rolname = 'anon') and privilege_type = 'EXECUTE') = 1
      and count(*) filter (where grantee = (select oid from pg_roles where rolname = 'authenticated') and privilege_type = 'EXECUTE') = 1
      and count(*) filter (where grantee = (select oid from pg_roles where rolname = 'service_role') and privilege_type = 'EXECUTE') = 1
    into v_acl_ok
    from aclexplode((select proacl from pg_proc where oid = v_function));

    if not coalesce(v_acl_ok, false) then
      raise exception 'Existing public.can_upload_event_invitation_artwork(text) ACL differs from captured contract';
    end if;
  end if;
end;
$$;

create or replace function public.can_upload_event_invitation_artwork(object_name text)
returns boolean
language plpgsql
volatile
security definer
set search_path to public, pg_catalog
as $function$
declare
  v_auth_uid uuid := auth.uid();
  v_org_id text := split_part(object_name, '/', 2);
  v_event_id text := split_part(object_name, '/', 4);
begin
  if v_auth_uid is null then
    return false;
  end if;

  return exists (
    select 1
    from public.users u
    join public.profiles p on p.user_id = u.id
    join public.events e on e.organization_id = p.organization_id
    where u.auth_user_id = v_auth_uid
      and u.deleted_at is null
      and p.deleted_at is null
      and e.deleted_at is null
      and p.organization_id::text = v_org_id
      and e.id::text = v_event_id
      and e.organization_id = p.organization_id
  );
end;
$function$;

revoke all on function public.can_upload_event_invitation_artwork(text) from public;
revoke all on function public.can_upload_event_invitation_artwork(text) from anon, authenticated, service_role;
grant execute on function public.can_upload_event_invitation_artwork(text) to anon, authenticated, service_role;

do $$
declare
  v_bucket jsonb;
begin
  select to_jsonb(b) into v_bucket
  from storage.buckets b
  where b.id = 'event-invitation-artwork';

  if found then
    if v_bucket ->> 'name' is distinct from 'event-invitation-artwork'
      or v_bucket ->> 'public' is distinct from 'true'
      or v_bucket ->> 'file_size_limit' is distinct from '8388608'
      or v_bucket -> 'allowed_mime_types' is distinct from '["image/jpeg", "image/png", "image/webp"]'::jsonb
      or v_bucket ->> 'avif_autodetection' is distinct from 'false'
      or v_bucket ->> 'type' is distinct from 'STANDARD'
      or (v_bucket ? 'versioning_status' and v_bucket ->> 'versioning_status' is distinct from 'DISABLED') then
      raise exception 'Existing event-invitation-artwork bucket differs from captured contract';
    end if;
  else
    insert into storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types,
      avif_autodetection,
      type
    ) values (
      'event-invitation-artwork',
      'event-invitation-artwork',
      true,
      8388608,
      array['image/jpeg', 'image/png', 'image/webp']::text[],
      false,
      'STANDARD'
    );
  end if;
end;
$$;

do $policy$
declare
  v_policy pg_policy%rowtype;
  v_expected_check constant text := $check$((bucket_id = 'event-invitation-artwork'::text) AND (split_part(name, '/'::text, 1) = 'organizations'::text) AND (split_part(name, '/'::text, 3) = 'events'::text) AND (split_part(name, '/'::text, 5) = 'invitation-artwork'::text) AND can_upload_event_invitation_artwork(name))$check$;
  v_authenticated oid := (select oid from pg_roles where rolname = 'authenticated');
begin
  select * into v_policy
  from pg_policy
  where polrelid = 'storage.objects'::regclass
    and polname = 'event_invitation_artwork_insert_own_org';

  if found then
    if v_policy.polcmd <> 'a'
      or not v_policy.polpermissive
      or v_policy.polroles <> array[v_authenticated]::oid[]
      or v_policy.polqual is not null
      or regexp_replace(pg_get_expr(v_policy.polwithcheck, v_policy.polrelid), '\s+', '', 'g')
        <> regexp_replace(v_expected_check, '\s+', '', 'g') then
      raise exception 'Existing storage.event_invitation_artwork_insert_own_org policy differs from captured contract';
    end if;
  else
    create policy event_invitation_artwork_insert_own_org
      on storage.objects
      as permissive
      for insert
      to authenticated
      with check (
        bucket_id = 'event-invitation-artwork'
        and split_part(name, '/', 1) = 'organizations'
        and split_part(name, '/', 3) = 'events'
        and split_part(name, '/', 5) = 'invitation-artwork'
        and can_upload_event_invitation_artwork(name)
      );
  end if;
end;
$policy$;
