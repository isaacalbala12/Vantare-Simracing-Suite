begin;

select plan(45);

select has_table('public','testing_center_validation_snapshots',
  'durable validation snapshots exist');
select has_table('public','testing_center_codex_dossier_snapshots',
  'deterministic dossier snapshots exist');
select has_table('public','testing_center_owner_dispositions',
  'explicit owner dispositions exist');
select ok((select bool_and(relrowsecurity and relforcerowsecurity)
  from pg_class where oid=any(array[
    'public.testing_center_validation_snapshots'::regclass,
    'public.testing_center_codex_dossier_snapshots'::regclass,
    'public.testing_center_owner_dispositions'::regclass
  ])), 'all TAU-07G private tables force RLS');
select ok(
  not has_table_privilege('authenticated','public.testing_center_validation_snapshots','select')
  and not has_table_privilege('authenticated','public.testing_center_codex_dossier_snapshots','select')
  and not has_table_privilege('authenticated','public.testing_center_owner_dispositions','select'),
  'testers cannot enumerate private votes, dossiers or owner decisions');
select ok(
  not has_table_privilege('service_role','public.testing_center_validation_snapshots','insert')
  and not has_table_privilege('service_role','public.testing_center_owner_dispositions','insert'),
  'service role mutates private state only through reviewed RPCs');
select ok(
  not has_function_privilege('authenticated',
    'public.testing_center_validate_candidate(text,text,text,text,text,text)','execute')
  and has_function_privilege('service_role',
    'public.testing_center_record_validation_projection(jsonb,text,text,text,text,uuid)','execute'),
  'legacy coarse RPC is revoked and only service role receives the new boundary');
select ok(
  position('same_branch' in pg_get_constraintdef(
    (select oid from pg_constraint
     where conname='testing_center_owner_dispositions_disposition_check')
  ))=0,
  'same_branch is absent from the database disposition allowlist');
select hasnt_column('public','testing_center_validation_snapshots','raw_payload',
  'raw tester payload is not stored');

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000401','primary@example.invalid'),
  ('00000000-0000-4000-8000-000000000402','tester-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000403','tester-b@example.invalid'),
  ('00000000-0000-4000-8000-000000000404','owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000405','outsider@example.invalid');

set local role service_role;
insert into public.testing_center_memberships(user_id,actor_id,role,active) values
  ('00000000-0000-4000-8000-000000000401','11111111-1111-4111-8111-111111111111','primary_tester',true),
  ('00000000-0000-4000-8000-000000000402','22222222-2222-4222-8222-222222222222','tester',true),
  ('00000000-0000-4000-8000-000000000403','33333333-3333-4333-8333-333333333333','tester',true),
  ('00000000-0000-4000-8000-000000000404','44444444-4444-4444-8444-444444444444','owner',true),
  ('00000000-0000-4000-8000-000000000405','55555555-5555-4555-8555-555555555555','tester',false);
reset role;

create function pg_temp.seed_feedback_candidate(
  p_issue_char text,p_candidate_id text,p_channel text,p_version text,p_sha text
) returns void language plpgsql as $$
declare
  v_issue text := 'issue_' || repeat(p_issue_char,64);
  v_report text := 'isa241_report_' || p_issue_char;
begin
  insert into public.testing_center_reports(
    report_id,reporter_id,reporter_user_id,reporter_role,channel,state
  ) values (
    v_report,'isa241-reporter','00000000-0000-4000-8000-000000000404',
    'owner',p_channel,'validated'
  ) on conflict(report_id) do nothing;
  insert into public.testing_center_technical_issues(
    technical_issue_id,report_id,state,flow_state,origin
  ) values (
    v_issue,v_report,'open',case p_channel when 'nightly' then 'nightly_candidate'
      else 'testers_candidate' end,'orchestrator'
  ) on conflict(technical_issue_id) do nothing;
  insert into public.testing_center_candidate_builds(
    candidate_id,technical_issue_id,channel,build_version,exact_sha,
    author_id,state
  ) values (
    p_candidate_id,v_issue,p_channel,p_version,p_sha,
    '99999999-9999-4999-8999-999999999999','pending'
  );
