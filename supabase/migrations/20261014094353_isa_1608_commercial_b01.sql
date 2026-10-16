-- B01: dedicated server-signed data JWT. Empty trust registry, no activation.
begin;
alter table private.clerk_issuers add column native_data_issuer text
  check (native_data_issuer ~ '^https://[a-zA-Z0-9.:-]+/native-data/v1$'
    or native_data_issuer ~ '^http://127\.0\.0\.1(:[0-9]+)?/native-data/v1$');

create or replace function private.current_account()
returns uuid language sql stable security definer set search_path='' as $$
 select i.account_id from public.account_identities i
 join private.clerk_issuers c on c.issuer=i.issuer
 where c.enabled and i.deleted_at is null and auth.jwt()->>'role'='authenticated'
 and (
   (i.issuer=auth.jwt()->>'iss' and i.subject=auth.jwt()->>'sub'
     and auth.jwt()->>'sid' ~ '^sess_[a-zA-Z0-9_]+$'
     and auth.jwt()->>'azp'=any(c.authorized_parties))
   or
   (auth.jwt()->>'vantare_identity_provider'='clerk'
     and auth.jwt()->>'iss'=c.native_data_issuer
     and i.issuer=auth.jwt()->>'clerk_issuer' and i.subject=auth.jwt()->>'clerk_subject'
     and i.account_id::text=auth.jwt()->>'sub'
     and auth.jwt()->>'aud'='vantare-native-data'
     and case when auth.jwt()->>'iat' ~ '^[0-9]{1,12}$' and auth.jwt()->>'exp' ~ '^[0-9]{1,12}$'
       then (auth.jwt()->>'exp')::bigint-(auth.jwt()->>'iat')::bigint between 1 and 300
         and (auth.jwt()->>'iat')::bigint <= extract(epoch from now())
         and (auth.jwt()->>'exp')::bigint > extract(epoch from now())
       else false end)
 )
$$;
revoke all on function private.current_account() from public,anon,authenticated,service_role;
grant execute on function private.current_account() to authenticated;
commit;
