"""Analytical fixtures: CPU cycles, source-clock alignment and nested phases."""
import importlib.util
import pathlib
import contextlib
import csv
import io
import json
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("measurement", pathlib.Path(__file__).with_name("summarize-overlays.py"))
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class StableWindowTest(unittest.TestCase):
    def test_raw_evidence_correlates_cycles_gpu_and_local_latency(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / "complete.txt").write_text("complete")
            metadata = dict(measurement_version=2, profile="release", stable_start_seconds=0,
                            stable_end_seconds=2, maximum_total_system_load_percent=35, qpc_frequency=1000)
            (root / "metadata.json").write_text(json.dumps(metadata))
            def write_csv(name, rows):
                with (root / name).open("w", newline="") as stream:
                    writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
                    writer.writeheader()
                    writer.writerows(rows)
            rows = [dict(qpc=t, cpu_cycles=t*10, private_bytes=2**20) for t in (0,1000,2000,3000)]
            write_csv("process.csv", rows)
            write_csv("dwm.csv", rows)
            write_csv("system.csv", [dict(qpc=t,load_percent=10) for t in (500,1500)])
            write_csv("gpu.csv", [dict(qpc=t,process=p,busiest_engine_percent=2,engine_sum_percent=2,dedicated_bytes=2**20)
                                  for t in (500,1500) for p in ("ui","dwm")])
            (root / "stderr.log").write_text(
                "trace frequency=1000 overflow=0\n"
                "trace\treceived\tipc\t100\t0\t1\t1\t0\n"
                "trace\tdata_paint\tpedals\t120\t0\t1\t1\t0\n"
                "trace\tpresent\tbase\t125\t0\t0\t0\t0\n"
                "trace\tpresent_end\tbase\t130\t0\t0\t0\t0\n"
                "trace\treceived\tipc\t1100\t0\t1\t2\t1000000000\n"
                "trace\tpresent\tbase\t1125\t0\t0\t0\t0\n"
                "trace\treceived\tipc\t2100\t0\t1\t3\t2000000000\n"
                "trace_end events=7\n"
            )
            with contextlib.redirect_stdout(io.StringIO()):
                result = M.summarize(root)
            self.assertEqual(result["ui"]["cycles_per_second"], 10000)
            self.assertEqual(result["present_intervals_ms"], [1000])
            self.assertEqual(result["receive_to_paint_p99_ms"], 20)
            self.assertEqual(result["receive_to_submit_p99_ms"], 30)
            self.assertEqual(result["gpu"]["dwm"]["peak_dedicated_mib"], 1)

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

    def test_late_receiver_must_not_shift_the_recording_window(self):
        events = [dict(kind="received", clock=100, value=20_000_000_000),
                  dict(kind="received", clock=200, value=55_000_000_000)]
        with self.assertRaisesRegex(ValueError, "receiver started"):
            M.recording_window(events, 5, 55)

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
