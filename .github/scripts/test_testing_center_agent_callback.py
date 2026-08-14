import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from testing_center_agent_callback import build_callback, callback_url_allowed


JOB = "a" * 64
HEAD = "b" * 40
REVIEWED = "c" * 40
TAG = "v0.1.0.7-nightly.43"


class AgentCallbackBuilderTest(unittest.TestCase):
    def test_builds_deterministic_closed_closeout_sequence(self):
        first = build_callback(
            delivery_id=f"run-123:{JOB}:merged_nightly",
            job_key=JOB,
            phase="merged_nightly",
            head_sha=HEAD,
            reviewed_head_sha=REVIEWED,
            workflow_sha=HEAD,
            fencing_token=123,
            run_id=123,
            release_tag=TAG,
        )
        second = build_callback(
            delivery_id=f"run-123:{JOB}:merged_nightly",
            job_key=JOB,
            phase="merged_nightly",
            head_sha=HEAD,
            reviewed_head_sha=REVIEWED,
            workflow_sha=HEAD,
            fencing_token=123,
            run_id=123,
            release_tag=TAG,
        )
        self.assertEqual(first, second)
        self.assertRegex(first["payloadDigest"], r"^[0-9a-f]{64}$")
        self.assertEqual(set(first), {
            "contractVersion", "deliveryId", "jobKey", "phase", "headSha",
            "reviewedHeadSha", "workflowSha", "payloadDigest", "fencingToken",
            "runId", "evidence", "result",
        })
        json.dumps(first, separators=(",", ":"), sort_keys=True)

    def test_completed_requires_exact_six_asset_release_evidence(self):
        complete = build_callback(
            delivery_id=f"run-123:{JOB}:completed",
            job_key=JOB,
            phase="completed",
            head_sha=HEAD,
            reviewed_head_sha=REVIEWED,
            workflow_sha=HEAD,
            fencing_token=123,
            run_id=123,
            release_tag=TAG,
            release_verified=True,
            release_source_sha=HEAD,
            release_asset_count=6,
            checksums_verified=True,
        )
        self.assertTrue(complete["evidence"]["releaseVerified"])
        with self.assertRaises(ValueError):
            build_callback(
                delivery_id=f"run-123:{JOB}:completed",
                job_key=JOB,
                phase="completed",
                head_sha=HEAD,
                reviewed_head_sha=REVIEWED,
                workflow_sha=HEAD,
                fencing_token=123,
                run_id=123,
                release_tag="nightly/2026-08-13.1",
                release_verified=True,
                release_source_sha=HEAD,
                release_asset_count=6,
                checksums_verified=True,
            )
        with self.assertRaises(ValueError):
            build_callback(
                delivery_id=f"run-123:{JOB}:completed",
                job_key=JOB,
                phase="completed",
                head_sha=HEAD,
                reviewed_head_sha=REVIEWED,
                workflow_sha=HEAD,
                fencing_token=123,
                run_id=123,
                release_tag="v0.1.0.7-nightly.43",
                release_verified=True,
                release_source_sha=HEAD,
                release_asset_count=5,
                checksums_verified=True,
            )

    def test_rejects_self_declared_closeout_fence_and_early_release(self):
        with self.assertRaises(ValueError):
            build_callback(
                delivery_id=f"run-123:{JOB}:merged_nightly",
                job_key=JOB,
                phase="merged_nightly",
                head_sha=HEAD,
                reviewed_head_sha=REVIEWED,
                workflow_sha=HEAD,
                fencing_token=122,
                run_id=123,
                release_tag=TAG,
            )

    def test_reverted_can_use_the_server_bound_original_closeout_fence(self):
        value = build_callback(
            delivery_id=f"run-456:{JOB}:reverted",
            job_key=JOB,
            phase="reverted",
            head_sha=HEAD,
            reviewed_head_sha=REVIEWED,
            workflow_sha=HEAD,
            fencing_token=123,
            run_id=456,
            release_tag=TAG,
        )
        self.assertEqual(value["fencingToken"], 123)
        self.assertEqual(value["runId"], 456)
        failed = build_callback(
            delivery_id=f"run-456:{JOB}:closeout_failed",
            job_key=JOB,
            phase="closeout_failed",
            head_sha=HEAD,
            reviewed_head_sha=REVIEWED,
            workflow_sha=HEAD,
            fencing_token=123,
            run_id=456,
            release_tag=TAG,
        )
        self.assertEqual(failed["phase"], "closeout_failed")

    def test_closeout_requires_reserved_tag_before_publication(self):
        with self.assertRaises(ValueError):
            build_callback(
                delivery_id=f"run-123:{JOB}:merged_nightly",
                job_key=JOB,
                phase="merged_nightly",
                head_sha=HEAD,
                reviewed_head_sha=REVIEWED,
                workflow_sha=HEAD,
                fencing_token=123,
                run_id=123,
            )

    def test_callback_url_is_https_exact_supabase_edge_function(self):
        self.assertTrue(callback_url_allowed(
            "https://project-ref.supabase.co/functions/v1/testing-center-agent-callback"
        ))
        for invalid in (
            "http://project-ref.supabase.co/functions/v1/testing-center-agent-callback",
            "https://evil.example/functions/v1/testing-center-agent-callback",
            "https://project-ref.supabase.co/functions/v1/testing-center-agent-callback?token=x",
            "https://user@project-ref.supabase.co/functions/v1/testing-center-agent-callback",
        ):
            self.assertFalse(callback_url_allowed(invalid))

    def test_cli_builds_the_same_body_inside_one_runner(self):
        script = Path(__file__).with_name("testing_center_agent_callback.py")
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory, "body.json")
            subprocess.run([
                sys.executable, str(script), "build",
                "--delivery-id", f"run-123:{JOB}:smoke_running",
                "--job-key", JOB, "--phase", "smoke_running",
                "--head-sha", HEAD, "--reviewed-head-sha", REVIEWED,
                "--workflow-sha", HEAD, "--fencing-token", "123",
                "--run-id", "123", "--release-tag", TAG,
                "--output", str(output),
            ], check=True)
            self.assertEqual(json.loads(output.read_text())["phase"], "smoke_running")


if __name__ == "__main__":
    unittest.main()
