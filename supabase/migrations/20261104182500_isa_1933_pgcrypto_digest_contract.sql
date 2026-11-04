-- VANTA-131 / #1933. Detect a broken pgcrypto contract before runtime.
-- This probe changes no schema object and cannot repair a failed historical chain.
begin;
do $probe$
declare expected constant text := '6738bfc70361a193446e86934c58b83336f69da45ec84ae0471af1cc6493969a';
begin
  if to_regprocedure('public.digest(text,text)') is null
    or to_regprocedure('public.digest(bytea,text)') is null
    or to_regprocedure('extensions.digest(text,text)') is null
    or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'pgcrypto_digest_signature_missing: public and extensions require text,text and bytea,text'
      using errcode = '55000';
  end if;
  if encode(public.digest('vantare'::text,'sha256'::text),'hex') is distinct from expected
    or encode(public.digest(convert_to('vantare','UTF8'),'sha256'::text),'hex') is distinct from expected then
    raise exception 'pgcrypto_digest_vector_mismatch: public.digest SHA-256 vantare'
      using errcode = '55000';
  end if;
end $probe$;
commit;
