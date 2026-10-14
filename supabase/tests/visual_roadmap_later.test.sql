begin;
select plan(7);

create temporary table example_document as
select jsonb_build_object('schemaVersion', 1, 'items', jsonb_build_array(
  jsonb_build_object('id', '550e8400-e29b-41d4-a716-446655440001',
    'section', 'later',
    'title', jsonb_build_object('es', 'Idea · Ejemplo', 'en', '', 'pt', '', 'it', ''),
    'body', jsonb_build_object('es', 'Estado: idea', 'en', '', 'pt', '', 'it', ''))
)) as document;

select ok(public.visual_roadmap_valid(document), 'later accepted with schema v1') from example_document;
select ok(not public.visual_roadmap_valid(jsonb_set(document, '{items,0,section}', '"invented"')), 'unknown state rejected') from example_document;
select ok(not public.visual_roadmap_valid(jsonb_set(document, '{items,0,title,es}', to_jsonb(repeat('x', 121)))), 'title budget retained') from example_document;
select ok(not public.visual_roadmap_valid(jsonb_set(document, '{items}', document->'items' || document->'items')), 'duplicate IDs rejected') from example_document;
select ok(not has_function_privilege('anon', 'public.visual_roadmap_publish(jsonb)', 'execute'), 'anon cannot publish');
select ok(not has_function_privilege('authenticated', 'public.visual_roadmap_publish(jsonb)', 'execute'), 'authenticated cannot publish');
select ok(has_function_privilege('anon', 'public.visual_roadmap_current()', 'execute'), 'public read unchanged');

select * from finish();
rollback;
