-- Run over exact #1602 SQL: permissive owner RLS must not widen personal history.
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

select plan(6);
insert into public.profiles(id) values
 ('16100000-0000-0000-0000-000000000001'),('16100000-0000-0000-0000-000000000002');
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
 values('16100000-0000-0000-0000-000000000001','owner-f2','owner');
insert into public.testing_contributions(id,account_id,channel,title,body,state) values
 ('16100000-0000-0000-0000-000000000011','16100000-0000-0000-0000-000000000001','nightly','Own','Synthetic','received'),
 ('16100000-0000-0000-0000-000000000012','16100000-0000-0000-0000-000000000002','nightly','Other accepted','Synthetic','accepted'),
 ('16100000-0000-0000-0000-000000000013','16100000-0000-0000-0000-000000000002','nightly','Other fixed','Synthetic','accepted');
select pg_temp.fixture_claims('16100000-0000-0000-0000-000000000001');
set local role authenticated;
select public.testing_report_fixed('16100000-0000-0000-0000-000000000013','1.2.3','Reviewed','Summary');
select is((select count(*)::integer from public.testing_contributions),3,'owner administration still sees all reports');
select is(jsonb_array_length(public.testing_participation_current_v2('nightly')->'contributions'),1,'personal history excludes other accepted/fixed reports');
select is(public.testing_participation_current_v2('nightly')->'contributions'->0->>'id','16100000-0000-0000-0000-000000000011','personal report survives');
select ok(not exists(select 1 from jsonb_array_elements(public.testing_participation_current_v2('nightly')->'contributions') r
 where r->>'state'='fixed' and r->>'fixed_version' is null),'history cannot contain alien fixed DTO without version');
reset role;
-- More than a page of other reports must not displace the owner's report.
do $$declare item uuid; begin for i in 1..21 loop
 item:=gen_random_uuid();
 insert into public.testing_contributions(id,account_id,channel,title,body)
 values(item,'16100000-0000-0000-0000-000000000002','nightly','Other','Synthetic');
 update public.testing_contributions set created_at=clock_timestamp()-interval '8 days' where id=item;
end loop; end$$;
update public.testing_contributions set created_at=clock_timestamp()-interval '20 days'
 where id='16100000-0000-0000-0000-000000000011';
set local role authenticated;
select is(jsonb_array_length(public.testing_participation_current_v2('nightly')->'contributions'),1,'global page cannot displace own report');
select is(public.testing_participation_current_v2('nightly')->'contributions'->0->>'id','16100000-0000-0000-0000-000000000011','own report remains on personal page');
select * from finish();
rollback;
