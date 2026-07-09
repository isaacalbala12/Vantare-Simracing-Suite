-- Fase 1.6E-1: hotfix device binding — qualify user_id in UPDATE/WHERE
-- Bug: PL/pgSQL ambiguous "user_id" vs RETURNS TABLE output column user_id
-- Affects: repeat same fingerprint (last_seen_at) and post-reset re-register

create or replace function public.get_account_entitlements(device_fingerprint text)
returns table(
  user_id uuid,
  email text,
  entitlements text[],
  active_device text,
  expires_at timestamptz,
  device_ok boolean,
  provider_customer_id text,
  billing_provider text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_fp text := nullif(trim(device_fingerprint), '');
  v_bound_fp text;
  v_device_ok boolean := false;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select d.fingerprint_hash into v_bound_fp
  from public.devices d
  where d.user_id = v_user_id;

  if not found then
    if v_fp is not null then
      insert into public.devices (user_id, fingerprint_hash, first_seen_at, last_seen_at)
      values (v_user_id, v_fp, now(), now());
      v_bound_fp := v_fp;
      v_device_ok := true;
    end if;
  elsif v_bound_fp is null then
    if v_fp is not null then
      update public.devices d
      set fingerprint_hash = v_fp,
          last_seen_at = now()
      where d.user_id = v_user_id;
      v_bound_fp := v_fp;
      v_device_ok := true;
    end if;
  elsif v_fp is not null and v_bound_fp = v_fp then
    update public.devices d
    set last_seen_at = now()
    where d.user_id = v_user_id;
    v_device_ok := true;
  elsif v_fp is not null and v_bound_fp <> v_fp then
    v_device_ok := false;
  end if;

  return query
  select
    p.id as user_id,
    coalesce(p.email, u.email) as email,
    coalesce(
      array_agg(ue.product_key order by ue.product_key)
        filter (where ue.product_key is not null),
      '{}'::text[]
    ) as entitlements,
    v_bound_fp as active_device,
    min(ue.expires_at) filter (
      where ue.expires_at is not null
        and ue.status in ('active', 'grace', 'past_due')
    ) as expires_at,
    v_device_ok as device_ok,
    bc.provider_customer_id,
    bc.provider as billing_provider
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.user_entitlements ue
    on ue.user_id = p.id
   and ue.status in ('active', 'grace', 'past_due')
   and (ue.expires_at is null or ue.expires_at > now())
  left join lateral (
    select bc_inner.provider_customer_id, bc_inner.provider
    from public.billing_customers bc_inner
    where bc_inner.user_id = p.id
    order by bc_inner.updated_at desc
    limit 1
  ) bc on true
  where p.id = v_user_id
  group by p.id, p.email, u.email, v_bound_fp, v_device_ok, bc.provider_customer_id, bc.provider;
end;
$$;

grant execute on function public.get_account_entitlements(text) to authenticated;