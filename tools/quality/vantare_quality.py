#!/usr/bin/env python3
"""Sistema de calidad anti-slop de Vantare (FASE 1).

Un unico script con subcomandos: bootstrap, doctor, check, audit, report, baseline.
Python 3 estandar, sin dependencias nuevas, coherente con .github/scripts/*.py.

El nucleo es la funcion PURA `classify_findings` (ratchet por identidad), separada
de la ejecucion de analizadores para poder testearla sin ejecutarlos.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

# ---------------------------------------------------------------------------
# Constantes y rutas
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
SCOPE_PATH = SCRIPT_DIR / "scope.json"
VERSIONS_PATH = SCRIPT_DIR / "versions.json"
EXCEPTIONS_PATH = SCRIPT_DIR / "exceptions.json"
BASELINE_DIR = SCRIPT_DIR / "baseline"
LAST_RUN_PATH = SCRIPT_DIR / ".last-run.json"
STATE_VERSION = 1

# Estados de integridad: nunca devolver PASS por defecto.
PASS = "PASS"
FAIL = "FAIL"
BLOCKED = "BLOCKED"
NOT_RUN = "NOT_RUN"
NOT_APPLICABLE = "NOT_APPLICABLE"
ERROR = "ERROR"
REVIEW_REQUIRED = "REVIEW_REQUIRED"

# Clase bloqueante por analizador (segun versions.json / decision de diseno).
BLOCKING_ANALYZERS = {
    "staticcheck",
    "govet",
    "go-mod-tidy",
    "knip",
    "jscpd",
    "dependency-cruiser",
}
INFORMATIVE_ANALYZERS = {"deadcode"}
ALL_ANALYZERS = BLOCKING_ANALYZERS | INFORMATIVE_ANALYZERS

# Paquetes Go que NO compilan en el host non-windows (referencia a launcher.* solo en *_windows.go).
# Aplica a darwin-dev Y linux-dev: cmd/vantare usa symbols solo definidos en *_windows.go.
HOST_NONCOMPILING = {"cmd/vantare"}

GOBIN = os.environ.get("GOBIN") or os.path.expanduser("~/go/bin")

# Version minima de Python: usamos X | None (3.10+), dataclasses con field defaults.
PYTHON_MIN = (3, 10)


# ---------------------------------------------------------------------------
# Identidad de hallazgo (funciones puras)
# ---------------------------------------------------------------------------

_DIGITS = re.compile(r"\d+")
_WS = re.compile(r"\s+")


def norm_path(path: str, repo_root: Path) -> str:
    """Ruta relativa a la raiz del repo, separadores POSIX."""
    if not path:
        return path
    p = Path(path)
    try:
        rel = p.resolve() if p.is_absolute() else (repo_root / p)
        rel = rel.resolve()
        root = repo_root.resolve()
        rel = rel.relative_to(root)
    except (ValueError, OSError):
        # Ya es relativa o no se puede resolver: normalizar a POSIX.
        rel = Path(path)
    return PurePosixPath(*rel.parts).as_posix()


def msg_norm(message: str) -> str:
    """Mensaje en minusculas, secuencias de digitos -> '#', espacios colapsados."""
    if not message:
        return ""
    lowered = message.lower()
    lowered = _DIGITS.sub("#", lowered)
    lowered = _WS.sub(" ", lowered).strip()
    return lowered


def content_hash(text: str) -> str:
    """sha256 del fragmento con secuencias de blanco colapsadas a un espacio y recortado."""
    if not text:
        return ""
    collapsed = _WS.sub(" ", text).strip()
    return hashlib.sha256(collapsed.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class Finding:
    """Hallazgo normalizado de cualquier analizador.

    La identidad se calcula con `finding_identity`, que selecciona el campo clave
    segun el analizador. NUNCA usa linea ni columna.
    """

    analyzer: str
    rule: str
    path: str  # ya normalizado norm(path)
    msg_norm: str = ""
    symbol: str = ""
    content_hash: str = ""

    def identity(self) -> tuple[str, ...]:
        """Tupla de identidad estable por analizador (sin linea/columna)."""
        if self.analyzer == "staticcheck":
            return (self.analyzer, self.rule, self.path, self.msg_norm)
        if self.analyzer == "govet":
            return (self.analyzer, "vet", self.path, self.msg_norm)
        if self.analyzer == "deadcode":
            return (self.analyzer, "deadcode", self.path, self.symbol)
        if self.analyzer == "knip":
            return (self.analyzer, self.rule, self.path, self.symbol)
        if self.analyzer == "jscpd":
            return (self.analyzer, "duplication", self.path, self.content_hash)
        if self.analyzer == "go-mod-tidy":
            return (self.analyzer, "tidy-diff", self.path, self.rule)
        # dependency-cruiser usa baseline nativo; no se clasifica aqui.
        return (self.analyzer, self.rule, self.path, self.msg_norm or self.symbol or self.content_hash)


@dataclass
class Classification:
    """Resultado de clasificar actual vs base."""

    new: list[Finding] = field(default_factory=list)
    resolved: list[Finding] = field(default_factory=list)
    moved: list[Finding] = field(default_factory=list)

    @property
    def new_blocking(self) -> list[Finding]:
        return [f for f in self.new if f.analyzer in BLOCKING_ANALYZERS]


def classify_findings(base: Iterable[Finding], actual: Iterable[Finding]) -> Classification:
    """Funcion PURA: clasifica hallazgos actuales frente al baseline.

    NEW = actual - base (por identidad).
    RESOLVED = base - actual (por identidad).
    MOVED: un NEW n y un RESOLVED r con misma regla, mismo msg_norm (o mismo symbol
    no vacio) y DISTINTO path -> n se reclasifica como MOVED. No cuenta como NEW,
    pero SIEMPRE se lista destacado. Nunca se silencia.

    El orden es determinista (por tupla de identidad) para que el emparejamiento
    MOVED y el informe sean reproducibles entre ejecuciones.
    """
    base_list = list(base)
    actual_list = list(actual)
    base_ids = {f.identity(): f for f in base_list}
    actual_ids = {f.identity(): f for f in actual_list}

    base_set = set(base_ids)
    actual_set = set(actual_ids)
    # Ordenar por tupla de identidad para determinismo.
    new_ids_sorted = sorted(actual_set - base_set)
    resolved_ids_sorted = sorted(base_set - actual_set)

    new = [actual_ids[i] for i in new_ids_sorted]
    resolved = [base_ids[i] for i in resolved_ids_sorted]

    # MOVED: emparejar NEW con RESOLVED de misma regla y mensaje/symbol, distinto path.
    moved: list[Finding] = []
    remaining_new: list[Finding] = []
    consumed_resolved: set[tuple[str, ...]] = set()

    # Indexar resueltos por (rule, key) para emparejar; orden determinista por identidad.
    resolved_by_key: dict[tuple[str, str], list[Finding]] = {}
    for r in resolved:
        if r.analyzer == "jscpd":
            key = r.content_hash
        elif r.symbol:
            key = r.symbol
        else:
            key = r.msg_norm
        resolved_by_key.setdefault((r.rule, key), []).append(r)
    for bucket in resolved_by_key.values():
        bucket.sort(key=lambda f: f.identity())

    for n in new:
        if n.analyzer == "jscpd":
            key = n.content_hash
        elif n.symbol:
            key = n.symbol
        else:
            key = n.msg_norm
        candidates = resolved_by_key.get((n.rule, key), [])
        match = None
        for r in candidates:
            if r.identity() in consumed_resolved:
                continue
            if n.path != r.path:
                match = r
                break
        if match is not None:
            consumed_resolved.add(match.identity())
            moved.append(n)
        else:
            remaining_new.append(n)

    return Classification(new=remaining_new, resolved=resolved, moved=moved)


# ---------------------------------------------------------------------------
# Resultado de ejecucion de un analizador
# ---------------------------------------------------------------------------


@dataclass
class ToolResult:
    analyzer: str
    config: str  # p.ej. "darwin-dev", "windows-amd64"
    status: str  # PASS/FAIL/BLOCKED/NOT_RUN/NOT_APPLICABLE/ERROR
    exit_code: int
    files_scanned: int
    findings: list[Finding] = field(default_factory=list)
    error: str = ""
    duration_ms: int = 0
    raw_stdout: str = ""
    raw_stderr: str = ""
    version: str = ""


# ---------------------------------------------------------------------------
# Utilidades de ejecucion
# ---------------------------------------------------------------------------


class ToolError(Exception):
    pass


def run_cmd(
    cmd: list[str],
    *,
    cwd: Path,
    timeout: int,
    env: dict[str, str] | None = None,
) -> tuple[int, str, str, int]:
    """Ejecuta un comando con timeout explicito. Devuelve (exit, stdout, stderr, ms)."""
    start = time.monotonic()
    full_env = os.environ.copy()
    if env:
        full_env.update(env)
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            env=full_env,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as e:
        raise ToolError(f"timeout tras {timeout}s") from e
    except FileNotFoundError as e:
        raise ToolError(f"comando no encontrado: {cmd[0]}") from e
    elapsed = int((time.monotonic() - start) * 1000)
    return proc.returncode, proc.stdout, proc.stderr, elapsed


def git_head_sha(repo_root: Path) -> str:
    try:
        rc, out, _err, _ = run_cmd(
            ["git", "rev-parse", "HEAD"], cwd=repo_root, timeout=10
        )
        if rc == 0:
            return out.strip()
    except ToolError:
        pass
    return ""


def git_changed_paths(repo_root: Path, base_sha: str) -> list[str]:
    """Lista de paths cambiados entre base_sha y HEAD."""
    if not base_sha:
        return []
    try:
        rc, out, _err, _ = run_cmd(
            ["git", "diff", "--name-only", base_sha, "HEAD"],
            cwd=repo_root,
            timeout=30,
        )
        if rc == 0:
            return [p for p in out.splitlines() if p.strip()]
    except ToolError:
        pass
    return []


def git_porcelain_paths(repo_root: Path) -> list[str]:
    """Archivos sin commit (modificados, staged, untracked). Para detectar ediciones
    de politica sin commitear."""
    try:
        rc, out, _err, _ = run_cmd(
            ["git", "status", "--porcelain"], cwd=repo_root, timeout=30
        )
        if rc == 0:
            paths: list[str] = []
            for line in out.splitlines():
                if len(line) < 4:
                    continue
                paths.append(line[3:].strip().strip('"'))
            return paths
    except ToolError:
        pass
    return []


def git_merge_base_nightly(repo_root: Path) -> str:
    """merge-base origin/nightly HEAD. Devuelve '' si no se puede determinar."""
    try:
        rc, out, _err, _ = run_cmd(
            ["git", "merge-base", "origin/nightly", "HEAD"],
            cwd=repo_root, timeout=30,
        )
        if rc == 0:
            return out.strip()
    except ToolError:
        pass
    return ""


def fnmatch_any(path: str, patterns: list[str]) -> bool:
    """Match de path contra patrones tipo glob (con **)."""
    import fnmatch

    for pat in patterns:
        if pat.endswith("/**"):
            prefix = pat[:-3]
            if path == prefix.rstrip("/") or path.startswith(prefix.rstrip("/") + "/"):
                return True
        elif "/**" in pat:
            # patron como a/**/b
            regex = re.escape(pat).replace(r"\*\*", ".*").replace(r"\*", "[^/]*")
            if re.fullmatch(regex, path):
                return True
        else:
            if fnmatch.fnmatch(path, pat):
                return True
    return False


def scope_hash(scope: dict) -> str:
    return hashlib.sha256(
        json.dumps(scope, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()


def versions_fingerprint(versions: dict) -> str:
    """Huella de las versiones exactas de los analizadores."""
    parts = []
    for name in sorted(versions.get("analyzers", {}).keys()):
        v = versions["analyzers"][name]
        parts.append(f"{name}={v['version']}")
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Parsers de salida de analizadores -> list[Finding]
# ---------------------------------------------------------------------------

_SC_LINE = re.compile(
    r'^\{"code":"(?P<code>[^"]*)".*?"location":\{"file":"(?P<file>[^"]*)".*?\}.*?"message":"(?P<msg>(?:[^"\\]|\\.)*)"\}'
)


def parse_staticcheck(stdout: str, repo_root: Path) -> list[Finding]:
    findings: list[Finding] = []
    for line in stdout.splitlines():
        line = line.strip()
        if not line or not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        code = obj.get("code", "")
        loc = obj.get("location", {})
        file = loc.get("file", "")
        msg = obj.get("message", "")
        if not code or not file:
            continue
        findings.append(
            Finding(
                analyzer="staticcheck",
                rule=code,
                path=norm_path(file, repo_root),
                msg_norm=msg_norm(msg),
            )
        )
    return findings


_VET_LINE = re.compile(r"^(?P<file>.+?):(?P<line>\d+):(?P<col>\d+):\s*(?P<msg>.*)$")

_COMPILE_ERROR_MARKERS = (
    "undefined:",
    "no matching files found",
    "cannot find package",
    "expected",
    "syntax error",
    "package main expected",
)


def _looks_like_compile_error(msg: str) -> bool:
    low = msg.lower()
    return any(m in low for m in _COMPILE_ERROR_MARKERS) and "error strings should" not in low


def parse_govet(stdout: str, stderr: str, repo_root: Path) -> tuple[list[Finding], bool]:
    """Devuelve (findings, had_compile_error)."""
    findings: list[Finding] = []
    had_compile_error = False
    for line in (stdout + "\n" + stderr).splitlines():
        m = _VET_LINE.match(line.strip())
        if not m:
            continue
        msg = m.group("msg")
        if _looks_like_compile_error(msg):
            had_compile_error = True
            continue
        findings.append(
            Finding(
                analyzer="govet",
                rule="vet",
                path=norm_path(m.group("file"), repo_root),
                msg_norm=msg_norm(msg),
            )
        )
    return findings, had_compile_error


_DC_LINE = re.compile(
    r"^(?P<file>.+?):(?P<line>\d+):(?P<col>\d+):\s*unreachable\s+(?P<kind>func|method|var|const):\s*(?P<symbol>.*)$"
)


def parse_deadcode(stdout: str, stderr: str, repo_root: Path) -> tuple[list[Finding], bool]:
    """Devuelve (findings, had_error)."""
    findings: list[Finding] = []
    had_error = bool(stderr.strip()) and "packages contain errors" in stderr
    for line in stdout.splitlines():
        m = _DC_LINE.match(line.strip())
        if not m:
            continue
        findings.append(
            Finding(
                analyzer="deadcode",
                rule="deadcode",
                path=norm_path(m.group("file"), repo_root),
                symbol=m.group("symbol").strip(),
            )
        )
    return findings, had_error


_KNIP_CATEGORIES = (
    "files", "exports", "types", "nsExports", "nsTypes", "enumMembers",
    "namespaceMembers", "duplicates", "dependencies", "devDependencies",
    "optionalPeerDependencies", "unlisted", "unresolved", "binaries",
    "catalog", "catalogReferences",
)


def parse_knip(stdout: str, repo_root: Path, frontend_root: Path) -> list[Finding]:
    """knip --reporter json emite {"issues": [{file, files:[{name}], exports:[...], ...}]}."""
    findings: list[Finding] = []
    if not stdout.strip():
        return findings
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError:
        return findings
    issues = data.get("issues", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
    for iss in issues:
        rel = iss.get("file", "") or ""
        if rel:
            path = norm_path(str(frontend_root / rel), repo_root)
        else:
            path = str(frontend_root.relative_to(repo_root).as_posix())
        for cat in _KNIP_CATEGORIES:
            items = iss.get(cat, [])
            if not isinstance(items, list):
                continue
            for item in items:
                name = item.get("name", "") if isinstance(item, dict) else str(item)
                findings.append(
                    Finding(
                        analyzer="knip",
                        rule=cat,
                        path=path,
                        symbol=name,
                    )
                )
    return findings


def parse_jscpd(report_obj: Any, repo_root: Path, frontend_root: Path) -> list[Finding]:
    """jscpd --reporters json escribe un json en --output. Emite UN hallazgo POR EMPLAZAMIENTO (site).

    Cada duplicado tiene firstFile y secondFile (cada uno un emplazamiento). Si una
    duplicacion conocida gana una TERCERA copia, ese nuevo emplazamiento aparece
    como identidad NUEVA (no absorbido por el par antiguo).
    """
    findings: list[Finding] = []
    duplicates = report_obj.get("duplicates", []) if isinstance(report_obj, dict) else []
    for dup in duplicates:
        ch = content_hash(dup.get("fragment", ""))
        for site in (dup.get("firstFile"), dup.get("secondFile")):
            if not isinstance(site, dict):
                continue
            sp = site.get("name") or ""
            if not sp:
                continue
            path = norm_path(str(frontend_root / sp), repo_root)
            findings.append(
                Finding(
                    analyzer="jscpd",
                    rule="duplication",
                    path=path,
                    content_hash=ch,
                )
            )
    return findings


# ---------------------------------------------------------------------------
# Ejecutores de analizadores
# ---------------------------------------------------------------------------


def _go_packages_excluding(repo_root: Path, exclude: set[str]) -> list[str]:
    rc, out, err, _ = run_cmd(["go", "list", "./..."], cwd=repo_root, timeout=120)
    if rc != 0:
        raise ToolError(f"go list fallo: {err.strip()}")
    pkgs = [p for p in out.splitlines() if p.strip()]
    module_path = "github.com/vantare/overlays/v2/"
    filtered = []
    for p in pkgs:
        rel = p[len(module_path):] if p.startswith(module_path) else p
        if rel in exclude:
            continue
        filtered.append(p)
    return filtered


def run_staticcheck(scope: dict, versions: dict, config: str) -> ToolResult:
    go_root = REPO_ROOT / "vantare-v2"
    bin_path = shutil.which("staticcheck") or os.path.join(GOBIN, "staticcheck")
    env = {}
    pkgs = ["./..."]
    if config == "windows-amd64":
        env = {"GOOS": "windows", "GOARCH": "amd64"}
    elif config == "windows-amd64-production":
        env = {"GOOS": "windows", "GOARCH": "amd64", "GOFLAGS": "-tags=production"}
    cmd = [bin_path, "-f", "json"] + pkgs
    try:
        rc, out, err, ms = run_cmd(cmd, cwd=go_root, timeout=600, env=env)
    except ToolError as e:
        return ToolResult("staticcheck", config, ERROR, -1, 0, error=str(e))
    version = _staticcheck_version(bin_path)
    if rc >= 2:
        return ToolResult(
            "staticcheck", config, ERROR, rc, 0, error=f"crash (exit {rc}): {err.strip()[:500]}",
            duration_ms=ms, raw_stderr=err, version=version,
        )
    findings = parse_staticcheck(out, REPO_ROOT)
    files_scanned = len({f.path for f in findings}) or (1 if rc in (0, 1) else 0)
    status = FAIL if findings else PASS
    return ToolResult(
        "staticcheck", config, status, rc, files_scanned, findings=findings,
        duration_ms=ms, raw_stdout=out, raw_stderr=err, version=version,
    )


def _staticcheck_version(bin_path: str) -> str:
    try:
        rc, out, _err, _ = run_cmd([bin_path, "-version"], cwd=REPO_ROOT, timeout=10)
        if rc == 0:
            return out.strip()
    except ToolError:
        pass
    return ""


def run_govet(scope: dict, versions: dict, config: str) -> ToolResult:
    go_root = REPO_ROOT / "vantare-v2"
    env: dict[str, str] = {}
    if config == "windows-amd64":
        env = {"GOOS": "windows", "GOARCH": "amd64"}
    elif config == "windows-amd64-production":
        env = {"GOOS": "windows", "GOARCH": "amd64", "GOFLAGS": "-tags=production"}
    if config in ("darwin-dev", "linux-dev"):
        pkgs = _go_packages_excluding(go_root, HOST_NONCOMPILING)
    else:
        pkgs = ["./..."]
    if not pkgs:
        return ToolResult("govet", config, NOT_APPLICABLE, 0, 0)
    cmd = ["go", "vet"] + pkgs
    try:
        rc, out, err, ms = run_cmd(cmd, cwd=go_root, timeout=600, env=env)
    except ToolError as e:
        return ToolResult("govet", config, ERROR, -1, 0, error=str(e))
    findings, had_compile = parse_govet(out, err, REPO_ROOT)
    if had_compile:
        return ToolResult(
            "govet", config, ERROR, rc, 0, error="compile error en go vet (paquete no compila)",
            duration_ms=ms, raw_stdout=out, raw_stderr=err,
        )
    status = FAIL if findings else PASS
    return ToolResult(
        "govet", config, status, rc, len({f.path for f in findings}),
        findings=findings, duration_ms=ms, raw_stdout=out, raw_stderr=err,
    )


def run_deadcode(scope: dict, versions: dict, config: str) -> ToolResult:
    go_root = REPO_ROOT / "vantare-v2"
    bin_path = os.path.join(GOBIN, "deadcode")
    if not os.path.exists(bin_path):
        bin_path = shutil.which("deadcode") or bin_path
    env: dict[str, str] = {}
    if config == "windows-amd64":
        env = {"GOOS": "windows", "GOARCH": "amd64"}
    elif config == "windows-amd64-production":
        env = {"GOOS": "windows", "GOARCH": "amd64", "GOFLAGS": "-tags=production"}
    if config in ("darwin-dev", "linux-dev"):
        pkgs = _go_packages_excluding(go_root, HOST_NONCOMPILING)
    else:
        pkgs = ["./..."]
    if not pkgs:
        return ToolResult("deadcode", config, NOT_APPLICABLE, 0, 0)
    cmd = [bin_path] + pkgs
    try:
        rc, out, err, ms = run_cmd(cmd, cwd=go_root, timeout=600, env=env)
    except ToolError as e:
        return ToolResult("deadcode", config, ERROR, -1, 0, error=str(e))
    findings, had_error = parse_deadcode(out, err, REPO_ROOT)
    # deadcode: exit != 0 => error de compilacion (no puede analizar). Informativo.
    if rc != 0 or had_error:
        return ToolResult(
            "deadcode", config, ERROR, rc, 0, findings=findings,
            error=f"deadcode no pudo analizar (exit {rc}): {err.strip()[:300]}",
            duration_ms=ms, raw_stdout=out, raw_stderr=err,
        )
    status = PASS  # informativo: nunca FAIL
    return ToolResult(
        "deadcode", config, status, rc, len({f.path for f in findings}),
        findings=findings, duration_ms=ms, raw_stdout=out, raw_stderr=err,
        version=versions["analyzers"]["deadcode"]["version"],
    )


def run_go_mod_tidy(scope: dict, versions: dict, config: str) -> ToolResult:
    """go mod tidy -diff por modulo. NO modifica manifiestos."""
    go_root = REPO_ROOT / "vantare-v2"
    modules = [
        ("vantare-v2", go_root),
        ("vantare-v2/tools/vantare-telemetry-reader", go_root / "tools" / "vantare-telemetry-reader"),
        ("vantare-v2/tools/benchmarks/isa101-storage", go_root / "tools" / "benchmarks" / "isa101-storage"),
        ("vantare-v2/docs/.../spikes/ta03b", go_root / "docs" / "vantare-program" / "research" / "telemetry-analysis" / "spikes" / "ta03b"),
    ]
    findings: list[Finding] = []
    errors: list[str] = []
    for name, mod_root in modules:
        if not (mod_root / "go.mod").exists():
            continue
        try:
            rc, out, err, ms = run_cmd(["go", "mod", "tidy", "-diff"], cwd=mod_root, timeout=180)
        except ToolError as e:
            errors.append(f"{name}: {e}")
            findings.append(Finding(analyzer="go-mod-tidy", rule="tidy-error", path=name, msg_norm=msg_norm(str(e))))
            continue
        diff = out.strip()
        if rc != 0 and not diff:
            errors.append(f"{name}: exit {rc} {err.strip()[:200]}")
            findings.append(Finding(analyzer="go-mod-tidy", rule="tidy-error", path=name, msg_norm=msg_norm(err)))
            continue
        if diff:
            findings.append(Finding(analyzer="go-mod-tidy", rule="tidy-diff", path=name, msg_norm=msg_norm(diff)))
    status = FAIL if findings else PASS
    return ToolResult(
        "go-mod-tidy", config, status, 0, len(modules), findings=findings,
        error="; ".join(errors),
    )


def run_knip(scope: dict, versions: dict, config: str) -> ToolResult:
    fe_root = REPO_ROOT / "vantare-v2" / "frontend"
    pnpm = shutil.which("pnpm") or "pnpm"
    cmd = [pnpm, "--dir", str(fe_root), "exec", "knip", "--reporter", "json", "--no-progress"]
    try:
        rc, out, err, ms = run_cmd(cmd, cwd=fe_root, timeout=600)
    except ToolError as e:
        return ToolResult("knip", config, ERROR, -1, 0, error=str(e))
    # knip exit 0 = limpio, 1 = hallazgos, 2 = error de config.
    if rc >= 2:
        return ToolResult(
            "knip", config, ERROR, rc, 0, error=f"crash (exit {rc}): {err.strip()[:500]}",
            duration_ms=ms, raw_stderr=err,
        )
    findings = parse_knip(out, REPO_ROOT, fe_root)
    # Excluir bindings/ y src/generated como hallazgo.
    exclusions = scope.get("finding_exclusions", {})
    excl_paths = [norm_path(k, REPO_ROOT) for k in exclusions]
    findings = [f for f in findings if not any(f.path.startswith(ex + "/") or f.path == ex for ex in excl_paths)]
    status = FAIL if findings else PASS
    return ToolResult(
        "knip", config, status, rc, len({f.path for f in findings}), findings=findings,
        duration_ms=ms, raw_stdout=out, raw_stderr=err,
        version=versions["analyzers"]["knip"]["version"],
    )


def run_jscpd(scope: dict, versions: dict, config: str) -> ToolResult:
    fe_root = REPO_ROOT / "vantare-v2" / "frontend"
    out_dir = REPO_ROOT / "tools" / "quality" / ".jscpd-out"
    out_dir.mkdir(parents=True, exist_ok=True)
    pnpm = shutil.which("pnpm") or "pnpm"
    cmd = [
        pnpm, "--dir", str(fe_root), "exec", "jscpd",
        "src", "--config", ".jscpd.json", "--output", str(out_dir),
    ]
    try:
        rc, out, err, ms = run_cmd(cmd, cwd=fe_root, timeout=600)
    except ToolError as e:
        return ToolResult("jscpd", config, ERROR, -1, 0, error=str(e))
    report_file = out_dir / "jscpd-report.json"
    findings: list[Finding] = []
    if not report_file.exists():
        return ToolResult(
            "jscpd", config, ERROR, rc, 0, error="no se genero informe jscpd",
            duration_ms=ms, raw_stdout=out, raw_stderr=err,
        )
    try:
        report = json.loads(report_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return ToolResult(
            "jscpd", config, ERROR, rc, 0, error=f"informe no parseable: {e}",
            duration_ms=ms, raw_stdout=out, raw_stderr=err,
        )
    findings = parse_jscpd(report, REPO_ROOT, fe_root)
    status = FAIL if findings else PASS
    return ToolResult(
        "jscpd", config, status, rc, len({f.path for f in findings}), findings=findings,
        duration_ms=ms, raw_stdout=out, raw_stderr=err,
        version=versions["analyzers"]["jscpd"]["version"],
    )


def run_dependency_cruiser(scope: dict, versions: dict, config: str) -> ToolResult:
    """dependency-cruiser usa su baseline nativo (.dependency-cruiser-known-violations.json)."""
    fe_root = REPO_ROOT / "vantare-v2" / "frontend"
    pnpm = shutil.which("pnpm") or "pnpm"
    cmd = [
        pnpm, "--dir", str(fe_root), "exec", "depcruise",
        "src", "--config", ".dependency-cruiser.cjs", "--ignore-known",
    ]
    try:
        rc, out, err, ms = run_cmd(cmd, cwd=fe_root, timeout=600)
    except ToolError as e:
        return ToolResult("dependency-cruiser", config, ERROR, -1, 0, error=str(e))
    # depcruise: exit 0 = sin violaciones, 1 = violaciones (conocidas o nuevas), 2 = error.
    if rc >= 2:
        return ToolResult(
            "dependency-cruiser", config, ERROR, rc, 0,
            error=f"crash (exit {rc}): {err.strip()[:500]}",
            duration_ms=ms, raw_stderr=err,
        )
    # Contar violaciones del output (formato por linea). El baseline nativo filtra las conocidas.
    violations = [l for l in (out + err).splitlines() if l.strip() and not l.startswith("✓") and "no violations" not in l.lower()]
    status = FAIL if (rc == 1 and violations) else PASS
    return ToolResult(
        "dependency-cruiser", config, status, rc, 0,
        error=err.strip()[:500] if rc >= 2 else "",
        duration_ms=ms, raw_stdout=out, raw_stderr=err,
        version=versions["analyzers"]["dependency-cruiser"]["version"],
    )


ANALYZER_RUNNERS = {
    "staticcheck": run_staticcheck,
    "govet": run_govet,
    "deadcode": run_deadcode,
    "go-mod-tidy": run_go_mod_tidy,
    "knip": run_knip,
    "jscpd": run_jscpd,
    "dependency-cruiser": run_dependency_cruiser,
}


# ---------------------------------------------------------------------------
# Configs a ejecutar por plataforma
# ---------------------------------------------------------------------------

def configs_for_platform() -> list[str]:
    """Configs a ejecutar segun el HOST. Modela por HOST (darwin/linux) + cruce Go windows.
    Declarado explicitamente en scope.json platform_matrix; no dejar implicito."""
    plat = os.uname().sysname.lower()
    if plat == "darwin":
        return ["darwin-dev", "windows-amd64"]
    if plat == "linux":
        return ["linux-dev", "windows-amd64"]
    # Host desconocido: solo cruce windows (defensivo; doctor reportara la brecha).
    return ["windows-amd64"]


def analyzers_for_config(config: str) -> list[str]:
    # Configs de HOST: conjunto completo (Go + frontend + go-mod-tidy).
    if config in ("darwin-dev", "linux-dev"):
        return ["staticcheck", "govet", "deadcode", "go-mod-tidy", "knip", "jscpd", "dependency-cruiser"]
    # windows-amd64: solo analizadores Go (frontend no depende de plataforma).
    return ["staticcheck", "govet", "deadcode"]


# ---------------------------------------------------------------------------
# Baselines
# ---------------------------------------------------------------------------


def baseline_path(analyzer: str) -> Path:
    return BASELINE_DIR / f"{analyzer}.json"


def write_baseline(analyzer: str, findings: list[Finding], scope: dict, versions: dict, configs: list[str]) -> Path:
    BASELINE_DIR.mkdir(parents=True, exist_ok=True)
    # Deduplicar por identidad (mismo hallazgo en varias configs se cuenta una vez).
    seen: dict[tuple, Finding] = {}
    for f in findings:
        seen.setdefault(f.identity(), f)
    dedup = sorted(seen.values(), key=lambda f: f.identity())
    header = {
        "analyzer": analyzer,
        # base_sha es PROCEDENCIA (de que SHA se genero), NO oraculo de manipulacion.
        "base_sha": git_head_sha(REPO_ROOT),
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "tool_versions": {n: versions["analyzers"][n]["version"] for n in versions.get("analyzers", {})},
        "scope_hash": scope_hash(scope),
        "versions_fingerprint": versions_fingerprint(versions),
        # Lista real de configs fusionadas (trazabilidad honesta).
        "configs": sorted(set(configs)),
        "count": len(dedup),
    }
    payload = {
        "header": header,
        "findings": [asdict(f) for f in dedup],
    }
    p = baseline_path(analyzer)
    p.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return p


def load_baseline(analyzer: str) -> dict | None:
    p = baseline_path(analyzer)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def baseline_findings(baseline: dict) -> list[Finding]:
    out: list[Finding] = []
    for f in baseline.get("findings", []):
        out.append(Finding(**f))
    return out


# Analizadores sin baseline: control objetivo bloqueante en cada ejecucion.
# Cualquier hallazgo no exceptuado es NEW bloqueante.
NO_BASELINE_ANALYZERS = {"go-mod-tidy"}


def load_exceptions() -> list[dict]:
    if not EXCEPTIONS_PATH.exists():
        return []
    try:
        data = json.loads(EXCEPTIONS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    return data.get("exceptions", [])


def finding_excepted(f: Finding, exceptions: list[dict]) -> dict | None:
    """Devuelve la excepcion que cubre el hallazgo, o None."""
    for exc in exceptions:
        if exc.get("analyzer") != f.analyzer:
            continue
        if exc.get("rule") != f.rule:
            continue
        if exc.get("path") != f.path:
            continue
        key = exc.get("key", "")
        if f.analyzer == "jscpd":
            if key == f.content_hash:
                return exc
        elif f.symbol:
            if key == f.symbol:
                return exc
        else:
            if key == f.msg_norm:
                return exc
    return None


# ---------------------------------------------------------------------------
# Subcomandos
# ---------------------------------------------------------------------------


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def cmd_bootstrap(args: argparse.Namespace) -> int:
    print("== bootstrap: preparando herramientas fijadas ==")
    # deadcode
    dc_mod = "golang.org/x/tools/cmd/deadcode@v0.49.0"
    bin_path = os.path.join(GOBIN, "deadcode")
    if os.path.exists(bin_path):
        print(f"  deadcode: ya instalado en {bin_path}")
    else:
        print(f"  instalando {dc_mod} ...")
        rc, _out, err, _ = run_cmd(["go", "install", dc_mod], cwd=REPO_ROOT, timeout=300)
        if rc != 0:
            print(f"  ERROR instalando deadcode: {err.strip()}", file=sys.stderr)
            return 2
    # placeholder dist para que //go:embed dist compile en analisis local (gitignored).
    dist_dir = REPO_ROOT / "vantare-v2" / "frontend" / "dist"
    dist_dir.mkdir(parents=True, exist_ok=True)
    (dist_dir / ".gitkeep").write_text("", encoding="utf-8")
    print(f"  dist placeholder: {dist_dir / '.gitkeep'} (gitignored)")
    print("  npm devDeps (knip/dependency-cruiser/jscpd) ya anadidos a frontend/package.json (exactas)")
    print("bootstrap OK")
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    print("== doctor: entorno, versiones, configuracion, cobertura ==")
    scope = load_json(SCOPE_PATH)
    versions = load_json(VERSIONS_PATH)
    issues = 0
    # Toolchain
    print("\n[toolchain]")
    for name, want in (("go", "1.25.0"), ("node", "22.23.2"), ("pnpm", "9.1.0")):
        bin_name = name
        if name == "go":
            rc, out, _err, _ = run_cmd(["go", "version"], cwd=REPO_ROOT, timeout=10)
            ver = out.strip()
        else:
            rc, out, _err, _ = run_cmd([bin_name, "--version"], cwd=REPO_ROOT, timeout=10)
            ver = out.strip().splitlines()[0] if out.strip() else ""
        ok = want in ver
        print(f"  {name}: {'OK' if ok else 'MISMATCH'} -> {ver} (esperado {want})")
        if not ok:
            issues += 1
    # Python (version minima para el runner de CI; no asumir que es la misma)
    py_ver = sys.version_info
    py_ok = (py_ver.major, py_ver.minor) >= PYTHON_MIN
    print(f"  python: {'OK' if py_ok else 'MISMATCH'} -> {py_ver.major}.{py_ver.minor}.{py_ver.micro} (minimo {PYTHON_MIN[0]}.{PYTHON_MIN[1]})")
    if not py_ok:
        issues += 1
    # Analizadores
    print("\n[analizadores]")
    for name, info in versions["analyzers"].items():
        want = info["version"]
        if name in ("staticcheck",):
            bin_path = shutil.which("staticcheck") or os.path.join(GOBIN, "staticcheck")
            rc, out, _err, _ = run_cmd([bin_path, "-version"], cwd=REPO_ROOT, timeout=10)
            got = out.strip()
            ok = want in got
            print(f"  {name}: {'OK' if ok else 'MISMATCH'} -> {got} (esperado {want})")
        elif name == "deadcode":
            bin_path = os.path.join(GOBIN, "deadcode")
            ok = os.path.exists(bin_path)
            print(f"  {name}: {'OK' if ok else 'FALTA'} -> {bin_path} (esperado {want})")
            if not ok:
                issues += 1
        elif name == "govet":
            print(f"  {name}: OK (parte de go {versions['toolchain']['go']['version']})")
        elif name == "go-mod-tidy":
            print(f"  {name}: OK (parte de go {versions['toolchain']['go']['version']})")
        else:
            # npm: leer package.json
            pj = load_json(REPO_ROOT / "vantare-v2" / "frontend" / "package.json")
            got = pj.get("devDependencies", {}).get(name, "")
            ok = got == want
            print(f"  {name}: {'OK' if ok else 'MISMATCH'} -> {got!r} (esperado {want!r})")
            if not ok:
                issues += 1
    # Config
    print("\n[configuracion]")
    for f in ("knip.json", ".dependency-cruiser.cjs", ".jscpd.json"):
        p = REPO_ROOT / "vantare-v2" / "frontend" / f
        print(f"  {f}: {'presente' if p.exists() else 'FALTA'}")
        if not p.exists():
            issues += 1
    # Cobertura
    print("\n[cobertura]")
    print(f"  configs analizables aqui: {configs_for_platform()}")
    print(f"  Go: cmd/vantare NO compila en darwin -> cubierto por windows-amd64 (cross-vet)")
    print(f"  Frontend: entradas produccion={len(scope['in_scope']['vantare-v2-frontend']['production_entries'])}, "
          f"dev/test harness={len(scope['in_scope']['vantare-v2-frontend']['development_entries'])}")
    print(f"  out_of_scope clasificado y visible: {list(scope['out_of_scope'].keys())}")
    # A10: cobertura de ejecutables Go. Cada entrypoint debe estar cubierto por >=1 config.
    print("\n[cobertura de ejecutables Go]")
    executables = scope["in_scope"]["vantare-v2-go"]["executables"]
    host_config = next((c for c in configs_for_platform() if c != "windows-amd64"), "")
    for exe in executables:
        covered = []
        if exe not in HOST_NONCOMPILING and host_config:
            covered.append(host_config)
        covered.append("windows-amd64")
        ok = bool(covered)
        print(f"  {exe}: {'OK' if ok else 'ERROR'} -> cubierto por {covered if ok else 'NINGUNA config'}")
        if not ok:
            issues += 1
    print(f"\n  issues: {issues}")
    return 1 if issues else 0


def _run_all(scope: dict, versions: dict) -> list[ToolResult]:
    results: list[ToolResult] = []
    for config in configs_for_platform():
        for analyzer in analyzers_for_config(config):
            runner = ANALYZER_RUNNERS[analyzer]
            print(f"  [{config}] {analyzer} ...", flush=True)
            res = runner(scope, versions, config)
            results.append(res)
            print(f"    -> {res.status} (exit {res.exit_code}, {len(res.findings)} hallazgos, {res.duration_ms}ms)")
    return results


def cmd_audit(args: argparse.Namespace) -> int:
    print("== audit: analisis completo + generacion de baselines ==")
    scope = load_json(SCOPE_PATH)
    versions = load_json(VERSIONS_PATH)
    results = _run_all(scope, versions)
    # No escribir baseline de un analizador en ERROR: un baseline vacio/parcial
    # quedaria "aceptado" y enmascararia el fallo.
    error_analyzers = {r.analyzer for r in results if r.status == ERROR}
    if error_analyzers:
        print(f"\n  ANALIZADORES EN ERROR (no se escribe baseline): {sorted(error_analyzers)}")
    # Escribir baselines (uno por analizador, fusionando configs).
    # Los analizadores sin baseline (go-mod-tidy) son control objetivo bloqueante
    # en cada ejecucion; no se aceptan como referencia.
    by_analyzer: dict[str, list[Finding]] = {}
    configs_by_analyzer: dict[str, list[str]] = {}
    for r in results:
        if r.analyzer in error_analyzers:
            continue
        if r.analyzer in NO_BASELINE_ANALYZERS:
            continue
        by_analyzer.setdefault(r.analyzer, []).extend(r.findings)
        configs_by_analyzer.setdefault(r.analyzer, []).append(r.config)
    for analyzer, findings in by_analyzer.items():
        p = write_baseline(analyzer, findings, scope, versions, configs_by_analyzer[analyzer])
        print(f"  baseline {p.name}: {len(findings)} hallazgos (configs: {configs_by_analyzer[analyzer]})")
    # Listar excepciones activas (visibles, no deuda invisible).
    exceptions = load_exceptions()
    if exceptions:
        print("\n  EXCEPCIONES ACTIVAS (control sin baseline):")
        for exc in exceptions:
            print(f"    - [{exc['analyzer']}] {exc['path']} {exc['rule']} -> {exc['id']}")
    _save_last_run(results, scope, versions, mode="audit")
    _print_summary(results)
    # exit != 0 si algun analizador casco: el audit no puede "pasar" con analizadores rotos.
    return 1 if error_analyzers else 0


def _save_last_run(results: list[ToolResult], scope: dict, versions: dict, mode: str) -> None:
    payload = {
        "mode": mode,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "scope_hash": scope_hash(scope),
        "versions_fingerprint": versions_fingerprint(versions),
        "results": [
            {
                "analyzer": r.analyzer,
                "config": r.config,
                "status": r.status,
                "exit_code": r.exit_code,
                "files_scanned": r.files_scanned,
                "findings": [asdict(f) for f in r.findings],
                "error": r.error,
                "duration_ms": r.duration_ms,
                "version": r.version,
            }
            for r in results
        ],
    }
    LAST_RUN_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _print_summary(results: list[ToolResult]) -> None:
    print("\n== resumen ==")
    for r in results:
        blocking = r.analyzer in BLOCKING_ANALYZERS
        tag = "bloqueante" if blocking else ("informativo" if r.analyzer in INFORMATIVE_ANALYZERS else "")
        print(f"  {r.analyzer}/{r.config}: {r.status} ({len(r.findings)} hallazgos) [{tag}]")
    by_analyzer: dict[str, int] = {}
    for r in results:
        by_analyzer[r.analyzer] = by_analyzer.get(r.analyzer, 0) + len(r.findings)
    print("\n== recuento por analizador (total) ==")
    for a, n in sorted(by_analyzer.items()):
        print(f"  {a}: {n}")


def _policy_changed(scope: dict, base_sha: str) -> tuple[bool, list[str]]:
    """Detecta si se ha modificado la politica (baselines, configs, ignores, tools/quality).

    Considera tanto el diff commiteado (base_sha..HEAD) como los archivos sin commit
    (git status --porcelain). Un agente puede editar la politica sin commitear para
    blanquear una regresion en la misma ejecucion.
    """
    patterns = scope.get("policy_paths", {}).get("force_full_graph_on_change", [])
    if not patterns:
        return False, []
    changed: list[str] = []
    if base_sha:
        changed.extend(git_changed_paths(REPO_ROOT, base_sha))
    changed.extend(git_porcelain_paths(REPO_ROOT))
    matched = sorted({p for p in changed if fnmatch_any(p, patterns)})
    return bool(matched), matched


def cmd_check(args: argparse.Namespace) -> int:
    print("== check: controles frecuentes + ratchet ==")
    scope = load_json(SCOPE_PATH)
    versions = load_json(VERSIONS_PATH)

    # Determinar la base del diff para policy_changed. NUNCA usar la cabecera del
    # baseline como oraculo de manipulacion (es autorreferencial: quien regenera
    # los baselines fija base_sha = HEAD, entonces git diff HEAD HEAD queda vacio).
    # El base_sha del baseline se conserva solo como PROCEDENCIA.
    # Validar --ci/--base ANTES de ejecutar analizadores (no desperdiciar trabajo).
    base_sha = ""
    base_source = ""
    if args.ci:
        if not args.base:
            print("  ERROR: --ci requiere --base <sha> (base real del PR)", file=sys.stderr)
            return 1
        base_sha = args.base
        base_source = "ci/--base"
    elif args.base:
        base_sha = args.base
        base_source = "--base"
    else:
        # Local: intenta merge-base origin/nightly HEAD.
        mb = git_merge_base_nightly(REPO_ROOT)
        if mb:
            base_sha = mb
            base_source = "merge-base origin/nightly HEAD"
        else:
            base_sha = ""
            base_source = "indeterminada"

    results = _run_all(scope, versions)

    # Integridad de baselines: scope_hash y versiones deben coincidir.
    integrity_issues: list[str] = []
    classifications: dict[str, Classification] = {}
    excepted_findings: dict[str, list[dict]] = {}
    # Fusionar hallazgos actuales por analizador (todas las configs) antes de clasificar.
    actual_by_analyzer: dict[str, list[Finding]] = {}
    for r in results:
        actual_by_analyzer.setdefault(r.analyzer, []).extend(r.findings)
    exceptions = load_exceptions()
    seen_analyzers: set[str] = set()
    for r in results:
        if r.status == ERROR:
            integrity_issues.append(f"{r.analyzer}/{r.config}: ERROR -> {r.error}")
        if r.analyzer in seen_analyzers:
            continue
        seen_analyzers.add(r.analyzer)
        # Analizadores sin baseline: control objetivo bloqueante. Cualquier
        # hallazgo no exceptuado es NEW bloqueante.
        if r.analyzer in NO_BASELINE_ANALYZERS:
            actual = actual_by_analyzer[r.analyzer]
            new_blocking: list[Finding] = []
            excepted: list[dict] = []
            for f in actual:
                exc = finding_excepted(f, exceptions)
                if exc is not None:
                    excepted.append({"finding": asdict(f), "exception": exc["id"]})
                else:
                    new_blocking.append(f)
            classifications[r.analyzer] = Classification(new=new_blocking)
            excepted_findings[r.analyzer] = excepted
            continue
        bl = load_baseline(r.analyzer)
        if bl is None:
            integrity_issues.append(f"{r.analyzer}: sin baseline (ejecuta 'audit')")
            classifications[r.analyzer] = Classification()
            continue
        header = bl.get("header", {})
        if header.get("scope_hash") != scope_hash(scope):
            integrity_issues.append(f"{r.analyzer}: scope_hash del baseline distinto -> recalibrar")
        if header.get("versions_fingerprint") != versions_fingerprint(versions):
            integrity_issues.append(f"{r.analyzer}: versiones del baseline distintas -> recalibrar")
        base_findings = baseline_findings(bl)
        classifications[r.analyzer] = classify_findings(base_findings, actual_by_analyzer[r.analyzer])

    # C1 DEFENSA: un analizador con baseline (o control sin baseline) que no
    # produjo resultado en esta ejecucion es NOT_RUN -> ERROR. Nunca puede
    # desaparecer en silencio dejando el agregado en PASS.
    ran_analyzers = {r.analyzer for r in results}
    configs_ran_by_analyzer: dict[str, list[str]] = {}
    for r in results:
        configs_ran_by_analyzer.setdefault(r.analyzer, []).append(r.config)
    # Analizadores esperados: los que tienen baseline O son control sin baseline.
    expected_analyzers: set[str] = set()
    for analyzer in ALL_ANALYZERS:
        if load_baseline(analyzer) is not None or analyzer in NO_BASELINE_ANALYZERS:
            expected_analyzers.add(analyzer)
    not_run = expected_analyzers - ran_analyzers
    for a in sorted(not_run):
        integrity_issues.append(f"{a}: NOT_RUN (analizador con baseline/control no produjo resultado)")
    # C1 DEFENSA: comparar configs del baseline con configs realmente ejecutadas.
    # Si difieren, los hallazgos no son comparables -> ERROR pidiendo recalibracion.
    for r in results:
        if r.analyzer in seen_analyzers and r.analyzer not in NO_BASELINE_ANALYZERS:
            bl = load_baseline(r.analyzer)
            if bl is not None:
                bl_configs = set(bl.get("header", {}).get("configs", []))
                ran_configs = set(configs_ran_by_analyzer.get(r.analyzer, []))
                if bl_configs and bl_configs != ran_configs:
                    integrity_issues.append(
                        f"{r.analyzer}: configs del baseline ({sorted(bl_configs)}) != configs ejecutadas ({sorted(ran_configs)}) -> recalibrar"
                    )

    # policy_changed: usa la base real del diff, no la cabecera del baseline.
    if base_sha:
        policy_changed, policy_paths = _policy_changed(scope, base_sha)
    else:
        # Base indeterminada: no se puede garantizar que la politica no se haya
        # manipulado. Estado desconocido -> BLOCKED (exit != 0), nunca PASS.
        policy_changed = False
        policy_paths = []
        integrity_issues.append("base del diff indeterminada (no se encontro origin/nightly); pasa --base <sha>")

    # Agregado
    new_blocking = sum(len(c.new_blocking) for c in classifications.values())
    moved_total = sum(len(c.moved) for c in classifications.values())
    has_error = any(r.status == ERROR for r in results)

    if integrity_issues:
        aggregate = FAIL
    elif has_error:
        aggregate = FAIL
    elif new_blocking > 0:
        aggregate = FAIL
    elif policy_changed:
        aggregate = REVIEW_REQUIRED
    else:
        # FAIL sin NEW: hallazgos que ya estaban en baseline (aceptados) -> PASS contra baseline.
        aggregate = PASS

    _save_last_run(results, scope, versions, mode="check")
    # Anotar clasificacion en last-run
    last = json.loads(LAST_RUN_PATH.read_text(encoding="utf-8"))
    last["aggregate"] = aggregate
    last["policy_changed"] = policy_changed
    last["policy_changed_paths"] = policy_paths
    last["base_sha"] = base_sha
    last["base_source"] = base_source
    last["integrity_issues"] = integrity_issues
    last["classifications"] = {
        a: {"new": len(c.new), "new_blocking": len(c.new_blocking), "resolved": len(c.resolved), "moved": len(c.moved)}
        for a, c in classifications.items()
    }
    last["moved_findings"] = [asdict(f) for c in classifications.values() for f in c.moved]
    last["new_blocking_findings"] = [asdict(f) for c in classifications.values() for f in c.new_blocking]
    last["excepted_findings"] = excepted_findings
    LAST_RUN_PATH.write_text(json.dumps(last, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"\n  base_sha: {base_sha or '(indeterminada)'} [{base_source}]")
    print("\n== ratchet ==")
    for a, c in classifications.items():
        print(f"  {a}: NEW={len(c.new)} (bloqueantes {len(c.new_blocking)}), RESOLVED={len(c.resolved)}, MOVED={len(c.moved)}")
    if integrity_issues:
        print("\n  INTEGRIDAD:")
        for i in integrity_issues:
            print(f"    - {i}")
    if moved_total:
        print("\n  MOVED (destacado, nunca silenciado):")
        for a, c in classifications.items():
            for f in c.moved:
                print(f"    - [{a}] {f.path} {f.rule} {f.msg_norm or f.symbol or f.content_hash[:12]}")
    # Excepciones activas (visibles en cada ejecucion, no deuda invisible).
    if excepted_findings:
        print("\n  EXCEPCIONES ACTIVAS (control sin baseline):")
        for a, exs in excepted_findings.items():
            for e in exs:
                print(f"    - [{a}] {e['finding']['path']} {e['finding']['rule']} -> {e['exception']}")
    print(f"\n  policy_changed: {policy_changed} {policy_paths}")
    print(f"  aggregate: {aggregate}")
    # REVIEW_REQUIRED debe salir con exit != 0: un PR que toca la politica no puede
    # blanquear una regresion y dejar CI en verde.
    return 1 if aggregate in (FAIL, ERROR, BLOCKED, REVIEW_REQUIRED) else 0


def cmd_report(args: argparse.Namespace) -> int:
    print("== report: resumen de la ultima ejecucion ==")
    if not LAST_RUN_PATH.exists():
        print("  no hay ultima ejecucion (ejecuta check o audit)", file=sys.stderr)
        return 1
    last = json.loads(LAST_RUN_PATH.read_text(encoding="utf-8"))
    md_path = SCRIPT_DIR / ".last-report.md"
    json_path = SCRIPT_DIR / ".last-report.json"
    lines = ["# Vantare quality report", ""]
    lines.append(f"- generated_at: {last.get('generated_at')}")
    lines.append(f"- mode: {last.get('mode')}")
    lines.append(f"- aggregate: {last.get('aggregate', 'n/a')}")
    lines.append(f"- policy_changed: {last.get('policy_changed', False)}")
    lines.append("")
    lines.append("## Analizadores")
    lines.append("| analyzer | config | status | exit | findings | files | ms |")
    lines.append("|---|---|---|---|---|---|---|")
    for r in last.get("results", []):
        lines.append(f"| {r['analyzer']} | {r['config']} | {r['status']} | {r['exit_code']} | {len(r['findings'])} | {r['files_scanned']} | {r['duration_ms']} |")
    if last.get("classifications"):
        lines.append("")
        lines.append("## Ratchet")
        lines.append("| analyzer | NEW | NEW blocking | RESOLVED | MOVED |")
        lines.append("|---|---|---|---|---|")
        for a, c in last["classifications"].items():
            lines.append(f"| {a} | {c['new']} | {c['new_blocking']} | {c['resolved']} | {c['moved']} |")
    if last.get("moved_findings"):
        lines.append("")
        lines.append("## MOVED (destacado)")
        for f in last["moved_findings"]:
            lines.append(f"- `{f['analyzer']}` `{f['path']}` {f['rule']} {f.get('msg_norm') or f.get('symbol') or (f.get('content_hash','')[:12])}")
    if last.get("new_blocking_findings"):
        lines.append("")
        lines.append("## NEW bloqueantes")
        for f in last["new_blocking_findings"]:
            lines.append(f"- `{f['analyzer']}` `{f['path']}` {f['rule']} {f.get('msg_norm') or f.get('symbol') or (f.get('content_hash','')[:12])}")
    if last.get("integrity_issues"):
        lines.append("")
        lines.append("## Integridad")
        for i in last["integrity_issues"]:
            lines.append(f"- {i}")
    md = "\n".join(lines) + "\n"
    md_path.write_text(md, encoding="utf-8")
    json_path.write_text(json.dumps(last, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(md)
    print(f"  markdown: {md_path}")
    print(f"  json: {json_path}")
    return 0


def cmd_baseline(args: argparse.Namespace) -> int:
    if not args.confirm:
        print("  baseline requiere --confirm (NUNCA se invoca en CI)", file=sys.stderr)
        return 2
    print("== baseline: aceptando referencia (recalibracion explicita) ==")
    scope = load_json(SCOPE_PATH)
    versions = load_json(VERSIONS_PATH)
    results = _run_all(scope, versions)
    error_analyzers = {r.analyzer for r in results if r.status == ERROR}
    if error_analyzers:
        print(f"  ERROR: no se acepta baseline con analizadores rotos: {sorted(error_analyzers)}", file=sys.stderr)
        return 1
    by_analyzer: dict[str, list[Finding]] = {}
    configs_by_analyzer: dict[str, list[str]] = {}
    for r in results:
        by_analyzer.setdefault(r.analyzer, []).extend(r.findings)
        configs_by_analyzer.setdefault(r.analyzer, []).append(r.config)
    for analyzer, findings in by_analyzer.items():
        p = write_baseline(analyzer, findings, scope, versions, configs_by_analyzer[analyzer])
        print(f"  baseline {p.name}: {len(findings)} hallazgos (base_sha={git_head_sha(REPO_ROOT)[:12]})")
    print("baseline aceptado")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="vantare_quality.py")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("bootstrap", help="preparar herramientas fijadas")
    sub.add_parser("doctor", help="entorno/versiones/configuracion/cobertura")
    p_check = sub.add_parser("check", help="controles frecuentes + ratchet")
    p_check.add_argument("--ci", action="store_true", help="modo CI: exige --base")
    p_check.add_argument("--base", metavar="SHA", help="SHA base real del PR para el diff de politica")
    sub.add_parser("audit", help="analisis completo + baselines iniciales")
    sub.add_parser("report", help="resumen de la ultima ejecucion")
    p_bl = sub.add_parser("baseline", help="aceptar referencia (NUNCA en CI)")
    p_bl.add_argument("--confirm", action="store_true", help="confirmacion explicita")
    args = parser.parse_args()
    handlers = {
        "bootstrap": cmd_bootstrap,
        "doctor": cmd_doctor,
        "check": cmd_check,
        "audit": cmd_audit,
        "report": cmd_report,
        "baseline": cmd_baseline,
    }
    return handlers[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
