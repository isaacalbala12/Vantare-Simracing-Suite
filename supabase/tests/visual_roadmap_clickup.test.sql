-- LOCAL only; real LOGIN adversarial test also run by run-1535-postgres.py.
begin;
select plan(29);
select ok(public.visual_roadmap_valid('{"schemaVersion":2,"items":[]}'::jsonb),'v2 empty structurally valid, sync rejects');
select ok(public.visual_roadmap_valid('{"schemaVersion":1,"items":[]}'::jsonb),'v1 retained');
select ok(not public.visual_roadmap_valid('{"schemaVersion":3,"items":[]}'::jsonb),'future rejected');
select ok(not public.visual_roadmap_valid('{"schemaVersion":"2","items":[]}'::jsonb),'numeric schema required');
select ok(not public.visual_roadmap_valid('{"schemaVersion":2,"items":[],"privateMetadata":"reject"}'::jsonb),'unknown fields rejected');
select ok(not (select rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls from pg_roles where rolname='vantare_roadmap_publisher'),'no administration');
select ok(not has_schema_privilege('vantare_roadmap_publisher','public','CREATE'),'no schema creation');
select ok(not exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname='vantare_roadmap_publisher'),'no memberships');
select ok(not has_function_privilege('vantare_roadmap_publisher','public.race_schedule_my_draft()','EXECUTE'),'private draft inaccessible');
select ok(has_function_privilege('authenticated','public.race_schedule_my_draft()','EXECUTE'),'authenticated draft retained');
select ok(not has_function_privilege('vantare_roadmap_publisher','public.is_active_owner(uuid)','EXECUTE'),'owner oracle closed');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname not in ('pg_catalog','information_schema') and p.prosecdef
 and has_function_privilege('vantare_roadmap_publisher',p.oid,'EXECUTE')
 and p.oid::regprocedure::text not in ('visual_roadmap_sync(jsonb)','race_schedule_current()','digest(text,text)','digest(bytea,text)')),0,'no unreviewed reachable definers');
