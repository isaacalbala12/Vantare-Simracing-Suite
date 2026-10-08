begin;
select plan(4);
insert into private.clerk_issuers(issuer,authorized_parties,enabled,native_data_issuer)
values('https://clerk.test.invalid',array['https://purchase.test.invalid'],true,'https://abcdefghijklmnopqrst.supabase.co/auth/v1');
select public.native_resolve_account('https://clerk.test.invalid','user_native_test');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',(select account_id from public.account_identities where subject='user_native_test'),'iss','https://abcdefghijklmnopqrst.supabase.co/auth/v1')::text,true);
select is(private.current_account(),null::uuid,'legacy Auth UUID token is denied');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','aud','authenticated','sub',(select account_id from public.account_identities where subject='user_native_test'),'iss','https://abcdefghijklmnopqrst.supabase.co/auth/v1','vantare_identity_provider','clerk','clerk_issuer','https://clerk.test.invalid','clerk_subject','user_native_test','iat',100,'exp',400)::text,true);
select is(private.current_account(),(select account_id from public.account_identities where subject='user_native_test'),'existing native data token binds verified Clerk UUID');
select set_config('request.jwt.claims',(auth.jwt()||'{"clerk_subject":"user_other"}'::jsonb)::text,true);
select is(private.current_account(),null::uuid,'different Clerk subject denied');
select set_config('request.jwt.claims',(auth.jwt()||'{"clerk_subject":"user_native_test","exp":401}'::jsonb)::text,true);
select is(private.current_account(),null::uuid,'native data lifetime cannot grow');
select * from finish();
rollback;
