"""Build a small, reproducible FLEURS corpus outside the Git worktree."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import struct
import tarfile
import urllib.request
from pathlib import Path, PurePosixPath


SUPPORTED_LOCALES = ("en_us", "es_419", "it_it", "pt_br")
DEFAULT_REVISION = "70bb2e84b976b7e960aa89f1c648e09c59f894dd"
ARCHIVES = {
    "en_us": {"bytes": 171250900, "lfs_sha256": "2658fda72f199e12676ecac9415094667a4e14e149b146e568ea00b2a2f0954c"},
    "es_419": {"bytes": 255285841, "lfs_sha256": "94f0f3d9fd89c0496385bf0991f2565410cc489a73dd18cafa0ee0177dc5c815"},
    "it_it": {"bytes": 288887332, "lfs_sha256": "9ebd7a079958e9980b3f2d91766a968fbc4d60c615a775b064acfe5bd2bc4472"},
    "pt_br": {"bytes": 247399617, "lfs_sha256": "15f2a075859c3b6448e81c867f9c2a77694b3deab6b24ebc632de09bbf401838"},
}


class CountingReader:
    def __init__(self, source, limit: int):
        self.source = source
        self.limit = limit
        self.count = 0

    def read(self, size: int = -1) -> bytes:
        data = self.source.read(size)
        self.count += len(data)
        if self.count > self.limit:
            raise ValueError(f"archive transfer exceeded {self.limit} bytes")
        return data

    def close(self) -> None:
        self.source.close()


def ensure_outside_git(path: Path) -> None:
    resolved = path.resolve()
    for candidate in (resolved, *resolved.parents):
        if (candidate / ".git").exists():
            raise ValueError("corpus output must be outside every Git worktree")


def fetch_rows(url: str, transfer_limit: int = 4 * 1024 * 1024) -> list[dict[str, str]]:
    with urllib.request.urlopen(url, timeout=60) as response:
        reader = CountingReader(response, transfer_limit)
        content = reader.read().decode("utf-8")
    records = []
    for row in csv.reader(content.splitlines(), delimiter="\t"):
        if len(row) < 4:
            continue
        records.append(
            {
                "sentence_id": row[0],
                "audio_filename": row[1],
                "recording_id": Path(row[1]).stem,
                "transcription": row[2],
                "normalized_transcription": row[3],
                "gender": row[6] if len(row) > 6 else "UNKNOWN",
            }
        )
    return records


def _safe_wav_name(member_name: str) -> str | None:
    path = PurePosixPath(member_name)
    if path.is_absolute() or ".." in path.parts or len(path.parts) < 1:
        raise ValueError(f"unsafe archive member: {member_name}")
    if path.suffix.casefold() != ".wav":
        return None
    return path.name


def _validate_wav(path: Path) -> dict[str, int]:
    payload = path.read_bytes()
    if len(payload) < 44 or payload[:4] != b"RIFF" or payload[8:12] != b"WAVE":
        raise ValueError(f"invalid WAV container: {path.name}")
    offset = 12
    format_values = None
    data_size = None
    while offset + 8 <= len(payload):
        chunk_id = payload[offset:offset + 4]
        chunk_size = struct.unpack_from("<I", payload, offset + 4)[0]
        chunk_start = offset + 8
        if chunk_start + chunk_size > len(payload):
            raise ValueError(f"truncated WAV chunk: {path.name}")
        if chunk_id == b"fmt " and chunk_size >= 16:
            format_values = struct.unpack_from("<HHIIHH", payload, chunk_start)
        elif chunk_id == b"data":
            data_size = chunk_size
        offset = chunk_start + chunk_size + (chunk_size % 2)
    if format_values is None or data_size is None:
        raise ValueError(f"missing WAV format/data chunk: {path.name}")
    format_tag, channels, sample_rate, _, block_align, bits = format_values
    if format_tag not in (1, 3) or channels < 1 or sample_rate < 8_000 or bits not in (16, 32) or block_align < 1:
        raise ValueError(f"unsupported WAV format: {path.name}")
    return {
        "format_tag": format_tag,
        "channels": channels,
        "sample_rate": sample_rate,
        "frames": data_size // block_align,
    }


def extract_selected_audio(
    archive_url: str,
    selected: dict[str, dict[str, str]],
    output: Path,
    *,
    transfer_limit: int,
    file_limit: int,
    count: int | None = None,
    expected_archive_bytes: int | None = None,
) -> list[dict[str, object]]:
    output.mkdir(parents=True, exist_ok=True)
    remaining = dict(selected)
    desired = count if count is not None else len(remaining)
    extracted: list[dict[str, object]] = []
    try:
        with urllib.request.urlopen(archive_url, timeout=120) as response:
            content_length = response.headers.get("Content-Length")
            if expected_archive_bytes is not None and content_length is not None and int(content_length) != expected_archive_bytes:
                raise ValueError(f"archive size mismatch: got {content_length}; expected {expected_archive_bytes}")
            reader = CountingReader(response, transfer_limit)
            with tarfile.open(fileobj=reader, mode="r|gz") as archive:
                for member in archive:
                    name = _safe_wav_name(member.name)
                    if name is None or name not in remaining:
                        continue
                    if not member.isfile() or member.size > file_limit:
                        raise ValueError(f"invalid selected member: {member.name}")
                    source = archive.extractfile(member)
                    if source is None:
                        raise ValueError(f"cannot read selected member: {member.name}")
                    destination = output / name
                    digest = hashlib.sha256()
                    written = 0
                    with destination.open("wb") as target:
                        while chunk := source.read(64 * 1024):
                            written += len(chunk)
                            if written > file_limit:
                                raise ValueError(f"selected WAV exceeded {file_limit} bytes")
                            digest.update(chunk)
                            target.write(chunk)
                    metadata = remaining.pop(name)
                    extracted.append(
                        {
                            **metadata,
                            "file": name,
                            "bytes": written,
                            "sha256": digest.hexdigest(),
                            **_validate_wav(destination),
                        }
                    )
                    if len(extracted) == desired:
                        break
        if len(extracted) != desired:
            raise ValueError(f"only {len(extracted)} selected files found within transfer limit; expected {desired}")
        return extracted
    except BaseException:
        shutil.rmtree(output, ignore_errors=True)
        raise


def build_locale(
    locale: str,
    output: Path,
    revision: str,
    count: int,
    transfer_limit: int,
    file_limit: int,
) -> dict[str, object]:
    base = f"https://huggingface.co/datasets/google/fleurs/resolve/{revision}/data/{locale}"
    rows = fetch_rows(f"{base}/dev.tsv")
    selected = {row["audio_filename"]: row for row in rows}
    samples = extract_selected_audio(
        f"{base}/audio/dev.tar.gz",
        selected,
        output / locale,
        transfer_limit=transfer_limit,
        file_limit=file_limit,
        count=count,
        expected_archive_bytes=ARCHIVES[locale]["bytes"],
    )
    return {"locale": locale, "archive": ARCHIVES[locale], "samples": samples}


def sanitize_manifest(manifest: dict[str, object]) -> dict[str, object]:
    samples = []
    for locale in manifest["locales"]:
        for ordinal, sample in enumerate(locale["samples"], start=1):
            samples.append(
                {
                    "locale": locale["locale"],
                    "ordinal": ordinal,
                    "recording_id_sha256": hashlib.sha256(sample["recording_id"].encode("utf-8")).hexdigest(),
                    "wav_sha256": sample["sha256"],
                    "bytes": sample["bytes"],
                    "format_tag": sample["format_tag"],
                    "channels": sample["channels"],
                    "sample_rate": sample["sample_rate"],
                    "frames": sample["frames"],
                    "gender": sample["gender"],
                }
            )
    return {
        "schema": "vantare.engineer.sanitized-corpus-manifest.v1",
        "source": manifest["source"],
        "revision": manifest["revision"],
        "samples": samples,
        "excluded": ["transcript", "path", "raw recording ID", "speaker identity"],
    }


def build_corpus(
    output: Path,
    revision: str,
    samples_per_locale: int,
    transfer_limit: int,
    file_limit: int,
    total_limit: int,
) -> dict[str, object]:
    ensure_outside_git(output)
    if output.exists() and any(output.iterdir()):
        raise ValueError("output directory must be empty to avoid mixing corpus runs")
    output.mkdir(parents=True, exist_ok=True)
    try:
        locales = []
        total_bytes = 0
        for locale in SUPPORTED_LOCALES:
            result = build_locale(locale, output, revision, samples_per_locale, transfer_limit, file_limit)
            total_bytes += sum(int(sample["bytes"]) for sample in result["samples"])
            if total_bytes > total_limit:
                raise ValueError("extracted corpus exceeded total limit")
            locales.append(result)
        manifest = {
            "schema": "vantare.engineer.human-corpus.v1",
            "source": "google/fleurs",
            "revision": revision,
            "license": "CC-BY-4.0",
            "selection": "first WAV members in dev archive order that have matching dev.tsv metadata",
            "speaker_identity": "FLEURS original dev.tsv exposes recording ID and gender, not a stable speaker ID",
            "purpose": "generic human-language WER/CER only; not command readiness",
            "locales": locales,
        }
        (output / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        (output / "sanitized-manifest.json").write_text(
            json.dumps(sanitize_manifest(manifest), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        return manifest
    except BaseException:
        shutil.rmtree(output, ignore_errors=True)
        raise


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--revision", default=DEFAULT_REVISION)
    parser.add_argument("--samples-per-locale", type=int, default=5)
    parser.add_argument("--transfer-limit-mib", type=int, default=64)
    parser.add_argument("--file-limit-mib", type=int, default=5)
    parser.add_argument("--total-limit-mib", type=int, default=80)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.samples_per_locale < 1 or args.samples_per_locale > 20:
        raise SystemExit("samples-per-locale must be between 1 and 20")
    manifest = build_corpus(
        args.output,
        args.revision,
        args.samples_per_locale,
        args.transfer_limit_mib * 1024 * 1024,
        args.file_limit_mib * 1024 * 1024,
        args.total_limit_mib * 1024 * 1024,
    )
    print(json.dumps({"locales": len(manifest["locales"]), "samples": sum(len(x["samples"]) for x in manifest["locales"])}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
