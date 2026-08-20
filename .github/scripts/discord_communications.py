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
from typing import Any, Callable, Iterable, Sequence


REQUIRED_FRAGMENT_FIELDS = {
    "schemaVersion": int,
    "issue": str,
    "type": str,
    "summary": str,
    "technicalNotes": list,
    "testing": list,
    "knownLimitations": list,
}
USER_AGENT = "Vantare-GitHub-Actions/1.0"
# Sources for the daily development digest, tried in order. The roadmap file is
# the product's own statement of what is being built; open milestones are the
# operational fallback now that the tracker is GitHub Issues.
ROADMAP_JSON_PATH = "vantare-v2/docs/roadmap/roadmap.json"
DEVELOPMENT_SOURCE_ROADMAP = "roadmap"
DEVELOPMENT_SOURCE_MILESTONES = "milestones"
DEVELOPMENT_SOURCE_NONE = "none"
# The embed's accent stripe sits right beside the card image, so it uses the
# same brand carmine as the app (--orbit-carmine in orbit.tokens.css).
VANTARE_RED = 0xD52F49
DEVELOPMENT_IMAGE_NAME = "vantare-development.png"
NIGHTLY_IMAGE_NAME = "vantare-nightly.png"
TESTERS_IMAGE_NAME = "vantare-testers.png"
RELEASE_IMAGE_NAME = "vantare-release.png"
CHANGELOG_IMAGE_NAME = "vantare-changelog.png"
TESTERS_CHANNEL_ID = "1519752249977340168"
CHANGELOG_CHANNEL_ID = "1519747444315914512"
DEVELOPMENT_CHANNEL_ID = "1519752544753291305"


def validate_fragment(value: dict[str, Any], source: str = "fragment") -> dict[str, Any]:
    for field, expected_type in REQUIRED_FRAGMENT_FIELDS.items():
        if field not in value:
            raise ValueError(f"{source}: missing required field {field}")
        if not isinstance(value[field], expected_type):
            raise ValueError(f"{source}: {field} must be {expected_type.__name__}")
    if value["schemaVersion"] != 1:
        raise ValueError(f"{source}: unsupported schemaVersion")
    if not re.fullmatch(r"(?:ISA-[0-9]+|TC-[0-9A-F]{12})", value["issue"]):
        raise ValueError(f"{source}: issue must use ISA-N or TC-<12 HEX> format")
    if value["type"] not in {"feature", "fix", "change", "security"}:
        raise ValueError(f"{source}: unsupported type")
    for field in ("technicalNotes", "testing"):
        if not value[field] or not all(isinstance(item, str) and item.strip() for item in value[field]):
            raise ValueError(f"{source}: {field} must contain non-empty strings")
    if not all(isinstance(item, str) and item.strip() for item in value["knownLimitations"]):
        raise ValueError(f"{source}: knownLimitations must contain strings")
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


# Discord caps a field at 1024 characters and a whole message at 6000. Cutting
# at 1024 mid-sentence used to drop entries silently, and since fragments are
# ordered by issue number, what fell off the end was always the newest work —
# the very thing the announcement exists to report.
EMBED_FIELD_LIMIT = 1024


def _embed_fields(name: str, items: Sequence[str], *, max_fields: int = 1) -> list[dict[str, Any]]:
    """Spread bullets across up to max_fields, never splitting one in half.

    Whatever does not fit is stated as a count instead of vanishing, so a
    reader can tell the message is partial and go looking for the rest.
    """
    bullets = [f"- {item.strip()}" for item in items if item and item.strip()]
    if not bullets:
        return []

    fields: list[dict[str, Any]] = []
    index = 0
    while index < len(bullets) and len(fields) < max_fields:
        chunk: list[str] = []
        length = 0
        last = len(fields) == max_fields - 1
        while index < len(bullets):
            addition = len(bullets[index]) + (1 if chunk else 0)
            # Keep room on the final chunk for the "and N more" line.
            reserve = 40 if last and index < len(bullets) - 1 else 0
            if chunk and length + addition + reserve > EMBED_FIELD_LIMIT:
                break
            if not chunk and length + addition > EMBED_FIELD_LIMIT:
                # A single bullet longer than a whole field: this one has to be
                # cut, but it is cut visibly and it is the only one affected.
                chunk.append(bullets[index][: EMBED_FIELD_LIMIT - 1].rstrip() + "…")
                index += 1
                length = EMBED_FIELD_LIMIT
                break
            chunk.append(bullets[index])
            length += addition
            index += 1
        remaining = len(bullets) - index
        if last and remaining > 0:
            chunk.append(f"- …y {remaining} más, en el changelog completo.")
        fields.append({
            "name": name if not fields else f"{name} (cont.)",
            "value": "\n".join(chunk),
            "inline": False,
        })
    return fields


def _plain_lines(markdown: str, limit: int = 5) -> list[str]:
    lines = []
    for raw in markdown.splitlines():
        value = re.sub(r"^[#>*+\-\s]+", "", raw).strip()
        value = re.sub(r"\[([^]]+)]\([^)]+\)", r"\1", value)
        value = value.replace("`", "")
        if value and value.casefold() not in {"novedades", "cambios", "correcciones"}:
            lines.append(value)
        if len(lines) >= limit:
            break
    return lines


