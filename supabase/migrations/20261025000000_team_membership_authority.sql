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
