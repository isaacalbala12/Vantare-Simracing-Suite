-- Exact #1602 review RPC + follow-up. Fixing must not free acceptance budget.
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

select plan(8);
insert into public.profiles(id) values
 ('16100000-0000-0000-0000-000000000001'),('16100000-0000-0000-0000-000000000002'),('16100000-0000-0000-0000-000000000003');
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

insert into public.testing_center_memberships(user_id,actor_id,role)
 values('16100000-0000-0000-0000-000000000001','owner-f3','owner');
insert into public.testing_contributions(id,account_id,channel,title,body) values
 ('16100000-0000-0000-0000-000000000011','16100000-0000-0000-0000-000000000002','nightly','Daily A','Synthetic'),
 ('16100000-0000-0000-0000-000000000012','16100000-0000-0000-0000-000000000002','nightly','Daily B','Synthetic'),
 ('16100000-0000-0000-0000-000000000021','16100000-0000-0000-0000-000000000003','nightly','Weekly A','Synthetic'),
 ('16100000-0000-0000-0000-000000000022','16100000-0000-0000-0000-000000000003','nightly','Weekly B','Synthetic'),
 ('16100000-0000-0000-0000-000000000023','16100000-0000-0000-0000-000000000003','nightly','Weekly C','Synthetic');
update public.testing_contributions set created_at='2026-10-12 12:00Z' where id in
 ('16100000-0000-0000-0000-000000000011','16100000-0000-0000-0000-000000000012','16100000-0000-0000-0000-000000000021');
update public.testing_contributions set created_at='2026-10-13 12:00Z' where id='16100000-0000-0000-0000-000000000022';
update public.testing_contributions set created_at='2026-10-14 12:00Z' where id='16100000-0000-0000-0000-000000000023';
create function pg_temp.proposal() returns jsonb language sql as $$select
 '{"schema":"vantare.triage.v2","verdict":"valido","criteria":{"contenido_minimo":"si","evidencia":"si","no_duplicado":"si"},"duplicate_of":null,"severity":"media","area":"testing-center","evidence_refs":[],"summary":"Synthetic","preliminary_fix":null,"confidence":0.8,"reasons":[],"trazable":"si"}'::jsonb$$;
set local role authenticated;
select pg_temp.fixture_claims('16100000-0000-0000-0000-000000000001');
select lives_ok($$select public.testing_contribution_review('16100000-0000-0000-0000-000000000011','accepted','Human review',pg_temp.proposal());
 select public.testing_report_fixed('16100000-0000-0000-0000-000000000011','1.2.3','Reviewed','Summary')$$,'accept A then fix A');
select throws_ok($$select public.testing_contribution_review('16100000-0000-0000-0000-000000000012','accepted','Human review',pg_temp.proposal())$$,'23514',null,'fixed A still consumes daily acceptance');
select is((select state from public.testing_contributions where id='16100000-0000-0000-0000-000000000012'),'received','daily rejection preserves state');
select is((select count(*)::integer from public.testing_contribution_reviews where contribution_id='16100000-0000-0000-0000-000000000012'),0,'daily rejection leaves no review');
select lives_ok($$select public.testing_contribution_review('16100000-0000-0000-0000-000000000021','accepted','Human review',pg_temp.proposal());
 select public.testing_report_fixed('16100000-0000-0000-0000-000000000021','1.2.3','Reviewed','Summary');
 select public.testing_contribution_review('16100000-0000-0000-0000-000000000022','accepted','Human review',pg_temp.proposal());
 select public.testing_report_fixed('16100000-0000-0000-0000-000000000022','1.2.3','Reviewed','Summary')$$,'two acceptances on different UTC days then fixes');
select throws_ok($$select public.testing_contribution_review('16100000-0000-0000-0000-000000000023','accepted','Human review',pg_temp.proposal())$$,'23514',null,'two fixed reports still consume weekly acceptance');
select is((select state from public.testing_contributions where id='16100000-0000-0000-0000-000000000023'),'received','weekly rejection preserves state');
select is((select count(*)::integer from public.testing_contribution_reviews where contribution_id='16100000-0000-0000-0000-000000000023'),0,'weekly rejection leaves no review');
select * from finish();
rollback;
