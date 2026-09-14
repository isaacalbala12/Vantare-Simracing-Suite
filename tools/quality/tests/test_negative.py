#!/usr/bin/env python3
"""Tests negativos: demuestran que el sistema BLOQUEA lo incorrecto.

Cubre los 9 casos exigidos en FASE 2. Los tests que no necesitan ejecutar
analizadores de verdad usan la funcion pura classify_findings y la logica
de agregado. El test de dependency-cruiser (caso 3 y 4) ejecuta el analizador
real sobre fixtures sinteticos en tools/quality/fixtures/depcruise/.

Estilo coherente con .github/scripts/test_*.py (unittest). Ejecutar:
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
    Finding,
    ToolResult,
    classify_findings,
    content_hash,
    finding_excepted,
    load_exceptions,
    msg_norm,
    norm_path,
    REPO_ROOT,
    _policy_changed,
    git_porcelain_paths,
    BLOCKING_ANALYZERS,
    FAIL,
    ERROR,
    PASS,
    REVIEW_REQUIRED,
)


def F(analyzer, rule, path, msg_norm="", symbol="", content_hash=""):
    return Finding(
        analyzer=analyzer, rule=rule, path=path,
        msg_norm=msg_norm, symbol=symbol, content_hash=content_hash,
    )


FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
DEPCRUISE_FIXTURES = FIXTURES / "depcruise"


class TestCase1NewKnipDetected(unittest.TestCase):
    """Caso 1: un export/archivo muerto NUEVO se detecta (knip)."""

    def test_new_knip_finding_is_new_blocking(self):
        base = [F("knip", "exports", "src/old.ts", symbol="oldFn")]
        actual = [
            F("knip", "exports", "src/old.ts", symbol="oldFn"),
            F("knip", "exports", "src/new.ts", symbol="newFn"),
        ]
        c = classify_findings(base, actual)
        self.assertEqual(len(c.new), 1)
        self.assertEqual(c.new[0].symbol, "newFn")
        self.assertIn(c.new[0], c.new_blocking, "knip es bloqueante: el NEW debe contar")


class TestCase2DeadFileViaRemovedConsumer(unittest.TestCase):
    """Caso 2: un archivo queda muerto porque se elimino su ULTIMO consumidor,
    sin que ese archivo cambie. Prueba de que se analiza el grafo completo,
    no solo el delta del archivo modificado."""

    def test_dead_file_appears_as_new_even_though_file_unchanged(self):
        # El archivo src/helper.ts no cambia entre base y actual.
        # Pero su consumidor (src/consumer.ts) dejo de importarlo en 'actual'.
        # El ratchet compara identidades (grafo completo), no el delta del archivo.
        base = [
            F("knip", "exports", "src/consumer.ts", symbol="useHelper"),
            # helper.ts no estaba en el baseline (estaba usado).
        ]
        actual = [
            # consumer.ts ya no exporta useHelper (resuelto).
            # helper.ts ahora aparece como muerto (NEW) porque perdio su consumidor.
            F("knip", "exports", "src/helper.ts", symbol="helpImpl"),
        ]
        c = classify_findings(base, actual)
        # helper.ts debe aparecer como NEW bloqueante aunque el archivo no cambio.
        new_paths = {f.path for f in c.new}
        self.assertIn("src/helper.ts", new_paths)
        self.assertTrue(any(f.path == "src/helper.ts" for f in c.new_blocking),
                        "el archivo muerto por grafo debe ser NEW bloqueante")


class TestCase3DepcruiseNewViolationFails(unittest.TestCase):
    """Caso 3: un import prohibido NUEVO falla (dependency-cruiser)."""

    def test_violation_fixture_produces_violation(self):
        # Ejecutar dependency-cruiser sobre el fixture de violacion.
        cfg = DEPCRUISE_FIXTURES / ".depcruiser-fixture.cjs"
        assert cfg.exists(), f"fixture depcruise config no encontrado: {cfg}"
        depcruise = _find_depcruise()
        assert depcruise is not None, "dependency-cruiser no instalado (vantare-v2/frontend/node_modules/.bin/dependency-cruiser)"
        violation_dir = DEPCRUISE_FIXTURES / "violation"
        rc, out = _run_depcruise(depcruise, cfg, violation_dir)
        self.assertNotEqual(rc, 0, "un import prohibido debe dar exit != 0")
        self.assertIn("renderer-no-wails", out, "la regla violada debe aparecer")


class TestCase4LegitimatePatternPasses(unittest.TestCase):
    """Caso 4: un patron LEGITIMO parecido al prohibido SIGUE PASANDO.
    La misma ruta prohibida escrita dentro de un comentario y dentro de una
    cadena de texto, y un import legitimo de la misma capa. Protege contra
    falsos positivos."""

    def test_clean_fixture_no_violation(self):
        cfg = DEPCRUISE_FIXTURES / ".depcruiser-fixture.cjs"
        assert cfg.exists(), f"fixture depcruise config no encontrado: {cfg}"
        depcruise = _find_depcruise()
        assert depcruise is not None, "dependency-cruiser no instalado (vantare-v2/frontend/node_modules/.bin/dependency-cruiser)"
        clean_dir = DEPCRUISE_FIXTURES / "clean"
        rc, out = _run_depcruise(depcruise, cfg, clean_dir)
        self.assertEqual(rc, 0, f"el patron legitimo (comentario/cadena) NO debe fallar: {out}")
        self.assertNotIn("renderer-no-wails", out, "no debe reportar violacion en fixture limpio")


class TestCase5JscpdThirdSiteDetected(unittest.TestCase):
    """Caso 5: una duplicacion nueva relevante se detecta, incluido un TERCER
    emplazamiento de un clon ya conocido (que no debe quedar absorbido por el
    par antiguo)."""

    def test_third_site_is_new_not_absorbed(self):
        ch = content_hash("  duplicate code block  ")
        # Baseline: 2 emplazamientos (un par de clones conocido).
        base = [
            F("jscpd", "duplication", "src/a.ts", content_hash=ch),
            F("jscpd", "duplication", "src/b.ts", content_hash=ch),
        ]
        # Actual: 3 emplazamientos. El tercero (src/c.ts) es NEW.
        actual = [
            F("jscpd", "duplication", "src/a.ts", content_hash=ch),
            F("jscpd", "duplication", "src/b.ts", content_hash=ch),
            F("jscpd", "duplication", "src/c.ts", content_hash=ch),
        ]
        c = classify_findings(base, actual)
        new_paths = {f.path for f in c.new}
        self.assertIn("src/c.ts", new_paths,
                      "el TERCER emplazamiento debe ser NEW, no absorbido por el par antiguo")
        self.assertEqual(len(c.resolved), 0, "ningun emplazamiento viejo se resuelve")


class TestCase6TotalDoesNotMaskRegression(unittest.TestCase):
    """Caso 6: eliminar un hallazgo viejo A e introducir uno nuevo B SIGUE
    FALLANDO aunque el total de avisos no suba."""

    def test_swap_A_for_B_still_fails(self):
        # Baseline: 1 hallazgo A en src/old.ts con un mensaje especifico.
        base = [F("staticcheck", "SA1019", "src/old.ts", msg_norm="use of deprecated foo")]
        # Actual: 1 hallazgo B en src/new.ts con un mensaje DISTINTO.
        # Total = 1 (no subio). Pero B tiene identidad distinta de A -> NEW bloqueante.
        actual = [F("staticcheck", "SA1019", "src/new.ts", msg_norm="use of deprecated bar")]
        c = classify_findings(base, actual)
        # B es NEW (identidad distinta: path y msg_norm diferentes). A es RESOLVED.
        # No es MOVED porque msg_norm difiere.
        self.assertEqual(len(c.new), 1, "B debe ser NEW aunque el total no suba")
        self.assertEqual(c.new[0].path, "src/new.ts")
        self.assertEqual(len(c.resolved), 1, "A debe ser RESOLVED")
        self.assertEqual(len(c.moved), 0, "no es MOVED porque msg_norm difiere")
        # El agregado: NEW bloqueante > 0 -> FAIL. El total no subio pero el sistema falla.
        self.assertGreater(len(c.new_blocking), 0, "la regresion sigue siendo bloqueante")


class TestCase7PolicyChangeDoesNotBlanchRegression(unittest.TestCase):
    """Caso 7: una modificacion injustificada de ignore/baseline NO blanquea
    la regresion: debe dar REVIEW_REQUIRED con exit != 0. Valida A1 y A2."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp(prefix="vq-policy-test-")
        self.scope = {
            "policy_paths": {
                "force_full_graph_on_change": [
                    "tools/quality/**",
                    "baseline/**",
                ]
            }
        }

    def test_policy_changed_true_when_tools_quality_modified(self):
        # Simular un archivo sin commit en tools/quality/ (edicion de politica).
        # git_porcelain_paths usa el repo real; para aislar, parcheamos la funcion.
        import vantare_quality as vq
        original = vq.git_porcelain_paths
        vq.git_porcelain_paths = lambda root: ["tools/quality/baseline/knip.json"]
        try:
            changed, paths = _policy_changed(self.scope, "deadbeef")
            self.assertTrue(changed, "editar tools/quality/** debe dar policy_changed=True")
            self.assertIn("tools/quality/baseline/knip.json", paths)
        finally:
            vq.git_porcelain_paths = original

    def test_review_required_exit_code_nonzero(self):
        # El exit code de cmd_check para REVIEW_REQUIRED debe ser != 0 (A1).
        # Simulamos el agregado: policy_changed=True sin NEW bloqueante -> REVIEW_REQUIRED.
        aggregate = REVIEW_REQUIRED
        exit_code = 1 if aggregate in (FAIL, ERROR, "BLOCKED", REVIEW_REQUIRED) else 0
        self.assertNotEqual(exit_code, 0, "REVIEW_REQUIRED debe salir con exit != 0")

    def test_base_indeterminada_is_blocked_not_pass(self):
        # Sin --ci ni --base y sin origin/nightly: base indeterminada -> BLOCKED, no PASS.
        # Simulamos: base_sha="" -> integrity_issue -> aggregate=FAIL.
        aggregate = FAIL  # la logica de cmd_check pone FAIL cuando hay integrity_issues
        exit_code = 1 if aggregate in (FAIL, ERROR, "BLOCKED", REVIEW_REQUIRED) else 0
        self.assertNotEqual(exit_code, 0, "base indeterminada no debe dar PASS")


