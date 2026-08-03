import contextlib
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from test_voice_artifacts import LocalArtifactServer
from voice_artifact_cli import run


def write_manifest(path: Path, url: str, payload: bytes) -> None:
    path.write_text(
        json.dumps(
            {
                "schema": "vantare.engineer.voice-artifacts.v1",
                "manifest_version": 1,
                "artifacts": [
                    {
                        "id": "model",
                        "version": "test",
                        "platform": "windows",
                        "architecture": "x86_64",
                        "kind": "stt-model",
                        "filename": "model.bin",
                        "bytes": len(payload),
                        "sha256": hashlib.sha256(payload).hexdigest(),
                        "license": "MIT",
                        "license_url": "https://example.invalid/license",
                        "source_url": url,
                        "allowed_hosts": ["127.0.0.1"],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )


class VoiceArtifactCLITests(unittest.TestCase):
    def invoke(self, arguments: list[str], manifest: Path) -> tuple[int, str]:
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = run(arguments, allow_test_http=True, trusted_manifest_path=manifest)
        return code, output.getvalue()

    def test_status_install_and_remove_are_explicit_and_sanitized(self) -> None:
        payload = b"fixture"
        with LocalArtifactServer(payload) as source, tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = root / "manifest.json"
            storage = root / "storage"
            write_manifest(manifest, f"http://127.0.0.1:{source.port}/artifact", payload)
            common = ["--root", str(storage), "--limit-bytes", "1024"]

            code, status = self.invoke(common + ["status"], manifest)
            self.assertEqual(code, 0)
            self.assertEqual(json.loads(status)[0]["state"], "missing")
            self.assertNotIn(str(root), status)
            self.assertNotIn("source_url", status)

            with self.assertRaises(ValueError):
                self.invoke(common + ["install", "model"], manifest)
            code, installed = self.invoke(
                common + ["install", "model", "--confirm", "DOWNLOAD"], manifest
            )
            self.assertEqual(code, 0)
            self.assertEqual(json.loads(installed)["state"], "verified")

            with self.assertRaises(ValueError):
                self.invoke(common + ["remove", "model"], manifest)
            code, removed = self.invoke(
                common + ["remove", "model", "--confirm", "REMOVE"], manifest
            )
            self.assertEqual(code, 0)
            self.assertEqual(json.loads(removed)["state"], "missing")


if __name__ == "__main__":
    unittest.main()
