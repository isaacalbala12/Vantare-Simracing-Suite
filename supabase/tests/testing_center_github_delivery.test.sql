begin;
select plan(28);

select has_table('public', 'testing_center_github_deliveries', 'delivery ledger exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.testing_center_github_deliveries'::regclass), 'delivery ledger forces RLS');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='testing_center_github_deliveries'), 0, 'no client policy exists');
select ok(not has_table_privilege('authenticated', 'public.testing_center_github_deliveries', 'select'), 'authenticated cannot read deliveries');
select ok(has_table_privilege('service_role', 'public.testing_center_github_deliveries', 'select,insert'), 'service role owns delivery path');
select is((select count(*)::integer from information_schema.columns where table_schema='public' and table_name='testing_center_effect_outbox' and column_name in ('lease_token','lease_expires_at','next_attempt_at','last_error_code','external_issue_number','external_issue_node_id')), 6, 'outbox has six delivery columns');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'testing_center_%github%' and p.prosecdef and p.proconfig[1]='search_path=""'), 6, 'six GitHub functions are hardened');
select ok(not has_function_privilege('authenticated', 'public.testing_center_claim_github_effect(text,uuid,integer)', 'execute'), 'authenticated cannot claim');
select ok(has_function_privilege('service_role', 'public.testing_center_claim_github_effect(text,uuid,integer)', 'execute'), 'service role can claim');

insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000601','github-delivery@example.invalid');
set role service_role;
insert into public.testing_center_reports(report_id,reporter_id,reporter_user_id,reporter_role,channel,state)
values ('delivery_report','delivery-tester','00000000-0000-4000-8000-000000000601','primary_tester','nightly','submitted');
insert into public.testing_center_report_payloads(report_id,action_text,expected_text,observed_text,context_text,app_version,os_family,os_version,module,include_diagnostic,include_logs,diagnostic_document,diagnostic_transport_digest)
values ('delivery_report','Open the hub','The hub stays open','The hub closes',null,'v0.4.7-nightly','windows','Windows 11','hub',false,false,null,null);
insert into public.testing_center_report_events(event_id,report_id,actor_id,actor_user_id,actor_role,operation_digest)
values ('delivery_event','delivery_report','delivery-tester','00000000-0000-4000-8000-000000000601','primary_tester',repeat('e',64));
create temporary table delivery_triage as select * from public.testing_center_triage_report('delivery_report');

select throws_ok($$select * from public.testing_center_claim_github_effect((select result_effect_id from delivery_triage),null,60)$$, '22023', 'testing_center_github_claim_invalid', 'null lease fails closed');
create temporary table first_claim as select * from public.testing_center_claim_github_effect((select result_effect_id from delivery_triage),'11111111-1111-4111-8111-111111111111',60);
select is((select claim_status from first_claim),'claimed','first worker claims');
select is((select state from public.testing_center_effect_outbox where effect_id=(select result_effect_id from delivery_triage)),'claimed','claim is durable');
select is((select attempt_count::integer from public.testing_center_effect_outbox where effect_id=(select result_effect_id from delivery_triage)),1,'claim increments attempts once');
select is((select claim_status from public.testing_center_claim_github_effect((select result_effect_id from delivery_triage),'22222222-2222-4222-8222-222222222222',60)),'busy','active lease excludes another worker');

insert into public.testing_center_pauses(pause_id,scope,technical_issue_id,is_paused,reason_code,requested_by_id,requested_by_user_id,requested_by_role)
values ('delivery_pause','flow',(select result_technical_issue_id from delivery_triage),true,'owner_test','owner','00000000-0000-4000-8000-000000000601','owner');
select throws_ok($$select public.testing_center_assert_github_effect_unpaused((select result_effect_id from delivery_triage),'11111111-1111-4111-8111-111111111111')$$, '55000', 'testing_center_paused', 'pause is rechecked before side effect');
update public.testing_center_pauses set is_paused=false where pause_id='delivery_pause';
select lives_ok($$select public.testing_center_complete_github_effect((select result_effect_id from delivery_triage),'11111111-1111-4111-8111-111111111111',42,'I_kwDO_test')$$, 'leased effect completes');
select is((select state || ':' || external_issue_number from public.testing_center_effect_outbox where effect_id=(select result_effect_id from delivery_triage)),'completed:42','external identity is durable');
select is((select claim_status from public.testing_center_claim_github_effect((select result_effect_id from delivery_triage),'33333333-3333-4333-8333-333333333333',60)),'completed','completed effect never reclaims');
select lives_ok($$select public.testing_center_reconcile_github_effect((select result_effect_id from delivery_triage),42,'I_kwDO_test')$$, 'same reconciliation is idempotent');
select throws_ok($$select public.testing_center_reconcile_github_effect((select result_effect_id from delivery_triage),43,'other')$$, '23505', 'testing_center_github_reconcile_conflict', 'conflicting reconciliation fails closed');

select is(public.testing_center_record_github_delivery('delivery-1','issues','opened',repeat('a',64),42),false,'first delivery is recorded');
select is(public.testing_center_record_github_delivery('delivery-1','issues','opened',repeat('a',64),42),true,'identical replay is idempotent');
select throws_ok($$select public.testing_center_record_github_delivery('delivery-1','issues','edited',repeat('b',64),42)$$, '23505', 'testing_center_github_delivery_conflict', 'delivery ID reuse with other body fails');
select is((select count(*)::integer from public.testing_center_github_deliveries),1,'delivery replay creates one row');

update public.testing_center_effect_outbox set state='pending',attempt_count=0,external_issue_number=null,external_issue_node_id=null where effect_id=(select result_effect_id from delivery_triage);
select is((select claim_status from public.testing_center_claim_github_effect((select result_effect_id from delivery_triage),'44444444-4444-4444-8444-444444444444',60)),'claimed','reset fixture claims for retry test');
select lives_ok($$select public.testing_center_fail_github_effect((select result_effect_id from delivery_triage),'44444444-4444-4444-8444-444444444444','github_request_failed')$$,'failure is scheduled safely');
select is((select state || ':' || last_error_code from public.testing_center_effect_outbox where effect_id=(select result_effect_id from delivery_triage)),'failed:github_request_failed','failure stores only closed error code');
select is((select claim_status from public.testing_center_claim_github_effect((select result_effect_id from delivery_triage),'55555555-5555-4555-8555-555555555555',60)),'retry_scheduled','backoff prevents immediate retry');

select * from finish();
rollback;