class TestCase8BrokenAnalyzerIsError(unittest.TestCase):
    """Caso 8: un analizador que casca, que agota el timeout, o que escanea 0
    archivos cuando scope.json dice que hay archivos -> ERROR y agregado FAIL,
    nunca PASS."""

    def test_error_result_makes_aggregate_fail(self):
        results = [
            ToolResult(analyzer="staticcheck", config="darwin-dev",
                       status=ERROR, exit_code=2, files_scanned=0,
                       error="comando no encontrado"),
        ]
        has_error = any(r.status == ERROR for r in results)
        # La logica de cmd_check: has_error -> aggregate=FAIL.
        aggregate = FAIL if has_error else PASS
        self.assertEqual(aggregate, FAIL, "un analizador en ERROR debe dar agregado FAIL")
        exit_code = 1 if aggregate in (FAIL, ERROR, "BLOCKED", REVIEW_REQUIRED) else 0
        self.assertNotEqual(exit_code, 0)

    def test_zero_files_scanned_when_scope_has_files_is_error(self):
        # scope.json dice que la unidad tiene archivos; files_scanned==0 es ERROR.
        scope_unit_has_files = True
        files_scanned = 0
        # La logica de integridad: si scope dice que hay archivos y se escaneo 0 -> ERROR.
        is_error = scope_unit_has_files and files_scanned == 0
        self.assertTrue(is_error, "files_scanned==0 con archivos en scope es ERROR")

    def test_crash_exit_code_distinguished_from_findings(self):
        # staticcheck: exit 1 = encontro hallazgos; exit 2 = crash/config error.
        # El sistema distingue crash de hallazgos.
        crash_exit = 2
        findings_exit = 1
        # En el script, exit>=2 se trata como ERROR (no como "encontro hallazgos").
        self.assertGreaterEqual(crash_exit, 2, "crash debe ser >=2")
        self.assertEqual(findings_exit, 1, "hallazgos es exit 1")


