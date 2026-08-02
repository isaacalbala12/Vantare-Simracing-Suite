begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select no_plan();

create temporary table webhook_test_ids (
  name text primary key,
  inbox_id uuid not null
);

insert into webhook_test_ids
select 'primary', inbox_id
from public.billing_receive_webhook(
  'polar',
  'evt_sql_primary',
  'order.paid',
  repeat('a', 64),
  '{"type":"order.paid","data":{"product_id":"product-1"}}'::jsonb
);

select is(
  (select status from public.billing_webhook_inbox where provider_event_id = 'evt_sql_primary'),
  'received',
  'a verified delivery is persisted before processing'
);

select is(
  (select count(*)::integer from public.billing_webhook_inbox where provider_event_id = 'evt_sql_primary'),
  1,
  'the provider event identity is unique'
);

select is(
  (select delivery_status from public.billing_receive_webhook(
    'polar', 'evt_sql_primary', 'order.paid', repeat('a', 64),
    '{"type":"order.paid","data":{"product_id":"product-1"}}'::jsonb
  )),
  'received',
  'same-body redelivery reuses the durable receipt'
);

select ok(
  (select payload_matches from public.billing_receive_webhook(
    'polar', 'evt_sql_primary', 'order.paid', repeat('a', 64),
    '{"type":"order.paid","data":{"product_id":"product-1"}}'::jsonb
  )),
  'same-body redelivery confirms its hash'
);

select is(
  (select claim_status from public.billing_claim_webhook(
    (select inbox_id from webhook_test_ids where name = 'primary'),
    '00000000-0000-4000-8000-000000000001',
    60
  )),
  'claimed',
  'the first worker atomically claims the event'
);

select is(
  (select attempt_count from public.billing_webhook_inbox where provider_event_id = 'evt_sql_primary'),
  1,
  'the first successful claim increments attempt_count exactly once'
);

select is(
  (select claim_status from public.billing_claim_webhook(
    (select inbox_id from webhook_test_ids where name = 'primary'),
    '00000000-0000-4000-8000-000000000002',
    60
  )),
  'busy',
  'a concurrent worker cannot claim the active lease'
);

select ok(
  (select lease_expires_at is not null from public.billing_claim_webhook(
    (select inbox_id from webhook_test_ids where name = 'primary'),
    '00000000-0000-4000-8000-000000000003',
    60
  )),
  'a busy claim exposes the durable lease expiry for Retry-After'
);

select is(
  (select claim_status from public.billing_claim_webhook_effect(
    (select inbox_id from webhook_test_ids where name = 'primary'),
    'billing_customer',
    '00000000-0000-4000-8000-000000000001',
    60
  )),
  'claimed',
  'a pending effect is claimed independently'
);

select ok(
  (select completed from public.billing_complete_webhook_effect(
    (select inbox_id from webhook_test_ids where name = 'primary'),
    'billing_customer',
    '00000000-0000-4000-8000-000000000001'
  )),
  'the effect is durably completed'
);

select is(
  (select claim_status from public.billing_claim_webhook_effect(
    (select inbox_id from webhook_test_ids where name = 'primary'),
    'billing_customer',
    '00000000-0000-4000-8000-000000000001',
    60
  )),
  'completed',
  'a completed effect is skipped on retry'
);

select isnt(
  (select completed from public.billing_complete_webhook(
    (select inbox_id from webhook_test_ids where name = 'primary'),
    '00000000-0000-4000-8000-000000000099'
  )),
  true,
  'a worker with the wrong lease cannot complete the event'
);

select is(
  (select status from public.billing_webhook_inbox where provider_event_id = 'evt_sql_primary'),
  'processing',
  'a rejected completion leaves the active transaction intact'
);

select is(
  (select failure_status from public.billing_fail_webhook(
    (select inbox_id from webhook_test_ids where name = 'primary'),
    '00000000-0000-4000-8000-000000000001',
    'database_unavailable'
  )),
  'failed',
  'a failed attempt remains durably retryable'
);

select is(
  (select last_error_code from public.billing_webhook_inbox where provider_event_id = 'evt_sql_primary'),
  'database_unavailable',
  'only the sanitized error code is retained'
);

select is(
  (select attempt_count from public.billing_webhook_inbox where provider_event_id = 'evt_sql_primary'),
  1,
  'recording a failure does not increment attempt_count again'
);

select ok(
  (select next_attempt_at > now() from public.billing_webhook_inbox where provider_event_id = 'evt_sql_primary'),
  'a failed attempt stores a future next_attempt_at'
);

select is(
  (select claim_status from public.billing_claim_webhook(
    (select inbox_id from webhook_test_ids where name = 'primary'),
    '00000000-0000-4000-8000-000000000002',
    60
  )),
  'retry_scheduled',
  'bounded backoff prevents an immediate hot retry'
);

