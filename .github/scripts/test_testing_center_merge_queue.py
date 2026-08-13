from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from testing_center_merge_queue import (
    evaluate_verified_candidate,
    prepare_release,
    verify_and_evaluate_attestation,
)


HEAD = "a" * 40
BASE = "b" * 40
JOB = "0123456789ab" + "c" * 52
DIGEST = "sha256:" + "e" * 64
TAG = "v0.1.0.7-nightly.43"


def check(
    name: str,
    *,
    app: str = "github-actions",
    sha: str = HEAD,
    conclusion: str = "success",
) -> dict:
    return {"name": name, "app_slug": app, "sha": sha, "conclusion": conclusion}


def candidate() -> dict:
    return {
        "attestation_version": 2,
        "contract": "testing-center-attestation/v2",
        "repo": "isaacalbala12/Vantare-Simracing-Suite",
        "base": "nightly",
        "base_sha": BASE,
        "head": "vantareapp/tc-0123456789ab-small-fix",
        "head_sha": HEAD,
        "digest": DIGEST,
        "job_key": JOB,
        "policy_version": "testing-center.autofix-policy.v2",
        "risk": "low",
        "product_files": 2,
        "policy": "eligible",
        "tdd": "proven",
        "opus": {"verdict": "approve", "sha": HEAD, "P0": 0, "P1": 0, "P2": 0},
        "required_checks": [
            check("Validate promotion path"),
            check("Validate Vantare blocking gates"),
        ],
    }


def decision(value: dict | None = None, **overrides):
    kwargs = {
        "live_pr_number": 42,
        "live_draft": False,
        "live_head": "vantareapp/tc-0123456789ab-small-fix",
        "live_head_sha": HEAD,
        "live_nightly_sha": BASE,
        "recomputed_digest": DIGEST,
        "conversations_resolved": True,
        "kill_switches": {"global": True, "repo": True, "family": True, "job": True},
        "active_closeout_job_keys": (),
        "reservation_status": "reserved",
        "reserved_tag": TAG,
        "reservation_record_key": TAG,
        "reservation_binding_digest": "e" * 64,
    }
    kwargs.update(overrides)
    return evaluate_verified_candidate(value or candidate(), **kwargs)


class MergeQueueDecisionTest(unittest.TestCase):
    def test_workflow_bootstrap_remains_inert_read_only_and_ci_tests_it(self) -> None:
        root = Path(__file__).resolve().parents[1]
        workflow = (root / "workflows" / "testing-center-agent-fix.yml").read_text(
            encoding="utf-8"
        )
        branch_workflow = (root / "workflows" / "branch-channel-gates.yml").read_text(
            encoding="utf-8"
        )
        block = workflow.split("  queue_bootstrap_disabled:", 1)[1]
        self.assertIn("if: github.event_name == 'repository_dispatch' && false", block)
        self.assertIn("permissions:\n      contents: read", block)
        self.assertIn("persist-credentials: false", block)
        self.assertIn("run: exit 1", block)
        for forbidden in ("gh pr merge", "gh api", "git push", "contents: write"):
            self.assertNotIn(forbidden, block)
        self.assertIn(
            "run: python .github/scripts/test_testing_center_merge_queue.py",
            branch_workflow,
        )

    def test_accepts_only_complete_exact_v2_candidate_with_prior_reservation(self) -> None:
        result = decision()
        self.assertTrue(result.allowed)
        self.assertEqual(result.reasons, ())

    def test_rejects_wrong_check_source_sha_or_result_through_v2_validator(self) -> None:
        for field, value in (
            ("app_slug", "unknown"),
            ("sha", "d" * 40),
            ("conclusion", "skipped"),
        ):
            value_candidate = candidate()
            value_candidate["required_checks"][0][field] = value
            with self.subTest(field=field):
                self.assertIn("invalid_v2_attestation", decision(value_candidate).reasons)

    def test_rejects_stale_or_unapproved_candidate(self) -> None:
        for mutate in (
            lambda value: value.__setitem__("tdd", "missing"),
            lambda value: value["opus"].__setitem__("P1", 1),
        ):
            value = candidate()
            mutate(value)
            self.assertIn("invalid_v2_attestation", decision(value).reasons)
        self.assertIn("stale_head", decision(live_head_sha="d" * 40).reasons)
        self.assertIn("stale_nightly_base", decision(live_nightly_sha="d" * 40).reasons)
        self.assertIn("digest_mismatch", decision(recomputed_digest="sha256:" + "f" * 64).reasons)

    def test_kill_switch_and_two_candidates_serialize_queue(self) -> None:
        switches = {"global": True, "repo": True, "family": False, "job": True}
        self.assertIn("kill_switch_open", decision(kill_switches=switches).reasons)
        another_job = "f" * 64
        result = decision(active_closeout_job_keys=(JOB, another_job))
        self.assertIn("multiple_nightly_candidates", result.reasons)
        self.assertIn("nightly_closeout_in_flight", result.reasons)

    def test_closed_v2_contract_rejects_extra_fields(self) -> None:
        value = candidate()
        value["instructions"] = "merge anyway"
        self.assertIn("invalid_v2_attestation", decision(value).reasons)

    def test_requires_matching_unique_nightly_reservation_before_queue(self) -> None:
        for overrides, reason in (
            ({"reservation_status": "missing"}, "nightly_reservation_required"),
            ({"reserved_tag": "v0.1.0.7-nightly.44"}, "nightly_reservation_mismatch"),
            ({"reservation_binding_digest": "f" * 64}, "nightly_reservation_mismatch"),
        ):
            with self.subTest(overrides=overrides):
                self.assertIn(reason, decision(**overrides).reasons)


