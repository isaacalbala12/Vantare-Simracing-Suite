import json
from pathlib import Path
import tempfile
import unittest

from generar_standings import TARGET, render
from preparar_escenas import UI, prepare


class StandingsTests(unittest.TestCase):
    def test_tokens_match_the_existing_gpui_style(self):
        self.assertEqual(TARGET.read_bytes().replace(b"\r\n", b"\n"), render())

    def test_both_looks_and_scales_preserve_every_original_scene(self):
        source = UI / "src/standings/scenes.json"
        originals = json.loads(source.read_text(encoding="utf-8"))
        before = source.read_bytes()
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "plan"
            plan = prepare(source, UI, target, "a" * 40, ("vantare", "eficiencia"), widget="standings")
            self.assertEqual(len(plan["entries"]), len(originals) * 6)
            self.assertEqual(len({r["rune_key"] for r in plan["entries"]}), len(originals) * 6)
            for entry in plan["entries"]:
                original = next(s for s in originals if s["name"] == entry["scene"])
                layout = json.loads((target / entry["layout"]).read_text(encoding="utf-8"))
                for instance in layout["instances"]:
                    self.assertEqual(instance["settings"].pop("designSystem"), entry["look"])
                self.assertEqual(layout, original["layout"])
                expected = json.loads((source.parent / original["snapshot"]).read_text(encoding="utf-8"))
                self.assertEqual(json.loads((target / entry["snapshot"]).read_text(encoding="utf-8")), expected)
            self.assertFalse(list(target.rglob("*.png")))
            self.assertIn("SIN EJECUTAR", (target / "INDEX.md").read_text(encoding="utf-8"))
        self.assertEqual(source.read_bytes(), before)

    def test_corpus_of_another_widget_is_rejected_without_creating_output(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "plan"
            with self.assertRaises(ValueError):
                prepare(UI / "src/relative/scenes.json", UI, target, "a" * 40, widget="standings")
            self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
