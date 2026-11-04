-- Step 10 characterization. Synthetic identities; transaction always rolled back.
begin;
select no_plan();
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
 values('https://audit-minimal.invalid',array['https://app.invalid'],true);
insert into public.profiles(id,email,display_name) values
 ('19101000-0000-4000-8000-000000000001','actor@example.invalid','Fixture actor'),
 ('19101000-0000-4000-8000-000000000002','target@example.invalid','Fixture target');
insert into public.account_identities(issuer,subject,account_id) values
 ('https://audit-minimal.invalid','user_audit_target','19101000-0000-4000-8000-000000000002');
select * from public.operational_access_set('19101000-0000-4000-8000-000000000001',
 'owner','grant','test:audit','Minimal audit fixture','audit-actor',null);
create function pg_temp.audit_action(action text,params jsonb) returns jsonb language sql as $$
 select public.native_admin_execute('19101000-0000-4000-8000-000000000001',
 'https://audit-minimal.invalid',action,
 params||jsonb_build_object('account_id','19101000-0000-4000-8000-000000000002'),'sandbox')
$$;
select lives_ok($$select pg_temp.audit_action('set_tester','{"enabled":true}')$$,
 'owner can change tester before erasure');
select is((select count(*)::int from public.admin_audit_log where action='set_tester'),1,
 'successful mutation keeps its audit evidence');
select ok(not exists(select 1 from public.admin_audit_log where action='set_tester'
 and (jsonb_path_exists(coalesce(before_value,'{}'),'$.**.payments')
   or jsonb_path_exists(coalesce(after_value,'{}'),'$.**.payments')
   or jsonb_path_exists(coalesce(before_value,'{}'),'$.**.plan')
   or jsonb_path_exists(coalesce(after_value,'{}'),'$.**.plan'))),
 'mutation audit does not duplicate full account/payment summaries');
select lives_ok($$select pg_temp.audit_action('prepare_account_deletion',
 jsonb_build_object('confirmation_hash',repeat('a',64),'clerk_subject','user_audit_target'))$$,
 'the real deletion path prepares a durable tombstone');
select ok((select email is null and display_name is null from public.profiles
 where id='19101000-0000-4000-8000-000000000002'),'erasure removes profile PII');
select ok(not exists(select 1 from public.admin_audit_log
 where target='19101000-0000-4000-8000-000000000002'),
 'erasure removes the link from closed audit to the target');
select ok(not exists(select 1 from public.admin_audit_log where action='set_tester'
 and (jsonb_path_exists(coalesce(before_value,'{}'),'$.**.account_id')
   or jsonb_path_exists(coalesce(after_value,'{}'),'$.**.account_id'))),
 'erasure leaves no copied target summary in previous audit entries');
select ok(exists(select 1 from public.admin_audit_log where action='set_tester'
 and actor_account_id='19101000-0000-4000-8000-000000000001' and occurred_at is not null),
 'minimal evidence still records actor action and time');
select * from finish();
rollback;
