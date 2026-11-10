import copy
import unittest
from native_ci_results import validate


class ResultTests(unittest.TestCase):
    def setUp(self):
        self.needs = {'policy': {'result': 'success', 'outputs': {'native': 'true', 'installation': 'true'}}}
        self.needs.update({job: {'result': 'success'} for job in
                          ('native_build', 'native_tests', 'native_lifecycle_build', 'native_lifecycle', 'native_installation')})

    def test_every_applicable_job_must_succeed(self):
        validate(self.needs)
        for job in self.needs:
            for state in ('failure', 'cancelled', 'skipped'):
                needs = copy.deepcopy(self.needs)
                needs[job]['result'] = state
                with self.assertRaises(ValueError):
                    validate(needs)

    def test_web_only_can_skip_native_jobs(self):
        self.needs['policy']['outputs']['native'] = 'false'
        for job in ('native_build', 'native_tests', 'native_lifecycle_build', 'native_lifecycle', 'native_installation'):
            self.needs[job]['result'] = 'skipped'
        validate(self.needs)

    def test_affected_crates_can_skip_installation_but_not_tests(self):
        self.needs['policy']['outputs']['installation'] = 'false'
        self.needs['native_installation']['result'] = 'skipped'
        validate(self.needs)
        self.needs['native_tests']['result'] = 'skipped'
        with self.assertRaises(ValueError):
            validate(self.needs)

    def test_independent_modules_can_skip_overlay_build_but_not_lifecycle_dispatch(self):
        self.needs['policy']['outputs']['overlays'] = 'false'
        self.needs['native_lifecycle_build']['result'] = 'skipped'
        validate(self.needs)
        self.needs['native_lifecycle']['result'] = 'skipped'
        with self.assertRaises(ValueError):
            validate(self.needs)

    def test_missing_scope_is_full_and_missing_jobs_fail_closed(self):
        self.needs['policy']['outputs'] = {}
        self.needs['native_installation']['result'] = 'skipped'
        with self.assertRaises(ValueError):
            validate(self.needs)
        del self.needs['native_tests']
        with self.assertRaises(KeyError):
            validate(self.needs)


if __name__ == '__main__':
    unittest.main()
