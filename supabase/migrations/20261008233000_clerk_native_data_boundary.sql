-- Preserve the candidate's existing 5-minute data bridge; it is not a web session.
-- Legacy Supabase login JWTs no longer authorize data, including a known UUID.
begin;
alter table private.clerk_issuers add column native_data_issuer text
  check(native_data_issuer ~ '^https://[a-z0-9]{20}\.supabase\.co/auth/v1$');
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
        and auth.jwt()->>'aud'='authenticated'
        and case when auth.jwt()->>'iat' ~ '^[0-9]{1,12}$' and auth.jwt()->>'exp' ~ '^[0-9]{1,12}$'
          then (auth.jwt()->>'exp')::bigint-(auth.jwt()->>'iat')::bigint between 1 and 300
          else false end)
    )
$$;
revoke all on function private.current_account() from public,anon,authenticated,service_role;
grant execute on function private.current_account() to authenticated;
commit;
