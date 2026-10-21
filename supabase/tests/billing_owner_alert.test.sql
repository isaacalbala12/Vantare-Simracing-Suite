begin;
select plan(27);
select ok((select relrowsecurity from pg_class where oid='private.billing_owner_alert_inbox'::regclass),'private inbox has RLS');
select ok(not has_table_privilege('anon','private.billing_owner_alert_inbox','select,insert,update,delete'),'anon cannot access inbox');
select ok(not has_table_privilege('authenticated','private.billing_owner_alert_inbox','select,insert,update,delete'),'authenticated cannot access inbox');
select ok(not has_table_privilege('service_role','private.billing_owner_alert_inbox','select,insert,update,delete'),'server cannot bypass bounded RPCs');
select ok(not has_function_privilege('anon','public.billing_owner_alert_claim(text,text,text,text,uuid)','execute'),'anon cannot claim');
select ok(not has_function_privilege('authenticated','public.billing_owner_alert_finish(text,text,text,uuid,boolean)','execute'),'authenticated cannot ACK');
set local role service_role;
select is(public.billing_owner_alert_claim('sandbox','checkout_review',repeat('a',64),'first_code','17250000-0000-4000-8000-000000000001')->>'state','claimed','server claims durable alert');
select is(public.billing_owner_alert_claim('sandbox','checkout_review',repeat('a',64),'changed_code','17250000-0000-4000-8000-000000000002')->>'state','busy','duplicate lease cannot send concurrently');
select ok(not public.billing_owner_alert_finish('sandbox','checkout_review',repeat('a',64),'17250000-0000-4000-8000-000000000002',true),'stale owner cannot ACK');
select ok(public.billing_owner_alert_finish('sandbox','checkout_review',repeat('a',64),'17250000-0000-4000-8000-000000000001',false),'failed email releases claim');
select is(public.billing_owner_alert_claim('sandbox','checkout_review',repeat('a',64),'changed_code','17250000-0000-4000-8000-000000000002')->>'code','first_code','retry keeps original durable code');
select ok(public.billing_owner_alert_finish('sandbox','checkout_review',repeat('a',64),'17250000-0000-4000-8000-000000000002',true),'accepted email is committed before HTTP ACK');
select is(public.billing_owner_alert_claim('sandbox','checkout_review',repeat('a',64),'first_code','17250000-0000-4000-8000-000000000003')->>'state','sent','lost HTTP ACK does not resend');
select is(public.billing_owner_alert_claim('production','checkout_review',repeat('a',64),'first_code','17250000-0000-4000-8000-000000000003')->>'state','claimed','environments are independent');
select is(public.billing_owner_alert_claim('sandbox','checkout_refund_failed',repeat('a',64),'first_code','17250000-0000-4000-8000-000000000003')->>'state','claimed','different types sharing correlation hash are independent');
reset role;
select is((select count(*)::integer from private.billing_owner_alert_inbox),3,'only unique operational alerts persisted');
select is((select attempts from private.billing_owner_alert_inbox where environment='sandbox' and alert_type='checkout_review'),2,'only actual email claims increment attempts');
select ok((select sent_at is not null and lease_token is null from private.billing_owner_alert_inbox where environment='sandbox' and alert_type='checkout_review'),'successful ACK is durable and releases lease');
update private.billing_owner_alert_inbox set lease_expires_at=clock_timestamp()-interval '1 second' where environment='production';
set local role service_role;
select ok(not public.billing_owner_alert_finish('production','checkout_review',repeat('a',64),'17250000-0000-4000-8000-000000000003',true),'expired worker cannot ACK');
select is(public.billing_owner_alert_claim('production','checkout_review',repeat('a',64),'first_code','17250000-0000-4000-8000-000000000004')->>'state','claimed','crashed worker lease can be reclaimed');
reset role;
update private.billing_owner_alert_inbox set sent_at=clock_timestamp()-interval '31 days'
 where environment='sandbox' and alert_type='checkout_review';
update private.billing_owner_alert_inbox set received_at=clock_timestamp()-interval '31 days'
 where environment='sandbox' and alert_type='checkout_refund_failed';
set local role service_role;
select is(public.billing_owner_alert_claim('production','checkout_review',repeat('b',64),'first_code','17250000-0000-4000-8000-000000000005')->>'state','claimed','normal claim performs bounded retention');
reset role;
select is((select count(*)::integer from private.billing_owner_alert_inbox where environment='sandbox' and alert_type='checkout_review'),0,'sent alerts older than thirty days are purged');
select is((select count(*)::integer from private.billing_owner_alert_inbox where environment='sandbox' and alert_type='checkout_refund_failed'),1,'old pending alerts are never purged');
set local role service_role;
select is(public.billing_owner_alert_claim('sandbox','checkout_review',repeat('c',64),'429_refund_unavailable','17250000-0000-4000-8000-000000000006')->>'code','429_refund_unavailable','digit-leading codes match emitter contract');
select is(public.billing_owner_alert_claim('sandbox','checkout_review',repeat('d',64),'_refund_unavailable','17250000-0000-4000-8000-000000000007')->>'code','_refund_unavailable','underscore-leading codes match emitter contract');
reset role;
insert into private.billing_checkout_compensations(environment,order_id,checkout_id,organization_id,product_id,net_amount,currency,capabilities,
  attempt_count,last_error_code,alert_pending,alert_next_at)
values('sandbox','17250000-0000-4000-8000-000000000010','17250000-0000-4000-8000-000000000011',
  '17250000-0000-4000-8000-000000000012','17250000-0000-4000-8000-000000000013',100,'eur',array['pro'],
  3,'429_refund_unavailable',true,now());
set local role service_role;
select is((select (a->>'attempt_count')::integer from jsonb_array_elements(public.billing_operational_owner_alerts('sandbox')) a where a->>'order_id'='17250000-0000-4000-8000-000000000010'),3,'operational outbox exposes refund attempt for incident identity');
select public.billing_finish_operational_owner_alert('sandbox','17250000-0000-4000-8000-000000000010','checkout_refund_failed',false);
reset role;
update private.billing_checkout_compensations set alert_next_at=now() where order_id='17250000-0000-4000-8000-000000000010';
set local role service_role;
select is((select (a->>'attempt_count')::integer from jsonb_array_elements(public.billing_operational_owner_alerts('sandbox')) a where a->>'order_id'='17250000-0000-4000-8000-000000000010'),3,'email delivery retry preserves incident attempt');
reset role;
select * from finish();
rollback;
