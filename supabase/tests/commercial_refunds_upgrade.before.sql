-- Real old RPCs: all state exists before B03/B01/B02. The old policy leaves
-- partial/pending/aggregate sources active, which the cutover must convert.
insert into public.profiles(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333'),
 ('44444444-4444-4444-8444-444444444444'),
 ('55555555-5555-4555-8555-555555555555');
insert into public.account_identities(issuer,subject,account_id)
 values('https://refund.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
do $$
declare r record;
begin
 for r in select * from (values
  ('sandbox','historical-partial','11111111-1111-4111-8111-111111111111','paid',0,'succeeded'),
  ('sandbox','historical-pending','22222222-2222-4222-8222-222222222222','paid',0,'pending'),
  ('sandbox','historical-aggregate','33333333-3333-4333-8333-333333333333','partially_refunded',1000,null),
  ('sandbox','historical-failed','44444444-4444-4444-8444-444444444444','paid',0,'failed'),
  ('sandbox','historical-canceled','44444444-4444-4444-8444-444444444444','paid',0,'canceled'),
  ('sandbox','shared-order','55555555-5555-4555-8555-555555555555','paid',0,'pending'),
  ('production','shared-order','55555555-5555-4555-8555-555555555555','paid',0,null),
  ('sandbox','independent-launch','55555555-5555-4555-8555-555555555555','paid',0,null)
 ) as cases(environment,order_id,user_id,status,aggregate_amount,refund_status)
 loop
  perform public.billing_record_order_snapshot(r.environment,r.order_id,r.user_id::uuid,'launch-product',null,
   r.status,true,3000,'eur',r.aggregate_amount,'2026-10-08T10:00Z',repeat('a',64));
  if r.refund_status is not null then
   perform public.billing_record_refund_snapshot(r.environment,'refund-'||r.order_id,r.order_id,'old-payment-'||r.order_id,
    r.refund_status,1000,'eur','2026-10-08T10:01Z',repeat('b',64));
  end if;
  perform public.billing_sync_order_access(r.environment,r.order_id,'["vantare.edition.launch_v1"]');
 end loop;
 if (select count(*) from public.billing_access_grants where status='active')<>8 then
  raise exception 'old policy must leave all eight sources active';
 end if;
end $$;
-- Another legitimate subscription belongs to the mixed account; do not infer
-- subscription attribution from a UUID/product or a coincident source ID.
insert into public.billing_access_grants(user_id,provider,environment,source_type,source_id,capability,status,valid_until,resource_modified_at,snapshot_hash)
 values('55555555-5555-4555-8555-555555555555','polar','sandbox','subscription','independent-sub',
 'vantare.plan.pro','active',now()+interval '30 days','2026-10-08T10:00Z',repeat('c',64));
select public.billing_refresh_entitlement_read_model('55555555-5555-4555-8555-555555555555');
