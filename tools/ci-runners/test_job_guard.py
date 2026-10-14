import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('guard', pathlib.Path(__file__).with_name('job-guard.py'))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class GuardTests(unittest.TestCase):
    def test_public_unknown_or_fork_never_execute(self):
        self.assertFalse(guard.allowed({}))
        self.assertFalse(guard.allowed({'repository': {'full_name': guard.REPO, 'private': False}}))
        self.assertFalse(guard.allowed({'repository': {'full_name': 'other/repo', 'private': True}}))
        repo = {'full_name': guard.REPO, 'private': True}
        self.assertTrue(guard.allowed({'repository': repo}))
        self.assertFalse(guard.allowed({'repository': repo, 'pull_request': {'head': {'repo': {'full_name': 'fork/repo', 'fork': True}}}}))
        self.assertTrue(guard.allowed({'repository': repo, 'pull_request': {'head': {'repo': {'full_name': guard.REPO, 'fork': False}}}}))
