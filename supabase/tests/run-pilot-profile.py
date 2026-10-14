"""Only disposable loopback PostgreSQL; no DSN, production or existing database."""
import argparse
import os
import re
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
    with tempfile.TemporaryDirectory(prefix='vantare-1612-') as temp:
        data = Path(temp) / 'data'

        def run(program, *parameters, name):
            result = subprocess.run([str(args.pg_bin / program), *map(str, parameters)],
                                    env=env, capture_output=True, text=True, encoding='utf-8', timeout=120)
            output = result.stdout + result.stderr
            (args.output / name).write_text(output, encoding='utf-8')
            if result.returncode:
                raise RuntimeError(f'{name} failed; inspect local log')
            return output

        run('initdb', '-D', data, '-U', 'postgres', '--auth-local=trust', '--auth-host=trust',
            '--encoding=UTF8', '--no-locale', name='initdb.log')
        run('pg_ctl', '-D', data, '-l', args.output / 'postgres.log', '-o',
            f'-h 127.0.0.1 -p {port} -k {temp}', '-w', 'start', name='start.log')
        try:
            connection = ['-X', '-h', '127.0.0.1', '-p', str(port), '-d', 'postgres',
                          '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
            run('psql', *connection, '-c', 'create extension pgtap;', name='pgtap.log')
            for path in ('supabase/tests/pilot-profile-bootstrap.sql',
                         'supabase/migrations/20261013225839_pilot_profile_private.sql',
                         'supabase/tests/pilot-profile.test.sql'):
                output = run('psql', *connection, '-f', root / path, name=Path(path).name + '.log')
            count = re.search(r'^1\.\.(\d+)$', output, re.MULTILINE)
            if 'not ok ' in output or count is None or f'ok {count[1]} ' not in output:
                raise RuntimeError('pilot pgTAP failed')
            print(f'PASS {count[1]} local PostgreSQL profile/storage/RLS checks')
        finally:
            run('pg_ctl', '-D', data, '-m', 'fast', '-w', 'stop', name='stop.log')


if __name__ == '__main__':
    main()
