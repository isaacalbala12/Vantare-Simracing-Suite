"""Check digest compatibility in disposable PostgreSQL with both pgcrypto layouts."""
import argparse
import os
import pathlib
import socket
import subprocess
import tempfile
import time


ROOT = pathlib.Path(__file__).resolve().parents[2]
STEM = '20261104172000_isa_1933_pgcrypto_digest_contract'
UP = ROOT / 'supabase/migrations' / (STEM + '.sql')
DOWN = ROOT / 'supabase/rollbacks' / (STEM + '.down.sql')
COMPAT = ROOT / 'supabase/migrations/20260802095000_pgcrypto_public_compatibility.sql'
CONTRACT = ROOT / 'supabase/tests/pgcrypto_contract.test.sql'

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin', type=pathlib.Path, required=True)
parser.add_argument('--baseline-only', action='store_true',
                    help='Characterize the old chain before the new migration')
parser.add_argument('--docker', action='store_true',
                    help='Use a disposable local Supabase PostgreSQL 17 container')
args = parser.parse_args()
BIN = args.pg_bin.resolve()


def run(program, *arguments, check=True):
    result = subprocess.run([str(BIN / program), *map(str, arguments)],
                            capture_output=True, text=True)
    if check and result.returncode:
        log = pathlib.Path(arguments[arguments.index('-l') + 1]) if '-l' in arguments else None
        detail = log.read_text() if log and log.exists() else ''
        raise RuntimeError(result.stderr + result.stdout + detail)
    return result


with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]

with tempfile.TemporaryDirectory(prefix='vantare-pgcrypto-') as temporary:
    data = pathlib.Path(temporary) / 'data'
    container = 'vantare-pgcrypto-' + os.urandom(6).hex()
    if args.docker:
        started = subprocess.run([
            'docker', 'run', '--rm', '-d', '--name', container,
            '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
            'public.ecr.aws/supabase/postgres:17.6.1.165'],
            capture_output=True, text=True)
        if started.returncode:
            raise RuntimeError(started.stderr)
        for _ in range(120):
            logs = subprocess.run(['docker', 'logs', container], capture_output=True,
                                  text=True)
            ready = subprocess.run(['docker', 'exec', container, 'pg_isready',
                                    '-U', 'postgres'], capture_output=True)
            if 'PostgreSQL init process complete' in logs.stdout + logs.stderr \
                    and ready.returncode == 0:
                break
            time.sleep(.25)
        else:
            subprocess.run(['docker', 'rm', '-f', container],
                           capture_output=True, check=False)
            raise RuntimeError('disposable PostgreSQL container did not start')
    else:
        run('initdb', '-D', data, '-U', 'postgres', '--auth-local=trust',
            '--auth-host=trust', '--encoding=UTF8', '--no-locale')
        run('pg_ctl', '-D', data, '-l', pathlib.Path(temporary) / 'postgres.log',
            '-o', f'-h 127.0.0.1 -p {port} -k {temporary}', '-w', 'start')

    def docker(*arguments, input_text=None, check=True):
        result = subprocess.run(['docker', 'exec', '-i', container, *arguments],
                                input=input_text, capture_output=True, text=True)
        if check and result.returncode:
            raise RuntimeError(result.stderr + result.stdout)
        return result

    def psql(database, *arguments, check=True):
        if args.docker:
            command = ['psql', '-X', '-U', 'postgres', '-d', database,
                       '-v', 'ON_ERROR_STOP=1']
            if '-f' in arguments:
                file_index = arguments.index('-f')
                source = pathlib.Path(arguments[file_index + 1]).read_text(encoding='utf-8')
                arguments = (*arguments[:file_index], '-f', '-', *arguments[file_index + 2:])
                return docker(*command, *map(str, arguments),
                              input_text=source, check=check)
            return docker(*command, *map(str, arguments), check=check)
        return run('psql', '-X', '-h', '127.0.0.1', '-p', port,
                   '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1',
                   *arguments, check=check)

    try:
        psql('postgres', '-c', """do $$ begin
          if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
          if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
          if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
        end $$;""")
        if not args.baseline_only:
            if args.docker:
                docker('createdb', '-U', 'postgres', '--template=template0',
                       'pgcrypto_missing')
            else:
                run('createdb', '-h', '127.0.0.1', '-p', port,
                    '-U', 'postgres', 'pgcrypto_missing')
            missing = psql('pgcrypto_missing', '-f', UP, check=False)
            if missing.returncode == 0 or 'pgcrypto_digest_contract_missing' not in missing.stderr:
                raise RuntimeError('missing extension did not fail closed: ' + missing.stderr)
            print('missing extension: 55000 PASS')
        for schema in ('extensions', 'public'):
            database = 'pgcrypto_' + schema
            if args.docker:
                docker('createdb', '-U', 'postgres', '--template=template0', database)
            else:
                run('createdb', '-h', '127.0.0.1', '-p', port,
                    '-U', 'postgres', database)
            psql(database, '-c', 'create schema if not exists extensions; '
                 f'create extension pgcrypto with schema {schema};')
            psql(database, '-f', COMPAT)
            check_args = ('-c', f"select set_config('fixture.pgcrypto_schema','{schema}',false)",
                          '-f', CONTRACT)
            baseline = psql(database, *check_args, check=False)
            if schema == 'extensions' and baseline.returncode:
                raise RuntimeError('hosted-layout baseline failed: ' + baseline.stderr)
            if schema == 'public' and baseline.returncode == 0:
                raise RuntimeError('public-layout baseline did not expose the missing alias')
            print(f'{schema} baseline: ' + ('PASS' if baseline.returncode == 0 else 'RED'))
            if args.baseline_only:
                continue
            psql(database, '-f', UP)
            psql(database, *check_args)
            psql(database, '-f', DOWN)
            remaining = psql(database, '-At', '-c',
                "select to_regprocedure('public.digest(text,text)') is not null,"
                "to_regprocedure('extensions.digest(text,text)') is not null")
            expected = 't|t' if schema == 'extensions' else 't|f'
            if remaining.stdout.strip() != expected:
                raise RuntimeError(f'{schema} rollback left {remaining.stdout.strip()}, expected {expected}')
            psql(database, '-f', UP)
            psql(database, *check_args)
            print(f'{schema} up/down/reapply: PASS')
    finally:
        if args.docker:
            subprocess.run(['docker', 'rm', '-f', container],
                           capture_output=True, check=False)
        else:
            run('pg_ctl', '-D', data, '-m', 'immediate', '-w', 'stop')
