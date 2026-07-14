#!/usr/bin/env python3
"""Build and publish Vantare Discord communications without third-party packages."""

from __future__ import annotations

import argparse
import html
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
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
VANTARE_RED = 0xFF3B3B
DEVELOPMENT_IMAGE_NAME = "vantare-development.png"


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


def _embed_field(items: Iterable[str]) -> str:
    value = _bullets(items)
    return value if len(value) <= 1024 else value[:1023].rstrip() + "…"


def render_testers(fragments: list[dict[str, Any]], revision: str) -> dict[str, Any]:
    if not fragments:
        raise ValueError("at least one changelog fragment is required")
    summary = [f"**{item['issue']}** — {item['summary']}" for item in fragments]
    technical = [note for item in fragments for note in item["technicalNotes"]]
    testing = [step for item in fragments for step in item["testing"]]
    limitations = [note for item in fragments for note in item["knownLimitations"]]
    return {
        "allowed_mentions": {"parse": []},
        "embeds": [{
            "title": "Vantare — actualización para testers",
            "description": f"Build candidata de `develop` · revisión `{revision[:12]}`",
            "color": VANTARE_RED,
            "fields": [
                {"name": "Resumen", "value": _embed_field(summary), "inline": False},
                {"name": "Notas técnicas", "value": _embed_field(technical), "inline": False},
                {"name": "Qué comprobar", "value": _embed_field(testing), "inline": False},
                {"name": "Limitaciones conocidas", "value": _embed_field(limitations), "inline": False},
            ],
            "footer": {"text": "Vantare Beta · Solo cambios disponibles para testers"},
        }],
    }


def parse_public_update(body: str | None) -> str | None:
    if not body or PUBLIC_UPDATE_MARKER not in body:
        return None
    public = body.split(PUBLIC_UPDATE_MARKER, 1)[1].strip()
    public = public.replace("@everyone", "@\u200beveryone").replace("@here", "@\u200bhere")
    return public or None


def select_public_projects(projects: Iterable[dict[str, Any]], allowed_names: set[str]) -> list[dict[str, Any]]:
    selected = []
    for project in projects:
        if (project.get("status") or {}).get("type") != "started":
            continue
        if project.get("name") not in allowed_names:
            continue
        nodes = (project.get("projectUpdates") or {}).get("nodes") or []
        public = parse_public_update(nodes[0].get("body") if nodes else None)
        selected.append({
            "name": project.get("name", "Proyecto sin nombre"),
            "url": project.get("url", ""),
            "progress": project.get("progress", 0),
            "update": public or "Desarrollo en curso. Consulta el proyecto para ver el estado operativo completo.",
            "updatedAt": project.get("updatedAt", ""),
        })
    return sorted(selected, key=lambda item: (item["updatedAt"], item["name"].casefold()), reverse=True)


def _progress_bar(percent: int) -> str:
    filled = max(0, min(10, round(percent / 10)))
    return "█" * filled + "░" * (10 - filled)


def render_development(projects: list[dict[str, Any]], *, include_image: bool = False) -> dict[str, Any]:
    if not projects:
        description = "No hay actualizaciones públicas de proyectos activos en este corte."
        fields = []
    else:
        description = f"{min(len(projects), 3)} proyectos públicos en desarrollo. Estado operativo desde Linear."
        fields = []
        for project in projects[:3]:
            percent = round(float(project["progress"] or 0) * 100)
            link = f"\n[Abrir proyecto]({project['url']})" if project.get("url") else ""
            update = project["update"][:650].rstrip()
            if len(project["update"]) > 650:
                update += "…"
            fields.append({
                "name": f"{project['name']} · {percent}%",
                "value": f"`{_progress_bar(percent)}`\n{update}{link}",
                "inline": False,
            })
    embed: dict[str, Any] = {
        "title": "Vantare — desarrollo activo",
        "description": description,
        "color": VANTARE_RED,
        "fields": fields,
        "footer": {"text": "Vantare Development Pulse · Actualización automática"},
    }
    if include_image:
        embed["image"] = {"url": f"attachment://{DEVELOPMENT_IMAGE_NAME}"}
    return {"allowed_mentions": {"parse": []}, "embeds": [embed]}