def _changelog_highlights(section: str, limit: int = 3) -> list[tuple[str, str]]:
    labels = {
        "nuevo": "NUEVO",
        "novedades": "NUEVO",
        "mejorado": "MEJORA",
        "corregido": "CORRECCIÓN",
        "seguridad": "SEGURIDAD",
        "para testers": "PARA TESTERS",
    }
    current_label = "CAMBIO DESTACADO"
    highlights: list[tuple[str, str]] = []
    for raw in section.splitlines():
        stripped = raw.strip()
        heading = re.sub(r"^(?:#{1,6}\s+|\*\*)|(?:\*\*)$", "", stripped).strip().casefold()
        if heading in labels and not stripped.startswith("-"):
            current_label = labels[heading]
            continue
        if not re.match(r"^[-*+]\s+\S", stripped):
            continue
        text = re.sub(r"^[-*+]\s+", "", stripped)
        text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text).replace("`", "").strip()
        if text:
            highlights.append((current_label, text))
        if len(highlights) >= limit:
            break
    if highlights:
        return highlights
    return [("CAMBIO DESTACADO", line) for line in _plain_lines(section, limit)]


def _split_visual_copy(text: str, heading_limit: int = 72) -> tuple[str, str]:
    """Split sourced copy across a card without truncating its meaning."""
    if len(text) <= heading_limit:
        return text, ""
    colon_match = re.search(r":\s", text)
    colon = colon_match.start() if colon_match else -1
    if 20 <= colon <= heading_limit:
        return text[:colon].strip(), text[colon + 1:].strip()
    boundary = text.rfind(" ", 0, heading_limit + 1)
    if boundary < 20:
        boundary = heading_limit
    return text[:boundary].rstrip(" ,;"), text[boundary:].lstrip(" ,;")


# The visual card clamps the heading to 4 lines and the body to 5. Anything
# longer used to be cut mid-word by the clamp, which is exactly the illegible
# copy this budget exists to prevent: we trim first, at a sentence or word
# boundary, so the reader always gets a finished thought.
CARD_HEADING_LIMIT = 96
CARD_BODY_LIMIT = 230


def _fit_text(text: str, limit: int) -> str:
    """Trim to a sentence boundary, else a word boundary, marking the cut."""
    value = " ".join((text or "").split())
    if len(value) <= limit:
        return value
    window = value[:limit]
    sentence = max(window.rfind(". "), window.rfind("; "), window.rfind(" · "))
    if sentence >= limit // 2:
        return window[:sentence + 1].rstrip(" ;·")
    boundary = window.rfind(" ")
    if boundary < limit // 3:
        boundary = limit - 1
    trimmed = window[:boundary]
    # Ending inside an aside that never closes reads worse than ending before
    # it, so an orphaned "(" takes its whole fragment with it.
    open_paren = trimmed.rfind("(")
    if open_paren > limit // 3 and trimmed.find(")", open_paren) == -1:
        trimmed = trimmed[:open_paren]
    return trimmed.rstrip(" ,;:·") + "…"


def _unwrap_parenthetical(text: str) -> str:
    """Promote an aside that became the whole body into a plain sentence.

    When the headline is cut before a parenthesis, the remainder starts with
    the orphaned "(" and reads as a footnote to nothing. With no sentence left
    to be an aside to, the brackets stop earning their place.
    """
    value = text.strip()
    if not value.startswith("("):
        return value
    depth = 0
    for index, character in enumerate(value):
        if character == "(":
            depth += 1
        elif character == ")":
            depth -= 1
            if depth == 0:
                inner = value[1:index].strip()
                tail = value[index + 1:].strip()
                # "…Diagnóstico)." would otherwise keep both stops.
                if tail.startswith(".") and inner.endswith("."):
                    tail = tail[1:].lstrip()
                if not inner.endswith((".", "!", "?")) and tail.startswith("."):
                    inner, tail = inner + ".", tail[1:].lstrip()
                return f"{inner} {tail}".strip() if tail else inner
    # Never closed: drop the stray bracket rather than leave it dangling.
    return value[1:].strip()


def _manifest_headline(manifest: dict[str, Any]) -> str:
    """The manifest title without the brand prefix the card already shows."""
    title = " ".join(str(manifest.get("title") or "").split())
    return re.sub(r"^Vantare\s*[—–-]\s*", "", title).strip()


def load_manifest(path: str) -> dict[str, Any]:
    value = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path}: release manifest must be an object")
    for field in ("tag", "title", "summary"):
        if not isinstance(value.get(field), str) or not value[field].strip():
            raise ValueError(f"{path}: manifest field {field} must be a non-empty string")
    return value


