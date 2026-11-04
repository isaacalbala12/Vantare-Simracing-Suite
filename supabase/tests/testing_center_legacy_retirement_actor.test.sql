-- VANTA-131 / 7b P3: isolate the deleted actor from a live issue owner.
begin;
select plan(6);

insert into private.clerk_issuers(issuer,authorized_parties,enabled)
values('https://retirement-actor.invalid',array['https://retirement-actor.invalid'],true)
on conflict(issuer) do nothing;
insert into public.profiles(id) values
 ('18960000-0000-4000-8000-000000000091'),
 ('18960000-0000-4000-8000-000000000092');
insert into auth.users(id) values
 ('18960000-0000-4000-8000-000000000091'),
 ('18960000-0000-4000-8000-000000000092');
insert into public.account_identities(issuer,subject,account_id) values
 ('https://retirement-actor.invalid','user_18960000000040008000000000000091',
  '18960000-0000-4000-8000-000000000091'),
 ('https://retirement-actor.invalid','user_18960000000040008000000000000092',
  '18960000-0000-4000-8000-000000000092');
insert into public.testing_contributions(id,account_id,channel,title,body) values
 ('18960000-0000-4000-8000-000000000093',
  '18960000-0000-4000-8000-000000000092','testers','Live owner','Live owner');
insert into public.testing_center_technical_issues
 (technical_issue_id,contribution_id,state,flow_state,origin)
values('issue_v2_'||repeat('9',64),'18960000-0000-4000-8000-000000000093',
 'open','queued','orchestrator');
insert into public.testing_center_candidate_builds
 (candidate_id,technical_issue_id,channel,build_version,exact_sha,author_id,state)
values('actor-isolation-candidate','issue_v2_'||repeat('9',64),
 'testers','fixture',repeat('b',40),'fixture-author','pending');
insert into public.testing_center_validations
 (validation_id,candidate_id,channel,exact_sha,candidate_author_id,decision,
  actor_id,actor_user_id,actor_role,rejection_reason)
values
 ('actor-isolation-deleted','actor-isolation-candidate','testers',repeat('b',40),
  'fixture-author','accepted','actor-deleted',
  '18960000-0000-4000-8000-000000000091','tester',null),
 ('actor-isolation-live','actor-isolation-candidate','testers',repeat('b',40),
  'fixture-author','rejected','actor-live',
  '18960000-0000-4000-8000-000000000092','tester','still_fails');
insert into public.testing_center_validation_snapshots
 (validation_id,technical_issue_id,candidate_id,channel,app_version,candidate_sha,
  actor_id,actor_user_id,actor_role,decision,replay_key,decision_digest,
  projection_digest,transport_digest,sanitized_projection,details_markdown,
  redacted_values,truncated_fields)
values('actor-isolation-live','issue_v2_'||repeat('9',64),
 'actor-isolation-candidate','testers','fixture',repeat('b',40),
 '18960000-0000-4000-8000-000000000091',
 '18960000-0000-4000-8000-000000000091','tester','rejected',
 'actor-isolation-replay',repeat('4',64),repeat('5',64),repeat('6',64),
 '{}','fixture rejection',0,0);
insert into public.testing_center_promotions
 (promotion_id,candidate_id,validation_id,from_channel,to_channel,exact_sha,
  validated_sha,state)
values('actor-isolation-promotion','actor-isolation-candidate',
 'actor-isolation-deleted','testers','master',repeat('b',40),repeat('b',40),'pending');
insert into public.testing_center_owner_dispositions
 (disposition_id,rejection_validation_id,technical_issue_id,actor_id,actor_user_id,
  disposition,reason,disposition_digest)
values('disposition_'||repeat('7',64),'actor-isolation-live',
 'issue_v2_'||repeat('9',64),'actor-live',
 '18960000-0000-4000-8000-000000000092','dismiss_with_reason',
 'fixture reason',repeat('7',64));

select public.apply_clerk_user_event('actor-isolation-delete',repeat('9',64),
 'https://retirement-actor.invalid','user_18960000000040008000000000000091',
 'user.deleted',now(),null);
select is((select count(*)::integer from public.account_identities
  where account_id='18960000-0000-4000-8000-000000000092'
    and deleted_at is null),1,'the issue owner remains live');
select throws_ok($$insert into public.testing_center_audit
 (audit_id,aggregate_id,from_state,to_state,origin,actor_id,actor_user_id,
  actor_role,operation_digest)
 values('actor-isolation-audit','issue_v2_'||repeat('9',64),
 'reported','queued','testing_center','actor-deleted',
 '18960000-0000-4000-8000-000000000091','tester',repeat('9',64))$$,'28000');
select throws_ok($$insert into public.testing_center_validations
 (validation_id,candidate_id,channel,exact_sha,candidate_author_id,decision,
  actor_id,actor_user_id,actor_role)
 values('actor-isolation-new','actor-isolation-candidate','testers',
 repeat('b',40),'fixture-author','accepted','actor-deleted-new',
 '18960000-0000-4000-8000-000000000091','tester')$$,'28000');
select throws_ok($$update public.testing_center_promotions
 set updated_at=clock_timestamp() where promotion_id='actor-isolation-promotion'$$,'28000');
select throws_ok($$update public.testing_center_owner_dispositions
 set created_at=clock_timestamp() where disposition_id='disposition_'||repeat('7',64)$$,'28000');
select ok(exists(select 1 from pg_constraint c
  join pg_attribute a on a.attrelid=c.conrelid and a.attname='owner_account_id'
  where c.conrelid='public.testing_center_technical_issues'::regclass
    and c.confrelid='public.profiles'::regclass and c.contype='f'
    and c.confdeltype='r' and c.conkey=array[a.attnum]),
  'durable issue owner has RESTRICT FK to profiles');
select * from finish();
rollback;
