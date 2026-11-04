-- Disposable historical cases outside the normal writer path.
begin;
insert into public.profiles(id) values
 ('18960000-0000-4000-8000-0000000007b3'),
 ('18960000-0000-4000-8000-0000000007b5')
on conflict (id) do nothing;
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
values('https://vanta131-archive-states.clerk.invalid',
 array['https://app.invalid'],true);
insert into public.account_identities(issuer,subject,account_id)
values('https://vanta131-archive-states.clerk.invalid',
 'user_archive_deleted7b5','18960000-0000-4000-8000-0000000007b5');
insert into public.testing_center_reports
 (report_id,reporter_id,reporter_user_id,reporter_role,channel,state)
values
 ('report_'||repeat('a',64),'legacy-7b3',
  '18960000-0000-4000-8000-0000000007b3','tester','nightly','draft'),
 ('report_'||repeat('b',64),'legacy-7b3',
  '18960000-0000-4000-8000-0000000007b3','tester','nightly','validated'),
 ('report_'||repeat('c',64),'legacy-7b3',
  '18960000-0000-4000-8000-0000000007b3','tester','nightly','closed'),
 ('legacy_invalid_7b2','legacy-7b3',
  '18960000-0000-4000-8000-0000000007b3','tester','nightly','submitted'),
 ('report_'||repeat('d',64),'legacy-7b3',
  '18960000-0000-4000-8000-0000000007b3','tester','nightly','duplicate_linked'),
 ('report_'||repeat('e',64),'legacy-7b3',
  '18960000-0000-4000-8000-0000000007b3','tester','nightly','incomplete'),
 ('report_'||repeat('f',64),'legacy-7b5',
  '18960000-0000-4000-8000-0000000007b5','tester','nightly','submitted');
insert into public.testing_center_report_events
 (event_id,report_id,actor_id,actor_user_id,actor_role,operation_digest)
values ('legacy-7b5-event','report_'||repeat('f',64),'legacy-7b5',
 '18960000-0000-4000-8000-0000000007b5','tester',repeat('5',64));
commit;

-- This orphan models a pilot row written before the account write barrier.
set session_replication_role=replica;
insert into public.testing_center_reports
 (report_id,reporter_id,reporter_user_id,reporter_role,channel,state)
values ('report_'||repeat('9',64),'legacy-orphan',
 '18960000-0000-4000-8000-0000000007b4','tester','nightly','submitted');
set session_replication_role=origin;

select public.apply_clerk_user_event('vanta131-archive-states-delete',
 repeat('5',64),'https://vanta131-archive-states.clerk.invalid',
 'user_archive_deleted7b5','user.deleted',now(),null);
