"""Verify PostgreSQL STARTTLS + CA + hostname, without authentication or SQL."""
import argparse
from pathlib import Path
import subprocess


def verify(host, port, ca, openssl):
    base = [openssl, 's_client', '-starttls', 'postgres', '-connect', f'{host}:{port}',
            '-servername', host, '-verify_return_error', '-no-CApath', '-no-CAstore']

    def probe(arguments):
        return subprocess.run(base + arguments, input='', capture_output=True,
                              text=True, timeout=20)

    good = probe(['-verify_hostname', host, '-CAfile', str(ca)])
    if good.returncode != 0 or 'Verify return code: 0 (ok)' not in good.stdout:
        raise RuntimeError('Supabase CA/hostname validation failed; no publication allowed')
    wrong = probe(['-verify_hostname', 'wrong-host.invalid', '-CAfile', str(ca)])
    if wrong.returncode == 0 or 'hostname mismatch' not in wrong.stderr:
        raise RuntimeError('Wrong-host negative control failed')
    return 'PASS CA and hostname; wrong hostname rejected'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', required=True)
    parser.add_argument('--port', type=int, default=5432)
    parser.add_argument('--ca', type=Path, required=True)
    parser.add_argument('--openssl', default='openssl')
    args = parser.parse_args()
    if not args.host.endswith(('.pooler.supabase.com', '.supabase.co')) or not 0 < args.port < 65536:
        parser.error('Expected public Supabase Postgres hostname and port')
    try:
        print(verify(args.host, args.port, args.ca, args.openssl))
    except (OSError, RuntimeError, subprocess.TimeoutExpired):
        parser.exit(1, 'TLS verification failed. Review CA, hostname and network before publishing.\n')


if __name__ == '__main__':
    main()