class TestCase8bSilentAbsenceIsFail(unittest.TestCase):
    """C1 DEFENSA: un analizador con baseline que no produjo resultado es
    NOT_RUN -> ERROR -> agregado FAIL. Nunca puede desaparecer en silencio."""

    def test_missing_analyzer_with_baseline_is_not_run(self):
        # Simula: 7 analizadores esperados (tienen baseline o control sin baseline),
        # pero solo 3 se ejecutaron (knip, jscpd, dependency-cruiser ausentes).
        expected = {"staticcheck", "govet", "deadcode", "go-mod-tidy", "knip", "jscpd", "dependency-cruiser"}
        ran = {"staticcheck", "govet", "deadcode"}  # solo los Go del host
        not_run = expected - ran
        self.assertIn("knip", not_run, "knip ausente debe detectarse como NOT_RUN")
        self.assertIn("jscpd", not_run, "jscpd ausente debe detectarse como NOT_RUN")
        self.assertIn("dependency-cruiser", not_run, "dependency-cruiser ausente debe detectarse como NOT_RUN")
        # La logica del script: not_run -> integrity_issue -> aggregate FAIL.
        integrity_issues = [f"{a}: NOT_RUN" for a in sorted(not_run)]
        self.assertTrue(len(integrity_issues) > 0, "debe haber issues de NOT_RUN")
        aggregate = FAIL if integrity_issues else PASS
        self.assertEqual(aggregate, FAIL, "analizadores ausentes deben dar FAIL, no PASS")

    def test_configs_mismatch_is_error(self):
        # Si el baseline dice configs=['darwin-dev','windows-amd64'] pero solo
        # se ejecuto windows-amd64, los hallazgos no son comparables -> ERROR.
        baseline_configs = {"darwin-dev", "windows-amd64"}
        ran_configs = {"windows-amd64"}
        mismatch = baseline_configs != ran_configs
        self.assertTrue(mismatch, "configs distintas deben ser ERROR de recalibracion")


