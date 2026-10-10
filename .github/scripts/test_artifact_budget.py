import pathlib
import tempfile
import unittest
from artifact_budget import fits, LIMIT


class BudgetTests(unittest.TestCase):
    def test_near_limit_and_oversized_candidate_are_denied(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / 'preview'
            path.write_bytes(b'123')
            self.assertTrue(fits(0, [path]))
            self.assertFalse(fits(LIMIT, [path]))
            self.assertFalse(fits(LIMIT-1024**2, [path]))
            with self.assertRaises(ValueError):
                fits(-1, [path])

    def test_missing_evidence_is_not_approved(self):
        with self.assertRaises(OSError):
            fits(0, [pathlib.Path('missing-1565-evidence')])
