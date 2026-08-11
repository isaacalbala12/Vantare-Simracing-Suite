#!/usr/bin/env python3
"""Validate Vantare's live documentation governance without third-party deps."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote


HANDOFFS = {
    "engineer-spotter.md",
    "overlays-launcher-hub.md",
    "platform-commercial.md",
    "strategy-planner.md",
    "telemetry-analysis.md",
    "telemetry-core.md",
}

HANDOFF_HEADINGS = {
    "## Resultado y fronteras",
    "## Autoridad técnica",
    "## Estado técnico actual",
    "## Decisiones cerradas",
    "## Riesgos y bloqueos",
    "## Recomendación técnica",
    "## Evidencia",
    "## Historial",
}

PLAN_STATUS_RE = re.compile(
    r"^> \*\*Plan status: (historical|conditional)\*\*$", re.MULTILINE
)
ADR_FILE_RE = re.compile(r"^(\d{4})-[a-z0-9][a-z0-9-]*\.md$")
ADR_TITLE_RE = re.compile(r"^#\s+ADR[- ](\d{4})(?:\b|\s|:|—)", re.MULTILINE)
MARKDOWN_LINK_RE = re.compile(
    r"!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+[\"'][^\"']*[\"'])?\)"
)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def line_count(text: str) -> int:
    return len(text.splitlines())


def validate_adrs(product_root: Path) -> list[str]:
    errors: list[str] = []
    seen: dict[str, Path] = {}
    adr_dir = product_root / "docs" / "adr"

    adr_paths = sorted(adr_dir.glob("*.md"))
    for path in adr_paths:
        if path.name == "README.md":
            continue
        match = ADR_FILE_RE.fullmatch(path.name)
        if not match:
            errors.append(f"ADR filename must be NNNN-slug.md: {path}")
            continue

        adr_id = match.group(1)
        previous = seen.get(adr_id)
        if previous:
            errors.append(f"duplicate ADR ID {adr_id}: {previous} and {path}")
        else:
            seen[adr_id] = path

        text = read_text(path)
        title = ADR_TITLE_RE.search(text)
        if not title or title.group(1) != adr_id:
            errors.append(f"ADR title ID does not match filename: {path}")

        header = "\n".join(text.splitlines()[:20])
        if not re.search(r"\b(Status|Estado)\b", header, re.IGNORECASE):
            errors.append(f"ADR status missing from first 20 lines: {path}")
        if not re.search(r"\b(Date|Fecha)\b", header, re.IGNORECASE):
            errors.append(f"ADR date missing from first 20 lines: {path}")

    index_path = adr_dir / "README.md"
    if not index_path.exists():
        errors.append(f"ADR index missing: {index_path}")
    else:
        index = read_text(index_path)
        for path in adr_paths:
            if path.name != "README.md" and path.name not in index:
                errors.append(f"ADR missing from docs/adr/README.md: {path}")

    return errors


def validate_plans(product_root: Path) -> list[str]:
    errors: list[str] = []
    plans_dir = product_root / "docs" / "superpowers" / "plans"

    for path in sorted(plans_dir.rglob("*.md")):
        if path.name == "README.md":
            continue
        text = read_text(path)
        first_screen = "\n".join(text.splitlines()[:12])
        matches = PLAN_STATUS_RE.findall(first_screen)
        if len(matches) != 1:
            errors.append(
                f"plan needs one historical/conditional marker in first 12 lines: {path}"
            )
        if len(PLAN_STATUS_RE.findall(text)) != 1:
            errors.append(f"plan must contain exactly one status marker: {path}")
        if "Plan status: active" in text:
            errors.append(f"repo plans cannot claim active status: {path}")

    return errors


def validate_live_docs(product_root: Path) -> list[str]:
    errors: list[str] = []
    docs = product_root / "docs"
    handoff_dir = docs / "vantare-program" / "handoffs"
    actual_handoffs = {path.name for path in handoff_dir.glob("*.md")}

    if actual_handoffs != HANDOFFS:
        missing = sorted(HANDOFFS - actual_handoffs)
        extra = sorted(actual_handoffs - HANDOFFS)
        errors.append(f"handoff set differs; missing={missing}, extra={extra}")

    router = read_text(docs / "README.md")
    if line_count(router) > 120:
        errors.append("docs/README.md exceeds 120 lines")

    for name in sorted(HANDOFFS):
        path = handoff_dir / name
        if not path.exists():
            continue
        text = read_text(path)
        if line_count(text) > 150:
            errors.append(f"live handoff exceeds 150 lines: {path}")
        missing_headings = sorted(HANDOFF_HEADINGS - set(text.splitlines()))
        if missing_headings:
            errors.append(f"live handoff missing headings {missing_headings}: {path}")
        if name not in router:
            errors.append(f"live handoff is not routed from docs/README.md: {path}")

    current_plan = read_text(docs / "current-plan.md")
    if line_count(current_plan) > 30:
        errors.append("docs/current-plan.md exceeds 30 lines")
    if "retirado" not in current_plan.lower():
        errors.append("docs/current-plan.md must remain explicitly retired")

    archive_root = docs / "archive"
    for path in sorted(archive_root.glob("*/handoffs/*-through-*.md")):
        first_screen = "\n".join(read_text(path).splitlines()[:12]).lower()
        if "archivado y sin autoridad operativa" not in first_screen:
            errors.append(f"archived handoff lacks authority banner: {path}")

    return errors


def without_fenced_code(text: str) -> str:
    output: list[str] = []
    in_fence = False
    for line in text.splitlines():
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if not in_fence:
            output.append(re.sub(r"`+[^`]*`+", "", line))
    return "\n".join(output)


def local_target(source: Path, raw_target: str) -> Path | None:
    if raw_target.startswith("#"):
        return source
    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", raw_target):
        return None
    if raw_target.startswith("/") or re.match(r"^[A-Za-z]:[\\/]", raw_target):
        return None
    relative = unquote(raw_target.split("#", 1)[0].split("?", 1)[0])
    if not relative:
        return source
    target = (source.parent / relative).resolve()
    if target.is_dir() and (target / "README.md").exists():
        return target / "README.md"
    return target


def excluded_link_source(path: Path, docs_root: Path) -> bool:
    try:
        parts = path.relative_to(docs_root).parts
    except ValueError:
        return True
    if not parts:
        return False
    if parts[0] in {"analysis", "archive"}:
        return True
    return len(parts) >= 2 and parts[0] == "superpowers" and parts[1] in {
        "plans",
        "specs",
    }


def live_link_sources(product_root: Path) -> list[Path]:
    docs = product_root / "docs"
    paths = [
        product_root / "AGENTS.md",
        docs / "README.md",
        docs / "current-plan.md",
        docs / "agent-workflow.md",
        docs / "branch-channels.md",
    ]
    for relative in ("adr", "runbooks", "vantare-program"):
        paths.extend((docs / relative).glob("*.md"))
    paths.extend((docs / "vantare-program" / "handoffs").glob("*.md"))

    queue = list(path for path in paths if path.exists())
    sources: set[Path] = set()
    while queue:
        source = queue.pop()
        if source in sources:
            continue
        sources.add(source)
        text = without_fenced_code(read_text(source))
        for match in MARKDOWN_LINK_RE.finditer(text):
            target = local_target(source, match.group(1).strip("<>"))
            if (
                target
                and target.exists()
                and target.suffix.lower() == ".md"
                and not excluded_link_source(target, docs)
                and target not in sources
            ):
                queue.append(target)
    return sorted(sources)


def heading_anchors(text: str) -> set[str]:
    anchors: set[str] = set()
    counts: dict[str, int] = {}
    for line in without_fenced_code(text).splitlines():
        match = re.match(r"^#{1,6}\s+(.+?)\s*#*\s*$", line)
        if not match:
            continue
        heading = re.sub(r"[\[\]()*_~`]", "", match.group(1)).lower()
        base = re.sub(r"[^\w\s-]", "", heading, flags=re.UNICODE)
        base = re.sub(r"\s+", "-", base.strip())
        count = counts.get(base, 0)
        counts[base] = count + 1
        anchors.add(base if count == 0 else f"{base}-{count}")
    return anchors


def validate_links(product_root: Path) -> list[str]:
    errors: list[str] = []

    for source in live_link_sources(product_root):
        text = without_fenced_code(read_text(source))
        for match in MARKDOWN_LINK_RE.finditer(text):
            raw_target = match.group(1).strip("<>")
            if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", raw_target):
                if raw_target.lower().startswith("file:"):
                    errors.append(f"file URI is forbidden in live docs: {source} -> {raw_target}")
                continue
            if raw_target.startswith("/") or re.match(r"^[A-Za-z]:[\\/]", raw_target):
                errors.append(f"absolute local path is forbidden in live docs: {source} -> {raw_target}")
                continue

            target = local_target(source, raw_target)
            if target is None:
                continue
            if not target.exists():
                errors.append(f"broken local link: {source} -> {raw_target}")
                continue

            if "#" in raw_target and target.suffix.lower() == ".md":
                fragment = unquote(raw_target.split("#", 1)[1].split("?", 1)[0])
                if fragment and fragment not in heading_anchors(read_text(target)):
                    errors.append(f"broken local anchor: {source} -> {raw_target}")

    return errors


def validate_repo(repo_root: Path) -> list[str]:
    product_root = repo_root / "vantare-v2"
    return [
        *validate_adrs(product_root),
        *validate_plans(product_root),
        *validate_live_docs(product_root),
        *validate_links(product_root),
    ]


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    errors = validate_repo(repo_root)
    if errors:
        print("Documentation validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Documentation validation passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