end $$;

create function pg_temp.feedback_projection(
  p_issue_char text,p_candidate_id text,p_channel text,p_version text,p_sha text,
  p_actor_id text,p_actor_role text,p_decision text,p_digest_char text
) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'contractVersion','testing-center.rejection.v1',
    'operation','record_validation',
    'issueId','issue_' || repeat(p_issue_char,64),
    'candidateId',p_candidate_id,
    'channel',p_channel,
    'appVersion',p_version,
    'candidateSha',p_sha,
    'actorRole',p_actor_role,
    'decision',p_decision,
    'replayKey','validation:issue_' || repeat(p_issue_char,64) || ':'
      || p_candidate_id || ':' || p_channel || ':' || p_sha || ':' || p_actor_id,
    'decisionDigest',repeat(p_digest_char,64),
    'projectionDigest',repeat(p_digest_char,64),
    'detailsMarkdown',case when p_decision='rejected' then
      '## Rechazo: issue_persists' || E'\n\nDescripción y pasos sanitizados'
      else null end,
    'sanitization',jsonb_build_object('redactedValues',0,'truncatedFields',0)
  )
$$;

create function pg_temp.record_feedback(
  p_issue_char text,p_candidate_id text,p_channel text,p_version text,p_sha text,
  p_actor_id text,p_actor_role text,p_decision text,p_digest_char text,p_user uuid
) returns table(validation_id text,decision text,issue_state text,candidate_state text,idempotent boolean)
language plpgsql as $$
declare v_projection jsonb; v_digest_source text; v_projection_digest text;
begin
  v_projection := pg_temp.feedback_projection(
    p_issue_char,p_candidate_id,p_channel,p_version,p_sha,p_actor_id,
    p_actor_role,p_decision,p_digest_char
  );
  v_digest_source := (v_projection - 'projectionDigest')::text;
  v_projection_digest := encode(public.digest(
    convert_to(v_digest_source,'UTF8'),'sha256'),'hex');
  v_projection := jsonb_set(
    v_projection,'{projectionDigest}',to_jsonb(v_projection_digest));
  return query select * from public.testing_center_record_validation_projection(
    v_projection,v_projection::text,v_digest_source,v_projection_digest,
    encode(public.digest(convert_to(v_projection::text,'UTF8'),'sha256'),'hex'),p_user
  );
end $$;

select pg_temp.seed_feedback_candidate('a','candidate-nightly-accept','nightly',
  '1.0.0-nightly.1',repeat('a',40));
select is(
  (select issue_state || ':' || candidate_state || ':' || idempotent
   from pg_temp.record_feedback('a','candidate-nightly-accept','nightly',
    '1.0.0-nightly.1',repeat('a',40),
    '11111111-1111-4111-8111-111111111111','primary_tester','accepted','1',
    '00000000-0000-4000-8000-000000000401')),
  'nightly_accepted:accepted:false',
  'one primary tester acceptance satisfies the Nightly functional gate');
select ok(
  (select state='accepted' from public.testing_center_candidate_builds
   where candidate_id='candidate-nightly-accept')
  and (select flow_state='nightly_accepted' from public.testing_center_technical_issues
   where technical_issue_id='issue_' || repeat('a',64)),
  'Nightly acceptance binds the exact candidate and issue state');
select is(
  (select idempotent from pg_temp.record_feedback('a','candidate-nightly-accept','nightly',
    '1.0.0-nightly.1',repeat('a',40),
    '11111111-1111-4111-8111-111111111111','primary_tester','accepted','1',
    '00000000-0000-4000-8000-000000000401')),
  true,'identical Nightly vote replay is idempotent');