set local role vantare_roadmap_publisher;
select throws_ok($$insert into public.visual_roadmap_sync_approvals values('{}',now())$$,'42501',null,'CI cannot approve own replacement');
select throws_ok($$select public.visual_roadmap_sync('{"schemaVersion":2,"items":[]}'::jsonb)$$,'22023','invalid_clickup_roadmap','empty never clears roadmap');
select lives_ok($$select public.visual_roadmap_sync('{"schemaVersion": 2, "items": [{"id": "15350000-0000-0000-0000-000000000031", "section": "later", "title": {"es": "Hub", "en": "", "pt": "", "it": ""}, "body": {"es": "Estado", "en": "", "pt": "", "it": ""}, "area": "Feature", "version": null, "dueDate": null}, {"id": "15350000-0000-0000-0000-000000000032", "section": "later", "title": {"es": "Hub", "en": "", "pt": "", "it": ""}, "body": {"es": "Estado", "en": "", "pt": "", "it": ""}, "area": "Feature", "version": null, "dueDate": null}, {"id": "15350000-0000-0000-0000-000000000033", "section": "later", "title": {"es": "Hub", "en": "", "pt": "", "it": ""}, "body": {"es": "Estado", "en": "", "pt": "", "it": ""}, "area": "Feature", "version": null, "dueDate": null}]}'::jsonb)$$,'dedicated sync allowed');
select is(public.visual_roadmap_sync('{"schemaVersion": 2, "items": [{"id": "15350000-0000-0000-0000-000000000031", "section": "later", "title": {"es": "Hub", "en": "", "pt": "", "it": ""}, "body": {"es": "Estado", "en": "", "pt": "", "it": ""}, "area": "Feature", "version": null, "dueDate": null}, {"id": "15350000-0000-0000-0000-000000000032", "section": "later", "title": {"es": "Hub", "en": "", "pt": "", "it": ""}, "body": {"es": "Estado", "en": "", "pt": "", "it": ""}, "area": "Feature", "version": null, "dueDate": null}, {"id": "15350000-0000-0000-0000-000000000033", "section": "later", "title": {"es": "Hub", "en": "", "pt": "", "it": ""}, "body": {"es": "Estado", "en": "", "pt": "", "it": ""}, "area": "Feature", "version": null, "dueDate": null}]}'::jsonb)::text,public.visual_roadmap_sync('{"schemaVersion": 2, "items": [{"id": "15350000-0000-0000-0000-000000000031", "section": "later", "title": {"es": "Hub", "en": "", "pt": "", "it": ""}, "body": {"es": "Estado", "en": "", "pt": "", "it": ""}, "area": "Feature", "version": null, "dueDate": null}, {"id": "15350000-0000-0000-0000-000000000032", "section": "later", "title": {"es": "Hub", "en": "", "pt": "", "it": ""}, "body": {"es": "Estado", "en": "", "pt": "", "it": ""}, "area": "Feature", "version": null, "dueDate": null}, {"id": "15350000-0000-0000-0000-000000000033", "section": "later", "title": {"es": "Hub", "en": "", "pt": "", "it": ""}, "body": {"es": "Estado", "en": "", "pt": "", "it": ""}, "area": "Feature", "version": null, "dueDate": null}]}'::jsonb)::text,'identical retry retains ID');
select throws_ok($$select public.visual_roadmap_sync('{"schemaVersion": 2, "items": [{"id": "15350000-0000-0000-0000-000000000031", "section": "later", "title": {"es": "Hub", "en": "", "pt": "", "it": ""}, "body": {"es": "Estado", "en": "", "pt": "", "it": ""}, "area": "Feature", "version": null, "dueDate": null}]}'::jsonb)$$,'42501','roadmap_mass_removal_requires_approval','mass removal denied');
select throws_ok($$insert into public.visual_roadmap(status,document) values('published','{}')$$,'42501',null,'DML denied');
select throws_ok($$select public.visual_roadmap_publish('{}'::jsonb)$$,'42501',null,'general publisher denied');
set local role anon;
select throws_ok($$select public.visual_roadmap_sync('{"schemaVersion": 2, "items": [{"id": "15350000-0000-0000-0000-000000000031", "section": "later", "title": {"es": "Hub", "en": "", "pt": "", "it": ""}, "body": {"es": "Estado", "en": "", "pt": "", "it": ""}, "area": "Feature", "version": null, "dueDate": null}, {"id": "15350000-0000-0000-0000-000000000032", "section": "later", "title": {"es": "Hub", "en": "", "pt": "", "it": ""}, "body": {"es": "Estado", "en": "", "pt": "", "it": ""}, "area": "Feature", "version": null, "dueDate": null}, {"id": "15350000-0000-0000-0000-000000000033", "section": "later", "title": {"es": "Hub", "en": "", "pt": "", "it": ""}, "body": {"es": "Estado", "en": "", "pt": "", "it": ""}, "area": "Feature", "version": null, "dueDate": null}]}'::jsonb)$$,'42501',null,'anon cannot sync');
select is((select document->>'schemaVersion' from public.visual_roadmap_current()),'1','installed reader receives v1');
select ok((select not exists(select 1 from jsonb_array_elements(document->'items') i where i ? 'area' or i ? 'version' or i ? 'dueDate' or i->>'section'='later') from public.visual_roadmap_current()),'legacy strict fields and sections preserved');
select is((select document->>'schemaVersion' from public.visual_roadmap_current_v2()),'2','new reader receives v2');
select is((select id from public.visual_roadmap_current()),(select id from public.visual_roadmap_current_v2()),'both readers share publication ID');
reset role;
insert into public.visual_roadmap_sync_approvals values('{"schemaVersion": 2, "items": [{"id": "15350000-0000-0000-0000-000000000031", "section": "later", "title": {"es": "Hub", "en": "", "pt": "", "it": ""}, "body": {"es": "Estado", "en": "", "pt": "", "it": ""}, "area": "Feature", "version": null, "dueDate": null}]}'::jsonb,now()-interval '1 second');
set local role vantare_roadmap_publisher;
select throws_ok($$select public.visual_roadmap_sync('{"schemaVersion": 2, "items": [{"id": "15350000-0000-0000-0000-000000000031", "section": "later", "title": {"es": "Hub", "en": "", "pt": "", "it": ""}, "body": {"es": "Estado", "en": "", "pt": "", "it": ""}, "area": "Feature", "version": null, "dueDate": null}]}'::jsonb)$$,'42501','roadmap_mass_removal_requires_approval','expired approval denied');
reset role;
delete from public.visual_roadmap_sync_approvals;
insert into public.visual_roadmap_sync_approvals values('{"schemaVersion": 2, "items": [{"id": "15350000-0000-0000-0000-000000000031", "section": "later", "title": {"es": "Hub", "en": "", "pt": "", "it": ""}, "body": {"es": "Estado", "en": "", "pt": "", "it": ""}, "area": "Feature", "version": null, "dueDate": null}]}'::jsonb,now()+interval '5 minutes');
set local role vantare_roadmap_publisher;
select lives_ok($$select public.visual_roadmap_sync('{"schemaVersion": 2, "items": [{"id": "15350000-0000-0000-0000-000000000031", "section": "later", "title": {"es": "Hub", "en": "", "pt": "", "it": ""}, "body": {"es": "Estado", "en": "", "pt": "", "it": ""}, "area": "Feature", "version": null, "dueDate": null}]}'::jsonb)$$,'exact administrative approval permits removal');
reset role;
select is((select count(*)::integer from public.visual_roadmap_sync_approvals),0,'approval consumed once');
select ok(public.visual_roadmap_valid(jsonb_build_object('schemaVersion',1,'items',(
 select jsonb_agg(jsonb_build_object('id',format('15350000-0000-0000-0000-%s',lpad(n::text,12,'0')),
 'section','now','title',jsonb_build_object('es','Hub','en','','pt','','it',''),
 'body',jsonb_build_object('es',repeat('á',600),'en','','pt','','it','')))
 from generate_series(1,35) n))),'existing multibyte v1 preserves character limit');
select ok(not has_function_privilege('vantare_roadmap_publisher','public.handle_new_user()','EXECUTE'),'trigger helper closed to CI');
select * from finish();
rollback;
