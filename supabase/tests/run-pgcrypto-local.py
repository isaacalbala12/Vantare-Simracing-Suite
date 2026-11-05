"""Probe digest signatures and SHA-256 vectors in disposable PostgreSQL."""
import argparse
import os
import pathlib
import socket
import subprocess
import tempfile
import time


ROOT = pathlib.Path(__file__).resolve().parents[2]
STEM = '20261104182500_isa_1933_pgcrypto_digest_contract'
UP = ROOT / 'supabase/migrations' / (STEM + '.sql')
DOWN = ROOT / 'supabase/rollbacks' / (STEM + '.down.sql')
COMPAT = ROOT / 'supabase/migrations/20260802095000_pgcrypto_public_compatibility.sql'
CONTRACT = ROOT / 'supabase/tests/pgcrypto_contract.test.sql'
RUNBOOK = ROOT / 'vantare-v2/docs/runbooks/pgcrypto-digest-contract.md'

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
            if missing.returncode == 0 or 'pgcrypto_digest_signature_missing' not in missing.stderr:
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
            inventory_sql = RUNBOOK.read_text(encoding='utf-8').split('```sql\n', 1)[1].split('\n```', 1)[0]
            inventory = [line.split('|') for line in
                         psql(database, '-At', '-c', inventory_sql).stdout.splitlines()]
            if len(inventory) != 4:
                raise RuntimeError('runbook inventory did not return four signatures')
            origins = {row[0]: row[3] for row in inventory}
            expected_origins = ({
                'public.digest(text,text)': 'wrapper_or_other',
                'public.digest(bytea,text)': 'wrapper_or_other',
                'extensions.digest(text,text)': 'native_pgcrypto',
                'extensions.digest(bytea,text)': 'native_pgcrypto',
            } if schema == 'extensions' else {
                'public.digest(text,text)': 'native_pgcrypto',
                'public.digest(bytea,text)': 'native_pgcrypto',
                'extensions.digest(text,text)': 'missing',
                'extensions.digest(bytea,text)': 'missing',
            })
            if origins != expected_origins:
                raise RuntimeError('runbook inventory misclassified signatures: ' + str(origins))
            check_args = ('-f', CONTRACT)
            baseline = psql(database, *check_args, check=False)
            if schema == 'extensions' and baseline.returncode:
                raise RuntimeError('hosted-layout baseline failed: ' + baseline.stderr)
            if schema == 'public' and baseline.returncode == 0:
                raise RuntimeError('public-layout baseline did not expose the missing alias')
            print(f'{schema} baseline: ' + ('PASS' if baseline.returncode == 0 else 'RED'))
            if args.baseline_only:
                continue
            digest_catalog = """select coalesce(jsonb_agg(jsonb_build_object(
              'signature',p.oid::regprocedure::text,'body',pg_get_functiondef(p.oid),
              'acl',p.proacl::text) order by p.oid),'[]'::jsonb)
              from pg_proc p where p.oid in (
                to_regprocedure('public.digest(text,text)'),
                to_regprocedure('public.digest(bytea,text)'),
                to_regprocedure('extensions.digest(text,text)'),
                to_regprocedure('extensions.digest(bytea,text)'))"""
            before = psql(database, '-At', '-c', digest_catalog).stdout
            if schema == 'public':
                rejected = psql(database, '-f', UP, check=False)
                if rejected.returncode == 0 or 'pgcrypto_digest_signature_missing' not in rejected.stderr:
                    raise RuntimeError('incomplete public layout did not fail closed: ' + rejected.stderr)
                psql(database, '-f', DOWN)
                if psql(database, '-At', '-c', digest_catalog).stdout != before:
                    raise RuntimeError('failed probe or rollback changed public layout')
                print('public layout: missing signatures rejected without a bridge PASS')
                continue
            psql(database, '-f', UP)
            psql(database, *check_args)
            psql(database, '-f', DOWN)
            psql(database, '-f', UP)
            psql(database, *check_args)
            if psql(database, '-At', '-c', digest_catalog).stdout != before:
                raise RuntimeError('probe changed digest definitions or ACL')
            print('extensions up/down/reapply: vector and definer PASS')
        if not args.baseline_only:
            for overload in ('text', 'bytea'):
                database = 'pgcrypto_bad_' + overload
                if args.docker:
                    docker('createdb', '-U', 'postgres', '--template=template0', database)
                else:
                    run('createdb', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', database)
                psql(database, '-c', 'create schema extensions; create extension pgcrypto with schema extensions;')
                psql(database, '-f', COMPAT)
                psql(database, '-c', f"""create or replace function public.digest(data {overload}, algorithm text)
                  returns bytea language sql immutable strict as $$
                  select decode(repeat('00',32),'hex') $$""")
                rejected = psql(database, '-f', UP, check=False)
                if rejected.returncode == 0 or 'pgcrypto_digest_vector_mismatch' not in rejected.stderr:
                    raise RuntimeError(overload + ' vector mismatch was not rejected: ' + rejected.stderr)
                print(overload + ' tampered public digest: vector mismatch PASS')
    finally:
        if args.docker:
            subprocess.run(['docker', 'rm', '-f', container],
                           capture_output=True, check=False)
        else:
            run('pg_ctl', '-D', data, '-m', 'immediate', '-w', 'stop')