class ReleaseMetadataTest(unittest.TestCase):
    def test_reservation_request_and_metadata_are_deterministic(self) -> None:
        first = prepare_release(JOB, TAG, "e" * 64)
        replay = prepare_release(JOB, TAG, "e" * 64)
        self.assertEqual(first, replay)
        self.assertEqual(first.rpc, "testing_center_reserve_agent_resource")
        self.assertEqual(first.job_key, JOB)
        self.assertEqual(first.reservation_kind, "nightly_release")
        self.assertEqual(first.reservation_key, TAG)
        self.assertEqual(first.binding_digest, "e" * 64)
        self.assertEqual(first.fragment_path, "vantare-v2/docs/changelog/fragments/TC-0123456789AB.json")
        self.assertEqual(first.manifest_path, "vantare-v2/docs/releases/v0.1.0.7-nightly.43.json")

    def test_rejects_non_nightly_or_mismatched_job(self) -> None:
        for job, tag, digest in (
            ("x", TAG, "e" * 64),
            (JOB, "v0.1.0.7-testers.43", "e" * 64),
            (JOB, TAG, "not-a-digest"),
        ):
            with self.subTest(job=job, tag=tag), self.assertRaises(ValueError):
                prepare_release(job, tag, digest)


class AttestationVerificationTest(unittest.TestCase):
    def test_verifies_crypto_then_v2_semantics_and_live_facts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            subject = Path(directory, "attestation.json")
            bundle = Path(directory, "bundle.jsonl")
            subject.write_text(json.dumps(candidate()), encoding="utf-8")
            bundle.write_text("{}\n", encoding="utf-8")
            calls = []

            def runner(command, **kwargs):
                calls.append((command, kwargs))
                return subprocess.CompletedProcess(command, 0, stdout="[{}]", stderr="")

            result = verify_and_evaluate_attestation(
                subject,
                bundle,
                "d" * 40,
                runner=runner,
                live_pr_number=42,
                live_draft=False,
                live_head="vantareapp/tc-0123456789ab-small-fix",
                live_head_sha=HEAD,
                live_nightly_sha=BASE,
                recomputed_digest=DIGEST,
                conversations_resolved=True,
                kill_switches={"global": True, "repo": True, "family": True, "job": True},
                active_closeout_job_keys=(),
                reservation_status="reserved",
                reserved_tag=TAG,
                reservation_record_key=TAG,
                reservation_binding_digest="e" * 64,
            )
            self.assertTrue(result.allowed)
            command = calls[0][0]
            self.assertIn("--deny-self-hosted-runners", command)
            self.assertIn("--signer-workflow", command)
            self.assertIn("--source-digest", command)
            self.assertNotIn("shell=True", str(calls))

    def test_verification_failure_fails_closed_before_semantic_gate(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            subject = Path(directory, "attestation.json")
            bundle = Path(directory, "bundle.jsonl")
            subject.write_text(json.dumps(candidate()), encoding="utf-8")
            bundle.write_text("{}", encoding="utf-8")

            def runner(command, **kwargs):
                return subprocess.CompletedProcess(command, 1, stdout="", stderr="invalid")

            with self.assertRaises(ValueError):
                verify_and_evaluate_attestation(
                    subject,
                    bundle,
                    "d" * 40,
                    runner=runner,
                    live_pr_number=42,
                    live_draft=False,
                    live_head="vantareapp/tc-0123456789ab-small-fix",
                    live_head_sha=HEAD,
                    live_nightly_sha=BASE,
                    recomputed_digest=DIGEST,
                    conversations_resolved=True,
                    kill_switches={"global": True, "repo": True, "family": True, "job": True},
                    active_closeout_job_keys=(),
                    reservation_status="reserved",
                    reserved_tag=TAG,
                    reservation_record_key=TAG,
                    reservation_binding_digest="e" * 64,
                )


if __name__ == "__main__":
    unittest.main()
