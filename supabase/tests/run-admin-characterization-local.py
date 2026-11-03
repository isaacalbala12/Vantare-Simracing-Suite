"""VANTA-132: disposable PostgreSQL on a private Unix socket; never accepts a DSN.

Run as an unprivileged user with existing PostgreSQL/pgTAP installed.
"""
import argparse
import os
from pathlib import Path
import re
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--test', action='append', default=[])
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    args.output.mkdir(parents=True, exist_ok=True)
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}

    def run(binary, *parameters, source=None, log):
        result = subprocess.run([str(args.pg_bin / binary), *map(str, parameters)],
                                input=source, capture_output=True, text=True,
                                env=env, timeout=120)
        output = result.stdout + result.stderr
        (args.output / log).write_text(output, encoding='utf-8')
        if result.returncode:
            raise RuntimeError(f'{log}: exit {result.returncode}; see evidence')
        return output

    with tempfile.TemporaryDirectory(prefix='admin-1910-') as temporary:
        data = Path(temporary) / 'data'
        run('initdb', '-D', data, '-U', 'postgres', '--auth-local=trust',
            '--auth-host=reject', '--encoding=UTF8', '--no-locale', log='init.log')
        run('pg_ctl', '-D', data, '-l', args.output / 'server.log', '-o',
            f'-h "" -k {temporary}', '-w', 'start', log='start.log')
        connection = ['-X', '-h', temporary, '-U', 'postgres', '-d', 'postgres',
                      '-At', '-v', 'ON_ERROR_STOP=1']
        try:
            runner = (root / 'supabase/tests/run-supabase-hardening-postgres.ps1').read_text(encoding='utf-8')
            bootstrap = runner.split("Write-Utf8NoBom $bootstrap @'", 1)[1].split("'@", 1)[0]
            bootstrap += """
create role supabase_admin login superuser;
create role authenticator noinherit;
alter default privileges in schema public grant all on tables to service_role;
create function storage.foldername(text) returns text[] language sql immutable as $$
 select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]
$$;
"""
            run('psql', *connection, source=bootstrap, log='bootstrap.log')
            for migration in sorted((root / 'supabase/migrations').glob('*.sql')):
                run('psql', *connection, source=migration.read_text(encoding='utf-8'), log=migration.name + '.log')
            total = 0
            for name in args.test or ['native_admin.test.sql', 'native_admin_characterization.test.sql']:
                if Path(name).name != name or not name.endswith('.test.sql'):
                    raise ValueError('test must be a local SQL test filename')
                output = run('psql', *connection, '-f', root / 'supabase/tests' / name, log=name + '.tap')
                plan = re.search(r'^1\.\.(\d+)$', output, re.MULTILINE)
                count = len(re.findall(r'^ok \d+\b', output, re.MULTILINE))
                if not plan or count != int(plan.group(1)) or re.search(r'^not ok|^# Looks like', output, re.MULTILINE):
                    raise RuntimeError(f'pgTAP failure: {name}; see evidence')
                total += count
                print(f'PASS {name}: {count} checks', flush=True)
            print(f'TOTAL {total} checks')
        finally:
            run('pg_ctl', '-D', data, '-m', 'immediate', '-w', 'stop', log='stop.log')


if __name__ == '__main__':
    main()
