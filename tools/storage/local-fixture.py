"""#1608 only: synthetic auth for a fresh disposable Supabase project named stack."""
import argparse
import base64
import hashlib
import hmac
import http.client
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import subprocess
import time
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('command', choices=['start', 'proxy'])
parser.add_argument('--output', required=True)
parser.add_argument('--backend', help='Optional directory of synthetic fixture bytes')
parser.add_argument('--read-only', action='store_true', help='Real backend failure control')
args = parser.parse_args()
out = Path(args.output).resolve()
out.mkdir(parents=True, exist_ok=True)

if args.command == 'proxy':
    class Proxy(BaseHTTPRequestHandler):
        def dispatch(self):
            body = self.rfile.read(int(self.headers.get('content-length', 0)))
            conn = http.client.HTTPConnection('127.0.0.1', 54328, timeout=15)
            conn.request(self.command, self.path.removeprefix('/storage/v1'), body, dict(self.headers))
            response = conn.getresponse()
            data = response.read()
            self.send_response(response.status)
            for name, value in response.getheaders():
                if name.lower() not in ('transfer-encoding', 'connection', 'content-length'):
                    self.send_header(name, value)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            conn.close()
        do_DELETE = do_POST = do_PUT = do_GET = dispatch
        def log_message(self, *_args):
            pass
    HTTPServer(('127.0.0.1', 54330), Proxy).serve_forever()
else:
    # Constants are new local test material, never credentials from an installation.
    secret = 'isa1608-r6-storage-signing-material-32-bytes'
    def token(role):
        def encode(value):
            return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b'=').decode()
        body = encode({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encode({
            'role': role, 'iss': 'fixture', 'exp': int(time.time()) + 3600,
        })
        return body + '.' + base64.urlsafe_b64encode(
            hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()).rstrip(b'=').decode()
    anon, service = token('anon'), token('service_role')
    subprocess.run(['docker', 'exec', 'supabase_db_stack', 'psql', '-X', '-U',
        'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
        "alter role supabase_storage_admin password 'isa1608-local-disposable-fixture';"],
        check=True, capture_output=True)
    settings = {
        'DATABASE_URL': 'postgresql://supabase_storage_admin:isa1608-local-disposable-fixture@supabase_db_stack:5432/postgres',
        'AUTH_JWT_SECRET': secret, 'ANON_KEY': anon, 'SERVICE_KEY': service,
        'TENANT_ID': 'stub', 'STORAGE_BACKEND': 'file',
        'FILE_STORAGE_BACKEND_PATH': '/tmp/r5-storage', 'STORAGE_S3_BUCKET': 'fixture-bucket',
        'REGION': 'us-east-1', 'S3_PROTOCOL_PREFIX': '/storage/v1',
    }
    cmd = ['docker', 'run', '--rm', '-d', '--name', 'isa1608-r6-storage',
        '--network', 'supabase_network_stack', '-p', '127.0.0.1:54328:5000']
    for name, value in settings.items():
        cmd.extend(['-e', name + '=' + value])
    if args.backend:
        mount = f'type=bind,src={Path(args.backend).resolve()},dst=/tmp/r5-storage'
        cmd.extend(['--mount', mount + (',readonly' if args.read_only else '')])
    elif args.read_only:
        raise ValueError('--read-only requires --backend')
    cmd.append('public.ecr.aws/supabase/storage-api:v1.70.3')
    subprocess.run(cmd, check=True, capture_output=True)
    (out/'storage-fixture-auth.json').write_text(json.dumps({
        'url': 'http://127.0.0.1:54330', 'anonKey': anon, 'serviceKey': service,
        'tenant': 'stub', 'region': 'us-east-1',
    }))
    deadline = time.monotonic() + 30
    while True:
        try:
            with urllib.request.urlopen('http://127.0.0.1:54328/status', timeout=1) as response:
                if response.status == 200:
                    break
        except OSError:
            if time.monotonic() >= deadline:
                raise
            time.sleep(.1)  # Service readiness, not transaction scheduling.
    print('Local Storage fixture ready; credentials written only to fixture output')
