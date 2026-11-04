-- #1910 step 8d: opening the owner panel must not perform queue maintenance.
begin;
select no_plan();
insert into public.profiles(id) values
 ('19100840-0000-4000-8000-000000000001'),('19100840-0000-4000-8000-000000000002');
select * from public.operational_access_set('19100840-0000-4000-8000-000000000001','owner','grant','fixture','Mail read owner','mail-read-owner',null);
select public.mail_record_consent(null,'read-only@example.invalid','es',true,'verified_waitlist',true);
select public.mail_forget_waitlist('read-only@example.invalid');
update private.mail_contact_erasures set created_at=now()-interval '25 hours' where email='read-only@example.invalid';
create temporary table queue_before as select * from private.mail_contact_erasures;
create temporary table audit_before as select * from private.mail_audit;
create temporary table panel as select public.mail_admin_execute('19100840-0000-4000-8000-000000000001','mail_list','{}','sandbox') data;
select results_eq('select * from private.mail_contact_erasures order by id','select * from queue_before order by id','mail_list preserves every queue field, including expired jobs');
select results_eq('select * from private.mail_audit where action<>''mail_list'' order by id','select * from audit_before where action<>''mail_list'' order by id','mail_list creates no maintenance audit events');
select is((select (data->'cleanup'->>'pending')::integer from panel),1,'panel reports pending state without expiring it');
select is(public.mail_erasure_expire(),1,'explicit maintenance still expires the aged job');
select is((select state from private.mail_contact_erasures where id=(select id from queue_before)),'failed','maintenance leaves the unresolved obligation visible');
select is((select email from private.mail_contact_erasures where id=(select id from queue_before)),null,'maintenance still redacts the temporary address');
select is(public.mail_erasure_expire(),0,'maintenance remains idempotent');
select throws_ok($$select public.mail_admin_execute('19100840-0000-4000-8000-000000000002','mail_list','{}','sandbox')$$,'42501','native_admin_forbidden','non-owner cannot read the panel');
update public.operational_access_assignments set granted_at=now()-interval '2 days',expires_at=now()-interval '1 day' where user_id='19100840-0000-4000-8000-000000000001';
select throws_ok($$select public.mail_admin_execute('19100840-0000-4000-8000-000000000001','mail_list','{}','sandbox')$$,'42501','native_admin_forbidden','expired owner cannot read the panel');
select ok(not has_function_privilege('anon','public.mail_admin_execute(uuid,text,jsonb,text)','EXECUTE') and not has_function_privilege('authenticated','public.mail_admin_execute(uuid,text,jsonb,text)','EXECUTE'),'panel RPC remains service only');
select * from finish();
rollback;
