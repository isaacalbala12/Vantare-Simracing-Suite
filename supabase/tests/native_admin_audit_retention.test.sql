begin;
select no_plan();
insert into public.profiles(id) values('19101010-0000-4000-8000-000000000001'),('19101010-0000-4000-8000-000000000002');
select * from public.operational_access_set('19101010-0000-4000-8000-000000000001','owner','grant','test:audit','Retention fixture','audit-retention',null);
select is(private.admin_audit_maintenance(),false,'fresh session has no maintenance capability');
insert into private.mail_audit(id,action,target,detail) values
 ('19101010-0000-4000-8000-000000000024','consent','contact','{}');
select throws_ok($$update private.mail_audit set action='tampered' where id='19101010-0000-4000-8000-000000000024'$$,
 'P0001','operational_access_audit_is_append_only','fresh session cannot bypass immutability with a missing GUC');
insert into public.profiles(id) values('19101010-0000-4000-8000-000000000003');
select * from public.operational_access_set('19101010-0000-4000-8000-000000000003','owner','grant','test:audit','Expired retention fixture','audit-expired',null);
update public.operational_access_assignments set granted_at=now()-interval '2 days',expires_at=now()-interval '1 day'
 where user_id='19101010-0000-4000-8000-000000000003';
select throws_ok($$select public.native_admin_prune_audit('19101010-0000-4000-8000-000000000003')$$,
 '42501','native_admin_forbidden','expired owner cannot purge');
