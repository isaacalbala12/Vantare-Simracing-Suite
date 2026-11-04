-- VANTA-131 / #1933. public.digest is the common contract. Historical
-- extensions.digest callers need a bridge only when pgcrypto lives in public.
begin;

do $migration$
declare v_schema text;
begin
  select n.nspname into v_schema from pg_extension e
  join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
  if v_schema not in ('public','extensions') or v_schema is null
    or to_regnamespace('extensions') is null
    or to_regprocedure('public.digest(text,text)') is null
    or to_regprocedure('public.digest(bytea,text)') is null then
    raise exception 'pgcrypto_digest_contract_missing'
      using errcode='55000';
  end if;

  if v_schema='extensions' then
    if to_regprocedure('extensions.digest(text,text)') is null
      or to_regprocedure('extensions.digest(bytea,text)') is null then
      raise exception 'pgcrypto_native_digest_missing'
        using errcode='55000';
    end if;
    return;
  end if;

  if to_regprocedure('extensions.digest(text,text)') is not null
    or to_regprocedure('extensions.digest(bytea,text)') is not null then
    raise exception 'pgcrypto_digest_bridge_already_exists'
      using errcode='55000';
  end if;

  execute $create_text$
    create or replace function extensions.digest(data text, algorithm text)
    returns bytea language sql immutable strict parallel safe
    set search_path = pg_catalog, public
    as $body$ select public.digest(data, algorithm) $body$;
  $create_text$;
  execute $create_bytea$
    create or replace function extensions.digest(data bytea, algorithm text)
    returns bytea language sql immutable strict parallel safe
    set search_path = pg_catalog, public
    as $body$ select public.digest(data, algorithm) $body$;
  $create_bytea$;

  execute 'revoke all on function extensions.digest(text,text) from public, anon, authenticated, service_role';
  execute 'revoke all on function extensions.digest(bytea,text) from public, anon, authenticated, service_role';
  execute 'grant execute on function extensions.digest(text,text) to public, anon, authenticated, service_role';
  execute 'grant execute on function extensions.digest(bytea,text) to public, anon, authenticated, service_role';
  execute 'comment on function extensions.digest(text,text) is ''VANTA-131 #1933 public-pgcrypto compatibility bridge''';
  execute 'comment on function extensions.digest(bytea,text) is ''VANTA-131 #1933 public-pgcrypto compatibility bridge''';
end $migration$;

commit;
