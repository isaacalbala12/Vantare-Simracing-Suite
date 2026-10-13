"""Exercise the publisher entrypoint with fake tools, never contacting a host."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / 'tools/server/roadmap/vantare-roadmap-publish.sh'
BASH = (r'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else shutil.which('bash'))


class ServerTests(unittest.TestCase):
    def run_publisher(self, failure=''):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            tools = root / 'bin'
            tools.mkdir()
            repo = root / 'repo'
            (repo / '.git').mkdir(parents=True)
            # Fake clients deliberately emit secret-looking fixture responses on failure.
            stub = '''#!/usr/bin/env bash
tool=$(basename "$0")
echo "$tool $*" >> "$TEST_LOG"
case "$tool" in
  git) if [[ "$1" = rev-parse ]]; then echo "$ROADMAP_REF"; fi ;;
  python3)
    if [[ "$*" = *unittest* && ( -n "${PLANE_API_KEY:-}" || -n "${PGPASSWORD:-}" ) ]]; then exit 1; fi
    if [[ "$*" = *publish_plane_roadmap.py* && ( -z "${PLANE_API_KEY:-}" || -n "${PGPASSWORD:-}" ) ]]; then exit 1; fi
    if [[ "$*" = *verify_roadmap_tls.py* && ( -n "${PLANE_API_KEY:-}" || -n "${PGPASSWORD:-}" ) ]]; then exit 1; fi
    if [[ "$*" = *publish_plane_roadmap.py* && "$TEST_FAILURE" = limit ]]; then
      echo 'Roadmap supera 40 tareas o 40 KB; parar y pedir decisión a Isaac'; exit 1
    fi
    if [[ "$*" = *verify_roadmap_tls.py* && "$TEST_FAILURE" = tls ]]; then exit 1; fi ;;
  psql)
    [[ -z "${PLANE_API_KEY:-}" && -n "${PGPASSWORD:-}" ]] || exit 1
    [[ "$PGSSLMODE" = verify-full ]] || exit 1
    if [[ "$TEST_FAILURE" = sql ]]; then echo 'PRIVATE fixture-key'; exit 1; fi ;;
esac
'''
            for name in ['git', 'python3', 'node', 'psql']:
                (tools / name).write_text(stub, encoding='utf-8')
                (tools / name).chmod(0o700)
            env = dict(os.environ, ROADMAP_REF='1' * 40, PLANE_URL='http://192.168.1.57:8088',
                       PLANE_WORKSPACE='fixture', PLANE_PROJECT_ID='fixture', PLANE_API_KEY='fixture-key',
                       PGHOST='db.fixture.test', PGPORT='5432', PGDATABASE='fixture', PGUSER='fixture',
                       PGPASSWORD='fixture-password', TEST_FAILURE=failure)
            if failure == 'missing':
                env.pop('PLANE_API_KEY')
            if failure == 'ref':
                env['ROADMAP_REF'] = 'master'
            def posix(path):
                if os.name == 'nt':
                    return '/' + path.drive[0].lower() + path.as_posix()[2:]
                return path.as_posix()
            log = root / 'calls.log'
            env['ROADMAP_REPO'] = posix(repo)
            env['TEST_LOG'] = posix(log)
            result = subprocess.run([BASH, '-c', 'export PATH="$1:$PATH"; exec bash "$2"',
                                     'publisher-test', posix(tools), posix(SCRIPT)], env=env,
                                    capture_output=True, text=True, timeout=15)
            calls = log.read_text() if log.exists() else ''
            return result, calls

    def test_preparation_tls_and_dedicated_sync_in_order(self):
        result, calls = self.run_publisher()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLess(calls.index('publish_plane_roadmap.py'), calls.index('verify_roadmap_tls.py'))
        self.assertLess(calls.index('verify_roadmap_tls.py'), calls.index('psql '))
        self.assertIn('node --test', calls)
        self.assertNotIn('fixture-key', result.stdout + result.stderr + calls)
        self.assertNotIn('fixture-password', result.stdout + result.stderr + calls)

    def test_source_limit_or_tls_failure_never_reaches_sql(self):
        for failure in ['limit', 'tls']:
            result, calls = self.run_publisher(failure)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn('psql ', calls)

    def test_missing_secret_or_unapproved_ref_never_reaches_git(self):
        for failure in ['missing', 'ref']:
            result, calls = self.run_publisher(failure)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(calls, '')

    def test_sql_failure_is_sanitized_and_propagated(self):
        result, calls = self.run_publisher('sql')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('psql ', calls)
        self.assertNotIn('PRIVATE', result.stdout + result.stderr)
        self.assertNotIn('fixture-key', result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
