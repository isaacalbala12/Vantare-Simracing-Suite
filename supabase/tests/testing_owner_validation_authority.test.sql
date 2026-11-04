begin;
select plan(13);

insert into private.clerk_issuers(issuer,authorized_parties,enabled)
values ('https://owner-validation.invalid',array['https://app.invalid'],true)
on conflict(issuer) do nothing;
insert into public.profiles(id) values
 ('19360000-0000-4000-8000-000000000011'),
 ('19360000-0000-4000-8000-000000000012'),
 ('19360000-0000-4000-8000-000000000013'),
 ('19360000-0000-4000-8000-000000000014'),
 ('19360000-0000-4000-8000-000000000015');
insert into public.account_identities(issuer,subject,account_id)
select 'https://owner-validation.invalid','user_'||replace(id::text,'-',''),id
from public.profiles where id::text like '19360000-0000-4000-8000-00000000001%';
insert into public.testing_center_memberships(user_id,actor_id,role) values
 ('19360000-0000-4000-8000-000000000012','19360000-0000-4000-8000-000000000012','owner'),
 ('19360000-0000-4000-8000-000000000013','19360000-0000-4000-8000-000000000013','tester'),
 ('19360000-0000-4000-8000-000000000014','19360000-0000-4000-8000-000000000014','owner'),
 ('19360000-0000-4000-8000-000000000015','19360000-0000-4000-8000-000000000015','owner');
select * from public.operational_access_set(
 '19360000-0000-4000-8000-000000000011','owner','grant',
 'test:vanta1936','No membership','test:vanta1936-validation-a',null);
select * from public.operational_access_set(
 '19360000-0000-4000-8000-000000000012','owner','grant',
 'test:vanta1936','Revoked','test:vanta1936-validation-b',null);
select * from public.operational_access_set(
 '19360000-0000-4000-8000-000000000012','owner','revoke',
 'test:vanta1936','Revoked','test:vanta1936-validation-b-revoke',null);
select * from public.operational_access_set(
 '19360000-0000-4000-8000-000000000014','owner','grant',
 'test:vanta1936','Expired','test:vanta1936-validation-d',null);
update public.operational_access_assignments
set granted_at=now()-interval '2 days',expires_at=now()-interval '1 day'
where user_id='19360000-0000-4000-8000-000000000014';

select ok(private.is_owner('19360000-0000-4000-8000-000000000011')
 and not private.is_owner('19360000-0000-4000-8000-000000000012')
 and not private.is_owner('19360000-0000-4000-8000-000000000014')
 and not private.is_owner('19360000-0000-4000-8000-000000000015'),
 'fixture distinguishes active, revoked, expired and membership-only owners');
select ok(not has_function_privilege('public',
 'public.testing_center_validate_candidate(text,text,text,text,text,text)','execute')
 and not has_function_privilege('authenticated',
 'public.testing_center_validate_candidate(text,text,text,text,text,text)','execute')
 and not has_function_privilege('anon',
 'public.testing_center_validate_candidate(text,text,text,text,text,text)','execute')
 and not has_function_privilege('public',
 'public.testing_center_record_validation_projection(jsonb,text,text,text,text,uuid)','execute')
 and not has_function_privilege('authenticated',
 'public.testing_center_record_validation_projection(jsonb,text,text,text,text,uuid)','execute')
 and has_function_privilege('service_role',
 'public.testing_center_record_validation_projection(jsonb,text,text,text,text,uuid)','execute'),
 'legacy validation stays closed and projection remains service_role only');

create function pg_temp.seed_candidate(p_suffix text) returns void language plpgsql as $$
begin
 insert into public.testing_center_technical_issues(
  technical_issue_id,state,flow_state,origin,owner_account_id)
 values ('issue_'||repeat(p_suffix,64),'open','nightly_candidate','testing_center',
  '19360000-0000-4000-8000-000000000013');
 insert into public.testing_center_candidate_builds(
  candidate_id,technical_issue_id,channel,build_version,exact_sha,author_id,state)
 values ('candidate-'||p_suffix,'issue_'||repeat(p_suffix,64),'nightly',
  '1.0.0-test',repeat(p_suffix,40),'candidate-author','pending');
end $$;
select pg_temp.seed_candidate(x) from unnest(array['a','b','c','d','e','f','1','2','3']) x;

