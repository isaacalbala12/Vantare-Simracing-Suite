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

    def test_cpu_frames_share_qpc_interval_and_nested_stages_stay_separate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / "complete.txt").write_text("complete")
            (root / "metadata.json").write_text("{}")
            with (root / "process.csv").open("w", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=["seconds", "qpc", "cpu_seconds", "private_bytes"])
                writer.writeheader()
                for second in range(1, 11):
                    writer.writerow(dict(seconds=second, qpc=second*100, cpu_seconds=second*0.1, private_bytes=2**20))
            (root / "stdout.log").write_text("frames/s=8  pedals render=8 paint=8\n")
            (root / "stderr.log").write_text(
                "perf frame window=1 clock=Some(200)\n"
                "perf frame window=1 clock=Some(400)\n"
                "perf frame window=1 clock=Some(600)\n"
                "perf frame window=1 clock=Some(800)\n"
                "perf stage=paint calls=8 wall_ns=800 cpu_cycles=80 cycle_errors=0\n"
                "perf stage=text_layout calls=4 wall_ns=200 cpu_cycles=20 cycle_errors=0\n"
                "perf notify widget=pedals epoch=1 seq=2\n"
                "perf notify widget=radar epoch=1 seq=2\n"
            )
            with contextlib.redirect_stdout(io.StringIO()):
                SUMMARY.summarize(root)
            result = json.loads((root / "summary.json").read_text())
            self.assertEqual(result["steady_screen_frames"], 2)
            self.assertAlmostEqual(result["steady_cpu_ms_per_screen_frame"], 200)
            self.assertAlmostEqual(result["steady_logical_cores"], 0.1)
            self.assertEqual(result["mean_private_mib"], 1)
            self.assertEqual(result["changed_widgets_per_changed_snapshot"], 2)
            self.assertEqual(result["stages_full_run"]["paint"]["cpu_cycles"], 80)
            self.assertEqual(result["stages_full_run"]["text_layout"]["cpu_cycles"], 20)

    def test_incomplete_runs_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "incomplete"):
                SUMMARY.summarize(pathlib.Path(directory))


if __name__ == "__main__":
    unittest.main()