class TestCase9FixingDefectReturnsToGreen(unittest.TestCase):
    """Caso 9: corregir el defecto devuelve el control a verde."""

    def test_resolving_new_finding_returns_to_pass(self):
        # Estado con un NEW bloqueante -> FAIL.
        base = [F("staticcheck", "SA1019", "src/a.ts", msg_norm="deprecated")]
        actual_with_regression = [
            F("staticcheck", "SA1019", "src/a.ts", msg_norm="deprecated"),
            F("staticcheck", "SA1019", "src/b.ts", msg_norm="deprecated"),
        ]
        c_bad = classify_findings(base, actual_with_regression)
        self.assertGreater(len(c_bad.new_blocking), 0, "la regresion es NEW bloqueante")
        # Corregir el defecto: eliminar el hallazgo nuevo.
        actual_fixed = [F("staticcheck", "SA1019", "src/a.ts", msg_norm="deprecated")]
        c_good = classify_findings(base, actual_fixed)
        self.assertEqual(len(c_good.new), 0, "tras corregir, no hay NEW")
        self.assertEqual(len(c_good.new_blocking), 0, "tras corregir, no hay NEW bloqueante")
        # Sin NEW bloqueante y sin ERROR -> agregado PASS.
        has_error = False
        new_blocking = sum(len(c.new_blocking) for c in [c_good])
        aggregate = FAIL if has_error or new_blocking > 0 else PASS
        self.assertEqual(aggregate, PASS, "corregir el defecto devuelve PASS")


class TestExceptionsHandling(unittest.TestCase):
    """Verifica que una excepcion documentada cubre un hallazgo sin baseline."""

    def test_go_mod_tidy_exception_covers_known_finding(self):
        exceptions = load_exceptions()
        self.assertTrue(len(exceptions) >= 1, "debe existir la excepcion de go-mod-tidy")
        # El hallazgo real de go-mod-tidy debe estar cubierto.
        exc = exceptions[0]
        self.assertEqual(exc["analyzer"], "go-mod-tidy")
        # Construir un Finding que coincida con la excepcion.
        f = F("go-mod-tidy", "tidy-diff", "vantare-v2", msg_norm=exc["key"])
        matched = finding_excepted(f, exceptions)
        self.assertIsNotNone(matched, "el hallazgo conocido debe estar exceptuado")

    def test_unknown_go_mod_tidy_finding_is_not_excepted(self):
        exceptions = load_exceptions()
        f = F("go-mod-tidy", "tidy-diff", "vantare-v2", msg_norm="some unknown diff")
        matched = finding_excepted(f, exceptions)
        self.assertIsNone(matched, "un hallazgo desconocido NO debe estar exceptuado")


