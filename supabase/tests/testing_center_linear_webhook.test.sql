begin;

select plan(27);

select has_table('public', 'testing_center_linear_issue_bindings',
  'server-owned Linear issue binding exists');
select has_table('public', 'testing_center_linear_state_mappings',
  'reviewed Linear state allowlist exists');
select has_table('public', 'testing_center_linear_webhook_deliveries',
  'durable Linear delivery ledger exists');
select has_table('public', 'testing_center_linear_reconciliations',
  'observational reconciliation state exists');
select ok(
  (select bool_and(relrowsecurity and relforcerowsecurity)
   from pg_class where oid = any(array[
     'public.testing_center_linear_issue_bindings'::regclass,
     'public.testing_center_linear_state_mappings'::regclass,
     'public.testing_center_linear_webhook_deliveries'::regclass,
     'public.testing_center_linear_reconciliations'::regclass
   ])),
  'all TAU-07F tables force RLS'
);
select ok(
  not has_table_privilege('authenticated',
    'public.testing_center_linear_webhook_deliveries', 'select')
  and not has_table_privilege('service_role',
    'public.testing_center_linear_webhook_deliveries', 'insert'),
  'clients cannot inspect deliveries and service role cannot bypass RPCs'
);
select ok(
  has_function_privilege('service_role',
    'public.testing_center_reconcile_linear_webhook(uuid,uuid,uuid,uuid,text,text,bigint,timestamptz,uuid,text)',
    'execute')
  and not has_function_privilege('authenticated',
    'public.testing_center_reconcile_linear_webhook(uuid,uuid,uuid,uuid,text,text,bigint,timestamptz,uuid,text)',
    'execute'),
  'only service role can submit verified facts to reconciliation'
);
select hasnt_column('public', 'testing_center_linear_webhook_deliveries',
  'raw_body', 'raw webhook body is not persisted');
select hasnt_column('public', 'testing_center_linear_webhook_deliveries',
  'signature', 'webhook signature is not persisted');

update public.testing_center_effect_outbox
set state = 'dry_run_completed'
where technical_issue_id = 'issue_legacy_pending'
  and effect_type = 'linear_issue_create';

create temporary table isa240_canonical_before as
select
  (select to_jsonb(effect) from public.testing_center_effect_outbox effect
   where effect.technical_issue_id = 'issue_legacy_pending'
     and effect.effect_type = 'linear_issue_create') as effect_row,
  (select to_jsonb(issue) from public.testing_center_technical_issues issue
   where issue.technical_issue_id = 'issue_legacy_pending') as issue_row;

set role service_role;

select lives_ok(
  $$ select public.testing_center_bind_linear_issue(
    (select effect_id from public.testing_center_effect_outbox
     where technical_issue_id = 'issue_legacy_pending'
       and effect_type = 'linear_issue_create'),
    '44444444-4444-4444-8444-444444444444'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid,
    'isa240-owner') $$,
  'a completed selected Linear effect can be bound once'
);
select is(
  (select observed_state from public.testing_center_linear_reconciliations
   where external_issue_id = '44444444-4444-4444-8444-444444444444'),
  'linear_created',
  'binding starts as observational linear_created without a webhook claim'
);

select lives_ok(
  $$ select public.testing_center_upsert_linear_state_mapping(
    '33333333-3333-4333-8333-333333333333'::uuid,
    '55555555-5555-4555-8555-555555555555'::uuid,
    'awaiting_owner', 'isa240-owner', true) $$,
  'owner-reviewed state UUID can be mapped to a coarse state'
);
select is(
  (select delivery_status || ':' || current_observed_state
   from public.testing_center_reconcile_linear_webhook(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    'Issue', 'create', 1785758400000,
    '2026-08-03T12:00:00Z',
    '55555555-5555-4555-8555-555555555555', repeat('a',64))),
  'applied:linear_created',
  'create delivery is durably applied as linear_created'
);
select is(
  (select delivery_status from public.testing_center_reconcile_linear_webhook(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    'Issue', 'create', 1785758400000,
    '2026-08-03T12:00:00Z',
    '55555555-5555-4555-8555-555555555555', repeat('a',64))),
  'duplicate',
  'exact delivery replay is idempotent'
);
select throws_ok(
  $$ select * from public.testing_center_reconcile_linear_webhook(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    'Issue', 'create', 1785758400000,
    '2026-08-03T12:00:00Z',
    '55555555-5555-4555-8555-555555555555', repeat('b',64)) $$,
  '23505', 'testing_center_linear_delivery_conflict',
  'same delivery UUID with different signed-body digest fails closed'
);
select is(
  (select delivery_status || ':' || current_observed_state
   from public.testing_center_reconcile_linear_webhook(
    '66666666-6666-4666-8666-666666666666',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    'Issue', 'update', 1785758401000,
    '2026-08-03T12:00:01Z',
    '55555555-5555-4555-8555-555555555555', repeat('c',64))),
  'applied:awaiting_owner',
  'reviewed state UUID updates only the observational coarse state'
);
select is(
  (select delivery_status || ':' || current_observed_state
   from public.testing_center_reconcile_linear_webhook(
    '77777777-7777-4777-8777-777777777777',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    'Issue', 'update', 1785758402000,
    '2026-08-03T12:00:02Z', null, repeat('d',64))),
  'ignored:awaiting_owner',
  'non-state issue edits advance order watermark but do not invent state'
);
select is(
  (select delivery_status || ':' || current_observed_state
   from public.testing_center_reconcile_linear_webhook(
    '88888888-8888-4888-8888-888888888888',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    'Issue', 'update', 1785758403000,
    '2026-08-03T12:00:03Z',
    '99999999-9999-4999-8999-999999999999', repeat('e',64))),
  'needs_owner:awaiting_owner',
  'unknown state UUID needs owner and cannot change observation'
);
select is(
  (select delivery_status || ':' || current_observed_state
   from public.testing_center_reconcile_linear_webhook(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    'Issue', 'update', 1785758402500,
    '2026-08-03T12:00:02.500Z',
    '55555555-5555-4555-8555-555555555555', repeat('f',64))),
  'stale:awaiting_owner',
  'out-of-order delivery cannot regress the observed state'
);

