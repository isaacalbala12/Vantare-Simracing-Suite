begin; select no_plan();
insert into public.profiles(id) values('16270000-0000-4000-8000-000000000001');
select * from public.operational_access_set('16270000-0000-4000-8000-000000000001','owner','grant','test:admin','Admin r3','test:r3',null);
insert into public.profiles(id) select md5('scale-account-'||n)::uuid from generate_series(1,3000)n;
insert into public.account_identities(issuer,subject,account_id) select 'https://clerk.admin.test','synthetic-'||n,md5('scale-account-'||n)::uuid from generate_series(1,3000)n;
insert into private.admin_creators(creator_id,environment,name,email,code,status,discount_id) select md5('scale-creator-'||n)::uuid,'sandbox','Creador '||n,'synthetic@example.invalid','CODE'||n,'active','discount-'||n from generate_series(1,100)n;
insert into private.admin_payments(environment,payment_id,account_id,subscription_id,product,paid_at,amount_cents,currency,discount_id,modified_at)
select 'sandbox','payment-'||n||'-'||k,md5('scale-account-'||n)::uuid,'sub-'||n,'Pro mensual',timestamptz '2025-10-01Z'+make_interval(months=>k-1),319,'eur','discount-'||(1+n%100),now() from generate_series(1,3000)n cross join generate_series(1,12)k;
insert into private.admin_payment_history select 'sandbox',md5('scale-account-'||n)::uuid from generate_series(1,3000)n;
analyze private.admin_payments; analyze private.admin_creators; analyze public.profiles; analyze public.account_identities;
set local statement_timeout='6s';
create temporary table measurements(action text,elapsed_ms numeric,result jsonb);
do $$declare t timestamptz; r jsonb; begin
 t:=clock_timestamp(); r:=public.native_admin_execute('16270000-0000-4000-8000-000000000001','https://clerk.admin.test','search_accounts','{"query":"","limit":50}','sandbox');
 insert into measurements values('search_accounts',extract(epoch from clock_timestamp()-t)*1000,r);
 t:=clock_timestamp(); r:=public.native_admin_execute('16270000-0000-4000-8000-000000000001','https://clerk.admin.test','list_creators','{}','sandbox');
 insert into measurements values('list_creators',extract(epoch from clock_timestamp()-t)*1000,r);
end $$;
select is((select jsonb_array_length(result->'accounts') from measurements where action='search_accounts'),50,'3000 cuentas: página conserva límite');
select is((select result->'counts'->>'all' from measurements where action='search_accounts'),'3000','recuento global exacto');
select is((select jsonb_array_length(result->'creators') from measurements where action='list_creators'),100,'36000 pagos: lista incluye 100 creadores');
select ok(elapsed_ms<6000,action||' 3000 cuentas/36000 pagos/100 creadores: '||round(elapsed_ms,1)||' ms < 6000 ms') from measurements;
select * from finish(); rollback;
