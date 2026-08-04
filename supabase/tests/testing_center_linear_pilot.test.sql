begin;

select plan(18);

select has_column('public', 'testing_center_linear_issue_bindings',
  'external_identifier', 'binding stores the safe Linear identifier');
select has_column('public', 'testing_center_linear_issue_bindings',
  'external_url', 'binding stores the reviewed Linear URL');
select has_column('public', 'testing_center_linear_issue_bindings',
  'projection_digest', 'binding pins the exact dispatched projection');
select ok(
  not has_function_privilege('authenticated',
    'public.testing_center_assert_linear_dispatch(text,text,bigint,text,jsonb,text,text)',
    'execute')
  and not has_function_privilege('authenticated',
    'public.testing_center_complete_linear_pilot(text,text,bigint,text,uuid,uuid,text,text,text)',
    'execute'),
  'authenticated clients cannot open or complete an external effect'
);
select ok(
  has_function_privilege('service_role',
    'public.testing_center_assert_linear_dispatch(text,text,bigint,text,jsonb,text,text)',
    'execute')
  and has_function_privilege('service_role',
    'public.testing_center_complete_linear_pilot(text,text,bigint,text,uuid,uuid,text,text,text)',
    'execute'),
  'only the server worker receives pilot RPC execution'
);

update public.testing_center_pauses
set is_paused = false where pause_id = 'isa239-cutover-pause';
insert into public.testing_center_build_identities(
  build_identity_id, channel, app_version, candidate_sha, registered_by_id
) values (
  'build_' || repeat('9',64), 'nightly', '0.7.39-pending', repeat('a',40),
  'isa243-owner'
);

create temporary table isa243_pilot as
select effect_id, null::bigint as fencing_token, null::text as source_digest,
  null::jsonb as projection, null::text as canonical_projection,
  null::text as projection_digest
from public.testing_center_effect_outbox
where technical_issue_id = 'issue_legacy_pending'
  and effect_type = 'linear_issue_create';
grant select, update on isa243_pilot to service_role;

set role service_role;

select is(
  (select preparation_status from public.testing_center_prepare_linear_projection(
    (select effect_id from isa243_pilot)
  )),
  'prepared', 'selected effect prepares an immutable source snapshot'
);

update isa243_pilot pilot set
  fencing_token = (
    select claim.fencing_token
    from public.testing_center_claim_linear_effect(
      pilot.effect_id, 'isa243-linear-pilot', 300
    ) claim
  );
select ok(
  (select fencing_token is not null and fencing_token > 0 from isa243_pilot),
  'worker claims the prepared effect with fencing'
);

update isa243_pilot pilot set
  source_digest = snapshot.source_digest,
  projection = pg_catalog.jsonb_build_object(
    'contractVersion','testing-center.linear-issue.v1',
    'operation','create_issue',
    'effectId',snapshot.effect_id,
    'technicalIssueId',snapshot.technical_issue_id,
    'sourceDigest',snapshot.source_digest,
    'marker',snapshot.marker,
    'title','[Testing Center] testing_center synthetic',
    'description',snapshot.marker || E'\nSynthetic report without private evidence.',
    'labels',pg_catalog.jsonb_build_array(
      'testing-center','needs-triage','channel:nightly',
      'module:testing_center','status:needs-triage'),
    'team','Vantare',
    'project','Testing Center',
    'status','Triage',
    'serverMetadataDigest','65511d3f3ca28f43acd775c2a25902825730c892ba6e76860576dd0fdfc0caff'
  )
from public.testing_center_linear_projection_snapshots snapshot
where snapshot.effect_id = pilot.effect_id;
update isa243_pilot set
  canonical_projection = projection::text,
  projection_digest = pg_catalog.encode(public.digest(
    pg_catalog.convert_to(projection::text,'UTF8'),'sha256'),'hex');

select lives_ok(
  pg_catalog.format(
    'select public.testing_center_assert_linear_dispatch(%L,%L,%s,%L,%L::jsonb,%L,%L)',
    effect_id, 'isa243-linear-pilot', fencing_token, source_digest,
    projection::text, canonical_projection, projection_digest
  ),
  'dispatch gate accepts the exact claimed sanitized projection'
) from isa243_pilot;

