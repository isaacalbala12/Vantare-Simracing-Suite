"""Regresiones con procesos representados por CSV; no crea procesos gráficos."""
import csv
import json
import tempfile
import unittest
from pathlib import Path
from medidas import measure


class MeasurementTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.identity = {"process_id": 42, "created_utc": "2026-11-16T00:00:00Z", "image_sha256": "a" * 64}
        self.write_json("completo.json", {"complete": True, "health_only": False, "qpc_frequency": 1000, "family": {"42": self.identity["created_utc"]}})
        self.write_json("entorno.json", {"root_process_id": 42})
        self.write_json("CAPTURA-LISTA.json", {"ready": True, "qpc": 100000, "frequency": 1000})
        self.process = [{"qpc": 100000 + i * 1000, "process_id": 42, "created_utc": self.identity["created_utc"],
                         "cpu_time_100ns": i * 100000, "private_bytes": 2**20, "working_set_bytes": 2 * 2**20} for i in range(61)]
        self.write_csv("procesos.csv", self.process)
        self.write_csv("presentmon.csv", [{"ProcessID": 42, "CPUStartQPC": 108000, "SwapChainAddress": "0x1", "MsCPUBusy": 0}, {"ProcessID": 999, "CPUStartQPC": 109000, "SwapChainAddress": "0x1", "MsCPUBusy": 0}, {"ProcessID": 42, "CPUStartQPC": 170000, "SwapChainAddress": "0x1", "MsCPUBusy": 0}])

    def write_json(self, name, value):
        (self.root / name).write_text(json.dumps(value), encoding="utf-8")

    def write_csv(self, name, values):
        with (self.root / name).open("w", newline="", encoding="utf-8") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(values[0]))
            writer.writeheader()
            writer.writerows(values)

    def test_central_window_cpu_memory_and_pid_filter(self):
        result = measure(self.root, self.identity)
        self.assertEqual((result["start_qpc"], result["end_qpc"]), (105000, 155000))
        self.assertAlmostEqual(result["cpu_ms_s"], 10)
        self.assertAlmostEqual(result["cpu_one_core_percent"], 1)
        self.assertEqual(result["private_median_mib"], 1)
        self.assertEqual(result["working_set_max_mib"], 2)
        self.assertEqual(result["presents"], 1)

    def test_valid_idle_has_zero_presents(self):
        (self.root / "presentmon.csv").write_text("ProcessID,SwapChainAddress,CPUStartQPC,MsCPUBusy\n", encoding="utf-8")
        self.assertEqual(measure(self.root, self.identity)["presents_s"], 0)

    def test_real_kit_header_and_submit_clock(self):
        header = (Path(__file__).parent / "fixtures/presentmon-2.6-header.csv").read_text(encoding="utf-8").strip().split(",")
        values = dict.fromkeys(header, "NA")
        values.update(ProcessID=42, SwapChainAddress="0x1", CPUStartQPC=104999,
                      MsCPUBusy=2, TimeInQPC=170000)
        self.write_csv("presentmon.csv", [values])
        self.assertEqual(measure(self.root, self.identity)["presents"], 1)

    def test_count_parser_rejects_bad_busy_and_duplicate_present(self):
        for busy in ("nan", "-1", "NA"):
            self.write_csv("presentmon.csv", [{"ProcessID":42,"SwapChainAddress":"0x1","CPUStartQPC":108000,"MsCPUBusy":busy}])
            with self.assertRaises(ValueError):
                measure(self.root, self.identity)
        row = {"ProcessID":42,"SwapChainAddress":"0x1","CPUStartQPC":108000,"MsCPUBusy":0}
        self.write_csv("presentmon.csv", [row, row])
        with self.assertRaises(ValueError):
            measure(self.root, self.identity)

    def test_inventory_missing_column_has_clear_cli_error(self):
        import subprocess
        import sys
        candidates = self.root / "entradas.csv"
        candidates.write_text("wrong\nvalue\n", encoding="utf-8")
        process = subprocess.run([sys.executable, str(Path(__file__).with_name("inventario.py")),
                                  "unused", str(candidates), str(self.root / "inventory")],
                                 capture_output=True, text=True, encoding="utf-8", errors="replace")
        self.assertNotEqual(process.returncode, 0)
        self.assertIn("'path'", process.stderr)
        self.assertNotIn("Traceback", process.stderr)

    def test_seven_decimal_birth_is_truncated_explicitly(self):
        from medidas import birth
        self.assertEqual(birth("2026-11-16T00:00:00.1234567Z").microsecond, 123456)
        self.assertEqual(birth("2026-11-16T00:00:00.1234567Z"), birth("2026-11-16T00:00:00.123456Z"))

    def test_replay_origin_is_used_even_when_sampler_started_later(self):
        self.write_json("CAPTURA-LISTA.json", {"ready": True, "qpc": 102000, "frequency": 1000})
        self.write_csv("procesos.csv", self.process[3:])
        result = measure(self.root, self.identity, 100000)
        self.assertEqual((result["start_qpc"], result["end_qpc"]), (105000, 155000))
        self.assertAlmostEqual(result["cpu_ms_s"], 10)

    def test_late_sampler_does_not_shift_replay_window(self):
        self.write_csv("procesos.csv", self.process[12:])
        with self.assertRaises(ValueError):
            measure(self.root, self.identity, 100000)

    def test_missing_presentmon_not_zero(self):
        (self.root / "presentmon.csv").unlink()
        with self.assertRaises(FileNotFoundError):
            measure(self.root, self.identity)

    def test_pid_reuse_rejected(self):
        self.process[30]["created_utc"] = "2026-11-16T01:00:00Z"
        self.write_csv("procesos.csv", self.process)
        with self.assertRaises(ValueError):
            measure(self.root, self.identity)

    def test_counter_reset_rejected(self):
        self.process[30]["cpu_time_100ns"] = 0
        self.write_csv("procesos.csv", self.process)
        with self.assertRaises(ValueError):
            measure(self.root, self.identity)

    def test_gap_rejected(self):
        self.write_csv("procesos.csv", self.process[:30] + self.process[35:])
        with self.assertRaises(ValueError):
            measure(self.root, self.identity)

    def test_early_exit_rejected(self):
        self.write_csv("procesos.csv", self.process[:50])
        with self.assertRaises(ValueError):
            measure(self.root, self.identity)

    def test_invalid_capture_rejected(self):
        (self.root / "INVALIDA.txt").write_text("ETW lost", encoding="utf-8")
        with self.assertRaises(ValueError):
            measure(self.root, self.identity)

    def test_additional_family_process_is_summed_and_other_pid_ignored(self):
        self.write_json("completo.json", {"complete": True, "health_only": False, "qpc_frequency": 1000,
                                         "family": {"42": self.identity["created_utc"], "43": self.identity["created_utc"]}})
        child = [dict(row, process_id=43) for row in self.process]
        self.write_csv("procesos.csv", self.process + child + [dict(row, process_id=999) for row in self.process])
        result = measure(self.root, self.identity)
        self.assertAlmostEqual(result["cpu_ms_s"], 20)
        self.assertEqual(result["private_max_mib"], 2)
        self.assertEqual(result["presents"], 1)

    def test_unsupported_presentmon_schema_rejected(self):
        (self.root / "presentmon.csv").write_text("ProcessID,TimeInSeconds\n42,3\n", encoding="utf-8")
        with self.assertRaises(ValueError):
            measure(self.root, self.identity)


if __name__ == "__main__":
    unittest.main()
