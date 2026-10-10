-- Local-only after #1535 migrations. Verifies the dedicated role, not a service key.
begin;
select plan(11);
select ok(public.visual_roadmap_valid('{"schemaVersion":2,"items":[]}'::jsonb), 'v2 empty valid');
select ok(public.visual_roadmap_valid('{"schemaVersion":1,"items":[]}'::jsonb), 'v1 retained');
select ok(not public.visual_roadmap_valid('{"schemaVersion":3,"items":[]}'::jsonb), 'future rejected');
select ok(not public.visual_roadmap_valid('{"schemaVersion":"2","items":[]}'::jsonb), 'numeric schema required');
select ok(not public.visual_roadmap_valid('{"schemaVersion":2,"items":[],"privateMetadata":"reject"}'::jsonb), 'unknown public fields rejected');
select ok(not (select rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls from pg_roles where rolname='vantare_roadmap_publisher'), 'no administration');
set local role vantare_roadmap_publisher;
select lives_ok($$select public.visual_roadmap_sync('{"schemaVersion":2,"items":[]}'::jsonb)$$,'dedicated role sync allowed');
select throws_ok($$insert into public.visual_roadmap(status,document) values('published','{"schemaVersion":2,"items":[]}')$$,'42501',null,'direct DML denied');
select throws_ok($$select public.visual_roadmap_publish('{"schemaVersion":2,"items":[]}'::jsonb)$$,'42501',null,'general publisher denied');
set local role anon;
select throws_ok($$select public.visual_roadmap_sync('{"schemaVersion":2,"items":[]}'::jsonb)$$,'42501',null,'anon cannot sync');
select lives_ok($$select * from public.visual_roadmap_current()$$,'anon reads independent of GitHub visibility');
select * from finish();
rollback;