def render_development_html(projects: list[dict[str, Any]]) -> str:
    cards = []
    for index, project in enumerate(projects[:3], start=1):
        percent = max(0, min(100, round(float(project.get("progress") or 0) * 100)))
        name = html.escape(str(project.get("name") or "Proyecto sin nombre"))
        update = str(project.get("update") or "Desarrollo en curso.")
        if len(update) > 240:
            update = update[:239].rstrip() + "…"
        update = html.escape(update)
        cards.append(f"""
          <article class="project-card">
            <div class="card-top"><span class="index">0{index}</span><span class="status"><i></i> EN DESARROLLO</span></div>
            <h2>{name}</h2>
            <p>{update}</p>
            <div class="progress-meta"><span>PROGRESO</span><strong>{percent}%</strong></div>
            <div class="track"><div style="width:{percent}%"></div></div>
          </article>""")
    while len(cards) < 3:
        cards.append("""
          <article class="project-card empty">
            <div class="card-top"><span class="index">—</span><span class="status">DISPONIBLE</span></div>
            <h2>Próximo proyecto</h2><p>Este espacio se activará cuando exista otro proyecto público en desarrollo.</p>
          </article>""")
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=1200, initial-scale=1">
<style>
*{{box-sizing:border-box}} html,body{{margin:0;width:1200px;height:630px;overflow:hidden}}
body{{font-family:Inter,Arial,sans-serif;color:#f5f5f5;background:#080808}}
.canvas{{position:relative;width:100%;height:100%;padding:46px 52px 38px;background:
radial-gradient(ellipse 45% 65% at 12% 90%,rgba(255,59,59,.18),transparent 68%),
radial-gradient(ellipse 70% 70% at 58% 45%,rgba(255,59,59,.07),transparent 70%),
linear-gradient(145deg,#151515 0%,#090909 58%,#050505 100%)}}
.canvas:after{{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,.42))}}
header,.grid,footer{{position:relative;z-index:1}} header{{display:flex;justify-content:space-between;align-items:flex-start}}
.brand{{display:flex;align-items:center;gap:15px}} .logo{{width:38px;height:38px;filter:drop-shadow(0 0 12px rgba(255,59,59,.45))}}
.wordmark{{font-size:22px;font-weight:800;letter-spacing:.08em}} .eyebrow{{margin-top:10px;color:#ff3b3b;font-size:11px;font-weight:800;letter-spacing:.28em}}
.title{{margin:5px 0 0;font-size:39px;line-height:1;font-weight:800;letter-spacing:-.04em}} .title span{{color:rgba(245,245,245,.35)}}
.stamp{{padding:9px 12px;border:1px solid rgba(245,245,245,.09);border-radius:8px;background:rgba(20,20,20,.55);font:700 10px 'Courier New',monospace;letter-spacing:.14em;color:rgba(245,245,245,.48)}}
.grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:30px}}
.project-card{{height:330px;padding:22px;border:1px solid rgba(245,245,245,.09);border-radius:14px;background:linear-gradient(180deg,rgba(27,27,27,.82),rgba(13,13,13,.76));box-shadow:0 20px 55px rgba(0,0,0,.25)}}
.project-card:first-child{{border-color:rgba(255,59,59,.42);box-shadow:0 20px 55px rgba(255,59,59,.08)}}
.card-top{{display:flex;align-items:center;justify-content:space-between;font:700 9px 'Courier New',monospace;letter-spacing:.15em;color:rgba(245,245,245,.35)}}
.index{{color:#ff3b3b}} .status{{display:flex;align-items:center;gap:7px}} .status i{{width:6px;height:6px;border-radius:50%;background:#ff3b3b;box-shadow:0 0 9px rgba(255,59,59,.75)}}
h2{{height:58px;margin:24px 0 12px;font-size:22px;line-height:1.14;letter-spacing:-.025em}} p{{height:112px;margin:0;color:rgba(245,245,245,.56);font-size:13px;line-height:1.55}}
.progress-meta{{display:flex;justify-content:space-between;align-items:center;padding-top:18px;border-top:1px solid rgba(245,245,245,.08);font:700 9px 'Courier New',monospace;letter-spacing:.15em;color:rgba(245,245,245,.35)}}
.progress-meta strong{{font-size:17px;letter-spacing:0;color:#f5f5f5}} .track{{height:5px;margin-top:11px;overflow:hidden;border-radius:6px;background:rgba(245,245,245,.06)}} .track div{{height:100%;background:linear-gradient(90deg,#9a0606,#ff3b3b);box-shadow:0 0 12px rgba(255,59,59,.45)}}
.empty{{opacity:.38;border-style:dashed}} footer{{display:flex;align-items:center;justify-content:space-between;margin-top:25px;color:rgba(245,245,245,.32);font:700 9px 'Courier New',monospace;letter-spacing:.16em}}
.live{{display:flex;align-items:center;gap:8px}} .live:before{{content:"";width:5px;height:5px;border-radius:50%;background:#ff3b3b;box-shadow:0 0 8px rgba(255,59,59,.65)}}
</style></head><body><main class="canvas">
<header><div><div class="brand"><svg class="logo" viewBox="0 0 40 40"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff4d4d"/><stop offset=".55" stop-color="#e21b1b"/><stop offset="1" stop-color="#9a0606"/></linearGradient></defs><path d="M20 2 38 38H28L20 18 12 38H2Z" fill="url(#g)"/></svg><span class="wordmark">VANTARE</span></div><div class="eyebrow">DESARROLLO ACTIVO</div><h1 class="title">Development <span>pulse</span></h1></div><div class="stamp">LINEAR · LIVE STATUS</div></header>
<section class="grid">{''.join(cards)}</section>
<footer><span class="live">ACTUALIZACIÓN AUTOMÁTICA</span><span>VANTARE · BUILDING IN PUBLIC</span></footer>
</main></body></html>"""


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
    attachment_path: pathlib.Path | None = None,
    opener: Callable[..., Any] = urllib.request.urlopen,
) -> None:
    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    if len(payload.get("content", "")) > 2000:
        raise ValueError("Discord content exceeds 2000 characters")
    if dry_run:
        # Keep dry-runs portable on Windows consoles whose legacy code page
        # cannot encode the progress-bar or Spanish punctuation characters.
        print(json.dumps(payload, ensure_ascii=True, indent=2))
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
    if attachment_path is None:
        content_type = "application/json"
    else:
        if not attachment_path.is_file():
            raise ValueError(f"Discord attachment does not exist: {attachment_path}")
        payload_with_attachment = dict(payload)
        payload_with_attachment["attachments"] = [{
            "id": 0,
            "filename": DEVELOPMENT_IMAGE_NAME,
            "description": "Estado visual de los proyectos activos de Vantare",
        }]
        boundary = f"vantare-{uuid.uuid4().hex}"
        encoded = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"payload_json\"\r\n"
            "Content-Type: application/json\r\n\r\n"
        ).encode("utf-8") + json.dumps(payload_with_attachment, ensure_ascii=False).encode("utf-8") + (
            f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"files[0]\"; "
            f"filename=\"{DEVELOPMENT_IMAGE_NAME}\"\r\nContent-Type: image/png\r\n\r\n"
        ).encode("utf-8") + attachment_path.read_bytes() + f"\r\n--{boundary}--\r\n".encode("utf-8")
        content_type = f"multipart/form-data; boundary={boundary}"
    request = urllib.request.Request(webhook, data=encoded, headers={"Content-Type": content_type, "User-Agent": USER_AGENT}, method="POST")
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
    parser.add_argument("--html-output")
    parser.add_argument("--snapshot-output")
    parser.add_argument("--snapshot-input")
    parser.add_argument("--image")
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
        if args.snapshot_input:
            selected_projects = json.loads(pathlib.Path(args.snapshot_input).read_text(encoding="utf-8"))
        else:
            key = os.environ.get("LINEAR_API_KEY", "")
            if not key and not args.dry_run:
                raise RuntimeError("LINEAR_API_KEY is required")
            projects = [] if args.dry_run and not key else fetch_linear_projects(key)
            allowlist_path = pathlib.Path("vantare-v2/docs/discord-development-projects.json")
            allowlist = json.loads(allowlist_path.read_text(encoding="utf-8"))
            allowed_names = set(allowlist.get("projects", []))
            if not allowed_names:
                raise ValueError("development project allowlist is empty")
            selected_projects = select_public_projects(projects, allowed_names)
        if args.snapshot_output:
            pathlib.Path(args.snapshot_output).write_text(json.dumps(selected_projects, ensure_ascii=False, indent=2), encoding="utf-8")
        if args.html_output:
            pathlib.Path(args.html_output).write_text(render_development_html(selected_projects), encoding="utf-8")
        payload = render_development(selected_projects, include_image=bool(args.image))
        webhook = os.environ.get("DISCORD_KNOWN_ISSUES_WEBHOOK_URL", "")
        channel = "1519752544753291305"
    if not webhook and not args.dry_run:
        raise RuntimeError("dedicated Discord webhook secret is required")
    publish(webhook, payload, channel, dry_run=args.dry_run, attachment_path=pathlib.Path(args.image) if args.image else None)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, RuntimeError, OSError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
