-- Exact #1602 review RPC + follow-up. Fixing must not free acceptance budget.
begin;
select plan(8);
insert into public.profiles(id) values
 ('16100000-0000-0000-0000-000000000001'),('16100000-0000-0000-0000-000000000002'),('16100000-0000-0000-0000-000000000003');
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
set local request.jwt.claim.sub='16100000-0000-0000-0000-000000000001';
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
