"""Two real sessions, explicit pg_stat_activity lock observation; local DB only."""
import json
import select
import subprocess
import time


def run_admin_effects_race(run, conn, out, bin_dir, env):
    actor = '00000000-0000-4000-8000-000000001950'
    target = '00000000-0000-4000-8000-000000001970'
    request1 = '00000000-0000-4000-8000-000000001971'
    request2 = '00000000-0000-4000-8000-000000001972'
    effect = '00000000-0000-4000-8000-000000001952'
    event = dict(request_id='00000000-0000-4000-8000-000000001953', effect_id=effect,
                 action='set_blocked', effect='clerk_ban', target_hash='e'*64, outcome='started')
    run('psql', *conn, '-c', f"""insert into public.profiles(id) values('{actor}'),('{target}');
      select * from public.operational_access_set('{actor}','owner','grant','test:r10-race','Effects race','test:r10-race',null);""")
    results = []

    def statement(outcome, effect_id=effect):
        body = json.dumps({**event, 'effect_id': effect_id, 'outcome': outcome})
        return f"public.native_admin_record_effect('{actor}','{body}'::jsonb)"

    def perform(expression):
        return f'do $$begin perform {expression}; end$$;'

    def compete(label, first_sql, second_sql, expected_exit):
        blocker = subprocess.Popen([str(bin_dir/'psql'), *conn, '-q'], env=env,
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        waiter = None
        try:
            blocker.stdin.write(f"begin; set role service_role; {first_sql} select 'ready';\n")
            blocker.stdin.flush()
            assert select.select([blocker.stdout], [], [], 10)[0], label+' readiness timeout'
            assert blocker.stdout.readline().strip() == 'ready', label+' first transaction failed'
            waiter = subprocess.Popen([str(bin_dir/'psql'), *conn, '-q', '-c',
                "set statement_timeout='12s'; set role service_role; "+second_sql],
                env={**env, 'PGAPPNAME': 'vanta132-effect-waiter'}, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            deadline = time.monotonic()+8
            while True:
                blocked = run('psql', *conn, '-c', """select exists(select 1 from pg_stat_activity
                  where application_name='vanta132-effect-waiter' and wait_event_type='Lock'
                  and cardinality(pg_blocking_pids(pid))>0)""").strip()
                if blocked == 't':
                    break
                assert time.monotonic() < deadline, label+' second session did not wait'
                time.sleep(.02)  # Poll throttle; lock observation is the synchronization.
            _, first_error = blocker.communicate('commit;\n\\q\n', timeout=10)
            assert blocker.returncode == 0, first_error
            stdout, stderr = waiter.communicate(timeout=12)
            assert waiter.returncode == expected_exit, (label, stdout, stderr)
            if expected_exit:
                assert 'native_admin_invalid' in stderr
            results.append(dict(case=label, blocked=True, second_exit=expected_exit))
            return stdout.strip()
        finally:
            for process in (waiter, blocker):
                if process is not None and process.poll() is None:
                    process.kill()
                    process.communicate()

    for first, second, expected in [('started', 'started', 0), ('succeeded', 'unknown', 1)]:
        result = compete('journal-'+first+'-'+second, perform(statement(first)), 'select '+statement(second)+';', expected)
        if not expected:
            assert result == 't'
        count = int(run('psql', *conn, '-c', f"select count(*) from private.admin_effects where effect_id='{effect}'"))
        assert count == (1 if first == 'started' else 2)

    claim1 = f"public.native_admin_claim_change('{actor}','{request1}','{target}')"
    claim2 = f"public.native_admin_claim_change('{actor}','{request2}','{target}')"
    token = run('psql', *conn, '-c', 'select '+claim1).strip()
    params = json.dumps(dict(account_id=target, blocked=True))
    finish = f"public.native_admin_finish_change('{actor}','https://clerk.example.invalid','{params}'::jsonb,'sandbox','{request1}','{token}')"
    # The finish has a valid lease on entry and retains its row lock. Inject the
    # elapsed clock inside that transaction so takeover is eligible after commit.
    expire = f"reset role; update private.admin_change_leases set expires_at=clock_timestamp()-interval '1 second' where account_id='{target}'; set role service_role;"
    new_token = compete('finish-versus-expired-takeover', perform(finish)+expire, 'select '+claim2+';', 0)
    assert new_token and new_token != token
    assert run('psql', *conn, '-c', f"select blocked from private.admin_account_blocks where account_id='{target}'").strip() == 't'

    run('psql', *conn, '-c', f"update private.admin_change_leases set expires_at=clock_timestamp()-interval '1 second' where account_id='{target}'")
    busy = compete('two-expired-claims', perform(claim1), f"select coalesce({claim2}::text,'busy');", 0)
    assert busy == 'busy'
    assert run('psql', *conn, '-c', f"select request_id from private.admin_change_leases where account_id='{target}'").strip() == request1

    for first_reconcile, effect_id in [(True, '00000000-0000-4000-8000-000000001973'), (False, '00000000-0000-4000-8000-000000001974')]:
        run('psql', *conn, '-c', f"""insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash,occurred_at)
          values('{effect_id}','started','{event['request_id']}','{actor}','set_blocked','clerk_ban','{event['target_hash']}',now()-interval '481 seconds')""")
        reconcile = f"public.native_admin_reconcile_effect('{actor}','{effect_id}')"
        result = statement('succeeded', effect_id)
        first, second = (reconcile, result) if first_reconcile else (result, reconcile)
        compete('reconcile-versus-result-'+str(first_reconcile), perform(first), 'select '+second+';', 1)
        states = run('psql', *conn, '-c', f"select string_agg(outcome,',' order by outcome) from private.admin_effects where effect_id='{effect_id}'").strip()
        assert states == ('reconciled,started' if first_reconcile else 'started,succeeded')
    (out/'admin-effects-races.json').write_text(json.dumps(results, indent=2)+'\n')
    print('Admin effects: 6 real lock-observed journal/lease/reconciliation races PASS', flush=True)
