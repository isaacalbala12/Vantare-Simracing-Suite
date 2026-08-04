"""Regression guard for the Overlay Workshop channel compilation policy."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class OverlayWorkshopChannelFlagTests(unittest.TestCase):
    @staticmethod
    def _branch_channel_enabled(event_name: str, ref: str) -> bool:
        """Mirror the deliberately narrow branch-channel workflow expression."""
        return event_name == "push" and ref in {
            "refs/heads/nightly",
            "refs/heads/testers",
        }

    def test_branch_gate_enables_workshop_only_after_a_direct_channel_push(self) -> None:
        source = (ROOT / "workflows" / "branch-channel-gates.yml").read_text(encoding="utf-8")
        flag_line = next(line for line in source.splitlines() if "VITE_INCLUDE_OVERLAY_WORKSHOP:" in line)

        expected = (
            "VITE_INCLUDE_OVERLAY_WORKSHOP: ${{ github.event_name == 'push' && "
            "(github.ref == 'refs/heads/nightly' || github.ref == 'refs/heads/testers') "
            "&& 'true' || 'false' }}"
        )
        self.assertEqual(" ".join(flag_line.split()), " ".join(expected.split()))

    def test_branch_gate_policy_matrix_excludes_prs_issue_branches_tags_and_master(self) -> None:
        cases = {
            ("pull_request", "refs/pull/42/merge"): False,
            ("push", "refs/heads/feature/isa-264"): False,
            ("push", "refs/heads/master"): False,
            ("push", "refs/tags/v0.1.0.3"): False,
            ("push", "refs/heads/nightly"): True,
            ("push", "refs/heads/testers"): True,
        }
        for (event_name, ref), expected in cases.items():
            with self.subTest(event_name=event_name, ref=ref):
                self.assertEqual(self._branch_channel_enabled(event_name, ref), expected)

    def test_release_keeps_tags_stable_and_limits_internal_builds_to_dispatch(self) -> None:
        source = (ROOT / "workflows" / "release.yml").read_text(encoding="utf-8")
        flag_line = next(line for line in source.splitlines() if "VITE_INCLUDE_OVERLAY_WORKSHOP:" in line)

        self.assertIn("github.event_name == 'workflow_dispatch'", flag_line)
        self.assertIn("refs/heads/nightly|refs/heads/testers", source)



if __name__ == "__main__":
    unittest.main()
