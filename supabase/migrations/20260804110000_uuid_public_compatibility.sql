-- Supabase hosted does not expose gen_random_uuid() in public, while the
-- reviewed Testing Center claim functions call it with that explicit schema.
-- Keep those immutable migrations intact and provide the narrow compatibility
-- wrapper expected by the runtime.

do $migration$
begin
  if pg_catalog.to_regprocedure('public.gen_random_uuid()') is null then
    execute $create$
      create function public.gen_random_uuid()
      returns uuid
      language sql volatile parallel safe
      set search_path = pg_catalog
      as $body$ select pg_catalog.gen_random_uuid() $body$
    $create$;
    comment on function public.gen_random_uuid() is
      'Vantare hosted compatibility wrapper for explicit public.gen_random_uuid calls.';
    revoke all on function public.gen_random_uuid()
    from public, anon, authenticated, service_role;
  end if;
end
$migration$;