-- The production ACL stays closed. This transaction grants only the local
-- fixture so the authenticated function's own authorization can be tested.
grant execute on function public.testing_center_validate_candidate(
 text,text,text,text,text,text) to authenticated;
create function pg_temp.validate_as(p_account uuid,p_suffix text) returns text
language plpgsql as $$
declare v_result text;
begin
 perform set_config('request.jwt.claims',jsonb_build_object(
  'iss','https://owner-validation.invalid',
  'sub','user_'||replace(p_account::text,'-',''),
  'role','authenticated','sid','sess_fixture','azp','https://app.invalid')::text,true);
 perform set_config('request.jwt.claim.sub',p_account::text,true);
 select resulting_state into v_result from public.testing_center_validate_candidate(
  'testing-center.v1','candidate-'||p_suffix,repeat(p_suffix,40),
  'accepted',null,'owner-validation-'||p_suffix);
 return v_result;
exception when others then return sqlstate;
end $$;

set local role authenticated;
select is(pg_temp.validate_as('19360000-0000-4000-8000-000000000012','b'),
 '42501','revoked owner cannot validate via authenticated RPC');
select is(pg_temp.validate_as('19360000-0000-4000-8000-000000000014','d'),
 '42501','expired owner cannot validate via authenticated RPC');
select is(pg_temp.validate_as('19360000-0000-4000-8000-000000000015','e'),
 '42501','membership-only owner cannot validate via authenticated RPC');
select is(pg_temp.validate_as('19360000-0000-4000-8000-000000000013','c'),
 '42501','tester remains unable to validate nightly');
select is(pg_temp.validate_as('19360000-0000-4000-8000-000000000011','a'),
 'nightly_accepted','operational owner without membership can validate');
reset role;
select is((select actor_role from public.testing_center_validations
 where candidate_id='candidate-a'),'owner','authenticated vote records operational owner');

create function pg_temp.project_as(p_account uuid,p_suffix text,p_actor_role text)
returns text language plpgsql as $$
declare v_projection jsonb; v_source text; v_digest text; v_result text;
begin
 v_projection:=jsonb_build_object(
  'contractVersion','testing-center.rejection.v1','operation','record_validation',
  'issueId','issue_'||repeat(p_suffix,64),'candidateId','candidate-'||p_suffix,
  'channel','nightly','appVersion','1.0.0-test',
  'candidateSha',repeat(p_suffix,40),'actorRole',p_actor_role,
  'decision','accepted',
  'replayKey','validation:issue_'||repeat(p_suffix,64)||':candidate-'||p_suffix
   ||':nightly:'||repeat(p_suffix,40)||':'||p_account::text,
  'decisionDigest',repeat('1',64),'projectionDigest',repeat('0',64),
  'detailsMarkdown',null,
  'sanitization',jsonb_build_object('redactedValues',0,'truncatedFields',0));
 v_source:=(v_projection-'projectionDigest')::text;
 v_digest:=encode(public.digest(convert_to(v_source,'UTF8'),'sha256'),'hex');
 v_projection:=jsonb_set(v_projection,'{projectionDigest}',to_jsonb(v_digest));
 select result_issue_state into v_result
 from public.testing_center_record_validation_projection(
  v_projection,v_projection::text,v_source,v_digest,
  encode(public.digest(convert_to(v_projection::text,'UTF8'),'sha256'),'hex'),
  p_account);
 return v_result;
exception when others then return sqlstate;
end $$;

set local role service_role;
select is(pg_temp.project_as('19360000-0000-4000-8000-000000000012','f','owner'),
 '42501','revoked owner cannot project an owner validation');
select is(pg_temp.project_as('19360000-0000-4000-8000-000000000014','1','owner'),
 '42501','expired owner cannot project an owner validation');
select is(pg_temp.project_as('19360000-0000-4000-8000-000000000015','2','owner'),
 '42501','membership-only owner cannot project an owner validation');
select is(pg_temp.project_as('19360000-0000-4000-8000-000000000011','3','owner'),
 'nightly_accepted','operational owner without membership can project');
reset role;
select is((select actor_role from public.testing_center_validation_snapshots
 where candidate_id='candidate-3'),'owner','projection records operational owner');

select * from finish();
rollback;
