"""Safety regression checks for the optional historical source extractor."""
import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import reproduce


class FrozenSources(unittest.TestCase):
    def test_reviewed_output_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            original = output / "reviewed.json"
            original.write_bytes(b"reviewed golden")
            with self.assertRaisesRegex(ValueError, "output must not exist"):
                reproduce.run("lmu", output)
            self.assertEqual(original.read_bytes(), b"reviewed golden")

    def test_archive_rejects_traversal_windows_paths_and_environment_files(self):
        for name in ("../escape.go", "C:/escape.go", "..\\escape.go", ".env/hidden.go"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                archive = root / "source.tar.gz"
                with tarfile.open(archive, "w:gz") as output:
                    info = tarfile.TarInfo(name)
                    info.size = 4
                    output.addfile(info, io.BytesIO(b"test"))
                entry = {"archive": archive.name, "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
                         "files": {name: hashlib.sha256(b"test").hexdigest()}}
                (root / "manifest.json").write_text(json.dumps({"test": entry}), encoding="utf-8")
                with patch.object(reproduce, "HERE", root), self.assertRaisesRegex(ValueError, "unsafe archived"):
                    reproduce.extract("test", root / "extracted")
                self.assertFalse((root / "extracted").exists())

    def test_corrupted_archive_is_rejected_before_extraction(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "source.tar.gz").write_bytes(b"altered")
            entry = {"archive": "source.tar.gz", "sha256": "0" * 64, "files": {}}
            (root / "manifest.json").write_text(json.dumps({"test": entry}), encoding="utf-8")
            with patch.object(reproduce, "HERE", root), self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                reproduce.extract("test", root / "extracted")
            self.assertFalse((root / "extracted").exists())


if __name__ == "__main__":
    unittest.main()
