do $rollback$
begin
  if pg_catalog.obj_description(
    pg_catalog.to_regprocedure('public.gen_random_uuid()')::oid,
    'pg_proc'
  ) = 'Vantare hosted compatibility wrapper for explicit public.gen_random_uuid calls.' then
    drop function public.gen_random_uuid();
  end if;
end
$rollback$;
