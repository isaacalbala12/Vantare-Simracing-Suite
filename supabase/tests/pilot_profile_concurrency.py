"""Real concurrent CAS on the runner's disposable PostgreSQL, with explicit barriers."""
import json
import queue
import subprocess
import threading
import time


def check(pg_bin, connection, env, output, run):
    account = '16120000-0000-0000-0000-000000000001'
    prefix = f"set role authenticated; set request.jwt.claim.sub='{account}';"
    op_a = '16120000-0000-4000-8000-000000000020'
    op_b = '16120000-0000-4000-8000-000000000021'
    op_c = '16120000-0000-4000-8000-000000000022'

    def save(description, revision, op_id):
        return f"select public.pilot_profile_save('{{\"description\":\"{description}\"}}',null,{revision},'{op_id}');"

    def result(text):
        return json.loads(next(line for line in text.splitlines() if line.startswith('{')))

    command = [str(pg_bin / 'psql'), *connection]
    staged = queue.Queue()
    transcript = []
    original = subprocess.Popen(command, env=env, stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

    def reader():
        for line in original.stdout:
            transcript.append(line)
            staged.put(line.strip())
        staged.put('EOF')

    thread = threading.Thread(target=reader, daemon=True)
    thread.start()
    retry = None
    try:
        original.stdin.write("set statement_timeout='10s'; begin;" + prefix + save('A', 0, op_a) + "\n\\echo A_STAGED\n")
        original.stdin.flush()
        deadline = time.monotonic() + 15
        while True:
            line = staged.get(timeout=max(0.01, deadline - time.monotonic()))
            if line == 'A_STAGED':
                break
            if line == 'EOF':
                raise RuntimeError('original transaction failed before barrier')
        # SELECT ordinario ve R=0 mientras A ya está aplicado pero sin COMMIT.
        observed = run('psql', *connection, '-c', prefix + 'select public.pilot_profile_load() is null;', name='concurrency-stale-load.log')
        assert 't' in observed.splitlines(), observed
        retry = subprocess.Popen(command + ['-c', "set application_name='pilot-1612-retry'; set statement_timeout='10s';" + prefix + save('A', 0, op_a)],
                                 env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        # Señal del motor, sin sleeps: el reintento debe esperar al original.
        deadline = time.monotonic() + 10
        while True:
            waiting = run('psql', *connection, '-c', "select count(*) from pg_stat_activity where application_name='pilot-1612-retry' and wait_event='advisory';", name='concurrency-wait-barrier.log')
            if '1' in waiting.splitlines():
                break
            if time.monotonic() > deadline or retry.poll() is not None:
                raise RuntimeError('retry did not wait for in-flight operation')
        original.stdin.write("commit;\n\\q\n")
        original.stdin.flush()
        original.wait(timeout=15)
        thread.join(timeout=5)
        assert original.returncode == 0
        text, _ = retry.communicate(timeout=15)
        (output / 'concurrency-retry.log').write_text(text, encoding='utf-8')
        assert retry.returncode == 0, text
        first = result(''.join(transcript))
        assert result(text) == first == {'profile': {'description': 'A'}, 'revision': 1, 'photo_hash': None}
        text = run('psql', *connection, '-c', prefix + save('B', 1, op_b), name='concurrency-new-edit.log')
        assert result(text)['revision'] == 2
        text = run('psql', *connection, '-c', prefix + save('C', 2, op_c), name='concurrency-second-device.log')
        assert result(text)['revision'] == 3
        text = run('psql', *connection, '-c', prefix + save('A', 0, op_a), name='concurrency-old-receipt.log')
        assert result(text) == first
        text = run('psql', *connection, '-c', prefix + 'select public.pilot_profile_load();', name='concurrency-current-preserved.log')
        assert result(text) == {'profile': {'description': 'C'}, 'revision': 3, 'photo_hash': None}
        run('psql', *connection, '-c', prefix + save('D', 2, '16120000-0000-4000-8000-000000000023'), name='concurrency-new-cas-conflict.log', expected=1)
        print('PASS concurrent SQL: stale load R0, duplicate waits for A commit, one apply, B/R2, C/R3, original receipt preserved, new stale CAS rejected')
    finally:
        for process in (retry, original):
            if process and process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
        thread.join(timeout=5)
        (output / 'concurrency-original.log').write_text(''.join(transcript), encoding='utf-8')
    # Exclusivamente fixtures de este servidor recién creado; no acepta DSN externo.
    run('psql', *connection, '-c', 'delete from pilot_private.operations; delete from public.pilot_profiles;', name='concurrency-fixture-cleanup.log')
