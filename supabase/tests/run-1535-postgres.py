"""Disposable local PostgreSQL only. Existing binaries + pgTAP required; no remote DSN."""
import argparse
import os
from pathlib import Path
import socket
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    root = Path(__file__).resolve().parents[2]
    env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='vantare-1535-') as temp:
        data = Path(temp) / 'data'

        def run(program, *parameters, name, expected=0):
            result = subprocess.run([str(args.pg_bin / program), *map(str, parameters)],
                                    env=env, capture_output=True, text=True, encoding='utf-8')
            (args.output / name).write_text(result.stdout + result.stderr, encoding='utf-8')
            if result.returncode != expected:
                raise RuntimeError(f'{name} failed; inspect local log')
            return result.stdout + result.stderr

        run('initdb', '-D', data, '-U', 'postgres', '--auth-local=trust',
            '--auth-host=trust', '--encoding=UTF8', '--no-locale', name='initdb.log')
        options = f'-h 127.0.0.1 -p {port} -k {temp}'
        run('pg_ctl', '-D', data, '-l', args.output / 'postgres.log', '-o', options,
            '-w', 'start', name='start.log')
        try:
            connection = ['-X', '-h', '127.0.0.1', '-p', str(port), '-d', 'postgres',
                          '-U', 'postgres', '-v', 'ON_ERROR_STOP=1']

            def file(path, name):
                return run('psql', *connection, '-At', '-f', path, name=name)

            run('psql', *connection, '-c', 'create extension pgtap;', name='pgtap.log')
            file(root / 'supabase/tests/1535-bootstrap.sql', 'bootstrap.log')
            for migration in ('20260808000000_race_schedule_publications.sql',
                              '20260924000000_visual_roadmap.sql',
                              '20261009000000_visual_roadmap_later.sql',
                              '20261010000000_testing_participation.sql',
                              '20261010001000_visual_roadmap_clickup.sql'):
                file(root / 'supabase/migrations' / migration, migration + '.log')
            for suite, count in [('testing_participation', 20), ('visual_roadmap_clickup', 29)]:
                output = file(root / f'supabase/tests/{suite}.test.sql', suite + '.log')
                if 'not ok ' in output or f'1..{count}' not in output or f'ok {count} ' not in output:
                    raise RuntimeError(f'{suite} pgTAP failed')

            # A REAL dedicated LOGIN, no SET ROLE authenticated, forged owner claims.
            owner = '15350000-0000-0000-0000-000000000099'
            run('psql', *connection, '-c', f"""
                insert into public.profiles(id) values('{owner}');
                insert into public.operational_access_assignments values('{owner}','owner','active',null);
                insert into public.race_schedule_publications(status,schedule,source_text,valid_from,series_count,created_by)
                  values('draft','{{}}','LOCAL PRIVATE DRAFT',now(),1,'{owner}');
                """, name='owner-seed.log')
            login = connection.copy()
            login[login.index('postgres', login.index('-U') + 1)] = 'vantare_roadmap_publisher'
            denial = subprocess.run([str(args.pg_bin / 'psql'), *login, '-c',
                                    f"set request.jwt.claim.sub='{owner}'; select * from public.race_schedule_my_draft();"],
                                   env=env, capture_output=True, text=True)
            (args.output / 'real-login-adversarial.log').write_text(denial.stdout + denial.stderr, encoding='utf-8')
            if denial.returncode == 0 or 'permission denied for function race_schedule_my_draft' not in denial.stderr:
                raise RuntimeError('real LOGIN private draft denial failed')
            allowed = run('psql', *connection, '-At', '-c',
                          f"set role authenticated; set request.jwt.claim.sub='{owner}'; select source_text from public.race_schedule_my_draft();",
                          name='authenticated-draft.log')
            if 'LOCAL PRIVATE DRAFT' not in allowed:
                raise RuntimeError('authenticated owner lost private draft read')
            triggered = run('psql', *connection, '-At', '-c', """
                grant insert on auth.users to service_role;
                set role service_role;
                insert into auth.users(id,raw_user_meta_data)
                  values('15350000-0000-0000-0000-000000000098','{}');
                reset role;
                select count(*) from public.profiles where id='15350000-0000-0000-0000-000000000098';
                select count(*) from public.licenses where user_id='15350000-0000-0000-0000-000000000098';
                """, name='trigger-preserved.log')
            if triggered.splitlines()[-2:] != ['1', '1']:
                raise RuntimeError('PUBLIC closure broke the existing auth trigger')
            # Prove that a new default-PUBLIC DEFINER fails the exact migration gate.
            run('psql', *connection, '-c', """
                create function public.unreviewed_ci_fixture() returns text
                language sql security definer as $$select 'LOCAL PRIVATE VALUE'::text$$;
                """, name='unknown-definer-seed.log')
            migration = (root / 'supabase/migrations/20261010001000_visual_roadmap_clickup.sql').read_text()
            audit = migration[migration.index('do $$\ndeclare unexpected text;'):migration.rindex('commit;')]
            rejected = run('psql', *connection, '-c', audit, name='unknown-definer-denied.log', expected=1)
            if 'unreviewed_ci_definers' not in rejected or 'unreviewed_ci_fixture' not in rejected:
                raise RuntimeError('unknown DEFINER audit did not reject the new function')
            run('psql', *connection, '-c', 'drop function public.unreviewed_ci_fixture();', name='unknown-definer-cleanup.log')
            run('psql', *connection, '-c', audit, name='acl-audit.log')
            run('psql', *connection, '-c', """
                do $$ begin create role vantare_roadmap_publisher;
                exception when duplicate_object then null; end $$;
                alter role vantare_roadmap_publisher login noinherit nosuperuser nocreatedb
                  nocreaterole noreplication nobypassrls connection limit 2;
                """, name='role-repeat.log')
            print('PASS: pgTAP 20+29, real LOGIN rejects forged owner claims, role repeat')
        finally:
            run('pg_ctl', '-D', data, '-m', 'fast', '-w', 'stop', name='stop.log')


if __name__ == '__main__':
    main()
