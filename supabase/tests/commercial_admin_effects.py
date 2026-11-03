"""Two real sessions, explicit lock observation; disposable PostgreSQL only."""
import json
import select
import subprocess
import time


def run_admin_effects_race(run, conn, out, bin_dir, env):
    actor = '00000000-0000-4000-8000-000000001950'
    effect = '00000000-0000-4000-8000-000000001952'
    event = dict(request_id='00000000-0000-4000-8000-000000001953', effect_id=effect,
                 action='set_blocked', effect='clerk_ban', target_hash='e'*64, outcome='started')
    run('psql', *conn, '-c', f"""insert into public.profiles(id) values('{actor}');
      select * from public.operational_access_set('{actor}','owner','grant','test:r10-race','Effects race','test:r10-race',null);""")

    def statement(outcome):
        body = json.dumps({**event, 'outcome': outcome})
        return f"public.native_admin_record_effect('{actor}','{body}'::jsonb)"

    results = []
    for first, second, expected in [('started', 'started', 0), ('succeeded', 'unknown', 1)]:
        blocker = subprocess.Popen([str(bin_dir/'psql'), *conn, '-q'], env=env,
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        waiter = None
        try:
            blocker.stdin.write(f"begin; set role service_role; do $$begin perform {statement(first)}; end$$; select 'ready';\n")
            blocker.stdin.flush()
            assert select.select([blocker.stdout], [], [], 10)[0], 'readiness timeout'
            assert blocker.stdout.readline().strip() == 'ready'
            waiter = subprocess.Popen([str(bin_dir/'psql'), *conn, '-q', '-c',
                f"set statement_timeout='12s'; set role service_role; select {statement(second)};"],
                env={**env, 'PGAPPNAME': 'vanta132-effect-waiter'}, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            deadline = time.monotonic()+8
            while True:
                blocked = run('psql', *conn, '-c', """select exists(select 1 from pg_stat_activity
                  where application_name='vanta132-effect-waiter' and wait_event_type='Lock'
                  and cardinality(pg_blocking_pids(pid))>0)""").strip()
                if blocked == 't':
                    break
                assert time.monotonic() < deadline, 'second session did not wait'
                time.sleep(.02)  # Poll throttle; the observed lock is the synchronization.
            blocker.communicate('commit;\n\\q\n', timeout=10)
            assert blocker.returncode == 0
            stdout, stderr = waiter.communicate(timeout=12)
            assert waiter.returncode == expected, (stdout, stderr)
            if expected:
                assert 'native_admin_invalid' in stderr
            else:
                assert stdout.strip() == 't'
            count = int(run('psql', *conn, '-c', f"select count(*) from private.admin_effects where effect_id='{effect}'"))
            assert count == (1 if first == 'started' else 2)
            results.append(dict(first=first, second=second, rows=count, second_exit=expected))
        finally:
            for process in (waiter, blocker):
                if process is not None and process.poll() is None:
                    process.kill()
                    process.communicate()
    (out/'admin-effects-races.json').write_text(json.dumps(results, indent=2)+'\n')
    print('Admin effects: concurrent same-id intents deduplicate; conflicting terminal outcomes serialize PASS', flush=True)
