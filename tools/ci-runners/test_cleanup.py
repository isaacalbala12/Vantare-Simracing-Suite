import pathlib
import stat
import sys
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

    def test_cleans_from_inside_workspace_like_runner_hook(self):
        # El runner lanza el hook con cwd = GITHUB_WORKSPACE; Windows bloquea ese
        # directorio, así que la limpieza debe vaciarlo sin borrar la raíz.
        with tempfile.TemporaryDirectory() as tmp:
            runner = pathlib.Path(tmp)
            target = runner / '_work/repo/repo'
            (target / '.git/objects').mkdir(parents=True)
            readonly = target / '.git/objects/pack.idx'
            readonly.write_text('git marca sus objetos como solo lectura')
            readonly.chmod(stat.S_IREAD)
            (target / 'old').write_text('untrusted')
            script = f'from cleanup import clean; import pathlib; clean(pathlib.Path({str(target)!r}), pathlib.Path({str(runner)!r}))'
            result = subprocess.run([sys.executable, '-c', script], cwd=target, capture_output=True, text=True,
                                    env={**os.environ, 'PYTHONPATH': str(pathlib.Path(__file__).parent)})
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(target.is_dir())
            self.assertEqual(list(target.iterdir()), [])

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

    @unittest.skipUnless(os.name == 'nt', 'Windows junction integration')
    def test_child_junction_is_unlinked_without_emptying_its_target(self):
        with tempfile.TemporaryDirectory() as tmp:
            runner = pathlib.Path(tmp) / 'runner'
            evidence = pathlib.Path(tmp) / 'evidence'
            evidence.mkdir()
            marker = evidence / 'keep.txt'
            marker.write_text('preserve')
            target = runner / '_work/repo/repo'
            target.mkdir(parents=True)
            subprocess.run(['cmd', '/c', 'mklink', '/J', str(target / 'link'), str(evidence)], check=True, capture_output=True)
            clean(target, runner)
            self.assertEqual(list(target.iterdir()), [])
            self.assertEqual(marker.read_text(), 'preserve')


if __name__ == '__main__':
    unittest.main()
