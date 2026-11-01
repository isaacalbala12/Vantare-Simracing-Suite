"""The production measurement must fail instead of silently shrinking its input."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("license_lines", Path(__file__).resolve().parents[1] / "license-production-lines.py")
lines = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lines)


class MissingTrackedSource(unittest.TestCase):
    def test_unstaged_deletion_requires_an_explicit_resolution(self):
        missing = "vantare-v2/native/runtime/src/rights/owner.rs"
        with tempfile.TemporaryDirectory() as root, patch.object(lines, "ROOT", Path(root)), patch.object(lines, "git", return_value=missing), patch("sys.argv", ["license-production-lines.py"]):
            with self.assertRaisesRegex(FileNotFoundError, "Tracked source missing: " + missing):
                lines.main()


if __name__ == "__main__":
    unittest.main()
