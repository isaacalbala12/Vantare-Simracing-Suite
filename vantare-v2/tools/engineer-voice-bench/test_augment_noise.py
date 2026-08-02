import tempfile
import unittest
import wave
from pathlib import Path

from augment_noise import add_white_noise, augment_manifest


def write_signal(path: Path) -> None:
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16_000)
        output.writeframes((1000).to_bytes(2, "little", signed=True) * 1600)


class NoiseTests(unittest.TestCase):
    def test_noise_is_deterministic_for_same_seed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "clean.wav"
            write_signal(source)
            first = add_white_noise(source, root / "one.wav", 10.0, 7)
            second = add_white_noise(source, root / "two.wav", 10.0, 7)
            self.assertEqual(first["sha256"], second["sha256"])

    def test_manifest_keeps_clean_and_noise_conditions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            clean = root / "en_us" / "sample.wav"
            clean.parent.mkdir()
            write_signal(clean)
            manifest = {
                "locales": [{"locale": "en_us", "samples": [{"file": "sample.wav", "transcription": "hello"}]}]
            }
            result = augment_manifest(manifest, root, 10.0)
            self.assertEqual([sample["condition"] for sample in result["samples"]], ["clean", "noise-10db"])
            self.assertNotEqual(result["samples"][0]["file"], result["samples"][1]["file"])


if __name__ == "__main__":
    unittest.main()
