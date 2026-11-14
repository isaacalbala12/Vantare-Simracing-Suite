"""CPU-only regression tests; never instantiate a Hub or GPU."""
import argparse
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import corte2 as m


class MeasurementTests(unittest.TestCase):
    def test_balanced_repetitions_and_paired_warm_processes(self):
        cells = m.schedule(10)
        self.assertEqual(len(cells), 120)
        for client in ("rune", "electron"):
            for screen in m.SCREENS:
                for cache in ("cold-process", "warm-process"):
                    self.assertEqual(sum(c["client"] == client and c["screen"] == screen and c["cache"] == cache for c in cells), 10)
        for a, b in zip(cells[::2], cells[1::2]):
            self.assertEqual((a["client"], a["screen"]), (b["client"], b["screen"]))
            self.assertEqual((a["cache"], b["cache"]), ("cold-process", "warm-process"))
        self.assertEqual((cells[0]["client"], cells[12]["client"]), ("rune", "electron"))
        with self.assertRaises(ValueError):
            m.schedule(0)

    def test_mac_ps_cpu_days_and_children_are_summed_without_controller(self):
        data = "1 0 1024 00:01.00 Sat Nov 14 01:02:03 2026\n2 1 2048 01:02.50 Sat Nov 14 01:02:04 2026\n3 2 4096 1-01:00:00.00 Sat Nov 14 01:02:05 2026\n4 0 9999 00:50.00 Sat Nov 14 01:02:06 2026"
        values = m.family(m.processes(data), 1)
        self.assertEqual(set(values), {1, 2, 3})
        self.assertEqual(sum(p["rss_mib"] for p in values.values()), 7)
        last = {k:{**v, "cpu_s":v["cpu_s"] + 1} for k,v in values.items()}
        self.assertEqual(m.cpu_percent(values, last, 5), 60)
        self.assertEqual(m.cpu_seconds("1-01:00:00.00"), 90000)
        last[2]["birth"] = "reused"
        with self.assertRaises(ValueError):
            m.cpu_percent(values, last, 5)
        with self.assertRaises(ValueError):
            m.cpu_percent(values, {1:last[1]}, 5)

    def test_orphan_helper_is_included_only_from_private_qa_bundle(self):
        table = m.processes("1 0 1024 00:01.00 Sat Nov 14 01:02:03 2026 /private/Electron.app/Contents/MacOS/Electron\n2 99 1024 00:01.00 Sat Nov 14 01:02:03 2026 /private/Electron.app/Contents/Helpers/crashpad handler\n3 99 1024 00:01.00 Sat Nov 14 01:02:03 2026 /other/Electron.app/Contents/MacOS/Electron")
        self.assertEqual(set(m.family(table, 1, Path("/private/Electron.app"))), {1, 2})

    def test_no_median_from_incomplete_failed_or_duplicate_repetitions(self):
        cell = dict(client="rune", screen="home", cache="cold-process", status="pass")
        rows = [{**cell, "repetition":i, **dict.fromkeys(m.METRICS, value)} for i,value in [(1,1),(2,5000),(3,3)]]
        self.assertEqual(m.summary(rows, 3)[0]["startup_ms"], 3)
        self.assertIsNone(m.summary(rows[:2], 3)[0]["startup_ms"])
        rows[-1]["status"] = "failed"
        self.assertIsNone(m.summary(rows, 3)[0]["startup_ms"])
        rows[-1].update(status="pass", repetition=2)
        self.assertIsNone(m.summary(rows, 3)[0]["startup_ms"])

    def test_pending_report_has_no_fabricated_zeroes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            m.report(path, [], 10)
            text = (path / "CORTE-2.md").read_text(encoding="utf-8")
            self.assertIn("PENDIENTE", text)
            self.assertNotIn("0.000", text)
            self.assertTrue((path / "index.html").exists())

    def test_windows_execution_is_rejected_before_launch_or_output(self):
        with patch.object(m.platform, "system", return_value="Windows"), patch.object(m.subprocess, "Popen") as launch:
            with self.assertRaisesRegex(ValueError, "never launch on Windows"):
                m.run(argparse.Namespace(command="execute", n=1, mac_cleared=True))
            launch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