select is((select count(*)::integer from public.testing_center_validation_snapshots
  where candidate_id='candidate-nightly-accept'),1,
  'replay preserves exactly one durable vote');

create function pg_temp.capture_feedback_conflict() returns text language plpgsql as $$
declare v_projection jsonb; v_digest_source text; v_projection_digest text;
begin
  v_projection := pg_temp.feedback_projection('a','candidate-nightly-accept','nightly',
    '1.0.0-nightly.1',repeat('a',40),
    '11111111-1111-4111-8111-111111111111','primary_tester','rejected','2');
  v_projection := jsonb_set(v_projection,'{replayKey}',to_jsonb(
    'validation:issue_' || repeat('a',64) || ':candidate-nightly-accept:nightly:'
    || repeat('a',40) || ':11111111-1111-4111-8111-111111111111'));
  v_digest_source := (v_projection - 'projectionDigest')::text;
  v_projection_digest := encode(public.digest(
    convert_to(v_digest_source,'UTF8'),'sha256'),'hex');
  v_projection := jsonb_set(
    v_projection,'{projectionDigest}',to_jsonb(v_projection_digest));
  perform * from public.testing_center_record_validation_projection(
    v_projection,v_projection::text,v_digest_source,v_projection_digest,
    encode(public.digest(convert_to(v_projection::text,'UTF8'),'sha256'),'hex'),
    '00000000-0000-4000-8000-000000000401');
  return 'accepted';
exception when others then return sqlstate || ':' || sqlerrm;
end $$;
select matches(pg_temp.capture_feedback_conflict(),'23505:.*replay_conflict',
  'same actor and candidate cannot mutate an existing vote');

create function pg_temp.capture_bad_feedback_digest_source() returns text language plpgsql as $$
declare v_projection jsonb; v_digest_source text; v_projection_digest text;
begin
  v_projection := pg_temp.feedback_projection('b','candidate-nightly-denied','nightly',
    '1.0.0-nightly.2',repeat('b',40),
    '11111111-1111-4111-8111-111111111111','primary_tester','accepted','3');
  v_digest_source := (v_projection - 'projectionDigest')::text;
  v_projection_digest := encode(public.digest(
    convert_to(v_digest_source,'UTF8'),'sha256'),'hex');
  v_projection := jsonb_set(
    v_projection,'{projectionDigest}',to_jsonb(v_projection_digest));
  perform * from public.testing_center_record_validation_projection(
    v_projection,v_projection::text,v_digest_source || ' ',v_projection_digest,
    encode(public.digest(convert_to(v_projection::text,'UTF8'),'sha256'),'hex'),
    '00000000-0000-4000-8000-000000000401');
  return 'accepted';
exception when others then return sqlstate || ':' || sqlerrm;
end $$;

select pg_temp.seed_feedback_candidate('b','candidate-nightly-denied','nightly',
  '1.0.0-nightly.2',repeat('b',40));
select matches(pg_temp.capture_bad_feedback_digest_source(),
  '22023:.*projection_digest_invalid',
  'validation projection digest-source tampering fails closed');
select throws_ok($$
  select * from pg_temp.record_feedback('b','candidate-nightly-denied','nightly',
    '1.0.0-nightly.2',repeat('b',40),
    '22222222-2222-4222-8222-222222222222','tester','accepted','3',
    '00000000-0000-4000-8000-000000000402')
$$,'42501',null,'ordinary tester cannot validate Nightly');

select pg_temp.seed_feedback_candidate('c','candidate-cannot','testers',
  '1.0.0-testers.1',repeat('c',40));
select is(
  (select issue_state || ':' || candidate_state
   from pg_temp.record_feedback('c','candidate-cannot','testers',
    '1.0.0-testers.1',repeat('c',40),
    '22222222-2222-4222-8222-222222222222','tester','cannot_verify','4',
    '00000000-0000-4000-8000-000000000402')),
  'testers_candidate:pending','cannot_verify preserves the candidate pending');
