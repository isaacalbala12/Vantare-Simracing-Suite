"""A blocked migration must time out and leave its entire DDL unapplied."""
import json
import subprocess


def run_migration_lock_regression(run, conn, source, out, bin_dir, env):
    def snapshot():
        return run('psql', *conn, '-c', """
          select pg_get_constraintdef(oid) from pg_constraint
          where conrelid='public.billing_checkout_attempts'::regclass
            and conname='billing_checkout_attempts_resolution_check';
          select to_regprocedure('private.close_terminal_checkout_attempts(uuid,text)') is null;
          select md5(pg_get_functiondef(oid)) from pg_proc
          where proname in ('billing_apply_subscription_lifecycle',
            'billing_sync_order_access','claim_billing_checkout_attempt') order by oid;
        """)

    before = snapshot()
    blocker = subprocess.Popen([str(bin_dir/'psql'), *conn], env=env,
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True)
    try:
        # Readiness comes from the owning session after LOCK succeeds, not sleep.
        blocker.stdin.write("begin; lock table public.billing_checkout_attempts in access share mode; select 'lock-ready';\n")
        blocker.stdin.flush()
        while True:
            line = blocker.stdout.readline()
            if not line:
                raise AssertionError('blocker exited before taking its lock')
            if line.strip() == 'lock-ready':
                break
        try:
            # An independent upper bound makes removal of lock_timeout fail with
            # query cancellation (57014), rather than hang the regression.
            run('psql', *conn, '-c', "set statement_timeout='8s'", '-f', source)
        except RuntimeError as error:
            assert '55P03' in str(error), str(error)
        else:
            raise AssertionError('migration acquired an incompatible table lock')
        assert snapshot() == before, 'blocked migration left partial DDL'
    finally:
        try:
            blocker.communicate('rollback;\n\\q\n', timeout=10)
        except (subprocess.TimeoutExpired, BrokenPipeError):
            blocker.kill()
            blocker.communicate()
    assert blocker.returncode == 0, 'blocker did not exit cleanly'
    (out/'migration-lock-regression.json').write_text(json.dumps({
        'sqlstate': '55P03', 'ddl_unchanged': True,
        'normal_migration_runs_next': True,
    }, indent=2)+'\n')
    print('Blocked terminal-checkout migration: 55P03 and atomic rollback PASS', flush=True)
