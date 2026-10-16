-- Disposable local Supabase/PostgREST fixture only. Apply after migrations, once.

insert into private.clerk_issuers(issuer,authorized_parties,enabled) values('https://reconcile-probe.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values('40000000-0000-4000-8000-000000000001'),('40000000-0000-4000-8000-000000000002');
insert into public.account_identities(issuer,subject,account_id) values('https://reconcile-probe.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','40000000-0000-4000-8000-000000000001'),('https://reconcile-probe.clerk.invalid','user_bbbbbbbbbbbbbbbbbbbbbbbbbbb','40000000-0000-4000-8000-000000000002');
insert into public.billing_checkout_bindings(environment,provider_checkout_id,user_id,attempt_id,checkout_key,catalog_version) values('sandbox','probe-checkout-deleted','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','launch_lifetime','fixture'),('sandbox','probe-checkout-live','40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000004','launch_lifetime','fixture');
insert into public.billing_customers(user_id,provider,provider_customer_id,environment) values('40000000-0000-4000-8000-000000000001','polar','probe-customer-deleted','sandbox'),('40000000-0000-4000-8000-000000000002','polar','probe-customer-live','sandbox');
select public.apply_clerk_user_event('probe-reconcile-delete',repeat('e',64),'https://reconcile-probe.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','user.deleted',now(),null);
insert into private.clerk_issuers(issuer,authorized_parties,enabled) values('https://disputes-r5.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values('71000000-0000-4000-8000-000000000001'),('71000000-0000-4000-8000-000000000002');
insert into public.account_identities(issuer,subject,account_id) values('https://disputes-r5.clerk.invalid','user_deleted','71000000-0000-4000-8000-000000000001'),('https://disputes-r5.clerk.invalid','user_live','71000000-0000-4000-8000-000000000002');
select * from public.billing_record_order_snapshot('sandbox','dispute-order-deleted','71000000-0000-4000-8000-000000000001','product',null,'paid',true,100,'eur',0,now(),repeat('a',64));
select * from public.billing_record_order_snapshot('sandbox','dispute-order-live','71000000-0000-4000-8000-000000000002','product',null,'paid',true,100,'eur',0,now(),repeat('a',64));
select public.apply_clerk_user_event('disputes-r5-delete',repeat('a',64),'https://disputes-r5.clerk.invalid','user_deleted','user.deleted',now(),null);
