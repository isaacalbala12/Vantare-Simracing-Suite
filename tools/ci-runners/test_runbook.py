import pathlib
import unittest

README = pathlib.Path(__file__).with_name('README.md')


class LinuxRunbookTests(unittest.TestCase):
    def test_service_starts_only_after_hooks_are_installed_and_verified(self):
        # Arrancar antes deja el primer job sin guard de forks ni limpieza (#1565).
        text = README.read_text(encoding='utf-8')
        start = text.index('sudo ./svc.sh start')
        self.assertEqual(text.count('svc.sh start'), 1)
        for prerequisite in ('sudo ./svc.sh install vantare-ci',
                             'ACTIONS_RUNNER_HOOK_JOB_STARTED=/opt/vantare-hooks/job-start.sh',
                             'ACTIONS_RUNNER_HOOK_JOB_COMPLETED=/opt/vantare-hooks/job-end.sh',
                             'sudo systemctl daemon-reload',
                             'systemctl show',
                             'fork-event.json'):
            self.assertLess(text.index(prerequisite), start, prerequisite)


if __name__ == '__main__':
    unittest.main()
