begin;
do $$
declare oa uuid:='a4000000-0000-4000-8000-000000000001'; ob uuid:='a4000000-0000-4000-8000-000000000002'; ea uuid:='a4000000-0000-4000-8000-000000000011'; eb uuid:='a4000000-0000-4000-8000-000000000012'; ia uuid:='a4000000-0000-4000-8000-000000000021'; ib uuid:='a4000000-0000-4000-8000-000000000022'; l uuid; o uuid; c record; old uuid; new uuid;
begin
 insert into public.organizations(id,name,slug,status,timezone) values(oa,'A','drive-test-a','active','UTC'),(ob,'B','drive-test-b','active','UTC');
 insert into public.events(id,organization_id,name,event_type,status,start_at,timezone,venue,operational_model) values(ea,oa,'A','test','draft','2026-01-01','UTC','A','mixed'),(eb,ob,'B','test','draft','2026-01-01','UTC','B','mixed');
 insert into public.reporting_drive_integrations(id,organization_id,enabled,status,organization_drive_folder_id) values(ia,oa,true,'connected','root-a'),(ib,ob,true,'connected','root-b');
 insert into public.event_drive_locations(organization_id,event_id,drive_integration_id,event_drive_folder_id,final_reports_folder_id) values(oa,ea,ia,'event-a','reports-a');
 l:=(select id from public.event_drive_locations where event_id=ea); delete from public.event_drive_locations where id=l;
 o:=public.request_drive_event_provisioning_internal(ea,'provision_event'); if o is null then raise exception 'request failed'; end if;
 if public.request_drive_event_provisioning_internal(ea,'provision_event')<>o or (select count(*) from public.drive_provisioning_outbox where event_location_id=(select id from public.event_drive_locations where event_id=ea))<>1 then raise exception 'coalescing failed'; end if;
 update public.drive_provisioning_outbox set status='uncertain'; if exists(select 1 from public.claim_drive_provisioning_jobs('w',1)) then raise exception 'uncertain claimed'; end if; update public.drive_provisioning_outbox set status='pending';
 select * into c from public.claim_drive_provisioning_jobs('a',1); old:=c.claim_token; if c.attempts<>1 then raise exception 'claim failed'; end if; if exists(select 1 from public.claim_drive_provisioning_jobs('b',1)) then raise exception 'double claim'; end if;
 update public.drive_provisioning_outbox set lease_expires_at=now()-interval '1 second' where id=c.outbox_id; select * into c from public.claim_drive_provisioning_jobs('b',1); new:=c.claim_token; if new=old or c.attempts<>2 then raise exception 'reclaim failed'; end if;
 if public.complete_drive_provisioning_job(c.outbox_id,old,c.target_revision,'old','old') then raise exception 'stale token accepted'; end if;
 update public.event_drive_locations set revision=revision+1 where event_id=ea; if public.complete_drive_provisioning_job(c.outbox_id,new,c.target_revision,'stale','stale') then raise exception 'stale revision accepted'; end if;
 if has_function_privilege('authenticated','public.claim_drive_provisioning_jobs(text,integer)','execute') or has_function_privilege('anon','public.complete_drive_provisioning_job(uuid,uuid,bigint,text,text,text)','execute') then raise exception 'worker grants exposed'; end if;
 if not has_function_privilege('service_role','public.drive_vault_create_secret(text,text,text)','execute') or has_function_privilege('authenticated','public.drive_vault_read_secret(uuid)','execute') then raise exception 'vault grants invalid'; end if;
 raise notice 'google_drive_persistence comprehensive checks: PASS';
end $$;
rollback;
