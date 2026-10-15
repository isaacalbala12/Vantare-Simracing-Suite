"""Una práctica no se convierte en QA de salida por contener números positivos."""
import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "verify-lmu-widget-coverage.py"
SPEC = importlib.util.spec_from_file_location("offline_lmu_scope", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PracticeScopeTests(unittest.TestCase):
    def test_positive_values_do_not_certify_unrecorded_race_scenarios(self):
        telemetry = {"photos": 4, "session_alerts": {
            "started_at_s": {"reliable": 4}, "finished_at_s": {"reliable": 4},
            "start_phase": {"reliable": 4}, "scheduled_end_s": {"reliable": 4},
            "distance_to_start_line_m": {"estimated": 4},
        }}
        scope = MODULE.recording_scope("practice-only")
        report = MODULE.readable_report(telemetry, {"widgets": []}, "practice-only")
        self.assertFalse(scope["coverage_certified"])
        for scenario in ("reliable_session_start", "reliable_session_end", "race_start", "formation_lap"):
            self.assertIn(scenario, scope["not_covered_by_recording"])
        self.assertIn("No validado: falta captura", report)
        self.assertIn("no confirma fin real", report)
        self.assertIn("no valida formación", report)


if __name__ == "__main__":
    unittest.main()
