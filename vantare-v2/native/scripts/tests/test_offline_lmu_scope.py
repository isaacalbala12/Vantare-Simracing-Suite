"""Una práctica no se convierte en QA de salida por contener números positivos."""
import importlib.util
from copy import deepcopy
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
                  # Rango real de Imola: ruido numérico, no conducción.
                  "player_speed_mps": {"min": 1.0941064948567774e-7,
                                       "max": 1.8003685388777887e-7, "reliable_samples": 53},
                  "player_completed_laps": {"min": 0, "max": 0, "reliable_samples": 48},
                  "player_inputs": {key: {"min": 0, "max": 0, "reliable_samples": 53}
                                    for key in ("throttle", "brake", "clutch", "steering")}}
        widgets = [{"widget": name, "photos_evaluated": 4, "projection_changes": 4}
                   for name in ("radar", "pedals", "fuel-strategy", "track-map")]
        widgets.append({"widget": "fastest-lap", "photos_evaluated": 4, "projection_changes": 0})
        report = MODULE.readable_report({"photos": 4, "session_alerts": {}},
                                       {"widgets": widgets, "motion_evidence": motion}, "practice-only")
        self.assertIn("Parrilla/IA en movimiento", report)
        self.assertEqual(report.count("Solo estructura del jugador parado"), 2)
        self.assertIn("hace falta geometría", report)
        self.assertIn("sin validación dinámica", report)
        self.assertIn("Sin aviso nuevo observado", report)
        for change in ("speed", "laps", "inputs", "missing"):
            changed = deepcopy(motion)
            if change == "speed":
                changed["player_speed_mps"]["max"] = 1.0
            elif change == "laps":
                changed["player_completed_laps"]["max"] = 1
            elif change == "inputs":
                changed["player_inputs"]["throttle"]["max"] = 0.2
            else:
                changed["player_speed_mps"] = {}
            report = MODULE.readable_report({"photos": 4, "session_alerts": {}},
                                           {"widgets": widgets, "motion_evidence": changed}, "practice-only")
            self.assertNotIn("Solo estructura del jugador parado", report)

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


class WidgetCatalogTests(unittest.TestCase):
    def test_catalog_growth_needs_no_python_widget_list(self):
        for catalog in (["standings"], ["standings", "session-alerts", "future-widget"]):
            report = {"widget_catalog": catalog,
                      "widgets": [{"widget": name} for name in reversed(catalog)]}
            self.assertEqual(MODULE.validate_widget_catalog(report), len(catalog))

    def test_missing_extra_and_duplicate_widgets_are_rejected(self):
        for actual in (["standings"], ["standings", "session-alerts", "extra"],
                       ["standings", "standings"], ["standings", "session-alerts", "session-alerts"]):
            with self.subTest(actual=actual), self.assertRaises(RuntimeError):
                MODULE.validate_widget_catalog({
                    "widget_catalog": ["standings", "session-alerts"],
                    "widgets": [{"widget": name} for name in actual]})

    def test_old_or_invalid_catalog_cannot_accredit_partial_report(self):
        for catalog in (None, [], ["standings", "standings"], ["standings", None],
                        "standings", [""]):
            with self.subTest(catalog=catalog), self.assertRaises(RuntimeError):
                MODULE.validate_widget_catalog({
                    "widget_catalog": catalog, "widgets": [{"widget": "standings"}]})


if __name__ == "__main__":
    unittest.main()