select is(
  (select attempt_count from public.billing_webhook_inbox where provider_event_id = 'evt_sql_primary'),
  1,
  'a scheduled retry response does not consume another attempt'
);

update public.billing_webhook_inbox
set next_attempt_at = now() - interval '1 second'
where provider_event_id = 'evt_sql_primary';

select is(
  (select claim_status from public.billing_claim_webhook(
    (select inbox_id from webhook_test_ids where name = 'primary'),
    '00000000-0000-4000-8000-000000000002',
    60
  )),
  'claimed',
  'a due retry can reclaim the event'
);

select is(
  (select attempt_count from public.billing_webhook_inbox where provider_event_id = 'evt_sql_primary'),
  2,
  'the due retry increments attempt_count exactly once'
);

select ok(
  (select completed from public.billing_complete_webhook(
    (select inbox_id from webhook_test_ids where name = 'primary'),
    '00000000-0000-4000-8000-000000000002'
  )),
  'the retried event can complete'
);

select is(
  (select delivery_status from public.billing_receive_webhook(
    'polar', 'evt_sql_primary', 'order.paid', repeat('a', 64),
    '{"type":"order.paid","data":{"product_id":"product-1"}}'::jsonb
  )),
  'processed',
  'redelivery after success observes the processed state'
);

insert into webhook_test_ids
select 'orphan', inbox_id
from public.billing_receive_webhook(
  'polar', 'evt_sql_orphan', 'subscription.active', repeat('b', 64),
  '{"type":"subscription.active","data":{"product_id":"product-2"}}'::jsonb
);

select is(
  (select claim_status from public.billing_claim_webhook(
    (select inbox_id from webhook_test_ids where name = 'orphan'),
    '00000000-0000-4000-8000-000000000003',
    60
  )),
  'claimed',
  'the orphan scenario starts with a valid lease'
);

update public.billing_webhook_inbox
set lease_expires_at = now() - interval '1 second'
where provider_event_id = 'evt_sql_orphan';

select is(
  (select claim_status from public.billing_claim_webhook(
    (select inbox_id from webhook_test_ids where name = 'orphan'),
    '00000000-0000-4000-8000-000000000004',
    60
  )),
  'claimed',
  'an expired processing lease is recoverable'
);

select is(
  (select attempt_count from public.billing_webhook_inbox where provider_event_id = 'evt_sql_orphan'),
  2,
  'reclaiming an orphan records the second processing attempt'
);

select is(
  extensions.dblink_connect(
    'billing_worker_one',
    'host=host.docker.internal port=54322 dbname=' || current_database() ||
      ' user=postgres password=postgres'
  ),
  'OK',
  'the integration test opens PostgreSQL worker session one'
);

select is(
  extensions.dblink_connect(
    'billing_worker_two',
    'host=host.docker.internal port=54322 dbname=' || current_database() ||
      ' user=postgres password=postgres'
  ),
  'OK',
  'the integration test opens PostgreSQL worker session two'
);

select ok(
  extensions.dblink_exec(
    'billing_worker_one',
    $$delete from public.billing_webhook_inbox
      where provider_event_id in ('evt_sql_real_race', 'evt_sql_rollback')$$
  ) ~ '^DELETE [0-9]+$',
  'stale external-session fixtures are cleared before the race'
);

insert into webhook_test_ids
select 'race', inbox_id::uuid
from extensions.dblink(
  'billing_worker_one',
  $remote$
    select inbox_id::text
    from public.billing_receive_webhook(
      'polar', 'evt_sql_real_race', 'order.paid', repeat('e', 64),
      '{"type":"order.paid","data":{"product_id":"product-race"}}'::jsonb
    )
  $remote$
) as remote_receipt(inbox_id text);

select is(
  extensions.dblink_exec('billing_worker_one', 'begin'),
  'BEGIN',
  'worker one starts an explicit transaction'
);

select ok(
  extensions.dblink_send_query(
    'billing_worker_one',
    format(
      $remote$
        select claim_status
        from public.billing_claim_webhook(
          %L::uuid, '00000000-0000-4000-8000-000000000010', 60
        )
      $remote$,
      (select inbox_id from webhook_test_ids where name = 'race')
    )
  ) = 1,
  'worker one sends its claim on a separate PostgreSQL session'
);

select is(
  (select claim_status from extensions.dblink_get_result('billing_worker_one') as result(claim_status text)),
  'claimed',
  'worker one owns the lease while its transaction remains open'
);

select is(
  (select count(*)::integer from extensions.dblink_get_result('billing_worker_one') as drained(claim_status text)),
  0,
  'worker one drains the asynchronous result before committing'
);

select ok(
  extensions.dblink_send_query(
    'billing_worker_two',
    format(
      $remote$
        select claim_status
        from public.billing_claim_webhook(
          %L::uuid, '00000000-0000-4000-8000-000000000011', 60
        )
      $remote$,
      (select inbox_id from webhook_test_ids where name = 'race')
    )
  ) = 1,
  'worker two races for the same row from another PostgreSQL session'
);