# The card is the app's face on Discord, so it speaks Command Orbit's visual
# language rather than a look invented for the announcement: the values below
# are copied from vantare-v2/frontend/src/styles/orbit.tokens.css. The brand
# carmine is #d52f49 — the old #ff3b3b was never a Vantare colour.
ORBIT_TOKENS = """
:root{
  --orbit-canvas:#08090b;--orbit-surface-1:#121316;--orbit-surface-2:#18191e;
  --orbit-ink:#f5f3f2;--orbit-ink-2:#b7b2b2;--orbit-ink-3:#8a858b;--orbit-ink-4:#787379;--orbit-ink-muted:#57545a;
  --orbit-line:rgba(255,255,255,.075);--orbit-line-strong:rgba(255,255,255,.13);
  --orbit-carmine:#d52f49;--orbit-red:#f04755;--orbit-coral:#ff6a5f;--orbit-wine:#641526;
  --orbit-featured-bg:linear-gradient(rgba(25,25,30,.98),rgba(19,19,23,.99));
  --orbit-featured-border:linear-gradient(115deg,rgba(240,71,85,.62),rgba(255,106,95,.2),rgba(255,255,255,.06));
  --orbit-font-sans:Inter,"Segoe UI Variable","Segoe UI",system-ui,sans-serif;
  --orbit-font-mono:"Cascadia Code","SFMono-Regular",ui-monospace,monospace;
  --orbit-radius-featured:25px;--orbit-radius-chip:8px;
  --orbit-shadow-featured:0 32px 91px rgba(0,0,0,.42),0 0 42px rgba(213,47,73,.04);
  --orbit-inset-glass:inset 0 1px 0 rgba(255,255,255,.08);
}
"""

# Shared chrome: canvas, ambient glow, brand lockup, chip, grid and footer.
# Both cards used to carry their own near-identical copy of this.
ORBIT_CHROME_CSS = """
*{box-sizing:border-box}
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{background:var(--orbit-canvas);color:var(--orbit-ink);font-family:var(--orbit-font-sans);-webkit-font-smoothing:antialiased}
.canvas{position:relative;width:100%;height:100%;padding:44px 52px 34px;background:
 radial-gradient(ellipse 52% 60% at 88% 6%,rgba(213,47,73,.16),transparent 62%),
 radial-gradient(ellipse 40% 55% at 6% 96%,rgba(213,47,73,.09),transparent 66%),
 var(--orbit-canvas)}
header,.grid,footer{position:relative;z-index:1}
header{display:flex;justify-content:space-between;align-items:flex-start}
.brand{display:flex;align-items:center;gap:13px}
.mark{width:40px;height:40px;border-radius:13px;background:var(--orbit-surface-2);border:1px solid var(--orbit-line);box-shadow:var(--orbit-inset-glass)}
.wordmark{font-size:17px;font-weight:650;letter-spacing:.02em;color:var(--orbit-ink)}
.eyebrow{margin-top:17px;color:var(--orbit-ink-4);font-size:10.5px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
.title{margin:7px 0 0;font-size:39px;line-height:1.04;font-weight:700;letter-spacing:-.02em}
.title span{color:var(--orbit-ink-3)}
/* No text-transform: the stamp carries a commit hash, and a hash shouted in
   uppercase is a different string from the one you would paste into git. */
.stamp{display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:var(--orbit-radius-chip);
 background:rgba(255,255,255,.035);color:var(--orbit-ink-4);font-family:var(--orbit-font-mono);font-size:10px;font-weight:700;letter-spacing:.06em}
.grid{display:grid;width:min(100%,var(--grid-width));grid-template-columns:repeat(var(--columns),minmax(0,1fr));gap:18px;margin:28px auto 0}
.project-card{position:relative;height:326px;padding:22px 24px;border:1px solid var(--orbit-line);
 border-radius:var(--orbit-radius-featured);background:var(--orbit-surface-1);box-shadow:0 24px 64px rgba(0,0,0,.36),var(--orbit-inset-glass)}
.card-top{display:flex;align-items:center;justify-content:space-between}
.index{font-family:var(--orbit-font-mono);font-size:10px;font-weight:700;color:var(--orbit-ink-muted);letter-spacing:.06em}
.status{display:flex;align-items:center;gap:8px;color:var(--orbit-ink-4);font-size:10px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
.status i{width:6.5px;height:6.5px;border-radius:50%;background:var(--orbit-red);box-shadow:0 0 10px currentcolor;color:var(--orbit-red)}
footer{display:flex;align-items:center;justify-content:space-between;margin-top:22px;
 color:var(--orbit-ink-muted);font-family:var(--orbit-font-mono);font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
.live{display:flex;align-items:center;gap:8px}
.live:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--orbit-red);box-shadow:0 0 10px rgba(240,71,85,.6)}
"""

# The rail mark: the nested-chevron logotype on its dark tile, as the shell
# renders it — a red gradient glyph, not a glowing solid triangle.
ORBIT_MARK_SVG = (
    '<svg class="mark" viewBox="0 0 40 40" aria-hidden="true">'
    '<defs><linearGradient id="vm" x1="0" y1="0" x2="0" y2="1">'
    '<stop stop-color="#ff6a5f"/><stop offset=".55" stop-color="#f04755"/>'
    '<stop offset="1" stop-color="#9c1b2c"/></linearGradient></defs>'
    '<path d="M20 8 32 32H26.4L20 19.2 13.6 32H8Z" fill="url(#vm)"/></svg>'
)


def _orbit_header(*, eyebrow: str, title: str, accent: str, stamp: str) -> str:
    return (
        f'<header><div><div class="brand">{ORBIT_MARK_SVG}'
        f'<span class="wordmark">Vantare</span></div>'
        f'<div class="eyebrow">{html.escape(eyebrow)}</div>'
        f'<h1 class="title">{html.escape(title)} <span>{html.escape(accent)}</span></h1></div>'
        f'<div class="stamp">{html.escape(stamp)}</div></header>'
    )


