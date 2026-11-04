begin;
select no_plan();
insert into public.profiles(id) values
 ('19104600-0000-4000-8000-000000000001'),
 ('19104600-0000-4000-8000-000000000002'),
 ('19104600-0000-4000-8000-000000000003');
select * from public.operational_access_set('19104600-0000-4000-8000-000000000001','owner','grant','test:ack','Owner ACK fixture','ack-actor',null);
select * from public.operational_access_set('19104600-0000-4000-8000-000000000002','owner','grant','test:ack','Owner ACK fixture','ack-target',null);
create function pg_temp.tester_ack(target uuid, enabled boolean) returns jsonb language sql as $$
 select public.native_admin_execute('19104600-0000-4000-8000-000000000001','https://ack.invalid',
 'set_tester',jsonb_build_object('account_id',target,'enabled',enabled),'sandbox')
$$;
select is(pg_temp.tester_ack('19104600-0000-4000-8000-000000000002',true),
 '{"account_id":"19104600-0000-4000-8000-000000000002","owner":true,"unchanged":true}'::jsonb,
 'owner enable returns explicit unchanged, without enabled');
select is(pg_temp.tester_ack('19104600-0000-4000-8000-000000000002',false),
 '{"account_id":"19104600-0000-4000-8000-000000000002","owner":true,"unchanged":true}'::jsonb,
 'owner disable returns explicit unchanged, without enabled');
select is(pg_temp.tester_ack('19104600-0000-4000-8000-000000000003',true),
 '{"account_id":"19104600-0000-4000-8000-000000000003","enabled":true}'::jsonb,'ordinary tester enable ACK unchanged');
select is(pg_temp.tester_ack('19104600-0000-4000-8000-000000000003',false),
 '{"account_id":"19104600-0000-4000-8000-000000000003","enabled":false}'::jsonb,'ordinary tester revoke ACK unchanged');
select * from finish();
rollback;
