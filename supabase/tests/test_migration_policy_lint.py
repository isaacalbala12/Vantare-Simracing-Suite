"""Characterization of the historical cutoff and new migration contract."""
import pathlib
import subprocess
import sys
import tempfile
import unittest


LINTER = pathlib.Path(__file__).with_name('lint_migrations.py')
CUTOFF = '20261104105500'
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

    def lint(self, baseline=False):
        args = ([sys.executable, str(LINTER), '--root', str(self.root),
                 '--cutoff', CUTOFF])
        if baseline:
            args += ['--baseline-ref', 'origin/nightly']
        return subprocess.run(
            args, capture_output=True, text=True)

    def baseline(self):
        for args in (('init', '-q'), ('config', 'user.name', 'Test'),
                     ('config', 'user.email', 'test@example.invalid'),
                     ('add', '.'), ('commit', '-qm', 'nightly baseline')):
            subprocess.run(['git', *args], cwd=self.root, check=True,
                           capture_output=True)
        subprocess.run(['git', 'update-ref', 'refs/remotes/origin/nightly',
                        'HEAD'], cwd=self.root, check=True, capture_output=True)

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
        result = self.lint()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_missing_acl_role_rejected(self):
        self.write_new(VALID.replace('public, anon, authenticated, service_role',
                                     'public, anon, authenticated'))
        result = self.lint()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('service_role', result.stdout)

    def test_exact_historical_exception_does_not_hide_another_error(self):
        for name in ('20261104110000_isa_1910_smtp_effects.sql',
                     '20261104120500_isa_1896_legacy_retirement.sql'):
            with self.subTest(name=name):
                path = self.root / 'migrations' / name
                down = self.root / 'rollbacks' / name.replace('.sql', '.down.sql')
                path.write_text('alter table public.example add column note text;\nselect auth.uid();\n')
                down.write_text('begin; commit;\n')
                result = self.lint()
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('auth.uid() is forbidden', result.stdout)
                self.assertNotIn('needs REVOKE ALL', result.stdout)
                path.write_text('create function public.example() returns integer language sql as $$select 1$$;\n')
                result = self.lint()
                self.assertIn('must use create or replace', result.stdout)
                path.rename(self.root / 'migrations' / name.replace('_isa_', '_other_isa_'))
                result = self.lint()
                self.assertIn('needs REVOKE ALL', result.stdout)
                (self.root / 'migrations' / name.replace('_isa_', '_other_isa_')).unlink()
                down.unlink()

    def test_constant_execute_revoke_is_recognized(self):
        self.write_new('''create or replace function public.example() returns integer language sql as $$select 1$$;
do $$ begin execute 'revoke all on function public.example() from public, anon, authenticated, service_role'; end $$;
''')
        result = self.lint()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_concatenated_execute_revoke_is_rejected(self):
        self.write_new('''create or replace function public.example() returns integer language sql as $$select 1$$;
do $$ begin execute 'revoke all on function public.example() from public, anon, authenticated, ' || 'service_role'; end $$;
''')
        result = self.lint()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('needs REVOKE ALL', result.stdout)

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

    def test_conditional_full_function_and_quoted_acl_pass(self):
        self.write_new('''do $$ begin
execute $definition$create or replace function public.example()
 returns integer language sql as $body$ select 1 $body$;$definition$;
execute 'revoke all on function public.example() from public, anon, authenticated, service_role';
end $$;
''')
        self.assertEqual(self.lint().returncode, 0)

    def test_merged_post_cutoff_up_cannot_change(self):
        self.baseline()
        self.write_new(VALID + '\nselect 2;\n')
        result = self.lint(baseline=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('already merged', result.stdout)

    def test_merged_post_cutoff_rollback_cannot_change(self):
        self.baseline()
        self.write_new(VALID, rollback='begin; select 2; commit;\n')
        result = self.lint(baseline=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('already merged', result.stdout)

    def test_new_post_cutoff_migration_is_allowed(self):
        self.baseline()
        self.write_new(VALID)
        new = self.root / 'migrations' / '20261104110002_more.sql'
        new.write_text(VALID)
        (self.root / 'rollbacks' / '20261104110002_more.down.sql').write_text('begin; commit;\n')
        self.assertEqual(self.lint(baseline=True).returncode, 0)

    def test_missing_baseline_ref_fails_closed(self):
        result = self.lint(baseline=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('baseline', result.stdout)

    def test_checkout_line_endings_are_not_a_migration_edit(self):
        self.baseline()
        (self.root / 'migrations' / NEW).write_bytes(VALID.replace('\n', '\r\n').encode())
        self.assertEqual(self.lint(baseline=True).returncode, 0)


if __name__ == '__main__':
    unittest.main()
