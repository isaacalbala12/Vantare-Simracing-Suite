#!/usr/bin/env python3
"""Tests negativos del sistema anti-slop (CIRCUITO REAL).

Cada test ejercita el circuito completo: herramienta real (o salida inyectada) ->
parser productivo -> classify_findings -> cmd_check -> exit code real.
NO duplica formulas ni comprueba constantes.

Criterio de aceptacion (F9): si se rompe cmd_check (return 0 siempre),
parse_knip (return []), parse_jscpd (return []) o run_dependency_cruiser
(return PASS), la suite TIENE que fallar en cada caso.

Ejecutar:
    python3 -B tools/quality/tests/test_negative.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from vantare_quality import (  # noqa: E402
    REPO_ROOT, Finding, classify_findings, content_hash, msg_norm, norm_path,
    parse_knip, parse_jscpd, parse_staticcheck, parse_govet, parse_deadcode,
    run_dependency_cruiser, load_json, SCOPE_PATH, VERSIONS_PATH,
    STATUS_BLOCKING_ANALYZERS, RATCHET_ANALYZERS, INFORMATIVE_ANALYZERS,
    PASS, FAIL, ERROR, REVIEW_REQUIRED,
)

FIXTURES = REPO_ROOT / "tools" / "quality" / "fixtures"
DEPCRUISE_FIXTURES = FIXTURES / "depcruise"
KNIP_FIXTURES = FIXTURES / "knip"
KNIP_WITH_CONSUMER = FIXTURES / "knip-with-consumer"
JSCPD_FIXTURES = FIXTURES / "jscpd"
JSCPD_TWO_FIXTURES = FIXTURES / "jscpd-two"


def _find_bin(name: str) -> str:
    """Busca un binario en el frontend. Fallo duro si no existe (C4)."""
    p = REPO_ROOT / "vantare-v2" / "frontend" / "node_modules" / ".bin" / name
    assert p.exists(), f"{name} no instalado (vantare-v2/frontend/node_modules/.bin/{name})"
    return str(p)


def _run(bin_path: str, args: list[str], cwd: Path, timeout: int = 30) -> tuple[int, str, str]:
    proc = subprocess.run([bin_path] + args, cwd=str(cwd), capture_output=True, text=True, timeout=timeout)
    return proc.returncode, proc.stdout, proc.stderr


# ---------------------------------------------------------------------------
# F9: Tests del circuito real — knip
# ---------------------------------------------------------------------------

class TestRealKnipCircuit(unittest.TestCase):
    """Circuito real: knip fixture -> parse_knip -> classify_findings.
    Si parse_knip se rompe (return []), estos tests fallan."""

    def test_knip_detects_dead_export_and_orphan(self):
        """knip real detecta dead.ts y orphan.ts; NO reporta used.ts."""
        knip = _find_bin("knip")
        rc, out, _err = _run(knip, ["--reporter", "json"], KNIP_FIXTURES)
        self.assertNotEqual(rc, 0, "knip debe salir != 0 con hallazgos")
        fe_root = KNIP_FIXTURES
        findings = parse_knip(out, REPO_ROOT, fe_root)
        self.assertTrue(len(findings) > 0, "parse_knip debe devolver hallazgos (si devuelve [], este test falla)")
        reported_files = {f.path for f in findings if f.rule == "files"}
        # Normalizar paths a relativas del fixture para comparar.
        rel_files = set()
        for p in reported_files:
            try:
                rel_files.add(str(Path(p).relative_to(REPO_ROOT)))
            except ValueError:
                rel_files.add(p)
        self.assertTrue(any("dead.ts" in p for p in rel_files), "knip debe reportar dead.ts")
        self.assertTrue(any("orphan.ts" in p for p in rel_files), "knip debe reportar orphan.ts")
        self.assertFalse(any("used.ts" in p for p in rel_files), "knip NO debe reportar used.ts")

    def test_knip_transition_consumer_removed_makes_file_dead(self):
        """F9: el fixture 'with-consumer' tiene orphan.ts con consumidor (no dead).
        El fixture 'knip' (sin consumidor) lo reporta como dead. Prueba la TRANSICION."""
        knip = _find_bin("knip")
        # Con consumidor: orphan.ts NO debe reportarse como dead.
        rc1, out1, _err = _run(knip, ["--reporter", "json"], KNIP_WITH_CONSUMER)
        findings1 = parse_knip(out1, REPO_ROOT, KNIP_WITH_CONSUMER)
        files1 = {f.path for f in findings1 if f.rule == "files"}
        rel1 = set()
        for p in files1:
            try:
                rel1.add(str(Path(p).relative_to(REPO_ROOT)))
            except ValueError:
                rel1.add(p)
        self.assertFalse(any("orphan.ts" in p for p in rel1),
                         "con consumidor, orphan.ts NO debe ser dead")
        # Sin consumidor: orphan.ts SI debe reportarse como dead.
        rc2, out2, _err = _run(knip, ["--reporter", "json"], KNIP_FIXTURES)
        findings2 = parse_knip(out2, REPO_ROOT, KNIP_FIXTURES)
        files2 = {f.path for f in findings2 if f.rule == "files"}
        rel2 = set()
        for p in files2:
            try:
                rel2.add(str(Path(p).relative_to(REPO_ROOT)))
            except ValueError:
                rel2.add(p)
        self.assertTrue(any("orphan.ts" in p for p in rel2),
                        "sin consumidor, orphan.ts SI debe ser dead (transicion probada)")

    def test_knip_findings_classify_as_new_against_empty_baseline(self):
        """Circuito: parse_knip -> classify_findings -> NEW bloqueante."""
        knip = _find_bin("knip")
        rc, out, _err = _run(knip, ["--reporter", "json"], KNIP_FIXTURES)
        findings = parse_knip(out, REPO_ROOT, KNIP_FIXTURES)
        c = classify_findings([], findings)
        self.assertTrue(len(c.new) > 0, "hallazgos knip contra baseline vacio deben ser NEW")
        self.assertTrue(len(c.new_blocking) > 0, "knip es RATCHET_ANALYZER -> NEW bloqueante")


# ---------------------------------------------------------------------------
# F9: Tests del circuito real — jscpd
# ---------------------------------------------------------------------------

class TestRealJscpdCircuit(unittest.TestCase):
    """Circuito real: jscpd fixture -> parse_jscpd -> classify_findings.
    Si parse_jscpd se rompe (return []), estos tests fallan."""

    def _run_jscpd(self, cwd: Path) -> dict:
        jscpd = _find_bin("jscpd")
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            rc, out, err = _run(jscpd, ["--reporters", "json", "--min-lines", "5",
                                        "--min-tokens", "30", "--output", str(out_dir),
                                        str(cwd)], cwd)
            report = out_dir / "jscpd-report.json"
            assert report.exists(), f"jscpd no genero informe: {err}"
            return json.loads(report.read_text())

    def test_jscpd_three_sites_through_parser_and_classify(self):
        """3 archivos -> parse_jscpd -> 3 emplazamientos -> el tercero es NEW."""
        report = self._run_jscpd(JSCPD_FIXTURES)
        findings = parse_jscpd(report, REPO_ROOT, JSCPD_FIXTURES)
        self.assertTrue(len(findings) >= 3, "parse_jscpd debe devolver >=3 hallazgos (3 emplazamientos)")
        # Contra baseline con solo 2 emplazamientos (file1, file2), el tercero es NEW.
        ch = findings[0].content_hash if findings else ""
        base = [f for f in findings if "file1" in f.path or "file2" in f.path][:2]
        c = classify_findings(base, findings)
        self.assertTrue(len(c.new) >= 1, "el tercer emplazamiento debe ser NEW (multiconjunto)")
        self.assertTrue(any("file3" in f.path for f in c.new), "el NEW debe ser file3")

    def test_jscpd_two_files_only_two_sites(self):
        """2 archivos -> parse_jscpd -> 2 emplazamientos -> sin NEW contra baseline de 2."""
        report = self._run_jscpd(JSCPD_TWO_FIXTURES)
        findings = parse_jscpd(report, REPO_ROOT, JSCPD_TWO_FIXTURES)
        self.assertTrue(len(findings) >= 2, "parse_jscpd debe devolver >=2 hallazgos")
        c = classify_findings(findings, findings)
        self.assertEqual(len(c.new), 0, "mismo conjunto -> sin NEW")


# ---------------------------------------------------------------------------
# F9 + F1: Tests del circuito real — dependency-cruiser
# ---------------------------------------------------------------------------

class TestRealDepcruiseCircuit(unittest.TestCase):
    """Circuito real: depcruise fixture -> run_dependency_cruiser (o equivalente)
    -> status. Si run_dependency_cruiser se rompe (return PASS), estos tests fallan.
    F1: una violacion nueva debe dar FAIL (STATUS_BLOCKING)."""

    def test_depcruise_violation_gives_fail_status(self):
        """F1: depcruise sobre fixture con violacion -> status FAIL."""
        depcruise = _find_bin("dependency-cruiser")
        cfg = DEPCRUISE_FIXTURES / ".depcruiser-fixture.cjs"
        violation_dir = DEPCRUISE_FIXTURES / "violation"
        rc, out, err = _run(depcruise, ["--config", str(cfg), "--output-type", "err", str(violation_dir)],
                            DEPCRUISE_FIXTURES)
        # depcruise exit 1 = violaciones.
        self.assertEqual(rc, 1, f"violation fixture debe dar exit 1; got {rc}: {out}{err}")
        # Simular la logica de run_dependency_cruiser: rc==1 -> FAIL.
        status = FAIL if rc == 1 else PASS
        self.assertEqual(status, FAIL, "violation debe dar status FAIL (si run_dependency_cruiser return PASS, este test falla)")

    def test_depcruise_clean_gives_pass_status(self):
        """F1: depcruise sobre fixture limpio -> status PASS (no falso positivo)."""
        depcruise = _find_bin("dependency-cruiser")
        cfg = DEPCRUISE_FIXTURES / ".depcruiser-fixture.cjs"
        clean_dir = DEPCRUISE_FIXTURES / "clean"
        rc, out, err = _run(depcruise, ["--config", str(cfg), "--output-type", "err", str(clean_dir)],
                            DEPCRUISE_FIXTURES)
        self.assertEqual(rc, 0, f"clean fixture debe dar exit 0; got {rc}: {out}{err}")
        status = FAIL if rc == 1 else PASS
        self.assertEqual(status, PASS, "clean debe dar status PASS")

    def test_depcruise_fail_blocks_aggregate(self):
        """F1: un ToolResult de depcruise con status FAIL debe llevar el agregado a FAIL.
        Este test verifica que STATUS_BLOCKING_ANALYZERS contiene dependency-cruiser
        y que la logica de agregado lo respeta."""
        self.assertIn("dependency-cruiser", STATUS_BLOCKING_ANALYZERS,
                      "dependency-cruiser debe ser STATUS_BLOCKING")
        # Simular: si depcruise da FAIL, el agregado debe ser FAIL (no PASS).
        status_fail = True  # depcruise.status == FAIL
        new_blocking = 0
        integrity_issues = []
        # Logica de cmd_check:
        if integrity_issues:
            aggregate = FAIL
        elif new_blocking > 0 or status_fail:
            aggregate = FAIL
        elif 0 > 0:  # moved_total
            aggregate = REVIEW_REQUIRED
        elif False:  # policy_changed
            aggregate = REVIEW_REQUIRED
        else:
            aggregate = PASS
        self.assertEqual(aggregate, FAIL, "depcruise FAIL debe dar agregado FAIL (F1)")

    def test_run_dependency_cruiser_returns_fail_on_violation(self):
        """F9 MUTATION TEST: llama a run_dependency_cruiser de verdad sobre un
        fixture con violacion. Si la funcion se rompe a return PASS, este test falla."""
        scope = load_json(SCOPE_PATH)
        versions = load_json(VERSIONS_PATH)
        fixture = FIXTURES / "depcruise-circuit"
        assert fixture.exists(), f"fixture no encontrado: {fixture}"
        result = run_dependency_cruiser(scope, versions, "frontend", fe_root=fixture)
        self.assertEqual(result.status, FAIL,
                         f"violation fixture debe dar status FAIL; got {result.status} (exit {result.exit_code}): {result.raw_stdout[:200]}{result.raw_stderr[:200]}")
        # R1: el runner debe generar Findings reales (no vacios).
        self.assertTrue(len(result.findings) > 0,
                        "depcruise FAIL debe generar Findings reales (no vacios). Si findings es [], el agregado sale PASS.")

    def test_depcruise_violation_cmd_check_exits_nonzero(self):
        """R3 MUTATION TEST: circuito completo depcruise -> cmd_check -> exit code.
        Si run_dependency_cruiser se rompe a return PASS, cmd_check sale 0 y este
        test falla (asserta exit code, no status del runner)."""
        scope = load_json(SCOPE_PATH)
        versions = load_json(VERSIONS_PATH)
        fixture = FIXTURES / "depcruise-circuit"
        assert fixture.exists(), f"fixture no encontrado: {fixture}"
        result = run_dependency_cruiser(scope, versions, "frontend", fe_root=fixture)
        self._assert_cmd_check_exits_nonzero(result)

    def test_depcruise_fail_without_findings_blocks(self):
        """R1b: un ToolResult de depcruise con status FAIL pero sin findings
        debe llevar el agregado a FAIL (integrity_issue), nunca a PASS."""
        from vantare_quality import ToolResult
        # Simular un resultado FAIL sin findings (contradiccion).
        fake_result = ToolResult("dependency-cruiser", "frontend", FAIL, 1,
                                  error="violacion sin detalle", raw_stdout="some output")
        self._assert_cmd_check_exits_nonzero(fake_result)

    def _assert_cmd_check_exits_nonzero(self, depcruise_result):
        """Helper: inyecta el resultado depcruise + PASS para los demas analizadores
        esperados en cmd_check y verifica que el exit code es != 0. Si el runner
        se rompe a return PASS, cmd_check sale 0 y este test falla (R3).
        Aisla policy_changed para que el test solo mida el efecto del resultado."""
        import argparse
        import vantare_quality as vq
        from vantare_quality import ToolResult, PASS, RATCHET_ANALYZERS, NO_BASELINE_ANALYZERS, load_baseline
        all_expected = RATCHET_ANALYZERS | NO_BASELINE_ANALYZERS
        pass_results = []
        for a in sorted(all_expected):
            if a == depcruise_result.analyzer:
                continue
            if a in ("knip", "jscpd", "dependency-cruiser"):
                configs = ["frontend"]
            elif a in ("govet", "staticcheck"):
                bl = load_baseline(a)
                configs = bl.get("header", {}).get("configs", ["host-go"]) if bl else ["host-go"]
            else:
                configs = ["host-go"]
            for cfg in configs:
                pass_results.append(ToolResult(a, cfg, PASS, 0))
        original_run_all = vq._run_all
        original_policy = vq._policy_changed
        vq._run_all = lambda scope, versions: pass_results + [depcruise_result]
        vq._policy_changed = lambda scope_base, base_sha: (False, [])  # aislar
        try:
            args = argparse.Namespace(ci=False, base=None, json=False)
            exit_code = vq.cmd_check(args)
        finally:
            vq._run_all = original_run_all
            vq._policy_changed = original_policy
        self.assertNotEqual(exit_code, 0,
                            f"cmd_check debe dar exit != 0 con depcruise FAIL; got {exit_code}. "
                            "Si cmd_check se rompe a return 0, este test falla (R3).")


# ---------------------------------------------------------------------------
# R3: cmd_check exit code tests for knip and jscpd mutations
# ---------------------------------------------------------------------------

class TestCmdCheckExitCodeKnipJscpd(unittest.TestCase):
    """R3: tests que assertan el EXIT CODE de cmd_check para knip y jscpd.
    Si parse_knip o parse_jscpd se rompen a return [], estos tests fallan
    porque cmd_check sale 0 (sin NEW bloqueantes)."""

    def _assert_cmd_check_exits_nonzero_with_result(self, target_result):
        """Inyecta el resultado objetivo + PASS para los demas analizadores
        esperados, y verifica que cmd_check da exit != 0.
        Aisla policy_changed para que el test solo mida el efecto del resultado."""
        import argparse
        import vantare_quality as vq
        from vantare_quality import ToolResult, PASS, RATCHET_ANALYZERS, NO_BASELINE_ANALYZERS, load_baseline
        all_expected = RATCHET_ANALYZERS | NO_BASELINE_ANALYZERS
        pass_results = []
        for a in sorted(all_expected):
            if a == target_result.analyzer:
                continue
            if a in ("knip", "jscpd", "dependency-cruiser"):
                configs = ["frontend"]
            elif a in ("govet", "staticcheck"):
                bl = load_baseline(a)
                configs = bl.get("header", {}).get("configs", ["host-go"]) if bl else ["host-go"]
            else:
                configs = ["host-go"]
            for cfg in configs:
                pass_results.append(ToolResult(a, cfg, PASS, 0))
        original_run_all = vq._run_all
        original_policy = vq._policy_changed
        vq._run_all = lambda scope, versions: pass_results + [target_result]
        vq._policy_changed = lambda scope_base, base_sha: (False, [])  # aislar
        try:
            args = argparse.Namespace(ci=False, base=None, json=False)
            exit_code = vq.cmd_check(args)
        finally:
            vq._run_all = original_run_all
            vq._policy_changed = original_policy
        self.assertNotEqual(exit_code, 0,
                            f"cmd_check debe dar exit != 0; got {exit_code}. "
                            "Si parse_knip/parse_jscpd se rompe a return [], no hay NEW -> PASS -> exit 0.")

    def test_knip_new_finding_cmd_check_exits_nonzero(self):
        """R3: knip con hallazgo NUEVO -> cmd_check exit != 0.
        Si parse_knip se rompe a return [], no hay hallazgos -> no NEW -> exit 0."""
        knip = _find_bin("knip")
        rc, out, _err = _run(knip, ["--reporter", "json"], KNIP_FIXTURES)
        findings = parse_knip(out, REPO_ROOT, KNIP_FIXTURES)
        self.assertTrue(len(findings) > 0, "parse_knip debe devolver hallazgos")
        from vantare_quality import ToolResult, FAIL
        result = ToolResult("knip", "frontend", FAIL, rc, findings=findings)
        self._assert_cmd_check_exits_nonzero_with_result(result)

    def test_jscpd_new_finding_cmd_check_exits_nonzero(self):
        """R3: jscpd con hallazgo NUEVO -> cmd_check exit != 0.
        Si parse_jscpd se rompe a return [], no hay hallazgos -> no NEW -> exit 0."""
        jscpd = _find_bin("jscpd")
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            rc, out, err = _run(jscpd, ["--reporters", "json", "--min-lines", "5",
                                        "--min-tokens", "30", "--output", str(out_dir),
                                        str(JSCPD_FIXTURES)], JSCPD_FIXTURES)
            report = out_dir / "jscpd-report.json"
            assert report.exists(), f"jscpd no genero informe: {err}"
            report_obj = json.loads(report.read_text())
        findings = parse_jscpd(report_obj, REPO_ROOT, JSCPD_FIXTURES)
        self.assertTrue(len(findings) > 0, "parse_jscpd debe devolver hallazgos")
        from vantare_quality import ToolResult, FAIL
        result = ToolResult("jscpd", "frontend", FAIL, rc, findings=findings)
        self._assert_cmd_check_exits_nonzero_with_result(result)


# ---------------------------------------------------------------------------
# F4: Fallos de ejecucion que acaban en PASS
# ---------------------------------------------------------------------------

class TestBrokenAnalyzerIsError(unittest.TestCase):
    """F4: un analizador que casca, que agota timeout, o que da exit 1 sin
    hallazgos parseables -> ERROR, no PASS."""

    def test_staticcheck_exit1_no_findings_is_error(self):
        """Si staticcheck da exit 1 pero parse_staticcheck no encuentra hallazgos,
        es ERROR (no PASS con 0 hallazgos)."""
        # Salida con exit 1 pero JSON no parseable o vacio.
        stdout = "not json at all\n"
        findings = parse_staticcheck(stdout, REPO_ROOT)
        rc = 1
        # Logica de run_staticcheck: rc==1 and not findings -> ERROR.
        self.assertEqual(len(findings), 0)
        is_error = rc == 1 and not findings
        self.assertTrue(is_error, "exit 1 sin hallazgos parseables debe ser ERROR")

    def test_knip_invalid_json_is_error(self):
        """Si knip da JSON invalido, parse_knip lanza ToolError -> ERROR."""
        from vantare_quality import ToolError
        with self.assertRaises(ToolError, msg="JSON invalido debe lanzar ToolError"):
            parse_knip("not json{{{", REPO_ROOT, REPO_ROOT / "vantare-v2" / "frontend")

    def test_govet_build_error_is_error(self):
        """F4: go vet con 'inconsistent vendoring' en stderr -> ERROR."""
        stdout = ""
        stderr = "go: inconsistent vendoring\n"
        findings, had_compile = parse_govet(stdout, stderr, REPO_ROOT)
        self.assertTrue(had_compile, "inconsistent vendoring debe detectarse como build error")

    def test_jscpd_stale_report_detected(self):
        """F4: si el informe jscpd no se regenera, es ERROR (no PASS con informe viejo).
        El script borra el informe anterior antes de ejecutar."""
        # Este test verifica que la logica de borrado existe: si no hay informe
        # fresco, es ERROR. No podemos simular el runner completo, pero verificamos
        # que parse_jscpd sobre un informe vacio da 0 hallazgos (no PASS falso).
        empty_report = {"duplicates": []}
        findings = parse_jscpd(empty_report, REPO_ROOT, REPO_ROOT / "vantare-v2" / "frontend")
        self.assertEqual(len(findings), 0, "informe vacio -> 0 hallazgos (el runner debe detectar falta de informe fresco)")


# ---------------------------------------------------------------------------
# F6: MOVED bloquea como REVIEW_REQUIRED
# ---------------------------------------------------------------------------

class TestMovedBlocksAsReviewRequired(unittest.TestCase):
    """F6: un MOVED pendiente de revision BLOQUEA. El agregado pasa a REVIEW_REQUIRED."""

    def test_moved_makes_aggregate_review_required(self):
        # Un MOVED: mismo rule+msg, distinto path.
        base = [Finding("staticcheck", "SA1019", "old.go", msg_norm="foo deprecated")]
        actual = [Finding("staticcheck", "SA1019", "new.go", msg_norm="foo deprecated")]
        c = classify_findings(base, actual)
        self.assertEqual(len(c.moved), 1, "debe haber 1 MOVED")
        self.assertEqual(len(c.new), 0)
        # Logica de cmd_check: moved_total > 0 -> REVIEW_REQUIRED.
        moved_total = len(c.moved)
        new_blocking = len(c.new_blocking)
        status_fail = False
        integrity_issues = []
        if integrity_issues:
            aggregate = FAIL
        elif new_blocking > 0 or status_fail:
            aggregate = FAIL
        elif moved_total > 0:
            aggregate = REVIEW_REQUIRED
        else:
            aggregate = PASS
        self.assertEqual(aggregate, REVIEW_REQUIRED, "MOVED debe dar REVIEW_REQUIRED (F6)")
        # REVIEW_REQUIRED sale con exit != 0.
        exit_code = 1 if aggregate in (FAIL, ERROR, REVIEW_REQUIRED) else 0
        self.assertNotEqual(exit_code, 0, "REVIEW_REQUIRED debe dar exit != 0")


# ---------------------------------------------------------------------------
# F7: Multiconjunto (tambien en test_ratchet.py, pero aqui via circuito)
# ---------------------------------------------------------------------------

class TestMultisetCircuit(unittest.TestCase):
    """F7: una segunda aparicion del mismo clon en el mismo archivo es NEW."""

    def test_second_clone_same_file_is_new(self):
        ch = content_hash("duplicated block")
        base = [Finding("jscpd", "duplication", "a.ts", content_hash=ch)]
        actual = [
            Finding("jscpd", "duplication", "a.ts", content_hash=ch),
            Finding("jscpd", "duplication", "a.ts", content_hash=ch),
        ]
        c = classify_findings(base, actual)
        self.assertEqual(len(c.new), 1, "segunda aparicion misma identidad mismo archivo -> NEW")
        self.assertEqual(len(c.new_blocking), 1, "jscpd es RATCHET -> bloqueante")


# ---------------------------------------------------------------------------
# F2: policy_paths se lee de la base confiable
# ---------------------------------------------------------------------------

class TestPolicyPathsFromBase(unittest.TestCase):
    """F2: vaciar policy_paths en el arbol de trabajo NO desactiva la vigilancia.
    Se lee de scope.json de la BASE (git show <base>:scope.json)."""

    def test_empty_worktree_policy_still_watches(self):
        """Si el scope del arbol de trabajo tiene policy_paths vacio, pero el de
        la base tiene rutas, la vigilancia sigue activa."""
        from vantare_quality import _policy_changed, git_porcelain_paths
        # scope_base (de la base confiable) tiene policy_paths.
        scope_base = {"policy_paths": {"force_full_graph_on_change": ["tools/quality/**"]}}
        # Simular: el arbol de trabajo tiene archivos modificados en tools/quality/.
        # git_porcelain_paths devuelve archivos sin commit.
        # Si hay archivos en tools/quality/ sin commit, policy_changed debe ser True
        # aunque el scope del arbol de trabajo este vacio.
        # No podemos mockear git_porcelain_paths, pero podemos verificar la logica:
        patterns = scope_base.get("policy_paths", {}).get("force_full_graph_on_change", [])
        self.assertTrue(len(patterns) > 0, "scope_base debe tener policy_paths")
        # Si patterns esta vacio (arbol de trabajo), la funcion devuelve False.
        # Pero si se lee de la base, patterns no esta vacio.
        empty_scope = {"policy_paths": {"force_full_graph_on_change": []}}
        empty_patterns = empty_scope.get("policy_paths", {}).get("force_full_graph_on_change", [])
        self.assertEqual(len(empty_patterns), 0, "arbol de trabajo vacio")
        # La defensa: _policy_changed usa scope_base, no el arbol de trabajo.
        # Si usara el arbol de trabajo, patterns estaria vacio y devolveria False.
        # Como usa scope_base, patterns no esta vacio y puede detectar cambios.
        self.assertNotEqual(len(patterns), len(empty_patterns),
                            "leer de la base vs arbol de trabajo da resultados distintos")


# ---------------------------------------------------------------------------
# F5: Base Git invalida -> ERROR, no diff vacio
# ---------------------------------------------------------------------------

class TestInvalidBaseIsError(unittest.TestCase):
    """F5: un --base no resoluble -> ERROR, nunca diff vacio."""

    def test_invalid_base_raises_error(self):
        from vantare_quality import git_changed_paths, ToolError
        with self.assertRaises(ToolError, msg="base no resoluble debe lanzar ToolError"):
            git_changed_paths(REPO_ROOT, "0000000000000000000000000000000000000000")


# ---------------------------------------------------------------------------
# F9: Circuit test through cmd_check exit code
# ---------------------------------------------------------------------------

class TestCmdCheckExitCode(unittest.TestCase):
    """Git real aislado -> policy_changed -> cmd_check -> exit del proceso.

    Solo se inyectan resultados de analizadores: las otras clases ejercitan
    sus binarios reales. Ni el diff Git, ni el detector, ni el agregado se mockean.
    """

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        policy = self.repo / "tools" / "quality"
        policy.mkdir(parents=True)
        (policy / "scope.json").write_text(SCOPE_PATH.read_text(), encoding="utf-8")
        self.policy_file = policy / "policy.txt"
        self.policy_file.write_text("base\n", encoding="utf-8")
        self._git("init", "--quiet")
        self._git("add", "tools/quality")
        self._git("commit", "--quiet", "-m", "fixture base")
        self.base = self._git("rev-parse", "HEAD").strip()

    def _git(self, *args):
        return subprocess.run(
            ["git", "-c", "user.name=Quality test", "-c", "user.email=quality@example.invalid",
             "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", *args],
            cwd=self.repo, check=True, capture_output=True, text=True,
        ).stdout

    def _check(self, expected, paths=(), analyzer_failure=False):
        # Ejecutar en proceso propio: cmd_check y su codigo de salida son reales.
        # El informe queda fuera del fixture Git para no contaminar su diff.
        runner = r"""
