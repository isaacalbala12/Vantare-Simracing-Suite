"""Characterization of the historical cutoff and new migration contract."""
import pathlib
import subprocess
import sys
import tempfile
import unittest


LINTER = pathlib.Path(__file__).with_name('lint_migrations.py')
CUTOFF = '20261104110000'
OLD = '20261104100000_historical.sql'
NEW = '20261104110001_new.sql'
VALID = '''begin;
create or replace function public.example() returns integer language sql as $$select 1$$;
revoke all on function public.example() from public, anon, authenticated, service_role;
grant execute on function public.example() to authenticated;
commit;
'''


class MigrationPolicyLintTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name)
        (self.root / 'migrations').mkdir()
        (self.root / 'rollbacks').mkdir()
        (self.root / 'migrations' / OLD).write_text(
            'select auth.uid(), pg_get_functiondef(1::oid);\n')
        self.write_new(VALID)

    def write_new(self, text, rollback='begin; commit;\n'):
        (self.root / 'migrations' / NEW).write_text(text)
        down = self.root / 'rollbacks' / NEW.replace('.sql', '.down.sql')
        if rollback is None:
            down.unlink(missing_ok=True)
        else:
            down.write_text(rollback)

    def lint(self):
        return subprocess.run(
            [sys.executable, str(LINTER), '--root', str(self.root),
             '--cutoff', CUTOFF], capture_output=True, text=True)

    def test_historical_violation_ignored_and_new_complete_function_passes(self):
        result = self.lint()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_missing_rollback_rejected(self):
        self.write_new(VALID, rollback=None)
        result = self.lint()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('.down.sql', result.stdout)

    def test_function_body_patch_rejected(self):
        self.write_new(VALID + "select replace(pg_get_functiondef('public.example()'::regprocedure),'a','b');\n")
        result = self.lint()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('pg_get_functiondef', result.stdout)

    def test_auth_uid_rejected_but_comment_ignored(self):
        self.write_new(VALID + 'select auth.uid();\n')
        self.assertIn('auth.uid', self.lint().stdout)
        self.write_new('-- old auth.uid() is not executable\n' + VALID)
        self.assertEqual(self.lint().returncode, 0)

    def test_missing_acl_role_rejected(self):
        self.write_new(VALID.replace('public, anon, authenticated, service_role',
                                     'public, anon, authenticated'))
        result = self.lint()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('service_role', result.stdout)

    def test_create_function_without_full_replace_rejected(self):
        self.write_new(VALID.replace('create or replace function', 'create function'))
        result = self.lint()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('create or replace', result.stdout)

    def test_declaration_without_function_body_rejected(self):
        self.write_new('''create or replace function public.example() returns integer language sql;
revoke all on function public.example() from public,anon,authenticated,service_role;
''')
        result = self.lint()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('full body', result.stdout)

    def test_altered_table_requires_explicit_acl(self):
        self.write_new('alter table public.example add column note text;\n')
        result = self.lint()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('public.example', result.stdout)

    def test_rollback_cannot_patch_function_text(self):
        self.write_new(VALID, rollback="select replace(pg_get_functiondef('public.example()'::regprocedure),'a','b');\n")
        result = self.lint()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('.down.sql', result.stdout)

    def test_rollback_cannot_use_auth_uid(self):
        self.write_new(VALID, rollback='select auth.uid();\n')
        result = self.lint()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('auth.uid', result.stdout)

    def test_altered_table_with_explicit_acl_passes(self):
        self.write_new('''alter table public.example add column note text;
revoke all on table public.example from public,anon,authenticated,service_role;
grant select on table public.example to service_role;
''')
        self.assertEqual(self.lint().returncode, 0)


if __name__ == '__main__':
    unittest.main()
