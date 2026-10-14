begin;
select no_plan();
create function pg_temp.reject_invalid(document jsonb) returns void language plpgsql as $$
begin
  perform public.pilot_profile_save(document,null,2,gen_random_uuid());
  -- Fuerza rollback del intento si el servidor lo acepta erróneamente,
  -- así cada fila RED ejercita el mismo CAS en vez de contaminar la siguiente.
  raise exception 'invalid document accepted';
end;
$$;
create function pg_temp.direct_write(statement text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'direct update accepted';
end;
$$;
create function pg_temp.abort_operation() returns void language plpgsql as $$
begin
  perform public.pilot_profile_save('{"description":"D"}',null,7,'16120000-0000-4000-8000-000000000013');
  raise exception 'rollback fixture';
end;
$$;
select ok((select relrowsecurity from pg_class where oid='public.pilot_profiles'::regclass),'RLS enabled');
select ok(not has_table_privilege('anon','public.pilot_profiles','select'),'anon has no table access');
select ok(not has_function_privilege('anon','public.pilot_profile_load()','execute'),'anon cannot load');
select ok(not (select rolcanlogin or rolbypassrls from pg_roles where rolname='pilot_profile_writer'),'private writer cannot login or bypass RLS');
select ok(not pg_has_role('authenticated','pilot_profile_writer','MEMBER') and not pg_has_role('anon','pilot_profile_writer','MEMBER'),'API roles never inherit private writer');
select ok((select proowner='pilot_profile_writer'::regrole and prosecdef and proconfig=array['search_path=""'] from pg_proc where oid='pilot_private.pilot_profile_save(jsonb,text,bigint,uuid)'::regprocedure),'private CAS uses narrow owner and empty search_path');
select ok(not has_function_privilege('anon','pilot_private.pilot_profile_save(jsonb,text,bigint,uuid)','execute'),'anon cannot call private CAS');
select ok(not (select prosecdef from pg_proc where oid='public.pilot_profile_save(jsonb,text,bigint,uuid)'::regprocedure),'save is invoker');
select ok(not (select public from storage.buckets where id='pilot-photos'),'bucket private');
select is((select file_size_limit from storage.buckets where id='pilot-photos'),24576::bigint,'photo limit');
set local role authenticated;
set local request.jwt.claim.sub='16120000-0000-0000-0000-000000000001';
select is(public.pilot_profile_load(),null::jsonb,'empty account');
select is((public.pilot_profile_save('{"public_name":"A","team_future":true}',null,0,gen_random_uuid())->>'revision')::bigint,1::bigint,'first revision');
select throws_ok($$select public.pilot_profile_save('{}',null,0,gen_random_uuid())$$,'PT409','revision conflict','stale insert rejected');
select is((public.pilot_profile_save('{"public_name":"B","team_future":true}',null,1,gen_random_uuid())->>'revision')::bigint,2::bigint,'CAS update');
select is(public.pilot_profile_load()->'profile'->'team_future','true'::jsonb,'future fields survive');
-- Cada intento inválido mantiene intactos el documento y su revisión.
select throws_ok(format('select pg_temp.reject_invalid(%L::jsonb)', document::text),
  '22023','invalid profile', 'native contract rejects ' || label)
from (values
  ('name number', '{"public_name":123}'::jsonb),
  ('name null', '{"public_name":null}'::jsonb),
  ('name too long', jsonb_build_object('public_name',repeat('ñ',65))),
  ('name LF', jsonb_build_object('public_name',E'GT\nLMU')),
  ('description array', '{"description":[]}'::jsonb),
  ('description too long', jsonb_build_object('description',repeat('ñ',281))),
  ('description CR', jsonb_build_object('description',E'GT\rLMU')),
  ('description tab', jsonb_build_object('description',E'GT\tLMU')),
  ('description escape', jsonb_build_object('description','GT'||chr(27))),
  ('description DEL', jsonb_build_object('description','GT'||chr(127))),
  ('description C1', jsonb_build_object('description','GT'||chr(133))),
  ('country unknown', '{"country":"ZZ"}'::jsonb),
  ('country lowercase', '{"country":"es"}'::jsonb),
  ('country number', '{"country":1}'::jsonb),
  ('car object', '{"favorite_car":{}}'::jsonb),
  ('car too long', jsonb_build_object('favorite_car',repeat('a',121))),
  ('team boolean', '{"favorite_team":true}'::jsonb),
  ('team too long', jsonb_build_object('favorite_team',repeat('a',121))),
  ('simulators string', '{"simulators":"lmu"}'::jsonb),
  ('simulators null', '{"simulators":null}'::jsonb),
  ('simulator number', '{"simulators":[1]}'::jsonb),
  ('simulator blank', jsonb_build_object('simulators',jsonb_build_array(E' \t'))),
  ('simulator unicode blank', jsonb_build_object('simulators',jsonb_build_array(chr(160)))),
  ('simulator controls', jsonb_build_object('simulators',jsonb_build_array(E'LMU\n'))),
  ('simulator too long', jsonb_build_object('simulators',jsonb_build_array(repeat('a',65)))),
  ('simulator duplicate', '{"simulators":["lmu","lmu"]}'::jsonb),
  ('simulators excessive', jsonb_build_object('simulators',(select jsonb_agg(i::text) from generate_series(1,17) i))),
  ('combined bad fields', '{"public_name":123,"country":"ZZ","simulators":"lmu"}'::jsonb)
  ,('future number beyond f64', '{"future":1e400}'::jsonb)
  ,('future depth beyond serde', ('{"future":'||repeat('[',128)||'0'||repeat(']',128)||'}')::jsonb)
) cases(label,document);
select is((public.pilot_profile_load()->>'revision')::bigint,2::bigint,'invalid documents do not mutate revision');
select is(public.pilot_profile_load()->'profile'->>'public_name','B','invalid documents preserve profile');
select is((public.pilot_profile_save(jsonb_build_object('public_name',repeat('ñ',64),'description',E'GT\n'||repeat('a',277),'favorite_car',repeat('a',120),'favorite_team',repeat('a',120),'country','AX','simulators',(select jsonb_agg(i::text) from generate_series(1,16) i),'future',jsonb_build_object('teams',jsonb_build_array('A'))),null,2,gen_random_uuid())->>'revision')::bigint,3::bigint,'native maxima, multiline and future fields accepted');
select is((public.pilot_profile_save('{"public_name":"B","team_future":true}',null,3,gen_random_uuid())->>'revision')::bigint,4::bigint,'restore fixture after valid boundaries');
select ok(not has_table_privilege('authenticated','public.pilot_profiles','insert,update,delete'),'no direct DML grant');
select throws_ok($$select pg_temp.direct_write('update public.pilot_profiles set profile=''{}'' where account_id=auth.uid()')$$,'42501',null,'own direct update cannot bypass CAS at unchanged revision');
select throws_ok($$select pg_temp.direct_write('delete from public.pilot_profiles where account_id=auth.uid()')$$,'42501',null,'own direct delete forbidden');
select throws_ok($$select pg_temp.direct_write('insert into public.pilot_profiles(account_id) values(auth.uid()) on conflict do nothing')$$,'42501',null,'own direct insert forbidden');
select is((public.pilot_profile_load()->>'revision')::bigint,4::bigint,'direct writes leave revision intact');
select throws_ok($$insert into public.pilot_profiles(account_id) values('16120000-0000-0000-0000-000000000002')$$,'42501',null,'cannot write another profile');
insert into storage.objects(bucket_id,name) values('pilot-photos','16120000-0000-0000-0000-000000000001/'||repeat('a',64)||'.jpg');
with changed as (update storage.objects set metadata='{"replaced":true}' where bucket_id='pilot-photos' returning 1)
  select is(count(*),0::bigint,'global permissive UPDATE cannot replace own immutable photo') from changed;
with changed as (delete from storage.objects where bucket_id='pilot-photos' returning 1)
  select is(count(*),0::bigint,'global permissive DELETE cannot enable delete plus reinsert replacement') from changed;
with changed as (update storage.objects set bucket_id='other' where bucket_id='pilot-photos' returning 1)
  select is(count(*),0::bigint,'cannot move immutable photo out of bucket') from changed;
insert into storage.objects(bucket_id,name) values('other','16120000-0000-0000-0000-000000000001/'||repeat('b',64)||'.jpg');
select throws_ok($$update storage.objects set bucket_id='pilot-photos' where bucket_id='other'$$,'42501',null,'cannot move a replacement into immutable bucket');
with changed as (update storage.objects set metadata='{"allowed":true}' where bucket_id='other' returning 1)
  select is(count(*),1::bigint,'update outside pilot bucket unchanged') from changed;
select throws_ok(format('select public.pilot_profile_save(%L::jsonb,%L,4,gen_random_uuid())',jsonb_build_object('future',repeat('x',17000))::text,repeat('a',64)), '22023','invalid profile','reserve photo base64 inside native document budget');
select is((public.pilot_profile_save('{}',repeat('a',64),4,gen_random_uuid())->>'revision')::bigint,5::bigint,'own uploaded photo linked');
select throws_ok($$select public.pilot_profile_save('{}',repeat('b',64),5,gen_random_uuid())$$,'22023','photo missing','missing photo rejected');
select throws_ok($$select public.pilot_profile_save('{}',null,5,null)$$,'22023','operation required','missing op_id rejected');
select is((public.pilot_profile_save('{"description":"A"}',null,5,'16120000-0000-4000-8000-000000000010')->>'revision')::bigint,6::bigint,'operation A commits once');
select is(public.pilot_profile_save('{"description":"A"}',null,5,'16120000-0000-4000-8000-000000000010'),
  public.pilot_profile_load(),'lost confirmation returns exact first result before CAS');
select is((public.pilot_profile_load()->>'revision')::bigint,6::bigint,'duplicate never increments revision');
select is((select last_op_id from public.pilot_profiles),'16120000-0000-4000-8000-000000000010'::uuid,'last operation recorded on profile');
select is((public.pilot_profile_save('{"description":"C"}',null,6,'16120000-0000-4000-8000-000000000011')->>'revision')::bigint,7::bigint,'second device confirms C');
select is(public.pilot_profile_save('{"description":"ignored"}',repeat('b',64),-1,'16120000-0000-4000-8000-000000000010'),
  '{"profile":{"description":"A"},"photo_hash":null,"revision":6}'::jsonb,'older op_id returns original state despite later device and different payload/CAS');
select is(public.pilot_profile_load()->'profile'->>'description','C','old retry never replaces second device');
select is((public.pilot_profile_load()->>'revision')::bigint,7::bigint,'old retry never increments later revision');
select throws_ok($$select public.pilot_profile_save('{"description":"B"}',null,6,'16120000-0000-4000-8000-000000000012')$$,'PT409','revision conflict','new edit cannot overwrite second device');
select throws_ok($$select pg_temp.abort_operation()$$,'P0001','rollback fixture','aborted operation rolls back profile and receipt atomically');
select is((public.pilot_profile_load()->>'revision')::bigint,7::bigint,'aborted operation preserves revision');
select is((public.pilot_profile_save('{"description":"D"}',null,7,'16120000-0000-4000-8000-000000000013')->>'revision')::bigint,8::bigint,'retry after rollback applies once with same op_id');
select ok(not has_table_privilege('authenticated','pilot_private.operations','select,insert,update,delete'),'receipts cannot be read or changed by API role');
select ok(not has_table_privilege('anon','pilot_private.operations','select,insert,update,delete'),'receipts inaccessible to anon');
select throws_ok($$select * from pilot_private.operations$$,'42501',null,'own receipts not directly exposed');
reset role;
select ok((select relrowsecurity from pg_class where oid='pilot_private.operations'::regclass),'receipts RLS enabled');
select ok(not has_table_privilege('pilot_profile_writer','pilot_private.operations','update,delete'),'writer cannot alter or delete receipt');
set local role pilot_profile_writer;
select is((select count(*) from pilot_private.operations where op_id='16120000-0000-4000-8000-000000000012'),0::bigint,'rejected CAS creates no receipt');
set local role authenticated;
set local request.jwt.claim.sub='16120000-0000-0000-0000-000000000002';
select is((public.pilot_profile_save('{"description":"other account"}',null,0,'16120000-0000-4000-8000-000000000010')->>'revision')::bigint,1::bigint,'same op_id is scoped to authenticated account');
select is(public.pilot_profile_load()->'profile'->>'description','other account','same key cannot reveal another account receipt');
reset role;
delete from public.pilot_profiles where account_id='16120000-0000-0000-0000-000000000002';
set local role pilot_profile_writer;
select is((select count(*) from pilot_private.operations where account_id='16120000-0000-0000-0000-000000000001'),0::bigint,'writer RLS hides other account receipts');
set local role authenticated;
select is((select count(*) from public.pilot_profiles),0::bigint,'other account sees no profiles');
select is((select count(*) from storage.objects where bucket_id='pilot-photos'),0::bigint,'broad existing storage policy cannot leak photos');
select throws_ok($$insert into storage.objects(bucket_id,name) values('pilot-photos','16120000-0000-0000-0000-000000000001/'||repeat('b',64)||'.jpg')$$,'42501',null,'cannot upload into another namespace');
select throws_ok($$update public.pilot_profiles set profile='{}' where account_id='16120000-0000-0000-0000-000000000001'$$,'42501',null,'cannot update another profile');
reset role;
set local role anon;
set local request.jwt.claim.sub='';
select is((select count(*) from storage.objects where bucket_id='pilot-photos'),0::bigint,'anon cannot read photos despite broad policy');
select * from finish();
rollback;