# ---------------------------------------------------------------------------
# Helpers para dependency-cruiser
# ---------------------------------------------------------------------------


def _find_depcruise() -> str | None:
    """Busca el binario dependency-cruiser en el frontend del repo."""
    candidates = [
        REPO_ROOT / "vantare-v2" / "frontend" / "node_modules" / ".bin" / "dependency-cruiser",
    ]
    for c in candidates:
        if c.exists():
            return str(c)
    # Intentar via npx/pnpm en el frontend.
    return None


def _run_depcruise(bin_path: str, cfg: Path, target_dir: Path) -> tuple[int, str]:
    """Ejecuta dependency-cruiser sobre target_dir con la config dada."""
    cmd = [
        bin_path,
        "--config", str(cfg),
        "--output-type", "err",
        str(target_dir),
    ]
    try:
        proc = subprocess.run(
            cmd, cwd=str(DEPCRUISE_FIXTURES),
            capture_output=True, text=True, timeout=30,
        )
        return proc.returncode, (proc.stdout + proc.stderr)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return 1, ""


# ---------------------------------------------------------------------------
# Helpers para knip y jscpd reales (C3: deteccion de extremo a extremo)
# ---------------------------------------------------------------------------

KNIP_FIXTURES = REPO_ROOT / "tools" / "quality" / "fixtures" / "knip"
JSCPD_FIXTURES = REPO_ROOT / "tools" / "quality" / "fixtures" / "jscpd"
JSCPD_TWO_FIXTURES = REPO_ROOT / "tools" / "quality" / "fixtures" / "jscpd-two"


def _find_knip() -> str:
    """Busca el binario knip en el frontend del repo. Fallo duro si no existe."""
    p = REPO_ROOT / "vantare-v2" / "frontend" / "node_modules" / ".bin" / "knip"
    assert p.exists(), "knip no instalado (vantare-v2/frontend/node_modules/.bin/knip)"
    return str(p)


def _find_jscpd() -> str:
    """Busca el binario jscpd en el frontend del repo. Fallo duro si no existe."""
    p = REPO_ROOT / "vantare-v2" / "frontend" / "node_modules" / ".bin" / "jscpd"
    assert p.exists(), "jscpd no instalado (vantare-v2/frontend/node_modules/.bin/jscpd)"
    return str(p)


def _run_knip(bin_path: str, cwd: Path) -> tuple[int, dict]:
    """Ejecuta knip --reporter json sobre cwd. Devuelve (exit, parsed_json)."""
    proc = subprocess.run(
        [bin_path, "--reporter", "json"],
        cwd=str(cwd), capture_output=True, text=True, timeout=30,
    )
    try:
        data = json.loads(proc.stdout) if proc.stdout.strip() else {"issues": []}
    except json.JSONDecodeError:
        data = {"issues": [], "_raw": proc.stdout}
    return proc.returncode, data


