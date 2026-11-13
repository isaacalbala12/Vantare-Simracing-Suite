import tempfile
import json
import unittest
from pathlib import Path
from unittest.mock import patch
from normalizar_inicio import normalize_home, observation


class HomeSeriesTests(unittest.TestCase):
    def test_rune_cpu_first_frame_is_not_replaced_by_later_gpu_present(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sample = root / "muestreo"
            sample.mkdir()
            documents = {
                root / "observacion-inicio.json":dict(status="complete", variant="rune", phase="cold", index=1,
                    frequency=100, binary_sha256="test", ready_observed_qpc=150, visible_observed_qpc=120),
                root / "raiz.json":dict(process_id=7, start_qpc=100, image_sha256="test"),
                root / "visible.json":dict(ready=True, source="post_draw_dwm_flush"),
                sample / "completo.json":dict(complete=True, qpc_frequency=100, family={"7":"identity"}),
                sample / "entorno.json":dict(capture_precedes_root=True, qpc_frequency=100),
            }
            for path, value in documents.items():
                path.write_text(json.dumps(value))
            (sample / "presentmon.csv").write_text("synthetic,parsed,by,stub")
            with patch("normalizar_inicio.presentmon", return_value=[{"display_qpc":500}]):
                result = observation(root)
            self.assertEqual(result["visible_s"], .2)
            self.assertEqual(result["interactive_s"], .5)
            self.assertEqual(result["first_presentmon_display_s"], 4)
            self.assertTrue(result["visible_is_upper_bound"])

    def fixture(self, root):
        rows = {}
        for variant in ("electron", "gpui_fast", "rune"):
            for phase, count in (("cold",10),("warm",10),("interaction",5),("boot",1)):
                for index in range(1, count+1):
                    folder = root / f"{variant}-{phase}-{index}"
                    folder.mkdir()
                    (folder / "observacion-inicio.json").write_text("{}")
                    rows[folder.name] = dict(variant=variant, phase=phase, index=index,
                        binary_sha256=variant, visible_s=1, interactive_s=9 if phase == "boot" else 2,
                        stages={"idle":{"private_mib":700 if variant == "electron" else 100}})
        return rows

    def test_boot_is_kept_apart_and_memory_stays_with_its_variant(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rows = self.fixture(root)
            with patch("normalizar_inicio.observation", side_effect=lambda folder: rows[folder.name]):
                result = normalize_home(root)
            self.assertEqual(result["electron"]["interactive_median_s"], 2)
            self.assertEqual(len(result["electron"]["first_after_reboot"]), 1)
            self.assertEqual(result["electron"]["private_family_median_mib"], 700)
            self.assertEqual(result["rune"]["private_family_median_mib"], 100)

    def test_missing_warm_start_cannot_produce_a_complete_series(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rows = self.fixture(root)
            (root / "electron-warm-7/observacion-inicio.json").unlink()
            with patch("normalizar_inicio.observation", side_effect=lambda folder: rows[folder.name]):
                with self.assertRaisesRegex(ValueError, "Faltan"):
                    normalize_home(root)


if __name__ == "__main__":
    unittest.main()
