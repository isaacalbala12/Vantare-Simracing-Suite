from __future__ import annotations

import copy
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from testing_center_diff_gate import evaluate_diff, main


BASE_SHA = "1" * 40
RED_SHA = "2" * 40
HEAD_SHA = "3" * 40
JOB_KEY = "testing-center:issue-123"
VERSION = "testing-center-diff-gate/v1"
RED_DIGEST = "sha256:" + "a" * 64
HEAD_DIGEST = "sha256:" + "b" * 64


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
        "patch": "+const safeValue = true;",
    }


def eligible_manifest() -> dict:
    trailers_red = {
        "phase": "RED",
        "job_key": JOB_KEY,
        "version": VERSION,
        "digest": RED_DIGEST,
    }
    trailers_green = {
        "phase": "GREEN",
        "job_key": JOB_KEY,
        "version": VERSION,
        "digest": HEAD_DIGEST,
    }
    return {
        "manifest_version": 1,
        "expected": {
            "base_sha": BASE_SHA,
            "job_key": JOB_KEY,
            "version": VERSION,
            "red_digest": RED_DIGEST,
            "head_digest": HEAD_DIGEST,
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
        },
        "git": {
            "base_sha": BASE_SHA,
            "red_sha": RED_SHA,
            "head_sha": HEAD_SHA,
            "ancestry": {"base_to_red": True, "red_to_head": True},
            "commit_counts": {"base_to_red": 1, "red_to_head": 1},
            "clean": True,
        },
        "phases": {
            "red": {
                "sha": RED_SHA,
                "digest": RED_DIGEST,
                "trailers": trailers_red,
                "changes": [change("frontend/src/widget.test.ts")],
                "commands": [
                    {"id": "frontend-test", "status": "failed", "failure_kind": "behavioral"}
                ],
            },
            "green": {
                "sha": HEAD_SHA,
                "digest": HEAD_DIGEST,
                "trailers": trailers_green,
                "changes": [change("frontend/src/widget.ts", additions=12, deletions=2)],
                "commands": [
                    {"id": "frontend-test", "status": "passed", "failure_kind": None}
                ],
            },
        },
        "secret_findings": [],
    }


