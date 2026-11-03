-- VANTA-131 step 2. Disposable PostgreSQL only; no real users or IPs.
begin;
select plan(24);
select ok(exists(select 1 from pg_trigger where tgrelid='private.testing_report_admitted_keys'::regclass and tgname='a_account_write_barrier' and tgenabled='O'), 'admission keys retain the deleted-account write barrier');
select ok(not has_function_privilege('anon','public.testing_report_admit_account(uuid,text,text,date)','execute'),'anon cannot claim an account retry');
select ok(not has_function_privilege('authenticated','public.testing_report_admit_account(uuid,text,text,date)','execute'),'client cannot claim an account retry');
select ok(has_function_privilege('service_role','public.testing_report_admit_account(uuid,text,text,date)','execute'),'Edge service role may admit');

set local role service_role;
select ok(bool_and(public.testing_report_admit('ip',repeat('e',64),date_trunc('week',clock_timestamp() at time zone 'UTC')::date)),
  'first 60 requests on a shared IP pass the coarse guard') from generate_series(1,60);
select ok(not public.testing_report_admit('ip',repeat('e',64),date_trunc('week',clock_timestamp() at time zone 'UTC')::date),
  '61st request on the shared IP is blocked');
reset role;

set local role service_role;
select ok(public.testing_report_admit_account('16100000-0000-0000-0000-000000000091','draft_1',repeat('a',64),date_trunc('week',clock_timestamp() at time zone 'UTC')::date),'nonmember first valid report is charged');
select ok(public.testing_report_admit_account('16100000-0000-0000-0000-000000000091','draft_1',repeat('a',64),date_trunc('week',clock_timestamp() at time zone 'UTC')::date),'same body and key are admitted without another charge');
reset role;
select is((select sum(attempts)::integer from private.testing_report_attempts where scope='account' and subject='16100000-0000-0000-0000-000000000091'),1,'retry leaves account quota at one');
set local role service_role;
select throws_ok($$select public.testing_report_admit_account('16100000-0000-0000-0000-000000000091','draft_1',repeat('b',64),date_trunc('week',clock_timestamp() at time zone 'UTC')::date)$$,'23505',null,'changed body cannot borrow original key');
select ok(public.testing_report_admit_account('16100000-0000-0000-0000-000000000092','draft_1',repeat('a',64),date_trunc('week',clock_timestamp() at time zone 'UTC')::date),'same key on another account is separately charged');
reset role;
select is((select sum(attempts)::integer from private.testing_report_attempts where scope='account' and subject='16100000-0000-0000-0000-000000000092'),1,'other account has its own budget');
set local role service_role;
select ok(public.testing_report_admit_account('16100000-0000-0000-0000-000000000091','draft_'||i,repeat('a',64),date_trunc('week',clock_timestamp() at time zone 'UTC')::date),'new report uses one account slot') from generate_series(2,5) i;
select ok(not public.testing_report_admit_account('16100000-0000-0000-0000-000000000091','draft_6',repeat('a',64),date_trunc('week',clock_timestamp() at time zone 'UTC')::date),'sixth new report is denied');
reset role;
select is((select count(*)::integer from private.testing_report_admitted_keys where account_id='16100000-0000-0000-0000-000000000091'),5,'denied key is not stored as a free retry');
set local role service_role;
select throws_ok($$select public.testing_report_admit_account('16100000-0000-0000-0000-000000000091','draft_bad','bad',date_trunc('week',clock_timestamp() at time zone 'UTC')::date)$$,'22023',null,'invalid digest denied');
select throws_ok($$select public.testing_report_admit_account('16100000-0000-0000-0000-000000000091','draft_1',repeat('a',64),'2020-01-01')$$,'22023',null,'old week cannot bypass the quota');
reset role;
update private.testing_report_admitted_keys set admitted_at=clock_timestamp()-interval '9 days'
  where account_id='16100000-0000-0000-0000-000000000091' and report_key='draft_1';
set local role service_role;
select ok(public.testing_report_admit_account('16100000-0000-0000-0000-000000000092','fresh_other',repeat('a',64),date_trunc('week',clock_timestamp() at time zone 'UTC')::date),
  'another account admits without touching the expired key');
reset role;
select ok(exists(select 1 from private.testing_report_admitted_keys
  where account_id='16100000-0000-0000-0000-000000000091' and report_key='draft_1'),
  'another account does not purge this account key');
set local role service_role;
select ok(not public.testing_report_admit_account('16100000-0000-0000-0000-000000000091','own_purge',repeat('a',64),date_trunc('week',clock_timestamp() at time zone 'UTC')::date),
  'own account stays at the five-report quota');
reset role;
select ok(not exists(select 1 from private.testing_report_admitted_keys
  where account_id='16100000-0000-0000-0000-000000000091' and report_key='draft_1'),
  'own expired key is purged');
select * from finish();
rollback;
