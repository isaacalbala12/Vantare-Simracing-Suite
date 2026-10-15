begin;
select plan(4);
select is((select count(*)::int from public.account_identities),2,'failed upgrade retains both historical identities');
select is((select count(distinct account_id)::int from public.account_identities),2,'failed upgrade never merges conflicting UUIDs');
select is((select count(*)::int from public.profiles where email is not null),2,'failed upgrade retains both profiles and PII');
select is(to_regclass('private.clerk_issuers'),null::regclass,'all B03 changes rolled back atomically');
select * from finish();
rollback;
