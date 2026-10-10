-- Run against LOCAL Supabase after the migration. Never production fixtures.
begin;
select plan(14);
insert into auth.users(id) values
 ('15350000-0000-0000-0000-000000000001'), ('15350000-0000-0000-0000-000000000002');
insert into public.testing_center_memberships(user_id,actor_id,role) values
 ('15350000-0000-0000-0000-000000000001','1535-a','primary_tester'),
 ('15350000-0000-0000-0000-000000000002','1535-b','tester');
insert into public.testing_questionnaires(id,version,channel,title,question,published) values
 ('15350000-0000-0000-0000-000000000010','1.2.3','testers','Experiencia','¿Cómo funciona?',true),
 ('15350000-0000-0000-0000-000000000011','1.2.3','nightly','Nightly','¿Cómo funciona?',true),
 ('15350000-0000-0000-0000-000000000012','1.2.3','testers','Borrador','¿Cómo funciona?',false);
set local role authenticated;
set local request.jwt.claim.sub = '15350000-0000-0000-0000-000000000001';
select lives_ok($$select public.testing_answer_save('15350000-0000-0000-0000-000000000010',4::smallint,'Bien')$$,'account A can answer');
select lives_ok($$select public.testing_answer_save('15350000-0000-0000-0000-000000000010',5::smallint,'Actualizado')$$,'retry updates answer');
select is((select count(*)::integer from public.testing_answers),1,'no duplicate answer');
select is((select score::integer from public.testing_answers),5,'updated score persisted');
select throws_ok($$select public.testing_answer_save('15350000-0000-0000-0000-000000000012',4::smallint,'')$$,'42501','testing_membership_required','unpublished questionnaire denied');
select lives_ok($$select public.testing_contribution_submit('15350000-0000-0000-0000-000000000020','testers','Propuesta','Texto')$$,'contribution accepted');
select lives_ok($$select public.testing_contribution_submit('15350000-0000-0000-0000-000000000020','testers','Propuesta','Texto')$$,'identical retry accepted');
select is((select count(*)::integer from public.testing_contributions),1,'no duplicate contribution');
select throws_ok($$select public.testing_contribution_submit('15350000-0000-0000-0000-000000000020','testers','Otro','Texto')$$,'23505','testing_contribution_conflict','changed retry rejected');
set local request.jwt.claim.sub = '15350000-0000-0000-0000-000000000002';
select is((select count(*)::integer from public.testing_answers),0,'B cannot read A answers');
select is((select count(*)::integer from public.testing_contributions),0,'B cannot read A contributions');
select throws_ok($$select public.testing_answer_save('15350000-0000-0000-0000-000000000011',3::smallint,'')$$,'42501','testing_membership_required','tester cannot answer nightly');
select throws_ok($$insert into public.testing_answers values('15350000-0000-0000-0000-000000000010','15350000-0000-0000-0000-000000000002',3,'',now())$$,'42501',null,'direct writes denied');
set local role anon;
select throws_ok($$select * from public.testing_answers$$,'42501',null,'anon denied');
select * from finish();
rollback;
