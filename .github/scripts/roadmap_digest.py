#!/usr/bin/env python3
"""Combina el plan manual del roadmap con los commits ya mergeados a nightly.

Fuente manual  : vantare-v2/docs/roadmap/plan.md   (lo escribe una persona)
Artefacto      : vantare-v2/docs/roadmap/roadmap.json (lo escribe este script)

El artefacto lleva dentro el ultimo SHA procesado (`digest.lastCommit`), asi
que el estado de la tarea programada vive en el propio fichero: no hace falta
ni cache de Actions ni una rama de datos aparte.

Todo lo que se publica sale de una de esas dos fuentes. El script no inventa
fases ni traduce el asunto de un commit: los textos de commit se emiten tal
cual y la pantalla les pone el rotulo del tipo en el idioma activo.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

SCHEMA_VERSION = 1
LOCALES = ("es", "en", "pt", "it")

#: Estados que la pantalla sabe pintar (`RoadmapStatus` en el frontend).
PHASE_STATUSES = ("done", "in-progress", "planned", "future")
MILESTONE_TYPES = ("release", "feature", "fix", "plan")

#: Tipos convencionales que cuentan como entrega visible para el usuario.
#: `chore`, `ci`, `build`, `style`, `test` y `refactor` quedan fuera: describen
#: el taller, no el producto.
DELIVERED_TYPES = ("feat", "fix", "perf", "docs")

#: Cuantos dias de "entregado recientemente" conserva el artefacto. Mas alla de
#: esto la lectura deja de ser "que ha cambiado ultimamente" y se convierte en
#: un changelog, que ya existe aparte.
MAX_DELIVERED_DAYS = 21
MAX_DELIVERED_ENTRIES_PER_DAY = 12

#: Asuntos que no describen un cambio de producto aunque lleven prefijo valido.
_TRIVIAL_SUBJECT_RE = re.compile(
    r"^(?:merge\b|revert\b|promote\b|bump\b|wip\b|fixup!|squash!)",
    re.IGNORECASE,
)
#: `ISA-368: algo (#288)` -> `algo`. El codigo de issue y el numero de PR son
#: ruido para quien lee el roadmap.
_ISSUE_PREFIX_RE = re.compile(r"^(?:[A-Z]{2,4}-\d+)\s*[:\-—]\s*", re.IGNORECASE)
_PR_SUFFIX_RE = re.compile(r"\s*\(#\d+\)\s*$")
_TRAILING_ISSUE_RE = re.compile(r"\s*\((?:[A-Z]{2,4}-\d+(?:\s*\+\s*[A-Z]{2,4}-\d+)*)\)\s*$", re.IGNORECASE)
_CONVENTIONAL_RE = re.compile(
    r"^(?P<type>[a-z]+)(?:\((?P<scope>[^)]*)\))?(?P<breaking>!)?:\s*(?P<subject>.+)$"
)


class DigestError(RuntimeError):
    """El plan manual no se puede leer sin adivinar."""


# ---------------------------------------------------------------- plan.md ---

#: Claves aceptadas en cada seccion, con el nombre que reciben en el JSON.
_PHASE_FIELDS = {
    "id": "id",
    "estado": "status",
    "etiqueta": "phaseLabel",
    "objetivo": "target",
    "progreso": "progress",
    "resumen": "summary",
    "titulo": "title",
    "item": "highlights",
}
_AREA_FIELDS = {
    "id": "id",
    "estado": "status",
    "progreso": "progress",
    "titulo": "title",
    "proyectos": "projects",
}
_MILESTONE_FIELDS = {
    "id": "id",
    "tipo": "type",
    "titulo": "title",
    "cuerpo": "body",
    "etiqueta": "label",
}
_SECTIONS = {
    "fases": ("phases", _PHASE_FIELDS),
    "areas": ("areas", _AREA_FIELDS),
    "hitos": ("milestones", _MILESTONE_FIELDS),
}

_ACCENTS = str.maketrans("áéíóúÁÉÍÓÚ", "aeiouAEIOU")
_HEADING_RE = re.compile(r"^(#{2,3})\s+(.*\S)\s*$")
_FIELD_RE = re.compile(r"^-\s*([a-zA-Z]+)(?:\.([a-z]{2}))?\s*:\s*(.*)$")


def _normalize_key(value: str) -> str:
    return value.translate(_ACCENTS).strip().lower()


def parse_plan(text: str) -> dict[str, list[dict[str, Any]]]:
    """Lee `plan.md` y devuelve fases, areas e hitos ya localizados.

    Formato (deliberadamente plano, para que un humano lo edite sin pensar en
    el parser): `##` abre seccion, `###` abre una entrada cuyo titulo es el del
    encabezado en espanol, y cada `- clave: valor` es un campo. El sufijo de
    idioma va en la clave (`- resumen.en: ...`), de modo que no hay anidamiento
    ni ambiguedad. `- item:` anade un punto a la fase; `- item.en:` traduce el
    ultimo anadido.
    """
    result: dict[str, list[dict[str, Any]]] = {"phases": [], "areas": [], "milestones": []}
    section: str | None = None
    fields: Mapping[str, str] = {}
    entry: dict[str, Any] | None = None

    for number, raw in enumerate(text.splitlines(), start=1):
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("<!--"):
            continue

        heading = _HEADING_RE.match(line)
        if heading:
            level, title = heading.group(1), heading.group(2)
            if level == "##":
                key = _normalize_key(title)
                if key not in _SECTIONS:
                    section, fields, entry = None, {}, None
                    continue
                section, fields = _SECTIONS[key]
                entry = None
                continue
            if section is None:
                continue
            entry = {"title": _text(title), "highlights": []}
            result[section].append(entry)
            continue

        field = _FIELD_RE.match(line)
        if not field:
            # Prosa suelta dentro de una seccion: es documentacion para quien
            # edita el fichero, no un dato. Se ignora en silencio.
            continue
        if section is None or entry is None:
            continue

        name, locale, value = field.group(1).lower(), field.group(2), field.group(3).strip()
        target = fields.get(name)
        if target is None:
            raise DigestError(f"plan.md:{number}: campo desconocido '{name}' en {section}")
        if locale is not None and locale not in LOCALES:
            raise DigestError(f"plan.md:{number}: idioma no soportado '{locale}'")

        if target == "highlights":
            if locale is None:
                entry["highlights"].append(_text(value))
            elif entry["highlights"]:
                entry["highlights"][-1][locale] = value
            else:
                raise DigestError(f"plan.md:{number}: traduccion sin item previo")
            continue

        if target in ("id", "status", "type"):
            if locale is not None:
                raise DigestError(f"plan.md:{number}: '{name}' no admite idioma")
            entry[target] = value
            continue
        if target == "progress":
            entry[target] = _progress(value, number)
            continue
        if target == "projects":
            entry[target] = [item.strip() for item in value.split(",") if item.strip()]
            continue

        if locale is None:
            entry[target] = _text(value)
        else:
            existing = entry.get(target)
            if not isinstance(existing, dict):
                raise DigestError(f"plan.md:{number}: traduccion de '{name}' sin texto base")
            existing[locale] = value

    _validate(result)
    return result


def _progress(value: str, line: int) -> int:
    try:
        number = int(value)
    except ValueError as error:
        raise DigestError(f"plan.md:{line}: progreso no numerico '{value}'") from error
    return max(0, min(100, number))


def _text(value: str) -> dict[str, str]:
    """Un texto en espanol que aun no tiene traducciones."""
    return {locale: value for locale in LOCALES}


def _validate(parsed: Mapping[str, Sequence[Mapping[str, Any]]]) -> None:
    if not parsed["phases"]:
        raise DigestError("plan.md no declara ninguna fase")
    if not parsed["areas"]:
        raise DigestError("plan.md no declara ninguna area")
    seen: set[str] = set()
    for kind in ("phases", "areas", "milestones"):
        for entry in parsed[kind]:
            identifier = entry.get("id")
            if not identifier:
                raise DigestError(f"{kind}: una entrada no declara id ({entry.get('title', {}).get('es')})")
            token = f"{kind}:{identifier}"
            if token in seen:
                raise DigestError(f"{kind}: id duplicado '{identifier}'")
            seen.add(token)
    for phase in parsed["phases"]:
        if phase.get("status") not in PHASE_STATUSES:
            raise DigestError(f"fase '{phase['id']}': estado invalido '{phase.get('status')}'")
    for area in parsed["areas"]:
        if area.get("status") not in PHASE_STATUSES:
            raise DigestError(f"area '{area['id']}': estado invalido '{area.get('status')}'")
    for milestone in parsed["milestones"]:
        if milestone.get("type") not in MILESTONE_TYPES:
            raise DigestError(f"hito '{milestone['id']}': tipo invalido '{milestone.get('type')}'")
    if sum(1 for phase in parsed["phases"] if phase["status"] == "in-progress") > 1:
        raise DigestError("plan.md declara mas de una fase en curso")


# ---------------------------------------------------------------- commits ---


def clean_subject(subject: str) -> str:
    """Quita el codigo de issue y el numero de PR del asunto."""
    cleaned = _PR_SUFFIX_RE.sub("", subject.strip())
    cleaned = _ISSUE_PREFIX_RE.sub("", cleaned)
    cleaned = _TRAILING_ISSUE_RE.sub("", cleaned)
    return cleaned.strip()


def interpret(subject: str) -> dict[str, str] | None:
    """Convierte el asunto de un commit en una entrada legible, o lo descarta.

    Devuelve `None` cuando el commit no cuenta como entrega: merges, reverts,
    promociones de canal, o un tipo convencional de taller (`chore`, `ci`,
    `build`, `test`, `style`, `refactor`).
    """
    subject = subject.strip()
    if not subject or _TRIVIAL_SUBJECT_RE.match(subject):
        return None

    match = _CONVENTIONAL_RE.match(subject)
    if match is None:
        # Historico del repo: `ISA-368: <asunto>`. Sin prefijo convencional no
        # hay tipo que afirmar, asi que se publica como cambio a secas.
        text = clean_subject(subject)
        if not text or _TRIVIAL_SUBJECT_RE.match(text):
            return None
        return {"kind": "change", "scope": "", "text": _sentence(text)}

    kind = match.group("type").lower()
    if kind not in DELIVERED_TYPES:
        return None
    text = clean_subject(match.group("subject"))
    # `fix(overlays): promote X to nightly` describe una promocion de canal, no
    # un cambio: el prefijo es valido pero el asunto sigue siendo trivial.
    if not text or _TRIVIAL_SUBJECT_RE.match(text):
        return None
    return {
        "kind": kind,
        "scope": (match.group("scope") or "").strip().lower(),
        "text": _sentence(text),
        **({"breaking": True} if match.group("breaking") else {}),
    }


def _sentence(text: str) -> str:
    text = text.strip().rstrip(".")
    if not text:
        return text
    return text[0].upper() + text[1:]


def read_commits(repo: Path, ref: str, since: str | None, limit: int) -> list[dict[str, str]]:
    """Commits alcanzables desde `ref` y posteriores a `since`, del mas nuevo al mas viejo."""
    span = f"{since}..{ref}" if since else ref
    command = ["git", "-C", str(repo), "log", "--no-merges", f"--max-count={limit}", "--date=short", "--pretty=%H%x1f%ad%x1f%s", span]
    completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
    if completed.returncode != 0:
        if since:
            # El SHA guardado ya no existe (rebase, historia reescrita): se
            # relee la ventana completa en vez de fallar la tarea.
            return read_commits(repo, ref, None, limit)
        raise DigestError(f"git log fallo: {completed.stderr.strip()}")
    commits = []
    for line in completed.stdout.splitlines():
        parts = line.split("\x1f")
        if len(parts) != 3:
            continue
        commits.append({"sha": parts[0], "date": parts[1], "subject": parts[2]})
    return commits


def group_by_day(commits: Iterable[Mapping[str, str]]) -> list[dict[str, Any]]:
    """Agrupa entradas legibles por dia, de mas reciente a mas antiguo."""
    days: dict[str, list[dict[str, str]]] = {}
    order: list[str] = []
    for commit in commits:
        entry = interpret(commit["subject"])
        if entry is None:
            continue
        day = commit["date"]
        if day not in days:
            days[day] = []
            order.append(day)
        if any(existing["text"] == entry["text"] for existing in days[day]):
            continue
        days[day].append(entry)
    return [{"date": day, "entries": days[day]} for day in sorted(order, reverse=True)]


def merge_delivered(
    previous: Sequence[Mapping[str, Any]],
    fresh: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """Funde los dias nuevos con los ya publicados y recorta la ventana."""
    merged: dict[str, list[dict[str, Any]]] = {}
    for bucket in list(previous) + list(fresh):
        day = str(bucket.get("date", ""))
        if not day:
            continue
        target = merged.setdefault(day, [])
        for entry in bucket.get("entries", []):
            if any(existing["text"] == entry.get("text") for existing in target):
                continue
            target.append({key: entry[key] for key in ("kind", "scope", "text", "breaking") if key in entry})
    days = sorted(merged, reverse=True)[:MAX_DELIVERED_DAYS]
    return [{"date": day, "entries": merged[day][:MAX_DELIVERED_ENTRIES_PER_DAY]} for day in days]


# ----------------------------------------------------------------- salida ---


def build_document(
    plan: Mapping[str, Sequence[Mapping[str, Any]]],
    delivered: Sequence[Mapping[str, Any]],
    last_commit: str | None,
    generated_at: str,
) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": generated_at,
        "digest": {"lastCommit": last_commit},
        "phases": [
            {
                "id": phase["id"],
                "phaseLabel": phase.get("phaseLabel", phase["title"]),
                "title": phase["title"],
                "status": phase["status"],
                "target": phase.get("target", _text("")),
                "progress": phase.get("progress", 0),
                "summary": phase.get("summary", _text("")),
                "highlights": phase.get("highlights", []),
            }
            for phase in plan["phases"]
        ],
        "areas": [
            {
                "id": area["id"],
                "title": area["title"],
                "progress": area.get("progress", 0),
                "status": area["status"],
                **({"projects": area["projects"]} if area.get("projects") else {}),
            }
            for area in plan["areas"]
        ],
        "milestones": [
            {
                "id": milestone["id"],
                "type": milestone["type"],
                "title": milestone["title"],
                "body": milestone.get("body", _text("")),
                "label": milestone.get("label", _text("")),
            }
            for milestone in plan["milestones"]
        ],
        "delivered": list(delivered),
    }


def content_without_timestamp(document: Mapping[str, Any]) -> dict[str, Any]:
    """El documento sin lo que cambia en cada ejecucion aunque nada haya pasado."""
    copy = json.loads(json.dumps(document))
    copy.pop("generatedAt", None)
    return copy


def load_previous(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=".", type=Path, help="raiz del repositorio git")
    parser.add_argument("--plan", type=Path, default=None, help="plan manual (por defecto vantare-v2/docs/roadmap/plan.md)")
    parser.add_argument("--output", type=Path, default=None, help="artefacto generado (por defecto vantare-v2/docs/roadmap/roadmap.json)")
    parser.add_argument("--ref", default="HEAD", help="rama o SHA de la que leer los commits")
    parser.add_argument("--limit", type=int, default=200, help="maximo de commits leidos en una pasada")
    parser.add_argument("--check", action="store_true", help="no escribe; sale 1 si el artefacto quedaria distinto")
    args = parser.parse_args(argv)

    repo = args.repo.resolve()
    plan_path = args.plan or repo / "vantare-v2" / "docs" / "roadmap" / "plan.md"
    output_path = args.output or repo / "vantare-v2" / "docs" / "roadmap" / "roadmap.json"

    try:
        plan = parse_plan(plan_path.read_text(encoding="utf-8"))
    except OSError as error:
        print(f"no se puede leer el plan: {error}", file=sys.stderr)
        return 2
    except DigestError as error:
        print(f"plan invalido: {error}", file=sys.stderr)
        return 2

    previous = load_previous(output_path)
    since = (previous.get("digest") or {}).get("lastCommit")
    commits = read_commits(repo, args.ref, since, args.limit)
    delivered = merge_delivered(previous.get("delivered") or [], group_by_day(commits))
    last_commit = commits[0]["sha"] if commits else since

    document = build_document(
        plan,
        delivered,
        last_commit,
        datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    )

    unchanged = bool(previous) and content_without_timestamp(previous) == content_without_timestamp(document)
    if args.check:
        print("sin cambios" if unchanged else "el artefacto quedaria distinto")
        return 0 if unchanged else 1
    if unchanged:
        print("sin cambios: el roadmap ya refleja el plan y los commits")
        return 0

    output_path.parent.mkdir(parents=True, exist_ok=True)
    # `newline=""` deja pasar el "\n" tal cual: sin esto, una ejecucion en
    # Windows escribiria CRLF y el artefacto saldria distinto al que genera el
    # runner de Actions, con una PR de puro final de linea en cada pasada.
    with open(output_path, "w", encoding="utf-8", newline="") as handle:
        handle.write(json.dumps(document, ensure_ascii=False, indent=2, sort_keys=False) + "\n")
    print(f"escrito {output_path} ({len(document['phases'])} fases, {len(delivered)} dias entregados)")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
