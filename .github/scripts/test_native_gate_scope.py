#!/usr/bin/env python3
"""Tests del clasificador de rutas de los gates nativos (#1654 ronda 2)."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from native_gate_scope import classify_paths  # noqa: E402


class ClassifyPathsTest(unittest.TestCase):
    def test_docs_only_skips_the_native_gates(self) -> None:
        scope = classify_paths(
            [
                "docs/roadmap/overview.md",
                "docs/quality/anti-slop.md",
                "vantare-v2/docs/releases/2026-10-15.json",
                "README.md",
            ]
        )
        self.assertFalse(scope.native)
        self.assertEqual(scope.native_paths, ())
        self.assertTrue(scope.reasons)

    def test_web_supabase_and_tooling_only_skip_the_native_gates(self) -> None:
        scope = classify_paths(
            [
                "apps/desktop/src/renderer/main.tsx",
                "packages/ui-core/src/button.tsx",
                "shared/types/session.ts",
                "supabase/functions/testing-center-agent-callback/index.ts",
                "scripts/lmu-capture/capture.py",
                "tools/plane/plane-estado.py",
                "tools/quality/vantare_quality.py",
                ".github/scripts/validate_branch_channels.py",
            ]
        )
        self.assertFalse(scope.native)
        self.assertEqual(scope.native_paths, ())

    def test_ci_runner_hooks_never_skip_the_native_gates(self) -> None:
        scope = classify_paths(["tools/ci-runners/cleanup.py"])
        self.assertTrue(scope.native)
        self.assertEqual(scope.native_paths, ("tools/ci-runners/cleanup.py",))

    def test_one_native_path_forces_the_gates(self) -> None:
        scope = classify_paths(
            [
                "docs/quality/anti-slop.md",
                "vantare-v2/native/services/src/triage.rs",
            ]
        )
        self.assertTrue(scope.native)
        self.assertEqual(
            scope.native_paths, ("vantare-v2/native/services/src/triage.rs",)
        )

    def test_ambiguous_roots_stay_conservative(self) -> None:
        for path in (
            "vantare-v2/testdata/acc/frames.bin",
            "vantare-v2/scripts/test_roadmap_web.mjs",
            ".github/workflows/branch-channel-gates.yml",
            "Vantare-Overlays.sln",
            "vantare-v2/native/assets/overlay.html",
        ):
            with self.subTest(path=path):
                self.assertTrue(classify_paths([path]).native)

    def test_markdown_inside_the_native_tree_is_documentation(self) -> None:
        scope = classify_paths(["vantare-v2/native/README.md"])
        self.assertFalse(scope.native)

    def test_empty_input_fails_closed(self) -> None:
        scope = classify_paths([])
        self.assertTrue(scope.native)
        self.assertEqual(scope.native_paths, ())

    def test_unsafe_or_ambiguous_paths_are_rejected(self) -> None:
        for path in (
            "",
            "/etc/passwd",
            "C:/Windows/system32",
            "docs\\quality\\anti-slop.md",
            "../outside.md",
            "docs//double.md",
            "docs/./dot.md",
            "-flag.md",
        ):
            with self.subTest(path=path):
                with self.assertRaises(ValueError):
                    classify_paths([path])

    def test_duplicate_paths_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            classify_paths(["docs/a.md", "docs/a.md"])
        with self.assertRaises(ValueError):
            classify_paths(["docs/A.md", "docs/a.md"])


class CommandLineTest(unittest.TestCase):
    def _run(self, payload: bytes) -> tuple[int, str, object]:
        with tempfile.TemporaryDirectory() as tmp:
            nul = Path(tmp) / "paths.bin"
            output = Path(tmp) / "scope.json"
            nul.write_bytes(payload)
            completed = subprocess.run(
                [
                    sys.executable,
                    str(Path(__file__).resolve().parent / "native_gate_scope.py"),
                    "--nul-file",
                    str(nul),
                    "--output",
                    str(output),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            written = (
                json.loads(output.read_text(encoding="utf-8")) if output.exists() else None
            )
            return completed.returncode, completed.stdout.strip(), written

    def test_prints_the_decision_and_writes_the_explanation(self) -> None:
        code, decision, scope = self._run(b"docs/a.md\0")
        self.assertEqual(code, 0)
        self.assertEqual(decision, "false")
        self.assertIs(scope["native"], False)

    def test_non_nul_terminated_input_fails(self) -> None:
        code, _, _ = self._run(b"docs/a.md")
        self.assertNotEqual(code, 0)


if __name__ == "__main__":
    unittest.main()