select lives_ok(
  pg_catalog.format(
    'select public.testing_center_retry_linear_pilot_token(%L,%L,%s,%L)',
    effect_id, 'isa243-linear-pilot', fencing_token, projection_digest
  ),
  'token failure can reset only the pre-mutation asserted snapshot'
) from isa243_pilot;
select ok(
  (select effect.state = 'failed' and snapshot.sanitized_projection is null
    and snapshot.projection_digest is null and snapshot.completed_at is null
   from public.testing_center_effect_outbox effect
   join isa243_pilot pilot using(effect_id)
   join public.testing_center_linear_projection_snapshots snapshot using(effect_id)),
  'safe token retry leaves no dispatch-started marker'
);
reset role;
update public.testing_center_effect_outbox effect
set next_attempt_at = now() - interval '1 second'
from isa243_pilot pilot where effect.effect_id = pilot.effect_id;
set role service_role;
update isa243_pilot pilot set
  fencing_token = (
    select claim.fencing_token
    from public.testing_center_claim_linear_effect(
      pilot.effect_id, 'isa243-linear-pilot', 300
    ) claim where claim.claim_status = 'claimed'
  );
select ok(
  (select fencing_token = 2 from isa243_pilot),
  'safe retry receives a new fencing generation'
);
select lives_ok(
  pg_catalog.format(
    'select public.testing_center_assert_linear_dispatch(%L,%L,%s,%L,%L::jsonb,%L,%L)',
    effect_id, 'isa243-linear-pilot', fencing_token, source_digest,
    projection::text, canonical_projection, projection_digest
  ),
  'retried token stage must pass the full dispatch gate again'
) from isa243_pilot;

reset role;
update public.testing_center_pauses
set is_paused = true where pause_id = 'isa239-cutover-pause';
set role service_role;
select throws_ok(
  pg_catalog.format(
    'select public.testing_center_assert_linear_dispatch(%L,%L,%s,%L,%L::jsonb,%L,%L)',
    effect_id, 'isa243-linear-pilot', fencing_token, source_digest,
    projection::text, canonical_projection, projection_digest
  ),
  '55000', 'testing_center_paused',
  'pause closes the gate before a second external effect'
) from isa243_pilot;

reset role;
update public.testing_center_pauses
set is_paused = false where pause_id = 'isa239-cutover-pause';
set role service_role;
select lives_ok(
  pg_catalog.format(
    'select public.testing_center_complete_linear_pilot(%L,%L,%s,%L,%L::uuid,%L::uuid,%L,%L,%L)',
    effect_id, 'isa243-linear-pilot', fencing_token, projection_digest,
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002', 'ISA-999',
    'https://linear.app/vantareapp/issue/ISA-999/testing-center-synthetic',
    'isa243-linear-pilot'
  ),
  'confirmed Linear result binds and completes atomically'
) from isa243_pilot;

select ok(
  (select external_identifier = 'ISA-999'
    and external_url = 'https://linear.app/vantareapp/issue/ISA-999/testing-center-synthetic'
    and binding.projection_digest = pilot.projection_digest
   from public.testing_center_linear_issue_bindings binding
   join isa243_pilot pilot using(effect_id)),
  'binding contains only reviewed public metadata and exact digest'
);
select is(
  (select state from public.testing_center_effect_outbox effect
   join isa243_pilot pilot using(effect_id)),
  'completed', 'external success is terminal and clears the lease'
);
select is(
  (select claim_status from public.testing_center_claim_linear_effect(
    (select effect_id from isa243_pilot), 'isa243-repeat', 300
  )),
  'completed', 'a repeated worker invocation cannot create a duplicate issue'
);
select throws_ok(
  pg_catalog.format(
    'select public.testing_center_complete_linear_pilot(%L,%L,%s,%L,%L::uuid,%L::uuid,%L,%L,%L)',
    effect_id, 'isa243-linear-pilot', fencing_token, projection_digest,
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002', 'ISA-999',
    'https://linear.app/vantareapp/issue/ISA-999/testing-center-synthetic',
    'isa243-linear-pilot'
  ),
  '55000', 'testing_center_linear_lease_lost',
  'stale completion cannot overwrite a terminal effect'
) from isa243_pilot;

select * from finish();
rollback;
