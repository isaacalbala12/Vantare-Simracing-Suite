"""Exercise CI E2E diagnostics without Docker, network or a provider."""
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

RUNNER = Path(__file__).with_name("run-admin-local.py")

class E2EDiagnostics(unittest.TestCase):
    def test_original_child_error_is_visible_and_saved_and_database_is_cleaned(self):
        calls = []
        marker = "synthetic_e2e_type_error"
        def command(args, **kwargs):
            calls.append(args)
            if args[0] == "deno":
                return subprocess.CompletedProcess(args, 42, "", marker + "\n")
            text = "PostgreSQL init process complete" if args[:2] == ["docker", "logs"] else "ok 1 - synthetic SQL result\n"
            return subprocess.CompletedProcess(args, 0, text, "")
        with tempfile.TemporaryDirectory() as tmp:
            stderr = StringIO()
            with patch.object(sys, "argv", [str(RUNNER), "--output", tmp, "--mail-e2e"]), patch("subprocess.run", side_effect=command), redirect_stdout(StringIO()), redirect_stderr(stderr):
                with self.assertRaises(RuntimeError):
                    runpy.run_path(str(RUNNER), run_name="__main__")
            self.assertIn(marker, stderr.getvalue())
            self.assertIn(marker, (Path(tmp) / "marketing-mail-e2e.log").read_text())
            self.assertEqual(calls[-1], ["docker", "rm", "-f", "vantare-1627-local"])

if __name__ == "__main__":
    unittest.main()