def _orbit_document(*, extra_css: str, header: str, cards: list[str], footer: str) -> str:
    column_count = len(cards)
    grid_width = {1: 520, 2: 780, 3: 1096}[column_count]
    return (
        '<!doctype html>\n<html lang="es"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=1200, initial-scale=1"><style>'
        f'{ORBIT_TOKENS}{ORBIT_CHROME_CSS}{extra_css}</style></head>'
        f'<body><main class="canvas">{header}'
        f'<section class="grid" style="--columns:{column_count};--grid-width:{grid_width}px">'
        f'{"".join(cards)}</section>{footer}</main></body></html>'
    )


CHANNEL_CARD_CSS = """
.project-card.primary{border-color:transparent;
 background:var(--orbit-featured-bg) padding-box,var(--orbit-featured-border) border-box;
 box-shadow:var(--orbit-shadow-featured)}
.project-card.primary .index{color:var(--orbit-red)}
/* min-height, not height: two-line headings line up across the three cards
   without a fixed box leaving a hole under the shorter ones. */
h2{display:-webkit-box;min-height:48px;margin:20px 0 14px;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:4;
 font-size:20px;line-height:1.2;font-weight:650;letter-spacing:-.01em;color:var(--orbit-ink)}
p{display:-webkit-box;margin:0;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:5;
 color:var(--orbit-ink-2);font-size:13.5px;line-height:1.55}
"""


def _branded_html(*, eyebrow: str, title: str, accent: str, stamp: str,
                  cards: list[tuple[str, str, str]], footer_left: str, footer_right: str) -> str:
    if not cards:
        raise ValueError("at least one meaningful visual card is required")
    rendered_cards = []
    for index, (label, heading, body) in enumerate(cards[:3], start=1):
        rendered_cards.append(f"""
          <article class="project-card{' primary' if index == 1 else ''}">
            <div class="card-top"><span class="index">0{index}</span><span class="status"><i></i> {html.escape(label)}</span></div>
            <h2>{html.escape(heading)}</h2><p>{html.escape(body)}</p>
          </article>""")
    footer = (f'<footer><span class="live">{html.escape(footer_left)}</span>'
              f'<span>{html.escape(footer_right)}</span></footer>')
    return _orbit_document(
        extra_css=CHANNEL_CARD_CSS,
        header=_orbit_header(eyebrow=eyebrow, title=title, accent=accent, stamp=stamp),
        cards=rendered_cards,
        footer=footer,
    )


def _channel_copy(channel: str) -> dict[str, str]:
    contracts = {
        "nightly": {
            "title": "Vantare — nueva Nightly privada",
            "description": "Primera validación con testers Nightly antes de ampliar el acceso.",
            "footer": "Vantare Nightly · Puede contener funciones experimentales",
            "eyebrow": "PRUEBA PRIVADA NIGHTLY",
            "heading": "Primera",
            "accent": "validación",
            "footer_left": "PRUEBA EL CORTE COMPLETO",
            "footer_right": "VANTARE · TESTERS NIGHTLY",
        },
        "testers": {
            "title": "Vantare — candidata para testers",
            "description": "Corte corregido y preparado para una validación más amplia.",
            "footer": "Vantare Testers · Candidata previa a Stable",
            "eyebrow": "ACTUALIZACIÓN PARA TESTERS",
            "heading": "Cambios",
            "accent": "para validar",
            "footer_left": "VALIDACIÓN AMPLIADA",
            "footer_right": "VANTARE · CANAL TESTERS",
        },
    }
    if channel not in contracts:
        raise ValueError("channel must be nightly or testers")
    return contracts[channel]


def _channel_image_name(channel: str) -> str:
    return NIGHTLY_IMAGE_NAME if channel == "nightly" else TESTERS_IMAGE_NAME


def _fragment_order(fragment: dict[str, Any]) -> tuple[int, str]:
    """Stable newest-first key for numeric ISA IDs and opaque TC IDs."""
    issue = str(fragment.get("issue", ""))
    numeric = re.fullmatch(r"ISA-(\d+)", issue)
    if numeric:
        return (0, f"{int(numeric.group(1)):020d}")
    testing_center = re.fullmatch(r"TC-([0-9A-F]{12})", issue)
    if testing_center:
        return (1, testing_center.group(1))
    return (-1, "")


def render_channel_update(fragments: list[dict[str, Any]], revision: str, channel: str,
                          *, include_image: bool = False,
                          manifest: dict[str, Any] | None = None) -> dict[str, Any]:
    if not fragments:
        raise ValueError("at least one changelog fragment is required")
    copy = _channel_copy(channel)
    # Newest first. Fragments accumulate and the message cannot hold them all,
    # so the half that survives has to be the half being announced.
    ordered = sorted(fragments, key=_fragment_order, reverse=True)
    summary = [f"**{item['issue']}** — {item['summary']}" for item in ordered]
    technical = [note for item in ordered for note in item["technicalNotes"]]
    testing = [step for item in ordered for step in item["testing"]]
    limitations = [note for item in ordered for note in item["knownLimitations"]]
    limitation_copy = limitations or ["No hay limitaciones conocidas declaradas para este corte."]
    # A tester reads the description first, so it leads with what this cut is
    # about in plain words; the per-issue "Resumen" stays below for detail.
    description = f"{copy['description']} Revisión `{revision[:12]}`."
    if manifest:
        headline = _manifest_headline(manifest)
        lead = " ".join(str(manifest.get("summary") or "").split())
        description = "\n\n".join(part for part in (
            f"**{headline}**\n{lead}".strip(), description) if part)
    payload = {
        "allowed_mentions": {"parse": []},
        "embeds": [{
            "title": copy["title"],
            "description": description,
            "color": VANTARE_RED,
            "fields": [
                *_embed_fields("Resumen", summary, max_fields=2),
                *_embed_fields("Notas técnicas", technical),
                *_embed_fields("Qué comprobar", testing),
                *_embed_fields("Limitaciones conocidas", limitation_copy),
            ],
            "footer": {"text": copy["footer"]},
        }],
    }
    if include_image:
        payload["embeds"][0]["image"] = {"url": f"attachment://{_channel_image_name(channel)}"}
    return payload


