#!/usr/bin/env python3
"""Fail-closed, inert plan for a verified Testing Center Nightly queue entry."""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Collection, Mapping

from validate_branch_channels import validate_tc_attestation


REPO = "isaacalbala12/Vantare-Simracing-Suite"
SIGNER_WORKFLOW = (
    "github.com/isaacalbala12/Vantare-Simracing-Suite/"
    ".github/workflows/testing-center-agent-fix.yml"
)
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
HEX64_RE = re.compile(r"^[0-9a-f]{64}$")
TAG_RE = re.compile(r"^v[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+-nightly\.[1-9][0-9]*$")
SWITCH_KEYS = {"global", "repo", "family", "job"}
ACCEPTED_RESERVATION_RESULTS = {"reserved", "existing"}


@dataclass(frozen=True)
class QueueDecision:
    allowed: bool
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class ReleasePlan:
    rpc: str
    reservation_kind: str
    reservation_key: str
    binding_digest: str
    public_issue: str
    fragment_path: str
    manifest_path: str


def prepare_release(job_key: str, reserved_tag: str, binding_digest: str) -> ReleasePlan:
    """Prepare, but never execute, the existing unique Supabase reservation RPC."""
    if (
        HEX64_RE.fullmatch(job_key) is None
        or TAG_RE.fullmatch(reserved_tag) is None
        or HEX64_RE.fullmatch(binding_digest) is None
    ):
        raise ValueError("invalid nightly reservation identity")
    public_issue = f"TC-{job_key[:12].upper()}"
    return ReleasePlan(
        rpc="testing_center_reserve_agent_resource",
        reservation_kind="nightly_release",
        reservation_key=reserved_tag,
        binding_digest=binding_digest,
        public_issue=public_issue,
        fragment_path=f"vantare-v2/docs/changelog/fragments/{public_issue}.json",
        manifest_path=f"vantare-v2/docs/releases/{reserved_tag}.json",
    )


def evaluate_verified_candidate(
    subject: object,
    *,
    live_pr_number: int,
    live_draft: bool,
    live_head: str,
    live_head_sha: str,
    live_nightly_sha: str,
    recomputed_digest: str,
    conversations_resolved: bool,
    kill_switches: Mapping[str, bool],
    active_closeout_job_keys: Collection[str],
    reservation_status: str,
    reserved_tag: str,
    reservation_record_key: str,
    reservation_binding_digest: str,
) -> QueueDecision:
    """Evaluate v2 semantics and fresh facts after cryptographic verification.

    This function is a deterministic test seam; it does not establish
    cryptographic trust. Activation must call ``verify_and_evaluate_attestation``.
    """
    reasons: set[str] = set()
    try:
        validate_tc_attestation(subject, expected_head=live_head)
    except (TypeError, ValueError):
        return QueueDecision(False, ("invalid_v2_attestation",))

    assert isinstance(subject, dict)
    job_key = subject["job_key"]
    if type(live_pr_number) is not int or live_pr_number < 1:
        reasons.add("invalid_live_pr")
    if live_draft is not False:
        reasons.add("draft_pr")
    if subject["head_sha"] != live_head_sha:
        reasons.add("stale_head")
    if subject["base_sha"] != live_nightly_sha:
        reasons.add("stale_nightly_base")
    if subject["digest"] != recomputed_digest:
        reasons.add("digest_mismatch")
    if conversations_resolved is not True:
        reasons.add("conversations_unresolved")
    if (
        not isinstance(kill_switches, Mapping)
        or set(kill_switches) != SWITCH_KEYS
        or any(value is not True for value in kill_switches.values())
    ):
        reasons.add("kill_switch_open")

    closeouts = tuple(active_closeout_job_keys)
    if len(closeouts) > 1:
        reasons.add("multiple_nightly_candidates")
    if any(closeout != job_key for closeout in closeouts):
        reasons.add("nightly_closeout_in_flight")

    expected_binding = subject["digest"].removeprefix("sha256:")
    try:
        plan = prepare_release(job_key, reserved_tag, reservation_binding_digest)
    except (TypeError, ValueError):
        reasons.add("nightly_reservation_mismatch")
    else:
        if (
            plan.binding_digest != expected_binding
            or plan.reservation_key != reservation_record_key
        ):
            reasons.add("nightly_reservation_mismatch")
    if reservation_status not in ACCEPTED_RESERVATION_RESULTS:
        reasons.add("nightly_reservation_required")

    ordered = tuple(sorted(reasons))
    return QueueDecision(not ordered, ordered)


def _cryptographically_verified_subject(
    subject_path: Path,
    bundle_path: Path,
    trusted_source_commit_sha: str,
    *,
    runner: Callable[..., subprocess.CompletedProcess[str]],
) -> dict[str, Any]:
    if SHA_RE.fullmatch(trusted_source_commit_sha) is None:
        raise ValueError("trusted source commit SHA must be lowercase hex40")
    if not subject_path.is_file() or not bundle_path.is_file():
        raise ValueError("attestation subject and bundle are required")
    subject_bytes = subject_path.read_bytes()
    command = [
        "gh",
        "attestation",
        "verify",
        str(subject_path),
        "--bundle",
        str(bundle_path),
        "--repo",
        REPO,
        "--signer-workflow",
        SIGNER_WORKFLOW,
        "--source-digest",
        trusted_source_commit_sha,
        "--source-ref",
        "refs/heads/master",
        "--deny-self-hosted-runners",
        "--format",
        "json",
    ]
    result = runner(command, capture_output=True, text=True, check=False, timeout=60)
    if result.returncode != 0:
        raise ValueError("cryptographic attestation verification failed")
    if subject_path.read_bytes() != subject_bytes:
        raise ValueError("attestation subject changed during verification")
    try:
        verification = json.loads(result.stdout)
        subject = json.loads(subject_bytes)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError("attestation verification output is invalid") from exc
    if not isinstance(verification, list) or not verification or not isinstance(subject, dict):
        raise ValueError("attestation verification returned no trusted statement")
    return subject


def verify_and_evaluate_attestation(
    subject_path: Path,
    bundle_path: Path,
    trusted_source_commit_sha: str,
    *,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
    **live_facts: Any,
) -> QueueDecision:
    """Single activation entrypoint: crypto -> closed v2 semantics -> live facts."""
    subject = _cryptographically_verified_subject(
        subject_path,
        bundle_path,
        trusted_source_commit_sha,
        runner=runner,
    )
    return evaluate_verified_candidate(subject, **live_facts)
