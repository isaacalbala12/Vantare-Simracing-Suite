import pathlib
import tempfile
import unittest
from cleanup import clean


class CleanupTests(unittest.TestCase):
    def test_removes_previous_job_without_touching_neighbour(self):
        with tempfile.TemporaryDirectory() as tmp:
            runner = pathlib.Path(tmp)
            target = runner / '_work/repo/repo'
            target.mkdir(parents=True)
            (target / 'old').write_text('untrusted')
            other = runner / '_work/other'
            other.mkdir()
            clean(target, runner)
            self.assertEqual(list(target.iterdir()), [])
            self.assertTrue(other.exists())

    def test_refuses_parent_and_outside_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            runner = pathlib.Path(tmp)
            for target in [runner, runner / '_work', runner / '_work/repo', runner / 'outside/repo/repo']:
                with self.assertRaises(ValueError):
                    clean(target, runner)


if __name__ == '__main__':
    unittest.main()
