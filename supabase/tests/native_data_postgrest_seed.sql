-- ONLY a disposable loopback stack. Public fixtures, no real user or key.
begin;
insert into public.profiles(id) values
  ('00000000-0000-4000-8000-000000001452'),('00000000-0000-4000-8000-000000001453');
insert into public.account_identities(issuer,subject,account_id) values
  ('https://clerk.example.invalid','user_uuuuuuuuuuuuuuuuuuuuuuuuuuu','00000000-0000-4000-8000-000000001452');
select * from public.operational_access_set('00000000-0000-4000-8000-000000001452',
  'tester','grant','test:postgrest','Disposable PostgREST fixture','test:postgrest-1452',null);
insert into public.testing_center_memberships(user_id,actor_id,role) values
  ('00000000-0000-4000-8000-000000001452','fixture:tester','tester');
commit;
