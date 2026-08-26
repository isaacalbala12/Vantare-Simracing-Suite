#!/usr/bin/env python3
"""Valida el contrato de roadmap de una PR sin confiar en su propio estado.

Las ramas ISA obtienen el numero de issue de su nombre. La issue decide si el
roadmap es obligatorio o si el diff cabe por completo en una allowlist interna
cerrada. Cuando el plan cambia, el JSON esperado se reconstruye desde el JSON
de la base y solo con commits ya alcanzables desde esa base.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

import roadmap_digest as digest
from validate_branch_channels import (
    HOTFIX_BRANCH,
    ISSUE_BRANCH,
    ROADMAP_BOT_BRANCH,
    TC_PREFIX,
)


PLAN_PATH = "vantare-v2/docs/roadmap/plan.md"
ROADMAP_PATH = "vantare-v2/docs/roadmap/roadmap.json"
REQUIRED_LABEL = "roadmap:required"
EXEMPT_LABEL = "roadmap:not-required"
DECLARED_ID = re.compile(
    r"`(?P<kind>phases|areas|milestones):(?P<identifier>[a-z0-9][a-z0-9-]*)`"
)
HEADING = re.compile(r"^#{2,6}\s+(.+?)\s*$")
CHECKED_BOX = re.compile(r"^\s*-\s*\[[xX]\]\s+", re.MULTILINE)
BACKTICK_VALUE = re.compile(r"`([^`\r\n]+)`")


class ContractError(RuntimeError):
    """El contrato no se puede aceptar sin inventar autoridad o estado."""


def _git(repo: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise ContractError(f"git {' '.join(args)} fallo: {detail}")
    return completed.stdout


def read_blob(repo: Path, revision: str, path: str) -> str:
    if re.fullmatch(r"[0-9a-f]{40}", revision) is None:
        raise ContractError(f"SHA invalido para {path}: {revision!r}")
    return _git(repo, "show", f"{revision}:{path}")


def changed_paths(repo: Path, base_sha: str, head_sha: str) -> list[str]:
    output = _git(
        repo,
        "diff",
        "--name-only",
        "--no-renames",
        "--diff-filter=ACMRD",
        base_sha,
        head_sha,
        "--",
    )
    return [line.strip().replace("\\", "/") for line in output.splitlines() if line.strip()]


def _normalized_heading(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    return "".join(character for character in decomposed if not unicodedata.combining(character)).strip().lower()


def issue_sections(body: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for line in body.replace("\r\n", "\n").split("\n"):
        heading = HEADING.match(line)
        if heading:
            current = _normalized_heading(heading.group(1))
            if current in sections:
                raise ContractError(f"la issue repite la seccion {heading.group(1)!r}")
            sections.setdefault(current, [])
            continue
        if current is not None:
            sections[current].append(line)
    return {name: "\n".join(lines).strip() for name, lines in sections.items()}


def _required_section(sections: Mapping[str, str], name: str) -> str:
    value = sections.get(_normalized_heading(name), "").strip()
    if not value or value in {"_No response_", "No response"}:
        raise ContractError(f"la issue no completa la seccion {name!r}")
    return value


def issue_labels(issue: Mapping[str, Any]) -> set[str]:
    labels = issue.get("labels")
    if not isinstance(labels, list):
        raise ContractError("la respuesta de GitHub no contiene labels validas")
    result: set[str] = set()
    for label in labels:
        if isinstance(label, str):
            result.add(label)
        elif isinstance(label, Mapping) and isinstance(label.get("name"), str):
            result.add(str(label["name"]))
    return result


def _validate_common_issue_sections(sections: Mapping[str, str]) -> None:
    _required_section(sections, "Objetivo")
    if not (
        sections.get(_normalized_heading("Tipo de trabajo"), "").strip()
        or sections.get(_normalized_heading("Tipo"), "").strip()
    ):
        raise ContractError("la issue no completa la seccion 'Tipo de trabajo'")
    _required_section(sections, "Criterios de aceptacion")
    contract = _required_section(sections, "Contrato")
    if len(CHECKED_BOX.findall(contract)) < 2:
        raise ContractError("la issue debe confirmar las dos casillas de Contrato")


def _declared_exempt_paths(raw: str) -> set[str]:
    paths = {match.group(1).replace("\\", "/") for match in BACKTICK_VALUE.finditer(raw)}
    if not paths:
        raise ContractError("la exencion debe declarar cada ruta prevista entre backticks")
    for path in paths:
        if path.startswith("/") or ".." in path.split("/") or path.endswith("/"):
            raise ContractError(f"ruta prevista no canonica: {path!r}")
    return paths


def declared_roadmap_ids(issue: Mapping[str, Any], expected_number: int) -> tuple[str, set[str], set[str]]:
    if issue.get("number") != expected_number:
        raise ContractError(f"GitHub devolvio una issue distinta de ISA-{expected_number}")
    if issue.get("state") != "open":
        raise ContractError(f"ISA-{expected_number} debe permanecer abierta durante la implementacion")
    if "pull_request" in issue:
        raise ContractError(f"ISA-{expected_number} apunta a una PR, no a una issue")

    labels = issue_labels(issue)
    selected = labels & {REQUIRED_LABEL, EXEMPT_LABEL}
    if len(selected) != 1:
        found = ", ".join(sorted(selected)) or "ninguna"
        raise ContractError(
            f"ISA-{expected_number} debe tener exactamente una label de roadmap; encontrada: {found}"
        )

    sections = issue_sections(str(issue.get("body") or ""))
    _validate_common_issue_sections(sections)
    _required_section(sections, "Impacto en roadmap")
    label = next(iter(selected))
    if label == REQUIRED_LABEL:
        raw_ids = _required_section(sections, "IDs de roadmap afectados")
        declared = {f"{match.group('kind')}:{match.group('identifier')}" for match in DECLARED_ID.finditer(raw_ids)}
        if not declared:
            raise ContractError(
                "la issue required debe declarar IDs como `phases:id`, `areas:id` o `milestones:id`"
            )
        _required_section(sections, "Cambio publico esperado")
        _required_section(sections, "Alcance aprobado")
        return label, declared, set()

    _required_section(sections, "Justificacion de la exencion")
    paths = _declared_exempt_paths(_required_section(sections, "Rutas previstas"))
    return label, set(), paths


def issue_number_from_branch(branch: str) -> int | None:
    for pattern in (ISSUE_BRANCH, HOTFIX_BRANCH):
        match = pattern.fullmatch(branch)
        if match:
            return int(match.group("number"))
    return None


def fetch_issue(repository: str, number: int, token: str) -> dict[str, Any]:
    if re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository) is None:
        raise ContractError(f"repositorio GitHub invalido: {repository!r}")
    if not token:
        raise ContractError("GITHUB_TOKEN no esta disponible para leer la issue")
    request = urllib.request.Request(
        f"https://api.github.com/repos/{repository}/issues/{number}",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "vantare-roadmap-contract",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.load(response)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise ContractError(f"no se pudo leer ISA-{number} desde GitHub: {error}") from error
    if not isinstance(payload, dict):
        raise ContractError(f"GitHub devolvio una respuesta invalida para ISA-{number}")
    return payload


def parse_plan_at(repo: Path, revision: str) -> dict[str, list[dict[str, Any]]]:
    try:
        return digest.parse_plan(read_blob(repo, revision, PLAN_PATH))
    except digest.DigestError as error:
        raise ContractError(f"plan.md invalido en {revision[:12]}: {error}") from error


def changed_plan_ids(base: Mapping[str, Sequence[Mapping[str, Any]]], candidate: Mapping[str, Sequence[Mapping[str, Any]]]) -> set[str]:
    changed: set[str] = set()
    for kind in ("phases", "areas", "milestones"):
        before = {str(entry["id"]): entry for entry in base[kind]}
        after = {str(entry["id"]): entry for entry in candidate[kind]}
        for identifier in before.keys() | after.keys():
            if before.get(identifier) != after.get(identifier):
                changed.add(f"{kind}:{identifier}")
    return changed


def _json_blob(repo: Path, revision: str) -> dict[str, Any]:
    try:
        payload = json.loads(read_blob(repo, revision, ROADMAP_PATH))
    except json.JSONDecodeError as error:
        raise ContractError(f"roadmap.json invalido en {revision[:12]}: {error}") from error
    if not isinstance(payload, dict):
        raise ContractError(f"roadmap.json debe ser un objeto en {revision[:12]}")
    return payload


def expected_candidate_document(
    repo: Path,
    base_sha: str,
    candidate_plan: Mapping[str, Sequence[Mapping[str, Any]]],
    candidate_json: Mapping[str, Any],
) -> dict[str, Any]:
    base_json = _json_blob(repo, base_sha)
    since = (base_json.get("digest") or {}).get("lastCommit")
    commits = digest.read_commits(repo, base_sha, since)
    delivered = digest.merge_delivered(
        base_json.get("delivered") or [],
        digest.group_by_day(commits),
    )
    last_commit = commits[0]["sha"] if commits else since
    generated_at = _validated_generated_at(base_json, candidate_json)
    return digest.build_document(candidate_plan, delivered, last_commit, generated_at)


def _parse_generated_at(value: object, context: str) -> datetime:
    if not isinstance(value, str) or re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", value) is None:
        raise ContractError(f"generatedAt {context} debe ser RFC3339 UTC sin fracciones")
    try:
        return datetime.fromisoformat(value.removesuffix("Z") + "+00:00").astimezone(timezone.utc)
    except ValueError as error:
        raise ContractError(f"generatedAt {context} es invalido") from error


def _validated_generated_at(base_json: Mapping[str, Any], candidate_json: Mapping[str, Any]) -> str:
    base_value = base_json.get("generatedAt")
    candidate_value = candidate_json.get("generatedAt")
    base_time = _parse_generated_at(base_value, "de la base")
    candidate_time = _parse_generated_at(candidate_value, "candidato")
    if candidate_time <= base_time:
        raise ContractError("generatedAt candidato debe ser posterior al de la base")
    if candidate_time > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise ContractError("generatedAt candidato no puede estar mas de cinco minutos en el futuro")
    return str(candidate_value)


def validate_generated_document(repo: Path, base_sha: str, head_sha: str) -> None:
    candidate_plan = parse_plan_at(repo, head_sha)
    candidate_json = _json_blob(repo, head_sha)
    expected = expected_candidate_document(repo, base_sha, candidate_plan, candidate_json)
    if digest.content_without_timestamp(candidate_json) != digest.content_without_timestamp(expected):
        raise ContractError(
            "roadmap.json no deriva del plan candidato y del estado base confiable; "
            f"regenera con --ref {base_sha}"
        )


def validate_candidate_coherence(repo: Path, revision: str) -> None:
    plan = parse_plan_at(repo, revision)
    candidate = _json_blob(repo, revision)
    generated_at = candidate.get("generatedAt")
    _parse_generated_at(generated_at, "candidato")
    rebuilt = digest.build_document(
        plan,
        candidate.get("delivered") or [],
        (candidate.get("digest") or {}).get("lastCommit"),
        generated_at,
    )
    if candidate != rebuilt:
        raise ContractError("plan.md y roadmap.json no son coherentes en el arbol candidato")


def _is_exempt_path(path: str) -> bool:
    normalized = path.replace("\\", "/")
    name = normalized.rsplit("/", 1)[-1]
    if normalized.startswith("vantare-v2/docs/analysis/") and name.endswith(".md"):
        return True
    if "/testdata/" in f"/{normalized}" or normalized.startswith("testdata/"):
        return True
    if name.endswith(("_test.go", ".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")):
        return True
    if normalized.startswith(".github/scripts/tests/") and name.startswith("test_") and name.endswith(".py"):
        return True
    if normalized.startswith(".github/scripts/") and name.startswith("test_") and name.endswith(".py"):
        return True
    return False


def validate_issue_contract(
    repo: Path,
    base_sha: str,
    head_sha: str,
    issue: Mapping[str, Any],
    issue_number: int,
) -> str:
    label, declared, declared_paths = declared_roadmap_ids(issue, issue_number)
    paths = changed_paths(repo, base_sha, head_sha)
    if not paths:
        raise ContractError("la PR no contiene cambios")

    if label == EXEMPT_LABEL:
        base_plan = read_blob(repo, base_sha, PLAN_PATH)
        head_plan = read_blob(repo, head_sha, PLAN_PATH)
        base_json = read_blob(repo, base_sha, ROADMAP_PATH)
        head_json = read_blob(repo, head_sha, ROADMAP_PATH)
        if base_plan != head_plan or base_json != head_json:
            raise ContractError("roadmap:not-required no puede modificar plan.md ni roadmap.json")
        rejected = [path for path in paths if not _is_exempt_path(path)]
        if rejected:
            raise ContractError(
                "roadmap:not-required solo admite tests, testdata y docs/analysis; "
                f"rutas rechazadas: {', '.join(rejected)}"
            )
        if declared_paths != set(paths):
            missing = sorted(set(paths) - declared_paths)
            extra = sorted(declared_paths - set(paths))
            raise ContractError(
                "Rutas previstas no coincide con el diff; "
                f"faltan: {', '.join(missing) or 'ninguna'}; sobran: {', '.join(extra) or 'ninguna'}"
            )
        return f"ISA-{issue_number} exenta dentro de la allowlist cerrada ({len(paths)} rutas)"

    base_plan = parse_plan_at(repo, base_sha)
    candidate_plan = parse_plan_at(repo, head_sha)
    actual = changed_plan_ids(base_plan, candidate_plan)
    if not actual:
        raise ContractError(f"ISA-{issue_number} tiene {REQUIRED_LABEL}, pero plan.md no cambia semanticamente")
    if declared != actual:
        missing = sorted(actual - declared)
        unrelated = sorted(declared - actual)
        details = []
        if missing:
            details.append(f"faltan en la issue: {', '.join(missing)}")
        if unrelated:
            details.append(f"declarados sin cambio: {', '.join(unrelated)}")
        raise ContractError(f"IDs de roadmap incoherentes para ISA-{issue_number}: {'; '.join(details)}")
    validate_generated_document(repo, base_sha, head_sha)
    return f"ISA-{issue_number} actualiza exactamente {', '.join(sorted(actual))}"


def validate_bot_contract(repo: Path, base_sha: str, head_sha: str) -> str:
    paths = changed_paths(repo, base_sha, head_sha)
    if paths != [ROADMAP_PATH]:
        raise ContractError(
            f"{ROADMAP_BOT_BRANCH} solo puede modificar {ROADMAP_PATH}; cambio: {', '.join(paths) or 'ninguno'}"
        )
    if read_blob(repo, base_sha, PLAN_PATH) != read_blob(repo, head_sha, PLAN_PATH):
        raise ContractError("el bot del digest no puede modificar plan.md")
    validate_generated_document(repo, base_sha, head_sha)
    return "bot del digest limitado al artefacto derivado"


def validate_pull_request(
    repo: Path,
    repository: str,
    base: str,
    head: str,
    base_sha: str,
    head_sha: str,
    token: str,
) -> str:
    if base == "nightly" and head == ROADMAP_BOT_BRANCH:
        return validate_bot_contract(repo, base_sha, head_sha)
    if (base, head) in {("testers", "nightly"), ("master", "testers")}:
        validate_candidate_coherence(repo, head_sha)
        return f"promocion {head} -> {base} con roadmap coherente"
    if head.startswith(TC_PREFIX):
        raise ContractError("la rama automatica tc-* sigue inerte y no tiene autoridad de roadmap")

    issue_number = issue_number_from_branch(head)
    valid_target = base == "nightly" or (base == "master" and HOTFIX_BRANCH.fullmatch(head))
    if issue_number is None or not valid_target:
        raise ContractError(f"no existe contrato de roadmap para {head!r} -> {base!r}")
    issue = fetch_issue(repository, issue_number, token)
    return validate_issue_contract(repo, base_sha, head_sha, issue, issue_number)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path("."), help="raiz del repositorio Git")
    parser.add_argument("--repository", default=os.environ.get("GITHUB_REPOSITORY", ""))
    parser.add_argument("--event", required=True, choices=("pull_request", "push", "merge_group"))
    parser.add_argument("--base", default="")
    parser.add_argument("--head", default="")
    parser.add_argument("--base-sha", default="")
    parser.add_argument("--head-sha", default="")
    parser.add_argument("--event-sha", default="")
    parser.add_argument("--event-path", type=Path, default=None)
    args = parser.parse_args(argv)

    repo = args.repo.resolve()
    try:
        if args.event == "pull_request":
            base_sha = args.base_sha
            head_sha = args.head_sha
            if args.event_path is not None and (not base_sha or not head_sha):
                try:
                    event_payload = json.loads(args.event_path.read_text(encoding="utf-8"))
                    base_sha = event_payload["pull_request"]["base"]["sha"]
                    head_sha = event_payload["pull_request"]["head"]["sha"]
                except (OSError, KeyError, TypeError, json.JSONDecodeError) as error:
                    raise ContractError(f"evento pull_request invalido: {error}") from error
            result = validate_pull_request(
                repo,
                args.repository,
                args.base,
                args.head,
                base_sha,
                head_sha,
                os.environ.get("GITHUB_TOKEN", ""),
            )
        else:
            validate_candidate_coherence(repo, args.event_sha)
            result = f"{args.event} con roadmap coherente"
    except (ContractError, digest.DigestError) as error:
        print(f"::error title=Contrato de roadmap::{error}", file=sys.stderr)
        return 1

    print(result)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
