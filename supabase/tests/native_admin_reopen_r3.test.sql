begin; select no_plan();
insert into public.profiles(id) values('16270000-0000-4000-8000-000000000001'),('16270000-0000-4000-8000-000000000002');
insert into private.clerk_issuers(issuer,authorized_parties,enabled) values('https://clerk.admin.test',array['https://app.invalid'],true);
insert into public.account_identities(issuer,subject,account_id)
 select 'https://clerk.admin.test','user_'||replace(id::text,'-',''),id from public.profiles;
select * from public.operational_access_set('16270000-0000-4000-8000-000000000001','owner','grant','test:admin','Admin r3','test:r3',null);
insert into public.testing_contributions(id,account_id,channel,title,body,state) values('16270000-0000-4000-8000-000000000010','16270000-0000-4000-8000-000000000002','nightly','Informe heredado','Reproducción','accepted');
select public.native_admin_execute('16270000-0000-4000-8000-000000000001','https://clerk.admin.test','set_report_status','{"report_id":"16270000-0000-4000-8000-000000000010","status":"fixed","fixed_in_version":"1.2.3"}','sandbox');
select throws_ok($$select public.native_admin_execute('16270000-0000-4000-8000-000000000001','https://clerk.admin.test','set_report_status','{"report_id":"16270000-0000-4000-8000-000000000010","status":"in_review"}','sandbox')$$,'23505','testing_review_conflict','decisión histórica también es final');
set local request.jwt.claims='{"iss":"https://clerk.admin.test","sub":"user_16270000000040008000000000000002","role":"authenticated","sid":"sess_fixture","azp":"https://app.invalid"}';
select ok((public.testing_participation_current_v2('nightly')->'contributions'->0->>'fixed_version') ='1.2.3','reapertura denegada conserva versión visible al tester');
select ok(exists(select 1 from public.testing_report_followup where fixed_version='1.2.3' and reviewed_title is not null and reviewed_summary is not null),'reapertura denegada conserva metadatos revisados');
select * from finish(); rollback;