class DiffGateBehaviorTest(unittest.TestCase):
    def test_accepts_eligible_manifest(self) -> None:
        result = evaluate_diff(eligible_manifest())
        self.assertTrue(result.approved)
        self.assertEqual(result.reasons, ())

    def test_rejects_test_mutation_after_red(self) -> None:
        manifest = eligible_manifest()
        manifest["phases"]["green"]["changes"] = [
            change("frontend/src/widget.test.ts")
        ]

        result = evaluate_diff(manifest)

        self.assertFalse(result.approved)
        self.assertIn("red_test_mutated", result.reasons)

    def test_rejects_forbidden_path_and_budget(self) -> None:
        manifest = eligible_manifest()
        manifest["phases"]["green"]["changes"] = [
            change(".github/workflows/unsafe.yml"),
            *[
                change(f"frontend/src/widget-{index}.ts")
                for index in range(6)
            ],
        ]

        result = evaluate_diff(manifest)

        self.assertFalse(result.approved)
        self.assertIn("forbidden_path", result.reasons)
        self.assertIn("file_budget_exceeded", result.reasons)

    def test_decision_has_exact_immutable_fields(self) -> None:
        result = evaluate_diff(eligible_manifest())

        self.assertEqual(result.base_sha, BASE_SHA)
        self.assertEqual(result.red_sha, RED_SHA)
        self.assertEqual(result.head_sha, HEAD_SHA)
        self.assertEqual(
            result.changed_files,
            ("frontend/src/widget.test.ts", "frontend/src/widget.ts"),
        )
        with self.assertRaises((AttributeError, TypeError)):
            result.approved = False  # type: ignore[misc]

    def test_reasons_are_stably_ordered_and_deduplicated(self) -> None:
        manifest = eligible_manifest()
        manifest["git"]["base_sha"] = "4" * 40
        manifest["git"]["clean"] = False
        manifest["phases"]["green"]["changes"] = [
            change("frontend/src/widget.test.ts"),
            change(".github/workflows/unsafe.yml"),
            change(".github/workflows/UNSAFE.yml"),
            *[change(f"frontend/src/extra-{index}.ts") for index in range(4)],
        ]

        result = evaluate_diff(manifest)

        self.assertEqual(
            result.reasons,
            (
                "base_moved",
                "dirty_tree",
                "red_test_mutated",
                "forbidden_path",
                "case_collision",
                "file_budget_exceeded",
            ),
        )

    def test_rejects_invalid_shas_ancestry_and_commit_counts(self) -> None:
        for label, mutate in [
            ("non_hex", lambda m: m["git"].__setitem__("red_sha", "not-a-sha")),
            ("same_sha", lambda m: m["git"].__setitem__("head_sha", RED_SHA)),
            (
                "base_not_ancestor",
                lambda m: m["git"]["ancestry"].__setitem__("base_to_red", False),
            ),
            (
                "red_not_ancestor",
                lambda m: m["git"]["ancestry"].__setitem__("red_to_head", False),
            ),
            (
                "two_red_commits",
                lambda m: m["git"]["commit_counts"].__setitem__("base_to_red", 2),
            ),
            (
                "two_green_commits",
                lambda m: m["git"]["commit_counts"].__setitem__("red_to_head", 2),
            ),
        ]:
            with self.subTest(label=label):
                manifest = eligible_manifest()
                mutate(manifest)
                self.assertIn("invalid_ancestry", evaluate_diff(manifest).reasons)

    def test_rejects_moved_base_and_dirty_tree(self) -> None:
        manifest = eligible_manifest()
        manifest["git"]["base_sha"] = "4" * 40
        manifest["git"]["clean"] = False

        result = evaluate_diff(manifest)

        self.assertIn("base_moved", result.reasons)
        self.assertIn("dirty_tree", result.reasons)

    def test_rejects_phase_sha_digest_or_trailer_mismatch(self) -> None:
        mutations = [
            lambda m: m["phases"]["red"].__setitem__("sha", HEAD_SHA),
            lambda m: m["phases"]["green"].__setitem__("digest", RED_DIGEST),
            lambda m: m["phases"]["red"]["trailers"].__setitem__("phase", "GREEN"),
            lambda m: m["phases"]["green"]["trailers"].__setitem__("job_key", "other"),
            lambda m: m["phases"]["red"]["trailers"].__setitem__("version", "v2"),
            lambda m: m["phases"]["green"]["trailers"].__setitem__("digest", RED_DIGEST),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(index=index):
                manifest = eligible_manifest()
                mutate(manifest)
                self.assertIn("invalid_trailer", evaluate_diff(manifest).reasons)

    def test_rejects_non_normalized_paths(self) -> None:
        for path in [
            "../frontend/src/widget.ts",
            "frontend/src/../src/widget.ts",
            "/frontend/src/widget.ts",
            "C:/frontend/src/widget.ts",
            "frontend\\src\\widget.ts",
            "frontend/src/widget\n.ts",
        ]:
            with self.subTest(path=repr(path)):
                manifest = eligible_manifest()
                manifest["phases"]["green"]["changes"] = [change(path)]
                self.assertIn("path_traversal", evaluate_diff(manifest).reasons)

    def test_rejects_casefold_collisions(self) -> None:
        manifest = eligible_manifest()
        manifest["phases"]["green"]["changes"] = [
            change("frontend/src/widget.ts"),
            change("frontend/src/Widget.ts"),
        ]

        self.assertIn("case_collision", evaluate_diff(manifest).reasons)

    def test_rejects_symlink_submodule_binary_rename_and_delete(self) -> None:
        cases = [
            ("symlink", {"mode_after": "120000"}),
            ("submodule", {"mode_after": "160000"}),
            ("binary", {"binary": True}),
            ("rename_or_delete", {"status": "renamed", "old_path": "old.ts"}),
            ("rename_or_delete", {"status": "deleted"}),
        ]
        for reason, updates in cases:
            with self.subTest(reason=reason, updates=updates):
                manifest = eligible_manifest()
                manifest["phases"]["green"]["changes"][0].update(updates)
                self.assertIn(reason, evaluate_diff(manifest).reasons)

    def test_rejects_forbidden_sensitive_and_dependency_paths(self) -> None:
        paths = [
            ".github/workflows/release.yml",
            ".github/agents/testing-center-review-prompt.md",
            ".github/scripts/testing_center_diff_gate.py",
            "config/production.json",
            "frontend/src/auth/session.ts",
            "frontend/src/billing/invoice.ts",
            "secrets/key.txt",
            "package.json",
            "frontend/pnpm-lock.yaml",
            "go.mod",
        ]
        for path in paths:
            with self.subTest(path=path):
                manifest = eligible_manifest()
                manifest["phases"]["green"]["changes"] = [change(path)]
                self.assertIn("forbidden_path", evaluate_diff(manifest).reasons)

    def test_red_may_change_only_allowlisted_tests(self) -> None:
        manifest = eligible_manifest()
        manifest["phases"]["red"]["changes"] = [change("frontend/src/widget.ts")]

        self.assertIn("forbidden_path", evaluate_diff(manifest).reasons)

    def test_rejects_ambiguous_or_oversized_server_scope(self) -> None:
        manifests = []
        oversized = eligible_manifest()
        oversized["expected"]["product_paths"].append("frontend/src/widget-extra.ts")
        manifests.append(oversized)
        overlap = eligible_manifest()
        overlap["expected"]["product_paths"][0] = "frontend/src/widget.test.ts"
        manifests.append(overlap)
        red_product = eligible_manifest()
        red_product["expected"]["test_paths"] = ["frontend/src/widget.ts"]
        manifests.append(red_product)
        green_test = eligible_manifest()
        green_test["expected"]["product_paths"][0] = "frontend/src/other.test.ts"
        manifests.append(green_test)
        forbidden = eligible_manifest()
        forbidden["expected"]["product_paths"][0] = "frontend/src/auth/session.ts"
        manifests.append(forbidden)

        for index, manifest in enumerate(manifests):
            with self.subTest(index=index):
                with self.assertRaises(ValueError):
                    evaluate_diff(manifest)

    def test_rejects_line_budget(self) -> None:
        manifest = eligible_manifest()
        manifest["phases"]["green"]["changes"] = [
            change("frontend/src/widget.ts", additions=199, deletions=2)
        ]

        self.assertIn("file_budget_exceeded", evaluate_diff(manifest).reasons)

    def test_rejects_red_file_and_combined_line_budgets(self) -> None:
        too_many_tests = eligible_manifest()
        too_many_tests["expected"]["test_paths"] = [
            f"frontend/src/widget-{index}.test.ts" for index in range(6)
        ]
        too_many_tests["phases"]["red"]["changes"] = [
            change(path) for path in too_many_tests["expected"]["test_paths"]
        ]
        with self.assertRaises(ValueError):
            evaluate_diff(too_many_tests)

        oversized_red = eligible_manifest()
        oversized_red["phases"]["red"]["changes"][0] = change(
            "frontend/src/widget.test.ts", additions=189
        )
        self.assertIn(
            "file_budget_exceeded", evaluate_diff(oversized_red).reasons
        )

    def test_green_must_rerun_every_red_command(self) -> None:
        manifest = eligible_manifest()
        manifest["expected"]["command_ids"]["green"] = ["unrelated-smoke"]
        manifest["phases"]["green"]["commands"] = [
            {"id": "unrelated-smoke", "status": "passed", "failure_kind": None}
        ]

        self.assertIn("command_mismatch", evaluate_diff(manifest).reasons)

    def test_rejects_uppercase_sha_or_digest_identity(self) -> None:
        for field, value in [("head_sha", "A" * 40)]:
            with self.subTest(field=field):
                manifest = eligible_manifest()
                manifest["git"][field] = value
                self.assertIn("invalid_ancestry", evaluate_diff(manifest).reasons)

        manifest = eligible_manifest()
        manifest["expected"]["head_digest"] = "sha256:" + "B" * 64
        with self.assertRaises(ValueError):
            evaluate_diff(manifest)

    def test_rejects_explicit_and_patch_secret_signals_without_values(self) -> None:
        explicit = eligible_manifest()
        explicit["secret_findings"] = [{"kind": "provider", "path": "widget.ts"}]
        patch = eligible_manifest()
        patch["phases"]["green"]["changes"][0]["patch"] = (
            "+api_key = 'super-sensitive-example-value'"
        )

        for manifest in [explicit, patch]:
            result = evaluate_diff(manifest)
            self.assertIn("secret_detected", result.reasons)
            self.assertNotIn("super-sensitive-example-value", repr(result))

    def test_rejects_non_behavioral_red(self) -> None:
        for kind in ["compile", "infra", "timeout", None]:
            with self.subTest(kind=kind):
                manifest = eligible_manifest()
                manifest["phases"]["red"]["commands"][0]["failure_kind"] = kind
                self.assertIn("red_not_behavioral", evaluate_diff(manifest).reasons)

    def test_rejects_command_id_order_status_and_green_failure(self) -> None:
        manifests = []
        wrong_id = eligible_manifest()
        wrong_id["phases"]["red"]["commands"][0]["id"] = "other"
        manifests.append(wrong_id)
        extra = eligible_manifest()
        extra["phases"]["green"]["commands"].append(
            {"id": "extra", "status": "passed", "failure_kind": None}
        )
        manifests.append(extra)
        red_passed = eligible_manifest()
        red_passed["phases"]["red"]["commands"][0]["status"] = "passed"
        manifests.append(red_passed)
        green_failed = eligible_manifest()
        green_failed["phases"]["green"]["commands"][0]["status"] = "failed"
        manifests.append(green_failed)

        for index, manifest in enumerate(manifests):
            with self.subTest(index=index):
                self.assertIn("command_mismatch", evaluate_diff(manifest).reasons)

    def test_manifest_is_closed_versioned_and_limits_are_real_integers(self) -> None:
        mutations = [
            lambda m: m.__setitem__("unexpected", True),
            lambda m: m.__setitem__("manifest_version", 2),
            lambda m: m["expected"]["limits"].__setitem__("max_product_files", True),
            lambda m: m["expected"]["limits"].__setitem__("max_test_files", 6),
            lambda m: m["expected"]["limits"].__setitem__("max_changed_lines", "200"),
            lambda m: m["phases"]["red"]["commands"][0].__setitem__("extra", "no"),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(index=index):
                manifest = eligible_manifest()
                mutate(manifest)
                with self.assertRaises(ValueError):
                    evaluate_diff(manifest)

    def test_cli_exit_codes_and_output_are_sanitized(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            approved_path = root / "approved.json"
            approved_path.write_text(json.dumps(eligible_manifest()), encoding="utf-8")
            rejected = eligible_manifest()
            rejected["secret_findings"] = [
                {"kind": "provider", "path": "frontend/src/widget.ts"}
            ]
            rejected_path = root / "rejected.json"
            rejected_path.write_text(json.dumps(rejected), encoding="utf-8")
            invalid_path = root / "invalid.json"
            invalid_path.write_text("{", encoding="utf-8")

            for expected_exit, path, expected_text in [
                (0, approved_path, '"approved":true'),
                (1, rejected_path, '"secret_detected"'),
                (2, invalid_path, '"error":"invalid_manifest"'),
            ]:
                with self.subTest(path=path.name):
                    output = io.StringIO()
                    with contextlib.redirect_stdout(output):
                        self.assertEqual(main([str(path)]), expected_exit)
                    rendered = output.getvalue()
                    self.assertIn(expected_text, rendered)
                    self.assertNotIn("provider", rendered)


if __name__ == "__main__":
    unittest.main()
