from __future__ import annotations

import unittest

from testing_center_changed_lint import classify_paths


class ChangedLintTest(unittest.TestCase):
    def test_classifies_paths_deterministically(self) -> None:
        decision = classify_paths((
            "vantare-v2/frontend/src/hub/testing-center/validation.ts",
            "vantare-v2/internal/example.go",
            "vantare-v2/frontend/src/hub/testing-center/TestingCenterPage.tsx",
        ))
        self.assertTrue(decision.eligible)
        self.assertEqual(decision.lint_paths, (
            "vantare-v2/frontend/src/hub/testing-center/TestingCenterPage.tsx",
            "vantare-v2/frontend/src/hub/testing-center/validation.ts",
        ))
        self.assertTrue(decision.visual_required)

    def test_rejects_unsafe_or_ambiguous_paths(self) -> None:
        for paths in (
            ("../frontend/src/x.ts",),
            ("C:/repo/frontend/src/x.ts",),
            ("--fix",),
            ("vantare-v2/frontend/src/x.ts", "vantare-v2/frontend/src/x.ts"),
            ("vantare-v2/frontend/src/X.ts", "vantare-v2/frontend/src/x.ts"),
            ("vantare-v2/frontend/src/x.ts", "vantare-v2/frontend/src/../x.ts"),
        ):
            with self.subTest(paths=paths), self.assertRaises(ValueError):
                classify_paths(paths)

    def test_non_testing_center_visual_scope_is_ineligible(self) -> None:
        decision = classify_paths((
            "vantare-v2/frontend/src/overlays-studio/Canvas.tsx",
        ))
        self.assertFalse(decision.eligible)
        self.assertIn("unsupported_visual_scope", decision.reasons)

    def test_non_lint_files_do_not_become_shell_arguments(self) -> None:
        decision = classify_paths((
            "vantare-v2/frontend/src/style.css",
            "vantare-v2/frontend/package.json",
        ))
        self.assertEqual(decision.lint_paths, ())


if __name__ == "__main__":
    unittest.main()
