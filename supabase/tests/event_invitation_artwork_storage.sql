begin;

create extension if not exists pgtap;

select plan(22);

select ok(
  to_regprocedure('public.can_upload_event_invitation_artwork(text)') is not null,
  'invitation artwork upload function exists'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.can_upload_event_invitation_artwork(text)'::regprocedure),
  'invitation artwork upload function is SECURITY DEFINER'
);
select ok(
  (select proconfig @> array['search_path=public, pg_catalog']::text[] from pg_proc where oid = 'public.can_upload_event_invitation_artwork(text)'::regprocedure),
  'invitation artwork upload function has the captured search_path'
);
select ok(
  (select provolatile = 'v' and not proisstrict and prolang = (select oid from pg_language where lanname = 'plpgsql') from pg_proc where oid = 'public.can_upload_event_invitation_artwork(text)'::regprocedure),
  'invitation artwork upload function retains language, volatility, and null behavior'
);
select ok(has_function_privilege('anon', 'public.can_upload_event_invitation_artwork(text)', 'EXECUTE'), 'anon retains EXECUTE');
select ok(has_function_privilege('authenticated', 'public.can_upload_event_invitation_artwork(text)', 'EXECUTE'), 'authenticated retains EXECUTE');
select ok(has_function_privilege('service_role', 'public.can_upload_event_invitation_artwork(text)', 'EXECUTE'), 'service_role retains EXECUTE');
select ok(not has_function_privilege('public', 'public.can_upload_event_invitation_artwork(text)', 'EXECUTE'), 'PUBLIC has no EXECUTE');

select ok(
  exists (select 1 from storage.buckets where id = 'event-invitation-artwork' and name = 'event-invitation-artwork'),
  'invitation artwork bucket exists with the captured identity'
);
select ok(
  (select public from storage.buckets where id = 'event-invitation-artwork'),
  'invitation artwork bucket remains public'
);
select is(
  (select file_size_limit::bigint from storage.buckets where id = 'event-invitation-artwork'),
  8388608::bigint,
  'invitation artwork bucket limit remains exactly 8 MiB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'event-invitation-artwork'),
  array['image/jpeg', 'image/png', 'image/webp']::text[],
  'invitation artwork bucket retains JPEG, PNG, and WebP restrictions'
);
select ok(
  (select
    to_jsonb(b) ->> 'avif_autodetection' = 'false'
    and to_jsonb(b) ->> 'type' = 'STANDARD'
    and (not (to_jsonb(b) ? 'versioning_status') or to_jsonb(b) ->> 'versioning_status' = 'DISABLED')
    from storage.buckets b where id = 'event-invitation-artwork'),
  'other configurable bucket fields retain captured values'
);

select ok(
  exists (select 1 from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'event_invitation_artwork_insert_own_org'),
  'invitation artwork insert policy exists'
);
select ok(
  (select polcmd = 'a' and polpermissive and polroles = array[(select oid from pg_roles where rolname = 'authenticated')]::oid[] from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'event_invitation_artwork_insert_own_org'),
  'policy remains permissive INSERT for authenticated'
);
select ok(
  (select polqual is null from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'event_invitation_artwork_insert_own_org'),
  'policy has no USING expression'
);
select ok(
  (select
    regexp_replace(pg_get_expr(polwithcheck, polrelid), '\s+', '', 'g') =
    regexp_replace($check$((bucket_id = 'event-invitation-artwork'::text) AND (split_part(name, '/'::text, 1) = 'organizations'::text) AND (split_part(name, '/'::text, 3) = 'events'::text) AND (split_part(name, '/'::text, 5) = 'invitation-artwork'::text) AND can_upload_event_invitation_artwork(name))$check$, '\s+', '', 'g')
    from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'event_invitation_artwork_insert_own_org'),
  'policy WITH CHECK exactly matches captured bucket, path, and function contract'
);

insert into auth.users (id, email) values
  ('82600000-0000-4000-8000-000000000001', 'artwork-owner@entryflow.test');
insert into public.roles (id, name, slug, permissions)
values ('82610000-0000-4000-8000-000000000001', 'Artwork test role', 'artwork-test-role-82600000', '{}'::text[]);
insert into public.organizations (id, name, slug, status, timezone)
values
  ('82620000-0000-4000-8000-000000000001', 'Artwork owner organization', 'artwork-owner-82600000', 'active', 'UTC'),
  ('82620000-0000-4000-8000-000000000002', 'Artwork other organization', 'artwork-other-82600000', 'active', 'UTC');
insert into public.users (id, auth_user_id, email, display_name)
values ('82630000-0000-4000-8000-000000000001', '82600000-0000-4000-8000-000000000001', 'artwork-owner@entryflow.test', 'Artwork Owner');
insert into public.profiles (id, user_id, organization_id, role_id, display_name)
values ('82640000-0000-4000-8000-000000000001', '82630000-0000-4000-8000-000000000001', '82620000-0000-4000-8000-000000000001', '82610000-0000-4000-8000-000000000001', 'Artwork Owner');
insert into public.events (id, organization_id, name, event_type, status, start_at, timezone, venue, operational_model)
values
  ('82650000-0000-4000-8000-000000000001', '82620000-0000-4000-8000-000000000001', 'Artwork active event', 'test', 'draft', '2026-09-17T12:00:00Z', 'UTC', 'Test venue', 'mixed'),
  ('82650000-0000-4000-8000-000000000002', '82620000-0000-4000-8000-000000000001', 'Artwork deleted event', 'test', 'draft', '2026-09-17T12:00:00Z', 'UTC', 'Test venue', 'mixed');
update public.events set deleted_at = now() where id = '82650000-0000-4000-8000-000000000002';

select set_config('request.jwt.claim.sub', '', true);
select is(
  public.can_upload_event_invitation_artwork('organizations/82620000-0000-4000-8000-000000000001/events/82650000-0000-4000-8000-000000000001/invitation-artwork/1-test.png'),
  false,
  'null auth.uid is denied'
);
select set_config('request.jwt.claim.sub', '82600000-0000-4000-8000-000000000001', true);
select is(
  public.can_upload_event_invitation_artwork('organizations/82620000-0000-4000-8000-000000000001/events/82650000-0000-4000-8000-000000000001/invitation-artwork/1-test.png'),
  true,
  'active user and matching organization/event are allowed'
);
select is(
  public.can_upload_event_invitation_artwork('organizations/82620000-0000-4000-8000-000000000002/events/82650000-0000-4000-8000-000000000001/invitation-artwork/1-test.png'),
  false,
  'another organization is denied'
);
select is(
  public.can_upload_event_invitation_artwork('organizations/82620000-0000-4000-8000-000000000001/events/82650000-0000-4000-8000-000000000099/invitation-artwork/1-test.png'),
  false,
  'nonexistent event is denied'
);
select is(
  public.can_upload_event_invitation_artwork('organizations/82620000-0000-4000-8000-000000000001/events/82650000-0000-4000-8000-000000000002/invitation-artwork/1-test.png'),
  false,
  'deleted event is denied'
);

select * from finish();
rollback;
