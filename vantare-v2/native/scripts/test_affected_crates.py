import unittest
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('affected', Path(__file__).with_name('affected-crates.py'))
affected = importlib.util.module_from_spec(spec)
spec.loader.exec_module(affected)


class ScopeTests(unittest.TestCase):
    def setUp(self):
        self.packages = [
            {'name': name, 'manifest_path': f'D:/repo/vantare-v2/native/{name}/Cargo.toml',
             'dependencies': [{'name': dep} for dep in deps]}
            for name, deps in [('orbit', []), ('strategy', ['orbit']), ('hub', ['strategy']), ('other', [])]
        ]

    def test_reverse_dependencies_are_transitive_without_siblings(self):
        self.assertEqual(affected.select(self.packages, ['vantare-v2/native/orbit/src/lib.rs']),
                         ['hub', 'orbit', 'strategy'])
        self.assertEqual(affected.select(self.packages, ['vantare-v2/native/strategy/src/lib.rs']),
                         ['hub', 'strategy'])

    def test_unknown_native_and_build_configuration_select_everything(self):
        for path in ['vantare-v2/native/Cargo.lock', 'vantare-v2/native/scripts/new.ps1',
                     '.github/workflows/branch-channel-gates.yml', 'tools/new.py',
                     'vantare-v2/testdata/frame.bin', 'vantare-v2/scripts/gate.py']:
            self.assertEqual(affected.select(self.packages, [path]), ['hub', 'orbit', 'other', 'strategy'])

    def test_storage_process_changes_include_analysis_consumers(self):
        packages = self.packages + [
            {'name': name, 'manifest_path': f'D:/repo/vantare-v2/native/{name}/Cargo.toml',
             'dependencies': []}
            for name in ['vantare-storage', 'vantare-hub']]
        self.assertEqual(affected.select(packages, ['vantare-v2/native/vantare-storage/src/main.rs']),
                         ['vantare-hub', 'vantare-storage'])

    def test_leaf_views_do_not_rebuild_distribution_but_global_and_root_changes_do(self):
        for path in ['vantare-v2/native/runtime/src/core/mod.rs',
                     'vantare-v2/native/ui/src/lib.rs']:
            self.assertFalse(affected.installation_affected([path]))
        for path in ['vantare-v2/native/hub-strategy/Cargo.toml',
                     'vantare-v2/native/hub/src/main.rs',
                     'vantare-v2/native/hub-shell/src/settings/mod.rs',
                     'vantare-v2/native/runtime/build.rs', '.github/workflows/ci.yml']:
            self.assertTrue(affected.installation_affected([path]))

    def test_fast_path_never_selects_hub_or_admin(self):
        packages = [
            {'name': name, 'dependencies': [{'name': dep} for dep in deps]}
            for name, deps in [('vantare-ui', []), ('vantare-hub', ['vantare-ui']),
                               ('vantare-admin', ['vantare-ui']), ('vantare-runtime', ['vantare-ui'])]]
        self.assertEqual(affected.select_for_crate(packages, 'vantare-ui'),
                         ['vantare-runtime', 'vantare-ui'])
        for legacy in ['vantare-hub', 'vantare-admin']:
            with self.assertRaises(ValueError):
                affected.select_for_crate(packages, legacy)

    def test_ci_keeps_full_backstop_and_explicit_legacy_validation(self):
        packages = [
            {'name': name, 'manifest_path': f'D:/repo/vantare-v2/native/{directory}/Cargo.toml',
             'dependencies': [{'name': dep} for dep in deps]}
            for name, directory, deps in [('vantare-ui', 'ui', []),
                ('vantare-runtime', 'runtime', ['vantare-ui']),
                ('vantare-hub', 'hub', ['vantare-ui']),
                ('vantare-admin', 'admin', ['vantare-hub'])]]
        path = ['vantare-v2/native/ui/src/lib.rs']
        self.assertEqual(affected.select_for_ci(packages, path, True), ['vantare-runtime', 'vantare-ui'])
        self.assertEqual(len(affected.select_for_ci(packages, path)), 4)
        self.assertEqual(affected.select_for_ci(packages, ['vantare-v2/native/hub/src/main.rs'], True),
                         ['vantare-admin', 'vantare-hub'])

    def test_documentation_outside_native_has_no_native_scope(self):
        self.assertEqual(affected.select(self.packages, ['vantare-v2/docs/guide.md']), [])


if __name__ == '__main__':
    unittest.main()
