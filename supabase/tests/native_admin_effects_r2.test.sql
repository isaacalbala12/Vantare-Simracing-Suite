begin;
select no_plan();
insert into public.profiles(id) values('00000000-0000-4000-8000-000000001960'),('00000000-0000-4000-8000-000000001961');
select * from public.operational_access_set('00000000-0000-4000-8000-000000001960','owner','grant','test:r10-r2','R2 test','test:r10-r2',null);
create temporary table r2_tokens(token uuid);
insert into r2_tokens select public.native_admin_claim_change('00000000-0000-4000-8000-000000001960','00000000-0000-4000-8000-000000001962','00000000-0000-4000-8000-000000001961');
create temporary table r2_event(event jsonb);
insert into r2_event values(jsonb_build_object('request_id','00000000-0000-4000-8000-000000001962','effect_id','00000000-0000-4000-8000-000000001963','action','set_blocked','effect','clerk_ban','target_hash',repeat('c',64),'outcome','started'));
select public.native_admin_record_effect('00000000-0000-4000-8000-000000001960',(select event from r2_event));
select throws_ok($$select public.native_admin_reconcile_effect('00000000-0000-4000-8000-000000001960','00000000-0000-4000-8000-000000001963')$$,'22023','native_admin_invalid','fresh in-flight intention cannot be reconciled');
select is(public.native_admin_release_change('00000000-0000-4000-8000-000000001960','00000000-0000-4000-8000-000000001962','00000000-0000-4000-8000-000000001961',(select token from r2_tokens)),true,'release completes');
select is(public.native_admin_claim_change('00000000-0000-4000-8000-000000001960','00000000-0000-4000-8000-000000001964','00000000-0000-4000-8000-000000001961'),null::uuid,'started without result blocks new claim even after release');
select public.native_admin_record_effect('00000000-0000-4000-8000-000000001960',(select event||'{"outcome":"unknown"}' from r2_event));
select is(public.native_admin_claim_change('00000000-0000-4000-8000-000000001960','00000000-0000-4000-8000-000000001964','00000000-0000-4000-8000-000000001961'),null::uuid,'unknown prevents a conflicting unban');
select throws_ok($$select public.native_admin_reconcile_effect('00000000-0000-4000-8000-000000001961','00000000-0000-4000-8000-000000001963')$$,'42501','native_admin_forbidden','non owner cannot reconcile');
select is(public.native_admin_reconcile_effect('00000000-0000-4000-8000-000000001960','00000000-0000-4000-8000-000000001963'),true,'owner can reconcile unknown');
update r2_tokens set token=public.native_admin_claim_change('00000000-0000-4000-8000-000000001960','00000000-0000-4000-8000-000000001964','00000000-0000-4000-8000-000000001961');
select ok((select token is not null from r2_tokens),'reconciliation unblocks claim');
update private.admin_change_leases set expires_at=clock_timestamp()-interval '1 second' where account_id='00000000-0000-4000-8000-000000001961';
select throws_ok($$select public.native_admin_finish_change('00000000-0000-4000-8000-000000001960','https://clerk.example.invalid','{"account_id":"00000000-0000-4000-8000-000000001961","blocked":false}','sandbox','00000000-0000-4000-8000-000000001964',(select token from r2_tokens))$$,'40001','native_admin_lease_conflict','correct token with expired lease cannot finish');
insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash,occurred_at)
 values('00000000-0000-4000-8000-000000001965','started','00000000-0000-4000-8000-000000001962','00000000-0000-4000-8000-000000001960','set_blocked','clerk_ban',repeat('c',64),now()-interval '481 seconds');
select is(public.native_admin_reconcile_effect('00000000-0000-4000-8000-000000001960','00000000-0000-4000-8000-000000001965'),true,'old abandoned intention may be reconciled');
insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash)
 select '00000000-0000-4000-8000-000000001966',s,'00000000-0000-4000-8000-000000001962','00000000-0000-4000-8000-000000001960','set_blocked','clerk_ban',repeat('c',64) from unnest(array['started','succeeded']) s;
select throws_ok($$select public.native_admin_reconcile_effect('00000000-0000-4000-8000-000000001960','00000000-0000-4000-8000-000000001966')$$,'22023','native_admin_invalid','success cannot be reconciled');
insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash)
 select '00000000-0000-4000-8000-000000001967',s,'00000000-0000-4000-8000-000000001962','00000000-0000-4000-8000-000000001960','set_blocked','clerk_ban',repeat('c',64) from unnest(array['started','failed']) s;
select throws_ok($$select public.native_admin_reconcile_effect('00000000-0000-4000-8000-000000001960','00000000-0000-4000-8000-000000001967')$$,'22023','native_admin_invalid','failure cannot be reconciled');
create temporary table r2_deleted_lease as select expires_at from private.admin_change_leases where account_id='00000000-0000-4000-8000-000000001961';
insert into public.account_identities(issuer,subject,account_id,deleted_at) values('https://clerk.example.invalid','user_r2_deleted','00000000-0000-4000-8000-000000001961',now());
select is(public.native_admin_release_change('00000000-0000-4000-8000-000000001960','00000000-0000-4000-8000-000000001964','00000000-0000-4000-8000-000000001961',(select token from r2_tokens)),true,'release on deleted account is harmless');
select is((select expires_at from private.admin_change_leases where account_id='00000000-0000-4000-8000-000000001961'),(select expires_at from r2_deleted_lease),'release leaves expires_at unchanged on deleted account');
select * from finish();
rollback;
