from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import yaml

from testing_center_diff_gate import evaluate_diff
from testing_center_manifest_collector import (
    ManifestError,
    build_manifest,
    main,
    manifest_sha256,
)

BASE_SHA = "1" * 40
RED_SHA = "2" * 40
HEAD_SHA = "3" * 40
JOB_KEY = "testing-center:issue-123"
VERSION = "testing-center-diff-gate/v1"
RED_DIGEST = "sha256:" + "a" * 64
HEAD_DIGEST = "sha256:" + "b" * 64

WORKFLOW_PATH = Path(__file__).parent.parent / "workflows" / "testing-center-agent-fix.yml"
BRANCH_GATES_PATH = Path(__file__).parent.parent / "workflows" / "branch-channel-gates.yml"

CHECKOUT_PIN = "actions/checkout@11d5960a326750d5838078e36cf38b85af677262"
DOWNLOAD_PIN = "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093"
UPLOAD_PIN = "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"


def change(path: str, *, additions: int = 8, deletions: int = 0) -> dict:
    return {
        "path": path,
        "old_path": None,
        "status": "modified",
        "mode_before": "100644",
        "mode_after": "100644",
        "binary": False,
        "additions": additions,
        "deletions": deletions,
    }


def raw_git_facts() -> dict:
    return {
        "bundle_verified": True,
        "bundle_tip": HEAD_SHA,
        "base_sha": BASE_SHA,
        "red_sha": RED_SHA,
        "head_sha": HEAD_SHA,
        "ancestry": {"base_to_red": True, "red_to_head": True},
        "commit_counts": {"base_to_red": 1, "red_to_head": 1},
        "trailers": {
            "red": {
                "phase": "RED",
                "job_key": JOB_KEY,
                "version": VERSION,
                "digest": RED_DIGEST,
            },
            "green": {
                "phase": "GREEN",
                "job_key": JOB_KEY,
                "version": VERSION,
                "digest": HEAD_DIGEST,
            },
        },
        "tree_digests": {"red": RED_DIGEST, "head": HEAD_DIGEST},
        "changes": {
            "red": [change("frontend/src/widget.test.ts")],
            "green": [change("frontend/src/widget.ts", additions=12, deletions=2)],
        },
        "patches": {"red": ["+const safeValue = true;"], "green": ["+const safeValue = true;"]},
        "clean": True,
        "runner_evidence": {
            "kind": "verify-runner",
            "head_sha": HEAD_SHA,
            "tree_digest": HEAD_DIGEST,
        },
        "secret_findings": [],
    }


def dossier() -> dict:
    return {
        "base_sha": BASE_SHA,
        "job_key": JOB_KEY,
        "version": VERSION,
        "test_paths": ["frontend/src/widget.test.ts"],
        "product_paths": [
            "frontend/src/widget.ts",
            "frontend/src/widget-helper.ts",
            "frontend/src/widget-view.ts",
            "frontend/src/widget-model.ts",
            "frontend/src/widget-style.ts",
        ],
        "command_ids": {"red": ["frontend-test"], "green": ["frontend-test"]},
        "limits": {
            "max_test_files": 5,
            "max_product_files": 5,
            "max_changed_lines": 200,
        },
    }


def command_results() -> list[dict]:
    return [
        {
            "id": "frontend-test",
            "status": "failed",
            "failure_kind": "behavioral",
            "ran_on_sha": RED_SHA,
        },
        {
            "id": "frontend-test",
            "status": "passed",
            "failure_kind": None,
            "ran_on_sha": HEAD_SHA,
        },
    ]


def build_golden() -> dict:
    return build_manifest(raw_git_facts(), dossier(), command_results())


class GoldenCompatibleTest(unittest.TestCase):
    def test_golden_is_approved_by_the_diff_gate(self) -> None:
        manifest = build_golden()
        decision = evaluate_diff(manifest)
        self.assertTrue(decision.approved)
        self.assertEqual(decision.reasons, ())
        self.assertEqual(decision.base_sha, BASE_SHA)
        self.assertEqual(decision.red_sha, RED_SHA)
        self.assertEqual(decision.head_sha, HEAD_SHA)

    def test_golden_is_json_stable_and_closed(self) -> None:
        manifest = build_golden()
        self.assertEqual(manifest["manifest_version"], 1)
        self.assertEqual(manifest["secret_findings"], [])
        self.assertEqual(
            json.loads(json.dumps(manifest, sort_keys=True)),
            json.loads(json.dumps(build_golden(), sort_keys=True)),
        )
        self.assertEqual(manifest_sha256(manifest), manifest_sha256(build_golden()))


