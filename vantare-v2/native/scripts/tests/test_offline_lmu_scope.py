"""Una práctica no se convierte en QA de salida por contener números positivos."""
import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "verify-lmu-widget-coverage.py"
SPEC = importlib.util.spec_from_file_location("offline_lmu_scope", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PracticeScopeTests(unittest.TestCase):
    def test_moving_ai_never_certifies_stationary_player_or_track_geometry(self):
        motion = {"opponent_moving_samples": 100, "moving_opponent_ids": 37,
                  "opponents_max_speed_mps": 50,
                  "player_speed_mps": {"min": 0, "max": 0, "reliable_samples": 4},
                  "player_completed_laps": {"min": 0, "max": 0}, "player_inputs": {}}
        widgets = [{"widget": name, "photos_evaluated": 4, "projection_changes": 4}
                   for name in ("radar", "pedals", "fuel-strategy", "track-map")]
        report = MODULE.readable_report({"photos": 4, "session_alerts": {}},
                                       {"widgets": widgets, "motion_evidence": motion}, "practice-only")
        self.assertIn("Parrilla/IA en movimiento", report)
        self.assertEqual(report.count("Solo estructura del jugador parado"), 2)
        self.assertIn("hace falta geometría", report)
        self.assertIn("sin validación dinámica", report)

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
