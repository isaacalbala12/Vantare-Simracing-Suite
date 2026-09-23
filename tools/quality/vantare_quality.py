#!/usr/bin/env python3
"""Sistema de calidad anti-slop de Vantare.

Un unico script con subcomandos: bootstrap, doctor, check, audit, report, baseline.
Python 3 estandar, sin dependencias nuevas, coherente con .github/scripts/*.py.

El nucleo es la funcion PURA `classify_findings` (ratchet por identidad con
semantica de multiconjunto), separada de la ejecucion de analizadores.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import time
from collections import Counter
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

# Estados de integridad: nunca devolver PASS por defecto.
PASS = "PASS"
FAIL = "FAIL"
BLOCKED = "BLOCKED"
NOT_RUN = "NOT_RUN"
NOT_APPLICABLE = "NOT_APPLICABLE"
ERROR = "ERROR"
REVIEW_REQUIRED = "REVIEW_REQUIRED"

# Dos familias de analizadores:
# - RATCHET: bloquean por NEW (hallazgos no en baseline). Su FAIL solo significa
#   "encontro hallazgos", que es normal porque el baseline los contiene.
# - STATUS: no tienen baseline nuestro; su FAIL YA significa "violacion nueva".
#   Bloquean por estado.
STATUS_BLOCKING_ANALYZERS = {"dependency-cruiser", "go-mod-tidy"}
RATCHET_ANALYZERS = {"staticcheck", "govet", "knip", "jscpd"}
INFORMATIVE_ANALYZERS = {"deadcode"}
ALL_ANALYZERS = RATCHET_ANALYZERS | STATUS_BLOCKING_ANALYZERS | INFORMATIVE_ANALYZERS

# Analizadores sin baseline versionado (control objetivo o baseline nativo).
NO_BASELINE_ANALYZERS = {"go-mod-tidy", "dependency-cruiser"}

# Paquetes Go que NO compilan en el host non-windows.
HOST_NONCOMPILING = {"cmd/vantare"}

GOBIN = os.environ.get("GOBIN") or os.path.expanduser("~/go/bin")
PYTHON_MIN = (3, 10)

# Marcadores de error de build/vendoring en stderr de go vet/staticcheck.
_BUILD_ERROR_MARKERS = (
    "inconsistent vendoring", "build failed", "cannot find package",
    "undefined:", "syntax error", "package main expected",
    "no matching files found", "missing go.sum entry",
)


# ---------------------------------------------------------------------------
# Identidad de hallazgo (funciones puras)
# ---------------------------------------------------------------------------

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
        rel = Path(path)
    return PurePosixPath(*rel.parts).as_posix()


def msg_norm(message: str) -> str:
    """Mensaje en minusculas, espacios colapsados.
    NO elimina digitos: los digitos a veces distinguen simbolos distintos."""
    if not message:
        return ""
    return _WS.sub(" ", message.lower()).strip()


def content_hash(text: str) -> str:
    """sha256 del fragmento con blancos colapsados y recortado."""
    if not text:
        return ""
    collapsed = _WS.sub(" ", text).strip()
    return hashlib.sha256(collapsed.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class Finding:
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
        return (self.analyzer, self.rule, self.path, self.msg_norm or self.symbol or self.content_hash)


@dataclass
class Classification:
    new: list[Finding] = field(default_factory=list)
    resolved: list[Finding] = field(default_factory=list)
    moved: list[Finding] = field(default_factory=list)

    @property
    def new_blocking(self) -> list[Finding]:
        # Bloqueantes: RATCHET (NEW contra baseline) y STATUS_BLOCKING (NEW = violacion nueva).
        return [f for f in self.new if f.analyzer in (RATCHET_ANALYZERS | STATUS_BLOCKING_ANALYZERS)]


def classify_findings(base: Iterable[Finding], actual: Iterable[Finding]) -> Classification:
    """Funcion PURA: clasifica hallazgos con semantica de MULTICONJUNTO.

    NEW: identidades cuyo recuento actual supera al del baseline (con la diferencia).
    RESOLVED: identidades cuyo recuento del baseline supera al actual.
    MOVED: un NEW y un RESOLVED con misma regla, mismo msg_norm/symbol, DISTINTO path.
    El orden es determinista (por tupla de identidad).
    """
    base_list = list(base)
    actual_list = list(actual)
    base_counter = Counter(f.identity() for f in base_list)
    actual_counter = Counter(f.identity() for f in actual_list)

    base_by_id: dict[tuple, list[Finding]] = {}
    for f in base_list:
        base_by_id.setdefault(f.identity(), []).append(f)
    actual_by_id: dict[tuple, list[Finding]] = {}
    for f in actual_list:
        actual_by_id.setdefault(f.identity(), []).append(f)

    all_ids = sorted(set(base_counter) | set(actual_counter))
    new: list[Finding] = []
    resolved: list[Finding] = []
    for ident in all_ids:
        b_count = base_counter.get(ident, 0)
        a_count = actual_counter.get(ident, 0)
        if a_count > b_count:
            new.extend(actual_by_id[ident][b_count:])
        elif b_count > a_count:
            resolved.extend(base_by_id[ident][a_count:])

    # MOVED: emparejar NEW con RESOLVED de misma regla y mensaje/symbol, distinto path.
    moved: list[Finding] = []
    remaining_new: list[Finding] = []
    consumed: set[tuple[str, ...]] = set()
    resolved_by_key: dict[tuple[str, str], list[Finding]] = {}
    for r in resolved:
        key = r.content_hash if r.analyzer == "jscpd" else (r.symbol or r.msg_norm)
        resolved_by_key.setdefault((r.rule, key), []).append(r)
    for bucket in resolved_by_key.values():
        bucket.sort(key=lambda f: f.identity())
    for n in sorted(new, key=lambda f: f.identity()):
        key = n.content_hash if n.analyzer == "jscpd" else (n.symbol or n.msg_norm)
        candidates = resolved_by_key.get((n.rule, key), [])
        match = next((r for r in candidates if r.identity() not in consumed and n.path != r.path), None)
        if match:
            consumed.add(match.identity())
            moved.append(n)
        else:
            remaining_new.append(n)
    return Classification(new=remaining_new, resolved=resolved, moved=moved)


# ---------------------------------------------------------------------------
# Resultado de ejecucion
# ---------------------------------------------------------------------------

@dataclass
class ToolResult:
    analyzer: str
    config: str
    status: str
    exit_code: int
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


def run_cmd(cmd: list[str], *, cwd: Path, timeout: int, env: dict[str, str] | None = None) -> tuple[int, str, str, int]:
    start = time.monotonic()
    full_env = os.environ.copy()
    if env:
        full_env.update(env)
    try:
        proc = subprocess.run(cmd, cwd=str(cwd), env=full_env, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        raise ToolError(f"timeout tras {timeout}s") from e
    except FileNotFoundError as e:
        raise ToolError(f"comando no encontrado: {cmd[0]}") from e
    return proc.returncode, proc.stdout, proc.stderr, int((time.monotonic() - start) * 1000)


def git_head_sha(repo_root: Path) -> str:
    try:
        rc, out, _err, _ = run_cmd(["git", "rev-parse", "HEAD"], cwd=repo_root, timeout=10)
        return out.strip() if rc == 0 else ""
    except ToolError:
        return ""


def git_changed_paths(repo_root: Path, base_sha: str) -> list[str]:
    """Lista de paths cambiados entre base_sha y HEAD. ERROR si base no resoluble."""
    if not base_sha:
        raise ToolError("base_sha vacia")
    rc, out, err, _ = run_cmd(["git", "diff", "--name-only", base_sha, "HEAD"], cwd=repo_root, timeout=30)
    if rc != 0:
        raise ToolError(f"git diff fallo (exit {rc}): {err.strip()[:300]}")
    return [p for p in out.splitlines() if p.strip()]


def git_porcelain_paths(repo_root: Path) -> list[str]:
    try:
        rc, out, _err, _ = run_cmd(["git", "status", "--porcelain"], cwd=repo_root, timeout=30)
        if rc == 0:
            return [line[3:].strip().strip('"') for line in out.splitlines() if len(line) >= 4]
    except ToolError:
        pass
    return []


def git_merge_base_nightly(repo_root: Path) -> str:
    try:
        rc, out, _err, _ = run_cmd(["git", "merge-base", "origin/nightly", "HEAD"], cwd=repo_root, timeout=30)
        return out.strip() if rc == 0 else ""
    except ToolError:
        return ""


def git_show_file(repo_root: Path, sha: str, path: str) -> str:
    """Lee un archivo del arbol git en sha dado. ERROR si no se puede leer."""
    rc, out, err, _ = run_cmd(["git", "show", f"{sha}:{path}"], cwd=repo_root, timeout=15)
    if rc != 0:
        raise ToolError(f"no se pudo leer {path}@{sha[:12]}: {err.strip()[:200]}")
    return out


def fnmatch_any(path: str, patterns: list[str]) -> bool:
    import fnmatch
    for pat in patterns:
        if pat.endswith("/**"):
            prefix = pat[:-3].rstrip("/")
            if path == prefix or path.startswith(prefix + "/"):
                return True
        elif "/**" in pat:
            regex = re.escape(pat).replace(r"\*\*", ".*").replace(r"\*", "[^/]*")
            if re.fullmatch(regex, path):
                return True
        else:
            if fnmatch.fnmatch(path, pat):
                return True
    return False


def scope_hash(scope: dict) -> str:
    return hashlib.sha256(json.dumps(scope, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def versions_fingerprint(versions: dict) -> str:
    parts = [f"{n}={versions['analyzers'][n]['version']}" for n in sorted(versions.get("analyzers", {}))]
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


def baseline_versions_match(analyzer: str, header: dict, versions: dict) -> bool:
    if header.get("versions_fingerprint") == versions_fingerprint(versions):
        return True
    # jscpd's trusted PR-base baseline is unchanged by Go-only tool upgrades.
    # Its own version must still match; source provenance is checked below.
    if analyzer == "jscpd":
        expected = versions.get("analyzers", {}).get("jscpd", {}).get("version")
        return bool(expected) and header.get("tool_versions", {}).get("jscpd") == expected
    return False


# ---------------------------------------------------------------------------
# Configs: fisicas (ejecucion) y semanticas (baselines portables)
# ---------------------------------------------------------------------------

def configs_for_platform() -> list[str]:
    """Configs fisicas a ejecutar segun el HOST."""
    plat = platform.system().lower()
    if plat == "darwin":
        return ["darwin-dev", "windows-amd64"]
    if plat == "linux":
        return ["linux-dev", "windows-amd64"]
    return ["windows-amd64"]


def analyzers_for_config(config: str) -> list[str]:
    if config in ("darwin-dev", "linux-dev"):
        return ["staticcheck", "govet", "deadcode", "go-mod-tidy", "knip", "jscpd", "dependency-cruiser"]
    return ["staticcheck", "govet", "deadcode"]


def semantic_config(analyzer: str, physical_config: str) -> str:
    """Normaliza el nombre de config para baselines portables.
    Frontend no depende del host; Go de host es equivalente en darwin/linux."""
    if analyzer in ("knip", "jscpd", "dependency-cruiser"):
        return "frontend"
    if physical_config in ("darwin-dev", "linux-dev"):
        return "host-go"
    return physical_config


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

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
        findings.append(Finding("staticcheck", code, norm_path(file, repo_root), msg_norm=msg))
    return findings


_VET_LINE = re.compile(r"^(?P<file>.+?):(?P<line>\d+):(?P<col>\d+):\s*(?P<msg>.*)$")


def _has_build_error(stderr: str, stdout: str) -> bool:
    combined = (stderr + "\n" + stdout).lower()
    return any(m in combined for m in _BUILD_ERROR_MARKERS) and "error strings should" not in combined


def parse_govet(stdout: str, stderr: str, repo_root: Path) -> tuple[list[Finding], bool]:
    findings: list[Finding] = []
    had_compile = _has_build_error(stderr, stdout)
    for line in (stdout + "\n" + stderr).splitlines():
        m = _VET_LINE.match(line.strip())
        if not m:
            continue
        msg = m.group("msg")
        if any(mk in msg.lower() for mk in _BUILD_ERROR_MARKERS):
            had_compile = True
            continue
        findings.append(Finding("govet", "vet", norm_path(m.group("file"), repo_root), msg_norm=msg_norm(msg)))
    return findings, had_compile


_DC_LINE = re.compile(
    r"^(?P<file>.+?):(?P<line>\d+):(?P<col>\d+):\s*unreachable\s+(?P<kind>func|method|var|const):\s*(?P<symbol>.*)$"
)


def parse_deadcode(stdout: str, stderr: str, repo_root: Path) -> list[Finding]:
    findings: list[Finding] = []
    for line in stdout.splitlines():
        m = _DC_LINE.match(line.strip())
        if not m:
            continue
        findings.append(Finding("deadcode", "deadcode", norm_path(m.group("file"), repo_root), symbol=m.group("symbol").strip()))
    return findings


_KNIP_CATEGORIES = (
    "files", "exports", "types", "nsExports", "nsTypes", "enumMembers",
    "namespaceMembers", "duplicates", "dependencies", "devDependencies",
    "optionalPeerDependencies", "unlisted", "unresolved", "binaries",
    "catalog", "catalogReferences",
)


def parse_knip(stdout: str, repo_root: Path, frontend_root: Path) -> list[Finding]:
    if not stdout.strip():
        return []
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError:
        raise ToolError("knip: JSON no parseable")
    issues = data.get("issues", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
    findings: list[Finding] = []
    for iss in issues:
        rel = iss.get("file", "") or ""
        path = norm_path(str(frontend_root / rel), repo_root) if rel else str(frontend_root.relative_to(repo_root).as_posix())
        for cat in _KNIP_CATEGORIES:
            items = iss.get(cat, [])
            if not isinstance(items, list):
                continue
            for item in items:
                name = item.get("name", "") if isinstance(item, dict) else str(item)
                findings.append(Finding("knip", cat, path, symbol=name))
    return findings


def parse_jscpd(report_obj: Any, repo_root: Path, frontend_root: Path) -> list[Finding]:
    """UN hallazgo POR EMPLAZAMIENTO (site). Un tercer emplazamiento es NEW."""
    findings: list[Finding] = []
    for dup in (report_obj.get("duplicates", []) if isinstance(report_obj, dict) else []):
        ch = content_hash(dup.get("fragment", ""))
        for site in (dup.get("firstFile"), dup.get("secondFile")):
            if not isinstance(site, dict):
                continue
            sp = site.get("name") or ""
            if sp:
                findings.append(Finding("jscpd", "duplication", norm_path(str(frontend_root / sp), repo_root), content_hash=ch))
    return findings


# ---------------------------------------------------------------------------
# Ejecutores
# ---------------------------------------------------------------------------

def _go_packages_excluding(repo_root: Path, exclude: set[str]) -> list[str]:
    rc, out, err, _ = run_cmd(["go", "list", "./..."], cwd=repo_root, timeout=120)
    if rc != 0:
        raise ToolError(f"go list fallo: {err.strip()}")
    module_path = "github.com/vantare/overlays/v2/"
    return [p for p in out.splitlines() if p.strip() and (p[len(module_path):] if p.startswith(module_path) else p) not in exclude]


def _go_env(config: str) -> dict[str, str]:
    if config == "windows-amd64":
        return {"GOOS": "windows", "GOARCH": "amd64"}
    if config == "windows-amd64-production":
        return {"GOOS": "windows", "GOARCH": "amd64", "GOFLAGS": "-tags=production"}
    return {}


def run_staticcheck(scope: dict, versions: dict, config: str) -> ToolResult:
    go_root = REPO_ROOT / "vantare-v2"
    bin_path = shutil.which("staticcheck") or os.path.join(GOBIN, "staticcheck")
    try:
        rc, out, err, ms = run_cmd([bin_path, "-f", "json", "./..."], cwd=go_root, timeout=600, env=_go_env(config))
    except ToolError as e:
        return ToolResult("staticcheck", config, ERROR, -1, error=str(e))
    version = _staticcheck_version(bin_path)
    if rc >= 2 or (rc != 0 and _has_build_error(err, out)):
        return ToolResult("staticcheck", config, ERROR, rc, error=f"crash/build (exit {rc}): {err.strip()[:500]}", duration_ms=ms, raw_stderr=err, version=version)
    findings = parse_staticcheck(out, REPO_ROOT)
    if rc == 1 and not findings:
        return ToolResult("staticcheck", config, ERROR, rc, error=f"exit 1 sin hallazgos parseables: {err.strip()[:500]}", duration_ms=ms, raw_stderr=err, version=version)
    return ToolResult("staticcheck", config, FAIL if findings else PASS, rc, findings=findings, duration_ms=ms, raw_stdout=out, raw_stderr=err, version=version)


def _staticcheck_version(bin_path: str) -> str:
    try:
        rc, out, _err, _ = run_cmd([bin_path, "-version"], cwd=REPO_ROOT, timeout=10)
        return out.strip() if rc == 0 else ""
    except ToolError:
        return ""


def run_govet(scope: dict, versions: dict, config: str) -> ToolResult:
    go_root = REPO_ROOT / "vantare-v2"
    if config in ("darwin-dev", "linux-dev"):
        pkgs = _go_packages_excluding(go_root, HOST_NONCOMPILING)
    else:
        pkgs = ["./..."]
    if not pkgs:
        return ToolResult("govet", config, NOT_APPLICABLE, 0)
    try:
        rc, out, err, ms = run_cmd(["go", "vet"] + pkgs, cwd=go_root, timeout=600, env=_go_env(config))
    except ToolError as e:
        return ToolResult("govet", config, ERROR, -1, error=str(e))
    findings, had_compile = parse_govet(out, err, REPO_ROOT)
    if had_compile or (rc != 0 and not findings):
        return ToolResult("govet", config, ERROR, rc, error=f"build error (exit {rc}): {err.strip()[:500]}", duration_ms=ms, raw_stdout=out, raw_stderr=err)
    return ToolResult("govet", config, FAIL if findings else PASS, rc, findings=findings, duration_ms=ms, raw_stdout=out, raw_stderr=err)


def run_deadcode(scope: dict, versions: dict, config: str) -> ToolResult:
    go_root = REPO_ROOT / "vantare-v2"
    bin_path = os.path.join(GOBIN, "deadcode")
    if not os.path.exists(bin_path):
        bin_path = shutil.which("deadcode") or bin_path
    if config in ("darwin-dev", "linux-dev"):
        pkgs = _go_packages_excluding(go_root, HOST_NONCOMPILING)
    else:
        pkgs = ["./..."]
    if not pkgs:
        return ToolResult("deadcode", config, NOT_APPLICABLE, 0)
    try:
        rc, out, err, ms = run_cmd([bin_path] + pkgs, cwd=go_root, timeout=600, env=_go_env(config))
    except ToolError as e:
        return ToolResult("deadcode", config, ERROR, -1, error=str(e))
    if rc != 0:
        return ToolResult("deadcode", config, ERROR, rc, error=f"deadcode no pudo analizar (exit {rc}): {err.strip()[:300]}", duration_ms=ms, raw_stdout=out, raw_stderr=err)
    findings = parse_deadcode(out, err, REPO_ROOT)
    return ToolResult("deadcode", config, PASS, rc, findings=findings, duration_ms=ms, raw_stdout=out, raw_stderr=err, version=versions["analyzers"]["deadcode"]["version"])


def run_go_mod_tidy(scope: dict, versions: dict, config: str) -> ToolResult:
    """go mod tidy -diff por modulo. NO modifica manifiestos. STATUS_BLOCKING."""
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
            findings.append(Finding("go-mod-tidy", "tidy-error", name, msg_norm=msg_norm(str(e))))
            continue
        diff = out.strip()
        if rc != 0 and not diff:
            errors.append(f"{name}: exit {rc} {err.strip()[:200]}")
            findings.append(Finding("go-mod-tidy", "tidy-error", name, msg_norm=msg_norm(err)))
            continue
        if diff:
            findings.append(Finding("go-mod-tidy", "tidy-diff", name, msg_norm=msg_norm(diff)))
    return ToolResult("go-mod-tidy", config, FAIL if findings else PASS, 0, findings=findings, error="; ".join(errors))


def run_knip(scope: dict, versions: dict, config: str) -> ToolResult:
    fe_root = REPO_ROOT / "vantare-v2" / "frontend"
    pnpm = shutil.which("pnpm") or "pnpm"
    try:
        rc, out, err, ms = run_cmd([pnpm, "--dir", str(fe_root), "exec", "knip", "--reporter", "json", "--no-progress"], cwd=fe_root, timeout=600)
    except ToolError as e:
        return ToolResult("knip", config, ERROR, -1, error=str(e))
    if rc >= 2:
        return ToolResult("knip", config, ERROR, rc, error=f"crash (exit {rc}): {err.strip()[:500]}", duration_ms=ms, raw_stderr=err)
    try:
        findings = parse_knip(out, REPO_ROOT, fe_root)
    except ToolError as e:
        return ToolResult("knip", config, ERROR, rc, error=str(e), duration_ms=ms, raw_stdout=out, raw_stderr=err)
    exclusions = scope.get("finding_exclusions", {})
    excl_paths = [norm_path(k, REPO_ROOT) for k in exclusions]
    findings = [f for f in findings if not any(f.path.startswith(ex + "/") or f.path == ex for ex in excl_paths)]
    return ToolResult("knip", config, FAIL if findings else PASS, rc, findings=findings, duration_ms=ms, raw_stdout=out, raw_stderr=err, version=versions["analyzers"]["knip"]["version"])


def run_jscpd(scope: dict, versions: dict, config: str) -> ToolResult:
    fe_root = REPO_ROOT / "vantare-v2" / "frontend"
    out_dir = REPO_ROOT / "tools" / "quality" / ".jscpd-out"
    report_file = out_dir / "jscpd-report.json"
    # Borrar informe anterior para que no se reutilice uno limpio de una ejecucion previa.
    if report_file.exists():
        report_file.unlink()
    out_dir.mkdir(parents=True, exist_ok=True)
    pnpm = shutil.which("pnpm") or "pnpm"
    try:
        rc, out, err, ms = run_cmd([pnpm, "--dir", str(fe_root), "exec", "jscpd", "src", "--config", ".jscpd.json", "--output", str(out_dir)], cwd=fe_root, timeout=600)
    except ToolError as e:
        return ToolResult("jscpd", config, ERROR, -1, error=str(e))
    if rc >= 2:
        return ToolResult("jscpd", config, ERROR, rc, error=f"crash (exit {rc}): {err.strip()[:500]}", duration_ms=ms, raw_stderr=err)
    if not report_file.exists():
        return ToolResult("jscpd", config, ERROR, rc, error="no se genero informe jscpd (informe fresco)", duration_ms=ms, raw_stdout=out, raw_stderr=err)
    try:
        report = json.loads(report_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return ToolResult("jscpd", config, ERROR, rc, error=f"informe no parseable: {e}", duration_ms=ms, raw_stdout=out, raw_stderr=err)
    findings = parse_jscpd(report, REPO_ROOT, fe_root)
    return ToolResult("jscpd", config, FAIL if findings else PASS, rc, findings=findings, duration_ms=ms, raw_stdout=out, raw_stderr=err, version=versions["analyzers"]["jscpd"]["version"])


def parse_depcruise(report_obj: Any, repo_root: Path, fe_root: Path) -> list[Finding]:
    """Parsea summary.violations[] del JSON de dependency-cruiser.
    Filtra las conocidas (rule.severity == 'ignore' tras --ignore-known).
    Identidad: rule.name + from + to (sin linea/columna)."""
    violations = report_obj.get("summary", {}).get("violations", [])
    findings: list[Finding] = []
    for v in violations:
        rule = v.get("rule", {})
        if rule.get("severity") == "ignore":
            continue  # conocida, filtrada por --ignore-known.
        name = rule.get("name", "unknown")
        from_path = v.get("from", "")
        to_path = v.get("to", "")
        findings.append(Finding(
            analyzer="dependency-cruiser",
            rule=name,
            path=norm_path(from_path, repo_root),
            msg_norm=to_path,
        ))
    return findings


def run_dependency_cruiser(scope: dict, versions: dict, config: str, fe_root: Path | None = None) -> ToolResult:
    """dependency-cruiser con --ignore-known (baseline nativo). STATUS_BLOCKING:
    exit 1 = violacion nueva (no filtrada por known-violations) -> bloquea.
    Genera Findings reales parseando summary.violations[] del JSON.
    fe_root opcional para tests sobre fixtures (usa el binario del frontend real)."""
    fe = fe_root or (REPO_ROOT / "vantare-v2" / "frontend")
    # En tests sobre fixtures, pnpm exec no encuentra el binario (no hay node_modules).
    # Usar el binario del frontend real directamente.
    depcruise_bin = REPO_ROOT / "vantare-v2" / "frontend" / "node_modules" / ".bin" / "depcruise"
    if depcruise_bin.exists():
        cmd = [str(depcruise_bin), "src", "--config", ".dependency-cruiser.cjs", "--ignore-known", "--output-type", "json"]
    else:
        pnpm = shutil.which("pnpm") or "pnpm"
        cmd = [pnpm, "--dir", str(fe), "exec", "depcruise", "src", "--config", ".dependency-cruiser.cjs", "--ignore-known", "--output-type", "json"]
    try:
        rc, out, err, ms = run_cmd(cmd, cwd=fe, timeout=600)
    except ToolError as e:
        return ToolResult("dependency-cruiser", config, ERROR, -1, error=str(e))
    if rc >= 2:
        return ToolResult("dependency-cruiser", config, ERROR, rc, error=f"crash (exit {rc}): {err.strip()[:500]}", duration_ms=ms, raw_stderr=err)
    # Parsear JSON para construir Findings. Si no parsea -> ERROR.
    try:
        report = json.loads(out)
    except json.JSONDecodeError as e:
        return ToolResult("dependency-cruiser", config, ERROR, rc, error=f"salida JSON no parseable: {e}", duration_ms=ms, raw_stdout=out, raw_stderr=err)
    findings = parse_depcruise(report, REPO_ROOT, fe)
    # exit 0 = sin violaciones nuevas, 1 = violaciones nuevas (no conocidas).
    # Si rc==1 pero no hay findings, es una contradiccion -> ERROR (defensa R1b).
    if rc == 1 and not findings:
        return ToolResult("dependency-cruiser", config, ERROR, rc, error="exit 1 sin violaciones parseables (contradiccion)", duration_ms=ms, raw_stdout=out, raw_stderr=err, version=versions["analyzers"]["dependency-cruiser"]["version"])
    return ToolResult("dependency-cruiser", config, FAIL if findings else PASS, rc, findings=findings, duration_ms=ms, raw_stdout=out, raw_stderr=err, version=versions["analyzers"]["dependency-cruiser"]["version"])


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
# Baselines y excepciones
# ---------------------------------------------------------------------------

def baseline_path(analyzer: str) -> Path:
    return BASELINE_DIR / f"{analyzer}.json"


def write_baseline(analyzer: str, findings: list[Finding], scope: dict, versions: dict, configs: list[str]) -> Path:
    BASELINE_DIR.mkdir(parents=True, exist_ok=True)
    # NO deduplicar: el multiconjunto (F7) cuenta apariciones. Las apariciones
    # cross-config (mismo hallazgo en darwin-dev y windows-amd64) se almacenan
    # todas, igual que en actual. Orden determinista por identidad.
    dedup = sorted(findings, key=lambda f: f.identity())
    header = {
        "analyzer": analyzer,
        "base_sha": git_head_sha(REPO_ROOT),  # PROCEDENCIA, no oraculo.
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "tool_versions": {n: versions["analyzers"][n]["version"] for n in versions.get("analyzers", {})},
        "scope_hash": scope_hash(scope),
        "versions_fingerprint": versions_fingerprint(versions),
        "configs": sorted(set(configs)),  # semantic configs (portables).
        "count": len(dedup),
    }
    p = baseline_path(analyzer)
    p.write_text(json.dumps({"header": header, "findings": [asdict(f) for f in dedup]}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
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
    return [Finding(**f) for f in baseline.get("findings", [])]


def load_exceptions() -> list[dict]:
    if not EXCEPTIONS_PATH.exists():
        return []
    try:
        return json.loads(EXCEPTIONS_PATH.read_text(encoding="utf-8")).get("exceptions", [])
    except json.JSONDecodeError:
        return []


def finding_excepted(f: Finding, exceptions: list[dict]) -> dict | None:
    for exc in exceptions:
        if exc.get("analyzer") != f.analyzer or exc.get("rule") != f.rule or exc.get("path") != f.path:
            continue
        key = exc.get("key", "")
        if f.analyzer == "jscpd":
            if key == f.content_hash:
                return exc
        elif f.symbol:
            if key == f.symbol:
                return exc
        elif key == f.msg_norm:
            return exc
    return None


# ---------------------------------------------------------------------------
# Subcomandos
# ---------------------------------------------------------------------------

def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def cmd_bootstrap(args: argparse.Namespace) -> int:
    print("== bootstrap: preparando herramientas fijadas ==")
    bin_path = os.path.join(GOBIN, "deadcode")
    if os.path.exists(bin_path):
        print(f"  deadcode: ya instalado en {bin_path}")
    else:
        print("  instalando golang.org/x/tools/cmd/deadcode@v0.49.0 ...")
        rc, _out, err, _ = run_cmd(["go", "install", "golang.org/x/tools/cmd/deadcode@v0.49.0"], cwd=REPO_ROOT, timeout=300)
        if rc != 0:
            print(f"  ERROR instalando deadcode: {err.strip()}", file=sys.stderr)
            return 2
    dist_dir = REPO_ROOT / "vantare-v2" / "frontend" / "dist"
    dist_dir.mkdir(parents=True, exist_ok=True)
    (dist_dir / ".gitkeep").write_text("", encoding="utf-8")
    print(f"  dist placeholder: {dist_dir / '.gitkeep'} (gitignored)")
    print("  npm devDeps (knip/dependency-cruiser/jscpd) ya en frontend/package.json (exactas)")
    print("bootstrap OK")
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    print("== doctor: entorno, versiones, configuracion, cobertura ==")
    scope = load_json(SCOPE_PATH)
    versions = load_json(VERSIONS_PATH)
    issues = 0
    print("\n[toolchain]")
    for name in ("go", "node", "pnpm"):
        want = versions["toolchain"][name]["version"]
        if name == "go":
            rc, out, _err, _ = run_cmd(["go", "version"], cwd=REPO_ROOT, timeout=10)
        else:
            rc, out, _err, _ = run_cmd([name, "--version"], cwd=REPO_ROOT, timeout=10)
        ver = out.strip().splitlines()[0] if out.strip() else ""
        ok = want in ver
        print(f"  {name}: {'OK' if ok else 'MISMATCH'} -> {ver} (esperado {want})")
        if not ok:
            issues += 1
    py_ver = sys.version_info
    py_ok = (py_ver.major, py_ver.minor) >= PYTHON_MIN
    print(f"  python: {'OK' if py_ok else 'MISMATCH'} -> {py_ver.major}.{py_ver.minor}.{py_ver.micro} (minimo {PYTHON_MIN[0]}.{PYTHON_MIN[1]})")
    if not py_ok:
        issues += 1
    print("\n[analizadores]")
    for name, info in versions["analyzers"].items():
        want = info["version"]
        if name == "staticcheck":
            bin_path = shutil.which("staticcheck") or os.path.join(GOBIN, "staticcheck")
            rc, out, _err, _ = run_cmd([bin_path, "-version"], cwd=REPO_ROOT, timeout=10)
            got = out.strip()
            ok = want in got
            print(f"  {name}: {'OK' if ok else 'MISMATCH'} -> {got} (esperado {want})")
            if not ok:
                issues += 1
        elif name == "deadcode":
            bin_path = os.path.join(GOBIN, "deadcode")
            ok = os.path.exists(bin_path)
            print(f"  {name}: {'OK' if ok else 'FALTA'} -> {bin_path} (esperado {want}; existencia, no version efectiva)")
            if not ok:
                issues += 1
        elif name in ("govet", "go-mod-tidy"):
            print(f"  {name}: OK (parte de go {versions['toolchain']['go']['version']})")
        else:
            pj = load_json(REPO_ROOT / "vantare-v2" / "frontend" / "package.json")
            got = pj.get("devDependencies", {}).get(name, "")
            ok = got == want
            print(f"  {name}: {'OK' if ok else 'MISMATCH'} -> {got!r} (esperado {want!r}; manifiesto, no binario efectivo)")
            if not ok:
                issues += 1
    print("\n[configuracion]")
    for f in ("knip.json", ".dependency-cruiser.cjs", ".jscpd.json"):
        p = REPO_ROOT / "vantare-v2" / "frontend" / f
        print(f"  {f}: {'presente' if p.exists() else 'FALTA'}")
        if not p.exists():
            issues += 1
    print("\n[cobertura]")
    print(f"  configs analizables aqui: {configs_for_platform()}")
    print(f"  Frontend: entradas produccion={len(scope['in_scope']['vantare-v2-frontend']['production_entries'])}, "
          f"dev/test harness={len(scope['in_scope']['vantare-v2-frontend']['development_entries'])}")
    print(f"  out_of_scope clasificado y visible: {list(scope['out_of_scope'].keys())}")
    print("  NOTA: la cobertura de archivos escaneados no se verifica por herramienta; el informe no la afirma.")
    print("\n[cobertura de ejecutables Go]")
    executables = scope["in_scope"]["vantare-v2-go"]["executables"]
    host_config = next((c for c in configs_for_platform() if c != "windows-amd64"), "")
    for exe in executables:
        covered = []
        if exe not in HOST_NONCOMPILING and host_config:
            covered.append(host_config)
        covered.append("windows-amd64")
        print(f"  {exe}: {'OK' if covered else 'ERROR'} -> cubierto por {covered}")
        if not covered:
            issues += 1
    print(f"\n  issues: {issues}")
    return 1 if issues else 0


def _run_all(scope: dict, versions: dict) -> list[ToolResult]:
    results: list[ToolResult] = []
    for config in configs_for_platform():
        for analyzer in analyzers_for_config(config):
            print(f"  [{config}] {analyzer} ...", flush=True)
            res = ANALYZER_RUNNERS[analyzer](scope, versions, config)
            results.append(res)
            print(f"    -> {res.status} (exit {res.exit_code}, {len(res.findings)} hallazgos, {res.duration_ms}ms)")
    return results


def _print_summary(results: list[ToolResult]) -> None:
    print("\n== resumen ==")
    for r in results:
        tag = "bloqueante" if r.analyzer in (RATCHET_ANALYZERS | STATUS_BLOCKING_ANALYZERS) else ("informativo" if r.analyzer in INFORMATIVE_ANALYZERS else "")
        print(f"  {r.analyzer}/{r.config}: {r.status} ({len(r.findings)} hallazgos) [{tag}]")
    by_analyzer: dict[str, int] = {}
    for r in results:
        by_analyzer[r.analyzer] = by_analyzer.get(r.analyzer, 0) + len(r.findings)
    print("\n== recuento por analizador (total) ==")
    for a, n in sorted(by_analyzer.items()):
        print(f"  {a}: {n}")


def _save_last_run(results: list[ToolResult], scope: dict, versions: dict, mode: str, **extra) -> None:
    # R2: persistir raw_stdout/raw_stderr truncados (~4000 chars) solo cuando
    # el resultado no es PASS, para que la evidencia de violaciones no se pierda.
    # No se vuelcan variables de entorno ni nada que pueda contener credenciales.
    _TRUNC = 4000
    payload = {
        "mode": mode,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "scope_hash": scope_hash(scope),
        "versions_fingerprint": versions_fingerprint(versions),
        "results": [
            {"analyzer": r.analyzer, "config": r.config, "status": r.status, "exit_code": r.exit_code,
             "findings": [asdict(f) for f in r.findings], "error": r.error, "duration_ms": r.duration_ms, "version": r.version,
             **({"raw_stdout": r.raw_stdout[:_TRUNC], "raw_stderr": r.raw_stderr[:_TRUNC]} if r.status != PASS else {})}
            for r in results
        ],
    }
    payload.update(extra)
    LAST_RUN_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def cmd_audit(args: argparse.Namespace) -> int:
    """Audit: analisis completo. NO escribe baselines (solo baseline --confirm)."""
    print("== audit: analisis completo (no acepta baselines) ==")
    scope = load_json(SCOPE_PATH)
    versions = load_json(VERSIONS_PATH)
    results = _run_all(scope, versions)
    error_analyzers = {r.analyzer for r in results if r.status == ERROR}
    if error_analyzers:
        print(f"\n  ANALIZADORES EN ERROR: {sorted(error_analyzers)}")
    exceptions = load_exceptions()
    if exceptions:
        print("\n  EXCEPCIONES ACTIVAS:")
        for exc in exceptions:
            print(f"    - [{exc['analyzer']}] {exc['path']} {exc['rule']} -> {exc['id']}")
    _save_last_run(results, scope, versions, mode="audit")
    _print_summary(results)
    return 1 if error_analyzers else 0


def _policy_changed(scope_base: dict, base_sha: str) -> tuple[bool, list[str]]:
    """Detecta si se ha modificado la politica. Lee las rutas vigiladas del
    scope.json de la BASE CONFIABLE (git show <base>:scope.json), no del arbol
    de trabajo (que es el cambio evaluado)."""
    patterns = scope_base.get("policy_paths", {}).get("force_full_graph_on_change", [])
    if not patterns:
        return False, []
    changed: list[str] = []
    if base_sha:
        try:
            changed.extend(git_changed_paths(REPO_ROOT, base_sha))
        except ToolError:
            raise
    changed.extend(git_porcelain_paths(REPO_ROOT))
    matched = sorted({p for p in changed if fnmatch_any(p, patterns)})
    return bool(matched), matched


def reconcile_jscpd_regrouping(classification: Classification, baseline: dict,
                              base_sha: str) -> list[dict]:
    """Keep regrouped findings visible when their entire source is unchanged.

    Trust provenance only from the PR base's baseline, never a candidate header.
    Compare source blobs at provenance, PR base and on disk. This is deliberately
    conservative: any edited source keeps the normal identity/multiset ratchet.
    MOVED is never exempted. No baseline, threshold or finding is discarded.
    """
    if not classification.new:
        return []
    trusted = json.loads(git_show_file(REPO_ROOT, base_sha, "tools/quality/baseline/jscpd.json"))
    if trusted != baseline:
        raise ToolError("jscpd: baseline candidato distinto del baseline de la base confiable")
    provenance = trusted.get("header", {}).get("base_sha", "")
    if not isinstance(provenance, str) or not re.fullmatch(r"[0-9a-f]{40}", provenance):
        raise ToolError("jscpd: procedencia del baseline invalida")
    rc, _, err, _ = run_cmd(["git", "cat-file", "-e", f"{provenance}^{{commit}}"], cwd=REPO_ROOT, timeout=15)
    if rc != 0:
        # A reviewed baseline may reference a source commit later squash-merged.
        # Fetch only that trusted immutable object; never accept missing evidence.
        rc, _, _, _ = run_cmd(["git", "fetch", "--no-tags", "--no-write-fetch-head",
                              "origin", provenance], cwd=REPO_ROOT, timeout=60)
        if rc != 0:
            raise ToolError("jscpd: procedencia no disponible localmente ni en origin")
        rc, _, _, _ = run_cmd(["git", "cat-file", "-e", f"{provenance}^{{commit}}"], cwd=REPO_ROOT, timeout=15)
        if rc != 0:
            raise ToolError("jscpd: origin no proporciono el commit de procedencia")

    known = baseline_findings(trusted)
    known_paths = {f.path for f in known}
    known_ids = {f.identity() for f in known}
    eligible = [f for f in classification.new if f.identity() not in known_ids
                and re.fullmatch(r"[0-9a-f]{64}", f.content_hash)]
    evidence_by_path: dict[str, dict] = {}
    prefix = "vantare-v2/frontend/"
    source_root = REPO_ROOT.resolve() / prefix / "src"
    for path in sorted({f.path for f in eligible} & known_paths):
        # jscpd's report names are relative to the scanned 'src' directory.
        # Keep the existing baseline identities; resolve their actual source
        # explicitly instead of silently migrating every stored finding.
        if not path.startswith(prefix):
            continue
        relative = PurePosixPath(path.removeprefix(prefix))
        if relative.is_absolute() or ".." in relative.parts:
            continue
        source = source_root / relative
        if not source.is_file() or source.resolve() != source:
            continue
        source_path = (PurePosixPath(prefix) / "src" / relative).as_posix()
        blobs = []
        for revision in (provenance, base_sha):
            rc, out, _, _ = run_cmd(["git", "ls-tree", "-z", revision, "--", source_path], cwd=REPO_ROOT, timeout=15)
            metadata, _, name = out.partition("\t")
            fields = metadata.split()
            if (rc != 0 or len(fields) != 3 or fields[0] not in ("100644", "100755")
                    or fields[1] != "blob" or name != source_path + "\0"):
                break  # No regular source evidence: leave the finding NEW.
            blobs.append(fields[2])
        if len(blobs) != 2 or blobs[0] != blobs[1]:
            continue
        rc, current, err, _ = run_cmd(["git", "hash-object", "--no-filters", "--", str(source)], cwd=REPO_ROOT, timeout=15)
        if rc != 0:
            raise ToolError(f"jscpd: no se pudo comprobar fuente: {err.strip()[:200]}")
        if current.strip() == blobs[0]:
            evidence_by_path[path] = {"source_path": source_path,
                                      "source_sha": provenance, "blob_sha": blobs[0]}

    regrouped = [{"finding": asdict(f), **evidence_by_path[f.path]}
                 for f in eligible if f.path in evidence_by_path]
    regrouped_ids = {f.identity() for f in eligible if f.path in evidence_by_path}
    classification.new = [f for f in classification.new if f.identity() not in regrouped_ids]
    return regrouped


def cmd_check(args: argparse.Namespace) -> int:
    print("== check: controles frecuentes + ratchet ==")
    scope = load_json(SCOPE_PATH)
    versions = load_json(VERSIONS_PATH)

    # Determinar la base del diff. NUNCA usar la cabecera del baseline como oraculo.
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
        mb = git_merge_base_nightly(REPO_ROOT)
        if mb:
            base_sha = mb
            base_source = "merge-base origin/nightly HEAD"
        else:
            base_sha = ""
            base_source = "indeterminada"

    # Leer scope.json de la BASE CONFIABLE para policy_paths. Si no se puede
    # leer porque el archivo NO EXISTE en la base (es nuevo), usar el del arbol
    # (la politica es nueva, no manipulada). Si existe pero no se puede leer -> ERROR.
    integrity_issues: list[str] = []
    scope_base = scope
    if base_sha:
        try:
            scope_base_text = git_show_file(REPO_ROOT, base_sha, "tools/quality/scope.json")
            scope_base = json.loads(scope_base_text)
        except (ToolError, json.JSONDecodeError) as e:
            msg = str(e)
            if "not in" in msg or "exists on disk, but not" in msg:
                # Archivo nuevo en este PR: la politica es nueva, no manipulada.
                # Usar el scope del arbol de trabajo.
                scope_base = scope
            else:
                integrity_issues.append(f"no se pudo leer scope.json de la base: {e}")
    elif not args.base:
        integrity_issues.append("base del diff indeterminada (no se encontro origin/nightly); pasa --base <sha>")

    results = _run_all(scope, versions)

    classifications: dict[str, Classification] = {}
    regrouped_findings: list[dict] = []
    excepted_findings: dict[str, list[dict]] = {}
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
        # INFORMATIVE (deadcode): sin baseline, sin ratchet, sin blocking. Solo reporta.
        if r.analyzer in INFORMATIVE_ANALYZERS:
            classifications[r.analyzer] = Classification()
            continue
        # STATUS_BLOCKING: bloquean por estado (FAIL = violacion nueva).
        if r.analyzer in STATUS_BLOCKING_ANALYZERS:
            if r.status == FAIL:
                # Excepciones: si todos los hallazgos estan exceptuados, no bloquea.
                if r.findings:
                    new_blocking = [f for f in r.findings if not finding_excepted(f, exceptions)]
                    excepted = [{"finding": asdict(f), "exception": finding_excepted(f, exceptions)["id"]} for f in r.findings if finding_excepted(f, exceptions)]
                    classifications[r.analyzer] = Classification(new=new_blocking)
                    excepted_findings[r.analyzer] = excepted
                else:
                    # R1b: FAIL sin hallazgos es una contradiccion -> integrity_issue -> FAIL.
                    # Nunca puede llegar a PASS. El runner ya deberia haber devuelto
                    # ERROR en este caso, pero si llega aqui, lo cazamos.
                    integrity_issues.append(f"{r.analyzer}: FAIL sin hallazgos (violacion sin detalle) -> revisar raw_stdout")
                    classifications[r.analyzer] = Classification()
            else:
                classifications[r.analyzer] = Classification()
            continue
        # RATCHET: bloquean por NEW.
        bl = load_baseline(r.analyzer)
        if bl is None:
            integrity_issues.append(f"{r.analyzer}: sin baseline (ejecuta 'baseline --confirm')")
            classifications[r.analyzer] = Classification()
            continue
        header = bl.get("header", {})
        if header.get("scope_hash") != scope_hash(scope):
            integrity_issues.append(f"{r.analyzer}: scope_hash del baseline distinto -> recalibrar")
        if not baseline_versions_match(r.analyzer, header, versions):
            integrity_issues.append(f"{r.analyzer}: versiones del baseline distintas -> recalibrar")
        classifications[r.analyzer] = classify_findings(baseline_findings(bl), actual_by_analyzer[r.analyzer])
        if r.analyzer == "jscpd" and base_sha and not integrity_issues:
            try:
                regrouped_findings = reconcile_jscpd_regrouping(classifications[r.analyzer], bl, base_sha)
            except (ToolError, json.JSONDecodeError, OSError) as e:
                integrity_issues.append(f"jscpd: no se pudo verificar reagrupacion: {e}")

    # DEFENSA: analizador con baseline que no produjo resultado -> NOT_RUN -> FAIL.
    # Solo se esperan RATCHET_ANALYZERS (con baseline) y NO_BASELINE_ANALYZERS (control objetivo).
    # deadcode es informativo sin baseline: no se espera, no es NOT_RUN si falta.
    ran_analyzers = {r.analyzer for r in results}
    expected = RATCHET_ANALYZERS | NO_BASELINE_ANALYZERS
    for a in sorted(expected - ran_analyzers):
        integrity_issues.append(f"{a}: NOT_RUN (analizador esperado no produjo resultado)")
    # DEFENSA: configs del baseline != configs ejecutadas -> ERROR.
    configs_ran: dict[str, set[str]] = {}
    for r in results:
        configs_ran.setdefault(r.analyzer, set()).add(semantic_config(r.analyzer, r.config))
    for a in sorted(seen_analyzers):
        if a in NO_BASELINE_ANALYZERS:
            continue
        bl = load_baseline(a)
        if bl:
            bl_configs = set(bl.get("header", {}).get("configs", []))
            if bl_configs and bl_configs != configs_ran.get(a, set()):
                integrity_issues.append(f"{a}: configs baseline {sorted(bl_configs)} != ejecutadas {sorted(configs_ran.get(a, set()))} -> recalibrar")

    # policy_changed: usa scope.json de la BASE, no del arbol de trabajo.
    policy_changed = False
    policy_paths: list[str] = []
    if base_sha:
        try:
            policy_changed, policy_paths = _policy_changed(scope_base, base_sha)
        except ToolError as e:
            integrity_issues.append(f"base no resoluble para diff de politica: {e}")
    elif not args.base:
        pass  # ya anotado arriba

    # Agregado
    new_blocking = sum(len(c.new_blocking) for c in classifications.values())
    # STATUS_BLOCKING: bloquean por NEW (hallazgos no exceptuados). Si todos estan
    # exceptuados, new_blocking es 0 y no bloquea.
    moved_total = sum(len(c.moved) for c in classifications.values())

    if integrity_issues:
        aggregate = FAIL
    elif new_blocking > 0:
        aggregate = FAIL
    elif moved_total > 0:
        aggregate = REVIEW_REQUIRED
    elif policy_changed:
        aggregate = REVIEW_REQUIRED
    else:
        aggregate = PASS

    _save_last_run(results, scope, versions, mode="check",
                   aggregate=aggregate, policy_changed=policy_changed, policy_changed_paths=policy_paths,
                   base_sha=base_sha, base_source=base_source, integrity_issues=integrity_issues,
                   classifications={a: {"new": len(c.new), "new_blocking": len(c.new_blocking), "resolved": len(c.resolved), "moved": len(c.moved)} for a, c in classifications.items()},
                   moved_findings=[asdict(f) for c in classifications.values() for f in c.moved],
                   new_blocking_findings=[asdict(f) for c in classifications.values() for f in c.new_blocking],
                   excepted_findings=excepted_findings, regrouped_findings=regrouped_findings)

    print(f"\n  base_sha: {base_sha or '(indeterminada)'} [{base_source}]")
    print("\n== ratchet ==")
    for a, c in classifications.items():
        print(f"  {a}: NEW={len(c.new)} (bloqueantes {len(c.new_blocking)}), RESOLVED={len(c.resolved)}, MOVED={len(c.moved)}")
    if integrity_issues:
        print("\n  INTEGRIDAD:")
        for i in integrity_issues:
            print(f"    - {i}")
    if moved_total:
        print("\n  MOVED (destacado, bloquea como REVIEW_REQUIRED):")
        for a, c in classifications.items():
            for f in c.moved:
                print(f"    - [{a}] {f.path} {f.rule} {f.msg_norm or f.symbol or f.content_hash[:12]}")
    if excepted_findings:
        print("\n  EXCEPCIONES ACTIVAS:")
        for a, exs in excepted_findings.items():
            for e in exs:
                print(f"    - [{a}] {e['finding']['path']} {e['finding']['rule']} -> {e['exception']}")
    if regrouped_findings:
        print("\n  REGROUPED (fuente identica en procedencia, base y disco):")
        for evidence in regrouped_findings:
            print(f"    - {evidence['source_path']} {evidence['blob_sha'][:12]} ({evidence['finding']['content_hash'][:12]})")
    print(f"\n  policy_changed: {policy_changed} {policy_paths}")
    print(f"  aggregate: {aggregate}")
    return 1 if aggregate in (FAIL, ERROR, BLOCKED, REVIEW_REQUIRED) else 0


def cmd_report(args: argparse.Namespace) -> int:
    print("== report: resumen de la ultima ejecucion ==")
    if not LAST_RUN_PATH.exists():
        print("  no hay ultima ejecucion (ejecuta check o audit)", file=sys.stderr)
        return 1
    last = json.loads(LAST_RUN_PATH.read_text(encoding="utf-8"))
    md_path = SCRIPT_DIR / ".last-report.md"
    json_path = SCRIPT_DIR / ".last-report.json"
    lines = ["# Vantare quality report", "",
             f"- generated_at: {last.get('generated_at')}",
             f"- mode: {last.get('mode')}",
             f"- aggregate: {last.get('aggregate', 'n/a')}",
             f"- policy_changed: {last.get('policy_changed', False)}", ""]
    lines.append("## Analizadores")
    lines.append("| analyzer | config | status | exit | findings | ms |")
    lines.append("|---|---|---|---|---|---|")
    for r in last.get("results", []):
        lines.append(f"| {r['analyzer']} | {r['config']} | {r['status']} | {r['exit_code']} | {len(r['findings'])} | {r['duration_ms']} |")
    if last.get("classifications"):
        lines += ["", "## Ratchet", "| analyzer | NEW | NEW blocking | RESOLVED | MOVED |", "|---|---|---|---|---|"]
        for a, c in last["classifications"].items():
            lines.append(f"| {a} | {c['new']} | {c['new_blocking']} | {c['resolved']} | {c['moved']} |")
    for section, key in [("MOVED (destacado)", "moved_findings"), ("NEW bloqueantes", "new_blocking_findings")]:
        if last.get(key):
            lines += ["", f"## {section}"]
            for f in last[key]:
                lines.append(f"- `{f['analyzer']}` `{f['path']}` {f['rule']} {f.get('msg_norm') or f.get('symbol') or (f.get('content_hash','')[:12])}")
    if last.get("regrouped_findings"):
        lines += ["", "## REGROUPED (fuente sin cambios; no es duplicacion nueva)"]
        for evidence in last["regrouped_findings"]:
            lines.append(f"- `{evidence['source_path']}` blob `{evidence['blob_sha']}`; "
                         f"procedencia `{evidence['source_sha']}`; hallazgo `{evidence['finding']['content_hash']}`")
    if last.get("integrity_issues"):
        lines += ["", "## Integridad"]
        lines.extend(f"- {i}" for i in last["integrity_issues"])
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
        if r.analyzer not in RATCHET_ANALYZERS:
            continue  # solo RATCHET_ANALYZERS tiene baseline versionado.
        by_analyzer.setdefault(r.analyzer, []).extend(r.findings)
        configs_by_analyzer.setdefault(r.analyzer, []).append(semantic_config(r.analyzer, r.config))
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
    p_check.add_argument("--base", metavar="SHA", help="SHA base real del PR")
    sub.add_parser("audit", help="analisis completo (no acepta baselines)")
    sub.add_parser("report", help="resumen de la ultima ejecucion")
    p_bl = sub.add_parser("baseline", help="aceptar referencia (NUNCA en CI)")
    p_bl.add_argument("--confirm", action="store_true", help="confirmacion explicita")
    args = parser.parse_args()
    handlers = {"bootstrap": cmd_bootstrap, "doctor": cmd_doctor, "check": cmd_check,
                "audit": cmd_audit, "report": cmd_report, "baseline": cmd_baseline}
    return handlers[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
