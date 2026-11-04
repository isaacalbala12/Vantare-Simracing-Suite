-- Run after the historical compatibility migration and the new bridge.
-- fixture.pgcrypto_schema names the native extension location for this DB.
do $test$
declare native_schema text;
begin
 select n.nspname into native_schema from pg_extension e
 join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
 if native_schema is distinct from current_setting('fixture.pgcrypto_schema') then
  raise exception 'pgcrypto_native_schema_changed' using errcode='55000';
 end if;
 if to_regprocedure('public.digest(text,text)') is null
   or to_regprocedure('public.digest(bytea,text)') is null
   or to_regprocedure('extensions.digest(text,text)') is null
   or to_regprocedure('extensions.digest(bytea,text)') is null then
  raise exception 'pgcrypto_digest_contract_incomplete' using errcode='55000';
 end if;
 if public.digest('VANTA-131','sha256') is distinct from
     extensions.digest('VANTA-131','sha256')
   or public.digest(convert_to('VANTA-131','UTF8'),'sha256') is distinct from
     extensions.digest(convert_to('VANTA-131','UTF8'),'sha256') then
  raise exception 'pgcrypto_digest_contract_mismatch' using errcode='55000';
 end if;
end $test$;
