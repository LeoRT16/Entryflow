-- 6.12B.1: canonical transactional membership lifecycle authority.
alter table public.activity_logs add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.activity_logs alter column event_id drop not null;

create or replace function public.mutate_organization_membership_atomic(
  p_profile_id uuid,
  p_role_id uuid default null,
  p_area text default null,
  p_status text default null,
  p_permissions text[] default null,
  p_permissions_source text default null,
  p_remove boolean default false,
  p_restore boolean default false
) returns public.profiles
language plpgsql security definer set search_path=public,pg_temp as $$
declare target profiles%rowtype; actor profiles%rowtype; old_role roles%rowtype; new_role roles%rowtype; owners integer; kind text; next_status text; next_deleted_at timestamptz;
begin
  if auth.uid() is null then raise exception 'account_unauthenticated' using errcode='28000'; end if;
  select * into target from profiles where id=p_profile_id for update;
  if not found then raise exception 'account_not_found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target.organization_id::text, 0));
  select * into actor from profiles where user_id=current_app_user_id() and organization_id=target.organization_id and deleted_at is null for update;
  if not found then raise exception 'account_forbidden' using errcode='42501'; end if;
  if not exists (select 1 from roles r where r.id=actor.role_id and r.slug='owner') and not (coalesce(actor.metadata->'permissions','[]'::jsonb) ? 'accounts.manage') then raise exception 'account_forbidden' using errcode='42501'; end if;
  select * into old_role from roles where id=target.role_id;
  select * into new_role from roles where id=coalesce(p_role_id,target.role_id) and deleted_at is null;
  if not found then raise exception 'account_role_not_found' using errcode='22023'; end if;
  if p_restore then next_status := 'active'; next_deleted_at := null; kind := 'member.restored';
  elsif p_remove then next_status := 'inactive'; next_deleted_at := now(); kind := 'member.removed';
  else next_status := coalesce(nullif(p_status,''),target.status); next_deleted_at := target.deleted_at; kind := case when target.status<>next_status then case when next_status='active' then 'member.reactivated' else 'member.deactivated' end when target.role_id<>new_role.id then 'member.role_changed' when p_permissions is not null then 'member.permissions_changed' else 'member.updated' end;
  end if;
  if p_permissions is not null and new_role.slug <> 'owner' and p_permissions && array['accounts.manage','permissions.manage','accounts.view'] then raise exception 'structural_permission_protected' using errcode='42501'; end if;
  select count(*) into owners from profiles p join roles r on r.id=p.role_id where p.organization_id=target.organization_id and p.deleted_at is null and p.status='active' and r.slug='owner';
  if old_role.slug='owner' and (new_role.slug<>'owner' or next_status<>'active') and owners<=1 then raise exception 'last_owner_protected' using errcode='42501'; end if;
  if target.user_id=current_app_user_id() and ((old_role.slug='owner' and new_role.slug<>'owner') or next_status<>'active' or p_remove) then raise exception 'self_mutation_forbidden' using errcode='42501'; end if;
  update profiles set role_id=new_role.id,status=next_status,deleted_at=next_deleted_at,
    attributes=jsonb_set(jsonb_set(coalesce(attributes,'{}'::jsonb),ARRAY['area'],coalesce(to_jsonb(coalesce(p_area,attributes->>'area')), '""'::jsonb),true),ARRAY['status'],to_jsonb(next_status),true),
    metadata=jsonb_set(jsonb_set(jsonb_set(jsonb_set(coalesce(metadata,'{}'::jsonb),ARRAY['attributes','area'],coalesce(to_jsonb(coalesce(p_area,attributes->>'area')), '""'::jsonb),true),ARRAY['attributes','status'],to_jsonb(next_status),true),ARRAY['removed'],to_jsonb(p_remove),true),ARRAY['permissionsSource'],coalesce(to_jsonb(p_permissions_source),metadata->'permissionsSource'),true),
    updated_at=now() where id=target.id returning * into target;
  insert into activity_logs(organization_id,event_id,timestamp,kind,icon,tone,title,description,metadata) values(target.organization_id,null,to_char(now(),'HH24:MI'),kind,'users','info',kind,'Cambio administrativo de membresía',jsonb_build_object('actorUserId',current_app_user_id(),'profileId',target.id,'roleId',target.role_id,'status',target.status));
  return target;
