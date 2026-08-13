import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from testing_center_nightly_closeout import decide_closeout  # noqa: E402


JOB_KEY = "a" * 64
HEAD_SHA = "b" * 40
MERGE_SHA = "c" * 40
TAG = "v0.1.0.7-nightly.43"


def event(**overrides):
    value = {
        "contract_version": "testing-center.nightly-closeout.v1",
        "event_name": "workflow_run",
        "workflow_name": "Branch channel gates",
        "workflow_conclusion": "success",
        "workflow_branch": "nightly",
        "job_key": JOB_KEY,
        "reviewed_head_sha": HEAD_SHA,
        "merge_sha": MERGE_SHA,
        "nightly_sha": MERGE_SHA,
        "reservation_job_key": JOB_KEY,
        "reservation_merge_sha": MERGE_SHA,
        "reservation_reviewed_head_sha": HEAD_SHA,
        "reserved_tag": TAG,
        "reservation_state": "reserved",
        "state": "merged_nightly",
        "smoke": "pending",
        "release": "absent",
        "release_source_sha": None,
        "release_asset_count": 0,
        "release_checksums_verified": False,
        "revert": "absent",
        "kill_switches_open": False,
    }
    value.update(overrides)
    return value


class NightlyCloseoutTest(unittest.TestCase):
    def test_starts_smoke_only_for_exact_nightly_merge_and_reservation(self):
        result = decide_closeout(event())
        self.assertEqual(result.state, "smoke_running")
        self.assertEqual(result.next_effect, "smoke")
        self.assertFalse(result.tag_allowed)
        self.assertTrue(result.keep_lock)

    def test_smoke_failure_never_allows_tag_and_requests_revert(self):
        result = decide_closeout(
            event(state="smoke_running", smoke="failure")
        )
        self.assertEqual(result.state, "smoke_failed")
        self.assertEqual(result.next_effect, "annul_reservation")
        self.assertFalse(result.tag_allowed)
        self.assertTrue(result.keep_lock)

    def test_success_uses_premerge_reservation_and_exact_merge_sha(self):
        result = decide_closeout(
            event(state="smoke_running", smoke="success")
        )
        self.assertEqual(result.state, "nightly_tagged")
        self.assertEqual(result.next_effect, "release")
        self.assertEqual(result.tag, TAG)
        self.assertEqual(result.source_sha, MERGE_SHA)
        self.assertTrue(result.tag_allowed)
        self.assertTrue(result.keep_lock)

    def test_verified_release_requires_six_assets_checksums_and_source_sha(self):
        result = decide_closeout(
            event(
                state="nightly_tagged",
                smoke="success",
                release="verified",
                release_source_sha=MERGE_SHA,
                release_asset_count=6,
                release_checksums_verified=True,
            )
        )
        self.assertEqual(result.state, "completed")
        self.assertEqual(result.next_effect, "callback")
        self.assertFalse(result.keep_lock)

        for invalid in (
            {"release_source_sha": HEAD_SHA},
            {"release_asset_count": 5},
            {"release_checksums_verified": False},
        ):
            with self.subTest(invalid=invalid):
                evidence = {
                    "state": "nightly_tagged",
                    "smoke": "success",
                    "release": "verified",
                    "release_source_sha": MERGE_SHA,
                    "release_asset_count": 6,
                    "release_checksums_verified": True,
                }
                evidence.update(invalid)
                with self.assertRaises(ValueError):
                    decide_closeout(event(**evidence))

    def test_revert_holds_lock_until_verified_or_routes_conflict_to_owner(self):
        opened = decide_closeout(
            event(
                state="smoke_failed",
                smoke="failure",
                revert="absent",
                reservation_state="annulled",
            )
        )
        self.assertEqual(opened.state, "revert_pr_open")
        self.assertEqual(
            opened.revert_branch,
            f"vantareapp/tc-{JOB_KEY[:12]}-nightly-closeout-revert",
        )
        self.assertTrue(opened.keep_lock)

        reverted = decide_closeout(
            event(
                state="revert_pr_open",
                smoke="failure",
                revert="verified",
                reservation_state="annulled",
            )
        )
        self.assertEqual(reverted.state, "reverted")
        self.assertEqual(reverted.next_effect, "callback")
        self.assertFalse(reverted.keep_lock)

        owner = decide_closeout(
            event(
                state="revert_pr_open",
                smoke="failure",
                revert="conflict",
                reservation_state="annulled",
            )
        )
        self.assertEqual(owner.state, "needs_owner")
        self.assertIsNone(owner.next_effect)
        self.assertTrue(owner.keep_lock)

    def test_duplicate_terminal_callback_is_a_noop(self):
        result = decide_closeout(
            event(
                state="completed",
                smoke="success",
                release="verified",
                release_source_sha=MERGE_SHA,
                release_asset_count=6,
                release_checksums_verified=True,
                reservation_state="confirmed",
            )
        )
        self.assertEqual(result.state, "completed")
        self.assertIsNone(result.next_effect)
        self.assertFalse(result.keep_lock)

    def test_unrelated_stale_or_mismatched_facts_fail_closed(self):
        invalid_events = (
            {"workflow_name": "Other workflow"},
            {"workflow_conclusion": "failure"},
            {"workflow_branch": "master"},
            {"nightly_sha": HEAD_SHA},
            {"reservation_job_key": "d" * 64},
            {"reservation_merge_sha": HEAD_SHA},
            {"reservation_reviewed_head_sha": MERGE_SHA},
            {"reserved_tag": "v0.1.0-nightly.43"},
            {"kill_switches_open": True},
        )
        for invalid in invalid_events:
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    decide_closeout(event(**invalid))

    def test_reverted_and_owner_states_converge_with_lock_contract(self):
        reverted = decide_closeout(
            event(
                state="reverted",
                smoke="failure",
                revert="verified",
                reservation_state="annulled",
            )
        )
        self.assertFalse(reverted.keep_lock)
        owner = decide_closeout(event(state="needs_owner", reservation_state="needs_owner"))
        self.assertEqual(owner.state, "needs_owner")
        self.assertTrue(owner.keep_lock)


if __name__ == "__main__":
    unittest.main()