select public.testing_center_upsert_linear_state_mapping(
  '33333333-3333-4333-8333-333333333333',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'needs_changes', 'isa240-owner', true);
select is(
  (select delivery_status || ':' || current_observed_state
   from public.testing_center_reconcile_linear_webhook(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    'Issue', 'update', 1785758404000,
    '2026-08-03T12:00:04Z',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', repeat('1',64))),
  'applied:needs_changes',
  'newer reviewed state can represent tester rejection'
);
select is(
  (select delivery_status || ':' || current_observed_state
   from public.testing_center_reconcile_linear_webhook(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    'Issue', 'remove', 1785758405000,
    '2026-08-03T12:00:05Z', null, repeat('2',64))),
  'applied:stopped',
  'remove is observed as stopped without invoking an execution action'
);

do $$
declare i integer; v_status text;
begin
  for i in 1..100 loop
    select delivery_status into v_status
    from public.testing_center_reconcile_linear_webhook(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      'Issue', 'remove', 1785758405000,
      '2026-08-03T12:00:05Z', null, repeat('2',64));
    if v_status <> 'duplicate' then raise exception 'replay_not_duplicate'; end if;
  end loop;
end $$;
select is(
  (select count(*)::integer from public.testing_center_linear_webhook_deliveries),
  7,
  'one hundred replays do not create extra durable deliveries'
);
select is(
  (select generation from public.testing_center_linear_reconciliations
   where external_issue_id = '44444444-4444-4444-8444-444444444444'),
  6::bigint,
  'only fresh deliveries advance the deterministic generation watermark'
);
select is(
  (select outcome from public.testing_center_linear_webhook_deliveries
   where delivery_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'stale',
  'stale decision remains durable evidence'
);
select is(
  (select outcome from public.testing_center_linear_webhook_deliveries
   where delivery_id = '88888888-8888-4888-8888-888888888888'),
  'needs_owner',
  'unknown mapping decision remains durable evidence'
);
select throws_ok(
  $$ select * from public.testing_center_reconcile_linear_webhook(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    '22222222-2222-4222-8222-222222222222',
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    '44444444-4444-4444-8444-444444444444',
    'Issue', 'update', 1785758406000,
    '2026-08-03T12:00:06Z', null, repeat('3',64)) $$,
  '55000', 'testing_center_linear_webhook_binding_mismatch',
  'organization mismatch fails closed before ledger insertion'
);

reset role;

select is(
  (select to_jsonb(effect) from public.testing_center_effect_outbox effect
   where effect.technical_issue_id = 'issue_legacy_pending'
     and effect.effect_type = 'linear_issue_create'),
  (select effect_row from isa240_canonical_before),
  'webhook reconciliation cannot mutate the canonical outbox effect'
);
select is(
  (select to_jsonb(issue) from public.testing_center_technical_issues issue
   where issue.technical_issue_id = 'issue_legacy_pending'),
  (select issue_row from isa240_canonical_before),
  'webhook reconciliation cannot mutate the canonical technical issue'
);
select is(
  (select count(*)::integer from public.testing_center_linear_issue_bindings),
  1,
  'one external Linear issue remains bound to exactly one technical issue'
);
select is(
  (select count(*)::integer from public.testing_center_linear_reconciliations),
  1,
  'one observational reconciliation row exists per bound technical issue'
);

select * from finish();
rollback;
