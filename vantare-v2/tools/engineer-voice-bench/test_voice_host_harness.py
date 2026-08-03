import json
import tempfile
import unittest
from pathlib import Path

from test_voice_host import REAL_HOST, prepare_artifact
from voice_host_harness import run_harness


class VoiceHostHarnessTests(unittest.TestCase):
    def test_harness_is_probe_only_sanitized_and_reproducible(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest, artifacts = prepare_artifact(root)
            output = root / "result.json"
            result = run_harness(
                host_script=REAL_HOST,
                manifest_path=manifest,
                artifact_root=artifacts,
                required_artifacts=("whisper-base-multilingual",),
                storage_limit_bytes=1024,
                iterations=20,
                output=output,
            )
            self.assertEqual(result["schema"], "vantare.engineer.voice-host-lifecycle.v1")
            self.assertTrue(result["probe_only"])
            self.assertEqual(result["command_readiness"], "NO-GO")
            self.assertEqual(result["iterations"], 20)
            self.assertTrue(result["clean_shutdown"])
            self.assertEqual(result["remaining_leases"], 0)
            self.assertGreaterEqual(result["latency_ms"]["p95"], result["latency_ms"]["p50"])
            serialized = output.read_text(encoding="utf-8")
            self.assertEqual(json.loads(serialized), result)
            self.assertNotIn(str(root), serialized)
            self.assertNotIn("token", serialized.lower())
            self.assertNotIn("pid", serialized.lower())

    def test_harness_refuses_result_inside_git_worktree(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest, artifacts = prepare_artifact(root)
            with self.assertRaises(ValueError):
                run_harness(
                    host_script=REAL_HOST,
                    manifest_path=manifest,
                    artifact_root=artifacts,
                    required_artifacts=("whisper-base-multilingual",),
                    storage_limit_bytes=1024,
                    iterations=1,
                    output=Path(__file__).with_name("must-not-exist.json"),
                )


if __name__ == "__main__":
    unittest.main()
