#!/usr/bin/env python3
"""Pure fail-closed plan for the inert Testing Center Nightly merge queue."""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable


REPO = "isaacalbala12/Vantare-Simracing-Suite"
SIGNER_WORKFLOW = (
    "github.com/isaacalbala12/Vantare-Simracing-Suite/"
    ".github/workflows/testing-center-agent-fix.yml"
)
EXPECTED_CHECKS = {
    "Validate promotion path",
    "Validate Vantare blocking gates",
}
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
JOB_RE = re.compile(r"^[0-9a-f]{64}$")
BRANCH_RE = re.compile(r"^vantareapp/tc-([0-9a-f]{12})-[a-z0-9]+(?:-[a-z0-9]+)*$")
TAG_RE = re.compile(r"^v[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+-nightly\.[1-9][0-9]*$")
CANDIDATE_KEYS = {
    "contract", "repo", "pr_number", "draft", "base", "base_sha", "head",
    "head_sha", "job_key", "digest",
    "conversations_resolved", "diff_approved", "opus_approved", "kill_switches",
    "checks",
}
SWITCH_KEYS = {"global", "repo", "family", "job"}


@dataclass(frozen=True)
class QueueDecision:
    allowed: bool
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class ReleaseMetadata:
    reservation: str
    public_issue: str
    fragment_path: str
    manifest_path: str


@dataclass(frozen=True)
class VerifiedAttestation:
    """Subject returned only after cryptographic verification by this module."""

    subject: dict[str, Any]


def may_enqueue(
    verified: VerifiedAttestation,
    *,
    live_head_sha: str,
    live_nightly_sha: str,
    recomputed_digest: str,
    active_closeout: str | None = None,
) -> QueueDecision:
    reasons: set[str] = set()
    if not isinstance(verified, VerifiedAttestation):
        return QueueDecision(False, ("cryptographic_attestation_required",))
    candidate: object = verified.subject
    if not isinstance(candidate, dict) or set(candidate) != CANDIDATE_KEYS:
        return QueueDecision(False, ("invalid_candidate_contract",))
    head = candidate["head"]
    job_key = candidate["job_key"]
    branch_match = BRANCH_RE.fullmatch(head) if isinstance(head, str) else None
    if (
        candidate["contract"] != "testing-center-merge-queue/v1"
        or candidate["repo"] != REPO
        or type(candidate["pr_number"]) is not int
        or candidate["pr_number"] < 1
        or candidate["draft"] is not False
        or candidate["base"] != "nightly"
        or not isinstance(candidate["base_sha"], str)
        or SHA_RE.fullmatch(candidate["base_sha"]) is None
        or not isinstance(candidate["head_sha"], str)
        or SHA_RE.fullmatch(candidate["head_sha"]) is None
        or not isinstance(job_key, str)
        or JOB_RE.fullmatch(job_key) is None
        or branch_match is None
        or branch_match.group(1) != job_key[:12]
    ):
        reasons.add("invalid_candidate_identity")
    if candidate["head_sha"] != live_head_sha:
        reasons.add("stale_head")
    if candidate["base_sha"] != live_nightly_sha:
        reasons.add("stale_nightly_base")
    if candidate["digest"] != recomputed_digest:
        reasons.add("digest_mismatch")
    for field in (
        "conversations_resolved", "diff_approved", "opus_approved",
    ):
        if candidate[field] is not True:
            reasons.add(f"{field}_required")
    switches = candidate["kill_switches"]
    if (
        not isinstance(switches, dict)
        or set(switches) != SWITCH_KEYS
        or any(value is not True for value in switches.values())
    ):
        reasons.add("kill_switch_open")
    if active_closeout is not None and active_closeout != job_key:
        reasons.add("nightly_closeout_in_flight")

    checks = candidate["checks"]
    seen: set[str] = set()
    if not isinstance(checks, list) or len(checks) != len(EXPECTED_CHECKS):
        reasons.add("required_check_set_mismatch")
    else:
        for check in checks:
            if not isinstance(check, dict) or set(check) != {
                "name", "app_slug", "sha", "conclusion"
            }:
                reasons.add("required_check_set_mismatch")
                continue
            name = check["name"]
            if name not in EXPECTED_CHECKS or name in seen:
                reasons.add("required_check_set_mismatch")
            seen.add(name)
            if check["app_slug"] != "github-actions":
                reasons.add("required_check_source_mismatch")
            if check["sha"] != candidate["head_sha"]:
                reasons.add("required_check_sha_mismatch")
            if check["conclusion"] != "success":
                reasons.add("required_check_not_successful")
        if seen != EXPECTED_CHECKS:
            reasons.add("required_check_set_mismatch")
    ordered = tuple(sorted(reasons))
    return QueueDecision(not ordered, ordered)


def prepare_release(job_key: str, reserved_tag: str) -> ReleaseMetadata:
    if JOB_RE.fullmatch(job_key) is None or TAG_RE.fullmatch(reserved_tag) is None:
        raise ValueError("invalid nightly reservation identity")
    public_issue = f"TC-{job_key[:12].upper()}"
    return ReleaseMetadata(
        reservation=reserved_tag,
        public_issue=public_issue,
        fragment_path=f"vantare-v2/docs/changelog/fragments/{public_issue}.json",
        manifest_path=f"vantare-v2/docs/releases/{reserved_tag}.json",
    )


def verify_signed_attestation(
    subject_path: Path,
    bundle_path: Path,
    trusted_workflow_sha: str,
    *,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> VerifiedAttestation:
    """Cryptographically verify a subject signed by the trusted default workflow."""
    if SHA_RE.fullmatch(trusted_workflow_sha) is None:
        raise ValueError("trusted workflow SHA must be lowercase hex40")
    if not subject_path.is_file() or not bundle_path.is_file():
        raise ValueError("attestation subject and bundle are required")
    command = [
        "gh", "attestation", "verify", str(subject_path),
        "--bundle", str(bundle_path),
        "--repo", REPO,
        "--signer-workflow", SIGNER_WORKFLOW,
        "--source-digest", trusted_workflow_sha,
        "--source-ref", "refs/heads/master",
        "--deny-self-hosted-runners",
        "--format", "json",
    ]
    result = runner(command, capture_output=True, text=True, check=False, timeout=60)
    if result.returncode != 0:
        raise ValueError("cryptographic attestation verification failed")
    try:
        verification = json.loads(result.stdout)
        subject = json.loads(subject_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError("attestation verification output is invalid") from exc
    if not isinstance(verification, list) or not verification or not isinstance(subject, dict):
        raise ValueError("attestation verification returned no trusted statement")
    return VerifiedAttestation(subject)
