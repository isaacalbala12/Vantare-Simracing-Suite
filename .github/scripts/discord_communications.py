#!/usr/bin/env python3
"""Build and publish Vantare Discord communications without third-party packages."""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Callable, Iterable


REQUIRED_FRAGMENT_FIELDS = {
    "schemaVersion": int,
    "issue": str,
    "type": str,
    "summary": str,
    "technicalNotes": list,
    "testing": list,
    "knownLimitations": list,
}
PUBLIC_UPDATE_MARKER = "<!-- discord:development -->"
USER_AGENT = "Vantare-GitHub-Actions/1.0"


def validate_fragment(value: dict[str, Any], source: str = "fragment") -> dict[str, Any]:
    for field, expected_type in REQUIRED_FRAGMENT_FIELDS.items():
        if field not in value:
            raise ValueError(f"{source}: missing required field {field}")
        if not isinstance(value[field], expected_type):
            raise ValueError(f"{source}: {field} must be {expected_type.__name__}")
    if value["schemaVersion"] != 1:
        raise ValueError(f"{source}: unsupported schemaVersion")
    if not re.fullmatch(r"ISA-[0-9]+", value["issue"]):
        raise ValueError(f"{source}: issue must use ISA-N format")
    if value["type"] not in {"feature", "fix", "change", "security"}:
        raise ValueError(f"{source}: unsupported type")
    for field in ("technicalNotes", "testing", "knownLimitations"):
        if not value[field] or not all(isinstance(item, str) and item.strip() for item in value[field]):
            raise ValueError(f"{source}: {field} must contain non-empty strings")
    return value


def fragment_changed(current: dict[str, Any], previous: dict[str, Any] | None) -> bool:
    if previous is None:
        return True
    return validate_fragment(current) != validate_fragment(previous)


