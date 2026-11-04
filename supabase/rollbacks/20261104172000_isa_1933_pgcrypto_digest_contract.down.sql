-- Remove only the bridges created when the native extension is in public.
-- RESTRICT fails closed if a newer object has acquired a catalog dependency.
begin;

do $rollback$
declare v_schema text;
begin
  select n.nspname into v_schema from pg_extension e
  join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
  if v_schema='extensions' then
    return;
  end if;
  if v_schema is distinct from 'public'
    or to_regprocedure('extensions.digest(text,text)') is null
    or to_regprocedure('extensions.digest(bytea,text)') is null
    or obj_description('extensions.digest(text,text)'::regprocedure,'pg_proc')
      is distinct from 'VANTA-131 #1933 public-pgcrypto compatibility bridge'
    or obj_description('extensions.digest(bytea,text)'::regprocedure,'pg_proc')
      is distinct from 'VANTA-131 #1933 public-pgcrypto compatibility bridge' then
    raise exception 'pgcrypto_digest_bridge_rollback_drift'
      using errcode='55000';
  end if;
  execute 'drop function extensions.digest(text,text) restrict';
  execute 'drop function extensions.digest(bytea,text) restrict';
end $rollback$;

commit;
