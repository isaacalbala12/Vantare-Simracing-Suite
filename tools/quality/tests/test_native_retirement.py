import hashlib
import json
from pathlib import Path
import sys
import shutil
import subprocess
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from native_retirement import errors


class RetirementIntegrity(unittest.TestCase):
    def test_cli_fails_for_mutated_evidence_and_refuses_new_baselines(self):
        source = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            quality = root / "tools/quality"
            quality.mkdir(parents=True)
            for name in ("vantare_quality.py", "native_retirement.py"):
                shutil.copyfile(source / name, quality / name)
            corpus = root / "vantare-v2/native/retirement"
            corpus.mkdir(parents=True)
            shutil.copyfile(source.parents[1] / "vantare-v2/native/retirement/verify.py", corpus / "verify.py")
            fixture = corpus / "fixture.json"
            fixture.write_bytes(b"reviewed corpus")
            manifest = {"files": {"native/retirement/fixture.json": {"sha256": hashlib.sha256(fixture.read_bytes()).hexdigest()}}}
            (corpus / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            (quality / "scope.json").write_text(json.dumps({"retired_product": {"directories": ["frontend"], "baseline_hashes": {}}}), encoding="utf-8")
            def invoke(*args):
                return subprocess.run([sys.executable, str(quality / "vantare_quality.py"), *args], capture_output=True, text=True)
            self.assertEqual(invoke("check", "--ci", "--base", "reviewed-source").returncode, 0)
            self.assertNotEqual(invoke("check", "--ci").returncode, 0)
            self.assertNotEqual(invoke("baseline", "--confirm").returncode, 0)
            fixture.write_bytes(b"mutated corpus")
            failed = invoke("check", "--ci", "--base", "reviewed-source")
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn("retained bytes changed", failed.stdout)

    def test_retired_source_and_modified_historical_baseline_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            quality = root / "tools/quality"
            quality.mkdir(parents=True)
            baseline = quality / "baseline.json"
            baseline.write_bytes(b"reviewed baseline")
            scope = {"retired_product": {"directories": ["frontend"], "baseline_hashes": {"tools/quality/baseline.json": hashlib.sha256(baseline.read_bytes()).hexdigest()}}}
            (quality / "scope.json").write_text(json.dumps(scope), encoding="utf-8")
            self.assertEqual(errors(root), [])
            frontend = root / "vantare-v2/frontend"
            frontend.mkdir(parents=True)
            (frontend / "app.tsx").write_text("retired source", encoding="utf-8")
            self.assertTrue(any("returned" in message for message in errors(root)))
            baseline.write_bytes(b"changed baseline")
            self.assertTrue(any("baseline changed" in message for message in errors(root)))


if __name__ == "__main__":
    unittest.main()
