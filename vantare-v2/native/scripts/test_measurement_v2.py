"""Analytical fixtures: CPU cycles, source-clock alignment and nested phases."""
import importlib.util
import pathlib
import unittest

SPEC = importlib.util.spec_from_file_location("measurement", pathlib.Path(__file__).with_name("summarize-overlays.py"))
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class StableWindowTest(unittest.TestCase):
    def test_alignment_uses_recording_position_not_process_start(self):
        events = [dict(kind="received", label="ipc", clock=1000+i*100, end=0,
                       epoch=1, sequence=i, value=i*1_000_000_000) for i in range(61)]
        self.assertEqual(M.recording_window(events, 5, 55), (1500, 6500))

    def test_cycle_rate_does_not_use_total_processor_time(self):
        rows = [dict(qpc=100, cpu_cycles=1000, cpu_seconds="nonsense", private_bytes=2**20),
                dict(qpc=600, cpu_cycles=31000, cpu_seconds="nonsense", private_bytes=2**20)]
        result = M.process_summary(rows, 100, 600, 100, 10)
        self.assertEqual(result["cycles_per_second"], 6000)
        self.assertEqual(result["cycles_per_received_photo"], 3000)
        self.assertFalse(any("cpu_seconds" in k or "logical_cores" in k for k in result))

    def test_p99_keeps_intervals_and_does_not_average_rates(self):
        self.assertEqual(M.percentile([1]*98+[20,100], 99), 20)

    def test_phase_crossing_boundary_is_excluded_and_nested_not_summed(self):
        events = [dict(kind="span",label="paint",clock=90,end=120,value=999),
                  dict(kind="span",label="paint",clock=110,end=150,value=40),
                  dict(kind="span",label="text_layout",clock=120,end=130,value=10)]
        result = M.phase_summary(events, 100, 200, 100)
        self.assertEqual(result["paint"]["cpu_cycles"], 40)
        self.assertEqual(result["text_layout"]["cpu_cycles"], 10)


if __name__ == "__main__":
    unittest.main()
