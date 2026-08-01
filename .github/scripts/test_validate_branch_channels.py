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


if __name__ == "__main__":
    unittest.main()
