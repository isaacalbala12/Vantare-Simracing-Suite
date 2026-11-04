"""Local cloned fixture DB: committed provider/reconcile closure versus erasure."""
import hashlib
import json
import select
import subprocess
import time


def run_audit_erasure_races(run, conn, out, bin_dir, env):
    # Only the disposable loopback cluster created by run-commercial-local.
    source = conn[conn.index('-d') + 1]
    assert conn[conn.index('-h') + 1] == '127.0.0.1' and source in ('postgres', 'commercial')
    fixture_db = 'vanta132_audit_erasure_race'
    admin = list(conn)
    admin[admin.index('-d') + 1] = 'template1'
    fixture = list(conn)
    fixture[fixture.index('-d') + 1] = fixture_db
    run('psql', *admin, '-c', f'create database {fixture_db} template "{source}"')
    try:
        _run_races(run, fixture, out, bin_dir, env)
    finally:
        run('psql', *admin, '-c', f'drop database {fixture_db}')


def _run_races(run, conn, out, bin_dir, env):
    def uid(n):
        return '19101080-0000-4000-8000-' + str(n).zfill(12)

    actor, deleter, unrelated = uid(1), uid(2), uid(3)
    issuer = 'https://audit-race.invalid'
    run('psql', *conn, '-c', f"""insert into private.clerk_issuers(issuer,authorized_parties,enabled)
      values('{issuer}',array['https://app.invalid'],true);
      insert into public.profiles(id) select id::uuid from unnest(array[
      '{actor}','{deleter}','{unrelated}','{uid(10)}','{uid(11)}','{uid(12)}','{uid(13)}']) id;
      insert into public.account_identities(issuer,subject,account_id)
      select '{issuer}','user_audit_race_'||n,('19101080-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
      from unnest(array[3,10,11,12,13]) n;
      select * from public.operational_access_set('{actor}','owner','grant','test:audit-race','Result owner','result-owner',null);
      select * from public.operational_access_set('{deleter}','owner','grant','test:audit-race','Deletion owner','delete-owner',null);""")

    def native(n, effect, outcome):
        event = dict(request_id=uid(100+n), effect_id=effect, action='set_blocked',
                     effect='clerk_ban', outcome=outcome,
                     target_hash=hashlib.sha256(f'user_audit_race_{n}'.encode()).hexdigest())
        return f"public.native_admin_record_effect('{actor}','{json.dumps(event)}'::jsonb,'{uid(n)}')"

    run('psql', *conn, '-c', f"select {native(3, uid(203), 'started')}; select {native(3, uid(203), 'unknown')}")
    other_query = f"select jsonb_agg(to_jsonb(e) order by outcome) from private.admin_effects e where effect_id='{uid(203)}'"
    other_before = json.loads(run('psql', *conn, '-c', other_query))
    results = []
    for index, kind in enumerate(('sync', 'send', 'erasure', 'reconcile')):
        n = 10 + index
        target, effect, request = uid(n), uid(200+n), uid(100+n)
        contact, lease = uid(300+n), uid(400+n)
        if kind in ('sync', 'send'):
            run('psql', *conn, '-c', f"""insert into private.mail_contacts(id,email,account_id,locale,evidence,consent,sync_lease,sync_lease_until)
              values('{contact}','audit-race-{n}@example.invalid','{target}','es','fixture',true,'{lease}',clock_timestamp()+interval '1 hour')""")
        if kind == 'sync':
            record = f"public.native_admin_record_mail_sync('{actor}','{request}','{effect}','brevo_contact_upsert','{contact}','{lease}',"
            start, close = record + "'started')", record + "'succeeded',200)"
        elif kind == 'send':
            campaign, delivery = uid(500+n), uid(600+n)
            run('psql', *conn, '-c', f"""insert into private.mail_campaigns(id,environment,state,approved_by)
              values('{campaign}','sandbox','sending','{actor}');
              insert into private.mail_deliveries(id,campaign_id,email,locale,status,reserved_at)
              values('{delivery}','{campaign}','audit-race-{n}@example.invalid','es','dispatching',now())""")
            record = f"public.native_admin_record_mail_send('{actor}','{request}','{effect}','{delivery}','sandbox',"
            start, close = record + "'started')", record + "'succeeded',201)"
        elif kind == 'erasure':
            job = uid(700+n)
            run('psql', *conn, '-c', f"""insert into private.mail_contact_erasures(id,email,account_id,email_fingerprint,state,lease,lease_until)
              values('{job}','audit-race-{n}@example.invalid','{target}',repeat('a',64),'processing','{lease}',clock_timestamp()+interval '1 hour')""")
            record = f"public.native_admin_record_mail_erasure('{job}','{lease}','{request}','{effect}',"
            start, close = record + "'started')", record + "'succeeded',204)"
        else:
            start = native(n, effect, 'started')
            close = f"public.native_admin_reconcile_effect('{actor}','{effect}')"
        run('psql', *conn, '-c', 'select ' + start)
        if kind == 'reconcile':
            run('psql', *conn, '-c', 'select ' + native(n, effect, 'unknown'))
        params = json.dumps(dict(account_id=target, clerk_subject=f'user_audit_race_{n}', confirmation_hash='a'*64))
        deletion = f"public.native_admin_execute('{deleter}','{issuer}','prepare_account_deletion','{params}'::jsonb,'sandbox')"
        blocker = subprocess.Popen([str(bin_dir/'psql'), *conn, '-q'], env=env,
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        waiter = None
        try:
            blocker.stdin.write(f"begin; set role service_role; do $$begin perform {close}; end$$; select 'ready:'||pg_backend_pid();\n")
            blocker.stdin.flush()
            assert select.select([blocker.stdout], [], [], 10)[0], kind + ' readiness timeout'
            ready = blocker.stdout.readline().strip()
            assert ready.startswith('ready:'), (kind, ready)
            closing_pid = int(ready.split(':')[1])
            waiter = subprocess.Popen([str(bin_dir/'psql'), *conn, '-q', '-c',
                f"set statement_timeout='12s'; set role service_role; select {deletion};"],
                env={**env, 'PGAPPNAME': 'vanta132-audit-erase'}, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            deadline = time.monotonic() + 8
            while True:
                blocked = run('psql', *conn, '-c', f"""select exists(select 1 from pg_stat_activity
                  where application_name='vanta132-audit-erase' and wait_event_type='Lock'
                  and {closing_pid}=any(pg_blocking_pids(pid)))""").strip()
                if blocked == 't':
                    break
                assert time.monotonic() < deadline, kind + ' deletion did not wait on closing session'
                time.sleep(.02)  # Poll throttle; actual pg_stat_activity lock is the synchronization.
            _, first_error = blocker.communicate('commit;\n\\q\n', timeout=10)
            assert blocker.returncode == 0, first_error
            stdout, stderr = waiter.communicate(timeout=12)
            assert waiter.returncode == 0, (kind, stdout, stderr)
            rows = json.loads(run('psql', *conn, '-c', f"select jsonb_agg(to_jsonb(e) order by outcome) from private.admin_effects e where effect_id='{effect}'"))
            assert len(rows) == (3 if kind == 'reconcile' else 2), (kind, rows)
            assert all(r['target_hash'] == 'erased' and r['target_account'] is None and r['erase_on_close'] for r in rows), (kind, 'closed hash survived erasure', rows)
            assert json.loads(run('psql', *conn, '-c', other_query)) == other_before, kind + ' changed another account pending evidence'
            results.append(dict(closer=kind, deletion_waited_on_closer=True, closed_hash_erased=True, unrelated_pending_unchanged=True))
        finally:
            for process in (waiter, blocker):
                if process is not None and process.poll() is None:
                    process.kill()
                    process.communicate()
    (out/'admin-audit-erasure-races.json').write_text(json.dumps(results, indent=2)+'\n', encoding='utf-8')
    print('Admin audit: 4 real result/reconcile-versus-erasure races; unrelated pending unchanged PASS', flush=True)
