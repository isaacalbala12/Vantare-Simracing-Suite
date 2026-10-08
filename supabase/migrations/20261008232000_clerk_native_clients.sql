-- Native OAuth and web TPA resolve the exact same mapping. No shadow Auth users.
begin;
create or replace function public.native_resolve_account(issuer text,subject text)
returns uuid language sql security definer set search_path='' as $$
  select private.resolve_account_identity(issuer,subject)
$$;
revoke all on function public.native_resolve_account(text,text) from public,anon,authenticated;
grant execute on function public.native_resolve_account(text,text) to service_role;
create or replace function public.native_claim_license_device(issuer text,subject text,device_fingerprint text)
returns uuid language plpgsql security definer set search_path='' as $$
declare account uuid; bound text;
begin
  if device_fingerprint is null or device_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'invalid_device'; end if;
  account:=private.resolve_account_identity(issuer,subject);
  insert into public.devices(user_id,fingerprint_hash,first_seen_at,last_seen_at)
    values(account,device_fingerprint,now(),now()) on conflict(user_id) do nothing;
  select fingerprint_hash into bound from public.devices where user_id=account for update;
  if bound is null or bound=device_fingerprint then
    update public.devices set fingerprint_hash=device_fingerprint,last_seen_at=now() where user_id=account;
  end if;
  return account;
end $$;
revoke all on function public.native_claim_license_device(text,text,text) from public,anon,authenticated;
grant execute on function public.native_claim_license_device(text,text,text) to service_role;
-- Table already exists when integrating the candidate's #1451 migration.
create table if not exists public.module_rollout (
  module text primary key check(module in ('vantare.module.analysis','vantare.module.calendar','vantare.module.engineer','vantare.module.strategy')),
  enabled_for_all boolean not null default false,updated_at timestamptz not null default now()
);
alter table public.module_rollout enable row level security;
revoke all on public.module_rollout from public,anon,authenticated;
grant select,insert,update,delete on public.module_rollout to service_role;
insert into public.module_rollout(module) values('vantare.module.analysis'),('vantare.module.calendar'),('vantare.module.engineer'),('vantare.module.strategy') on conflict do nothing;
commit;
