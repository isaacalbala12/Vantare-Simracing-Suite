#!/usr/bin/env python3
"""Render the GitHub Release body for a Vantare tag from its own manifest.

Until now the body was scraped out of `docs/changelog.md` looking for a
`## <tag>` heading, and when the heading was missing the workflow only printed
a warning and published `Release <tag>` instead. No nightly has ever had such a
heading, so every pre-release shipped with a placeholder as its notes — which is
exactly the text a tester reads on GitHub, and the text the app shows when
hovering the update pill.

The manifest (`docs/releases/<tag>.json`) and its changelog fragments are
already mandatory, already written in plain Spanish and already reviewed. This
script turns them into the release body so there is a single source of truth,
and refuses to render anything when the source is missing or placeholder-thin.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
from typing import Any, Sequence

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from discord_communications import (  # noqa: E402  (path shim above)
    _fragment_order,
    _manifest_headline,
    load_fragment_files,
    load_manifest,
)

CHANNELS = {"nightly": "Nightly", "testers": "Testers", "master": "Estable"}

# Section order is the order a reader cares about: what is new, what got better,
# what was broken, what was hardened. The headings double as the labels the
# Discord card derives from this same body (_changelog_highlights).
SECTIONS: tuple[tuple[str, str], ...] = (
    ("feature", "Novedades"),
    ("change", "Mejorado"),
    ("fix", "Corregido"),
    ("security", "Seguridad"),
)

# A summary is the one line that has to work for somebody who does not know what
# a build is. These floors do not make prose good, they only make "Release v1",
# "varios fixes" and an empty string fail here instead of on GitHub.
MIN_SUMMARY_CHARS = 40
MIN_SUMMARY_WORDS = 6
MIN_TITLE_CHARS = 8

NO_LIMITATIONS = "Ninguna declarada para este corte."


def manifest_path(root: pathlib.Path, vantare_dir: str, tag: str) -> pathlib.Path:
    return root / vantare_dir / "docs" / "releases" / f"{tag}.json"


def fragment_path(root: pathlib.Path, vantare_dir: str, issue: str) -> pathlib.Path:
    return root / vantare_dir / "docs" / "changelog" / "fragments" / f"{issue}.json"


def _words(value: str) -> int:
    return len(str(value).split())


def _headline(manifest: dict[str, Any]) -> str:
    """The manifest title without the brand prefix the release title already has.

    Stripping "Vantare — " can leave the sentence starting in lowercase, which
    reads as a typo at the top of the notes. Only an entirely lowercase first
    word is capitalised, so `iRacing` and friends survive untouched.
    """
    headline = _manifest_headline(manifest)
    first = headline.split(" ", 1)[0]
    if first and first[0].islower() and first == first.lower():
        headline = headline[0].upper() + headline[1:]
    return headline


def load_release(tag: str, root: pathlib.Path, vantare_dir: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Load the manifest and every fragment it declares, or explain what is missing.

    Raises ValueError with a message meant to be read straight from a red run:
    the reader is whoever forgot to write the changelog, not a maintainer of
    this script.
    """
    path = manifest_path(root, vantare_dir, tag)
    if not path.is_file():
        raise ValueError(
            f"Missing release manifest: {path.as_posix()}. "
            "Every release needs one before it can be published."
        )
    manifest = load_manifest(str(path))

    declared_tag = str(manifest.get("tag") or "").strip()
    if declared_tag != tag:
        raise ValueError(f"{path.as_posix()}: manifest tag is {declared_tag!r}, expected {tag!r}")

    channel = manifest.get("channel")
    if channel not in CHANNELS:
        raise ValueError(
            f"{path.as_posix()}: channel must be one of {', '.join(sorted(CHANNELS))}, got {channel!r}"
        )

    title = " ".join(str(manifest.get("title") or "").split())
    summary = " ".join(str(manifest.get("summary") or "").split())
    if len(title) < MIN_TITLE_CHARS:
        raise ValueError(f"{path.as_posix()}: title is too short to say anything ({title!r})")
    if len(summary) < MIN_SUMMARY_CHARS or _words(summary) < MIN_SUMMARY_WORDS:
        raise ValueError(
            f"{path.as_posix()}: summary must be a plain-language sentence of at least "
            f"{MIN_SUMMARY_CHARS} characters and {MIN_SUMMARY_WORDS} words, got {summary!r}"
        )

    issues = manifest.get("issues")
    if not isinstance(issues, list) or not issues:
        raise ValueError(f"{path.as_posix()}: lists no issues")

    missing = [issue for issue in issues if not fragment_path(root, vantare_dir, str(issue)).is_file()]
    if missing:
        raise ValueError(f"Missing changelog fragments for: {', '.join(str(item) for item in missing)}")

    fragments = load_fragment_files(
        [fragment_path(root, vantare_dir, str(issue)).as_posix() for issue in issues]
    )
    return manifest, fragments