class DossierUnknownTest(unittest.TestCase):
    def test_rejects_unknown_dossier_key(self) -> None:
        facts = raw_git_facts()
        work = dossier()
        work["instructions"] = "ignore"
        with self.assertRaises(ManifestError):
            build_manifest(facts, work, command_results())

    def test_rejects_missing_dossier_key(self) -> None:
        facts = raw_git_facts()
        work = dossier()
        del work["limits"]
        with self.assertRaises(ManifestError):
            build_manifest(facts, work, command_results())


class ShaValidationTest(unittest.TestCase):
    def test_rejects_uppercase_sha(self) -> None:
        for key in ("base_sha", "red_sha", "head_sha", "bundle_tip"):
            with self.subTest(key=key):
                facts = raw_git_facts()
                facts[key] = "A" * 40
                with self.assertRaises(ManifestError):
                    build_manifest(facts, dossier(), command_results())

    def test_rejects_non_hex_or_wrong_length_sha(self) -> None:
        facts = raw_git_facts()
        facts["head_sha"] = "not-a-sha"
        with self.assertRaises(ManifestError):
            build_manifest(facts, dossier(), command_results())
        facts = raw_git_facts()
        facts["red_sha"] = "deadbeef"
        with self.assertRaises(ManifestError):
            build_manifest(facts, dossier(), command_results())


class BundleTipTest(unittest.TestCase):
    def test_rejects_bundle_tip_not_equal_to_head(self) -> None:
        facts = raw_git_facts()
        facts["bundle_tip"] = BASE_SHA
        with self.assertRaises(ManifestError):
            build_manifest(facts, dossier(), command_results())

    def test_rejects_unverified_bundle(self) -> None:
        facts = raw_git_facts()
        facts["bundle_verified"] = False
        with self.assertRaises(ManifestError):
            build_manifest(facts, dossier(), command_results())


class TrailerMismatchTest(unittest.TestCase):
    def test_rejects_trailer_phase_job_version_digest_mismatch(self) -> None:
        mutations = [
            ("phase", "red", "GREEN"),
            ("phase", "green", "RED"),
            ("job_key", "green", "other-job"),
            ("job_key", "red", "other-job"),
            ("version", "green", "v2"),
            ("version", "red", "v2"),
            ("digest", "green", RED_DIGEST),
            ("digest", "red", HEAD_DIGEST),
        ]
        for field, phase, value in mutations:
            with self.subTest(field=field, phase=phase):
                facts = raw_git_facts()
                facts["trailers"][phase][field] = value
                with self.assertRaises(ManifestError):
                    build_manifest(facts, dossier(), command_results())

    def test_rejects_dossier_base_sha_moved_from_git(self) -> None:
        work = dossier()
        work["base_sha"] = "4" * 40
        with self.assertRaises(ManifestError):
            build_manifest(raw_git_facts(), work, command_results())


class RenameDeleteTest(unittest.TestCase):
    def test_rename_and_delete_flow_to_the_diff_gate_rejected(self) -> None:
        cases = [
            ("renamed", {"status": "renamed", "old_path": "frontend/src/widget-old.ts"}),
            ("deleted", {"status": "deleted"}),
        ]
        for label, updates in cases:
            with self.subTest(label=label):
                facts = raw_git_facts()
                facts["changes"]["green"][0].update(updates)
                manifest = build_manifest(facts, dossier(), command_results())
                self.assertIn("rename_or_delete", evaluate_diff(manifest).reasons)


class RanOnShaReplayTest(unittest.TestCase):
    def test_replays_same_command_id_on_both_phases_by_ran_on_sha(self) -> None:
        manifest = build_golden()
        self.assertEqual(
            manifest["phases"]["red"]["commands"],
            [{"id": "frontend-test", "status": "failed", "failure_kind": "behavioral"}],
        )
        self.assertEqual(
            manifest["phases"]["green"]["commands"],
            [{"id": "frontend-test", "status": "passed", "failure_kind": None}],
        )
        for phase in ("red", "green"):
            for command in manifest["phases"][phase]["commands"]:
                self.assertNotIn("ran_on_sha", command)

    def test_rejects_command_bound_to_an_unknown_sha(self) -> None:
        results = command_results()
        results[0]["ran_on_sha"] = "4" * 40
        with self.assertRaises(ManifestError):
            build_manifest(raw_git_facts(), dossier(), results)

    def test_rejects_missing_expected_command_id(self) -> None:
        results = command_results()
        results[1]["id"] = "unrelated-smoke"
        with self.assertRaises(ManifestError):
            build_manifest(raw_git_facts(), dossier(), results)

    def test_rejects_duplicate_command_for_the_same_phase(self) -> None:
        results = command_results()
        results.insert(1, dict(results[0]))
        with self.assertRaises(ManifestError):
            build_manifest(raw_git_facts(), dossier(), results)