select set_config('vantare.audit_maintenance',pg_current_xact_id()::text,true);
select is(private.admin_audit_maintenance(),false,'a caller-controlled GUC cannot authorize maintenance');
select set_config('vantare.audit_maintenance','',true);
select is((select closed_retention_days from private.admin_audit_policy where singleton),365,'single provisional default is 365 days');
insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash,occurred_at)
select ('19101010-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,outcome,
 '19101010-0000-4000-8000-000000000001','19101010-0000-4000-8000-000000000001',
 'set_blocked','clerk_ban',repeat('a',64),clock_timestamp()-make_interval(days=>age)
from (values (11,'started',400),(11,'succeeded',400),
 (12,'started',400),(12,'succeeded',1),
 (13,'started',400),(13,'unknown',400),
 (14,'started',400),
 (15,'started',400),(15,'unknown',400),(15,'reconciled',400),
 (16,'started',100),(16,'failed',100)) rows(n,outcome,age);
insert into public.admin_audit_log(id,actor_account_id,action,target,before_value,after_value,occurred_at)
select ('19101010-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '19101010-0000-4000-8000-000000000001','set_module','19101010-0000-4000-8000-000000000002',
 '{"modules":[{"account_id":"private"},"private@example.invalid","vantare.module.strategy"]}',
 '{}',clock_timestamp()-make_interval(days=>age) from (values(21,400),(22,100)) f(n,age);
insert into private.mail_audit(id,action,target,detail,occurred_at) values
 ('19101010-0000-4000-8000-000000000023','consent','contact',
 '{"consent":true,"evidence":"private@example.invalid"}',clock_timestamp()-interval '400 days');
select ok(not exists(select 1 from public.admin_audit_log
 where id='19101010-0000-4000-8000-000000000021' and before_value::text like '%private%'),
 'module audit whitelist also removes malformed nested identifiers');
select ok(not exists(select 1 from private.mail_audit where id='19101010-0000-4000-8000-000000000023'
 and detail::text like '%private%'),'consent audit does not retain free-text evidence');
select throws_ok($$select public.native_admin_prune_audit('19101010-0000-4000-8000-000000000002')$$,
 '42501','native_admin_forbidden','non-owner cannot purge');
insert into private.mail_audit(id,actor,action,target,detail,occurred_at) values
 ('19101010-0000-4000-8000-000000000025','19101010-0000-4000-8000-000000000001','audit_prune','audit',
 '{"retention_days":365,"admin":0,"mail":0,"effects":0}',clock_timestamp()-interval '400 days');
select lives_ok($$select public.native_admin_prune_audit('19101010-0000-4000-8000-000000000001')$$,'owner can prune closed evidence');
select ok(not exists(select 1 from public.admin_audit_log where id='19101010-0000-4000-8000-000000000021')
 and exists(select 1 from public.admin_audit_log where id='19101010-0000-4000-8000-000000000022'),
 'SQL transaction audit expires only after the configured deadline');
select ok(not exists(select 1 from private.mail_audit where id='19101010-0000-4000-8000-000000000023'),
 'closed mail transaction audit uses the same retention parameter');
select is((select count(*)::int from private.admin_effects where effect_id='19101010-0000-4000-8000-000000000011'),0,'closed older than 365 days is removed');
select is((select count(*)::int from private.admin_effects where effect_id='19101010-0000-4000-8000-000000000012'),2,'retention uses last closing event, not initial intent');
select is((select count(*)::int from private.admin_effects where effect_id='19101010-0000-4000-8000-000000000013'),2,'old unknown remains pending');
select is((select count(*)::int from private.admin_effects where effect_id='19101010-0000-4000-8000-000000000014'),1,'unclosed started is never purged');
select is((select count(*)::int from private.admin_effects where effect_id='19101010-0000-4000-8000-000000000015'),0,'old reconciled closes unknown and can expire');
select is((select count(*)::int from private.admin_effects where effect_id='19101010-0000-4000-8000-000000000016'),2,'365 days retains 100-day closed evidence');
update private.admin_audit_policy set closed_retention_days=90 where singleton;
select public.native_admin_prune_audit('19101010-0000-4000-8000-000000000001');
select is((select count(*)::int from private.admin_effects where effect_id='19101010-0000-4000-8000-000000000016'),0,'Isaac can lower only the SQL parameter to 90');
select is((select count(*)::int from private.admin_pending_effects where effect_id in(
 '19101010-0000-4000-8000-000000000013','19101010-0000-4000-8000-000000000014')),2,'policy change still preserves pending evidence');
select lives_ok($$select public.native_admin_reconcile_effect('19101010-0000-4000-8000-000000000001',
 '19101010-0000-4000-8000-000000000013')$$,'owner can close an old unknown');
select public.native_admin_prune_audit('19101010-0000-4000-8000-000000000001');
select is((select count(*)::int from private.admin_effects where effect_id='19101010-0000-4000-8000-000000000013'),3,
 'new reconciliation starts its own retention window');
select ok(not private.admin_audit_maintenance(),'maintenance capability does not leak to caller');
select throws_ok($$delete from private.admin_effects where effect_id='19101010-0000-4000-8000-000000000014'$$,
 'P0001','operational_access_audit_is_append_only','normal append-only barrier is restored after maintenance');
select ok(not exists(select 1 from (values('anon'),('authenticated'),('service_role')) roles(name)
 where has_table_privilege(name,'private.admin_audit_maintenance_tx','INSERT')
 or has_table_privilege(name,'private.admin_audit_policy','UPDATE')),'private read model and policy have no direct app grants');
select ok(has_function_privilege('service_role','public.native_admin_prune_audit(uuid)','EXECUTE')
 and not has_function_privilege('authenticated','public.native_admin_prune_audit(uuid)','EXECUTE')
 and not has_function_privilege('anon','public.native_admin_prune_audit(uuid)','EXECUTE'),'prune RPC is service-only and rechecks owner');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
 where oid='public.native_admin_prune_audit(uuid)'::regprocedure),'privileged RPC fixes definer and search_path');
select ok(exists(select 1 from private.mail_audit where action='audit_prune'
 and actor='19101010-0000-4000-8000-000000000001'
 and occurred_at is not null and detail ?& array['retention_days','admin','mail','effects']),
 'purge records actor date TTL and counts in the existing journal');
select ok(not exists(select 1 from pg_proc p where p.oid=any(array[
 'private.admin_audit_minimize(anyelement,text,text[])'::regprocedure,
 'private.mail_effect_valid(text,integer,boolean)'::regprocedure,
 'private.append_mail_effect(jsonb,uuid)'::regprocedure]) and
 (p.proowner<>(select oid from pg_roles where rolname='postgres')
 or not p.proconfig @> array['search_path=""']
 or has_function_privilege('anon',p.oid,'EXECUTE')
 or has_function_privilege('authenticated',p.oid,'EXECUTE')
 or has_function_privilege('service_role',p.oid,'EXECUTE'))),
 'shared minimizer and writer stay private, postgres-owned and with fixed search_path');
select ok(exists(select 1 from private.mail_audit where id='19101010-0000-4000-8000-000000000025'),
 'old audit_prune trace survives both 365-day and 90-day evidence purges');
select ok((select prosecdef from pg_proc where oid='private.admin_audit_maintenance()'::regprocedure),
 'private maintenance predicate can check its private table as definer');
select * from finish();
rollback;
