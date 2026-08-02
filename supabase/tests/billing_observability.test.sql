begin;
select plan(20);

select has_function(
  'public', 'billing_observability_snapshot',
  array['text', 'timestamp with time zone'],
  'aggregate billing observability function exists'
);
select ok(
  not has_function_privilege('anon', 'public.billing_observability_snapshot(text,timestamptz)', 'execute'),
  'anon cannot inspect billing operations'
);
select ok(
  not has_function_privilege('authenticated', 'public.billing_observability_snapshot(text,timestamptz)', 'execute'),
  'authenticated cannot inspect billing operations'
);
select ok(
  has_function_privilege('service_role', 'public.billing_observability_snapshot(text,timestamptz)', 'execute'),
  'service role can read aggregate operations'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.billing_receive_webhook(text,text,text,text,jsonb)',
    'execute'
  ),
  'the old runtime can continue receiving during the deployment transition'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.billing_receive_webhook(text,text,text,text,jsonb)',
    'execute'
  ),
  'the transitional overload remains server-only'
);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000751', 'observability@example.invalid')
on conflict (id) do nothing;
insert into public.profiles (id, email) values
  ('00000000-0000-4000-8000-000000000751', 'observability@example.invalid')
on conflict (id) do nothing;

insert into public.billing_webhook_inbox (
  provider, environment, provider_event_id, event_type, payload_hash, payload, status,
  attempt_count, duplicate_count, next_attempt_at, lease_token,
  lease_expires_at, received_at
) values
  ('polar', 'sandbox', 'private-received-id', 'order.paid', repeat('1',64), '{}'::jsonb,
   'received', 0, 3, '2026-08-02T11:00:00Z', null, null, '2026-08-02T11:50:00Z'),
  ('polar', 'sandbox', 'private-retry-id', 'order.paid', repeat('2',64), '{}'::jsonb,
   'failed', 2, 0, '2026-08-02T11:59:00Z', null, null, '2026-08-02T11:45:00Z'),
  ('polar', 'sandbox', 'private-orphan-id', 'subscription.updated', repeat('3',64), '{}'::jsonb,
   'processing', 1, 0, '2026-08-02T12:30:00Z', gen_random_uuid(),
   '2026-08-02T11:59:00Z', '2026-08-02T11:40:00Z'),
  ('polar', 'sandbox', 'private-quarantine-id', 'refund.updated', repeat('4',64), '{}'::jsonb,
   'quarantined', 5, 0, '2026-08-02T11:00:00Z', null, null, '2026-08-02T11:30:00Z');

insert into public.billing_webhook_inbox (
  provider, environment, provider_event_id, event_type, payload_hash, payload,
  status, received_at
) values
  ('polar', 'production', 'private-received-id', 'order.paid', repeat('8',64),
   '{}'::jsonb, 'received', '2026-08-02T11:20:00Z'),
  ('polar', 'unclassified', 'legacy-pending-id', 'order.paid', repeat('9',64),
   '{}'::jsonb, 'received', '2026-08-02T11:10:00Z');

insert into public.billing_webhook_replay_audit (
  inbox_id, actor_id, reason_code, previous_status, requested_at
)
select id, 'operator_bil10', 'approved_test', status, '2026-08-02T11:30:00Z'
from public.billing_webhook_inbox
where provider_event_id = 'private-received-id'
  and environment in ('sandbox', 'production');

insert into public.billing_commercial_resources (
  user_id, provider, environment, resource_type, resource_id, remote_state,
  remote_modified_at, snapshot_hash, conflict_count, stale_event_count,
  last_stale_event_at
) values (
  '00000000-0000-4000-8000-000000000751', 'polar', 'sandbox', 'subscription',
  'private-resource-id', 'active', '2026-08-02T11:00:00Z', repeat('5',64),
  1, 2, '2026-08-02T11:30:00Z'
);

insert into public.billing_access_grants (
  user_id, provider, environment, source_type, source_id, capability, status,
  valid_until, resource_modified_at, snapshot_hash
) values (
  '00000000-0000-4000-8000-000000000751', 'polar', 'sandbox', 'subscription',
  'private-resource-id', 'vantare.plan.pro', 'active', '2026-08-02T11:59:00Z',
  '2026-08-02T11:00:00Z', repeat('5',64)
);

insert into public.billing_reconciliation_runs (
  user_id, provider, environment, trigger_kind, snapshot_hash, plan_hash,
  observed_hash, plan, operation_count, changed_count, status, created_at
) values (
  '00000000-0000-4000-8000-000000000751', 'polar', 'sandbox', 'scheduled',
  repeat('6',64), repeat('7',64), repeat('6',64), '[]'::jsonb, 0, 2,
  'applied', '2026-08-02T11:55:00Z'
);

create temp table observed as
select public.billing_observability_snapshot(
  'sandbox', '2026-08-02T12:00:00Z'
) as value;

select is((select (value #>> '{inbox,received}')::integer from observed), 1, 'received count is aggregated');
select is(
  (select (value #>> '{inbox,duplicateDeliveries}')::integer from observed),
  3,
  'duplicate deliveries are aggregated without exposing event identity'
);
select is(
  (select (value #>> '{inbox,unclassified}')::integer from observed),
  1,
  'legacy receipts remain visible without being attributed to an environment'
);
select is(
  (select count(*)::integer from public.billing_webhook_inbox
   where environment = 'production' and provider_event_id = 'private-received-id'),
  1,
  'production receipts remain separate from the sandbox snapshot'
);
select is(
  (select (value #>> '{inbox,replays24h}')::integer from observed),
  1,
  'replay metrics include only the selected environment'
);
select is((select (value #>> '{inbox,retryDue}')::integer from observed), 1, 'due retry is visible');
select is((select (value #>> '{inbox,orphaned}')::integer from observed), 1, 'expired processing lease is visible');
select is((select (value #>> '{inbox,oldestPendingSeconds}')::integer from observed), 1200, 'oldest pending age is visible');
select is(
  (select (public.billing_observability_snapshot(
    'production', '2026-08-02T11:00:00Z'
  ) #>> '{inbox,oldestPendingSeconds}')::integer),
  0,
  'future timestamps cannot produce a negative lag'
);
select cmp_ok(
  (select (value #>> '{reconciliation,changed24h}')::integer from observed),
  '>=', 2,
  'reconciliation changes include the observed run'
);
select is((select (value #>> '{projection,resourcesWithConflicts}')::integer from observed), 1, 'projection conflict is visible');
select is((select (value #>> '{projection,incoherentActiveGrants}')::integer from observed), 1, 'expired active grant is visible');
select ok(
  (select value::text from observed) not like '%private-%'
  and (select value::text from observed) not like '%observability@example.invalid%',
  'snapshot contains no resource ids or email PII'
);

select throws_ok(
  $$select public.billing_observability_snapshot('unknown', now())$$,
  'P0001', 'invalid_billing_observability_request',
  'unknown environments fail closed'
);

select * from finish();
rollback;
