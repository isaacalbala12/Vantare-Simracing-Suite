"""Guardas del supervisor; usa capturas sanitizadas y nunca inicia LMU."""
from pathlib import Path
import runpy
import struct
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[3]
SCRIPT = runpy.run_path(str(REPO / "native/scripts/wait-lmu-widget-coverage.py"))


class SessionGuardTests(unittest.TestCase):
    def test_real_active_grid_needs_a_unique_player_but_not_movement(self):
        frame = (REPO / "testdata/lmu-fixture.bin").read_bytes()
        self.assertEqual(SCRIPT["grid_status"](frame),
                         {"ready": True, "reason": "grid_ready", "cars": 44})
        frame = (REPO / "native/runtime/testdata/lmu-rest-2026-10-14/frame.bin").read_bytes()
        self.assertEqual(SCRIPT["grid_status"](frame)["cars"], 37)
        self.assertTrue(SCRIPT["grid_status"](frame)["ready"])

    def test_menu_short_mapping_invalid_count_and_ambiguous_player_never_start_qa(self):
        frame = (REPO / "testdata/lmu-fixture.bin").read_bytes()
        self.assertFalse(SCRIPT["grid_status"](frame[:-1])["ready"])
        for count in (0, -1, 105):
            changed = bytearray(frame)
            struct.pack_into("<i", changed, 1736, count)
            self.assertFalse(SCRIPT["grid_status"](changed)["ready"])
        for player_count in (0, 2):
            changed = bytearray(frame)
            for i in range(44):
                changed[2192 + i * 584 + 196] = int(i < player_count)
            self.assertFalse(SCRIPT["grid_status"](changed)["ready"])

    def test_success_requires_all_widgets_variants_and_a_real_passing_test(self):
        names = sorted(SCRIPT["WIDGETS"])
        lines = [f"{name}: demanda y proyección por pipe preservadas" for name in names + names[:4]]
        complete = "\n".join(lines) + "\ntest result: ok. 1 passed; 0 failed; 0 ignored"
        self.assertTrue(SCRIPT["result_from_log"](complete, 0)["passed"])
        self.assertFalse(SCRIPT["result_from_log"](complete, 101)["passed"])
        self.assertFalse(SCRIPT["result_from_log"](complete.replace("1 passed", "0 passed"), 0)["passed"])
        missing = "\n".join(lines[1:]) + "\ntest result: ok. 1 passed; 0 failed"
        self.assertFalse(SCRIPT["result_from_log"](missing, 0)["passed"])
        replaced = complete.replace(f"{names[0]}:", f"{names[1]}:")
        self.assertFalse(SCRIPT["result_from_log"](replaced, 0)["passed"])
        self.assertFalse(SCRIPT["result_from_log"]("test result: ok. 0 passed; 0 failed", 0)["passed"])

    def test_waiting_can_be_cancelled_without_starting_verification(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "debug").mkdir()
            (root / "debug/vantare-core.exe").write_bytes(b"unit-test-only")
            test = root / "unit-test.exe"
            test.write_bytes(b"unit-test-only")
            args = SimpleNamespace(target_dir=root, test_bin=test, buzon=None)
            probe = SimpleNamespace(status=lambda: {"ready": False, "reason": "no_shm"})
            with patch.object(SCRIPT["time"], "sleep", lambda _: (root / "STOP").touch()), \
                    patch.object(SCRIPT["subprocess"], "run") as run:
                result = SCRIPT["wait_and_run"](args, probe, root)
            self.assertEqual(result, 2)
            run.assert_not_called()
            self.assertIn('"state": "cancelled"', (root / "summary.json").read_text())


if __name__ == "__main__":
    unittest.main()
