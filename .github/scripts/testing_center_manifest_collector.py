"""Trusted manifest collector for Testing Center RED/GREEN evidence.

Builds the closed, versioned manifest consumed by ``testing_center_diff_gate``
from three trusted inputs: raw facts extracted from a verified git bundle, a
closed dossier, and command results emitted only by the verify runner. The
collector never runs Git, tests, GitHub clients, providers, or network
commands; it only validates and reshapes already-collected facts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any, NoReturn

MANIFEST_VERSION = 1
CONTRACT_VERSION = "testing-center-diff-gate/v1"
RUNNER_EVIDENCE_KIND = "verify-runner"
POLICY_LIMITS = {
    "max_test_files": 5,
    "max_product_files": 5,
    "max_changed_lines": 200,
}
CONTROL_FILES = (
    "testing-center-agent-settings.json",
    "testing-center-green-prompt.md",
    "testing-center-red-prompt.md",
    "testing-center-review-output.schema.json",
    "testing-center-review-prompt.md",
    "testing-center-review-settings.json",
)

SHA_RE = re.compile(r"^[0-9a-f]{40}$")
DIGEST_RE = re.compile(r"^sha256:[0-9a-f]{64}$")


class ManifestError(ValueError):
    """The trusted facts are not closed, consistent, or fail-closed."""


def build_manifest(
    raw_git_facts: dict[str, Any],
    dossier: dict[str, Any],
    command_results: list[dict[str, Any]],
) -> dict[str, Any]:
    """Validate trusted inputs and produce one closed diff-gate manifest."""
    _validate_raw_git_facts(raw_git_facts)
    _validate_dossier(dossier)
    _validate_command_results(command_results)

    _reject_fail_open_facts(raw_git_facts, dossier)

    red_commands, green_commands = _bind_commands(
        command_results,
        red_sha=raw_git_facts["red_sha"],
        head_sha=raw_git_facts["head_sha"],
        red_ids=dossier["command_ids"]["red"],
        green_ids=dossier["command_ids"]["green"],
    )

    clean = bool(raw_git_facts["clean"]) and _runner_bound_to_tree(raw_git_facts)

    phases: dict[str, dict[str, Any]] = {}
    for phase_name, sha_field, digest_key in (
        ("red", "red_sha", "red"),
        ("green", "head_sha", "head"),
    ):
        phases[phase_name] = {
            "sha": raw_git_facts[sha_field],
            "digest": raw_git_facts["tree_digests"][digest_key],
            "trailers": dict(raw_git_facts["trailers"][phase_name]),
            "changes": _merge_patches(
                raw_git_facts["changes"][phase_name],
                raw_git_facts["patches"][phase_name],
            ),
            "commands": red_commands if phase_name == "red" else green_commands,
        }

    return {
        "manifest_version": MANIFEST_VERSION,
        "expected": {
            "base_sha": dossier["base_sha"],
            "job_key": dossier["job_key"],
            "version": dossier["version"],
            "red_digest": raw_git_facts["tree_digests"]["red"],
            "head_digest": raw_git_facts["tree_digests"]["head"],
            "test_paths": list(dossier["test_paths"]),
            "product_paths": list(dossier["product_paths"]),
            "command_ids": {
                "red": list(dossier["command_ids"]["red"]),
                "green": list(dossier["command_ids"]["green"]),
            },
            "limits": dict(dossier["limits"]),
        },
        "git": {
            "base_sha": raw_git_facts["base_sha"],
            "red_sha": raw_git_facts["red_sha"],
            "head_sha": raw_git_facts["head_sha"],
            "ancestry": dict(raw_git_facts["ancestry"]),
            "commit_counts": dict(raw_git_facts["commit_counts"]),
            "clean": clean,
        },
        "phases": phases,
        "secret_findings": [dict(finding) for finding in raw_git_facts["secret_findings"]],
    }


def manifest_sha256(manifest: dict[str, Any]) -> str:
    """Deterministic sha256 of the canonical JSON rendering of a manifest."""
    canonical = json.dumps(manifest, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def control_sha256(directory: Path) -> str:
    """Hash the exact trusted-control file set with names and contents bound."""
    if not directory.is_dir() or directory.is_symlink():
        _invalid("trusted control must be a local directory")
    entries = {entry.name for entry in directory.iterdir()}
    if entries != set(CONTROL_FILES):
        _invalid("trusted control has missing or unknown files")
    digest = hashlib.sha256()
    for name in CONTROL_FILES:
        source = directory / name
        if not source.is_file() or source.is_symlink():
            _invalid("trusted control entries must be regular files")
        content = source.read_bytes()
        encoded_name = name.encode("utf-8")
        digest.update(len(encoded_name).to_bytes(4, "big"))
        digest.update(encoded_name)
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
    return digest.hexdigest()


def _reject_fail_open_facts(
    raw_git_facts: dict[str, Any],
    dossier: dict[str, Any],
) -> None:
    if not raw_git_facts["bundle_verified"]:
        _invalid("bundle is not verified")
    if raw_git_facts["bundle_tip"] != raw_git_facts["head_sha"]:
        _invalid("bundle tip does not match head")
    shas = (
        raw_git_facts["base_sha"],
        raw_git_facts["red_sha"],
        raw_git_facts["head_sha"],
    )
    if len(set(shas)) != 3:
        _invalid("base, red and head shas must be distinct")
    if dossier["base_sha"] != raw_git_facts["base_sha"]:
        _invalid("dossier base_sha does not match git base")

    for phase, phase_label, digest_key in (
        ("red", "RED", "red"),
        ("green", "GREEN", "head"),
    ):
        trailer = raw_git_facts["trailers"][phase]
        expected_digest = raw_git_facts["tree_digests"][digest_key]
        if trailer["phase"] != phase_label:
            _invalid(f"{phase} trailer phase does not match")
        if trailer["job_key"] != dossier["job_key"]:
            _invalid(f"{phase} trailer job_key does not match the dossier")
        if trailer["version"] != dossier["version"]:
            _invalid(f"{phase} trailer version does not match the dossier")
        if trailer["digest"] != expected_digest:
            _invalid(f"{phase} trailer digest does not match the tree digest")


def _runner_bound_to_tree(raw_git_facts: dict[str, Any]) -> bool:
    evidence = raw_git_facts["runner_evidence"]
    return (
        evidence["kind"] == RUNNER_EVIDENCE_KIND
        and evidence["head_sha"] == raw_git_facts["head_sha"]
        and evidence["tree_digest"] == raw_git_facts["tree_digests"]["head"]
    )


def _bind_commands(
    command_results: list[dict[str, Any]],
    *,
    red_sha: str,
    head_sha: str,
    red_ids: list[str],
    green_ids: list[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    red_by_id: dict[str, dict[str, Any]] = {}
    green_by_id: dict[str, dict[str, Any]] = {}
    for result in command_results:
        command = {
            "id": result["id"],
            "status": result["status"],
            "failure_kind": result["failure_kind"],
        }
        ran_on = result["ran_on_sha"]
        if ran_on == red_sha:
            if command["id"] in red_by_id:
                _invalid("duplicate red command result")
            red_by_id[command["id"]] = command
        elif ran_on == head_sha:
            if command["id"] in green_by_id:
                _invalid("duplicate green command result")
            green_by_id[command["id"]] = command
        else:
            _invalid("command result is not bound to the red or head sha")

    if set(red_by_id) != set(red_ids):
        _invalid("red command results do not match the dossier command ids")
    if set(green_by_id) != set(green_ids):
        _invalid("green command results do not match the dossier command ids")

    red_commands = [red_by_id[command_id] for command_id in red_ids]
    green_commands = [green_by_id[command_id] for command_id in green_ids]
    return red_commands, green_commands


def _merge_patches(changes: list[dict[str, Any]], patches: list[str]) -> list[dict[str, Any]]:
    if len(changes) != len(patches):
        _invalid("changes and patches must be aligned")
    merged: list[dict[str, Any]] = []
    for change_value, patch in zip(changes, patches):
        change = dict(change_value)
        change["patch"] = patch
        merged.append(change)
    return merged


def _validate_raw_git_facts(value: Any) -> None:
    facts = _mapping(value, "raw_git_facts")
    _keys(
        facts,
        {
            "bundle_verified",
            "bundle_tip",
            "base_sha",
            "red_sha",
            "head_sha",
            "ancestry",
            "commit_counts",
            "trailers",
            "tree_digests",
            "changes",
            "patches",
            "clean",
            "runner_evidence",
            "secret_findings",
        },
        "raw_git_facts",
    )
    _boolean(facts["bundle_verified"], "raw_git_facts.bundle_verified")
    for name in ("bundle_tip", "base_sha", "red_sha", "head_sha"):
        _sha(facts[name], f"raw_git_facts.{name}")

    ancestry = _mapping(facts["ancestry"], "raw_git_facts.ancestry")
    _keys(ancestry, {"base_to_red", "red_to_head"}, "raw_git_facts.ancestry")
    _boolean(ancestry["base_to_red"], "raw_git_facts.ancestry.base_to_red")
    _boolean(ancestry["red_to_head"], "raw_git_facts.ancestry.red_to_head")

    counts = _mapping(facts["commit_counts"], "raw_git_facts.commit_counts")
    _keys(counts, {"base_to_red", "red_to_head"}, "raw_git_facts.commit_counts")
    for name in ("base_to_red", "red_to_head"):
        if _integer(counts[name], f"raw_git_facts.commit_counts.{name}") < 1:
            _invalid(f"raw_git_facts.commit_counts.{name} must be positive")

    trailers = _mapping(facts["trailers"], "raw_git_facts.trailers")
    _keys(trailers, {"red", "green"}, "raw_git_facts.trailers")
    for phase in ("red", "green"):
        trailer = _mapping(trailers[phase], f"raw_git_facts.trailers.{phase}")
        _keys(
            trailer,
            {"phase", "job_key", "version", "digest"},
            f"raw_git_facts.trailers.{phase}",
        )
        _string(trailer["phase"], f"raw_git_facts.trailers.{phase}.phase")
        _string(trailer["job_key"], f"raw_git_facts.trailers.{phase}.job_key")
        _string(trailer["version"], f"raw_git_facts.trailers.{phase}.version")
        if not DIGEST_RE.fullmatch(trailer["digest"]):
            _invalid(f"raw_git_facts.trailers.{phase}.digest must be sha256")

    digests = _mapping(facts["tree_digests"], "raw_git_facts.tree_digests")
    _keys(digests, {"red", "head"}, "raw_git_facts.tree_digests")
    for name in ("red", "head"):
        if not DIGEST_RE.fullmatch(digests[name]):
            _invalid(f"raw_git_facts.tree_digests.{name} must be sha256")

    changes = _mapping(facts["changes"], "raw_git_facts.changes")
    _keys(changes, {"red", "green"}, "raw_git_facts.changes")
    patches = _mapping(facts["patches"], "raw_git_facts.patches")
    _keys(patches, {"red", "green"}, "raw_git_facts.patches")
    for phase in ("red", "green"):
        _validate_changes(changes[phase], f"raw_git_facts.changes.{phase}")
        patch_values = _list(patches[phase], f"raw_git_facts.patches.{phase}")
        for index, patch in enumerate(patch_values):
            _string(patch, f"raw_git_facts.patches.{phase}[{index}]")
        if len(changes[phase]) != len(patch_values):
            _invalid(f"raw_git_facts.changes.{phase} and patches must align")

    _boolean(facts["clean"], "raw_git_facts.clean")

    evidence = _mapping(facts["runner_evidence"], "raw_git_facts.runner_evidence")
    _keys(
        evidence,
        {"kind", "head_sha", "tree_digest"},
        "raw_git_facts.runner_evidence",
    )
    _string(evidence["kind"], "raw_git_facts.runner_evidence.kind")
    _sha(evidence["head_sha"], "raw_git_facts.runner_evidence.head_sha")
    if not DIGEST_RE.fullmatch(evidence["tree_digest"]):
        _invalid("raw_git_facts.runner_evidence.tree_digest must be sha256")

    findings = _list(facts["secret_findings"], "raw_git_facts.secret_findings")
    for index, finding_value in enumerate(findings):
        finding = _mapping(
            finding_value, f"raw_git_facts.secret_findings[{index}]"
        )
        _keys(
            finding,
            {"kind", "path"},
            f"raw_git_facts.secret_findings[{index}]",
        )
        _string(finding["kind"], f"raw_git_facts.secret_findings[{index}].kind")
        _string(finding["path"], f"raw_git_facts.secret_findings[{index}].path")


def _validate_dossier(value: Any) -> None:
    work = _mapping(value, "dossier")
    _keys(
        work,
        {
            "base_sha",
            "job_key",
            "version",
            "test_paths",
            "product_paths",
            "command_ids",
            "limits",
        },
        "dossier",
    )
    _sha(work["base_sha"], "dossier.base_sha")
    _string(work["job_key"], "dossier.job_key")
    if _string(work["version"], "dossier.version") != CONTRACT_VERSION:
        _invalid("unsupported contract version")
    for name in ("test_paths", "product_paths"):
        paths = _string_list(work[name], f"dossier.{name}")
        if not paths or len(paths) != len(set(paths)):
            _invalid(f"dossier.{name} must be non-empty and unique")

    command_ids = _mapping(work["command_ids"], "dossier.command_ids")
    _keys(command_ids, {"red", "green"}, "dossier.command_ids")
    for phase in ("red", "green"):
        ids = _string_list(command_ids[phase], f"dossier.command_ids.{phase}")
        if not ids or len(ids) != len(set(ids)):
            _invalid(f"dossier.command_ids.{phase} must be non-empty and unique")

    limits = _mapping(work["limits"], "dossier.limits")
    _keys(
        limits,
        {"max_test_files", "max_product_files", "max_changed_lines"},
        "dossier.limits",
    )
    for name in ("max_test_files", "max_product_files", "max_changed_lines"):
        if _integer(limits[name], f"dossier.limits.{name}") != POLICY_LIMITS[name]:
            _invalid(f"dossier.limits.{name} does not match gate policy")


def _validate_changes(value: Any, location: str) -> None:
    changes = _list(value, location)
    if not changes:
        _invalid(f"{location} must not be empty")
    for index, change_value in enumerate(changes):
        change = _mapping(change_value, f"{location}[{index}]")
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
            },
            f"{location}[{index}]",
        )
        _string(change["path"], f"{location}[{index}].path")
        _string(change["status"], f"{location}[{index}].status")
        for field in ("old_path", "mode_before", "mode_after"):
            if change[field] is not None:
                _string(change[field], f"{location}[{index}].{field}")
        _boolean(change["binary"], f"{location}[{index}].binary")
        for field in ("additions", "deletions"):
            if _integer(change[field], f"{location}[{index}].{field}") < 0:
                _invalid(f"{location}[{index}].{field} must be non-negative")


def _validate_command_results(value: Any) -> None:
    results = _list(value, "command_results")
    if not results:
        _invalid("command_results must not be empty")
    for index, result_value in enumerate(results):
        result = _mapping(result_value, f"command_results[{index}]")
        _keys(
            result,
            {"id", "status", "failure_kind", "ran_on_sha"},
            f"command_results[{index}]",
        )
        _string(result["id"], f"command_results[{index}].id")
        if result["status"] not in {"passed", "failed"}:
            _invalid(f"command_results[{index}].status must be passed or failed")
        if result["failure_kind"] is not None:
            _string(result["failure_kind"], f"command_results[{index}].failure_kind")
        _sha(result["ran_on_sha"], f"command_results[{index}].ran_on_sha")


def _sha(value: Any, location: str) -> str:
    text = _string(value, location)
    if SHA_RE.fullmatch(text) is None:
        _invalid(f"{location} must be lowercase hex40")
    return text


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


def _read_json(path: str, label: str) -> Any:
    source = Path(path)
    if not source.is_file():
        raise ManifestError(f"{label} is not a local file")
    return json.loads(source.read_text(encoding="utf-8"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build one trusted Testing Center manifest from local verified facts"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    build = subparsers.add_parser("build", help="build a manifest from local JSON facts")
    build.add_argument("--raw-git-facts", required=True)
    build.add_argument("--dossier", required=True)
    build.add_argument("--command-results", required=True)
    build.add_argument("--output", required=True)

    digest = subparsers.add_parser(
        "manifest-sha256", help="print the canonical sha256 of a manifest"
    )
    digest.add_argument("--manifest", required=True)

    control_digest = subparsers.add_parser(
        "control-sha256", help="print the sha256 of the closed trusted-control set"
    )
    control_digest.add_argument("--directory", required=True)

    args = parser.parse_args(argv)
    try:
        if args.command == "build":
            facts = _read_json(args.raw_git_facts, "raw_git_facts")
            work = _read_json(args.dossier, "dossier")
            results = _read_json(args.command_results, "command_results")
            manifest = build_manifest(facts, work, results)
            output = Path(args.output)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(
                json.dumps(manifest, sort_keys=True, separators=(",", ":")),
                encoding="utf-8",
            )
            print(f"manifest_sha256={manifest_sha256(manifest)}")
        elif args.command == "manifest-sha256":
            manifest = _read_json(args.manifest, "manifest")
            print(manifest_sha256(manifest))
        else:
            print(control_sha256(Path(args.directory)))
    except (
        OSError,
        UnicodeError,
        json.JSONDecodeError,
        ManifestError,
        TypeError,
        KeyError,
    ):
        print(json.dumps({"error": "invalid_manifest"}, separators=(",", ":")))
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
