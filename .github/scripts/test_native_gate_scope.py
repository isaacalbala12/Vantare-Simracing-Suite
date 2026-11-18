#!/usr/bin/env python3
"""Tests del clasificador de rutas de los gates nativos (#1654 rondas 2 y 12)."""

from __future__ import annotations

import hashlib
import json
import re
import shlex
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from native_gate_scope import classify_paths  # noqa: E402


# A grep cannot infer PowerShell ownership. Pin the few reviewed code blocks
# that create or close a handle, including callers of the two handle consumers.
# A legitimate edit to one of these blocks requires re-auditing its provenance.
QA_OWNED_BLOCKS = {
    'TANDA.ps1': {
        'Invoke-TandaProcess': 'd08d529f27a32b17d0e092c89a3d516096f32ad88c7603f0a2eccf14b4da3646',
        'Start-TandaOwned': 'f24f3b7550d04b301f674913979344f88b59a790a3b9fa607417a45bc98cf8f9',
        'Close-TandaOwned': '53df71c3b46da013144f3a4315ef5c974627b5d7956a11bd1fee5f9742acbe46',
        'Get-TandaLiveClock': '36a0add1a4e2aae069228923897b2ef8522b7044b5a71e6b84af42e5505ae8d9',
        'Read-TandaPolicy': '48ade2356867486762333796f9df0722c9aa2a3569057df606d1956cf540616a',
        'Invoke-TandaMeasurement': 'a46266313a213e08cc2c15c948633fe3959ecd382cbabde828aca1d3e7c83293',
    },
    'LICENCIA_TANDA.ps1': {
        'Invoke-TandaLicenseCli': 'e35a701ed0b16e1614de6be812c0b5344b7a73b16e81e12807d2685f0a7d85bd',
    },
    'PROBAR_REPLAY.ps1': {'': '5df98b59a6aeeebb6d56dbe8bd372d2b1a4471fefd15da1c536749797fffce5f'},
    'PROBAR_DERECHOS.ps1': {'': '06fa43b58cac00b85faebb6bfcc332f0f504af1701badf41f521c9283e35c055'},
}
QA_KILL_COMMAND = re.compile(
    r'(?<![\w.-])(?:taskkill|stop-process|pkill|killall|kill|spps|terminateprocess)(?![\w-])',
    re.IGNORECASE,
)
QA_HANDLE_OPERATION = re.compile(
    r"""\.\s*['"]?(?:kill|killpg|terminate)['"]?\s*\(|\b(?:Close-TandaOwned|Get-TandaLiveClock)\b""",
    re.IGNORECASE,
)
PS_FUNCTION = re.compile(r'^function ([\w-]+)\b[^\n]*\n.*?(?=^function |\Z)', re.M | re.S)


def qa_process_violations(relative: str, source: str) -> list[str]:
    errors = []
    approved_ranges = []
    blocks = {match[1]: match.span() for match in PS_FUNCTION.finditer(source)}
    blocks[''] = (0, len(source))
    for name, expected in QA_OWNED_BLOCKS.get(relative, {}).items():
        start, end = blocks.get(name, (0, 0))
        digest = hashlib.sha256(source[start:end].strip().encode('utf-8')).hexdigest()
        if digest != expected:
            errors.append(f'{name or relative}: revisar la procedencia de los procesos')
        else:
            approved_ranges.append((len(source[:start].replace('`', '')), len(source[:end].replace('`', ''))))
    # Treat backticks as PowerShell escapes, including in embedded SSH scripts.
    code = source.replace('`', '')
    if QA_KILL_COMMAND.search(code):
        errors.append('comando de terminación prohibido')
    for match in QA_HANDLE_OPERATION.finditer(code):
        prefix = code[code.rfind('\n', 0, match.start()) + 1:match.start()]
        if prefix.strip().casefold() == 'function':
            continue
        if not any(start <= match.start() < end for start, end in approved_ranges):
            line = code.count('\n', 0, match.start()) + 1
            errors.append(f'operación sobre proceso sin procedencia revisada, línea {line}')
    return errors


