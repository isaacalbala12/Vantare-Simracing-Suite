from pathlib import Path
import unittest

from validate_branch_channels import validate


class ValidateBranchChannelsTest(unittest.TestCase):
    def test_accepts_issue_branch_into_nightly(self) -> None:
        self.assertEqual(
            validate("pull_request", "refs/pull/1/merge", "nightly", "vantareapp/isa-121"),
            "promotion accepted: vantareapp/isa-121 -> nightly",
        )

    def test_accepts_only_nightly_into_testers(self) -> None:
        self.assertEqual(
            validate("pull_request", "refs/pull/2/merge", "testers", "nightly"),
            "promotion accepted: nightly -> testers",
        )
        with self.assertRaisesRegex(ValueError, "must come from 'nightly'"):
            validate("pull_request", "refs/pull/3/merge", "testers", "feature/x")

    def test_accepts_only_testers_into_master(self) -> None:
        self.assertEqual(
            validate("pull_request", "refs/pull/4/merge", "master", "testers"),
            "promotion accepted: testers -> master",
        )
        with self.assertRaisesRegex(ValueError, "must come from 'testers'"):
            validate("pull_request", "refs/pull/5/merge", "master", "nightly")

    def test_accepts_only_linear_hotfix_branches_as_master_exception(self) -> None:
        self.assertEqual(
            validate(
                "pull_request",
                "refs/pull/8/merge",
                "master",
                "vantareapp/hotfix-isa-175-critical-license-fix",
            ),
            "emergency hotfix accepted: "
            "vantareapp/hotfix-isa-175-critical-license-fix -> master",
        )
        for head in (
            "hotfix/isa-175",
            "vantareapp/hotfix-175",
            "vantareapp/hotfix-isa-0-invalid",
            "vantareapp/hotfix-isa-175_Invalid",
        ):
            with self.subTest(head=head), self.assertRaisesRegex(
                ValueError, "must come from 'testers'"
            ):
                validate("pull_request", "refs/pull/9/merge", "master", head)

    def test_rejects_non_issue_branches_into_nightly(self) -> None:
        for head in ("testers", "master", "develop", "feature/x", "codex/isa-121"):
            with self.subTest(head=head), self.assertRaisesRegex(ValueError, "Linear issue branch"):
                validate("pull_request", "refs/pull/6/merge", "nightly", head)

    def test_push_is_limited_to_channel_branches(self) -> None:
        for ref in ("refs/heads/nightly", "refs/heads/testers"):
            with self.subTest(ref=ref):
                self.assertIn("accepted", validate("push", ref, "", ""))
        with self.assertRaisesRegex(ValueError, "not a channel branch"):
            validate("push", "refs/heads/develop", "", "")

    def test_rejects_unknown_events_and_targets(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported event"):
            validate("schedule", "", "", "")
        with self.assertRaisesRegex(ValueError, "unsupported event"):
            validate("workflow_dispatch", "refs/heads/nightly", "", "")
        with self.assertRaisesRegex(ValueError, "unsupported promotion target"):
            validate("pull_request", "refs/pull/7/merge", "develop", "feature/x")

    def test_no_test_is_carved_out_of_the_blocking_runs(self) -> None:
        """The frontend debt allowlist is empty and must stay that way.

        ISA-118, ISA-172, ISA-173 and ISA-174 were excluded from the blocking
        runs and repeated as advisory steps, which painted every gate red. Their
        causes are fixed and the suites run whole again. This used to pin the
        allowlist to those exact entries; it now pins it to nothing, so carving
        a test out again is a deliberate edit here rather than a quiet one.
        """
        workflows = Path(__file__).resolve().parents[1] / "workflows"
        channel_gate = (workflows / "branch-channel-gates.yml").read_text(encoding="utf-8")
        release_gate = (workflows / "release.yml").read_text(encoding="utf-8")

        for workflow, gate in (("channel", channel_gate), ("release", release_gate)):
            with self.subTest(workflow=workflow):
                self.assertNotIn("--exclude", gate)
                self.assertNotIn("-skip '^TestConcurrentSavesDontCorruptFile$'", gate)

        self.assertNotIn(
            "- name: Frontend tests\n        continue-on-error: true",
            channel_gate,
        )

    def test_release_build_embeds_the_real_testing_channel(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        release_gate = (
            repo_root / ".github" / "workflows" / "release.yml"
        ).read_text(encoding="utf-8")
        taskfile = (
            repo_root / "vantare-v2" / "build" / "windows" / "Taskfile.yml"
        ).read_text(encoding="utf-8")

        self.assertIn("VANTARE_BUILD_CHANNEL:", release_gate)
        self.assertIn("github.ref_type == 'branch'", release_gate)
        self.assertIn("-X main.buildChannel={{.VANTARE_BUILD_CHANNEL}}", taskfile)

    def test_runbook_never_reuses_tags_or_commits_to_master(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        runbook = (
            repo_root / "vantare-v2" / "docs" / "release-beta-operations-runbook.md"
        ).read_text(encoding="utf-8")

        self.assertNotIn("git push origin --delete", runbook)
        self.assertNotIn("Commitea el fix en `master`", runbook)
        self.assertIn("No borres, muevas ni reutilices el tag distribuido", runbook)
        self.assertIn(
            "`vantareapp/hotfix-isa-<número>-<descripción>` desde `master`",
            runbook,
        )


if __name__ == "__main__":
    unittest.main()
