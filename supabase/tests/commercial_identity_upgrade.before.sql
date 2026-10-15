-- State created through the schema/RPCs that preceded B03, not after cutover.
insert into public.profiles(id,email,display_name) values
 ('11111111-1111-4111-8111-111111111111','historical@example.invalid','Historical'),
 ('22222222-2222-4222-8222-222222222222','same@example.invalid','Same UUID'),
 ('33333333-3333-4333-8333-333333333333','other@example.invalid','Other issuer');
insert into public.account_identities(issuer,subject,account_id) values
 ('https://legacy.clerk.invalid/','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
 ('https://legacy.clerk.invalid','user_bbbbbbbbbbbbbbbbbbbbbbbbbbb','22222222-2222-4222-8222-222222222222'),
 ('https://legacy.clerk.invalid/','user_bbbbbbbbbbbbbbbbbbbbbbbbbbb','22222222-2222-4222-8222-222222222222'),
 ('https://other.clerk.invalid/','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','33333333-3333-4333-8333-333333333333');
select public.billing_record_order_snapshot('sandbox','historical-launch',
 '11111111-1111-4111-8111-111111111111','launch-product',null,'paid',true,3000,'eur',0,'2026-10-08T10:00Z',repeat('a',64));
select public.billing_sync_order_access('sandbox','historical-launch','["vantare.edition.launch_v1"]');
insert into storage.objects(bucket_id,name,owner_id)
 values('testing-center-evidence','historical-private.png','11111111-1111-4111-8111-111111111111');
do $$ begin
 if public.native_resolve_account('https://legacy.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa')<>'11111111-1111-4111-8111-111111111111'::uuid then
  raise exception 'fixture must preserve the UUID under the old resolver';
 end if;
end $$;
