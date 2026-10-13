-- Clear stale removal metadata whenever a membership is created or reactivated.
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
declare target profiles%rowtype; actor profiles%rowtype; role_row roles%rowtype; kind text; was_removed boolean; previous_status text; next_metadata jsonb; next_attributes jsonb;
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
  if role_row.slug <> 'owner' and p_permissions && array['accounts.manage','permissions.manage','accounts.view'] then raise exception 'structural_permission_protected' using errcode='42501'; end if;
  select * into target from profiles where user_id=p_user_id and organization_id=p_organization_id order by deleted_at nulls first,updated_at desc limit 1 for update;
  if target.id is null then
    insert into profiles(user_id,organization_id,role_id,display_name,metadata,deleted_at)
      values(p_user_id,p_organization_id,p_role_id,p_display_name,jsonb_build_object('permissions',p_permissions,'permissionsSource',p_permissions_source,'removed',false,'attributes',jsonb_build_object('area',coalesce(p_area,''),'status',p_status)),null) returning * into target;
    kind:='member.added';
  else
    was_removed:=target.deleted_at is not null;
    previous_status:=coalesce(target.metadata->'attributes'->>'status','active');
    next_metadata:=coalesce(target.metadata,'{}'::jsonb);
    next_attributes:=jsonb_set(jsonb_set(coalesce(next_metadata->'attributes','{}'::jsonb),'{area}',to_jsonb(coalesce(p_area,'')),true),'{status}',to_jsonb(p_status),true);
    next_metadata:=jsonb_set(next_metadata,'{attributes}',next_attributes,true);
    next_metadata:=jsonb_set(next_metadata,'{permissions}',to_jsonb(p_permissions),true);
    next_metadata:=jsonb_set(next_metadata,'{permissionsSource}',to_jsonb(p_permissions_source),true);
    next_metadata:=jsonb_set(next_metadata,'{removed}','false'::jsonb,true);
    update profiles set role_id=p_role_id,display_name=p_display_name,metadata=next_metadata,deleted_at=null,updated_at=now() where id=target.id returning * into target;
    kind:=case when was_removed then 'member.restored' when previous_status='inactive' and p_status='active' then 'member.reactivated' else 'member.updated' end;
  end if;
  update profiles set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{membershipResult}',to_jsonb(kind),true) where id=target.id returning * into target;
  insert into activity_logs(organization_id,event_id,timestamp,kind,icon,tone,title,description,metadata) values(p_organization_id,null,to_char(now(),'HH24:MI'),kind,'users','info',kind,'Cambio administrativo de membresía',jsonb_build_object('actorUserId',current_app_user_id(),'profileId',target.id,'roleId',target.role_id,'status',coalesce(target.metadata->'attributes'->>'status','active')));
  return target;
end; $$;
revoke all on function public.upsert_organization_membership_atomic(uuid,uuid,uuid,text,text,text,text[],text) from public,anon;
grant execute on function public.upsert_organization_membership_atomic(uuid,uuid,uuid,text,text,text,text[],text) to authenticated;
