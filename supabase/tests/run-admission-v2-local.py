"""Disposable local PostgreSQL smoke for VANTA-131 step 2; no network listener."""
import argparse
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path, required=True)
    parser.add_argument('--tmp-dir', type=Path, help='Writable local directory for disposable cluster')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    parent = (args.tmp_dir or Path(tempfile.gettempdir())).resolve()
    temporary = parent / f'vantare-admission-v2-{uuid.uuid4().hex}'
    temporary.mkdir()
    data = temporary / 'data'
    try:

        def run(name, *params, expected=0):
            with (temporary / 'command.log').open('w+', encoding='utf-8') as log:
                result = subprocess.run([str(args.pg_bin / name), *map(str, params)],
                                        env=env, stdout=log, stderr=subprocess.STDOUT,
                                        timeout=60)
                log.seek(0)
                output = log.read()
            if result.returncode != expected:
                raise RuntimeError(f'{name} failed: {output[-1000:]}')
            return output

        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            port = probe.getsockname()[1]
        run('initdb', '-D', data, '-U', 'local_supervisor', '--auth-local=trust',
            '--auth-host=trust', '--encoding=UTF8', '--no-locale')
        run('pg_ctl', '-D', data, '-l', Path(temporary) / 'postgres.log',
            '-o', f'-h 127.0.0.1 -p {port}', '-w', 'start')
        connection = ['-X', '-h', '127.0.0.1', '-p', str(port), '-d', 'postgres', '-U', 'local_supervisor',
                      '-v', 'ON_ERROR_STOP=1', '-At']
        try:
            run('psql', *connection, '-c', '''
              create role anon noinherit;
              create role authenticated noinherit;
              create role service_role noinherit;
              create schema private;
              grant usage on schema public to anon, authenticated, service_role;
              grant usage on schema private to service_role;
              -- The complete commercial harness supplies the real deletion guard.
              create function private.guard_account_write() returns trigger
                language plpgsql as $$ begin
                  if tg_op = 'DELETE' then return old; end if;
                  return new;
                end $$;
            ''')
            for migration in ('20261014022701_testing_report_ip_admission.sql',
                              '20261103093000_isa_1896_report_admission.sql'):
                run('psql', *connection, '-f', root / 'supabase/migrations' / migration)
            run('psql', *connection, '-c', '''
              do $$
              declare a uuid := '16100000-0000-0000-0000-000000000091';
                w date := date_trunc('week', clock_timestamp() at time zone 'UTC')::date;
              begin
                if not exists(select 1 from pg_trigger where
                  tgrelid='private.testing_report_admitted_keys'::regclass
                  and tgname='a_account_write_barrier' and tgenabled='O')
                then raise exception 'missing account deletion barrier'; end if;
                if has_function_privilege('anon','public.testing_report_admit_account(uuid,text,text,date)','execute')
                  or has_function_privilege('authenticated','public.testing_report_admit_account(uuid,text,text,date)','execute')
                  or not has_function_privilege('service_role','public.testing_report_admit_account(uuid,text,text,date)','execute')
                then raise exception 'ACL admission v2'; end if;
                if not public.testing_report_admit_account(a,'draft_1',repeat('a',64),w)
                  or not public.testing_report_admit_account(a,'draft_1',repeat('a',64),w)
                then raise exception 'exact replay'; end if;
                if (select attempts from private.testing_report_attempts where scope='account' and subject=a::text) <> 1
                then raise exception 'retry charged account'; end if;
                begin
                  perform public.testing_report_admit_account(a,'draft_1',repeat('b',64),w);
                  raise exception 'changed body accepted';
                exception when unique_violation then null;
                end;
                for i in 2..5 loop
                  if not public.testing_report_admit_account(a,'draft_'||i,repeat('a',64),w)
                  then raise exception 'new report denied early'; end if;
                end loop;
                if public.testing_report_admit_account(a,'draft_6',repeat('a',64),w)
                  or exists(select 1 from private.testing_report_admitted_keys where account_id=a and report_key='draft_6')
                then raise exception 'sixth new report admitted'; end if;
              end $$;
            ''')
            denied = run('psql', *connection, '-f', root / 'supabase/rollbacks/20261103093000_isa_1896_report_admission.down.sql', expected=3)
            if 'testing_admission_v2_rollback_requires_data_preservation' not in denied:
                raise RuntimeError('rollback did not protect active admission keys')
            run('psql', *connection, '-c', 'delete from private.testing_report_admitted_keys;')
            run('psql', *connection, '-f', root / 'supabase/rollbacks/20261103093000_isa_1896_report_admission.down.sql')
            if run('psql', *connection, '-c', "select to_regprocedure('public.testing_report_admit_account(uuid,text,text,date)') is null;").strip() != 't':
                raise RuntimeError('rollback left admission v2 function')
            print('PASS: local ACL, exact retry, changed body, account quota and rollback')
        finally:
            run('pg_ctl', '-D', data, '-m', 'fast', '-w', 'stop')
    finally:
        if temporary.resolve().parent != parent:
            raise RuntimeError('disposable PostgreSQL path escaped its parent')
        shutil.rmtree(temporary)


if __name__ == '__main__':
    main()
