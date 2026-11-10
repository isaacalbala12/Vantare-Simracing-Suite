import contextlib
import csv
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("summary", pathlib.Path(__file__).with_name("summarize-overlays.py"))
SUMMARY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SUMMARY)


class MeasurementTest(unittest.TestCase):
    def test_decimal_comma_from_older_powershell_runs(self):
        self.assertEqual(SUMMARY.number("0,015625"), 0.015625)
        self.assertEqual(SUMMARY.number("0.015625"), 0.015625)

    def test_old_dev_measurements_are_explicitly_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / "complete.txt").write_text("complete")
            (root / "metadata.json").write_text('{"profile":"dev"}')
            with self.assertRaisesRegex(ValueError, "solo dev"):
                SUMMARY.summarize(root)

    def test_incomplete_runs_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "incomplete"):
                SUMMARY.summarize(pathlib.Path(directory))


if __name__ == "__main__":
    unittest.main()
