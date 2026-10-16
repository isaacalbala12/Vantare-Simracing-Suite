begin;
create extension if not exists pgtap;
select plan(8);
set local role authenticated;
select set_config('request.jwt.claims','{"iss":"https://clerk.1608.invalid","sub":"user_aaaaaaaaaaaaaaaaaaaaaaaaaaa","role":"authenticated"}',true);
select throws_ok($$select public.claim_active_device(repeat('A',64))$$,'P0001','invalid_identity','uppercase fingerprint cannot claim device');
select throws_ok($$select public.claim_active_device('short')$$,'P0001','invalid_identity','short fingerprint cannot claim device');
select throws_ok($$select public.claim_active_device(' ' || repeat('a',64))$$,'P0001','invalid_identity','padded fingerprint cannot claim device');
reset role;
select is((select count(*)::integer from public.account_identities where issuer='https://clerk.1608.invalid'),0,'invalid fingerprint does not bootstrap an account');
-- A valid device claim after B03 requires explicit bootstrap and a complete
-- trusted session; retain the original pre-B03 run as well.
select to_regclass('private.clerk_issuers') is not null as has_issuer_registry \gset
\if :has_issuer_registry
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
 values('https://clerk.1608.invalid',array['https://app.invalid'],true);
select set_config('request.jwt.claims','{"iss":"https://clerk.1608.invalid","sub":"user_aaaaaaaaaaaaaaaaaaaaaaaaaaa","role":"authenticated","sid":"sess_fixture","azp":"https://app.invalid"}',true);
set local role authenticated;
select public.clerk_bootstrap_account();
reset role;
\endif
set local role authenticated;
select lives_ok($$select public.claim_active_device(repeat('a',64))$$,'canonical fingerprint claims device');
select throws_ok($$select public.reset_active_device(repeat('A',64))$$,'P0001','invalid_identity','uppercase fingerprint cannot reset device');
select throws_ok($$select public.reset_active_device('short')$$,'P0001','invalid_identity','short fingerprint cannot reset device');
select throws_ok($$select public.reset_active_device(' ' || repeat('a',64))$$,'P0001','invalid_identity','padded fingerprint cannot reset device');
reset role;
select * from finish();
rollback;
