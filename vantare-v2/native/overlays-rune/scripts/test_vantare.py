import json
import tempfile
import unittest
from pathlib import Path
from generar_vantare import render

class CanonicalStyleTests(unittest.TestCase):
    def test_product_tokens_are_regenerated_byte_for_byte(self):
        workspace=Path(__file__).resolve().parents[1]
        for path,expected in render(workspace.parent/"ui/styles/vantare.json").items():
            self.assertEqual((workspace/path).read_bytes(),expected)

    def test_changed_canonical_color_changes_output(self):
        workspace=Path(__file__).resolve().parents[1]
        source=workspace.parent/"ui/styles/vantare.json"
        document=json.loads(source.read_bytes())
        original=render(source)
        document["accents"]["red"]="#123456"
        with tempfile.TemporaryDirectory() as directory:
            modified=Path(directory)/"style.json"
            modified.write_text(json.dumps(document),encoding="utf-8")
            generated=render(modified)
            self.assertNotEqual(original,generated)
            self.assertIn(b'#123456',generated["src/vantare/generated.rs"])

if __name__=="__main__":
    unittest.main()
