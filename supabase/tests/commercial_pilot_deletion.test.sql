begin;
select plan(20);
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
 values('https://pilot-delete.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values('16080000-0000-0000-0000-000000000004');
insert into public.account_identities(issuer,subject,account_id)
 values('https://pilot-delete.clerk.invalid','user_pilot_delete','16080000-0000-0000-0000-000000000004');
insert into pilot_private.operations(account_id,op_id,result) values('16080000-0000-0000-0000-000000000004',gen_random_uuid(),'{"public_name":"Erase me"}');
insert into storage.objects(bucket_id,name) values('pilot-photos','16080000-0000-0000-0000-000000000004/'||repeat('a',64)||'.jpg');
-- Native-data claims are checked by the same resolver as the public/storage policies.
update private.clerk_issuers set native_data_issuer='http://127.0.0.1:54321/native-data/v1'
 where issuer='https://pilot-delete.clerk.invalid';
select set_config('request.jwt.claims',jsonb_build_object(
 'role','authenticated','iss','http://127.0.0.1:54321/native-data/v1',
 'aud','vantare-native-data','sub','16080000-0000-0000-0000-000000000004',
 'vantare_identity_provider','clerk','clerk_issuer','https://pilot-delete.clerk.invalid',
 'clerk_subject','user_pilot_delete','iat',floor(extract(epoch from now()))::bigint,
 'exp',floor(extract(epoch from now()))::bigint+120)::text,true);
set local role authenticated;
select is(private.current_account(),'16080000-0000-0000-0000-000000000004'::uuid,'native JWT resolves the live account');
select lives_ok($$select public.pilot_profile_save('{"public_name":"Live pilot"}',null,0,'16080000-0000-0000-0000-000000000011')$$,'live native Pilot can create without photo');
select lives_ok($$select public.pilot_profile_save('{"public_name":"Photo pilot"}',repeat('a',64),1,'16080000-0000-0000-0000-000000000012')$$,'live native Pilot can update with private photo');
select is(public.pilot_profile_load()->>'revision','2','Pilot updates are visible through the public load RPC');
select is(public.pilot_profile_save('{"public_name":"Photo pilot"}',repeat('a',64),1,'16080000-0000-0000-0000-000000000012')->>'revision','2','same operation replays its receipt');
reset role;
select ok(not has_schema_privilege('anon','private','usage') and not has_function_privilege('anon','private.current_account()','execute'),'anon receives no identity privileges');
select ok(not has_schema_privilege('vantare_roadmap_publisher','private','usage') and not has_function_privilege('vantare_roadmap_publisher','private.current_account()','execute'),'roadmap publisher receives no identity privileges');
select ok(not has_table_privilege('pilot_profile_writer','public.account_identities','select') and not has_table_privilege('pilot_profile_writer','private.clerk_issuers','select'),'Pilot writer cannot read the identity registry');
-- Audit every non-bypass function owner and explicit RLS role using the resolver.
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 join pg_roles r on r.oid=p.proowner
 where n.nspname in ('public','private','pilot_private') and p.prokind='f'
 and p.prosrc like '%private.current_account()%'
 and not r.rolsuper and not r.rolbypassrls
 and (not has_schema_privilege(r.oid,'private','usage') or
 not has_function_privilege(r.oid,'private.current_account()','execute'))),0,'all non-bypass function owners can resolve the identity');
select is((select count(*)::int from pg_policies p cross join lateral unnest(p.roles) role_name
 join pg_roles r on r.rolname=role_name
 where p.schemaname in ('public','storage','pilot_private')
 and (coalesce(p.qual,'')||coalesce(p.with_check,'')) like '%private.current_account()%'
 and not r.rolsuper and not r.rolbypassrls
 and (not has_schema_privilege(r.oid,'private','usage') or
 not has_function_privilege(r.oid,'private.current_account()','execute'))),0,'all explicit non-bypass policy roles can resolve the identity');
select is((select count(*)::int from pg_policies where schemaname in ('public','storage','pilot_private')
 and (coalesce(qual,'')||coalesce(with_check,'')) like '%auth.uid()%'),0,'no private Pilot policy retains legacy identity');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='pilot_private' and p.prosrc like '%auth.uid()%'),0,'no private Pilot RPC retains legacy identity');
-- Same UUID with an untrusted binding must not save or replay an old receipt.
select set_config('request.jwt.claims',(current_setting('request.jwt.claims')::jsonb || '{"clerk_subject":"user_unbound"}')::text,true);
set local role authenticated;
select throws_ok($$select public.pilot_profile_save('{}',null,3,'16080000-0000-0000-0000-000000000013')$$,'42501','authentication required','unbound native JWT cannot save');
select throws_ok($$select public.pilot_profile_save('{}',null,2,'16080000-0000-0000-0000-000000000012')$$,'42501','authentication required','unbound native JWT cannot replay a receipt');
reset role;
select set_config('request.jwt.claims',(current_setting('request.jwt.claims')::jsonb || '{"clerk_subject":"user_pilot_delete"}')::text,true);
select public.apply_clerk_user_event('pilot-delete',repeat('a',64),'https://pilot-delete.clerk.invalid','user_pilot_delete','user.deleted',now(),null);
select is((select count(*)::int from public.pilot_profiles where account_id='16080000-0000-0000-0000-000000000004'),0,'pilot PII removed');
select is((select count(*)::int from pilot_private.operations where account_id='16080000-0000-0000-0000-000000000004'),0,'pilot receipt copies removed');
select is((select count(*)::int from public.clerk_deletion_objects('https://pilot-delete.clerk.invalid','user_pilot_delete') where bucket_id='pilot-photos'),1,'ownerless photo queued by UUID path');
select throws_ok($$insert into storage.objects(bucket_id,name) values('pilot-photos','16080000-0000-0000-0000-000000000004/'||repeat('b',64)||'.jpg')$$,'28000','account_deleted','new photo path rejected');
select throws_ok($$insert into pilot_private.operations(account_id,op_id,result) values('16080000-0000-0000-0000-000000000004',gen_random_uuid(),'{}')$$,'28000','account_deleted','new receipt rejected');
set local role authenticated;
select throws_ok($$select public.pilot_profile_save('{}',null,0,'16080000-0000-0000-0000-000000000014')$$,'42501','authentication required','previous valid native JWT cannot save after deletion');
reset role;
select * from finish();
rollback;
