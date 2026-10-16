begin;
select no_plan();
insert into public.profiles(id) values('16275000-0000-4000-8000-000000000001'),('16275000-0000-4000-8000-000000000002'),('16275000-0000-4000-8000-000000000003');
select * from public.operational_access_set('16275000-0000-4000-8000-000000000001','owner','grant','test:r5','Ronda 5','test:r5');
insert into public.testing_center_reports(report_id,reporter_id,reporter_user_id,reporter_role,channel,state)
 values('r5-legacy','fixture','16275000-0000-4000-8000-000000000002','tester','nightly','submitted');
create function pg_temp.change(s text) returns jsonb language sql as $$
 select public.native_admin_execute('16275000-0000-4000-8000-000000000001','https://clerk.admin.test','set_report_status',jsonb_build_object('report_id','r5-legacy','status',s,'reason','Motivo conservado','fixed_in_version','1.2.3'),'sandbox') $$;
select lives_ok($$select pg_temp.change('spam')$$,'spam antiguo admitido');
select is((select reject_reason from public.testing_center_reports where report_id='r5-legacy'),'Motivo conservado','spam antiguo conserva motivo');
select throws_ok(format('select pg_temp.change(%L)',s),'23505','testing_review_conflict','decisión antigua final: '||s) from unnest(array['submitted','in_review','validated','rejected','spam'])s;
update public.testing_center_reports set state='validated' where report_id='r5-legacy';
select lives_ok($$select pg_temp.change('fixed')$$,'aceptado antiguo admite arreglo');
select lives_ok($$select pg_temp.change('fixed')$$,'arreglo antiguo admite corregir versión');
-- Every legacy final state rejects a new decision or reopening.
create function pg_temp.final(s text) returns text language plpgsql as $fn$begin
 update public.testing_center_reports set state=s where report_id='r5-legacy';
 return throws_ok($$select pg_temp.change('in_review')$$,'23505','testing_review_conflict','estado antiguo final: '||s);
end $fn$;
select pg_temp.final(s)
 from unnest(array['validated','rejected','spam','fixed','closed','duplicate_linked','incomplete'])s;
insert into public.testing_contributions(id,account_id,channel,title,body)
 values('16275000-0000-4000-8000-000000000010','16275000-0000-4000-8000-000000000002','nightly','Guarda de dueño','Sintético');
-- Simulate a changed owner exactly at the real lock boundary; keep real locks.
alter function private.lock_account_write(uuid) rename to r5_original_lock;
create function private.lock_account_write(p_id uuid) returns boolean language plpgsql as $$
declare erased boolean;
begin
 erased:=private.r5_original_lock(p_id);
 if p_id='16275000-0000-4000-8000-000000000002' then
 alter table public.testing_center_reports disable trigger a_account_write_barrier;
 update public.testing_center_reports set reporter_user_id='16275000-0000-4000-8000-000000000003' where report_id='r5-legacy';
 alter table public.testing_center_reports enable trigger a_account_write_barrier;
 alter table public.testing_contributions disable trigger a_account_write_barrier;
 update public.testing_contributions set account_id='16275000-0000-4000-8000-000000000003' where id='16275000-0000-4000-8000-000000000010';
 alter table public.testing_contributions enable trigger a_account_write_barrier;
 end if;
 return erased;
end $$;
select throws_ok($$select public.native_admin_execute('16275000-0000-4000-8000-000000000001','https://clerk.admin.test','get_report','{"report_id":"r5-legacy"}','sandbox')$$,'40001','admin_report_owner_changed','dispatcher relee dueño bajo lock y aborta');
select throws_ok(format('select public.native_admin_execute(%L,%L,%L,jsonb_build_object(''report_id'',%L,''status'',''in_review''),''sandbox'')',
 '16275000-0000-4000-8000-000000000001','https://clerk.admin.test',a,r),'40001','admin_report_owner_changed','guarda de dueño: '||a||' '||r)
 from unnest(array['get_report','set_report_status'])a cross join unnest(array['r5-legacy','16275000-0000-4000-8000-000000000010'])r;
select * from finish(); rollback;
