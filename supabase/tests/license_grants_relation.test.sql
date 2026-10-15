-- The versioned commercial source used by loadCredentialAccount.
begin;
create extension if not exists pgtap;
select plan(2);
select lives_ok($$select capability,valid_until,provider,environment,source_type from public.billing_access_grants where user_id='16080000-0000-4000-8000-000000000005' and status='active'$$,'production credential query exists in the versioned schema');
select ok(not has_table_privilege('anon','public.billing_access_grants','SELECT'),'anonymous clients cannot read grants');
select * from finish();
rollback;
