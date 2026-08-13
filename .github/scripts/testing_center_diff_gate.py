"""Fail-closed policy gate for Testing Center RED/GREEN manifests.

The manifest contains facts collected by a trusted workflow step. This module
does not run Git, tests, GitHub clients, providers, or network commands.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath
from typing import Any, NoReturn


MANIFEST_VERSION = 1
CONTRACT_VERSION = "testing-center-diff-gate/v1"
MAX_PRODUCT_FILES = 5
MAX_TEST_FILES = 5
MAX_CHANGED_LINES = 200

REASON_ORDER = (
    "base_moved",
    "invalid_ancestry",
    "invalid_trailer",
    "dirty_tree",
    "red_test_mutated",
    "forbidden_path",
    "path_traversal",
    "case_collision",
    "file_budget_exceeded",
    "symlink",
    "submodule",
    "binary",
    "rename_or_delete",
    "secret_detected",
    "red_not_behavioral",
    "command_mismatch",
)

SHA_RE = re.compile(r"^[0-9a-f]{40}$")
DIGEST_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
WINDOWS_DRIVE_RE = re.compile(r"^[A-Za-z]:[/\\]")
SECRET_PATTERNS = (
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    re.compile(r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----"),
    re.compile(
        r"(?i)\b(?:api[_-]?key|access[_-]?token|token|password|secret)\b"
        r"\s*[:=]\s*['\"]?[A-Za-z0-9_./+=-]{8,}"
    ),
)


class ManifestError(ValueError):
    """The input is not a closed versioned Testing Center manifest."""


@dataclass(frozen=True)
class DiffDecision:
    approved: bool
    reasons: tuple[str, ...]
    base_sha: str
    red_sha: str
    head_sha: str
    changed_files: tuple[str, ...]


def evaluate_diff(manifest: dict[str, Any]) -> DiffDecision:
    """Validate and evaluate a pre-collected manifest without side effects."""
    _validate_manifest(manifest)

    expected = manifest["expected"]
    git = manifest["git"]
    red = manifest["phases"]["red"]
    green = manifest["phases"]["green"]
    all_changes = (*red["changes"], *green["changes"])
    changed_files = tuple(change["path"] for change in all_changes)
    reasons: set[str] = set()

    shas = (git["base_sha"], git["red_sha"], git["head_sha"])
    if any(not SHA_RE.fullmatch(sha) for sha in shas) or len(set(shas)) != 3:
        reasons.add("invalid_ancestry")
    if git["base_sha"] != expected["base_sha"]:
        reasons.add("base_moved")
    if (
        not git["ancestry"]["base_to_red"]
        or not git["ancestry"]["red_to_head"]
        or git["commit_counts"]["base_to_red"] != 1
        or git["commit_counts"]["red_to_head"] != 1
    ):
        reasons.add("invalid_ancestry")
    if not git["clean"]:
        reasons.add("dirty_tree")

    if not _phase_identity_matches(
        red,
        phase="RED",
        sha=git["red_sha"],
        digest=expected["red_digest"],
        job_key=expected["job_key"],
        version=expected["version"],
    ):
        reasons.add("invalid_trailer")
    if not _phase_identity_matches(
        green,
        phase="GREEN",
        sha=git["head_sha"],
        digest=expected["head_digest"],
        job_key=expected["job_key"],
        version=expected["version"],
    ):
        reasons.add("invalid_trailer")

    invalid_paths = {path for path in changed_files if _path_is_invalid(path)}
    if invalid_paths:
        reasons.add("path_traversal")

    seen_casefold: dict[str, str] = {}
    for path in changed_files:
        folded = path.casefold()
        previous = seen_casefold.setdefault(folded, path)
        if previous != path:
            reasons.add("case_collision")

    test_allowlist = set(expected["test_paths"])
    product_allowlist = set(expected["product_paths"])
    red_paths = {change["path"] for change in red["changes"]}
    red_paths_casefold = {path.casefold() for path in red_paths}
    if any(
        change["path"] not in test_allowlist
        or _is_forbidden_path(change["path"])
        or change["path"] in invalid_paths
        for change in red["changes"]
    ):
        reasons.add("forbidden_path")
    if any(
        change["path"] not in product_allowlist
        or _is_forbidden_path(change["path"])
        or change["path"] in invalid_paths
        for change in green["changes"]
    ):
        reasons.add("forbidden_path")
    if any(
        change["path"].casefold() in red_paths_casefold
        for change in green["changes"]
    ):
        reasons.add("red_test_mutated")

    changed_lines = sum(
        change["additions"] + change["deletions"] for change in all_changes
    )
    if (
        len(red["changes"]) > expected["limits"]["max_test_files"]
        or len(green["changes"]) > expected["limits"]["max_product_files"]
        or changed_lines > expected["limits"]["max_changed_lines"]
    ):
        reasons.add("file_budget_exceeded")

    for change in all_changes:
        modes = {change["mode_before"], change["mode_after"]}
        if "120000" in modes:
            reasons.add("symlink")
        if "160000" in modes:
            reasons.add("submodule")
        if change["binary"]:
            reasons.add("binary")
        if change["status"] not in {"added", "modified"} or change["old_path"] is not None:
            reasons.add("rename_or_delete")
        if any(mode not in {None, "100644", "100755"} for mode in modes):
            reasons.add("forbidden_path")
        if _patch_contains_secret(change["patch"]):
            reasons.add("secret_detected")
    if manifest["secret_findings"]:
        reasons.add("secret_detected")

    red_commands = red["commands"]
    green_commands = green["commands"]
    if [command["id"] for command in red_commands] != expected["command_ids"]["red"]:
        reasons.add("command_mismatch")
    if [command["id"] for command in green_commands] != expected["command_ids"]["green"]:
        reasons.add("command_mismatch")
    if not set(expected["command_ids"]["red"]).issubset(
        expected["command_ids"]["green"]
    ):
        reasons.add("command_mismatch")
    if any(command["status"] != "failed" for command in red_commands):
        reasons.add("command_mismatch")
    if any(command["failure_kind"] != "behavioral" for command in red_commands):
        reasons.add("red_not_behavioral")
    if any(
        command["status"] != "passed" or command["failure_kind"] is not None
        for command in green_commands
    ):
        reasons.add("command_mismatch")

    ordered_reasons = tuple(reason for reason in REASON_ORDER if reason in reasons)
    return DiffDecision(
        approved=not ordered_reasons,
        reasons=ordered_reasons,
        base_sha=git["base_sha"],
        red_sha=git["red_sha"],
        head_sha=git["head_sha"],
        changed_files=changed_files,
    )


def _validate_manifest(manifest: Any) -> None:
    root = _mapping(manifest, "manifest")
    _keys(root, {"manifest_version", "expected", "git", "phases", "secret_findings"}, "manifest")
    if _integer(root["manifest_version"], "manifest_version") != MANIFEST_VERSION:
        _invalid("unsupported manifest_version")

    expected = _mapping(root["expected"], "expected")
    _keys(
        expected,
        {
            "base_sha",
            "job_key",
            "version",
            "red_digest",
            "head_digest",
            "test_paths",
            "product_paths",
            "command_ids",
            "limits",
        },
        "expected",
    )
    for name in ("base_sha", "job_key", "version", "red_digest", "head_digest"):
        _string(expected[name], f"expected.{name}")
    if expected["version"] != CONTRACT_VERSION:
        _invalid("unsupported contract version")
    if not SHA_RE.fullmatch(expected["base_sha"]):
        _invalid("expected.base_sha must be hex40")
    for name in ("red_digest", "head_digest"):
        if not DIGEST_RE.fullmatch(expected[name]):
            _invalid(f"expected.{name} must be sha256")
    for name in ("test_paths", "product_paths"):
        values = _string_list(expected[name], f"expected.{name}")
        if not values or len(values) != len(set(values)):
            _invalid(f"expected.{name} must be non-empty and unique")
        if any(_path_is_invalid(path) for path in values):
            _invalid(f"expected.{name} contains an invalid path")
        if len({path.casefold() for path in values}) != len(values):
            _invalid(f"expected.{name} contains a case collision")
        if any(_is_forbidden_path(path) for path in values):
            _invalid(f"expected.{name} contains a forbidden path")
    if len(expected["product_paths"]) > MAX_PRODUCT_FILES:
        _invalid("expected.product_paths exceeds the file budget")
    if any(not _is_test_path(path) for path in expected["test_paths"]):
        _invalid("expected.test_paths contains a non-test path")
    if any(_is_test_path(path) for path in expected["product_paths"]):
        _invalid("expected.product_paths contains a test path")
    test_scope = {path.casefold() for path in expected["test_paths"]}
    product_scope = {path.casefold() for path in expected["product_paths"]}
    if test_scope & product_scope:
        _invalid("test and product scope overlap")

    command_ids = _mapping(expected["command_ids"], "expected.command_ids")
    _keys(command_ids, {"red", "green"}, "expected.command_ids")
    for phase in ("red", "green"):
        ids = _string_list(command_ids[phase], f"expected.command_ids.{phase}")
        if not ids or len(ids) != len(set(ids)):
            _invalid(f"expected.command_ids.{phase} must be non-empty and unique")

    limits = _mapping(expected["limits"], "expected.limits")
    _keys(
        limits,
        {"max_test_files", "max_product_files", "max_changed_lines"},
        "expected.limits",
    )
    max_tests = _integer(limits["max_test_files"], "max_test_files")
    max_files = _integer(limits["max_product_files"], "max_product_files")
    max_lines = _integer(limits["max_changed_lines"], "max_changed_lines")
    if (
        max_tests != MAX_TEST_FILES
        or max_files != MAX_PRODUCT_FILES
        or max_lines != MAX_CHANGED_LINES
    ):
        _invalid("limits do not match the gate policy")
    if len(expected["test_paths"]) > MAX_TEST_FILES:
        _invalid("expected.test_paths exceeds the file budget")

    git = _mapping(root["git"], "git")
    _keys(git, {"base_sha", "red_sha", "head_sha", "ancestry", "commit_counts", "clean"}, "git")
    for name in ("base_sha", "red_sha", "head_sha"):
        _string(git[name], f"git.{name}")
    ancestry = _mapping(git["ancestry"], "git.ancestry")
    _keys(ancestry, {"base_to_red", "red_to_head"}, "git.ancestry")
    _boolean(ancestry["base_to_red"], "git.ancestry.base_to_red")
    _boolean(ancestry["red_to_head"], "git.ancestry.red_to_head")
    counts = _mapping(git["commit_counts"], "git.commit_counts")
    _keys(counts, {"base_to_red", "red_to_head"}, "git.commit_counts")
    _integer(counts["base_to_red"], "git.commit_counts.base_to_red")
    _integer(counts["red_to_head"], "git.commit_counts.red_to_head")
    _boolean(git["clean"], "git.clean")

    phases = _mapping(root["phases"], "phases")
    _keys(phases, {"red", "green"}, "phases")
    for phase_name in ("red", "green"):
        _validate_phase(phases[phase_name], phase_name)

    findings = _list(root["secret_findings"], "secret_findings")
    for index, finding_value in enumerate(findings):
        finding = _mapping(finding_value, f"secret_findings[{index}]")
        _keys(finding, {"kind", "path"}, f"secret_findings[{index}]")
        _string(finding["kind"], f"secret_findings[{index}].kind")
        _string(finding["path"], f"secret_findings[{index}].path")


def _validate_phase(value: Any, name: str) -> None:
    phase = _mapping(value, f"phases.{name}")
    _keys(phase, {"sha", "digest", "trailers", "changes", "commands"}, f"phases.{name}")
    _string(phase["sha"], f"phases.{name}.sha")
    _string(phase["digest"], f"phases.{name}.digest")
    trailers = _mapping(phase["trailers"], f"phases.{name}.trailers")
    _keys(trailers, {"phase", "job_key", "version", "digest"}, f"phases.{name}.trailers")
    for field in ("phase", "job_key", "version", "digest"):
        _string(trailers[field], f"phases.{name}.trailers.{field}")

    changes = _list(phase["changes"], f"phases.{name}.changes")
    if not changes:
        _invalid(f"phases.{name}.changes must not be empty")
    for index, change_value in enumerate(changes):
        change = _mapping(change_value, f"phases.{name}.changes[{index}]")
        _keys(
            change,
            {
                "path",
                "old_path",
                "status",
                "mode_before",
                "mode_after",
                "binary",
                "additions",
                "deletions",
                "patch",
            },
            f"phases.{name}.changes[{index}]",
        )
        for field in ("path", "status", "patch"):
            _string(change[field], f"phases.{name}.changes[{index}].{field}")
        for field in ("old_path", "mode_before", "mode_after"):
            if change[field] is not None:
                _string(change[field], f"phases.{name}.changes[{index}].{field}")
        _boolean(change["binary"], f"phases.{name}.changes[{index}].binary")
        for field in ("additions", "deletions"):
            if _integer(change[field], f"phases.{name}.changes[{index}].{field}") < 0:
                _invalid(f"phases.{name}.changes[{index}].{field} must be non-negative")

    commands = _list(phase["commands"], f"phases.{name}.commands")
    if not commands:
        _invalid(f"phases.{name}.commands must not be empty")
    for index, command_value in enumerate(commands):
        command = _mapping(command_value, f"phases.{name}.commands[{index}]")
        _keys(command, {"id", "status", "failure_kind"}, f"phases.{name}.commands[{index}]")
        _string(command["id"], f"phases.{name}.commands[{index}].id")
        _string(command["status"], f"phases.{name}.commands[{index}].status")
        if command["failure_kind"] is not None:
            _string(command["failure_kind"], f"phases.{name}.commands[{index}].failure_kind")


def _phase_identity_matches(
    phase_data: dict[str, Any],
    *,
    phase: str,
    sha: str,
    digest: str,
    job_key: str,
    version: str,
) -> bool:
    trailers = phase_data["trailers"]
    return (
        phase_data["sha"] == sha
        and phase_data["digest"] == digest
        and DIGEST_RE.fullmatch(phase_data["digest"]) is not None
        and trailers
        == {"phase": phase, "job_key": job_key, "version": version, "digest": digest}
    )


def _path_is_invalid(path: str) -> bool:
    if (
        not path
        or path.startswith("/")
        or WINDOWS_DRIVE_RE.match(path)
        or "\\" in path
        or any(ord(character) < 32 or ord(character) == 127 for character in path)
    ):
        return True
    pure = PurePosixPath(path)
    return ".." in pure.parts or "." in pure.parts or pure.as_posix() != path


def _is_forbidden_path(path: str) -> bool:
    folded = path.casefold()
    parts = tuple(part.casefold() for part in PurePosixPath(path).parts)
    name = parts[-1] if parts else ""
    if any(part.startswith(".") for part in parts) or name in {
        ".mcp.json",
        "agents.md",
        "claude.md",
    }:
        return True
    sensitive_segments = {
        "auth",
        "authentication",
        "billing",
        "config",
        "configs",
        "credential",
        "credentials",
        "release",
        "releases",
        "secret",
        "secrets",
    }
    if any(part in sensitive_segments for part in parts):
        return True
    if any(token in name for token in ("auth", "billing", "secret", "credential")):
        return True
    if name.startswith("release") or ".config." in name:
        return True
    dependency_files = {
        "package.json",
        "package-lock.json",
        "pnpm-workspace.yaml",
        "deno.json",
        "deno.jsonc",
        "go.mod",
        "go.sum",
        "cargo.toml",
        "cargo.lock",
        "requirements.txt",
        "pyproject.toml",
        "poetry.lock",
        "composer.json",
        "composer.lock",
        "gemfile",
        "gemfile.lock",
    }
    return (
        name in dependency_files
        or name.endswith((".lock", "-lock.json", "-lock.yaml", "-lock.yml"))
        or folded.endswith("deno.lock")
    )


def _is_test_path(path: str) -> bool:
    parts = tuple(part.casefold() for part in PurePosixPath(path).parts)
    name = parts[-1] if parts else ""
    return (
        "tests" in parts
        or "__tests__" in parts
        or name.endswith(("_test.go", "_test.py"))
        or any(marker in name for marker in (".test.", ".spec."))
    )


def _patch_contains_secret(patch: str) -> bool:
    added_lines = "\n".join(
        line[1:]
        for line in patch.splitlines()
        if line.startswith("+") and not line.startswith("+++")
    )
    return any(pattern.search(added_lines) for pattern in SECRET_PATTERNS)


def _mapping(value: Any, location: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        _invalid(f"{location} must be an object")
    return value


def _list(value: Any, location: str) -> list[Any]:
    if not isinstance(value, list):
        _invalid(f"{location} must be an array")
    return value


def _string(value: Any, location: str) -> str:
    if not isinstance(value, str) or not value:
        _invalid(f"{location} must be a non-empty string")
    return value


def _string_list(value: Any, location: str) -> list[str]:
    items = _list(value, location)
    for index, item in enumerate(items):
        _string(item, f"{location}[{index}]")
    return items


def _integer(value: Any, location: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        _invalid(f"{location} must be an integer")
    return value


def _boolean(value: Any, location: str) -> bool:
    if not isinstance(value, bool):
        _invalid(f"{location} must be a boolean")
    return value


def _keys(value: dict[str, Any], expected: set[str], location: str) -> None:
    if set(value) != expected:
        _invalid(f"{location} has missing or unknown fields")


def _invalid(message: str) -> NoReturn:
    raise ManifestError(message)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Evaluate one local Testing Center manifest")
    parser.add_argument("manifest", help="path to a local manifest JSON file")
    args = parser.parse_args(argv)
    try:
        path = Path(args.manifest)
        if not path.is_file():
            raise ManifestError("manifest is not a local file")
        loaded = json.loads(path.read_text(encoding="utf-8"))
        decision = evaluate_diff(loaded)
    except (OSError, UnicodeError, json.JSONDecodeError, ManifestError, TypeError, KeyError):
        print(json.dumps({"error": "invalid_manifest"}, separators=(",", ":")))
        return 2

    print(json.dumps(asdict(decision), separators=(",", ":")))
    return 0 if decision.approved else 1


if __name__ == "__main__":
    sys.exit(main())
