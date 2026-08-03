"""Create deterministic synthetic-noise variants of PCM16 WAV files."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import struct
import wave
from pathlib import Path


def _read_samples(source: Path) -> tuple[int, list[int]]:
    payload = source.read_bytes()
    if len(payload) < 44 or payload[:4] != b"RIFF" or payload[8:12] != b"WAVE":
        raise ValueError("source must be a RIFF WAV")
    offset = 12
    fmt = None
    data = None
    while offset + 8 <= len(payload):
        chunk_id = payload[offset:offset + 4]
        size = struct.unpack_from("<I", payload, offset + 4)[0]
        start = offset + 8
        if start + size > len(payload):
            raise ValueError("source contains a truncated WAV chunk")
        if chunk_id == b"fmt " and size >= 16:
            fmt = struct.unpack_from("<HHIIHH", payload, start)
        elif chunk_id == b"data":
            data = payload[start:start + size]
        offset = start + size + (size % 2)
    if fmt is None or data is None:
        raise ValueError("source WAV is missing fmt or data")
    format_tag, channels, sample_rate, _, _, bits = fmt
    if channels != 1 or sample_rate < 8_000:
        raise ValueError("source must be mono WAV at 8 kHz or higher")
    if format_tag == 1 and bits == 16:
        return sample_rate, [value[0] for value in struct.iter_unpack("<h", data)]
    if format_tag == 3 and bits == 32:
        return sample_rate, [round(max(-1.0, min(1.0, value[0])) * 32767) for value in struct.iter_unpack("<f", data)]
    raise ValueError("source must be PCM16 or IEEE float32 WAV")


def add_white_noise(source: Path, output: Path, snr_db: float, seed: int) -> dict[str, object]:
    if source.resolve() == output.resolve():
        raise ValueError("noise output must not overwrite the clean source")
    sample_rate, samples = _read_samples(source)
    signal_rms = math.sqrt(sum(value * value for value in samples) / max(len(samples), 1))
    noise_rms = signal_rms / (10 ** (snr_db / 20)) if signal_rms else 1.0
    randomizer = random.Random(seed)
    noisy = bytearray()
    for value in samples:
        mixed = round(value + randomizer.gauss(0, noise_rms))
        mixed = max(-32768, min(32767, mixed))
        noisy.extend(mixed.to_bytes(2, "little", signed=True))
    output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(output), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate)
        audio.writeframes(noisy)
    payload = output.read_bytes()
    return {"file": output.name, "sha256": hashlib.sha256(payload).hexdigest(), "bytes": len(payload), "snr_db": snr_db, "seed": seed}


def augment_manifest(manifest: dict[str, object], root: Path, snr_db: float) -> dict[str, object]:
    resolved = root.resolve()
    if any((candidate / ".git").exists() for candidate in (resolved, *resolved.parents)):
        raise ValueError("corpus root must be outside every Git worktree")
    samples = []
    condition = f"noise-{snr_db:g}db"
    for locale in manifest["locales"]:
        locale_name = locale["locale"]
        for index, sample in enumerate(locale["samples"]):
            source = root / locale_name / sample["file"]
            clean = {
                "locale": locale_name,
                "condition": "clean",
                "file": source.relative_to(root).as_posix(),
                "reference": sample["transcription"],
                "recording_id": sample.get("recording_id"),
                "gender": sample.get("gender", "UNKNOWN"),
            }
            output = root / condition / locale_name / sample["file"]
            noise = add_white_noise(source, output, snr_db, seed=(index + 1) * 1009 + sum(locale_name.encode("utf-8")))
            samples.extend(
                [
                    clean,
                    {
                        **clean,
                        "condition": condition,
                        "file": output.relative_to(root).as_posix(),
                        "sha256": noise["sha256"],
                        "snr_db": snr_db,
                    },
                ]
            )
    return {
        "schema": "vantare.engineer.stt-benchmark-corpus.v1",
        "source": manifest.get("source"),
        "revision": manifest.get("revision"),
        "samples": samples,
        "limitations": [
            "Noise is deterministic white noise, not recorded LMU cockpit noise.",
            "Generic FLEURS speech does not establish command intent accuracy or false accept/reject rates.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--root", type=Path)
    parser.add_argument("--snr-db", type=float, default=10.0)
    parser.add_argument("--seed", type=int)
    args = parser.parse_args()
    if args.manifest:
        if not args.root or not args.output:
            raise SystemExit("--manifest requires --root and --output")
        resolved_root = args.root.resolve()
        if resolved_root not in args.output.resolve().parents:
            raise SystemExit("benchmark manifest output must remain inside the external corpus root")
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        result = augment_manifest(manifest, args.root, args.snr_db)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"samples": len(result["samples"])}))
    else:
        if not args.source or not args.output or args.seed is None:
            raise SystemExit("single-file mode requires --source, --output and --seed")
        print(add_white_noise(args.source, args.output, args.snr_db, args.seed))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