class ClassifyPathsTest(unittest.TestCase):
    def test_qa_process_guard_rejects_commands_and_foreign_handles(self) -> None:
        for command in (
            'taskkill /IM node.exe',
            'Stop-Process -Name node',
            'Get-Process -Name node | Stop-Process',
            'pkill node',
            'killall node',
            '$p = [Diagnostics.Process]::GetProcessById(123); $p.Kill()',
            '(Get-Process explorer).Kill($true)',
            '(Get-Process explorer).Ki`ll($true)',
        ):
            with self.subTest(command=command):
                self.assertTrue(qa_process_violations('new.ps1', command))
        self.assertFalse(qa_process_violations('check.ps1', 'Get-Process -Name node'))

    def test_qa_overlays_terminates_only_audited_owned_processes(self) -> None:
        directory = Path(__file__).resolve().parents[2] / 'tools/qa-overlays'
        self.assertTrue(directory.is_dir())
        tanda = (directory / 'TANDA.ps1').read_text(encoding='utf-8-sig')
        tampered = tanda.replace('$p=$Handle.process', '$p=[Diagnostics.Process]::GetProcessById(123)', 1)
        self.assertNotEqual(tampered, tanda)
        self.assertTrue(qa_process_violations('TANDA.ps1', tampered))
        for path in sorted(directory.rglob('*')):
            if path.suffix.casefold() in {'.ps1', '.psm1', '.cmd', '.bat', '.sh', '.py', '.js', '.rs', '.cs'}:
                relative = path.relative_to(directory).as_posix()
                source = path.read_text(encoding='utf-8-sig')
                self.assertEqual(qa_process_violations(relative, source), [], relative)

    def test_qa_license_paths_enter_the_native_gate(self) -> None:
        for relative in (
            "Cargo.toml",
            "src/rights/verifier.rs",
            "src/bin/vantare-qa-license/main.rs",
            "src/bin/vantare-qa-license/cli.rs",
            "tests/qa_license.rs",
        ):
            path = f"vantare-v2/native/runtime/{relative}"
            with self.subTest(path=path):
                scope = classify_paths([path])
                self.assertTrue(scope.native)
                self.assertTrue(scope.telemetria)
                self.assertIn(path, scope.native_paths)

    def test_rune_workspace_is_isolated_but_shared_crates_still_run_native(self):
        paths = ['vantare-v2/native/overlays-rune/Cargo.toml',
                 'vantare-v2/native/overlays-rune/Cargo.lock',
                 'vantare-v2/native/overlays-rune/src/main.rs',
                 '.github/workflows/overlays-rune.yml']
        self.assertFalse(classify_paths(paths).native)
        for crate in ('domain', 'ipc', 'profiling'):
            with self.subTest(crate=crate):
                self.assertTrue(classify_paths(paths + [
                    f'vantare-v2/native/{crate}/src/lib.rs']).native)

    def test_shared_contract_still_runs_native(self):
        paths = ['vantare-v2/hub-web/src/app.tsx']
        self.assertFalse(classify_paths(paths).native)
        for shared in ('vantare-v2/native/hub-host/src/protocol.rs',
                       'vantare-v2/hub-web/design/tokens.json',
                       'vantare-v2/hub-web/fixtures/roadmap.json'):
            with self.subTest(shared=shared):
                self.assertTrue(classify_paths(paths + [shared]).native)

    def test_workflow_diff_keeps_native_deletion_alongside_web_change(self) -> None:
        workflow = (Path(__file__).resolve().parents[1] / 'workflows/branch-channel-gates.yml').read_text(encoding='utf-8')
        line = next(line.strip() for line in workflow.splitlines() if 'if ! git diff' in line)
        command = shlex.split(line.removeprefix('if ! ').split(' > ')[0])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.check_output(['git', '-C', directory, *args])
            git('init', '--quiet')
            native = root / 'vantare-v2/native/runtime/src/removed.rs'
            web = root / 'vantare-v2/hub-web/src/main.ts'
            native.parent.mkdir(parents=True)
            web.parent.mkdir(parents=True)
            native.write_text('fn removed() {}', encoding='utf-8')
            web.write_text('before', encoding='utf-8')
            git('add', '.')
            git('-c', 'user.name=QA', '-c', 'user.email=qa@example.invalid',
                '-c', 'core.hooksPath=', 'commit', '--quiet', '-m', 'before')
            base = git('rev-parse', 'HEAD').decode().strip()
            native.unlink()
            web.write_text('after', encoding='utf-8')
            git('add', '-A')
            git('-c', 'user.name=QA', '-c', 'user.email=qa@example.invalid',
                '-c', 'core.hooksPath=', 'commit', '--quiet', '-m', 'after')
            arguments = [base if token == '$diff_base' else 'HEAD' if token == '$GITHUB_SHA' else token for token in command[1:]]
            paths = git(*arguments).decode().strip('\0').split('\0')
            scope = classify_paths(paths)
            self.assertTrue(scope.native)
            self.assertTrue(scope.telemetria)
            self.assertIn('vantare-v2/native/runtime/src/removed.rs', scope.native_paths)

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

    def test_hub_web_contract_fixtures_and_tokens_keep_native_gates(self) -> None:
        for path in (
            "vantare-v2/hub-web/src/contract/generated/account.ts",
            "vantare-v2/hub-web/fixtures/calendar-ics-gpui.json",
            "vantare-v2/hub-web/design/tokens.json",
        ):
            with self.subTest(path=path):
                scope = classify_paths([path])
                self.assertTrue(scope.native)
                self.assertIn(path, scope.native_paths)
        self.assertFalse(classify_paths(
            ["vantare-v2/hub-web/src/renderer/screens/home.tsx"]).native)

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
            ]
        )
        self.assertFalse(scope.native)
        self.assertEqual(scope.native_paths, ())

    def test_github_scripts_require_the_native_gates(self) -> None:
        # `.github/**` changes how the gates run; they must not skip the native suite.
        scope = classify_paths([".github/scripts/native_gate_scope.py"])
        self.assertTrue(scope.native)
        self.assertEqual(scope.native_paths, (".github/scripts/native_gate_scope.py",))
        self.assertFalse(scope.telemetria)
        self.assertEqual(scope.telemetria_paths, ())

    def test_electron_hub_is_independent_until_native_changes(self) -> None:
        paths = ['vantare-v2/hub-web/src/main/index.ts', '.github/workflows/hub-web.yml']
        self.assertFalse(classify_paths(paths).native)
        self.assertTrue(classify_paths(paths + ['vantare-v2/native/ipc/src/lib.rs']).native)

    def test_compiler_and_gate_inputs_repeat_the_corpus(self) -> None:
        for path in ['vantare-v2/native/Cargo.toml', 'vantare-v2/native/Cargo.lock',
                     'vantare-v2/native/.cargo/config.toml', 'vantare-v2/native/scripts/ci-gates.ps1',
                     '.github/workflows/branch-channel-gates.yml']:
            self.assertTrue(classify_paths([path]).telemetria, path)

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
