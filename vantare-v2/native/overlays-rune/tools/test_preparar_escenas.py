import json
from pathlib import Path
import tempfile
import unittest

from preparar_escenas import UI, prepare

COMMIT = "a" * 40


class ScenePlanTests(unittest.TestCase):
    def test_original_gpui_corpus_is_preserved_and_keyed_at_each_look_and_scale(self):
        source = UI / "src/relative/scenes.json"
        original = json.loads(source.read_text(encoding="utf-8"))
        before = source.read_bytes()
        with tempfile.TemporaryDirectory() as temp:
            destination = Path(temp) / "plan"
            plan = prepare(source, UI, destination, COMMIT, ("eficiencia", "vantare"))
            self.assertEqual(len(plan["entries"]), len(original) * 2 * 3)
            self.assertEqual(plan["status"], "planned-not-captured")
            keys = [entry["rune_key"] for entry in plan["entries"]]
            self.assertEqual(len(set(keys)), len(keys))
            self.assertTrue(all(f"rune:{COMMIT}:" in key for key in keys))
            for entry in plan["entries"]:
                expected = next(scene for scene in original if scene["name"] == entry["scene"])
                layout = json.loads((destination / entry["layout"]).read_text(encoding="utf-8"))
                for instance in layout["instances"]:
                    self.assertEqual(instance["settings"].pop("designSystem"), entry["look"])
                self.assertEqual(layout, expected["layout"])
                snapshot = json.loads((destination / entry["snapshot"]).read_text(encoding="utf-8"))
                self.assertEqual(snapshot, json.loads((source.parent / expected["snapshot"]).read_text(encoding="utf-8")))
            self.assertFalse(list(destination.rglob("*.png")), "un plan no es una captura")
            self.assertIn("Pendiente", (destination / "INDEX.md").read_text(encoding="utf-8"))
            with self.assertRaises(ValueError):
                prepare(source, UI, destination, COMMIT)
        self.assertEqual(source.read_bytes(), before)

    def test_invalid_or_external_inputs_stop_before_any_output(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "corpus"
            root.mkdir()
            scenes = root / "scenes.json"
            (root / "snapshot.json").write_text("{}", encoding="utf-8")
            destination = Path(temp) / "output"
            valid = {"name": "relative", "snapshot": "snapshot.json", "layout": {"instances": [{"settings": {"kind": "relative"}}]}}
            for records in [[], ["invalid"], [valid, valid], [{**valid, "frames": 5}], [{**valid, "name": "../escape"}], [{**valid, "snapshot": "../outside.json"}], [{**valid, "layout": {"instances": [{"settings": {"kind": "radar"}}]}}]]:
                scenes.write_text(json.dumps(records), encoding="utf-8")
                with self.assertRaises(ValueError):
                    prepare(scenes, root, destination, COMMIT)
                self.assertFalse(destination.exists())
            scenes.write_text(json.dumps([valid]), encoding="utf-8")
            for kwargs in [{"commit": "unknown"}, {"looks": ("unknown",)}, {"scales": (200,)}, {"looks": ("eficiencia", "eficiencia")}]:
                args = {"commit": COMMIT, **kwargs}
                with self.assertRaises(ValueError):
                    prepare(scenes, root, destination, **args)
                self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main()