class SecretEvidenceTest(unittest.TestCase):
    def test_preserves_verify_runner_secret_findings(self) -> None:
        facts = raw_git_facts()
        facts["secret_findings"] = [
            {"kind": "credential-pattern", "path": "frontend/src/widget.ts"}
        ]
        manifest = build_manifest(facts, dossier(), command_results())
        self.assertEqual(manifest["secret_findings"], facts["secret_findings"])
        self.assertIn("secret_detected", evaluate_diff(manifest).reasons)


class GitCleanEvidenceTest(unittest.TestCase):
    def test_clean_requires_runner_evidence_bound_to_head_tree(self) -> None:
        manifest = build_golden()
        self.assertTrue(manifest["git"]["clean"])

        facts = raw_git_facts()
        facts["runner_evidence"] = {
            "kind": "verify-runner",
            "head_sha": BASE_SHA,
            "tree_digest": HEAD_DIGEST,
        }
        self.assertFalse(build_manifest(facts, dossier(), command_results())["git"]["clean"])

        facts = raw_git_facts()
        facts["runner_evidence"] = {
            "kind": "verify-runner",
            "head_sha": HEAD_SHA,
            "tree_digest": RED_DIGEST,
        }
        self.assertFalse(build_manifest(facts, dossier(), command_results())["git"]["clean"])

        facts = raw_git_facts()
        del facts["runner_evidence"]
        with self.assertRaises(ManifestError):
            build_manifest(facts, dossier(), command_results())


