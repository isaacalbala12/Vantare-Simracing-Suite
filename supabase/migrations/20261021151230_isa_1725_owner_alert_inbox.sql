-- #1725 / VANTA-96: operational alerts contain no account/customer identifiers.
begin;
create table private.billing_owner_alert_inbox (
  environment text not null check (environment in ('sandbox','production')),
  alert_type text not null check (alert_type in ('checkout_refund_failed','checkout_verification_pending',
    'web_erasure_failed','web_erasure_worker_stale','checkout_review')),
  alert_id text not null check (alert_id ~ '^[0-9a-f]{64}$'),
  code text not null check (code ~ '^[a-z][a-z0-9_]{0,63}$'),
  email_key uuid not null default gen_random_uuid(),
  received_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  attempts integer not null default 0,
  primary key (environment, alert_type, alert_id),
  check ((lease_token is null) = (lease_expires_at is null))
);
alter table private.billing_owner_alert_inbox enable row level security;
revoke all on private.billing_owner_alert_inbox from public, anon, authenticated, service_role;

-- Only the receiver's server credential can reach these bounded operations.
create function public.billing_owner_alert_claim(
  p_environment text, p_type text, p_id text, p_code text, p_lease uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r private.billing_owner_alert_inbox%rowtype;
begin
  if p_lease is null then raise exception 'owner_alert_invalid_lease' using errcode='22023'; end if;
  delete from private.billing_owner_alert_inbox where (environment,alert_type,alert_id) in (
    select environment,alert_type,alert_id from private.billing_owner_alert_inbox
    where sent_at < clock_timestamp()-interval '30 days' limit 100 for update skip locked
  );
  insert into private.billing_owner_alert_inbox(environment,alert_type,alert_id,code)
    values(p_environment,p_type,p_id,p_code) on conflict do nothing;
  select * into strict r from private.billing_owner_alert_inbox
    where environment=p_environment and alert_type=p_type and alert_id=p_id for update;
  if r.sent_at is not null then return jsonb_build_object('state','sent'); end if;
  if r.lease_expires_at > clock_timestamp() then return jsonb_build_object('state','busy'); end if;
  update private.billing_owner_alert_inbox set lease_token=p_lease,
    lease_expires_at=clock_timestamp()+interval '60 seconds', attempts=attempts+1
    where environment=p_environment and alert_type=p_type and alert_id=p_id;
  -- First received code is immutable; replay cannot change the email content.
  return jsonb_build_object('state','claimed','email_key',r.email_key,'code',r.code);
end $$;

create function public.billing_owner_alert_finish(
  p_environment text, p_type text, p_id text, p_lease uuid, p_sent boolean
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_sent is null then raise exception 'owner_alert_invalid_result' using errcode='22023'; end if;
  update private.billing_owner_alert_inbox set
    sent_at=case when p_sent then clock_timestamp() else null end,
    lease_token=null, lease_expires_at=null
    where environment=p_environment and alert_type=p_type and alert_id=p_id
      and lease_token=p_lease and lease_expires_at>clock_timestamp() and sent_at is null;
  return found;
end $$;
revoke all on function public.billing_owner_alert_claim(text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.billing_owner_alert_finish(text,text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.billing_owner_alert_claim(text,text,text,text,uuid) to service_role;
grant execute on function public.billing_owner_alert_finish(text,text,text,uuid,boolean) to service_role;
commit;
