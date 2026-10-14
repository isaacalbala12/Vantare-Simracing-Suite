"""Disposable PostgreSQL/pgTAP. Synthetic bridge/membership contracts; no TCP."""
import argparse
import os
from pathlib import Path
import re
import queue
import subprocess
import tempfile
import threading
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--regression', choices=['F1', 'F2', 'F3', 'F4'], help='Run one review regression, then stop')
    dependency = parser.add_mutually_exclusive_group()
    dependency.add_argument('--dependency-ref', help='Read-only git ref of #1602 for combined local SQL validation')
    dependency.add_argument('--dependency-dir', type=Path, help='Reviewed #1602 SQL extracted from git (Windows worktree/WSL)')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    root = Path(__file__).resolve().parents[2]
    env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}

    def run(binary, *parameters, log, expected=0):
        result = subprocess.run([str(args.pg_bin / binary), *map(str, parameters)], env=env,
                                capture_output=True, text=True, encoding='utf-8', timeout=60)
        output = result.stdout + result.stderr
        (args.output / log).write_text(output, encoding='utf-8')
        if result.returncode != expected:
            raise RuntimeError(f'{log}: exit {result.returncode}')
        return output

    def concurrent_quota(connection):
        author = '16100000-0000-0000-0000-000000000040'
        run('psql', *connection, '-c', f"""insert into public.profiles(id) values('{author}');
          insert into public.testing_contributions(account_id,channel,title,body)
          select '{author}','master','Concurrent','Synthetic' from generate_series(1,4);
        """, log='concurrent-fixture.log')
        setup = f"set role authenticated; set request.jwt.claim.sub='{author}';"
        sql = lambda suffix: f"select public.testing_report_submit('16100000-0000-0000-0000-0000000000{suffix}','master','Concurrent','Synthetic',true);"
        holder = subprocess.Popen([str(args.pg_bin / 'psql'), *connection, '-q'], env=env,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        contender = None
        signals = queue.Queue()
        reader = threading.Thread(target=lambda: [signals.put(line.strip()) for line in holder.stdout], daemon=True)
        reader.start()
        try:
            holder.stdin.write(f"begin; {setup} {sql('41')} select 'holder-ready';\n")
            holder.stdin.flush()
            deadline = time.monotonic() + 10
            while signals.get(timeout=max(0.01, deadline-time.monotonic())) != 'holder-ready':
                if time.monotonic() >= deadline:
                    raise RuntimeError('holder did not acquire quota lock')
            contender_env = dict(env, PGAPPNAME='vantare-1610-quota-contender')
            contender = subprocess.Popen([str(args.pg_bin / 'psql'), *connection, '-c', setup+sql('42')], env=contender_env,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            deadline = time.monotonic() + 10
            while True:
                waiting = run('psql', *connection, '-c', "select exists(select 1 from pg_stat_activity where application_name='vantare-1610-quota-contender' and wait_event='advisory');", log='concurrent-wait.log')
                if waiting.strip() == 't':
                    break
                if contender.poll() is not None or time.monotonic() >= deadline:
                    raise RuntimeError('contender did not wait on quota lock')
                time.sleep(0.02)  # bounded observation of server state, not a timing assertion
            holder.stdin.write('commit;\n')
            holder.stdin.flush()
            holder.stdin.close()
            holder.wait(timeout=10)
            stdout, stderr = contender.communicate(timeout=10)
            (args.output / 'concurrent-rejection.log').write_text(stdout+stderr, encoding='utf-8')
            if holder.returncode or contender.returncode != 1 or 'testing_report_rate_limit' not in stderr:
                raise RuntimeError('concurrent quota not enforced')
            output = run('psql', *connection, '-c', f"select count(*) from public.testing_contributions where account_id='{author}';", log='concurrent-count.log')
            if output.strip() != '5':
                raise RuntimeError('more than five reports accepted')
        finally:
            for process in (contender, holder):
                if process is not None and process.poll() is None:
                    process.kill()
                    process.wait(timeout=10)
            reader.join(timeout=2)

    with tempfile.TemporaryDirectory(prefix='vantare-1610-') as temp:
        data = Path(temp) / 'data'
        run('initdb', '-D', data, '-U', 'local_supervisor', '--auth-local=trust', '--auth-host=reject',
            '--encoding=UTF8', '--no-locale', log='init.log')
        run('pg_ctl', '-D', data, '-l', args.output / 'server.log', '-o', f'-h "" -k {temp}', '-w', 'start', log='start.log')
        connection = ['-X', '-h', temp, '-d', 'postgres', '-U', 'local_supervisor', '-v', 'ON_ERROR_STOP=1', '-At']
        try:
            if args.dependency_ref or args.dependency_dir:
                def dependency_file(name):
                    if args.dependency_dir:
                        return args.dependency_dir / Path(name).name
                    result = subprocess.run(['git', '-C', str(root), 'show', f'{args.dependency_ref}:supabase/{name}'],
                        capture_output=True, text=True, encoding='utf-8', timeout=60, check=True)
                    path = Path(temp) / Path(name).name
                    path.write_text(result.stdout, encoding='utf-8')
                    return path
                run('psql', *connection, '-f', dependency_file('tests/triage_local_bootstrap.sql'), log='bootstrap.log')
                run('psql', *connection, '-c', 'create extension pgtap;', log='pgtap-install.log')
            else:
                run('psql', *connection, '-c', """
              create role anon noinherit;
              create role authenticated noinherit;
              create role service_role noinherit;
              create role postgres login nosuperuser bypassrls;
              create schema auth; create schema private;
              revoke create on schema public from public;
              grant usage on schema auth to authenticated;
              create function auth.uid() returns uuid language sql stable as
                $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
              create table public.profiles(id uuid primary key);
              create table public.testing_center_memberships(user_id uuid,actor_id text,role text);
              create function public.testing_center_current_role() returns text language sql stable security definer set search_path='' as
                $$select role from public.testing_center_memberships where user_id=auth.uid() limit 1$$;
              create function public.testing_center_can_view_channel(text) returns boolean language sql stable security definer set search_path='' as
                $$select exists(select 1 from public.testing_center_memberships where user_id=auth.uid())$$;
              create extension pgtap;
              grant all on schema public,private to postgres;
              grant usage on schema auth to postgres;
              grant all on public.profiles,public.testing_center_memberships to postgres;
                """, log='bootstrap.log')
            actor = connection.copy()
            actor[actor.index('-U') + 1] = 'postgres'
            run('psql', *actor, '-f', root / 'supabase/migrations/20261010000000_testing_participation.sql', log='participation.log')
            if args.dependency_ref or args.dependency_dir:
                run('psql', *actor, '-f', dependency_file('migrations/20261013160000_testing_contribution_triage.sql'), log='triage-dependency.log')
            if args.regression == 'F4':
                # Seed BEFORE apply, unlike the original rollback smoke test.
                run('psql', *connection, '-c', """insert into public.profiles(id) values('16100000-0000-0000-0000-000000000001');
                  insert into public.testing_contributions(id,account_id,channel,title,body,state) values
                  ('16100000-0000-0000-0000-000000000011','16100000-0000-0000-0000-000000000001','nightly','Legacy','Synthetic','accepted');
                """, log='legacy-before-apply.log')
                original = run('psql', *connection, '-c', 'select to_jsonb(c) from public.testing_contributions c;', log='legacy-original.log')
                migration = root / 'supabase/migrations/20261013225629_testing_reports_followup.sql'
                rollback = root / 'supabase/rollbacks/20261013225629_testing_reports_followup.down.sql'
                run('psql', *actor, '-f', migration, log='legacy-apply.log')
                run('psql', *actor, '-f', rollback, log='legacy-immediate-down.log')
                preserved = run('psql', *connection, '-c', 'select to_jsonb(c) from public.testing_contributions c;', log='legacy-preserved.log')
                if original != preserved:
                    raise RuntimeError('rollback modified a legacy contribution')
                # A cloned pre-apply DB isolates each activity case. No reused
                # dirty flag or hand-reset metadata can make a guard test pass.
                cases = {
                    'credit-off-on-off': "select public.testing_report_credit('16100000-0000-0000-0000-000000000011',true); select public.testing_report_credit('16100000-0000-0000-0000-000000000011',false);",
                    'notice': "select public.testing_report_notice_read('16100000-0000-0000-0000-000000000011',(select updated_at from public.testing_report_followup limit 1));",
                    'status': "reset role; update public.testing_contributions set state='reviewing'; update public.testing_contributions set state='accepted';",
                    'consent': "select public.testing_report_submit('16100000-0000-0000-0000-000000000011','nightly','Legacy','Synthetic',true);",
                    'new-report': "select public.testing_report_submit('16100000-0000-0000-0000-000000000012','nightly','New','Synthetic',true);",
                    'fixed': "reset role; insert into public.testing_center_memberships(user_id,actor_id,role) values('16100000-0000-0000-0000-000000000001','owner-f4','owner'); set role authenticated; select public.testing_report_fixed('16100000-0000-0000-0000-000000000011','1.2.3','Reviewed','Summary');",
                }
                for index, (label, sql) in enumerate(cases.items()):
                    database = f'activity_{index}'
                    run('psql', *connection, '-c', f'create database {database} template postgres;', log=f'{label}-clone.log')
                    case_conn = connection.copy()
                    case_conn[case_conn.index('-d') + 1] = database
                    case_actor = actor.copy()
                    case_actor[case_actor.index('-d') + 1] = database
                    run('psql', *case_actor, '-f', migration, log=f'{label}-apply.log')
                    run('psql', *case_conn, '-c', "set role authenticated; set request.jwt.claim.sub='16100000-0000-0000-0000-000000000001';" + sql, log=f'{label}-activity.log')
                    result = run('psql', *case_actor, '-f', rollback, log=f'{label}-protected.log', expected=3)
                    if 'testing_followup_rollback_requires_data_preservation' not in result:
                        raise RuntimeError(f'{label}: wrong rollback rejection')
                print(f'PASS: F4 legacy-before-apply immediate rollback preserves exact row; {len(cases)} isolated activity rollbacks blocked')
                return
            run('psql', *actor, '-f', root / 'supabase/migrations/20261013225629_testing_reports_followup.sql', log='followup.log')
            if args.regression:
                output = run('psql', *connection, '-f', root / f'supabase/tests/testing_followup_{args.regression}.test.sql', log='regression.log')
                plan = re.search(r'^1\.\.(\d+)$', output, re.M)
                count = len(re.findall(r'^ok \d+\b', output, re.M))
                if not plan or count != int(plan[1]) or re.search(r'^not ok |^# Looks like', output, re.M):
                    raise RuntimeError(f'{args.regression}: pgTAP failed/incomplete')
                print(f'PASS: {args.regression}, {count} pgTAP; local synthetic contracts only')
                return
            output = run('psql', *connection, '-f', root / 'supabase/tests/testing_reports_followup.test.sql', log='pgtap.log')
            plan = re.search(r'^1\.\.(\d+)$', output, re.M)
            count = len(re.findall(r'^ok \d+\b', output, re.M))
            if not plan or count != int(plan[1]) or re.search(r'^not ok |^# Looks like', output, re.M):
                raise RuntimeError('pgTAP failed/incomplete')
            run('psql', *connection, '-c', "insert into public.profiles(id) values('16100000-0000-0000-0000-000000000030');", log='isolation-fixture.log')
            output = run('psql', *connection, '-c', """begin isolation level repeatable read;
              set local role authenticated;
              set local request.jwt.claim.sub='16100000-0000-0000-0000-000000000030';
              select public.testing_report_submit('16100000-0000-0000-0000-000000000031','master','Snapshot','Synthetic',true);
            """, log='stale-isolation.log', expected=1)
            if 'testing_report_read_committed_required' not in output:
                raise RuntimeError('stale snapshot not rejected')
            concurrent_quota(connection)
            rollback = root / 'supabase/rollbacks/20261013225629_testing_reports_followup.down.sql'
            output = run('psql', *actor, '-f', rollback, log='rollback-protected.log', expected=3)
            if 'testing_followup_rollback_requires_data_preservation' not in output:
                raise RuntimeError('rollback did not protect data')
            run('psql', *connection, '-c', """delete from public.testing_contributions;
              insert into public.testing_contributions(id,account_id,channel,title,body) values
                ('16100000-0000-0000-0000-000000000049','16100000-0000-0000-0000-000000000040','nightly','Legacy','Synthetic');
            """, log='rollback-fixture.log')
            run('psql', *actor, '-f', rollback, log='rollback-empty.log')
            output = run('psql', *connection, '-c', "select count(*)=1, to_regclass('public.testing_report_followup') is null from public.testing_contributions;", log='rollback-preserved.log')
            if output.strip() != 't|t':
                raise RuntimeError('legacy report not preserved')
            run('psql', *actor, '-f', root / 'supabase/migrations/20261013225629_testing_reports_followup.sql', log='reapply.log')
            output = run('psql', *connection, '-c', "select count(*),bool_and(not credit) from public.testing_report_followup;", log='legacy-backfill.log')
            if output.strip() != '1|t':
                raise RuntimeError('legacy backfill missing or opted into credit')
            print(f'PASS: {count} pgTAP + stale snapshot + concurrent quota + protected rollback/reapply; synthetic contracts; no production/no TCP')
        finally:
            run('pg_ctl', '-D', data, '-m', 'immediate', '-w', 'stop', log='stop.log')


if __name__ == '__main__':
    main()