def _card_from_items(items: Sequence[str], *, empty_heading: str = "",
                     empty_body: str = "") -> tuple[str, str]:
    """Turn a list of sourced sentences into a short heading plus a full body.

    The first item is split into a headline and its own remainder, and the
    following items continue the body, so nothing is announced as a half
    sentence the way a raw line-clamp used to leave it.
    """
    if not items:
        return empty_heading, empty_body
    heading, remainder = _split_visual_copy(items[0])
    # A heading that opens a parenthesis it never closes reads as broken copy,
    # so the aside moves down to the body where it can finish.
    open_paren = heading.rfind("(")
    if open_paren > 0 and heading.find(")", open_paren) == -1:
        remainder = f"{heading[open_paren:]} {remainder}".strip()
        heading = heading[:open_paren].rstrip(" ,;:")
    remainder = _unwrap_parenthetical(remainder)
    body_parts = [part for part in (remainder, *items[1:]) if part and part.strip()]
    body = " ".join(body_parts).strip()
    if body[:1].islower():
        body = body[0].upper() + body[1:]
    return _fit_text(heading, CARD_HEADING_LIMIT), _fit_text(body, CARD_BODY_LIMIT)


def render_channel_update_html(fragments: list[dict[str, Any]], revision: str, channel: str,
                               *, manifest: dict[str, Any] | None = None) -> str:
    if not fragments:
        raise ValueError("at least one changelog fragment is required")
    copy = _channel_copy(channel)
    test_steps = [step for item in fragments for step in item["testing"]]
    limitations = [note for item in fragments for note in item["knownLimitations"]]
    if manifest:
        # A raw issue ID means nothing to a tester; the manifest already carries
        # the human headline and summary written for exactly this audience.
        lead_heading = _fit_text(_manifest_headline(manifest), CARD_HEADING_LIMIT)
        lead_body = _fit_text(str(manifest.get("summary") or ""), CARD_BODY_LIMIT)
    else:
        lead_heading = _fit_text(" · ".join(item["issue"] for item in fragments), CARD_HEADING_LIMIT)
        lead_body = _fit_text(" ".join(item["summary"] for item in fragments), CARD_BODY_LIMIT)
    cards = [
        (f"{len(fragments)} CAMBIO{'S' if len(fragments) != 1 else ''}", lead_heading, lead_body),
        ("QUÉ DEBES PROBAR", *_card_from_items(test_steps)),
        ("LIMITACIONES", *_card_from_items(
            limitations,
            empty_heading="Sin limitaciones conocidas",
            empty_body="El corte ha superado sus gates automáticos.")),
    ]
    return _branded_html(eyebrow=copy["eyebrow"], title=copy["heading"], accent=copy["accent"],
                         stamp=f"{channel.upper()} · {revision[:12]}", cards=cards,
                         footer_left=copy["footer_left"], footer_right=copy["footer_right"])


def render_testers(fragments: list[dict[str, Any]], revision: str, *, include_image: bool = False) -> dict[str, Any]:
    return render_channel_update(fragments, revision, "testers", include_image=include_image)


def render_testers_html(fragments: list[dict[str, Any]], revision: str) -> str:
    return render_channel_update_html(fragments, revision, "testers")


def render_release(tag: str, section: str, revision: str, release_url: str, *, include_image: bool = False) -> dict[str, Any]:
    changes = _changelog_highlights(section, 8)
    embed = {"title": f"Vantare {tag}", "description": "Nueva versión pública disponible.", "color": VANTARE_RED,
             "fields": [{"name": "Cambios destacados", "value": _embed_field([f"**{label.title()}** — {text}" for label, text in changes]), "inline": False}],
             "footer": {"text": f"Vantare Stable · {revision[:12]}"}}
    if release_url:
        embed["fields"].append({"name": "Descarga", "value": f"[Ver lanzamiento]({release_url})", "inline": False})
    if include_image:
        embed["image"] = {"url": f"attachment://{RELEASE_IMAGE_NAME}"}
    return {"allowed_mentions": {"parse": []}, "embeds": [embed]}


def render_release_html(tag: str, section: str, revision: str) -> str:
    changes = _changelog_highlights(section, 3)
    cards = [(label, *_split_visual_copy(change)) for label, change in changes]
    return _branded_html(eyebrow="NUEVA VERSIÓN", title="Vantare", accent=tag,
                         stamp=f"MASTER · {revision[:12]}", cards=cards,
                         footer_left="VERSIÓN ESTABLE", footer_right="VANTARE · LANZAMIENTO PÚBLICO")