def select_semantically_changed_files(paths: Iterable[str], base_revision: str) -> list[str]:
    selected = []
    for raw_path in paths:
        path = pathlib.Path(raw_path)
        current = json.loads(path.read_text(encoding="utf-8"))
        previous = None
        result = subprocess.run(
            ["git", "show", f"{base_revision}:{path.as_posix()}"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
        if result.returncode == 0:
            previous = json.loads(result.stdout)
        if fragment_changed(current, previous):
            selected.append(raw_path)
    return selected


def load_fragments(values: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    result = [validate_fragment(value) for value in values]
    issues = [item["issue"] for item in result]
    if len(issues) != len(set(issues)):
        raise ValueError("duplicate issue in changelog fragments")
    return sorted(result, key=lambda item: item["issue"])


def load_fragment_files(paths: Iterable[str]) -> list[dict[str, Any]]:
    values = []
    for raw_path in paths:
        path = pathlib.Path(raw_path)
        with path.open("r", encoding="utf-8") as handle:
            value = json.load(handle)
        values.append(validate_fragment(value, str(path)))
    return load_fragments(values)


def _bullets(items: Iterable[str]) -> str:
    return "\n".join(f"- {item.strip()}" for item in items)


def render_testers(fragments: list[dict[str, Any]], revision: str) -> dict[str, Any]:
    if not fragments:
        raise ValueError("at least one changelog fragment is required")
    summary = [f"**{item['issue']}** — {item['summary']}" for item in fragments]
    technical = [note for item in fragments for note in item["technicalNotes"]]
    testing = [step for item in fragments for step in item["testing"]]
    limitations = [note for item in fragments for note in item["knownLimitations"]]
    return {"allowed_mentions": {"parse": []}, "content": (
        "## Vantare — actualización para testers\n"
        f"Revisión: `{revision[:12]}`\n\n"
        "### Resumen\n" + _bullets(summary) + "\n\n"
        "### Notas técnicas\n" + _bullets(technical) + "\n\n"
        "### Qué comprobar\n" + _bullets(testing) + "\n\n"
        "### Limitaciones conocidas\n" + _bullets(limitations)
    )}


def parse_public_update(body: str | None) -> str | None:
    if not body or PUBLIC_UPDATE_MARKER not in body:
        return None
    public = body.split(PUBLIC_UPDATE_MARKER, 1)[1].strip()
    public = public.replace("@everyone", "@\u200beveryone").replace("@here", "@\u200bhere")
    return public or None


def select_public_projects(projects: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    selected = []
    for project in projects:
        if (project.get("status") or {}).get("type") != "started":
            continue
        nodes = (project.get("projectUpdates") or {}).get("nodes") or []
        public = parse_public_update(nodes[0].get("body") if nodes else None)
        selected.append({
            "name": project.get("name", "Proyecto sin nombre"),
            "url": project.get("url", ""),
            "progress": project.get("progress", 0),
            "update": public or "Sin resumen público adicional en este corte.",
            "updatedAt": project.get("updatedAt", ""),
        })
    return sorted(selected, key=lambda item: (item["updatedAt"], item["name"].casefold()), reverse=True)


def render_development(projects: list[dict[str, Any]]) -> dict[str, Any]:
    if not projects:
        body = "No hay actualizaciones públicas de proyectos activos en este corte."
    else:
        entries = []
        for project in projects[:3]:
            percent = round(float(project["progress"] or 0) * 100)
            link = f" — <{project['url']}>" if project.get("url") else ""
            update = project["update"][:450].rstrip()
            if len(project["update"]) > 450:
                update += "…"
            entries.append(f"### {project['name']} · {percent}%{link}\n{update}")
        body = "\n\n".join(entries)
    return {"allowed_mentions": {"parse": []}, "content": "## Vantare — desarrollo activo\n\n" + body}


def assert_channel(metadata: dict[str, Any], expected_channel_id: str) -> None:
    if str(metadata.get("channel_id", "")) != str(expected_channel_id):
        raise RuntimeError("Discord webhook channel does not match the expected channel")


def _request_json(request: urllib.request.Request, opener: Callable[..., Any]) -> dict[str, Any]:
    with opener(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8") or "{}")


def publish(
    webhook: str,
    payload: dict[str, Any],
    expected_channel_id: str,
    *,
    dry_run: bool = False,
    opener: Callable[..., Any] = urllib.request.urlopen,
) -> None:
    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    if len(payload.get("content", "")) > 2000:
        raise ValueError("Discord content exceeds 2000 characters")
    if dry_run:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return
    metadata_request = urllib.request.Request(
        webhook,
        headers={"User-Agent": USER_AGENT},
        method="GET",
    )
    try:
        metadata = _request_json(metadata_request, opener)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Discord webhook metadata returned status {error.code}") from error
    assert_channel(metadata, expected_channel_id)
    request = urllib.request.Request(
        webhook,
        data=encoded,
        headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
        method="POST",
    )
    for attempt in range(2):
        try:
            with opener(request, timeout=20) as response:
                if response.status >= 300:
                    raise RuntimeError(f"Discord returned status {response.status}")
                return
        except urllib.error.HTTPError as error:
            if error.code == 429 and attempt == 0:
                time.sleep(int(error.headers.get("Retry-After", "5")))
                continue
            raise RuntimeError(f"Discord returned status {error.code}") from error


def fetch_linear_projects(api_key: str) -> list[dict[str, Any]]:
    query = """
    query DiscordDevelopmentProjects {
      projects(first: 50) {
        nodes {
          name url progress updatedAt
          status { type }
          projectUpdates(first: 1) { nodes { body } }
        }
      }
    }
    """
    request = urllib.request.Request(
        "https://api.linear.app/graphql",
        data=json.dumps({"query": query}).encode("utf-8"),
        headers={"Authorization": api_key, "Content-Type": "application/json", "User-Agent": USER_AGENT},
        method="POST",
    )
    try:
        response = _request_json(request, urllib.request.urlopen)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Linear GraphQL returned status {error.code}") from error
    if response.get("errors"):
        raise RuntimeError("Linear GraphQL query failed")
    return response["data"]["projects"]["nodes"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("testers", "development", "select-fragments"))
    parser.add_argument("--fragment", action="append", default=[])
    parser.add_argument("--revision", default=os.environ.get("GITHUB_SHA", "manual"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--base")
    args = parser.parse_args()

    if args.mode == "select-fragments":
        if not args.base:
            raise ValueError("--base is required")
        for path in select_semantically_changed_files(args.fragment, args.base):
            print(path)
        return 0
    if args.mode == "testers":
        payload = render_testers(load_fragment_files(args.fragment), args.revision)
        webhook = os.environ.get("DISCORD_PROGRESS_WEBHOOK_URL", "")
        channel = "1519752249977340168"
    else:
        key = os.environ.get("LINEAR_API_KEY", "")
        if not key and not args.dry_run:
            raise RuntimeError("LINEAR_API_KEY is required")
        projects = [] if args.dry_run and not key else fetch_linear_projects(key)
        payload = render_development(select_public_projects(projects))
        webhook = os.environ.get("DISCORD_KNOWN_ISSUES_WEBHOOK_URL", "")
        channel = "1519752544753291305"
    if not webhook and not args.dry_run:
        raise RuntimeError("dedicated Discord webhook secret is required")
    publish(webhook, payload, channel, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, RuntimeError, OSError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
