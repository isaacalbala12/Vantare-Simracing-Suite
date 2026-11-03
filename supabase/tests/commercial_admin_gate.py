"""Real two-session regression: an older waiter must not rewind the minute."""
import json
import select
import subprocess
import time
from pathlib import Path


def run_admin_gate_race(run, conn, out, bin_dir, env):
    run('psql', *conn, '-c', """
      delete from private.native_admin_gate_rate;
      insert into private.native_admin_gate_rate values
       (true,date_trunc('minute',clock_timestamp()),120);
    """)
    blocker = subprocess.Popen([str(bin_dir/'psql'), *conn, '-q'], env=env,
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True)
    waiter = None
    try:
        blocker.stdin.write("begin; do $$begin perform 1 from private.native_admin_gate_rate for update; end$$; select 'ready';\n")
        blocker.stdin.flush()
        assert select.select([blocker.stdout], [], [], 10)[0], 'blocker readiness timeout'
        assert blocker.stdout.readline().strip() == 'ready'
        wait_env = {**env, 'PGAPPNAME': 'vanta132-admin-gate-waiter'}
        waiter = subprocess.Popen([str(bin_dir/'psql'), *conn, '-q', '-c',
            "set statement_timeout='10s'; set role service_role; select public.native_admin_gate();"],
            env=wait_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        deadline = time.monotonic() + 8
        while True:
            blocked = run('psql', *conn, '-c', """select exists(select 1 from pg_stat_activity
              where application_name='vanta132-admin-gate-waiter'
                and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0)""").strip()
            if blocked == 't':
                break
            assert time.monotonic() < deadline, 'waiter did not reach row lock'
            # Throttle polling; only the observed lock, never elapsed time, signals readiness.
            time.sleep(.02)
        stdout, stderr = blocker.communicate(r"""update private.native_admin_gate_rate
          set window_start=date_trunc('minute',clock_timestamp())+interval '1 minute',requests=120
          returning extract(epoch from window_start)::bigint;
          commit;
          \q
        """, timeout=10)
        assert blocker.returncode == 0, stderr
        expected_window = int(stdout.strip())
        stdout, stderr = waiter.communicate(timeout=12)
        assert waiter.returncode == 0, stderr
        state = json.loads(run('psql', *conn, '-c', """select json_build_object(
          'window',extract(epoch from window_start)::bigint,'requests',requests)
          from private.native_admin_gate_rate"""))
        result = {'allowed': stdout.strip(), 'state': state, 'expected_window': expected_window}
        (out/'admin-gate-race.json').write_text(json.dumps(result, indent=2)+'\n')
        assert result['allowed'] == 'f', result
        assert state == {'window': expected_window, 'requests': 121}, result
        print('Admin global gate: stale concurrent waiter cannot rewind window PASS', flush=True)
    finally:
        for process in (waiter, blocker):
            if process is not None and process.poll() is None:
                process.kill()
                process.communicate()
        run('psql', *conn, '-c', 'delete from private.native_admin_gate_rate')


def run_admin_gate_e2e(deno, conn, out, bin_dir, env):
    root = Path(__file__).resolve().parents[2]
    script = root/'supabase/tests/admin-gate-e2e.ts'
    config = root/'supabase/functions/deno.json'
    command = {'program': str(bin_dir/'psql'), 'args': conn}
    permission = command['program']
    if str(deno).endswith('.exe'):
        # Existing Windows Deno + WSL PostgreSQL; no tool installation or remote DB.
        def windows(path):
            return subprocess.check_output(['wslpath', '-w', str(path)], text=True).strip()
        script, config = windows(script), windows(config)
        distribution = env['WSL_DISTRO_NAME']
        command = {'program': 'wsl.exe', 'args': ['-d', distribution, '--', str(bin_dir/'psql'), *conn]}
        permission = 'wsl.exe'
    result = subprocess.run([str(deno), 'test', '--config', str(config), '--allow-env',
        '--allow-read', '--allow-run='+permission, str(script), '--', json.dumps(command)],
        env=env, capture_output=True, text=True, timeout=120)
    (out/'admin-gate-edge-e2e.log').write_text(result.stdout+result.stderr, encoding='utf-8')
    assert result.returncode == 0, 'admin-gate-edge-e2e.log: '+result.stdout+result.stderr
    print('Admin Edge→SQL: active JWT abuse and inactive opaque compatibility PASS', flush=True)
