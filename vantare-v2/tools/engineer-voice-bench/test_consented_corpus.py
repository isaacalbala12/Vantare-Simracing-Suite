import io
import json
import tempfile
import unittest
import wave
from pathlib import Path

from consented_corpus import cleanup_expired, import_wav, preview_manifest


def write_wav(path: Path) -> None:
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16_000)
        output.writeframes(b"\x00\x00" * 160)


class ConsentedCorpusTests(unittest.TestCase):
    def test_import_requires_exact_consent_and_keeps_paths_private(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "voice.wav"
            write_wav(source)
            with self.assertRaisesRegex(ValueError, "explicit consent"):
                import_wav(source, root / "corpus", "speaker-1", "en", "hello", "no", "NON-IDENTIFYING")

            manifest = import_wav(
                source, root / "corpus", "speaker-1", "en", "hello", "I CONSENT", "NON-IDENTIFYING"
            )
            serialized = json.dumps(manifest)
            self.assertNotIn(str(root), serialized)
            self.assertEqual(preview_manifest(root / "corpus")["samples"][0]["speaker_alias"], "speaker-1")

    def test_cleanup_removes_expired_temporary_samples(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "voice.wav"
            write_wav(source)
            import_wav(source, root / "corpus", "speaker-1", "en", "hello", "I CONSENT", "NON-IDENTIFYING", keep=False)
            removed = cleanup_expired(root / "corpus", now="2999-01-01T00:00:00Z")
            self.assertEqual(removed, 1)
            self.assertEqual(preview_manifest(root / "corpus")["samples"], [])

    def test_import_refuses_storage_inside_git(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".git").mkdir()
            source = root / "voice.wav"
            write_wav(source)
            with self.assertRaisesRegex(ValueError, "outside every Git worktree"):
                import_wav(source, root / "corpus", "speaker-1", "en", "hello", "I CONSENT", "NON-IDENTIFYING")

    def test_import_requires_operator_to_confirm_alias_is_a_pseudonym(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "voice.wav"
            write_wav(source)
            with self.assertRaisesRegex(ValueError, "pseudonym"):
                import_wav(source, root / "corpus", "speaker-1", "en", "hello", "I CONSENT", "no")


if __name__ == "__main__":
    unittest.main()