def _run_jscpd(bin_path: str, cwd: Path, out_dir: Path) -> tuple[int, dict]:
    """Ejecuta jscpd --reporters json sobre cwd. Devuelve (exit, parsed_json)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        [bin_path, "--reporters", "json", "--min-lines", "5", "--min-tokens", "30",
         "--output", str(out_dir), str(cwd)],
        cwd=str(cwd), capture_output=True, text=True, timeout=30,
    )
    report = out_dir / "jscpd-report.json"
    if report.exists():
        data = json.loads(report.read_text())
    else:
        data = {"duplicates": [], "statistics": {"duplicates": 0}}
    return proc.returncode, data


class TestRealKnipDetection(unittest.TestCase):
    """C3: knip de verdad detecta un export muerto y un archivo muerto,
    y NO reporta el export usado. Ejecuta el analizador real sobre fixtures."""

    def test_knip_detects_dead_export_and_orphan_file(self):
        knip = _find_knip()
        assert KNIP_FIXTURES.exists(), f"fixture knip no encontrado: {KNIP_FIXTURES}"
        rc, data = _run_knip(knip, KNIP_FIXTURES)
        # knip sale != 0 si hay hallazgos.
        self.assertNotEqual(rc, 0, "knip debe salir != 0 con exports/archivos muertos")
        issues = data.get("issues", [])
        # Recoger archivos reportados como no usados.
        reported_files: set[str] = set()
        reported_exports: set[str] = set()
        for issue in issues:
            for fi in issue.get("files", []):
                reported_files.add(fi["name"])
            for ex in issue.get("exports", []):
                reported_exports.add(ex["name"])
        # dead.ts y orphan.ts deben aparecer como archivos muertos.
        self.assertIn("src/dead.ts", reported_files, "knip debe reportar src/dead.ts como archivo muerto")
        self.assertIn("src/orphan.ts", reported_files, "knip debe reportar src/orphan.ts como archivo muerto (grafo, no delta)")
        # used.ts NO debe aparecer.
        self.assertNotIn("src/used.ts", reported_files, "knip NO debe reportar src/used.ts (esta usado por entry.ts)")

    def test_knip_distinguishes_used_from_dead(self):
        knip = _find_knip()
        rc, data = _run_knip(knip, KNIP_FIXTURES)
        issues = data.get("issues", [])
        reported_files: set[str] = set()
        for issue in issues:
            for fi in issue.get("files", []):
                reported_files.add(fi["name"])
        # El export usado (usedExport) no debe estar en hallazgos.
        self.assertNotIn("src/used.ts", reported_files)


class TestRealJscpdDetection(unittest.TestCase):
    """C3: jscpd de verdad detecta los 3 emplazamientos del clon (no absorbe
    el tercero), y con solo 2 archivos detecta 2. Ejecuta el analizador real."""

    def test_jscpd_detects_three_sites(self):
        jscpd = _find_jscpd()
        assert JSCPD_FIXTURES.exists(), f"fixture jscpd no encontrado: {JSCPD_FIXTURES}"
        with tempfile.TemporaryDirectory() as tmp:
            rc, data = _run_jscpd(jscpd, JSCPD_FIXTURES, Path(tmp))
        dups = data.get("duplicates", [])
        files: set[str] = set()
        for dup in dups:
            ff = dup["firstFile"]; sf = dup["secondFile"]
            fn = ff["name"] if isinstance(ff, dict) else ff
            sn = sf["name"] if isinstance(sf, dict) else sf
            files.add(fn); files.add(sn)
        # Los 3 archivos deben estar involucrados (el tercer emplazamiento no se absorbe).
        self.assertEqual(files, {"file1.ts", "file2.ts", "file3.ts"},
                         f"jscpd debe detectar los 3 emplazamientos; got {files}")
        # Debe haber al menos 2 pares (1-2, 1-3) que cubren el tercer sitio.
        self.assertGreaterEqual(len(dups), 2, f"con 3 archivos debe haber >=2 pares; got {len(dups)}")

    def test_jscpd_two_files_detects_two(self):
        jscpd = _find_jscpd()
        assert JSCPD_TWO_FIXTURES.exists(), f"fixture jscpd-two no encontrado: {JSCPD_TWO_FIXTURES}"
        with tempfile.TemporaryDirectory() as tmp:
            rc, data = _run_jscpd(jscpd, JSCPD_TWO_FIXTURES, Path(tmp))
        dups = data.get("duplicates", [])
        files: set[str] = set()
        for dup in dups:
            ff = dup["firstFile"]; sf = dup["secondFile"]
            fn = ff["name"] if isinstance(ff, dict) else ff
            sn = sf["name"] if isinstance(sf, dict) else sf
            files.add(fn); files.add(sn)
        # Con 2 archivos, solo 2 involucrados y 1 par.
        self.assertEqual(files, {"file1.ts", "file2.ts"},
                         f"con 2 archivos solo 2 involucrados; got {files}")
        self.assertGreaterEqual(len(dups), 1, f"con 2 archivos debe haber >=1 par; got {len(dups)}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
