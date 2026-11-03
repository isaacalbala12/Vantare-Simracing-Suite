-- Written before the admin cutover: v2 behaviour protected, legacy references RED.
begin;
select no_plan();
insert into public.profiles(id) values('19107000-0000-4000-8000-000000000001'),('19107000-0000-4000-8000-000000000002');
select * from public.operational_access_set('19107000-0000-4000-8000-000000000001','owner','grant','test:admin-root','Root test','test:admin-root',null);
select * from public.testing_report_v2_submit_admitted('19107000-0000-4000-8000-000000000002',
 '{"contract_version":"testing.report.v2","report_id":"19107000-0000-4000-8000-000000000003","channel":"master","title":"Synthetic report","body":"Synthetic body","consent":true,"idempotency_key":"draft_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","variant":"simple"}');
select is((public.native_admin_execute('19107000-0000-4000-8000-000000000001','https://admin-root.invalid','list_reports','{"limit":100}','production')->'counts'->>'submitted')::integer,1,'v2 root listed');
select is(public.native_admin_execute('19107000-0000-4000-8000-000000000001','https://admin-root.invalid','get_report','{"report_id":"19107000-0000-4000-8000-000000000003"}','production')->'report'->>'action_text','Synthetic body','v2 body delivered to existing admin wire');
select lives_ok($$select public.native_admin_execute('19107000-0000-4000-8000-000000000001','https://admin-root.invalid','set_report_status','{"report_id":"19107000-0000-4000-8000-000000000003","status":"in_review"}','production')$$,'v2 review persisted');
select is((select state from public.testing_contributions where id='19107000-0000-4000-8000-000000000003'),'reviewing','review uses unique root');
select is((private.native_admin_account_summary('19107000-0000-4000-8000-000000000002','https://admin-root.invalid','production')->>'reports_count')::integer,1,'account report count');
select throws_ok($$select public.native_admin_execute('19107000-0000-4000-8000-000000000002','https://admin-root.invalid','list_reports','{"limit":100}','production')$$,'42501','native_admin_forbidden','non owner rejected');
update public.operational_access_assignments set granted_at=now()-interval '1 day',expires_at=now()-interval '1 minute' where user_id='19107000-0000-4000-8000-000000000001' and role='owner';
select throws_ok($$select public.native_admin_execute('19107000-0000-4000-8000-000000000001','https://admin-root.invalid','list_reports','{"limit":100}','production')$$,'42501','native_admin_forbidden','expired owner rejected');
update public.operational_access_assignments set expires_at=null where user_id='19107000-0000-4000-8000-000000000001' and role='owner';
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where p.prokind='f' and n.nspname in('public','private') and p.proname like 'native_admin%'
 and p.prosrc ~ 'testing_center_(reports|report_payloads|screenshot_evidence)'),0,'no live admin function keeps a legacy dependency');
select ok(not exists(select 1 from pg_trigger where tgrelid='public.admin_audit_log'::regclass and tgname='a_account_write_barrier' and encode(tgargs,'escape') like '%testing_center_reports%'),'admin audit guard no longer resolves legacy ownership');
-- Historical Clerk intent has no lease row: target_hash must still block claim.
insert into public.account_identities(issuer,subject,account_id) values('https://admin-root.invalid','user_admin_root','19107000-0000-4000-8000-000000000002');
select public.native_admin_record_effect('19107000-0000-4000-8000-000000000001',jsonb_build_object('request_id','19107000-0000-4000-8000-000000000004','effect_id','19107000-0000-4000-8000-000000000005','action','set_blocked','effect','clerk_ban','target_hash',encode(sha256(convert_to('user_admin_root','UTF8')),'hex'),'outcome','started'));
select public.native_admin_record_effect('19107000-0000-4000-8000-000000000001',jsonb_build_object('request_id','19107000-0000-4000-8000-000000000004','effect_id','19107000-0000-4000-8000-000000000005','action','set_blocked','effect','clerk_ban','target_hash',encode(sha256(convert_to('user_admin_root','UTF8')),'hex'),'outcome','unknown'));
select is(public.native_admin_claim_change('19107000-0000-4000-8000-000000000001','19107000-0000-4000-8000-000000000006','19107000-0000-4000-8000-000000000002'),null::uuid,'target_hash fallback blocks even without lease history');
select is(public.native_admin_reconcile_effect('19107000-0000-4000-8000-000000000001','19107000-0000-4000-8000-000000000005'),true,'reconcile unknown');
select is(public.native_admin_reconcile_effect('19107000-0000-4000-8000-000000000001','19107000-0000-4000-8000-000000000005'),true,'reconcile is idempotent');
select is((select count(*)::integer from private.admin_effects where effect_id='19107000-0000-4000-8000-000000000005' and outcome='reconciled'),1,'second reconcile cannot duplicate evidence');
select * from finish();
rollback;