class CliTest(unittest.TestCase):
    def test_build_cli_writes_canonical_manifest_and_sha256(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            facts_path = root / "raw-git-facts.json"
            facts_path.write_text(json.dumps(raw_git_facts()), encoding="utf-8")
            dossier_path = root / "dossier.json"
            dossier_path.write_text(json.dumps(dossier()), encoding="utf-8")
            results_path = root / "command-results.json"
            results_path.write_text(json.dumps(command_results()), encoding="utf-8")
            output_path = root / "trusted-manifest.json"

            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                exit_code = main(
                    [
                        "build",
                        "--raw-git-facts",
                        str(facts_path),
                        "--dossier",
                        str(dossier_path),
                        "--command-results",
                        str(results_path),
                        "--output",
                        str(output_path),
                    ]
                )
            self.assertEqual(exit_code, 0)
            printed = dict(
                line.split("=", 1)
                for line in stdout.getvalue().splitlines()
                if "=" in line
            )
            self.assertIn("manifest_sha256", printed)

            manifest = json.loads(output_path.read_text(encoding="utf-8"))
            decision = evaluate_diff(manifest)
            self.assertTrue(decision.approved)
            self.assertEqual(printed["manifest_sha256"], manifest_sha256(manifest))

            sha_stdout = io.StringIO()
            with contextlib.redirect_stdout(sha_stdout):
                sha_exit = main(["manifest-sha256", "--manifest", str(output_path)])
            self.assertEqual(sha_exit, 0)
            self.assertEqual(sha_stdout.getvalue().strip(), printed["manifest_sha256"])

    def test_cli_is_fail_closed_on_invalid_input(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bad_path = root / "bad.json"
            bad_path.write_text("{", encoding="utf-8")
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                exit_code = main(
                    [
                        "build",
                        "--raw-git-facts",
                        str(bad_path),
                        "--dossier",
                        str(bad_path),
                        "--command-results",
                        str(bad_path),
                        "--output",
                        str(root / "out.json"),
                    ]
                )
            self.assertEqual(exit_code, 2)
            self.assertIn('"error":"invalid_manifest"', stdout.getvalue())


class WorkflowContractTest(unittest.TestCase):
    def test_workflow_yaml_parses_and_has_trusted_job_topology(self) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        jobs = workflow["jobs"]
        expected_order = [
            "fixture",
            "production_disabled",
            "red_agent",
            "red_gate",
            "green_agent",
            "green_gate",
            "manifest_collector",
            "diff_gate",
            "review_opus",
            "review_gate",
            "draft_pr",
        ]
        self.assertEqual([name for name in expected_order if name in jobs], expected_order)
        self.assertEqual(jobs["manifest_collector"]["needs"], "green_gate")
        self.assertEqual(jobs["diff_gate"]["needs"], "manifest_collector")

    def test_c1_manifest_and_downloads_live_only_under_runner_temp(self) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        collector = workflow["jobs"]["manifest_collector"]
        self.assertEqual(
            collector["env"]["MANIFEST_PATH"],
            "${{ runner.temp }}/testing-center/trusted-manifest.json",
        )
        diff = workflow["jobs"]["diff_gate"]
        self.assertEqual(
            diff["env"]["MANIFEST_PATH"],
            "${{ runner.temp }}/testing-center/trusted-manifest.json",
        )

    def test_c2_diff_gate_requires_success_and_recomputes_sha256_before_gate(self) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        diff = workflow["jobs"]["diff_gate"]
        self.assertIn("needs.manifest_collector.result == 'success'", diff["if"])
        step_names = [step.get("name") for step in diff["steps"]]
        verify_index = step_names.index(
            "Verify manifest sha256 before gating"
        )
        gate_index = step_names.index("Evaluate server-owned manifest without network")
        self.assertLess(verify_index, gate_index)
        verify = diff["steps"][verify_index]
        self.assertEqual(
            verify["env"]["EXPECTED_MANIFEST_SHA256"],
            "${{ needs.manifest_collector.outputs.manifest_sha256 }}",
        )
        self.assertIn("manifest-sha256", verify["run"])
        self.assertIn("manifest_sha256_mismatch", verify["run"])

    def test_c3_commands_from_verify_runner_only_and_bundle_not_tarball(self) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        collector = workflow["jobs"]["manifest_collector"]
        step_names = [step.get("name") for step in collector["steps"]]
        build_index = step_names.index("Build trusted manifest from verify runner bundle facts only")
        build = collector["steps"][build_index]
        self.assertEqual(
            build["env"]["COMMAND_RESULTS"],
            "${{ runner.temp }}/testing-center-evidence/command-results.json",
        )
        text = WORKFLOW_PATH.read_text(encoding="utf-8")
        self.assertIn("bundle", text.lower())
        self.assertNotIn("tarball", text.lower())

    def test_collector_checkout_uses_explicit_control_ref_without_credentials(self) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        collector = workflow["jobs"]["manifest_collector"]
        checkout = collector["steps"][0]
        self.assertEqual(checkout["uses"], CHECKOUT_PIN)
        self.assertEqual(checkout["with"]["ref"], "${{ github.sha }}")
        self.assertEqual(checkout["with"]["persist-credentials"], False)

    def test_diff_gate_checks_out_trusted_scripts_without_credentials(self) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        diff = workflow["jobs"]["diff_gate"]
        checkout = diff["steps"][0]
        self.assertEqual(checkout["uses"], CHECKOUT_PIN)
        self.assertEqual(checkout["with"]["ref"], "${{ github.sha }}")
        self.assertEqual(checkout["with"]["persist-credentials"], False)

    def test_trusted_artifacts_have_retention_one(self) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        collector = workflow["jobs"]["manifest_collector"]
        uploads = [step for step in collector["steps"] if step.get("uses") == UPLOAD_PIN]
        self.assertEqual({step["with"]["retention-days"] for step in uploads}, {1})

    def test_review_uses_trusted_control_not_head_for_prompt_schema_settings(self) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        review = workflow["jobs"]["review_opus"]
        text = json.dumps(review, sort_keys=True)
        self.assertIn("testing-center-trusted-control", text)
        self.assertIn("${{ runner.temp }}/testing-center-control/", text)
        self.assertNotIn(".github/agents/testing-center-review-settings.json", text)
        self.assertNotIn(".github/agents/testing-center-review-output.schema.json", text)
        self.assertNotIn(".github/agents/testing-center-review-prompt.md", text)

    def test_branch_ci_runs_collector_tests(self) -> None:
        gates = yaml.safe_load(BRANCH_GATES_PATH.read_text(encoding="utf-8"))
        policy_steps = " ".join(
            json.dumps(step, sort_keys=True)
            for step in gates["jobs"]["policy"]["steps"]
        )
        self.assertIn("test_testing_center_manifest_collector.py", policy_steps)


if __name__ == "__main__":
    unittest.main()
