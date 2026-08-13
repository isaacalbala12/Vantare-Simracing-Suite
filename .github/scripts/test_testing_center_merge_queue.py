from __future__ import annotations

import copy
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from testing_center_merge_queue import (
    VerifiedAttestation,
    may_enqueue,
    prepare_release,
    verify_signed_attestation,
)


HEAD = "a" * 40
BASE = "b" * 40
JOB = "0123456789ab" + "c" * 52


def check(name: str, *, app: str = "github-actions", sha: str = HEAD, conclusion: str = "success") -> dict:
    return {"name": name, "app_slug": app, "sha": sha, "conclusion": conclusion}


def candidate() -> dict:
    return {
        "contract": "testing-center-merge-queue/v1",
        "repo": "isaacalbala12/Vantare-Simracing-Suite",
        "pr_number": 42,
        "draft": False,
        "base": "nightly",
        "base_sha": BASE,
        "head": "vantareapp/tc-0123456789ab-small-fix",
        "head_sha": HEAD,
        "job_key": JOB,
        "digest": "sha256:" + "e" * 64,
        "conversations_resolved": True,
        "diff_approved": True,
        "opus_approved": True,
        "kill_switches": {"global": True, "repo": True, "family": True, "job": True},
        "checks": [
            check("Validate promotion path"),
            check("Validate Vantare blocking gates"),
        ],
    }


def decision(value: dict | None = None, **kwargs):
    return may_enqueue(
        VerifiedAttestation(value or candidate()),
        live_head_sha=kwargs.pop("live_head_sha", HEAD),
        live_nightly_sha=kwargs.pop("live_nightly_sha", BASE),
        recomputed_digest=kwargs.pop("recomputed_digest", "sha256:" + "e" * 64),
        **kwargs,
    )


class MergeQueueDecisionTest(unittest.TestCase):
    def test_workflow_bootstrap_remains_inert_without_merge_command(self) -> None:
        workflow = (
            Path(__file__).resolve().parents[1]
            / "workflows"
            / "testing-center-agent-fix.yml"
        ).read_text(encoding="utf-8")
        self.assertIn("queue_bootstrap_disabled:", workflow)
        self.assertIn("python .github/scripts/test_testing_center_merge_queue.py", workflow)
        self.assertNotIn("gh pr merge --auto", workflow)

    def test_accepts_only_complete_exact_candidate(self) -> None:
        result = decision()
        self.assertTrue(result.allowed)
        self.assertEqual(result.reasons, ())

    def test_rejects_wrong_check_source_sha_or_result(self) -> None:
        for field, value, reason in (
            ("app_slug", "unknown", "required_check_source_mismatch"),
            ("sha", "d" * 40, "required_check_sha_mismatch"),
            ("conclusion", "skipped", "required_check_not_successful"),
        ):
            value_candidate = candidate()
            value_candidate["checks"][0][field] = value
            with self.subTest(field=field):
                self.assertIn(reason, decision(value_candidate).reasons)

    def test_rejects_stale_or_unverified_candidate(self) -> None:
        for field in (
            "conversations_resolved", "diff_approved", "opus_approved",
        ):
            value = candidate()
            value[field] = False
            with self.subTest(field=field):
                self.assertFalse(decision(value).allowed)
        self.assertIn("stale_head", decision(live_head_sha="d" * 40).reasons)
        self.assertIn("stale_nightly_base", decision(live_nightly_sha="d" * 40).reasons)
        self.assertIn("digest_mismatch", decision(recomputed_digest="sha256:" + "f" * 64).reasons)

    def test_kill_switch_and_closeout_serialize_queue(self) -> None:
        value = candidate()
        value["kill_switches"]["family"] = False
        self.assertIn("kill_switch_open", decision(value).reasons)
        self.assertIn(
            "nightly_closeout_in_flight",
            decision(active_closeout="another-job").reasons,
        )

    def test_closed_contract_rejects_extra_fields(self) -> None:
        value = candidate()
        value["instructions"] = "merge anyway"
        self.assertIn("invalid_candidate_contract", decision(value).reasons)


class ReleaseMetadataTest(unittest.TestCase):
    def test_reservation_and_metadata_are_deterministic(self) -> None:
        first = prepare_release(JOB, "v0.1.0.7-nightly.43")
        replay = prepare_release(JOB, "v0.1.0.7-nightly.43")
        self.assertEqual(first, replay)
        self.assertEqual(first.fragment_path, "vantare-v2/docs/changelog/fragments/TC-0123456789AB.json")
        self.assertEqual(first.manifest_path, "vantare-v2/docs/releases/v0.1.0.7-nightly.43.json")

    def test_rejects_non_nightly_or_mismatched_job(self) -> None:
        for job, tag in (("x", "v0.1.0.7-nightly.43"), (JOB, "v0.1.0.7-testers.43")):
            with self.subTest(job=job, tag=tag), self.assertRaises(ValueError):
                prepare_release(job, tag)


class AttestationVerificationTest(unittest.TestCase):
    def test_invokes_gh_with_closed_identity_and_returns_subject(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            subject = Path(directory, "attestation.json")
            bundle = Path(directory, "bundle.jsonl")
            subject.write_text(json.dumps({"head_sha": HEAD}), encoding="utf-8")
            bundle.write_text("{}\n", encoding="utf-8")
            calls = []

            def runner(command, **kwargs):
                calls.append((command, kwargs))
                return subprocess.CompletedProcess(command, 0, stdout="[{}]", stderr="")

            verified = verify_signed_attestation(subject, bundle, "d" * 40, runner=runner)
            self.assertEqual(verified.subject, {"head_sha": HEAD})
            command = calls[0][0]
            self.assertIn("--deny-self-hosted-runners", command)
            self.assertIn("--signer-workflow", command)
            self.assertIn("--source-digest", command)
            self.assertNotIn("shell=True", str(calls))

    def test_verification_failure_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            subject = Path(directory, "attestation.json")
            bundle = Path(directory, "bundle.jsonl")
            subject.write_text("{}", encoding="utf-8")
            bundle.write_text("{}", encoding="utf-8")

            def runner(command, **kwargs):
                return subprocess.CompletedProcess(command, 1, stdout="", stderr="invalid")

            with self.assertRaises(ValueError):
                verify_signed_attestation(subject, bundle, "d" * 40, runner=runner)


if __name__ == "__main__":
    unittest.main()
