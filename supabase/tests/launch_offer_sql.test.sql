begin;
select no_plan();
insert into public.profiles(id) values('1593eeee-0000-4000-8000-000000000001');
select ok(to_regprocedure('public.report_promotion_checkout(uuid,text,text,timestamptz,uuid,uuid)') is null,'P3-D legacy checkout entry is removed');
select throws_ok($$select public.billing_launch_checkout('1593eeee-0000-4000-8000-000000000001','sandbox','1593eeee-0000-4000-8000-000000000010','1593eeee-0000-4000-8000-000000000099','pro_monthly','2026-10-27','1593eeee-0000-4000-8000-000000000001')$$,'22023','launch_offer_not_allowed','P3-D unregistered coupon cannot grant a first period');
select is((select count(*)::int from private.report_promotion_launch_uses where account_id='1593eeee-0000-4000-8000-000000000001'),0,'P3-D rejection does not reserve or consume account entitlement');
select ok(not has_table_privilege('service_role','private.billing_launch_offers','insert,update,delete,select'),'API role cannot register or read coupons');
select ok(not has_function_privilege('service_role','private.billing_launch_checkout_before_1593_guard(uuid,text,text,text,text,timestamptz,uuid,uuid)','execute'),'API role cannot bypass SQL validation');
select ok(not has_function_privilege('authenticated','public.billing_launch_checkout(uuid,text,text,text,text,timestamptz,uuid,uuid)','execute'),'checkout guard is server-only');
select ok((select relrowsecurity from pg_class where oid='private.billing_launch_offers'::regclass),'registry has RLS');
select is((select proowner from pg_proc where oid='public.billing_launch_checkout(uuid,text,text,text,text,timestamptz,uuid,uuid)'::regprocedure),'postgres'::regrole::oid,'guard has explicit owner');
insert into private.billing_launch_offers(environment,checkout_key,product_id,discount_id,starts_at,ends_at,catalog_version)
select environment,checkout_key,('1593eeee-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('1593eeee-0000-4000-8000-'||lpad((n+1)::text,12,'0'))::uuid,
 '2026-10-26 19:00 Europe/Madrid','2026-11-26 19:00 Europe/Madrid','fixture'
from (values('sandbox','pro_monthly',10),('sandbox','pro_plus_monthly',20),('sandbox','pro_annual',30),('sandbox','pro_plus_annual',40))x(environment,checkout_key,n);
create function pg_temp.checkout(product text default '1593eeee-0000-4000-8000-000000000010',discount text default '1593eeee-0000-4000-8000-000000000011',key text default 'pro_monthly',environment text default 'sandbox',now_at timestamptz default '2026-10-27') returns text language sql as $$
select public.billing_launch_checkout('1593eeee-0000-4000-8000-000000000001',environment,product,discount,key,now_at,'1593eeee-0000-4000-8000-000000000001')
$$;
select throws_ok($$select pg_temp.checkout(discount=>'1593eeee-0000-4000-8000-000000000099')$$,'22023','launch_offer_not_allowed','P3-D rejects arbitrary/creator/report coupon');
select throws_ok($$select pg_temp.checkout(discount=>'1593eeee-0000-4000-8000-000000000021')$$,'22023','launch_offer_not_allowed','P3-D rejects other plan coupon');
select throws_ok($$select pg_temp.checkout(product=>'1593eeee-0000-4000-8000-000000000020')$$,'22023','launch_offer_not_allowed','P3-D rejects other product');
select throws_ok($$select pg_temp.checkout(key=>'pro_annual')$$,'22023','launch_offer_not_allowed','P3-D rejects wrong checkout key');
select throws_ok($$select pg_temp.checkout(environment=>'production')$$,'22023','launch_offer_not_allowed','P3-D rejects wrong environment');
select throws_ok($$select pg_temp.checkout(environment=>null)$$,'22023','launch_offer_not_allowed','P3-D rejects missing environment');
select throws_ok($$select pg_temp.checkout(key=>null)$$,'22023','launch_offer_not_allowed','P3-D rejects missing key');
select throws_ok($$select pg_temp.checkout(discount=>null)$$,'22023','launch_offer_not_allowed','P3-D rejects missing coupon');
select throws_ok($$select pg_temp.checkout(product=>null)$$,'22023','launch_offer_not_allowed','P3-D rejects missing product');
select throws_ok($$select pg_temp.checkout(discount=>'not-uuid')$$,'22023','launch_offer_not_allowed','P3-D rejects malformed coupon');
select throws_ok($$select pg_temp.checkout(now_at=>'infinity')$$,'22023','launch_offer_not_allowed','P3-D rejects infinite clock');
select throws_ok($$select pg_temp.checkout(now_at=>null)$$,'22023','launch_offer_not_allowed','P3-D rejects missing clock');
select is((select count(*)::int from private.report_promotion_launch_uses where account_id='1593eeee-0000-4000-8000-000000000001'),0,'all invalid bindings leave account right untouched');
select is(pg_temp.checkout(now_at=>'2026-10-26 18:59:59 Europe/Madrid'),null::text,'opening minus second excluded');
select is(pg_temp.checkout(now_at=>'2026-11-26 19:00 Europe/Madrid'),null::text,'closing exclusive');
select is(pg_temp.checkout(now_at=>'2026-10-26 19:00 Europe/Madrid'),'1593eeee-0000-4000-8000-000000000011','registered once at inclusive opening');
select is(pg_temp.checkout(now_at=>'2026-10-26 19:00 Europe/Madrid'),'1593eeee-0000-4000-8000-000000000011','retry same attempt idempotent');
select is((select count(*)::int from private.report_promotion_launch_uses where account_id='1593eeee-0000-4000-8000-000000000001'),1,'one account reservation after retry');
insert into public.profiles(id) values('1593eeee-0000-4000-8000-000000000020');
select is(public.billing_launch_checkout('1593eeee-0000-4000-8000-000000000020','sandbox','1593eeee-0000-4000-8000-000000000020','1593eeee-0000-4000-8000-000000000021','pro_plus_monthly','2026-11-25 19:00 Europe/Madrid','1593eeee-0000-4000-8000-000000000020'),'1593eeee-0000-4000-8000-000000000021','P3-D approved pro_plus_monthly late-month first period');
insert into public.profiles(id) values('1593eeee-0000-4000-8000-000000000030');
select is(public.billing_launch_checkout('1593eeee-0000-4000-8000-000000000030','sandbox','1593eeee-0000-4000-8000-000000000030','1593eeee-0000-4000-8000-000000000031','pro_annual','2026-11-25 19:00 Europe/Madrid','1593eeee-0000-4000-8000-000000000030'),'1593eeee-0000-4000-8000-000000000031','P3-D approved pro_annual late-month first period');
insert into public.profiles(id) values('1593eeee-0000-4000-8000-000000000040');
select is(public.billing_launch_checkout('1593eeee-0000-4000-8000-000000000040','sandbox','1593eeee-0000-4000-8000-000000000040','1593eeee-0000-4000-8000-000000000041','pro_plus_annual','2026-11-25 19:00 Europe/Madrid','1593eeee-0000-4000-8000-000000000040'),'1593eeee-0000-4000-8000-000000000041','P3-D approved pro_plus_annual late-month first period');
select * from finish();
rollback;