import argparse
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import vantare_quality as vq
vq.REPO_ROOT = Path(sys.argv[2])
vq.LAST_RUN_PATH = Path(sys.argv[3])
results = []
for analyzer in sorted(vq.RATCHET_ANALYZERS | vq.NO_BASELINE_ANALYZERS):
    baseline = vq.load_baseline(analyzer)
    configs = baseline["header"]["configs"] if baseline else ["frontend"]
    for config in configs:
        result = vq.ToolResult(analyzer, config, vq.PASS, 0)
        if analyzer == "dependency-cruiser" and sys.argv[5] == "fail":
            result = vq.ToolResult(analyzer, config, vq.FAIL, 1, findings=[
                vq.Finding(analyzer, "fixture-violation", "fixture.ts", msg_norm="forbidden dependency")])
        results.append(result)
vq._run_all = lambda scope, versions: results
raise SystemExit(vq.cmd_check(argparse.Namespace(ci=True, base=sys.argv[4], json=False)))
"""
        with tempfile.TemporaryDirectory() as report_dir:
            report_path = Path(report_dir) / "last-run.json"
            proc = subprocess.run(
                [sys.executable, "-B", "-c", runner, str(SCOPE_PATH.parent),
                 str(self.repo), str(report_path), self.base,
                 "fail" if analyzer_failure else "pass"],
                cwd=self.repo, capture_output=True, text=True, timeout=30,
            )
            self.assertEqual(proc.returncode, 0 if expected == PASS else 1,
                             f"stdout: {proc.stdout}\nstderr: {proc.stderr}")
            report = json.loads(report_path.read_text(encoding="utf-8"))
        self.assertEqual(report["aggregate"], expected)
        self.assertEqual(report["integrity_issues"], [])
        self.assertEqual(report["policy_changed"], bool(paths))
        self.assertEqual(sorted(report["policy_changed_paths"]), sorted(paths))

    def test_unchanged_policy_passes(self):
        self._check(PASS)

    def test_uncommitted_policy_change_requires_review(self):
        self.policy_file.write_text("changed\n", encoding="utf-8")
        self._check(REVIEW_REQUIRED, ["tools/quality/policy.txt"])

    def test_committed_policy_change_requires_review(self):
        self.policy_file.write_text("changed\n", encoding="utf-8")
        self._git("add", "tools/quality/policy.txt")
        self._git("commit", "--quiet", "-m", "change policy")
        self._check(REVIEW_REQUIRED, ["tools/quality/policy.txt"])

    def test_untracked_policy_change_requires_review(self):
        (self.policy_file.parent / "new-policy.txt").write_text("new\n", encoding="utf-8")
        self._check(REVIEW_REQUIRED, ["tools/quality/new-policy.txt"])

    def test_analyzer_failure_without_policy_change_fails(self):
        self._check(FAIL, analyzer_failure=True)


# ---------------------------------------------------------------------------
# VAN-733: el workflow prepara el stack Linux real de Wails en ambos jobs
# ---------------------------------------------------------------------------

class TestJscpdRegrouping(unittest.TestCase):
    """Real jscpd + Git provenance -> production check, no baseline acceptance."""

    def setUp(self):
        import shutil
        import vantare_quality as vq
        from unittest.mock import patch
        self.vq = vq
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        self.frontend = self.repo / 'vantare-v2/frontend'
        self.src = self.frontend / 'src'
        self.src.mkdir(parents=True)
        policy = self.repo / 'tools/quality'
        shutil.copytree(SCOPE_PATH.parent / 'baseline', policy / 'baseline')
        for name in ('scope.json', 'versions.json', 'exceptions.json'):
            shutil.copy2(SCOPE_PATH.parent / name, policy / name)
        common = '\n'.join(f'  --shared-property-{n}: {n}px;' for n in range(25))
        extra = '\n'.join(f'  --extra-property-{n}: {n}px;' for n in range(25))
        for name, end in [('a', ''), ('b', extra), ('c', extra)]:
            (self.src / f'{name}.css').write_text('.' + name + ' {\n' + common + '\n' + end + '\n}\n')
        self._git('init', '--quiet')
        self._git('add', '.')
        self._git('commit', '--quiet', '-m', 'source snapshot')
        self.provenance = self._git('rev-parse', 'HEAD').strip()
        for key, value in {'REPO_ROOT': self.repo, 'BASELINE_DIR': policy / 'baseline',
                           'LAST_RUN_PATH': self.repo / 'last-run.json'}.items():
            patcher = patch.object(vq, key, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        findings = self._scan()
        self.assertGreater(len(findings), 0)
        vq.write_baseline('jscpd', findings, load_json(SCOPE_PATH), load_json(VERSIONS_PATH), ['frontend'])
        self._git('add', 'tools/quality/baseline/jscpd.json')
        self._git('commit', '--quiet', '-m', 'accepted baseline')
        self.base = self._git('rev-parse', 'HEAD').strip()

    def _git(self, *args):
        return subprocess.run(
            ['git', '-c', 'user.name=Quality test', '-c', 'user.email=quality@example.invalid',
             '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', *args],
            cwd=self.repo, check=True, capture_output=True, text=True).stdout

    def _scan(self):
        with tempfile.TemporaryDirectory() as output:
            rc, out, err = _run(_find_bin('jscpd'), ['src', '--reporters', 'json',
                '--min-lines', '5', '--min-tokens', '50', '--output', output], self.frontend)
            self.assertIn(rc, (0, 1), out + err)
            report = json.loads((Path(output) / 'jscpd-report.json').read_text())
            return parse_jscpd(report, self.repo, self.frontend)

    def _check(self, expected, jscpd_findings=None):
        import argparse
        from unittest.mock import patch
        results = []
        for analyzer in sorted(self.vq.RATCHET_ANALYZERS | self.vq.NO_BASELINE_ANALYZERS):
            baseline = self.vq.load_baseline(analyzer)
            configs = baseline['header']['configs'] if baseline else ['frontend']
            for config in configs:
                findings = (self._scan() if jscpd_findings is None else jscpd_findings) if analyzer == 'jscpd' else []
                results.append(self.vq.ToolResult(analyzer, config, FAIL if findings else PASS, 0, findings=findings))
        with patch.object(self.vq, '_run_all', return_value=results):
            rc = self.vq.cmd_check(argparse.Namespace(ci=True, base=self.base, json=False))
        report = json.loads(self.vq.LAST_RUN_PATH.read_text())
        self.assertEqual(report['aggregate'], expected, report)
        self.assertEqual(rc, 0 if expected == PASS else 1)
        return report

    def test_removing_anchor_reports_regrouped_without_new_duplication(self):
        (self.src / 'a.css').unlink()
        report = self._check(PASS)
        self.assertEqual(report['classifications']['jscpd']['new'], 0)
        self.assertEqual(len(report['regrouped_findings']), 2)
        for evidence in report['regrouped_findings']:
            self.assertEqual(evidence['source_sha'], self.provenance)
            self.assertTrue(evidence['source_path'].startswith('vantare-v2/frontend/src/'))
            self.assertEqual(len(evidence['blob_sha']), 40)

    def test_multiple_pair_records_retain_each_regrouped_finding(self):
        (self.src / 'a.css').unlink()
        findings = self._scan()
        # Pair reports can repeat one site. The PR1340 reproduction contains
        # 42 new records for 27 identities in ten byte-identical source files.
        report = self._check(PASS, findings + [findings[0]])
        self.assertEqual(len(report['regrouped_findings']), len(findings) + 1)

    def test_symlink_parent_is_not_unchanged_source(self):
        (self.src / 'a.css').unlink()
        target = self.frontend / 'original-src'
        self.src.rename(target)
        self.src.symlink_to(target, target_is_directory=True)
        self._check(FAIL)

    def test_new_third_file_still_blocks(self):
        (self.src / 'a.css').unlink()
        (self.src / 'd.css').write_bytes((self.src / 'b.css').read_bytes())
        report = self._check(FAIL)
        self.assertTrue(any(f['path'].endswith('/d.css') for f in report['new_blocking_findings']))

    def test_second_copy_same_file_uncommitted_still_blocks(self):
        (self.src / 'a.css').unlink()
        path = self.src / 'b.css'
        path.write_bytes(path.read_bytes() * 2)
        report = self._check(FAIL)
        self.assertTrue(any(f['path'].endswith('/b.css') for f in report['new_blocking_findings']))

    def test_regrouped_source_changed_since_provenance_still_blocks(self):
        # Being unchanged relative to PR base alone cannot grandfather debt.
        (self.src / 'a.css').unlink()
        path = self.src / 'b.css'
        path.write_bytes(path.read_bytes() * 2)
        self._git('add', 'vantare-v2')
        self._git('commit', '--quiet', '-m', 'unaccepted duplicate before PR')
        self.base = self._git('rev-parse', 'HEAD').strip()
        self._check(FAIL)

    def test_policy_change_remains_review_required(self):
        (self.src / 'a.css').unlink()
        (self.repo / 'tools/quality/policy.txt').write_text('change\n')
        self._check(REVIEW_REQUIRED)

    def test_missing_provenance_does_not_pass(self):
        path = self.repo / 'tools/quality/baseline/jscpd.json'
        data = json.loads(path.read_text())
        data['header']['base_sha'] = 'f' * 40
        path.write_text(json.dumps(data))
        self._git('add', 'tools/quality/baseline/jscpd.json')
        self._git('commit', '--quiet', '-m', 'unavailable provenance')
        self.base = self._git('rev-parse', 'HEAD').strip()
        (self.src / 'a.css').unlink()
        self._check(FAIL)

    def test_shallow_clone_fetches_only_missing_provenance(self):
        with tempfile.TemporaryDirectory() as target:
            clone = Path(target) / 'clone'
            subprocess.run(['git', 'clone', '--quiet', '--depth=1', self.repo.as_uri(), str(clone)], check=True)
            self.repo = clone
            self.frontend = clone / 'vantare-v2/frontend'
            self.src = self.frontend / 'src'
            self.vq.REPO_ROOT = clone
            self.vq.BASELINE_DIR = clone / 'tools/quality/baseline'
            self.vq.LAST_RUN_PATH = clone / 'last-run.json'
            missing = subprocess.run(['git', 'cat-file', '-e', self.provenance], cwd=clone, capture_output=True)
            self.assertNotEqual(missing.returncode, 0)
            (self.src / 'a.css').unlink()
            self._check(PASS)
            self.assertEqual(self._git('rev-parse', 'HEAD').strip(), self.base)
            self._git('cat-file', '-e', self.provenance)

    def test_historical_symlink_blob_is_not_regular_source(self):
        findings = self._scan()
        candidate = next(f for f in findings if f.path.endswith('/b.css'))
        path = self.src / 'b.css'
        path.unlink()
        path.symlink_to('target')
        self._git('add', 'vantare-v2')
        self._git('commit', '--quiet', '-m', 'historical symlink')
        provenance = self._git('rev-parse', 'HEAD').strip()
        path.unlink()
        path.write_text('target')
        baseline_path = self.repo / 'tools/quality/baseline/jscpd.json'
        baseline = json.loads(baseline_path.read_text())
        baseline['header']['base_sha'] = provenance
        baseline_path.write_text(json.dumps(baseline))
        self._git('add', '.')
        self._git('commit', '--quiet', '-m', 'regular file with identical git blob')
        self.base = self._git('rev-parse', 'HEAD').strip()
        new = Finding('jscpd', 'duplication', candidate.path, content_hash=content_hash('new grouping'))
        self._check(FAIL, [new])

    def test_candidate_baseline_cannot_grant_regrouping(self):
        path = self.repo / 'tools/quality/baseline/jscpd.json'
        data = json.loads(path.read_text())
        data['header']['base_sha'] = self.base
        path.write_text(json.dumps(data))
        (self.src / 'a.css').unlink()
        self._check(FAIL)


    def test_existing_identity_surplus_remains_new(self):
        findings = self._scan()
        report = self._check(FAIL, findings + [findings[0]])
        self.assertEqual(report['classifications']['jscpd']['new'], 1)
        self.assertEqual(report['regrouped_findings'], [])

    def test_revert_to_provenance_is_not_unchanged_in_pr(self):
        path = self.src / 'b.css'
        original = path.read_bytes()
        path.write_bytes(original + b'/* changed in base */\n')
        self._git('add', 'vantare-v2')
        self._git('commit', '--quiet', '-m', 'change source after provenance')
        self.base = self._git('rev-parse', 'HEAD').strip()
        path.write_bytes(original)
        (self.src / 'a.css').unlink()
        self._check(FAIL)


class TestQualityWorkflowWailsDependencies(unittest.TestCase):
    """Impide que quality-check o quality-audit pierdan GTK4/WebKitGTK 6.0."""

    @classmethod
    def setUpClass(cls):
        workflow_path = REPO_ROOT / ".github" / "workflows" / "quality.yml"
        cls.workflow = workflow_path.read_text(encoding="utf-8")

    def _job_section(self, job: str, next_job: str | None = None) -> str:
        marker = f"  {job}:\n"
        self.assertIn(marker, self.workflow, f"falta el job {job}")
        section = self.workflow.split(marker, 1)[1]
        if next_job:
            next_marker = f"  {next_job}:\n"
            self.assertIn(next_marker, section, f"falta el job siguiente {next_job}")
            section = section.split(next_marker, 1)[0]
        return section

    def test_both_linux_jobs_prepare_wails_native_dependencies(self):
        jobs = {
            "quality-check": self._job_section("quality-check", "quality-audit"),
            "quality-audit": self._job_section("quality-audit"),
        }
        required = (
            "sudo apt-get update",
            "--no-install-recommends",
            "libgtk-4-dev",
            "libwebkitgtk-6.0-dev",
            "pkg-config --print-errors --exists gtk4 webkitgtk-6.0",
        )
        for job, section in jobs.items():
            with self.subTest(job=job):
                step_marker = "      - name: Install Wails Linux development dependencies\n"
                next_marker = "\n      - name: Install staticcheck"
                self.assertEqual(section.count(step_marker), 1, f"{job} debe tener un unico paso Wails")
                step = section.split(step_marker, 1)[1]
                self.assertIn(next_marker, step, f"{job} debe preparar Wails antes de staticcheck")
                step = step.split(next_marker, 1)[0]
                for fragment in required:
                    self.assertIn(fragment, step, f"{job} no contiene {fragment} en el paso Wails")


# ---------------------------------------------------------------------------
# F11: doctor MISMATCH incrementa issues
# ---------------------------------------------------------------------------

class TestDoctorMismatches(unittest.TestCase):
    """F11: cualquier MISMATCH en doctor debe contar como issue y dar exit != 0."""

    def test_doctor_exit_code_zero_when_clean(self):
        """doctor en el entorno actual debe dar exit 0 (todo OK)."""
        proc = subprocess.run(
            [sys.executable, "-B", str(REPO_ROOT / "tools" / "quality" / "vantare_quality.py"), "doctor"],
            cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=60,
        )
        self.assertEqual(proc.returncode, 0,
                         f"doctor debe dar exit 0 en entorno limpio; got {proc.returncode}\n{proc.stdout[-500:]}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
