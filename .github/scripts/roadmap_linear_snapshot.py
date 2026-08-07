#!/usr/bin/env python3
"""Project an allowlisted Linear roadmap into a public, deterministic snapshot."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


LINEAR_API_URL = "https://api.linear.app/graphql"
PAGE_SIZE = 50
LOCALES = ("es", "en", "pt", "it")
PUBLIC_STATUSES = {"planned", "in-progress", "done"}
# Workflow states that mean "delivered to a release channel, awaiting
# promotion". Matched by name because Linear types them as started, and the
# public roadmap should read them as finished work.
SHIPPED_STATE_NAMES = {"nightly", "testers"}

ISSUES_QUERY = """
query PublicRoadmapProject($projectId: String!, $after: String) {
  project(id: $projectId) {
    id
    name
    issues(first: 50, after: $after) {
      nodes {
        id
        title
        updatedAt
        archivedAt
        state { type name }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}
""".strip()

_INTERNAL_CODE_RE = re.compile(
    r"\b(?:ISA|OS|TC|TA|ENG|STR|BIL|REL)-[A-Z0-9]+(?:\.\.[A-Z0-9-]+)?\b",
    re.IGNORECASE,
)
_URL_RE = re.compile(r"(?i)\b(?:https?://|www\.)\S+")
_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_UUID_RE = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.IGNORECASE)
_DOMAIN_RE = re.compile(r"\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:/\S*)?\b", re.IGNORECASE)


class ExportError(RuntimeError):
    """Raised when a source cannot be projected without leaking or guessing."""


def _required_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ExportError(f"{field} must be a non-empty string")
    return value.strip()


def _localized(value: Any, field: str) -> dict[str, str]:
    if not isinstance(value, Mapping):
        raise ExportError(f"{field} must be localized")
    result = {locale: _required_string(value.get(locale), f"{field}.{locale}") for locale in LOCALES}
    for text in result.values():
        if (
            _INTERNAL_CODE_RE.search(text)
            or _URL_RE.search(text)
            or _EMAIL_RE.search(text)
            or _UUID_RE.search(text)
            or _DOMAIN_RE.search(text)
        ):
            raise ExportError(f"{field} contains private data")
    return result


def _read_json(path: Path, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ExportError(f"invalid {label}") from exc


def validate_catalog(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, Mapping) or raw.get("schemaVersion") != 1 or raw.get("channel") != "nightly":
        raise ExportError("catalog must use schemaVersion 1 and channel nightly")
    stale_after = raw.get("staleAfterSeconds", 86_400)
    if not isinstance(stale_after, int) or stale_after <= 0:
        raise ExportError("catalog staleAfterSeconds must be positive")
    raw_tabs = raw.get("tabs")
    if not isinstance(raw_tabs, list) or not raw_tabs:
        raise ExportError("catalog tabs must be non-empty")

    tab_ids: set[str] = set()
    public_project_ids: set[str] = set()
    source_ids: set[str] = set()
    tabs: list[dict[str, Any]] = []
    for tab_index, raw_tab in enumerate(raw_tabs):
        if not isinstance(raw_tab, Mapping):
            raise ExportError(f"catalog tab {tab_index} must be an object")
        tab_id = _required_string(raw_tab.get("id"), f"catalog tab {tab_index} id")
        if tab_id in tab_ids:
            raise ExportError("catalog tab IDs must be unique")
        tab_ids.add(tab_id)
        raw_projects = raw_tab.get("projects")
        if not isinstance(raw_projects, list) or not raw_projects:
            raise ExportError(f"catalog tab {tab_id} projects must be non-empty")
        projects: list[dict[str, Any]] = []
        for project_index, raw_project in enumerate(raw_projects):
            if not isinstance(raw_project, Mapping):
                raise ExportError(f"catalog project {project_index} must be an object")
            source_id = _required_string(raw_project.get("sourceId"), "catalog project sourceId")
            public_id = _required_string(raw_project.get("id"), "catalog project id")
            if source_id in source_ids or public_id in public_project_ids:
                raise ExportError("catalog project IDs must be unique")
            source_ids.add(source_id)
            public_project_ids.add(public_id)
            projects.append({
                "sourceId": source_id,
                "id": public_id,
                "title": _localized(raw_project.get("title"), f"project {public_id} title"),
                "summary": _localized(raw_project.get("summary"), f"project {public_id} summary"),
            })
        tabs.append({"id": tab_id, "label": _localized(raw_tab.get("label"), f"tab {tab_id} label"), "projects": projects})
    return {"schemaVersion": 1, "channel": "nightly", "staleAfterSeconds": stale_after, "tabs": tabs}


def load_catalog(path: Path) -> dict[str, Any]:
    return validate_catalog(_read_json(path, "catalog JSON"))


def _iso_timestamp(value: Any, field: str) -> str:
    text = _required_string(value, field)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ExportError(f"{field} must be ISO-8601") from exc
    if parsed.tzinfo is None:
        raise ExportError(f"{field} must include a timezone")
    return text


def sanitize_title(value: Any) -> str:
    text = _required_string(value, "issue title")
    text = _URL_RE.sub("", text)
    text = _EMAIL_RE.sub("", text)
    text = _UUID_RE.sub("", text)
    text = _INTERNAL_CODE_RE.sub("", text)
    text = _DOMAIN_RE.sub("", text)
    text = re.sub(r"\s+", " ", text).strip(" \t\r\n-:|–—,;")
    if not text or len(text) > 180:
        raise ExportError("issue title is empty or too long after sanitization")
    if (
        _INTERNAL_CODE_RE.search(text)
        or _URL_RE.search(text)
        or _EMAIL_RE.search(text)
        or _UUID_RE.search(text)
        or _DOMAIN_RE.search(text)
    ):
        raise ExportError("issue title still contains private data")
    return text


def _public_status(state: Any) -> str | None:
    if not isinstance(state, Mapping):
        raise ExportError("issue state is missing")
    state_type = _required_string(state.get("type"), "issue state type").lower()
    state_name = str(state.get("name", "")).strip().lower()
    if state_type in {"canceled", "cancelled", "duplicate"} or state_name in {"canceled", "cancelled", "duplicate"}:
        return None
    # The workflow names its review states after the release channels, and
    # Linear types them "started" because they are not its terminal state. To a
    # reader of the public roadmap they are finished: the work is built,
    # reviewed and shipped to a channel, and only promotion remains. Reporting
    # them as in progress understated Telemetry Core as 26% complete while 94%
    # of it had already shipped to nightly.
    if state_name in SHIPPED_STATE_NAMES:
        return "done"
    mapping = {"completed": "done", "started": "in-progress", "unstarted": "planned", "backlog": "planned"}
    if state_type not in mapping:
        raise ExportError("unknown Linear issue state type")
    return mapping[state_type]


def _task_id(source_id: str) -> str:
    return "task_" + hashlib.sha256(f"task:{source_id}".encode("utf-8")).hexdigest()[:20]


def transform_issue(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, Mapping):
        raise ExportError("issue must be an object")
    if raw.get("archivedAt") is not None or raw.get("archived") is True:
        return None
    status = _public_status(raw.get("state"))
    if status is None:
        return None
    source_id = _required_string(raw.get("id"), "issue id")
    return {
        "id": _task_id(source_id),
        "title": sanitize_title(raw.get("title")),
        "status": status,
        "updatedAt": _iso_timestamp(raw.get("updatedAt"), "issue updatedAt"),
    }


def _progress(tasks: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    total = len(tasks)
    done = sum(task["status"] == "done" for task in tasks)
    return {"done": done, "total": total, "percent": None if total == 0 else round(done * 100 / total)}


def build_snapshot(catalog: Mapping[str, Any], source_projects: Mapping[str, Any], generated_at: str) -> dict[str, Any]:
    catalog = validate_catalog(catalog)
    generated_at = _iso_timestamp(generated_at, "generatedAt")
    tabs: list[dict[str, Any]] = []
    task_ids: set[str] = set()
    total_tasks = 0
    for tab in catalog["tabs"]:
        projects: list[dict[str, Any]] = []
        for configured in tab["projects"]:
            source = source_projects.get(configured["sourceId"])
            if not isinstance(source, Mapping) or source.get("complete") is False:
                raise ExportError("catalog project is missing or partial")
            issues = source.get("issues")
            if not isinstance(issues, list):
                raise ExportError("catalog project has no complete issues list")
            tasks = [task for issue in issues if (task := transform_issue(issue)) is not None]
            tasks.sort(key=lambda task: ({"in-progress": 0, "planned": 1, "done": 2}[task["status"]], task["title"].casefold(), task["id"]))
            for task in tasks:
                if task["id"] in task_ids:
                    raise ExportError("duplicate task source ID")
                task_ids.add(task["id"])
            total_tasks += len(tasks)
            projects.append({
                "id": configured["id"],
                "title": configured["title"],
                "summary": configured["summary"],
                "progress": _progress(tasks),
                "tasks": tasks,
            })
        tabs.append({"id": tab["id"], "label": tab["label"], "projects": projects})
    if total_tasks == 0:
        raise ExportError("refusing to publish a snapshot without tasks")
    return {
        "schemaVersion": 1,
        "channel": "nightly",
        "generatedAt": generated_at,
        "staleAfterSeconds": catalog["staleAfterSeconds"],
        "tabs": tabs,
    }


def _graphql_request(api_key: str, variables: Mapping[str, Any], opener: Callable[..., Any] = urlopen) -> Mapping[str, Any]:
    request = Request(
        LINEAR_API_URL,
        data=json.dumps({"query": ISSUES_QUERY, "variables": dict(variables)}).encode("utf-8"),
        headers={"Authorization": api_key, "Content-Type": "application/json", "User-Agent": "Vantare-Roadmap/1.0"},
        method="POST",
    )
    try:
        with opener(request, timeout=30) as response:
            status = getattr(response, "status", 200)
            if status < 200 or status >= 300:
                raise ExportError(f"Linear HTTP {status}")
            body = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise ExportError(f"Linear HTTP {exc.code}") from exc
    except (OSError, URLError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ExportError("Linear request failed") from exc
    if not isinstance(body, Mapping) or body.get("errors"):
        raise ExportError("Linear GraphQL returned errors")
    data = body.get("data")
    if not isinstance(data, Mapping):
        raise ExportError("Linear GraphQL response is incomplete")
    return data


def fetch_project(source_id: str, api_key: str, opener: Callable[..., Any] = urlopen) -> dict[str, Any]:
    after: str | None = None
    seen_cursors: set[str] = set()
    issues: list[Mapping[str, Any]] = []
    while True:
        data = _graphql_request(api_key, {"projectId": source_id, "after": after}, opener)
        project = data.get("project")
        if not isinstance(project, Mapping) or project.get("id") != source_id:
            raise ExportError("allowlisted Linear project is missing")
        connection = project.get("issues")
        if not isinstance(connection, Mapping) or not isinstance(connection.get("nodes"), list) or not isinstance(connection.get("pageInfo"), Mapping):
            raise ExportError("Linear issue page is incomplete")
        if not all(isinstance(node, Mapping) for node in connection["nodes"]):
            raise ExportError("Linear issue page contains an invalid node")
        issues.extend(connection["nodes"])
        page_info = connection["pageInfo"]
        has_next = page_info.get("hasNextPage")
        if not isinstance(has_next, bool):
            raise ExportError("Linear pagination metadata is invalid")
        if not has_next:
            break
        next_cursor = page_info.get("endCursor")
        if not isinstance(next_cursor, str) or not next_cursor or next_cursor in seen_cursors:
            raise ExportError("Linear pagination cursor did not advance")
        seen_cursors.add(next_cursor)
        after = next_cursor
    return {"id": source_id, "issues": issues, "complete": True}


def _source_ids(catalog: Mapping[str, Any]) -> list[str]:
    return [project["sourceId"] for tab in catalog["tabs"] for project in tab["projects"]]


def load_fixture(path: Path, catalog: Mapping[str, Any]) -> dict[str, Any]:
    raw = _read_json(path, "fixture JSON")
    raw_projects = raw.get("projects") if isinstance(raw, Mapping) else None
    if not isinstance(raw_projects, list):
        raise ExportError("fixture projects must be a list")
    by_id: dict[str, Any] = {}
    for project in raw_projects:
        if not isinstance(project, Mapping):
            raise ExportError("fixture project must be an object")
        project_id = _required_string(project.get("id"), "fixture project id")
        if project_id in by_id:
            raise ExportError("fixture project IDs must be unique")
        by_id[project_id] = project
    expected = set(_source_ids(catalog))
    if set(by_id) != expected:
        raise ExportError("fixture must contain every and only catalog project")
    return by_id


def write_atomic(path: Path, snapshot: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n"
    temporary: str | None = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False) as handle:
            temporary = handle.name
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        temporary = None
    except OSError as exc:
        raise ExportError("atomic snapshot write failed") from exc
    finally:
        if temporary:
            try:
                os.unlink(temporary)
            except OSError:
                pass


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--fixture", type=Path)
    args = parser.parse_args(argv)
    try:
        catalog = load_catalog(args.catalog)
        if args.fixture:
            projects = load_fixture(args.fixture, catalog)
        else:
            api_key = os.environ.get("LINEAR_API_KEY")
            if not api_key:
                raise ExportError("LINEAR_API_KEY is required without --fixture")
            projects = {source_id: fetch_project(source_id, api_key) for source_id in _source_ids(catalog)}
        generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        write_atomic(args.output, build_snapshot(catalog, projects, generated_at))
        return 0
    except ExportError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
