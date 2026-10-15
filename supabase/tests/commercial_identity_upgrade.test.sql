begin;
select plan(18);
insert into private.clerk_issuers(issuer,authorized_parties,enabled) values
 ('https://legacy.clerk.invalid',array['https://app.invalid'],true),
 ('https://other.clerk.invalid',array['https://app.invalid'],true);
select is(public.native_resolve_account('https://legacy.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa'),
 '11111111-1111-4111-8111-111111111111'::uuid,'upgrade preserves slash-only historical UUID');
select is(public.native_resolve_account('https://legacy.clerk.invalid','user_bbbbbbbbbbbbbbbbbbbbbbbbbbb'),
 '22222222-2222-4222-8222-222222222222'::uuid,'equal aliases preserve their UUID');
select is(public.native_resolve_account('https://other.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa'),
 '33333333-3333-4333-8333-333333333333'::uuid,'same subject on another issuer stays separate');
select is((select count(*)::int from public.profiles),3,'cutover/bootstrap creates no replacement profile');
select is((select count(*)::int from public.account_identities where issuer like '%/'),3,'historical alias rows retained');
set local role authenticated;
select set_config('request.jwt.claims','{"iss":"https://legacy.clerk.invalid","sub":"user_aaaaaaaaaaaaaaaaaaaaaaaaaaa","sid":"sess_old","azp":"https://app.invalid","role":"authenticated"}',true);
select is(private.current_account(),'11111111-1111-4111-8111-111111111111'::uuid,'canonical session resolves historical UUID');
select is((select email from public.profiles),'historical@example.invalid','historical profile remains visible to its owner');
select ok(coalesce((select 'bundle'=any(entitlements) from public.read_account_entitlements()),false),
 'historical purchase still belongs to the session');
reset role;
select is(public.apply_clerk_user_event('delete-historical',repeat('d',64),'https://legacy.clerk.invalid',
 'user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','user.deleted',now(),null),'applied','canonical deletion applies to original UUID');
select is((select count(*)::int from public.account_identities where account_id='11111111-1111-4111-8111-111111111111' and deleted_at is null),
 0,'canonical and historical alias both tombstoned');
select ok((select email is null and display_name is null from public.profiles where id='11111111-1111-4111-8111-111111111111'),
 'PII of original UUID erased');
select is((select status from public.billing_access_grants where source_id='historical-launch'),'revoked','original purchase access revoked');
select is((select count(*)::int from public.clerk_deletion_objects('https://legacy.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa')),
 1,'original UUID Storage objects queued');
select is(public.apply_clerk_user_event('late-historical',repeat('e',64),'https://legacy.clerk.invalid',
 'user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','user.updated',now()+interval '1 hour','late@example.invalid'),'ignored','late event cannot resurrect aliases');
select throws_ok($$select public.native_resolve_account('https://legacy.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa')$$,
 '28000','account_deleted','later bootstrap cannot recreate original account');
set local role authenticated;
select is(private.current_account(),null::uuid,'previous canonical bearer loses access immediately');
select is((select count(*)::int from public.profiles),0,'previous bearer cannot read historical profile');
reset role;
select is((select email from public.profiles where id='33333333-3333-4333-8333-333333333333'),'other@example.invalid',
 'deletion preserves same subject at another issuer');
select * from finish();
rollback;
