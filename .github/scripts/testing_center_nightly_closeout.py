"""Pure fail-closed policy for the inert Testing Center Nightly closeout."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, Mapping


HEX_40 = re.compile(r"^[0-9a-f]{40}$")
HEX_64 = re.compile(r"^[0-9a-f]{64}$")
NIGHTLY_TAG = re.compile(
    r"^v[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+-nightly\.[1-9][0-9]*$"
)
CONTRACT_KEYS = {
    "contract_version",
    "event_name",
    "workflow_name",
    "workflow_conclusion",
    "workflow_branch",
    "job_key",
    "reviewed_head_sha",
    "merge_sha",
    "nightly_sha",
    "reservation_job_key",
    "reservation_merge_sha",
    "reserved_tag",
    "reservation_state",
    "state",
    "smoke",
    "release",
    "release_source_sha",
    "release_asset_count",
    "release_checksums_verified",
    "revert",
    "kill_switches_open",
}


@dataclass(frozen=True)
class CloseoutDecision:
    state: str
    next_effect: str | None
    keep_lock: bool
    tag_allowed: bool = False
    tag: str | None = None
    source_sha: str | None = None
    revert_branch: str | None = None


def _invalid(code: str) -> None:
    raise ValueError(code)


def _validate(event: Mapping[str, Any]) -> None:
    if set(event) != CONTRACT_KEYS:
        _invalid("nightly_closeout_contract_invalid")
    if (
        event["contract_version"] != "testing-center.nightly-closeout.v1"
        or event["event_name"] != "workflow_run"
        or event["workflow_name"] != "Branch channel gates"
        or event["workflow_conclusion"] != "success"
        or event["workflow_branch"] != "nightly"
    ):
        _invalid("nightly_closeout_workflow_run_invalid")
    if not HEX_64.fullmatch(str(event["job_key"])):
        _invalid("nightly_closeout_job_key_invalid")
    if not HEX_40.fullmatch(str(event["reviewed_head_sha"])):
        _invalid("nightly_closeout_reviewed_head_invalid")
    for name in ("merge_sha", "nightly_sha", "reservation_merge_sha"):
        if not HEX_40.fullmatch(str(event[name])):
            _invalid("nightly_closeout_merge_sha_invalid")
    if event["merge_sha"] != event["nightly_sha"]:
        _invalid("nightly_closeout_stale_nightly")
    if (
        event["reservation_job_key"] != event["job_key"]
        or event["reservation_merge_sha"] != event["merge_sha"]
        or event["reservation_state"] not in {"reserved", "confirmed"}
    ):
        _invalid("nightly_closeout_reservation_mismatch")
    if not NIGHTLY_TAG.fullmatch(str(event["reserved_tag"])):
        _invalid("nightly_closeout_reserved_tag_invalid")
    if event["kill_switches_open"] is not False:
        _invalid("nightly_closeout_kill_switch_open")
    if event["smoke"] not in {"pending", "success", "failure"}:
        _invalid("nightly_closeout_smoke_invalid")
    if event["release"] not in {"absent", "verified"}:
        _invalid("nightly_closeout_release_invalid")
    if event["revert"] not in {"absent", "open", "verified", "conflict"}:
        _invalid("nightly_closeout_revert_invalid")
    if (
        not isinstance(event["release_asset_count"], int)
        or isinstance(event["release_asset_count"], bool)
        or not isinstance(event["release_checksums_verified"], bool)
    ):
        _invalid("nightly_closeout_release_evidence_invalid")


def _require_verified_release(event: Mapping[str, Any]) -> None:
    if (
        event["release"] != "verified"
        or event["release_source_sha"] != event["merge_sha"]
        or event["release_asset_count"] != 6
        or event["release_checksums_verified"] is not True
    ):
        _invalid("nightly_closeout_release_evidence_invalid")


def decide_closeout(event: Mapping[str, Any]) -> CloseoutDecision:
    """Return the only legal next closeout effect from trusted live facts."""

    _validate(event)
    state = str(event["state"])
    job_key = str(event["job_key"])
    merge_sha = str(event["merge_sha"])
    tag = str(event["reserved_tag"])

    if state == "merged_nightly":
        if event["smoke"] != "pending" or event["release"] != "absent":
            _invalid("nightly_closeout_state_evidence_mismatch")
        return CloseoutDecision("smoke_running", "smoke", True)

    if state == "smoke_running":
        if event["release"] != "absent":
            _invalid("nightly_closeout_release_before_smoke")
        if event["smoke"] == "failure":
            return CloseoutDecision("smoke_failed", "revert_pr", True)
        if event["smoke"] == "success":
            return CloseoutDecision(
                "nightly_tagged",
                "release",
                True,
                tag_allowed=True,
                tag=tag,
                source_sha=merge_sha,
            )
        return CloseoutDecision("smoke_running", None, True)

    if state == "nightly_tagged":
        if event["smoke"] != "success":
            _invalid("nightly_closeout_release_before_smoke")
        _require_verified_release(event)
        return CloseoutDecision("completed", "callback", False)

    if state == "smoke_failed":
        if event["smoke"] != "failure" or event["release"] != "absent":
            _invalid("nightly_closeout_failed_smoke_evidence_invalid")
        return CloseoutDecision(
            "revert_pr_open",
            "revert_pr",
            True,
            revert_branch=f"vantareapp/tc-{job_key[:12]}-revert",
        )

    if state == "revert_pr_open":
        if event["smoke"] != "failure" or event["release"] != "absent":
            _invalid("nightly_closeout_revert_evidence_invalid")
        if event["revert"] == "verified":
            return CloseoutDecision("reverted", "callback", False)
        if event["revert"] == "conflict":
            return CloseoutDecision("needs_owner", None, True)
        return CloseoutDecision("revert_pr_open", None, True)

    if state == "completed":
        if event["smoke"] != "success":
            _invalid("nightly_closeout_completed_evidence_invalid")
        _require_verified_release(event)
        return CloseoutDecision("completed", None, False)

    if state == "reverted":
        if event["revert"] != "verified":
            _invalid("nightly_closeout_reverted_evidence_invalid")
        return CloseoutDecision("reverted", None, False)

    _invalid("nightly_closeout_state_invalid")
