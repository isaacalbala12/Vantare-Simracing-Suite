from pathlib import Path
import tempfile
import unittest
from native_target_cache_budget import budget


class BudgetTests(unittest.TestCase):
    def test_only_compiler_debug_and_markers_count_not_archives_or_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'debug').mkdir()
            (root / 'debug/.cargo-lock').touch()
            (root / 'debug/dependency.rlib').write_bytes(b'x' * 20)
            (root / '.rustc_info.json').write_bytes(b'{}')
            (root / 'nextest-tests.tar.zst').write_bytes(b'x' * 200)
            (root / 'qa-data').mkdir()
            (root / 'qa-data/document').write_bytes(b'x' * 200)
            self.assertEqual(budget(root, 22)['bytes'], 22)
            self.assertTrue(budget(root, 22)['save'])
            self.assertFalse(budget(root, 21)['save'])

    def test_missing_or_empty_target_is_not_saved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertFalse(budget(root)['save'])
            (root / 'debug').mkdir()
            (root / 'debug/.cargo-lock').touch()
            self.assertFalse(budget(root)['save'])

    def test_links_cannot_expand_the_cache_outside_debug(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'debug').mkdir()
            (root / 'debug/.cargo-lock').touch()
            (root / 'outside').write_bytes(b'x' * 10)
            try:
                (root / 'debug/link').symlink_to(root / 'outside')
            except OSError:
                self.skipTest('Host does not allow creating symlinks')
            self.assertFalse(budget(root)['save'])


if __name__ == '__main__':
    unittest.main()
