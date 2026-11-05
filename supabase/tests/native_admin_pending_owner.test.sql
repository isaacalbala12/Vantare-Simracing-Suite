begin;
select no_plan();
insert into public.profiles(id) values('19101030-0000-4000-8000-000000000001'),('19101030-0000-4000-8000-000000000002'),('19101030-0000-4000-8000-000000000003');
select * from public.operational_access_set('19101030-0000-4000-8000-000000000001','owner','grant','fixture','Pending owner one','pending-owner-one',null);
select * from public.operational_access_set('19101030-0000-4000-8000-000000000002','owner','grant','fixture','Pending owner two','pending-owner-two',null);
select lives_ok($$select public.native_admin_execute('19101030-0000-4000-8000-000000000001','https://fixture.invalid','list_pending_effects','{}','production')$$,'owner can read pending effects in production without a provider');
create temporary table lease_token as select public.native_admin_claim_change('19101030-0000-4000-8000-000000000001','19101030-0000-4000-8000-000000000010','19101030-0000-4000-8000-000000000003') token;
select throws_ok($$select public.native_admin_claim_change('19101030-0000-4000-8000-000000000002','19101030-0000-4000-8000-000000000011','19101030-0000-4000-8000-000000000003')$$,'40001','native_admin_change_in_progress','live lease has a distinct conflict');
select public.native_admin_record_effect('19101030-0000-4000-8000-000000000001',jsonb_build_object('request_id','19101030-0000-4000-8000-000000000010','effect_id','19101030-0000-4000-8000-000000000020','action','set_blocked','effect','clerk_ban','target_hash',repeat('d',64),'outcome','started'),'19101030-0000-4000-8000-000000000003');
select throws_ok($$select public.native_admin_claim_change('19101030-0000-4000-8000-000000000002','19101030-0000-4000-8000-000000000011','19101030-0000-4000-8000-000000000003')$$,'40001','native_admin_effects_pending','unresolved effects have a distinct conflict');
-- Add a bounded page, two terminal effects and one unknown.
insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash)
 select ('19101030-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'started',gen_random_uuid(),
 '19101030-0000-4000-8000-000000000001','set_blocked','clerk_ban',repeat('e',64) from generate_series(1,55) n;
insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash,provider_status)
 select effect_id,case when effect_id='19101030-0000-4000-8000-000000000101' then 'succeeded' when effect_id='19101030-0000-4000-8000-000000000102' then 'failed' else 'unknown' end,
 request_id,actor,action,effect,target_hash,case when effect_id='19101030-0000-4000-8000-000000000101' then 204 when effect_id='19101030-0000-4000-8000-000000000102' then 403 else 503 end from private.admin_effects where effect_id in
 ('19101030-0000-4000-8000-000000000101','19101030-0000-4000-8000-000000000102','19101030-0000-4000-8000-000000000103');
create temporary table before_reads as select (select count(*) from private.admin_effects) effects,(select count(*) from public.admin_audit_log) audit;
create temporary table page_one as select public.native_admin_execute('19101030-0000-4000-8000-000000000001','https://fixture.invalid','list_pending_effects','{}','production') data;
create temporary table page_two as select public.native_admin_execute('19101030-0000-4000-8000-000000000001','https://fixture.invalid','list_pending_effects',jsonb_build_object('cursor',(select data->>'next_cursor' from page_one)),'production') data;
select is((select jsonb_array_length(data->'effects') from page_one),50,'first owner page is bounded');
select is((select jsonb_array_length(data->'effects') from page_two),4,'cursor reaches every remaining pending effect');
select is((select data->'next_cursor' from page_two),'null'::jsonb,'last page clears cursor');
select is((select count(*)::integer from (select e->>'effect_id' from page_one,jsonb_array_elements(data->'effects') e intersect select e->>'effect_id' from page_two,jsonb_array_elements(data->'effects') e) overlap),0,'pages do not repeat effects');
select ok((select bool_and(e-array['effect_id','request_id','action','effect','occurred_at','outcome','http_status']='{}'::jsonb) from page_one,jsonb_array_elements(data->'effects') e),'whitelist exposes no actor/account/hash/provider identity');
select ok((select exists(select 1 from jsonb_array_elements(data->'effects') e where e->>'outcome'='unknown' and e->>'http_status'='503') from page_one),'unknown result is visible with HTTP class');
select is((select count(*) from private.admin_effects),(select effects from before_reads),'owner reading writes no effects');
select is((select count(*) from public.admin_audit_log),(select audit from before_reads),'owner reading writes no business audit');
select throws_ok($$select public.native_admin_execute('19101030-0000-4000-8000-000000000003','https://fixture.invalid','list_pending_effects','{}','production')$$,'42501','native_admin_forbidden','non-owner cannot read effects');
select throws_ok($$select public.native_admin_execute('19101030-0000-4000-8000-000000000001','https://fixture.invalid','list_pending_effects','{"cursor":"bad"}','production')$$,'22023','native_admin_invalid','RPC validates cursor before reading');
select throws_ok($$select public.native_admin_execute('19101030-0000-4000-8000-000000000001','https://fixture.invalid','list_pending_effects','{"actor":"19101030-0000-4000-8000-000000000002"}','production')$$,'22023','native_admin_invalid','RPC rejects authority fields');
update public.operational_access_assignments set granted_at=now()-interval '2 days',expires_at=now()-interval '1 day' where user_id='19101030-0000-4000-8000-000000000001';
select throws_ok($$select public.native_admin_execute('19101030-0000-4000-8000-000000000001','https://fixture.invalid','list_pending_effects','{}','production')$$,'42501','native_admin_forbidden','expired owner cannot read effects');
select ok(not has_function_privilege('anon','public.native_admin_execute(uuid,text,text,jsonb,text)','execute') and not has_function_privilege('authenticated','public.native_admin_execute(uuid,text,text,jsonb,text)','execute'),'read remains service-only');
select ok(not has_table_privilege('anon','private.admin_pending_effects','select') and not has_table_privilege('authenticated','private.admin_pending_effects','select'),'no direct anon/authenticated view access');
select * from finish();
rollback;