select ok(
  (select flow_state='testers_candidate' from public.testing_center_technical_issues
   where technical_issue_id='issue_' || repeat('c',64))
  and (select state='pending' from public.testing_center_candidate_builds
   where candidate_id='candidate-cannot'),
  'cannot_verify creates no hidden acceptance or rejection transition');
select is((select decision from public.testing_center_validation_snapshots
  where candidate_id='candidate-cannot'),'cannot_verify',
  'cannot_verify remains durable evidence');

select pg_temp.seed_feedback_candidate('d','candidate-testers-reject','testers',
  '1.0.0-testers.2',repeat('d',40));
select is((select issue_state from pg_temp.record_feedback(
  'd','candidate-testers-reject','testers','1.0.0-testers.2',repeat('d',40),
  '22222222-2222-4222-8222-222222222222','tester','accepted','5',
  '00000000-0000-4000-8000-000000000402')),
  'testers_accepted','an authorized Testers acceptance is recorded without promotion');
select is((select issue_state from pg_temp.record_feedback(
  'd','candidate-testers-reject','testers','1.0.0-testers.2',repeat('d',40),
  '33333333-3333-4333-8333-333333333333','tester','rejected','6',
  '00000000-0000-4000-8000-000000000403')),
  'needs_owner','a later authorized Testers rejection blocks immediately');
select ok(
  (select state='rejected' from public.testing_center_candidate_builds
   where candidate_id='candidate-testers-reject')
  and (select details_markdown like '## Rechazo:%'
   from public.testing_center_validation_snapshots
   where candidate_id='candidate-testers-reject' and decision='rejected'),
  'rejection persists sanitized detail and rejects only the exact candidate');
select is((select count(*)::integer from public.testing_center_audit
  where aggregate_id='issue_' || repeat('d',64)),2,
  'acceptance then rejection produces two explicit canonical transitions');

create function pg_temp.dossier(p_status text,p_reason text default null)
returns jsonb language plpgsql as $$
declare v_dossier jsonb; v_digest_source text; v_digest text;
begin
  v_dossier := jsonb_build_object(
    'contractVersion','testing-center.codex-dossier.v1',
    'status',p_status,
    'dossierIdempotencyKey','issue_' || repeat('d',64) || ':issue_'
      || repeat('e',64) || ':' || repeat('7',40) || ':' || repeat('8',40),
    'dossierDigest','',
    'repository',jsonb_build_object('owner','isaacalbala12','name',
      'Vantare-Simracing-Suite','environment','vantare-codex-cloud',
      'targetBranch','vantareapp/isa-999-correction-after-rejection'),
    'strategy','sub_issue_new_branch',
    'source',jsonb_build_object(
      'originalIssue',jsonb_build_object('issueId','issue_' || repeat('d',64),
        'title','Original issue'),
      'subIssue',jsonb_build_object('issueId','issue_' || repeat('e',64),
        'title','Correction issue'),
      'candidate',jsonb_build_object('candidateId','candidate-testers-reject',
        'channel','testers','appVersion','1.0.0-testers.2',
        'candidateSha',repeat('d',40)),
      'channel','testers','appVersion','1.0.0-testers.2'),
    'rejection',jsonb_build_object('category','issue_persists','frequency','always',
      'blocking',true,'diagnosticsConsent',false,'logsConsent',false,
      'description','Sanitized description','steps','Open the panel',
      'expected','Panel remains','observed','Panel closes'),
    'candidateSha',repeat('d',40),'nightlyHeadSha',repeat('7',40),
    'prBaseRef','nightly','basePrSha',repeat('8',40),
    'criteria',jsonb_build_array('Regression test passes'),
    'evidence','Sanitized evidence','evidenceDigest',repeat('9',64),
    'evidenceRedactedValues',0,'evidenceTruncatedFields',0,
    'files',jsonb_build_array('frontend/src/fix.ts'),
    'commandIds',jsonb_build_array('frontend.test.focal'),
    'incompleteReasons',case when p_reason is null then '[]'::jsonb
      else jsonb_build_array(p_reason) end,
    'hasReplayUrl',false,'includesRetryOrReleaseCommand',false,
    'noRetryAllowed',true,'noMergeAllowed',true,'noDeployAllowed',true,
    'noPromotionAllowed',true
  );
  v_digest_source := v_dossier::text;
  v_digest := encode(public.digest(
    convert_to(v_digest_source,'UTF8'),'sha256'),'hex');
  return jsonb_set(v_dossier,'{dossierDigest}',to_jsonb(v_digest));
