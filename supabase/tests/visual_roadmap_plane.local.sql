-- Disposable LOCAL cluster only. Existing migrations, no #1601 schema changes.
-- ROADMAP_TEST_FIXTURE must point to native/hub/reference/fixtures/roadmap-plane-v2-test.json.
do $$ begin
  if current_setting('data_directory') not like '/tmp/vantare1601-pg-%' then
    raise exception 'This test is restricted to its disposable local cluster';
  end if;
end $$;
\set document `python3 -c "import json,os; print(json.dumps(json.load(open(os.environ['ROADMAP_TEST_FIXTURE']))['document'],ensure_ascii=False))"`
select set_config('roadmap_test.document', :'document', false) \g /dev/null
create temporary table roadmap_test_ids(id uuid);
grant all on roadmap_test_ids to vantare_roadmap_publisher;
set role vantare_roadmap_publisher;
insert into roadmap_test_ids select public.visual_roadmap_sync(current_setting('roadmap_test.document')::jsonb);
insert into roadmap_test_ids select public.visual_roadmap_sync(current_setting('roadmap_test.document')::jsonb);
reset role;
do $$ begin
  if (select count(distinct id) from roadmap_test_ids) <> 1 or (select count(*) from public.visual_roadmap) <> 1 then
    raise exception 'unchanged content inserted a publication';
  end if;
end $$;
select set_config('roadmap_test.changed', jsonb_set(current_setting('roadmap_test.document')::jsonb,
  '{items,0,section}', '"done"')::text, false) \g /dev/null
set role vantare_roadmap_publisher;
insert into roadmap_test_ids select public.visual_roadmap_sync(current_setting('roadmap_test.changed')::jsonb);
reset role;
do $$ begin
  if (select count(distinct id) from roadmap_test_ids) <> 2 or (select count(*) from public.visual_roadmap) <> 2 then
    raise exception 'changed content did not publish exactly once';
  end if;
end $$;
set role anon;
do $$ begin
  if (select document->'items'->0->>'title' from public.visual_roadmap_current_v2()) is null
    or (select document->'items'->0->>'section' from public.visual_roadmap_current_v2()) <> 'done'
    or (select (document->>'schemaVersion')::integer from public.visual_roadmap_current()) <> 1 then
    raise exception 'public v1/v2 readers diverged';
  end if;
end $$;
reset role;
set role vantare_roadmap_publisher;
do $$ begin
  begin
    perform public.visual_roadmap_sync('{"schemaVersion":2,"items":[]}'::jsonb);
    raise exception 'empty document accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.visual_roadmap_sync(jsonb_set(current_setting('roadmap_test.document')::jsonb,
      '{items}', (current_setting('roadmap_test.document')::jsonb->'items') - 0 - 0));
    raise exception 'mass removal accepted without approval';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.visual_roadmap) <> 2 then raise exception 'failure replaced history'; end if;
end $$;
select 'PASS: Plane sync idempotence, change, v1/v2 public read, empty/mass-removal preservation';
