#!/usr/bin/env python3
"""Fail closed when a promotion skips a Vantare release channel.

Also recognizes the inert Testing Center automatic fix branch and validates its
closed v2 attestation. The automatic route is never activated here: the CLI
never takes arbitrary JSON and therefore rejects automatic branches until a
trusted workflow supplies the verified attestation in-process.
"""

from __future__ import annotations

import argparse
import re
import sys


ALLOWED_PUSH_REFS = {"refs/heads/nightly", "refs/heads/testers"}
ALLOWED_PULL_REQUESTS = {
    "nightly": None,
    "testers": "nightly",
    "master": "testers",
}
ISSUE_BRANCH = re.compile(r"^vantareapp/isa-[1-9][0-9]*(?:-[a-z0-9]+)*$")
HOTFIX_BRANCH = re.compile(
    r"^vantareapp/hotfix-isa-[1-9][0-9]*(?:-[a-z0-9]+)*$"
)
TC_PREFIX = "vantareapp/tc-"
TC_HEX = re.compile(r"[0-9a-f]{12}")
TC_SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")

TC_REPO = "isaacalbala12/Vantare-Simracing-Suite"
TC_ATTESTATION_CONTRACT = "testing-center-attestation/v2"
EXPECTED_CHECK_APP_SLUG = "github-actions"
EXPECTED_REQUIRED_CHECKS = {
    "Validate promotion path",
    "Validate Vantare blocking gates",
}
MAX_PRODUCT_FILES = 5


def _is_tc_branch(head: str) -> bool:
    """Match exactly vantareapp/tc-<12 lowercase hex>-<safe slug>[-revert].

    ``-revert`` is a reserved terminal marker: it may only appear as the final
    token of the slug. A slug that contains ``-revert`` elsewhere is rejected
    so the marker is never ambiguous.
    """
    if not head.startswith(TC_PREFIX):
        return False
    rest = head[len(TC_PREFIX):]
    hex_part, separator, slug = rest.partition("-")
    if not separator or not TC_HEX.fullmatch(hex_part):
        return False
    tokens = slug.split("-")
    if "revert" in tokens:
        if tokens[-1] != "revert" or tokens.count("revert") != 1:
            return False
        slug_without_revert = "-".join(tokens[:-1])
    else:
        slug_without_revert = slug
    return bool(slug_without_revert) and TC_SLUG.fullmatch(slug_without_revert) is not None


def validate(
    event: str,
    ref: str,
    base: str,
    head: str,
    *,
    tc_attestation: object | None = None,
) -> str:
    if event == "push":
        if ref not in ALLOWED_PUSH_REFS:
            raise ValueError(f"push ref {ref!r} is not a channel branch")
        return f"channel push accepted: {ref.removeprefix('refs/heads/')}"

    if event != "pull_request":
        raise ValueError(f"unsupported event {event!r}")
    if base not in ALLOWED_PULL_REQUESTS:
        raise ValueError(f"unsupported promotion target {base!r}")

    if base == "master" and HOTFIX_BRANCH.fullmatch(head):
        return f"emergency hotfix accepted: {head} -> master"

    required_head = ALLOWED_PULL_REQUESTS[base]
    if required_head is not None and head != required_head:
        raise ValueError(
            f"promotion to {base!r} must come from {required_head!r}, got {head!r}"
        )
    if base == "nightly":
        if _is_tc_branch(head):
            if tc_attestation is None:
                raise ValueError("trusted attestation required for automatic branch")
            validate_tc_attestation(tc_attestation, expected_head=head)
            return f"tc preauthorization accepted: {head} -> nightly"
        if tc_attestation is not None:
            raise ValueError("automatic attestation supplied for a non-automatic branch")
        if not ISSUE_BRANCH.fullmatch(head):
            raise ValueError(
                "promotion to 'nightly' requires a Linear issue branch named "
                f"'vantareapp/isa-<number>-...', got {head!r}"
            )

    return f"promotion accepted: {head} -> {base}"


