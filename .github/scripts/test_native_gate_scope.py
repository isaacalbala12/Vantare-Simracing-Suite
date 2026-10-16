#!/usr/bin/env python3
"""Tests del clasificador de rutas de los gates nativos (#1654 rondas 2 y 12)."""

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
        self.assertFalse(scope.telemetria)
        self.assertEqual(scope.native_paths, ())
        self.assertEqual(scope.telemetria_paths, ())
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
        self.assertFalse(scope.telemetria)
        self.assertEqual(scope.telemetria_paths, ())

    def test_ci_runner_hooks_never_skip_the_native_gates(self) -> None:
        scope = classify_paths(["tools/ci-runners/cleanup.py"])
        self.assertTrue(scope.native)
        self.assertEqual(scope.native_paths, ("tools/ci-runners/cleanup.py",))

    def test_one_native_path_forces_the_gates(self) -> None:
        scope = classify_paths(
            [
                "docs/quality/anti-slop.md",
                "vantare-v2/native/hub/src/services/access.rs",
            ]
        )
        self.assertTrue(scope.native)
        self.assertEqual(
            scope.native_paths, ("vantare-v2/native/hub/src/services/access.rs",)
        )
        # `services` no está en las cuatro zonas del corpus (AGENTS.md, #1498).
        self.assertFalse(scope.telemetria)

    def test_runtime_and_everything_it_compiles_forces_the_corpus(self) -> None:
        for path in (
            "vantare-v2/native/runtime/src/flows/transport.rs",
            "vantare-v2/native/domain/src/session.rs",
            "vantare-v2/native/ipc/src/pipe.rs",
            "vantare-v2/native/launcher/src/chain.rs",
            "vantare-v2/native/profiling/src/lib.rs",
            "vantare-v2/native/services/src/triage.rs",
            "vantare-v2/testdata/acc/frames.bin",
        ):
            with self.subTest(path=path):
                scope = classify_paths([path])
                self.assertTrue(scope.native)
                self.assertTrue(scope.telemetria)
                self.assertEqual(scope.telemetria_paths, (path,))

    def test_hub_and_ui_only_skip_the_corpus_and_keep_the_gates(self) -> None:
        scope = classify_paths(
            [
                "vantare-v2/native/hub/src/service.rs",
                "vantare-v2/native/ui/src/overlay.rs",
            ]
        )
        self.assertTrue(scope.native)
        self.assertFalse(scope.telemetria)
        self.assertEqual(scope.telemetria_paths, ())

    def test_one_corpus_path_among_ui_paths_keeps_the_corpus(self) -> None:
        scope = classify_paths(
            [
                "vantare-v2/native/ui/src/overlay.rs",
                "vantare-v2/native/runtime/tests/telemetry_golden.rs",
            ]
        )
        self.assertTrue(scope.telemetria)
        self.assertEqual(
            scope.telemetria_paths,
            ("vantare-v2/native/runtime/tests/telemetry_golden.rs",),
        )

    def test_markdown_inside_a_corpus_zone_is_still_documentation(self) -> None:
        scope = classify_paths(["vantare-v2/native/runtime/README.md"])
        self.assertFalse(scope.native)
        self.assertFalse(scope.telemetria)

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
        self.assertTrue(scope.telemetria)
        self.assertEqual(scope.native_paths, ())
        self.assertEqual(scope.telemetria_paths, ())

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
        # Dos líneas, en orden: 1) native, 2) telemetria.
        self.assertEqual(decision.split("\n"), ["false", "false"])
        self.assertIs(scope["native"], False)
        self.assertIs(scope["telemetria"], False)

    def test_prints_the_corpus_decision_for_a_runtime_path(self) -> None:
        code, decision, scope = self._run(b"vantare-v2/native/runtime/src/lib.rs\0")
        self.assertEqual(code, 0)
        self.assertEqual(decision.split("\n"), ["true", "true"])
        self.assertIs(scope["native"], True)
        self.assertIs(scope["telemetria"], True)
        self.assertEqual(
            scope["telemetria_paths"], ["vantare-v2/native/runtime/src/lib.rs"]
        )

    def test_empty_input_prints_fail_closed_for_both(self) -> None:
        code, decision, scope = self._run(b"")
        self.assertEqual(code, 0)
        self.assertEqual(decision.split("\n"), ["true", "true"])
        self.assertIs(scope["telemetria"], True)

    def test_non_nul_terminated_input_fails(self) -> None:
        code, _, _ = self._run(b"docs/a.md")
        self.assertNotEqual(code, 0)


if __name__ == "__main__":
    unittest.main()