def render_build(version: str, notes: str, download_url: str, sha256: str, release_url: str,
                 known_issues_url: str, channel: str = "testers", *, include_image: bool = False) -> dict[str, Any]:
    copy = _channel_copy(channel)
    fields = [{"name": "Resumen técnico", "value": notes or "Build disponible para validación.", "inline": False},
              {"name": "Descarga", "value": f"[Descargar build]({download_url})", "inline": False}]
    if release_url:
        fields.append({"name": "Release", "value": f"[Abrir release]({release_url})", "inline": True})
    if sha256:
        fields.append({"name": "SHA-256", "value": f"`{sha256}`", "inline": False})
    fields.append({"name": "Incidencias conocidas", "value": f"[Consultar lista]({known_issues_url})", "inline": False})
    embed = {"title": f"Vantare — changelog {version}", "description": copy["description"],
             "color": VANTARE_RED, "fields": fields,
             "footer": {"text": f"Vantare {channel.title()} · SmartScreen puede solicitar confirmación"}}
    if include_image:
        embed["image"] = {"url": f"attachment://{CHANGELOG_IMAGE_NAME}"}
    return {"allowed_mentions": {"parse": []}, "embeds": [embed]}


def render_build_html(version: str, notes: str, sha256: str, channel: str = "testers") -> str:
    _channel_copy(channel)
    cards = [("OBJETIVO", version, notes or "Instala esta versión y comprueba que Vantare inicia correctamente."),
             ("PRUEBA BÁSICA", "Instalación y arranque", "Confirma inicio, navegación y ausencia de regresiones visibles."),
             ("INTEGRIDAD", "SHA-256 VERIFICADO" if sha256 else "Checksum no indicado", sha256[:32] + "…" if sha256 else "Consulta el mensaje técnico.")]
    return _branded_html(eyebrow="CHANGELOG TÉCNICO", title="Build", accent=channel.title(),
                         stamp=version, cards=cards,
                         footer_left="DESCARGA Y COMPRUEBA", footer_right="VANTARE · CHANGELOG")


DEFAULT_DEVELOPMENT_UPDATE = "Desarrollo en curso. Consulta el repositorio para ver el estado operativo completo."
# Anything a roadmap phase might call "being worked on right now". Matching is
# case-insensitive and ignores separators, so "in_progress" and "In Progress"
# both land here.
ACTIVE_STATUS_WORDS = {
    "inprogress", "progress", "started", "active", "doing", "wip", "ongoing",
    "encurso", "enprogreso", "activo", "enmarcha", "current", "building",
}


def sanitize_public_text(value: str | None) -> str:
    """Strip mass mentions so a digest can never ping the whole server."""
    if not value:
        return ""
    return " ".join(
        str(value).replace("@everyone", "@\u200beveryone").replace("@here", "@\u200bhere").split()
    )


def _first_str(source: dict[str, Any], keys: Sequence[str]) -> str:
    for key in keys:
        value = source.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _coerce_progress(value: Any) -> float:
    """Normalize the many shapes a progress figure arrives in to a 0..1 float."""
    if isinstance(value, dict):
        percent = value.get("percent")
        if isinstance(percent, (int, float)):
            return max(0.0, min(1.0, float(percent) / 100))
        done, total = value.get("done"), value.get("total")
        if isinstance(done, (int, float)) and isinstance(total, (int, float)) and total:
            return max(0.0, min(1.0, float(done) / float(total)))
        return 0.0
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 0.0
    number = float(value)
    if number > 1:  # percentages arrive as 0..100
        number /= 100
    return max(0.0, min(1.0, number))


def _is_active_status(status: Any) -> bool | None:
    """True/False when the entry states a status, None when it states none."""
    if isinstance(status, dict):
        status = status.get("type") or status.get("name") or status.get("id")
    if not isinstance(status, str) or not status.strip():
        return None
    normalized = re.sub(r"[^a-z]", "", status.casefold())
    return any(word in normalized for word in ACTIVE_STATUS_WORDS)


def _roadmap_entries(document: Any) -> list[dict[str, Any]]:
    """Pull the list of phases out of whichever shape the roadmap file uses."""
    if isinstance(document, list):
        candidates: Any = document
    elif isinstance(document, dict):
        candidates = []
        for key in ("phases", "projects", "items", "entries", "roadmap", "milestones"):
            value = document.get(key)
            if isinstance(value, list) and value:
                candidates = value
                break
    else:
        return []
    return [entry for entry in candidates if isinstance(entry, dict)]


def load_roadmap_projects(path: pathlib.Path) -> list[dict[str, Any]]:
    """Read the roadmap snapshot, tolerating an absent or unexpected schema.

    ISA-378 owns that file's shape, so anything unreadable here is treated as
    "no roadmap data" and the caller falls through to the next source instead
    of failing the daily announcement.
    """
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return []
    selected = []
    for entry in _roadmap_entries(document):
        if _is_active_status(entry.get("status") or entry.get("state")) is False:
            continue
        name = _first_str(entry, ("name", "title", "label", "phase"))
        if not name:
            continue
        selected.append({
            "name": sanitize_public_text(name),
            "url": _first_str(entry, ("url", "link", "href")),
            "progress": _coerce_progress(
                entry.get("progress", entry.get("percent", entry.get("completion")))
            ),
            "update": sanitize_public_text(
                _first_str(entry, ("update", "summary", "description", "note", "detail"))
            ) or DEFAULT_DEVELOPMENT_UPDATE,
            "updatedAt": _first_str(entry, ("updatedAt", "updated_at", "date")),
        })
    return selected


