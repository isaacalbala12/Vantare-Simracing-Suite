"""Disposable PostgreSQL + installed pgTAP, synthetic fixtures only, no remote DSN.

Run on Linux/WSL with --pg-bin pointing to EXISTING PostgreSQL binaries.
LD_LIBRARY_PATH may be needed for unpacked binaries. No package installation.
"""
import argparse
import json
import os
from pathlib import Path
import re
import queue
import subprocess
import tempfile
import threading
import time


def concurrent_confirmation(run, pg_bin, connection, env, output_dir):
    """Two real sessions; release only after pg_stat_activity proves advisory wait."""
    author = '15940000-0000-0000-0000-000000000091'
    owner = '15940000-0000-0000-0000-000000000092'
    first = '15940000-0000-0000-0000-000000000093'
    second = '15940000-0000-0000-0000-000000000094'
    proposal = ''''{"schema":"vantare.triage.v2","verdict":"valido","confidence":0.9,"criteria":{"contenido_minimo":"si","evidencia":"si","no_duplicado":"si"},"duplicate_of":null,"severity":"media","area":"telemetria","evidence_refs":[],"summary":"Synthetic","preliminary_fix":null,"reasons":[],"trazable":"si"}'::jsonb'''
    run('psql', *connection, '-c', f"""
      insert into public.profiles(id) values ('{author}'),('{owner}');
      insert into public.testing_center_memberships(user_id,role) values ('{owner}','owner');
      insert into public.testing_contributions(id,account_id,channel,title,body) values
        ('{first}','{author}','testers','first','synthetic'),('{second}','{author}','testers','second','synthetic');
    """, name='concurrent-fixtures.log')
    setup = f"set role authenticated; set request.jwt.claim.sub='{owner}';"
    output = run('psql', *connection, '-c', f"begin isolation level repeatable read; {setup} select public.testing_contribution_review('{first}','accepted','confirmed',{proposal});", name='stale-snapshot-denied.log', expected=1)
    if 'testing_review_read_committed_required' not in output:
        raise RuntimeError('stale transaction isolation was not rejected')
    holder = subprocess.Popen([str(pg_bin / 'psql'), *connection, '-q'], env=env,
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              text=True, encoding='utf-8')
    contender = None
    signals = queue.Queue()

    def read_signals():
        for line in holder.stdout:
            signals.put(line.strip())

    reader = threading.Thread(target=read_signals, daemon=True)
    reader.start()
    try:
        holder.stdin.write(f"begin; {setup} select public.testing_contribution_review('{first}','accepted','confirmed',{proposal}); select 'holder-ready';\n")
        holder.stdin.flush()
        deadline = time.monotonic() + 10
        while signals.get(timeout=max(0.01, deadline - time.monotonic())) != 'holder-ready':
            if time.monotonic() >= deadline:
                raise RuntimeError('holder did not acquire acceptance lock')
        contender_env = dict(env)
        contender_env['PGAPPNAME'] = 'vantare-1594-cap-contender'
        contender = subprocess.Popen([str(pg_bin / 'psql'), *connection, '-c',
            f"{setup} select public.testing_contribution_review('{second}','accepted','confirmed',{proposal});"],
            env=contender_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
        deadline = time.monotonic() + 10
        while True:
            waiting = run('psql', *connection, '-c', "select exists(select 1 from pg_stat_activity where application_name='vantare-1594-cap-contender' and wait_event='advisory');", name='concurrent-wait.log')
            if waiting.strip() == 't':
                break
            if contender.poll() is not None or time.monotonic() >= deadline:
                raise RuntimeError('contender did not wait on account lock')
            # Bounded polling of observable server lock state, not a timing assertion.
            time.sleep(0.02)
        holder.stdin.write('commit;\n')
        holder.stdin.flush()
        holder.stdin.close()
        holder.wait(timeout=10)
        stdout, stderr = contender.communicate(timeout=10)
        (output_dir / 'concurrent-contender.log').write_text(stdout + stderr, encoding='utf-8')
        if holder.returncode != 0 or contender.returncode != 1 or 'testing_acceptance_limit' not in stderr:
            raise RuntimeError('concurrent confirmation failed cap/atomicity assertions')
        result = run('psql', *connection, '-c', f"select count(*) from public.testing_contribution_reviews where contribution_id in ('{first}','{second}');", name='concurrent-count.log')
        if result.strip() != '1':
            raise RuntimeError('concurrent confirmation recorded more than one review')
    finally:
        for process in (contender, holder):
            if process is not None and process.poll() is None:
                process.kill()
                process.wait(timeout=10)
        reader.join(timeout=2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    root = Path(__file__).resolve().parents[2]
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    env['PGOPTIONS'] = '-c search_path=public,extensions'

    def run(program, *parameters, name, expected=0):
        result = subprocess.run([str(args.pg_bin / program), *map(str, parameters)],
                                env=env, capture_output=True, text=True, encoding='utf-8', timeout=60)
        output = result.stdout + result.stderr
        (args.output / name).write_text(output, encoding='utf-8')
        if result.returncode != expected:
            raise RuntimeError(f'{name}: exit {result.returncode}, expected {expected}; inspect local log')
        return output

    with tempfile.TemporaryDirectory(prefix='vantare-1594-') as temporary:
        # No TCP listeners; private temporary Unix socket with local trust.
        data = Path(temporary) / 'data'
        run('initdb', '-D', data, '-U', 'local_supervisor', '--auth-local=trust',
            '--auth-host=reject', '--encoding=UTF8', '--no-locale', name='initdb.log')
        run('pg_ctl', '-D', data, '-l', args.output / 'postgres.log', '-o', f'-h "" -k {temporary}',
            '-w', 'start', name='start.log')
        connection = ['-X', '-h', temporary, '-d', 'postgres', '-U', 'local_supervisor', '-v', 'ON_ERROR_STOP=1', '-At']
        try:
            run('psql', *connection, '-f', root / 'supabase/tests/triage_local_bootstrap.sql', name='bootstrap.log')
            run('psql', *connection, '-c', 'create extension pgtap;', name='pgtap.log')
            actor = connection.copy()
            actor[actor.index('-U') + 1] = 'postgres'
            run('psql', *actor, '-f', root / 'supabase/migrations/20261010000000_testing_participation.sql', name='participation-migration.log')
            migration = root / 'supabase/migrations/20261013160000_testing_contribution_triage.sql'
            # Preexisting roles are rejected atomically, not reused or repaired.
            run('psql', *connection, '-c', 'create role vantare_triage;', name='role-conflict-setup.log')
            run('psql', *actor, '-f', migration, name='role-conflict-migration.log', expected=3)
            output = run('psql', *connection, '-c', "select to_regclass('public.testing_contribution_context') is null, not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='testing_system_valid'); drop role vantare_triage;", name='role-conflict-rollback.log')
            if 't|t' not in output:
                raise RuntimeError('conflicting role did not roll back all DDL')
            run('psql', *actor, '-f', migration, name='triage-migration.log')
            output = run('psql', *connection, '-f', root / 'supabase/tests/testing_contribution_triage.test.sql', name='triage-pgtap.log')
            plan = re.search(r'^1\.\.(\d+)$', output, re.MULTILINE)
            passed = len(re.findall(r'^ok \d+\b', output, re.MULTILINE))
            if not plan or passed != int(plan.group(1)) or re.search(r'^not ok |^# Looks like', output, re.MULTILINE):
                raise RuntimeError('triage pgTAP failed or incomplete')
            concurrent_confirmation(run, args.pg_bin, connection, env, args.output)
            readonly = connection.copy()
            readonly[readonly.index('-U') + 1] = 'vantare_triage'
            run('psql', *connection, '-c', 'alter role vantare_triage login;', name='local-login-setup.log')
            output = run('psql', *readonly, '-c', "show default_transaction_read_only; show statement_timeout; select id from public.testing_contributions;", name='real-login-read.log')
            if not output.startswith('on\n10s\n'):
                raise RuntimeError('real worker login does not default to read only/timeout')
            run('psql', *readonly, '-c', "set default_transaction_read_only=off; update public.testing_contributions set state='accepted';", name='real-login-write-denied.log', expected=1)
            rollback = root / 'supabase/rollbacks/20261013160000_testing_contribution_triage.down.sql'
            output = run('psql', *actor, '-f', rollback, name='nonempty-rollback-denied.log', expected=3)
            if 'triage_rollback_requires_data_preservation' not in output:
                raise RuntimeError('rollback did not protect existing review/evidence')
            run('psql', *connection, '-c', """
              delete from public.testing_contributions;
              insert into public.testing_contributions(id,account_id,channel,title,body)
              values ('15940000-0000-0000-0000-000000000095','15940000-0000-0000-0000-000000000091','testers','Legacy kept','synthetic');
            """, name='local-rollback-fixtures.log')
            run('psql', *actor, '-f', rollback, name='empty-rollback.log')
            output = run('psql', *connection, '-c', """
              select to_regclass('public.testing_contribution_context') is null,
                not exists(select 1 from pg_roles where rolname='vantare_triage'),
                (select count(*)=1 from public.testing_contributions),
                to_regprocedure('public.testing_contribution_submit(uuid,text,text,text)') is not null;
            """, name='rollback-preservation.log')
            if output.strip() != 't|t|t|t':
                raise RuntimeError('pre-activation rollback failed to preserve original participation')
            run('psql', *actor, '-f', migration, name='reapply-migration.log')
            (args.output / 'summary.json').write_text(json.dumps({
                'pgTAP_passed': passed, 'role_conflict_atomic_rollback': True,
                'concurrent_account_cap': True, 'real_worker_login_readonly': True,
                'stale_snapshot_rejected': True, 'nonempty_rollback_refused': True,
                'empty_rollback_preserves_legacy': True, 'reapply_passed': True,
                'fixture': 'synthetic membership/account contracts', 'network': 'no TCP listener',
                'production_access': False, 'application_actor': 'nonsuperuser postgres with bypassrls',
            }, indent=2) + '\n', encoding='utf-8')
            print(f'PASS: {passed} pgTAP; atomic rollback; concurrent account cap; real worker login; synthetic PostgreSQL only')
        finally:
            run('pg_ctl', '-D', data, '-m', 'immediate', '-w', 'stop', name='stop.log')


if __name__ == '__main__':
    main()
