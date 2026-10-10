import pathlib
import os
import subprocess
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

    @unittest.skipUnless(os.name == 'nt', 'Windows junction integration')
    def test_junction_cannot_delete_outside_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            runner = pathlib.Path(tmp) / 'runner'
            evidence = pathlib.Path(tmp) / 'evidence'
            evidence.mkdir()
            marker = evidence / 'keep.txt'
            marker.write_text('preserve')
            target = runner / '_work/repo/repo'
            target.parent.mkdir(parents=True)
            subprocess.run(['cmd', '/c', 'mklink', '/J', str(target), str(evidence)], check=True, capture_output=True)
            with self.assertRaises(ValueError):
                clean(target, runner)
            self.assertEqual(marker.read_text(), 'preserve')


if __name__ == '__main__':
    unittest.main()