end; $$;
revoke all on function public.mutate_organization_membership_atomic(uuid,uuid,text,text,text[],text,boolean,boolean) from public,anon;
grant execute on function public.mutate_organization_membership_atomic(uuid,uuid,text,text,text[],text,boolean,boolean) to authenticated;

create or replace function public.upsert_organization_membership_atomic(
  p_user_id uuid,
  p_organization_id uuid,
  p_role_id uuid,
  p_display_name text,
  p_area text,
  p_status text default 'active',
  p_permissions text[] default null,
  p_permissions_source text default 'preset'
) returns public.profiles
language plpgsql security definer set search_path=public,pg_temp as $$
declare target profiles%rowtype; actor profiles%rowtype; role_row roles%rowtype; existing_role roles%rowtype; kind text; was_removed boolean; previous_status text;
begin
  if auth.uid() is null then raise exception 'account_unauthenticated' using errcode='28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_user_id::text, 0));
  if not is_platform_root() then
    select * into actor from profiles where user_id=current_app_user_id() and organization_id=p_organization_id and deleted_at is null for update;
    if not found then raise exception 'account_forbidden' using errcode='42501'; end if;
    if not exists (select 1 from roles r where r.id=actor.role_id and r.slug='owner') and not (coalesce(actor.metadata->'permissions','[]'::jsonb) ? 'accounts.manage') then raise exception 'account_forbidden' using errcode='42501'; end if;
  end if;
  select * into role_row from roles where id=p_role_id and deleted_at is null;
  if not found then raise exception 'account_role_not_found' using errcode='22023'; end if;
  select * into target from profiles where user_id=p_user_id and organization_id=p_organization_id order by deleted_at nulls first, updated_at desc limit 1 for update;
  if target.id is null then
    insert into profiles(user_id,organization_id,role_id,display_name,attributes,metadata,status,deleted_at)
      values(p_user_id,p_organization_id,p_role_id,p_display_name,jsonb_build_object('area',coalesce(p_area,''),'status',p_status,'permissions',p_permissions),jsonb_build_object('permissions',p_permissions,'permissionsSource',p_permissions_source,'attributes',jsonb_build_object('area',coalesce(p_area,''),'status',p_status)),p_status,null)
      returning * into target;
    kind := 'member.added';
  else
    select * into existing_role from roles where id=target.role_id;
    was_removed := target.deleted_at is not null;
    previous_status := target.status;
    update profiles set role_id=p_role_id,display_name=p_display_name,status=p_status,deleted_at=null,
      attributes=jsonb_build_object('area',coalesce(p_area,''),'status',p_status,'permissions',p_permissions),
      metadata=jsonb_build_object('permissions',p_permissions,'permissionsSource',p_permissions_source,'membershipResult',case when was_removed then 'restored' when previous_status='inactive' and p_status='active' then 'reactivated' else 'existing' end,'attributes',jsonb_build_object('area',coalesce(p_area,''),'status',p_status)),updated_at=now()
      where id=target.id returning * into target;
    kind := case when was_removed then 'member.restored' when previous_status='inactive' and target.status='active' then 'member.reactivated' else 'member.updated' end;
  end if;
  update profiles set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{membershipResult}',to_jsonb(kind),true) where id=target.id;
  select * into target from profiles where id=target.id;
  insert into activity_logs(organization_id,event_id,timestamp,kind,icon,tone,title,description,metadata)
    values(p_organization_id,null,to_char(now(),'HH24:MI'),kind,'users','info',kind,'Cambio administrativo de membresía',jsonb_build_object('actorUserId',current_app_user_id(),'profileId',target.id,'roleId',target.role_id,'status',target.status));
  return target;
end; $$;
revoke all on function public.upsert_organization_membership_atomic(uuid,uuid,uuid,text,text,text,text[],text) from public,anon;
grant execute on function public.upsert_organization_membership_atomic(uuid,uuid,uuid,text,text,text,text[],text) to authenticated;
