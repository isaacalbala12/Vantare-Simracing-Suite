"""Target-owner revocation against actual set_blocked; disposable PG only."""
import json
import select
import subprocess
import time


def run_target_owner_race(run, conn, out, bin_dir, env):
    actor = '19104500-0000-4000-8000-000000000001'
    run('psql', *conn, '-c', f"""insert into public.profiles(id) values('{actor}');
      select * from public.operational_access_set('{actor}','owner','grant',
      'test:target-owner','Target owner race','target-owner-actor',null);""")
    results = []
    for commit, suffix in [(True, '2'), (False, '3')]:
        target = '19104500-0000-4000-8000-00000000000'+suffix
        run('psql', *conn, '-c', f"""insert into public.profiles(id) values('{target}');
          select * from public.operational_access_set('{target}','owner','grant',
          'test:target-owner','Target owner race','target-owner-{suffix}',null);""")
        holder = subprocess.Popen([str(bin_dir/'psql'), *conn, '-q'], env=env,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        waiter = None
        try:
            holder.stdin.write(f"""begin; set local statement_timeout='12s'; set role service_role;
              do $$begin perform public.operational_access_set('{target}','owner','revoke',
              'test:target-owner','Target owner race','target-revoke-{suffix}',null); end$$;
              select pg_backend_pid()::text||'|ready';
""")
            holder.stdin.flush()
            assert select.select([holder.stdout], [], [], 10)[0], 'target revocation readiness timeout'
            ready = holder.stdout.readline().strip().split('|')
            assert len(ready) == 2 and ready[1] == 'ready', ready
            holder_pid = int(ready[0])
            params = json.dumps(dict(account_id=target, blocked=True))
            waiter = subprocess.Popen([str(bin_dir/'psql'), *conn, '-q', '-c',
                "set statement_timeout='12s'; set role service_role; "+
                f"select public.native_admin_execute('{actor}','https://target-race.invalid',"+
                f"'set_blocked','{params}'::jsonb,'sandbox');"],
                env={**env, 'PGAPPNAME': 'vanta132-target-revoke-waiter'},
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            deadline = time.monotonic()+8
            while True:
                blocked = run('psql', *conn, '-c', f"""select exists(
                  select 1 from pg_stat_activity
                  where application_name='vanta132-target-revoke-waiter'
                    and wait_event_type='Lock'
                    and {holder_pid}=any(pg_blocking_pids(pid)))""").strip()
                if blocked == 't':
                    break
                if waiter.poll() is not None:
                    raise AssertionError(('set_blocked exited before target lock', *waiter.communicate()))
                assert time.monotonic() < deadline, 'set_blocked did not wait on target revocation'
                time.sleep(.02)  # Throttle only; pg_stat_activity is synchronization.
            _, error = holder.communicate(('commit' if commit else 'rollback')+';\n\\q\n', timeout=12)
            assert holder.returncode == 0, error
            stdout, stderr = waiter.communicate(timeout=12)
            (out/('target-revoke-'+str(commit)+'.log')).write_text(stdout+stderr, encoding='utf-8')
            assert waiter.returncode == (0 if commit else 1), (stdout, stderr)
            if not commit:
                assert '55000' in stderr and 'native_admin_owner_conflict' in stderr
            assert run('psql', *conn, '-c', f"select private.is_owner('{target}')").strip() == ('f' if commit else 't')
            assert run('psql', *conn, '-c', f"""select count(*) from private.admin_account_blocks
              where account_id='{target}' and blocked""").strip() == ('1' if commit else '0')
            results.append(dict(revocation_committed=commit, observed_blocker=holder_pid,
                                second_exit=waiter.returncode, blocked=commit))
        finally:
            for process in (waiter, holder):
                if process is not None and process.poll() is None:
                    process.kill()
                    process.communicate()
    (out/'admin-target-owner-races.json').write_text(json.dumps(results, indent=2)+'\n', encoding='utf-8')
    print('Admin target owner: revocation commit/rollback versus set_blocked, two observed sessions PASS', flush=True)
