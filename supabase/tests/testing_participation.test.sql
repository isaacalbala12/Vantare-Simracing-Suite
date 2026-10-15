-- Run against LOCAL Supabase after the migration. Never production fixtures.
begin;
SELECT set_config('fixture.clerk',(to_regclass('private.clerk_issuers') IS NOT NULL)::text,true);
-- The old schema-cut runner uses UUID claims; B03 requires a bound Clerk session.
CREATE FUNCTION pg_temp.fixture_claims(account text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', CASE
    WHEN current_setting('fixture.clerk',true)='true' THEN
      jsonb_build_object('iss','https://fixtures.clerk.invalid',
        'sub','user_'||replace(account,'-',''),'role','authenticated',
        'sid','sess_fixture','azp','https://app.invalid')
    ELSE jsonb_build_object('iss','https://local.supabase.test/auth/v1',
        'sub',account,'role','authenticated') END::text, true);
  RETURN set_config('request.jwt.claim.sub',account,true);
END $$;

select plan(20);
insert into public.profiles(id) values
 ('15350000-0000-0000-0000-000000000001'), ('15350000-0000-0000-0000-000000000002');
-- B03 fixture: internal profile plus an explicit Clerk binding before child rows.
DO $fixture$ BEGIN
  IF to_regclass('private.clerk_issuers') IS NOT NULL THEN
    INSERT INTO private.clerk_issuers(issuer,authorized_parties,enabled)
      VALUES ('https://fixtures.clerk.invalid',ARRAY['https://app.invalid'],true)
      ON CONFLICT (issuer) DO NOTHING;
    INSERT INTO public.account_identities(issuer,subject,account_id)
      SELECT 'https://fixtures.clerk.invalid','user_'||replace(id::text,'-',''),id
      FROM public.profiles ON CONFLICT (issuer,subject) DO NOTHING;
  END IF;
END $fixture$;

insert into public.account_identities(issuer,subject,account_id) values
 ('https://clerk.local.test','user_local_a','15350000-0000-0000-0000-000000000001'),
 ('https://clerk.local.test','user_local_b','15350000-0000-0000-0000-000000000002');
select is((select count(*)::integer from auth.users where id in
 ('15350000-0000-0000-0000-000000000001','15350000-0000-0000-0000-000000000002')),0,'native accounts have no auth.users');
select is((select count(*)::integer from pg_constraint where contype='f'
 and conrelid in ('public.testing_answers'::regclass,'public.testing_contributions'::regclass)
 and confrelid='public.profiles'::regclass and confdeltype='c'),2,'both account FKs cascade from profiles');
insert into public.testing_center_memberships(user_id,actor_id,role) values
 ('15350000-0000-0000-0000-000000000001','1535-a','primary_tester'),
 ('15350000-0000-0000-0000-000000000002','1535-b','tester');
insert into public.testing_questionnaires(id,version,channel,title,question,published) values
 ('15350000-0000-0000-0000-000000000010','1.2.3','testers','Experiencia','¿Cómo funciona?',true),
 ('15350000-0000-0000-0000-000000000011','1.2.3','nightly','Nightly','¿Cómo funciona?',true),
 ('15350000-0000-0000-0000-000000000012','1.2.3','testers','Borrador','¿Cómo funciona?',false);
set local role authenticated;
select pg_temp.fixture_claims('15350000-0000-0000-0000-000000000001');
select lives_ok($$select public.testing_answer_save('15350000-0000-0000-0000-000000000010',4::smallint,'Bien')$$,'account A can answer');
select lives_ok($$select public.testing_answer_save('15350000-0000-0000-0000-000000000010',5::smallint,'Actualizado')$$,'retry updates answer');
select is((select count(*)::integer from public.testing_answers),1,'no duplicate answer');
select is((select score::integer from public.testing_answers),5,'updated score persisted');
select throws_ok($$select public.testing_answer_save('15350000-0000-0000-0000-000000000012',4::smallint,'')$$,'42501','testing_membership_required','unpublished questionnaire denied');
select lives_ok($$select public.testing_contribution_submit('15350000-0000-0000-0000-000000000020','testers','Propuesta','Texto')$$,'contribution accepted');
select lives_ok($$select public.testing_contribution_submit('15350000-0000-0000-0000-000000000020','testers','Propuesta','Texto')$$,'identical retry accepted');
select is((select count(*)::integer from public.testing_contributions),1,'no duplicate contribution');
select throws_ok($$select public.testing_contribution_submit('15350000-0000-0000-0000-000000000020','testers','Otro','Texto')$$,'23505','testing_contribution_conflict','changed retry rejected');
select pg_temp.fixture_claims('15350000-0000-0000-0000-000000000002');
select is((select count(*)::integer from public.testing_answers),0,'B cannot read A answers');
select is((select count(*)::integer from public.testing_contributions),0,'B cannot read A contributions');
select lives_ok($$select public.testing_answer_save('15350000-0000-0000-0000-000000000010',2::smallint,'B')$$,'B without auth.users can answer');
select lives_ok($$select public.testing_contribution_submit('15350000-0000-0000-0000-000000000021','testers','B','Texto')$$,'B without auth.users can contribute');
select throws_ok($$select public.testing_contribution_submit('15350000-0000-0000-0000-000000000020','testers','Propuesta','Texto')$$,'23505','testing_contribution_conflict','B cannot replay A contribution');
select throws_ok($$select public.testing_answer_save('15350000-0000-0000-0000-000000000011',3::smallint,'')$$,'42501','testing_membership_required','tester cannot answer nightly');
select throws_ok($$insert into public.testing_answers values('15350000-0000-0000-0000-000000000010','15350000-0000-0000-0000-000000000002',3,'',now())$$,'42501',null,'direct writes denied');
set local role anon;
select throws_ok($$select * from public.testing_answers$$,'42501',null,'anon denied');
reset role;
update public.testing_center_memberships set active=false where user_id='15350000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.fixture_claims('15350000-0000-0000-0000-000000000002');
select throws_ok($$select public.testing_answer_save('15350000-0000-0000-0000-000000000010',3::smallint,'')$$,'42501','testing_membership_required','revoked membership cannot answer');
select * from finish();
rollback;
