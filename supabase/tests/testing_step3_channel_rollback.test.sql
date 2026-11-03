-- Execute only after the candidate-membership down migration on a disposable DB.
begin;
select plan(1);
insert into public.profiles(id) values ('18960000-0000-4000-8000-000000000039');
set local role service_role;
select lives_ok($$select public.testing_report_submit_admitted(
  '18960000-0000-4000-8000-000000000039',
  '18960000-0000-4000-8000-000000000049',
  'nightly','Synthetic','Synthetic',true)$$,
  'candidate membership rollback restores the old nonmember rule');
reset role;
select * from finish();
rollback;