end;
$$;

create function pg_temp.record_dossier(p_status text,p_reason text default null)
returns table(digest text,status text,idempotent boolean) language plpgsql as $$
declare v_dossier jsonb; v_digest_source text; v_validation text;
begin
  v_dossier := pg_temp.dossier(p_status,p_reason);
  v_digest_source := jsonb_set(
    v_dossier,'{dossierDigest}',to_jsonb(''::text))::text;
  select validation_id into strict v_validation
  from public.testing_center_validation_snapshots
  where candidate_id='candidate-testers-reject' and decision='rejected';
  return query select * from public.testing_center_record_codex_dossier(
    v_validation,v_dossier,v_dossier::text,v_digest_source,
    v_dossier->>'dossierDigest',
    encode(public.digest(convert_to(v_dossier::text,'UTF8'),'sha256'),'hex'));
end $$;

select is((select status || ':' || idempotent from pg_temp.record_dossier(
  'incomplete','missing_evidence')),'incomplete:false',
  'incomplete dossier remains durable but non-delegable');
select throws_ok($$
  select * from public.testing_center_record_owner_disposition(
    (select validation_id from public.testing_center_validation_snapshots
     where candidate_id='candidate-testers-reject' and decision='rejected'),
    (select dossier_digest from public.testing_center_codex_dossier_snapshots
     where status='incomplete'),
    'create_correction_subissue','Need complete evidence',
    'issue_' || repeat('e',64),'vantareapp/isa-999-correction-after-rejection',
    repeat('7',40),'00000000-0000-4000-8000-000000000404')
$$,'55000',null,'incomplete dossier cannot authorize a correction disposition');
select is((select status || ':' || idempotent from pg_temp.record_dossier(
  'complete',null)),'complete:false','complete deterministic dossier persists');
select is((select idempotent from pg_temp.record_dossier('complete',null)),true,
  'identical complete dossier replay is idempotent');

create function pg_temp.capture_bad_dossier_transport() returns text language plpgsql as $$
declare v_dossier jsonb; v_digest_source text; v_validation text;
begin
  v_dossier:=pg_temp.dossier('complete',null);
  v_digest_source:=jsonb_set(
    v_dossier,'{dossierDigest}',to_jsonb(''::text))::text;
  select validation_id into strict v_validation
  from public.testing_center_validation_snapshots
  where candidate_id='candidate-testers-reject' and decision='rejected';
  perform * from public.testing_center_record_codex_dossier(
    v_validation,v_dossier,v_dossier::text,v_digest_source,
    v_dossier->>'dossierDigest',repeat('0',64));
  return 'accepted';
exception when others then return sqlstate || ':' || sqlerrm;
end $$;
select matches(pg_temp.capture_bad_dossier_transport(),'22023:.*dossier_digest_invalid',
  'dossier transport tampering fails closed');
