"""Valida selección y orden de fixtures existentes, sin ejecutables ni GPU."""
import json
import unittest
from pathlib import Path
from preparar_tanda import SCENES, photos, prefixes


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


if __name__ == "__main__":
    unittest.main()
