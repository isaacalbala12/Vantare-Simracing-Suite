"""Explicitly consented local capture/import for a future command corpus."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import uuid
import wave
from datetime import datetime, timedelta, timezone
from pathlib import Path


CONSENT = "I CONSENT"
PSEUDONYM_CONFIRMATION = "NON-IDENTIFYING"
MANIFEST = "manifest.json"
LOCALES = {"en", "es", "it", "pt-BR"}
MAX_WAV_BYTES = 5 * 1024 * 1024


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _safe_alias(value: str) -> str:
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,32}", value):
        raise ValueError("speaker alias must use 1-32 letters, digits, underscore or dash")
    return value


def _ensure_outside_git(path: Path) -> None:
    resolved = path.resolve()
    for candidate in (resolved, *resolved.parents):
        if (candidate / ".git").exists():
            raise ValueError("corpus storage must be outside every Git worktree")


def _managed_path(root: Path, relative: str) -> Path:
    resolved_root = root.resolve()
    candidate = (resolved_root / relative).resolve()
    if resolved_root not in candidate.parents:
        raise ValueError("manifest file escapes corpus root")
    return candidate


def _load(root: Path) -> dict[str, object]:
    path = root / MANIFEST
    if not path.exists():
        return {"schema": "vantare.engineer.consented-corpus.v1", "samples": []}
    return json.loads(path.read_text(encoding="utf-8"))


def _save(root: Path, manifest: dict[str, object]) -> None:
    root.mkdir(parents=True, exist_ok=True)
    temporary = root / f"{MANIFEST}.tmp"
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(root / MANIFEST)


def _validate_wav(path: Path) -> dict[str, int]:
    if path.stat().st_size > MAX_WAV_BYTES:
        raise ValueError("audio exceeds the 5 MiB local corpus limit")
    with wave.open(str(path), "rb") as audio:
        if audio.getnchannels() != 1 or audio.getsampwidth() != 2 or audio.getframerate() != 16_000:
            raise ValueError("audio must be mono 16 kHz PCM16 WAV")
        return {"frames": audio.getnframes(), "sample_rate": audio.getframerate()}


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(64 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def import_wav(
    source: Path,
    root: Path,
    speaker_alias: str,
    locale: str,
    transcript: str,
    consent: str,
    pseudonym_confirmation: str,
    *,
    keep: bool = False,
) -> dict[str, object]:
    if consent != CONSENT:
        raise ValueError(f'explicit consent is required: --consent "{CONSENT}"')
    if pseudonym_confirmation != PSEUDONYM_CONFIRMATION:
        raise ValueError(f'speaker alias must be a non-identifying pseudonym; confirm with --pseudonym-confirmation "{PSEUDONYM_CONFIRMATION}"')
    _ensure_outside_git(root)
    _safe_alias(speaker_alias)
    if locale not in LOCALES:
        raise ValueError(f"locale must be one of: {sorted(LOCALES)}")
    if not transcript.strip() or len(transcript) > 500:
        raise ValueError("transcript must contain 1-500 characters")
    audio = _validate_wav(source)
    sample_id = uuid.uuid4().hex
    destination = root / "audio" / f"{sample_id}.wav"
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    created = _now()
    sample = {
        "id": sample_id,
        "file": f"audio/{sample_id}.wav",
        "speaker_alias": speaker_alias,
        "locale": locale,
        "reference": transcript,
        "sha256": _sha256_file(destination),
        "bytes": destination.stat().st_size,
        **audio,
        "created_at_utc": created.isoformat().replace("+00:00", "Z"),
        "expires_at_utc": None if keep else (created + timedelta(hours=24)).isoformat().replace("+00:00", "Z"),
        "consent": "explicit-local",
        "pseudonym_status": "operator-declared-non-identifying",
    }
    manifest = _load(root)
    manifest["samples"].append(sample)
    _save(root, manifest)
    return manifest


def capture_wav(
    ffmpeg: Path,
    device: str,
    root: Path,
    speaker_alias: str,
    locale: str,
    transcript: str,
    consent: str,
    pseudonym_confirmation: str,
    seconds: int,
    keep: bool,
) -> dict[str, object]:
    if consent != CONSENT:
        raise ValueError(f'explicit consent is required before capture: --consent "{CONSENT}"')
    if pseudonym_confirmation != PSEUDONYM_CONFIRMATION:
        raise ValueError(f'speaker alias must be a non-identifying pseudonym; confirm with --pseudonym-confirmation "{PSEUDONYM_CONFIRMATION}"')
    _ensure_outside_git(root)
    _safe_alias(speaker_alias)
    if locale not in LOCALES or not transcript.strip() or len(transcript) > 500:
        raise ValueError("locale and transcript must be valid before capture")
    if seconds < 1 or seconds > 30:
        raise ValueError("capture duration must be between 1 and 30 seconds")
    scratch = root / f"capture-{uuid.uuid4().hex}.wav"
    root.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            [str(ffmpeg), "-hide_banner", "-loglevel", "error", "-f", "dshow", "-i", f"audio={device}", "-t", str(seconds), "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-y", str(scratch)],
            check=True,
            timeout=seconds + 20,
        )
        return import_wav(scratch, root, speaker_alias, locale, transcript, consent, pseudonym_confirmation, keep=keep)
    finally:
        scratch.unlink(missing_ok=True)


def preview_manifest(root: Path) -> dict[str, object]:
    return _load(root)


def delete_sample(root: Path, sample_id: str) -> bool:
    manifest = _load(root)
    kept = []
    removed = None
    for sample in manifest["samples"]:
        if sample["id"] == sample_id:
            removed = sample
        else:
            kept.append(sample)
    if removed is None:
        return False
    _managed_path(root, removed["file"]).unlink(missing_ok=True)
    manifest["samples"] = kept
    _save(root, manifest)
    return True


def cleanup_expired(root: Path, now: str | None = None) -> int:
    instant = _parse_time(now) if now else _now()
    manifest = _load(root)
    expired = [sample for sample in manifest["samples"] if sample["expires_at_utc"] and _parse_time(sample["expires_at_utc"]) <= instant]
    for sample in expired:
        _managed_path(root, sample["file"]).unlink(missing_ok=True)
    manifest["samples"] = [sample for sample in manifest["samples"] if sample not in expired]
    _save(root, manifest)
    return len(expired)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    subcommands = parser.add_subparsers(dest="command", required=True)
    for name in ("import", "capture"):
        command = subcommands.add_parser(name)
        command.add_argument("--root", required=True, type=Path)
        command.add_argument("--speaker-alias", required=True)
        command.add_argument("--locale", required=True)
        command.add_argument("--transcript", required=True)
        command.add_argument("--consent", required=True)
        command.add_argument("--pseudonym-confirmation", required=True, help="operator declaration that speaker-alias is not a real name or identifier")
        command.add_argument("--keep", action="store_true")
        if name == "import":
            command.add_argument("--source", required=True, type=Path)
        else:
            command.add_argument("--ffmpeg", required=True, type=Path)
            command.add_argument("--device", required=True)
            command.add_argument("--seconds", type=int, default=10)
    preview = subcommands.add_parser("preview")
    preview.add_argument("--root", required=True, type=Path)
    delete = subcommands.add_parser("delete")
    delete.add_argument("--root", required=True, type=Path)
    delete.add_argument("--sample-id", required=True)
    cleanup = subcommands.add_parser("cleanup")
    cleanup.add_argument("--root", required=True, type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.command == "import":
        result = import_wav(args.source, args.root, args.speaker_alias, args.locale, args.transcript, args.consent, args.pseudonym_confirmation, keep=args.keep)
    elif args.command == "capture":
        result = capture_wav(args.ffmpeg, args.device, args.root, args.speaker_alias, args.locale, args.transcript, args.consent, args.pseudonym_confirmation, args.seconds, args.keep)
    elif args.command == "preview":
        result = preview_manifest(args.root)
    elif args.command == "delete":
        result = {"deleted": delete_sample(args.root, args.sample_id)}
    else:
        result = {"removed": cleanup_expired(args.root)}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
