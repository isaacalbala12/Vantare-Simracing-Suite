"""Fixtures de test del resumen; nunca son evidencia de consumo LMU."""
import json
import runpy
import tempfile
import unittest
from pathlib import Path

SUMMARY = runpy.run_path(str(Path(__file__).with_name("summarize-cost.py")))


class SummaryTests(unittest.TestCase):
    def test_requires_all_twelve_uninstrumented_passes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(ValueError):
                SUMMARY["load_campaign"](root)
            (root / "complete.txt").write_text("test fixture")
            for round_number in range(1, 4):
                for mode in SUMMARY["MODES"]:
                    result = {"Valid": True, "Seconds": 90, "ProfileOnly": False, "PhaseOnly": False,
                              "Processes": [{"Name": "vantare-core", "CPUOneCore": round_number + (1 if mode == "normal" else 0)}]}
                    (root / f"{round_number}-{mode}-result.json").write_text(json.dumps(result))
            results = SUMMARY["load_campaign"](root)
            self.assertEqual(SUMMARY["paired_delta"](results, "normal", "no-both"), [1, 1, 1])
            (root / "INCOMPLETE.txt").write_text("test abort")
            with self.assertRaises(ValueError):
                SUMMARY["load_campaign"](root)

    def test_phase_counts_keep_cpu_cycles_separate_from_wall_time(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "fixture.log").write_text(
                "perf process_cycles=Some(10) clock=Some(50)\n"
                "perf stage=validation calls=100 wall_ns=1000000000 cpu_cycles=9999 cycle_errors=0\n"
                "perf process_cycles=Some(100) clock=Some(150)\n"
                "perf stage=validation calls=2 wall_ns=1000000 cpu_cycles=25 cycle_errors=0\n")
            result = {"StartQpc": 100, "EndQpc": 200, "Seconds": 10,
                      "Processes": [{"Name": "vantare-core", "CycleDelta": 100}]}
            rows = SUMMARY["phases"](root, result, "fixture.log", "vantare-core")
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["CycleShareInclusivePct"], 25)
            self.assertEqual(rows[0]["CallsPerSecond"], 0.2)
            self.assertEqual(rows[0]["WallMsPerSecond"], 0.1)


if __name__ == "__main__":
    unittest.main()