create function pg_temp.capture_bad_dossier_digest_source() returns text language plpgsql as $$
declare v_dossier jsonb; v_digest_source text; v_validation text;
begin
  v_dossier:=pg_temp.dossier('complete',null);
  v_digest_source:=jsonb_set(
    v_dossier,'{dossierDigest}',to_jsonb(''::text))::text || ' ';
  select validation_id into strict v_validation
  from public.testing_center_validation_snapshots
  where candidate_id='candidate-testers-reject' and decision='rejected';
  perform * from public.testing_center_record_codex_dossier(
    v_validation,v_dossier,v_dossier::text,v_digest_source,
    v_dossier->>'dossierDigest',
    encode(public.digest(convert_to(v_dossier::text,'UTF8'),'sha256'),'hex'));
  return 'accepted';
exception when others then return sqlstate || ':' || sqlerrm;
end $$;
select matches(pg_temp.capture_bad_dossier_digest_source(),
  '22023:.*dossier_digest_invalid',
  'dossier digest-source tampering fails closed');
select throws_ok($$
  select * from public.testing_center_record_owner_disposition(
    (select validation_id from public.testing_center_validation_snapshots
     where candidate_id='candidate-testers-reject' and decision='rejected'),
    (select dossier_digest from public.testing_center_codex_dossier_snapshots
     where status='complete'),
    'create_correction_subissue','Create reviewed correction',
    'issue_' || repeat('e',64),'vantareapp/isa-999-correction-after-rejection',
    repeat('7',40),'00000000-0000-4000-8000-000000000402')
$$,'42501',null,'non-owner cannot record an owner disposition');
select is((select result_issue_state || ':' || result_idempotent
  from public.testing_center_record_owner_disposition(
    (select validation_id from public.testing_center_validation_snapshots
     where candidate_id='candidate-testers-reject' and decision='rejected'),
    (select dossier_digest from public.testing_center_codex_dossier_snapshots
     where status='complete'),
    'create_correction_subissue','Create reviewed correction',
    'issue_' || repeat('e',64),'vantareapp/isa-999-correction-after-rejection',
    repeat('7',40),'00000000-0000-4000-8000-000000000404')),
  'needs_owner:false','owner can record reviewed sub-issue intent without delegation');
select is((select flow_state from public.testing_center_technical_issues
  where technical_issue_id='issue_' || repeat('d',64)),'needs_owner',
  'correction disposition does not queue, delegate or unblock the aggregate');
select is((select result_idempotent
  from public.testing_center_record_owner_disposition(
    (select validation_id from public.testing_center_validation_snapshots
     where candidate_id='candidate-testers-reject' and decision='rejected'),
    (select dossier_digest from public.testing_center_codex_dossier_snapshots
     where status='complete'),
    'create_correction_subissue','Create reviewed correction',
    'issue_' || repeat('e',64),'vantareapp/isa-999-correction-after-rejection',
    repeat('7',40),'00000000-0000-4000-8000-000000000404')),true,
  'identical owner disposition replay is idempotent');
select throws_ok($$
  select * from public.testing_center_record_owner_disposition(
    (select validation_id from public.testing_center_validation_snapshots
     where candidate_id='candidate-testers-reject' and decision='rejected'),
    null,'stop_rollout','Changed decision',null,null,null,
    '00000000-0000-4000-8000-000000000404')
$$,'23505',null,'an owner disposition cannot be silently changed');
select throws_ok($$
  select * from public.testing_center_record_owner_disposition(
    (select validation_id from public.testing_center_validation_snapshots
     where candidate_id='candidate-testers-reject' and decision='rejected'),
    null,'same_branch','Reuse branch',null,null,null,
    '00000000-0000-4000-8000-000000000404')
$$,'22023',null,'same_branch fails closed at the RPC boundary');

select pg_temp.seed_feedback_candidate('f','candidate-terminal','nightly',
  '1.0.0-nightly.3',repeat('f',40));
select * from pg_temp.record_feedback('f','candidate-terminal','nightly',
  '1.0.0-nightly.3',repeat('f',40),
  '11111111-1111-4111-8111-111111111111','primary_tester','rejected','7',
  '00000000-0000-4000-8000-000000000401');
