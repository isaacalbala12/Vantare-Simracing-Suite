-- #1608: restores the historical wrapper, no account/device data changes.
begin;
create or replace function public.claim_active_device(device_fingerprint text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
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
  v_user_id uuid := private.resolve_current_account();
  v_fp text := nullif(trim(device_fingerprint), '');
  v_last_reset timestamptz;
begin
  if v_fp is null then raise exception 'device_fingerprint_required'; end if;

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