select is(
  extensions.dblink_is_busy('billing_worker_two'),
  1,
  'worker two blocks on the row lock while worker one is uncommitted'
);

select is(
  extensions.dblink_exec('billing_worker_one', 'commit'),
  'COMMIT',
  'worker one commits the winning claim'
);

select is(
  (select claim_status from extensions.dblink_get_result('billing_worker_two') as result(claim_status text)),
  'busy',
  'the losing concurrent session observes the committed active lease'
);

select is(
  (select count(*)::integer from extensions.dblink_get_result('billing_worker_two') as drained(claim_status text)),
  0,
  'worker two drains the asynchronous result before reuse'
);

select is(
  (select attempt_count from public.billing_webhook_inbox where provider_event_id = 'evt_sql_real_race'),
  1,
  'the real two-session race consumes only one attempt'
);

insert into webhook_test_ids
select 'rollback', inbox_id::uuid
from extensions.dblink(
  'billing_worker_one',
  $remote$
    select inbox_id::text
    from public.billing_receive_webhook(
      'polar', 'evt_sql_rollback', 'order.paid', repeat('f', 64),
      '{"type":"order.paid","data":{"product_id":"product-rollback"}}'::jsonb
    )
  $remote$
) as remote_receipt(inbox_id text);

select is(extensions.dblink_exec('billing_worker_one', 'begin'), 'BEGIN', 'rollback worker begins');

select is(
  (select claim_status from extensions.dblink(
    'billing_worker_one',
    format(
      $remote$
        select claim_status
        from public.billing_claim_webhook(
          %L::uuid, '00000000-0000-4000-8000-000000000012', 60
        )
      $remote$,
      (select inbox_id from webhook_test_ids where name = 'rollback')
    )
  ) as result(claim_status text)),
  'claimed',
  'the rollback scenario claims inside an explicit transaction'
);

select is(
  extensions.dblink_exec('billing_worker_one', 'rollback'),
  'ROLLBACK',
  'rolling back removes the tentative lease and attempt increment'
);

select is(
  (select claim_status from extensions.dblink(
    'billing_worker_two',
    format(
      $remote$
        select claim_status
        from public.billing_claim_webhook(
          %L::uuid, '00000000-0000-4000-8000-000000000013', 60
        )
      $remote$,
      (select inbox_id from webhook_test_ids where name = 'rollback')
    )
  ) as result(claim_status text)),
  'claimed',
  'another session can claim after the first transaction rolls back'
);

select is(
  (select attempt_count from public.billing_webhook_inbox where provider_event_id = 'evt_sql_rollback'),
  1,
  'the rolled-back claim is absent from the durable attempt_count'
);

select is(
  extensions.dblink_exec(
    'billing_worker_one',
    $$delete from public.billing_webhook_inbox
      where provider_event_id in ('evt_sql_real_race', 'evt_sql_rollback')$$
  ),
  'DELETE 2',
  'two-session fixtures are removed outside the pgTAP transaction'
);

select is(extensions.dblink_disconnect('billing_worker_one'), 'OK', 'worker session one disconnects');
select is(extensions.dblink_disconnect('billing_worker_two'), 'OK', 'worker session two disconnects');

insert into webhook_test_ids
select 'conflict', inbox_id
from public.billing_receive_webhook(
  'polar', 'evt_sql_conflict', 'order.paid', repeat('c', 64),
  '{"type":"order.paid","data":{}}'::jsonb
);

select isnt(
  (select payload_matches from public.billing_receive_webhook(
    'polar', 'evt_sql_conflict', 'order.paid', repeat('d', 64),
    '{"type":"order.paid","data":{"changed":true}}'::jsonb
  )),
  true,
  'the same identity with a different body is rejected'
);

select is(
  (select status from public.billing_webhook_inbox where provider_event_id = 'evt_sql_conflict'),
  'quarantined',
  'a hash conflict is quarantined'
);

select ok(
  (select replay_queued from public.billing_replay_webhook(
    (select inbox_id from webhook_test_ids where name = 'conflict'),
    'operator_isa68',
    'payload_reviewed'
  )),
  'an administrative replay can be queued after review'
);

select is(
  (select count(*)::integer from public.billing_webhook_replay_audit
    where inbox_id = (select inbox_id from webhook_test_ids where name = 'conflict')),
  1,
  'manual replay leaves a non-PII audit record'
);

select isnt(
  has_table_privilege('authenticated', 'public.billing_webhook_inbox', 'select'),
  true,
  'authenticated clients cannot read stored webhook payloads'
);

select isnt(
  has_function_privilege(
    'authenticated',
    'public.billing_replay_webhook(uuid,text,text)',
    'execute'
  ),
  true,
  'authenticated clients cannot request replay'
);

select * from finish();
rollback;