select is((select result_issue_state from public.testing_center_record_owner_disposition(
  (select validation_id from public.testing_center_validation_snapshots
   where candidate_id='candidate-terminal'),null,'environment_issue',
  'Failure belongs to local environment',null,null,null,
  '00000000-0000-4000-8000-000000000404')),'stopped',
  'terminal owner classification stops this rollout only');
select is((select flow_state from public.testing_center_technical_issues
  where technical_issue_id='issue_' || repeat('f',64)),'stopped',
  'terminal owner decision is reflected canonically');

select pg_temp.seed_feedback_candidate('9','candidate-old-sha','nightly',
  '1.0.0-nightly.old',repeat('1',40));
select * from pg_temp.record_feedback('9','candidate-old-sha','nightly',
  '1.0.0-nightly.old',repeat('1',40),
  '11111111-1111-4111-8111-111111111111','primary_tester','cannot_verify','8',
  '00000000-0000-4000-8000-000000000401');
insert into public.testing_center_candidate_builds(
  candidate_id,technical_issue_id,channel,build_version,exact_sha,author_id,state
) values ('candidate-new-sha','issue_' || repeat('9',64),'nightly',
  '1.0.0-nightly.new',repeat('2',40),
  '99999999-9999-4999-8999-999999999999','pending');
select is((select issue_state from pg_temp.record_feedback(
  '9','candidate-new-sha','nightly','1.0.0-nightly.new',repeat('2',40),
  '11111111-1111-4111-8111-111111111111','primary_tester','accepted','9',
  '00000000-0000-4000-8000-000000000401')),'nightly_accepted',
  'new SHA receives a fresh independent validation');
select is((select count(distinct candidate_sha)::integer
  from public.testing_center_validation_snapshots
  where technical_issue_id='issue_' || repeat('9',64)),2,
  'votes never migrate between old and new SHA candidates');

select pg_temp.seed_feedback_candidate('8','candidate-self','nightly',
  '1.0.0-nightly.self',repeat('3',40));
update public.testing_center_candidate_builds
set author_id='11111111-1111-4111-8111-111111111111'
where candidate_id='candidate-self';
select throws_ok($$
  select * from pg_temp.record_feedback('8','candidate-self','nightly',
    '1.0.0-nightly.self',repeat('3',40),
    '11111111-1111-4111-8111-111111111111','primary_tester','accepted','a',
    '00000000-0000-4000-8000-000000000401')
$$,'55000',null,'candidate author cannot self-validate');

select pg_temp.seed_feedback_candidate('7','candidate-paused','nightly',
  '1.0.0-nightly.pause',repeat('4',40));
insert into public.testing_center_pauses(
  pause_id,scope,technical_issue_id,is_paused,reason_code,requested_by_id,
  requested_by_user_id,requested_by_role,origin
) values ('isa241-flow-pause','flow','issue_' || repeat('7',64),true,
  'owner_review','44444444-4444-4444-8444-444444444444',
  '00000000-0000-4000-8000-000000000404','owner','testing_center');
select throws_ok($$
  select * from pg_temp.record_feedback('7','candidate-paused','nightly',
    '1.0.0-nightly.pause',repeat('4',40),
    '11111111-1111-4111-8111-111111111111','primary_tester','accepted','b',
    '00000000-0000-4000-8000-000000000401')
$$,'55000',null,'paused flow rejects fresh feedback side effects');

select is((select count(*)::integer from public.testing_center_codex_runs),0,
  'feedback and owner decisions create no Codex runs');
select is((select count(*)::integer from public.testing_center_promotions),0,
  'feedback and owner decisions create no promotion records');
select is((select count(*)::integer from public.testing_center_owner_dispositions),2,
  'only two explicit owner decisions exist');
select is((select count(*)::integer from public.testing_center_codex_dossier_snapshots),2,
  'only incomplete and complete reviewed dossier snapshots exist');

select * from finish();
rollback;
