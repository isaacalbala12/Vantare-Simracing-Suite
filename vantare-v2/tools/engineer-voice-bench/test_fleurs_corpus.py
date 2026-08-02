import hashlib
import io
import tarfile
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

from fleurs_corpus import build_corpus, extract_selected_audio, sanitize_manifest


def wav_bytes() -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16_000)
        output.writeframes(b"\x00\x00" * 160)
    return buffer.getvalue()


class FleursCorpusTests(unittest.TestCase):
    def test_extracts_only_selected_safe_wav_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "dev.tar.gz"
            payload = wav_bytes()
            with tarfile.open(archive, "w:gz") as bundle:
                for name in ("dev/a.wav", "dev/ignored.wav"):
                    info = tarfile.TarInfo(name)
                    info.size = len(payload)
                    bundle.addfile(info, io.BytesIO(payload))

            result = extract_selected_audio(
                archive.as_uri(),
                {"a.wav": {"sentence_id": "1", "transcription": "hello"}},
                root / "out",
                transfer_limit=1024 * 1024,
                file_limit=1024 * 1024,
            )

            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]["sha256"], hashlib.sha256(payload).hexdigest())
            self.assertTrue((root / "out" / "a.wav").is_file())
            self.assertFalse((root / "out" / "ignored.wav").exists())

    def test_rejects_unsafe_archive_member(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "dev.tar.gz"
            payload = wav_bytes()
            with tarfile.open(archive, "w:gz") as bundle:
                info = tarfile.TarInfo("../a.wav")
                info.size = len(payload)
                bundle.addfile(info, io.BytesIO(payload))
            with self.assertRaisesRegex(ValueError, "unsafe archive member"):
                extract_selected_audio(
                    archive.as_uri(),
                    {"a.wav": {"sentence_id": "1", "transcription": "hello"}},
                    root / "out",
                    transfer_limit=1024 * 1024,
                    file_limit=1024 * 1024,
                )
            self.assertFalse((root / "out").exists())

    def test_build_cleans_all_locales_after_intermediate_failure(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "corpus"

            def fail_on_second(locale, destination, *_args):
                (destination / locale).mkdir(parents=True, exist_ok=True)
                (destination / locale / "partial.wav").write_bytes(b"partial")
                if locale == "es_419":
                    raise ValueError("simulated archive failure")
                return {"locale": locale, "samples": []}

            with patch("fleurs_corpus.build_locale", side_effect=fail_on_second):
                with self.assertRaisesRegex(ValueError, "simulated archive failure"):
                    build_corpus(output, "revision", 5, 1024, 1024, 4096)
            self.assertFalse(output.exists())

    def test_sanitized_manifest_has_reproducible_sample_evidence_without_paths_or_text(self) -> None:
        manifest = {
            "source": "google/fleurs",
            "revision": "revision",
            "locales": [
                {
                    "locale": "en_us",
                    "samples": [
                        {
                            "recording_id": "public-recording-id",
                            "file": "private/path.wav",
                            "transcription": "private text",
                            "sha256": "a" * 64,
                            "bytes": 100,
                            "format_tag": 3,
                            "channels": 1,
                            "sample_rate": 16_000,
                            "frames": 200,
                            "gender": "MALE",
                        }
                    ],
                }
            ],
        }
        result = sanitize_manifest(manifest)
        serialized = str(result)
        self.assertNotIn("public-recording-id", serialized)
        self.assertNotIn("private/path.wav", serialized)
        self.assertNotIn("private text", serialized)
        self.assertEqual(result["samples"][0]["recording_id_sha256"], hashlib.sha256(b"public-recording-id").hexdigest())
        self.assertEqual(result["samples"][0]["ordinal"], 1)


if __name__ == "__main__":
    unittest.main()
