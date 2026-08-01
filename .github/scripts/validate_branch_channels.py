#!/usr/bin/env python3
"""Fail closed when a promotion skips a Vantare release channel."""

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


def validate(event: str, ref: str, base: str, head: str) -> str:
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
    if base == "nightly" and not ISSUE_BRANCH.fullmatch(head):
        raise ValueError(
            "promotion to 'nightly' requires a Linear issue branch named "
            f"'vantareapp/isa-<number>-...', got {head!r}"
        )

    return f"promotion accepted: {head} -> {base}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--event", required=True)
    parser.add_argument("--ref", default="")
    parser.add_argument("--base", default="")
    parser.add_argument("--head", default="")
    args = parser.parse_args()

    try:
        result = validate(args.event, args.ref, args.base, args.head)
    except ValueError as exc:
        print(f"branch channel policy rejected: {exc}", file=sys.stderr)
        return 1

    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
