import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

from generar_standings import TARGET, render
from preparar_escenas import UI, prepare
import capturar_standings


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

    def test_server_belt_stops_batch_before_reading_paths_or_starting_processes(self):
        with patch.object(capturar_standings, "os", SimpleNamespace(environ={"VANTARE_SIN_GRAFICOS": "1"})):
            with self.assertRaises(ValueError):
                capturar_standings.run(Path("absent.json"), Path("absent.exe"), launch=lambda *a, **kw: self.fail("process started"))

    def test_changed_input_and_path_escape_stop_the_entire_batch_before_launch(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            target = root / "plan"
            plan = prepare(UI / "src/standings/scenes.json", UI, target, "a" * 40, widget="standings")
            executable = root / "not-an-executable.txt"
            executable.write_text("CPU test: never execute", encoding="utf-8")
            cases = [{**plan, "commit": "unknown"}]
            changed = json.loads(json.dumps(plan))
            changed["entries"][-1]["snapshot"] = "../escape.json"
            cases.append(changed)
            changed = json.loads(json.dumps(plan))
            changed["entries"][-1]["input_sha256"] = "0" * 64
            cases.append(changed)
            with patch.object(capturar_standings, "os", SimpleNamespace(environ={})):
                for invalid in cases:
                    plan_file = target / "plan.json"
                    plan_file.write_text(json.dumps(invalid), encoding="utf-8")
                    with self.assertRaises(ValueError):
                        capturar_standings.run(plan_file, executable, launch=lambda *a, **kw: self.fail("process started"))

    def test_batch_uses_scene_mode_and_checks_binary_identity_with_a_fake_process(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            target = root / "plan"
            plan = prepare(UI / "src/standings/scenes.json", UI, target, "a" * 40, widget="standings")
            plan["entries"] = plan["entries"][:1]
            plan_file = target / "plan.json"
            plan_file.write_text(json.dumps(plan), encoding="utf-8")
            executable = root / "cpu-fixture.txt"
            executable.write_text("No executable, no actual process", encoding="utf-8")
            calls = []

            def fake(command, **options):
                calls.append(command)
                self.assertEqual(command[1], "--capture-scene")
                self.assertEqual(options, {"check": True, "timeout": 45})
                output = Path(command[command.index("--output") + 1])
                output.parent.mkdir(parents=True)
                output.write_bytes(b"CPU test payload, not a screenshot")
                output.with_suffix(".capture.txt").write_text(f"engine=rune\ncommit={plan['commit']}\nrune_rev={plan['rune_rev']}\n", encoding="utf-8")

            with patch.object(capturar_standings, "os", SimpleNamespace(environ={})):
                rows = capturar_standings.run(plan_file, executable, launch=fake)
            self.assertEqual(len(calls), 1)
            self.assertEqual(len(rows[0]["binary_sha256"]), 64)
            self.assertEqual(len(rows[0]["png_sha256"]), 64)
            result = json.loads((target / "rune-captures.json").read_text(encoding="utf-8"))
            self.assertEqual(result["status"], "captured-not-reviewed")


if __name__ == "__main__":
    unittest.main()