def validate_tc_attestation(
    attestation: object,
    *,
    expected_head: str | None = None,
) -> str:
    """Validate the closed v2 attestation without side effects.

    This function validates semantic claims only. ISA-322 must verify the
    cryptographic provenance before passing those claims to ``validate``;
    verifier markers inside the untrusted payload are rejected as extra data.
    Any missing, malformed, extra or different field rejects the attestation.
    """
    if not isinstance(attestation, dict):
        raise ValueError("attestation must be a JSON object")
    keys = {
        "attestation_version",
        "contract",
        "repo",
        "base",
        "base_sha",
        "head",
        "head_sha",
        "digest",
        "job_key",
        "policy_version",
        "risk",
        "product_files",
        "policy",
        "tdd",
        "opus",
        "required_checks",
    }
    if set(attestation) != keys:
        raise ValueError("attestation has missing or unknown fields")
    if attestation["attestation_version"] != 2:
        raise ValueError("unsupported attestation version")
    if attestation["contract"] != TC_ATTESTATION_CONTRACT:
        raise ValueError("unsupported attestation contract")
    if attestation["repo"] != TC_REPO:
        raise ValueError("attestation repo mismatch")
    if attestation["base"] != "nightly":
        raise ValueError("attestation base must be 'nightly'")
    base_sha = attestation["base_sha"]
    if not isinstance(base_sha, str) or re.fullmatch(r"[0-9a-f]{40}", base_sha) is None:
        raise ValueError("attestation base_sha must be lowercase hex40")
    head = attestation["head"]
    if not _is_tc_branch(head):
        raise ValueError("attestation head is not an automatic tc branch")
    if expected_head is not None and head != expected_head:
        raise ValueError("attestation head mismatch")
    head_sha = attestation["head_sha"]
    if not isinstance(head_sha, str) or re.fullmatch(r"[0-9a-f]{40}", head_sha) is None:
        raise ValueError("attestation head_sha must be lowercase hex40")
    digest = attestation["digest"]
    if not isinstance(digest, str) or re.fullmatch(r"sha256:[0-9a-f]{64}", digest) is None:
        raise ValueError("attestation digest must be sha256 hex64")
    job_key = attestation["job_key"]
    if not isinstance(job_key, str) or re.fullmatch(r"[0-9a-f]{64}", job_key) is None:
        raise ValueError("attestation job_key must be lowercase hex64")
    branch_identifier = head.removeprefix(TC_PREFIX).partition("-")[0]
    if job_key[:12] != branch_identifier:
        raise ValueError("attestation job_key does not match the branch identifier")
    if attestation["policy_version"] != "testing-center.autofix-policy.v2":
        raise ValueError("attestation policy_version mismatch")
    if attestation["risk"] != "low":
        raise ValueError("attestation risk must be 'low'")
    product_files = attestation["product_files"]
    if (
        isinstance(product_files, bool)
        or not isinstance(product_files, int)
        or not 0 <= product_files <= MAX_PRODUCT_FILES
    ):
        raise ValueError("attestation product_files must be an integer in 0..5")
    if attestation["policy"] != "eligible":
        raise ValueError("attestation policy must be 'eligible'")
    if attestation["tdd"] != "proven":
        raise ValueError("attestation tdd must be 'proven'")
    opus = attestation["opus"]
    if not isinstance(opus, dict) or set(opus) != {
        "verdict",
        "sha",
        "P0",
        "P1",
        "P2",
    }:
        raise ValueError("attestation opus must be a closed review")
    if (
        opus["verdict"] != "approve"
        or opus["sha"] != head_sha
        or any(type(opus[level]) is not int or opus[level] != 0 for level in ("P0", "P1", "P2"))
    ):
        raise ValueError("attestation opus must approve this SHA with P0=P1=P2=0")
    checks = attestation["required_checks"]
    if not isinstance(checks, list) or len(checks) != len(EXPECTED_REQUIRED_CHECKS):
        raise ValueError("attestation required_checks must contain the exact required set")
    check_names: set[str] = set()
    for index, check in enumerate(checks):
        if not isinstance(check, dict) or set(check) != {
            "name",
            "sha",
            "app_slug",
            "conclusion",
        }:
            raise ValueError(f"required_checks[{index}] has missing or unknown fields")
        if check["sha"] != head_sha:
            raise ValueError(f"required_checks[{index}] sha does not match head_sha")
        if check["app_slug"] != EXPECTED_CHECK_APP_SLUG:
            raise ValueError(f"required_checks[{index}] app is not expected")
        if check["conclusion"] != "success":
            raise ValueError(f"required_checks[{index}] did not succeed")
        name = check["name"]
        if name not in EXPECTED_REQUIRED_CHECKS or name in check_names:
            raise ValueError(f"required_checks[{index}] name is missing, unexpected or duplicate")
        check_names.add(name)
    if check_names != EXPECTED_REQUIRED_CHECKS:
        raise ValueError("attestation required_checks set mismatch")

    return f"tc preauthorization attestation accepted: {head} -> nightly"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--event", required=True)
    parser.add_argument("--ref", default="")
    parser.add_argument("--base", default="")
    parser.add_argument("--head", default="")
    args = parser.parse_args(argv)

    try:
        result = validate(args.event, args.ref, args.base, args.head)
    except ValueError as exc:
        print(f"branch channel policy rejected: {exc}", file=sys.stderr)
        return 1

    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