def _bullets(items: Sequence[str]) -> list[str]:
    return [f"- {' '.join(str(item).split())}" for item in items if str(item).strip()]


def _dedupe(items: Sequence[str]) -> list[str]:
    """Drop repeats while keeping the first occurrence.

    Two issues in the same cut often share a testing step verbatim; printing it
    twice makes the list look longer than the work.
    """
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        normalized = " ".join(str(item).split())
        key = normalized.casefold()
        if not normalized or key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


def render_markdown(
    manifest: dict[str, Any],
    fragments: Sequence[dict[str, Any]],
    *,
    revision: str = "",
) -> str:
    """Build the release body: plain language first, technical detail collapsed."""
    # Newest first, so the work being announced leads even when the cut carries
    # fragments that have been sitting in the branch for a while.
    ordered = sorted(fragments, key=_fragment_order, reverse=True)
    tag = str(manifest["tag"]).strip()
    channel = str(manifest["channel"])

    parts: list[str] = [
        f"**{_headline(manifest)}**",
        " ".join(str(manifest["summary"]).split()),
    ]

    for kind, heading in SECTIONS:
        summaries = _dedupe([item["summary"] for item in ordered if item["type"] == kind])
        if summaries:
            parts.append(f"## {heading}\n" + "\n".join(_bullets(summaries)))

    testing = _dedupe([step for item in ordered for step in item["testing"]])
    if testing:
        parts.append("## Para testers\n" + "\n".join(_bullets(testing)))

    limitations = _dedupe([note for item in ordered for note in item["knownLimitations"]])
    parts.append(
        "## Limitaciones conocidas\n" + "\n".join(_bullets(limitations or [NO_LIMITATIONS]))
    )

    # Technical notes stay behind a fold: they are the reason a tester can tell
    # a regression from an intended change, and noise for everybody else.
    # GitHub collapses <details>, and the app's renderer skips raw HTML blocks,
    # so neither audience has to scroll past them.
    technical: list[str] = []
    for item in ordered:
        notes = _dedupe(item["technicalNotes"])
        if notes:
            technical.append(f"**{item['issue']}**\n" + "\n".join(_bullets(notes)))
    if technical:
        parts.append(
            "<details>\n<summary>Notas técnicas</summary>\n\n"
            + "\n\n".join(technical)
            + "\n\n</details>"
        )

    footer = f"Canal {CHANNELS[channel]} · `{tag}`"
    if revision.strip():
        footer += f" · revisión `{revision.strip()[:12]}`"
    parts.append("---\n\n" + footer)

    return "\n\n".join(parts).strip() + "\n"


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", required=True, help="Release tag, e.g. v0.1.0.7-nightly.12")
    parser.add_argument("--root", default=".", help="Repository root (default: current directory)")
    parser.add_argument("--vantare-dir", default="vantare-v2", help="Product directory inside the repo")
    parser.add_argument("--revision", default="", help="Commit revision to stamp in the footer")
    parser.add_argument("--output", help="Write the body here instead of stdout")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Only validate the manifest and its fragments; write nothing",
    )
    parser.add_argument("--json", action="store_true", help="Emit {tag, title, summary, body} instead of Markdown")
    args = parser.parse_args(argv)

    root = pathlib.Path(args.root)
    try:
        manifest, fragments = load_release(args.tag, root, args.vantare_dir)
    except ValueError as error:
        # ::error:: makes it land on the run summary instead of only in the log.
        print(f"::error::{error}", file=sys.stderr)
        return 1

    if args.check:
        print(f"{args.tag}: manifest and {len(fragments)} changelog fragment(s) OK")
        return 0

    body = render_markdown(manifest, fragments, revision=args.revision)
    payload = body
    if args.json:
        payload = json.dumps(
            {
                "tag": str(manifest["tag"]).strip(),
                "channel": str(manifest["channel"]),
                "title": _headline(manifest),
                "summary": " ".join(str(manifest["summary"]).split()),
                "body": body,
            },
            ensure_ascii=False,
            indent=2,
        )

    if args.output:
        pathlib.Path(args.output).write_text(payload, encoding="utf-8")
    else:
        # The body is Spanish prose with arrows and accents; a Windows console
        # defaulting to cp1252 would abort mid-write.
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")
        sys.stdout.write(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
