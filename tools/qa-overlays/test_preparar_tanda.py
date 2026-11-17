"""Valida selección y orden de fixtures existentes, sin ejecutables ni GPU."""
import json
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
import preparar_tanda as packaging
from preparar_tanda import SCENES, photos, prefixes, looks, specifications


class InputsTests(unittest.TestCase):
    def test_all_nineteen_canonical_sources_exist_and_fit_cli_limits(self):
        fixtures = Path(__file__).resolve().parents[2] / "vantare-v2/native/ui/fixtures"
        self.assertEqual(len(SCENES), 19)
        for kind, (filename, _) in SCENES.items():
            with self.subTest(kind=kind):
                values = photos(json.loads((fixtures / filename).read_text(encoding="utf-8")))
                self.assertLessEqual(len(values), 256)
                sizes = [len(json.dumps(value).encode("utf-8")) for value in values]
                self.assertLessEqual(max(sizes), 8 * 1024**2)
                self.assertLessEqual(sum(sizes), 64 * 1024**2)
                self.assertEqual(prefixes(len(values))[-1], len(values))

    def test_scene_extraction_preserves_sequence_epoch_and_order(self):
        values = [{"version": 11, "state": {}, "epoch": 9, "sequence": i} for i in (4, 4, 2)]
        wrapped = {"frameMs": 1500, "frames": [{"snapshot": value} for value in values]}
        self.assertEqual(photos(wrapped), values)
        self.assertEqual(photos(values), values)
        self.assertEqual(photos(values[0]), [values[0]])

    def test_empty_or_non_photo_sources_fail_instead_of_demo_fallback(self):
        for value in ([], {"frames": []}, {"demo": "relative"}, [None]):
            with self.assertRaises((ValueError, TypeError)):
                photos(value)

    def test_history_keeps_required_prefixes_and_full_history(self):
        self.assertEqual(prefixes(197), [1, 3, 10, 121, 197])
        self.assertEqual(prefixes(8), list(range(1, 9)))

    def test_only_supported_looks_are_claimed(self):
        self.assertEqual(looks("radar"), ("funcional",))
        self.assertEqual(looks("session-alerts"), ("funcional",))
        self.assertEqual(looks("relative"), ("vantare", "eficiencia"))
        self.assertEqual(sum(len(looks(kind)) for kind in SCENES), 24)

    def test_named_catalog_entries_retain_their_real_settings(self):
        repo = Path(__file__).resolve().parents[2]
        entries = [spec for spec in specifications(repo) if "catalog" in spec]
        self.assertEqual(len(entries), 13)
        asymmetric = next(spec for spec in entries if spec["catalog_entry"] == "asymmetric")
        self.assertEqual(asymmetric["settings"]["rangeAhead"], 1)
        self.assertEqual(asymmetric["settings"]["rangeBehind"], 2)
        for spec in entries:
            catalog = json.loads(spec["catalog"].read_text(encoding="utf-8"))
            source = next(entry for entry in catalog if entry["name"] == spec["catalog_entry"])
            self.assertEqual(spec["settings"], source["layout"]["instances"][0]["settings"])

    def test_full_package_with_fake_executables_preserves_plan_and_paused_variant(self):
        repo = Path(__file__).resolve().parents[2]
        actual_digest = packaging.digest
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            binaries = root / "bin"
            binaries.mkdir()
            rows = []
            for name in ("vantare-overlays-rune", "vantare-overlays", "vantare-core", "vantare-services", "vantare"):
                image = binaries / (name + ".exe")
                image.write_bytes(b"FAKE NEVER EXECUTE")
                rows.append({"name": name, "source_sha": packaging.SOURCE_SHA, "sha256": actual_digest(image),
                             "features": "paint-stats" if name == "vantare-core" else "", "license_public_keys_configured": False})
            packaging.write_json(root / "binarios.json", rows)
            lifecycle = []
            for name in ("lifecycle-harness.exe", "lifecycle-rune-tests.exe"):
                image = binaries / name
                image.write_bytes(b"FAKE NEVER EXECUTE")
                lifecycle.append({"name": name, "sha256": actual_digest(image)})
            packaging.write_json(root / "lifecycle-binarios.json", {"binaries": lifecycle})
            pm, corpus, inventory = (root / name for name in ("pm.exe", "corpus.tar.gz", "inventory.md"))
            pm.write_bytes(b"FAKE PM");corpus.write_bytes(b"FAKE CORPUS");inventory.write_text("Historical coverage", encoding="utf-8")
            def fake_corpus_digest(path):
                return "c5b827ce1cfa558e732da934f11eb0f83f5dfb9e8a3c793f4d3f65ef8ca2a01c" if Path(path) == corpus else actual_digest(path)
            with patch.object(packaging.subprocess, "check_output", return_value=packaging.SOURCE_SHA + "\n"), \
                 patch.object(packaging, "PRESENTMON_SHA", actual_digest(pm)), \
                 patch.object(packaging, "digest", side_effect=fake_corpus_digest):
                manifest = packaging.prepare(repo, root / "output", binaries, pm, corpus, inventory)
            self.assertEqual(len(manifest["measurements"]), 96)
            for case in manifest["measurements"]:
                layout = json.loads((root / "output" / case["layout"]).read_text(encoding="utf-8"))
                self.assertEqual(layout["performance"]["widgets"]["qa"], 15)
                if case["kind"] in {"relative", "standings", "fuel-strategy", "delta"}:
                    self.assertEqual(layout["instances"][0]["settings"]["contentVersion"], 1)
                self.assertEqual(case["effective_host_hz"], 0 if case["kind"] == "racing-flags" else 15)
            self.assertFalse(manifest["production_rights_configured"])
            self.assertTrue(any(case["source_catalog_entry"] == "many-slots" for case in manifest["captures"]))
            self.assertFalse(any(case["kind"] == "radar" and case["look"] == "eficiencia" for case in manifest["captures"]))
            paused = next(case for case in manifest["captures"] if case["transform"])
            emitted = json.loads((root / "output" / paused["scene"]).read_text(encoding="utf-8"))[0]
            original = photos(json.loads((repo / paused["source_fixture"]).read_bytes()))[0]
            self.assertEqual(emitted["state"]["source_state"], "paused")
            emitted["state"]["source_state"] = original["state"]["source_state"]
            self.assertEqual(emitted, original)


if __name__ == "__main__":
    unittest.main()
