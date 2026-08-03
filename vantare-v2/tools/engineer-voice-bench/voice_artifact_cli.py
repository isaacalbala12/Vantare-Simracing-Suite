"""Explicit operator CLI for the ENG-11 test-only artifact manager."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from voice_artifacts import ArtifactManager, load_manifest


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage test-only Engineer voice artifacts")
    parser.add_argument("--root", required=True)
    parser.add_argument("--limit-bytes", type=int, required=True)
    commands = parser.add_subparsers(dest="command", required=True)
    status = commands.add_parser("status")
    status.add_argument("artifact_id", nargs="?")
    install = commands.add_parser("install")
    install.add_argument("artifact_id")
    install.add_argument("--confirm", default="")
    install.add_argument("--timeout-seconds", type=float, default=300)
    install.add_argument("--force", action="store_true")
    remove = commands.add_parser("remove")
    remove.add_argument("artifact_id")
    remove.add_argument("--confirm", default="")
    cleanup = commands.add_parser("cleanup")
    cleanup.add_argument("--confirm", default="")
    return parser


def run(
    arguments: list[str] | None = None,
    *,
    allow_test_http: bool = False,
    trusted_manifest_path: Path | None = None,
) -> int:
    args = _parser().parse_args(arguments)
    manifest_path = trusted_manifest_path or Path(__file__).with_name("voice-artifacts.v1.json")
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise ValueError("manifest must be a regular trusted file")
    manifest = load_manifest(
        manifest_path.read_text(encoding="utf-8"),
        platform="windows",
        architecture="x86_64",
        allow_test_http=allow_test_http,
    )
    manager = ArtifactManager(manifest, Path(args.root), args.limit_bytes)

    if args.command == "status":
        result = manager.status(args.artifact_id) if args.artifact_id else manager.list_status()
    elif args.command == "install":
        if args.confirm != "DOWNLOAD":
            raise ValueError("explicit --confirm DOWNLOAD is required")
        result = manager.install(
            args.artifact_id,
            timeout_seconds=args.timeout_seconds,
            force=args.force,
        )
    elif args.command == "remove":
        if args.confirm != "REMOVE":
            raise ValueError("explicit --confirm REMOVE is required")
        manager.remove(args.artifact_id)
        result = manager.status(args.artifact_id)
    else:
        if args.confirm != "CLEANUP":
            raise ValueError("explicit --confirm CLEANUP is required")
        result = {"removed_temporaries": manager.cleanup_temporaries()}
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
