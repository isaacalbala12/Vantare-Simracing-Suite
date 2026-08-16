#!/usr/bin/env python3
"""Closed callback body builder shared by inert Testing Center workflows."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlsplit


HEX_40 = re.compile(r"^[0-9a-f]{40}$")
HEX_64 = re.compile(r"^[0-9a-f]{64}$")
TAG = re.compile(r"^v[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+-nightly\.[1-9][0-9]*$")
DELIVERY = re.compile(r"^[a-z0-9][a-z0-9:._-]{0,255}$")
CLOSEOUT_PHASES = {
    "merged_nightly",
    "smoke_running",
    "nightly_tagged",
    "completed",
    "smoke_failed",
    "revert_pr_open",
    "reverted",
    "closeout_failed",
}
EARLY_PHASES = {
    "triaged",
    "red_verified",
    "green_running",
    "diff_verified",
    "review_approved",
    "ci_running",
    "merge_queued",
}


def callback_url_allowed(value: str) -> bool:
    try:
        parsed = urlsplit(value)
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and parsed.username is None
        and parsed.password is None
        and parsed.port is None
        and parsed.query == ""
        and parsed.fragment == ""
        and parsed.hostname is not None
        and re.fullmatch(r"[a-z0-9-]+\.supabase\.co", parsed.hostname) is not None
        and parsed.path == "/functions/v1/testing-center-agent-callback"
    )


def _digest(value: Mapping[str, Any]) -> str:
    unsigned = dict(value)
    unsigned.pop("payloadDigest", None)
    canonical = json.dumps(
        unsigned,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def build_callback(
    *,
    delivery_id: str,
    job_key: str,
    phase: str,
    head_sha: str,
    reviewed_head_sha: str | None,
    workflow_sha: str,
    fencing_token: int,
    run_id: int,
    result: Any = None,
    release_tag: str | None = None,
    release_verified: bool = False,
    release_source_sha: str | None = None,
    release_asset_count: int = 0,
    checksums_verified: bool = False,
) -> dict[str, Any]:
    closeout = phase in CLOSEOUT_PHASES
    if (
        not DELIVERY.fullmatch(delivery_id)
        or not HEX_64.fullmatch(job_key)
        or phase not in EARLY_PHASES | CLOSEOUT_PHASES
        or not HEX_40.fullmatch(head_sha)
        or not HEX_40.fullmatch(workflow_sha)
        or (closeout and (reviewed_head_sha is None or not HEX_40.fullmatch(reviewed_head_sha)))
        or (not closeout and reviewed_head_sha is not None)
        or not isinstance(fencing_token, int)
        or isinstance(fencing_token, bool)
        or fencing_token < 1
        or not isinstance(run_id, int)
        or isinstance(run_id, bool)
        or run_id < 1
        or (closeout and (release_tag is None or not TAG.fullmatch(release_tag)))
        or (not closeout and release_tag is not None)
        or (closeout and phase not in {"reverted", "closeout_failed"} and fencing_token != run_id)
        or (phase != "triaged" and result is not None)
    ):
        raise ValueError("testing_center_agent_callback_invalid")
    completed = phase == "completed"
    if completed:
        if (
            not release_verified
            or release_source_sha != head_sha
            or release_asset_count != 6
            or not checksums_verified
        ):
            raise ValueError("testing_center_agent_release_evidence_invalid")
    elif any(
        (
            release_verified,
            release_source_sha is not None,
            release_asset_count != 0,
            checksums_verified,
        )
    ):
        raise ValueError("testing_center_agent_early_release_evidence")
    value: dict[str, Any] = {
        "contractVersion": "testing-center.agent-callback.v1",
        "deliveryId": delivery_id,
        "jobKey": job_key,
        "phase": phase,
        "headSha": head_sha,
        "reviewedHeadSha": reviewed_head_sha,
        "workflowSha": workflow_sha,
        "payloadDigest": "",
        "fencingToken": fencing_token,
        "runId": run_id,
        "evidence": {
            "releaseVerified": release_verified,
            "releaseTag": release_tag,
            "releaseSourceSha": release_source_sha,
            "releaseAssetCount": release_asset_count,
            "checksumsVerified": checksums_verified,
        },
        "result": result,
    }
    value["payloadDigest"] = _digest(value)
    return value


def _main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    url_parser = subparsers.add_parser("validate-url")
    url_parser.add_argument("value")
    build_parser = subparsers.add_parser("build")
    build_parser.add_argument("--delivery-id", required=True)
    build_parser.add_argument("--job-key", required=True)
    build_parser.add_argument("--phase", required=True)
    build_parser.add_argument("--head-sha", required=True)
    build_parser.add_argument("--reviewed-head-sha")
    build_parser.add_argument("--workflow-sha", required=True)
    build_parser.add_argument("--fencing-token", type=int, required=True)
    build_parser.add_argument("--run-id", type=int, required=True)
    build_parser.add_argument("--result-file")
    build_parser.add_argument("--release-tag")
    build_parser.add_argument("--release-verified", action="store_true")
    build_parser.add_argument("--release-source-sha")
    build_parser.add_argument("--release-asset-count", type=int, default=0)
    build_parser.add_argument("--checksums-verified", action="store_true")
    build_parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.command == "validate-url":
        return 0 if callback_url_allowed(args.value) else 1
    result = None
    if args.result_file:
        result = json.loads(Path(args.result_file).read_text(encoding="utf-8"))
    callback = build_callback(
        delivery_id=args.delivery_id,
        job_key=args.job_key,
        phase=args.phase,
        head_sha=args.head_sha,
        reviewed_head_sha=args.reviewed_head_sha,
        workflow_sha=args.workflow_sha,
        fencing_token=args.fencing_token,
        run_id=args.run_id,
        result=result,
        release_tag=args.release_tag,
        release_verified=args.release_verified,
        release_source_sha=args.release_source_sha,
        release_asset_count=args.release_asset_count,
        checksums_verified=args.checksums_verified,
    )
    Path(args.output).write_text(
        json.dumps(callback, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
