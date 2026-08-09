-- Hosted Supabase installs pgcrypto in the extensions schema, while the
-- established local migration harness exposes digest in public. Preserve the
-- reviewed migration contract without relocating the managed extension.

do $migration$
begin
  if pg_catalog.to_regprocedure('public.digest(text,text)') is null then
    execute $create$
      create function public.digest(data text, algorithm text)
      returns bytea
      language sql immutable strict parallel safe
      set search_path = pg_catalog, extensions
      as $body$ select extensions.digest(data, algorithm) $body$
    $create$;
  end if;

  if pg_catalog.to_regprocedure('public.digest(bytea,text)') is null then
    execute $create$
      create function public.digest(data bytea, algorithm text)
      returns bytea
      language sql immutable strict parallel safe
      set search_path = pg_catalog, extensions
      as $body$ select extensions.digest(data, algorithm) $body$
    $create$;
  end if;
end
$migration$;
