-- #1608: validate before identity/device mutation. No existing rows rewritten.
begin;
create or replace function public.claim_active_device(device_fingerprint text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if device_fingerprint is null or device_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_identity';
  end if;
  return private.claim_account_device(private.resolve_current_account(), device_fingerprint);
end;
$$;
create or replace function public.reset_active_device(device_fingerprint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_fp text := device_fingerprint;
  v_last_reset timestamptz;
begin
  if v_fp is null or v_fp !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_identity';
  end if;
  v_user_id := private.resolve_current_account();

  select device_row.last_reset_at into v_last_reset
  from public.devices device_row
  where device_row.user_id = v_user_id
  for update;

  if v_last_reset is not null and v_last_reset > now() - interval '24 hours' then
    raise exception 'rate_limit: solo 1 reset cada 24h';
  end if;

  insert into public.devices (
    user_id, fingerprint_hash, first_seen_at, last_seen_at, last_reset_at
  )
  values (v_user_id, v_fp, now(), now(), now())
  on conflict (user_id) do update
  set fingerprint_hash = excluded.fingerprint_hash,
      last_seen_at = excluded.last_seen_at,
      last_reset_at = excluded.last_reset_at;
end;
$$;
commit;