def milestones_to_projects(milestones: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Shape open GitHub milestones like the render contract expects."""
    selected = []
    for milestone in milestones:
        if not isinstance(milestone, dict) or milestone.get("state") not in (None, "open"):
            continue
        title = milestone.get("title")
        if not isinstance(title, str) or not title.strip():
            continue
        closed = milestone.get("closed_issues") or 0
        opened = milestone.get("open_issues") or 0
        total = closed + opened
        selected.append({
            "name": sanitize_public_text(title),
            "url": str(milestone.get("html_url") or ""),
            "progress": (closed / total) if total else 0.0,
            "update": sanitize_public_text(milestone.get("description")) or DEFAULT_DEVELOPMENT_UPDATE,
            "updatedAt": str(milestone.get("updated_at") or ""),
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
        description = f"{min(len(projects), 3)} proyectos públicos en desarrollo. Estado operativo desde el repositorio."
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
        "footer": {"text": "Vantare · Resumen diario de desarrollo"},
    }
    if include_image:
        embed["image"] = {"url": f"attachment://{DEVELOPMENT_IMAGE_NAME}"}
    return {"allowed_mentions": {"parse": []}, "embeds": [embed]}


DEVELOPMENT_CARD_CSS = """
.project-card:first-child{border-color:transparent;
 background:var(--orbit-featured-bg) padding-box,var(--orbit-featured-border) border-box;
 box-shadow:var(--orbit-shadow-featured)}
.project-card:first-child .index{color:var(--orbit-red)}
h2{display:-webkit-box;min-height:48px;margin:20px 0 14px;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;
 font-size:20px;line-height:1.2;font-weight:650;letter-spacing:-.01em;color:var(--orbit-ink)}
p{display:-webkit-box;margin:0 0 auto;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:5;
 color:var(--orbit-ink-2);font-size:13.5px;line-height:1.55}
.project-card{display:flex;flex-direction:column}
.progress-meta{display:flex;justify-content:space-between;align-items:center;padding-top:18px;
 border-top:1px solid var(--orbit-line);color:var(--orbit-ink-4);font-size:10px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
.progress-meta strong{font-family:var(--orbit-font-mono);font-size:17px;font-weight:700;letter-spacing:0;color:var(--orbit-ink)}
.track{height:5px;margin-top:11px;overflow:hidden;border-radius:6px;background:rgba(255,255,255,.06)}
.track div{height:100%;border-radius:6px;background:linear-gradient(90deg,var(--orbit-wine),var(--orbit-red));box-shadow:0 0 12px rgba(240,71,85,.45)}
"""


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
    if not cards:
        cards.append("""
          <article class="project-card">
            <div class="card-top"><span class="index">—</span><span class="status">SIN CAMBIOS PUBLICADOS</span></div>
            <h2>No hay novedades públicas hoy</h2><p>Los proyectos activos continúan sin una actualización nueva para Discord.</p>
          </article>""")
    footer = ('<footer><span class="live">Actualización automática</span>'
              '<span>Vantare · Desarrollo en curso</span></footer>')
    return _orbit_document(
        extra_css=DEVELOPMENT_CARD_CSS,
        header=_orbit_header(eyebrow="Estado de desarrollo", title="Proyectos",
                             accent="en curso", stamp="Actualizado automáticamente"),
        cards=cards,
        footer=footer,
    )


def assert_channel(metadata: dict[str, Any], expected_channel_id: str) -> None:
    actual = str(metadata.get("channel_id", ""))
    if not expected_channel_id:
        raise RuntimeError("Expected Discord channel ID is required")
    if not actual or actual != str(expected_channel_id):
        raise RuntimeError(
            f"Discord webhook channel mismatch: actual={actual or 'missing'} expected={expected_channel_id}"
        )


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
        attachment_name = attachment_path.name
        payload_with_attachment = dict(payload)
        payload_with_attachment["attachments"] = [{
            "id": 0,
            "filename": attachment_name,
            "description": "Resumen visual de Vantare",
        }]
        boundary = f"vantare-{uuid.uuid4().hex}"
        encoded = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"payload_json\"\r\n"
            "Content-Type: application/json\r\n\r\n"
        ).encode("utf-8") + json.dumps(payload_with_attachment, ensure_ascii=False).encode("utf-8") + (
            f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"files[0]\"; "
            f"filename=\"{attachment_name}\"\r\nContent-Type: image/png\r\n\r\n"
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


def fetch_open_milestones(
    token: str,
    repository: str,
    *,
    opener: Callable[..., Any] = urllib.request.urlopen,
) -> list[dict[str, Any]]:
    """List the repository's open milestones, newest activity first.

    A failure here is not fatal: the caller degrades to the honest "no news"
    embed rather than skipping the daily announcement altogether.
    """
    if not repository:
        return []
    headers = {"Accept": "application/vnd.github+json", "User-Agent": USER_AGENT}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(
        f"https://api.github.com/repos/{repository}/milestones"
        "?state=open&sort=updated&direction=desc&per_page=20",
        headers=headers,
        method="GET",
    )
    with opener(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8") or "[]")
    return payload if isinstance(payload, list) else []


def resolve_development_projects(
    *,
    roadmap_path: pathlib.Path | None = None,
    token: str = "",
    repository: str = "",
    opener: Callable[..., Any] = urllib.request.urlopen,
) -> tuple[list[dict[str, Any]], str]:
    """Pick the digest's source: roadmap first, open milestones next, else none."""
    roadmap = load_roadmap_projects(roadmap_path or pathlib.Path(ROADMAP_JSON_PATH))
    if roadmap:
        return roadmap, DEVELOPMENT_SOURCE_ROADMAP
    try:
        milestones = milestones_to_projects(fetch_open_milestones(token, repository, opener=opener))
    except (urllib.error.URLError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"warning: milestone lookup failed: {error}", file=sys.stderr)
        milestones = []
    if milestones:
        return milestones, DEVELOPMENT_SOURCE_MILESTONES
    return [], DEVELOPMENT_SOURCE_NONE


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("nightly", "testers", "development", "release", "build", "select-fragments"))
    parser.add_argument("--fragment", action="append", default=[])
    parser.add_argument("--revision", default=os.environ.get("GITHUB_SHA", "manual"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--base")
    parser.add_argument("--html-output")
    parser.add_argument("--snapshot-output")
    parser.add_argument("--snapshot-input")
    parser.add_argument("--image")
    parser.add_argument("--tag")
    parser.add_argument("--section-file")
    parser.add_argument("--release-url", default="")
    parser.add_argument("--version")
    parser.add_argument("--notes", default="")
    parser.add_argument("--download-url", default="")
    parser.add_argument("--sha256", default="")
    parser.add_argument("--known-issues-url", default="")
    parser.add_argument("--channel-id", default="")
    parser.add_argument("--channel", choices=("nightly", "testers"), default="testers")
    parser.add_argument("--manifest")
    args = parser.parse_args()

    if args.mode == "select-fragments":
        if not args.base:
            raise ValueError("--base is required")
        for path in select_semantically_changed_files(args.fragment, args.base):
            print(path)
        return 0
    if args.mode in {"nightly", "testers"}:
        fragments = load_fragment_files(args.fragment)
        # Optional on purpose: other callers still invoke this without a
        # manifest and must keep getting the previous, ID-based copy.
        manifest = load_manifest(args.manifest) if args.manifest else None
        if args.html_output:
            pathlib.Path(args.html_output).write_text(
                render_channel_update_html(fragments, args.revision, args.mode, manifest=manifest),
                encoding="utf-8",
            )
        payload = render_channel_update(fragments, args.revision, args.mode,
                                        include_image=bool(args.image), manifest=manifest)
        webhook = os.environ.get("DISCORD_PROGRESS_WEBHOOK_URL", "")
        channel = TESTERS_CHANNEL_ID
    elif args.mode == "release":
        if not args.tag or not args.section_file:
            raise ValueError("--tag and --section-file are required")
        section = pathlib.Path(args.section_file).read_text(encoding="utf-8")
        if args.html_output:
            pathlib.Path(args.html_output).write_text(render_release_html(args.tag, section, args.revision), encoding="utf-8")
        payload = render_release(args.tag, section, args.revision, args.release_url, include_image=bool(args.image))
        webhook = os.environ.get("DISCORD_RELEASE_WEBHOOK_URL", "")
        channel = args.channel_id or os.environ.get("DISCORD_RELEASE_CHANNEL_ID", "")
    elif args.mode == "build":
        if not args.version or not args.download_url:
            raise ValueError("--version and --download-url are required")
        if args.html_output:
            pathlib.Path(args.html_output).write_text(
                render_build_html(args.version, args.notes, args.sha256, args.channel), encoding="utf-8"
            )
        payload = render_build(args.version, args.notes, args.download_url, args.sha256, args.release_url,
                               args.known_issues_url, args.channel, include_image=bool(args.image))
        webhook = os.environ.get("DISCORD_BUILD_WEBHOOK_URL", "")
        channel = args.channel_id or CHANGELOG_CHANNEL_ID
    else:
        if args.snapshot_input:
            selected_projects = json.loads(pathlib.Path(args.snapshot_input).read_text(encoding="utf-8"))
        else:
            selected_projects, source = resolve_development_projects(
                token=os.environ.get("GITHUB_TOKEN", ""),
                repository=os.environ.get("GITHUB_REPOSITORY", ""),
            )
            print(f"development digest source: {source}", file=sys.stderr)
        if args.snapshot_output:
            pathlib.Path(args.snapshot_output).write_text(json.dumps(selected_projects, ensure_ascii=False, indent=2), encoding="utf-8")
        if args.html_output:
            pathlib.Path(args.html_output).write_text(render_development_html(selected_projects), encoding="utf-8")
        payload = render_development(selected_projects, include_image=bool(args.image))
        webhook = os.environ.get("DISCORD_KNOWN_ISSUES_WEBHOOK_URL", "")
        channel = DEVELOPMENT_CHANNEL_ID
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
