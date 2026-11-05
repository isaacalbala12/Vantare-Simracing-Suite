-- Known SHA-256 vector is independent of either pgcrypto schema layout.
begin;
create function public.pgcrypto_contract_definer_probe()
returns bytea language sql security definer set search_path = ''
as $$ select public.digest('vantare'::text, 'sha256'::text) $$;

do $test$
declare expected text := '6738bfc70361a193446e86934c58b83336f69da45ec84ae0471af1cc6493969a';
begin
  if to_regprocedure('public.digest(text,text)') is null
    or to_regprocedure('public.digest(bytea,text)') is null
    or to_regprocedure('extensions.digest(text,text)') is null
    or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'pgcrypto_digest_signature_missing' using errcode = '55000';
  end if;
  if encode(public.digest('vantare'::text,'sha256'::text),'hex') <> expected
    or encode(public.digest(convert_to('vantare','UTF8'),'sha256'::text),'hex') <> expected
    or encode(extensions.digest('vantare'::text,'sha256'::text),'hex') <> expected
    or encode(extensions.digest(convert_to('vantare','UTF8'),'sha256'::text),'hex') <> expected
    or encode(public.pgcrypto_contract_definer_probe(),'hex') <> expected then
    raise exception 'pgcrypto_digest_vector_mismatch' using errcode = '55000';
  end if;
end $test$;
rollback;
