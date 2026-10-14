"""#1610: offline Plane projection and patch-note candidate. No network client.

Input is the human-reviewed, redacted Intake projection, not the raw report.
Identity/consent storage stays in Supabase; never export account or display name.
"""
from dataclasses import dataclass
import html
import re
from uuid import UUID


STATES = {"received", "reviewing", "accepted", "declined", "spam", "fixed"}


def identifier(value):
    if not isinstance(value, str) or str(UUID(value)) != value:
        raise ValueError("invalid identifier")
    return value


def reviewed_text(value, limit):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError("invalid reviewed text")
    # This is defense in depth; human redaction remains mandatory for prose/images.
    if re.search(r"[@\\\x00-\x1f]|https?://|\b(?:Bearer|Basic|sk-|account[_-]?id)\b|[A-Za-z]:/|\b\d{1,3}(?:\.\d{1,3}){3}\b", value, re.I):
        raise ValueError("private content in reviewed projection")
    return value.strip()


@dataclass(frozen=True)
class ReviewedReport:
    id: str
    summary: str
    state: str
    screenshots: tuple[str, ...] = ()
    posthog_id: str | None = None
    usage_consent: bool = False
    fixed_version: str | None = None
    credit: bool = False

    def validate(self):
        identifier(self.id)
        reviewed_text(self.summary, 200)
        if self.state not in STATES or len(self.screenshots) > 4:
            raise ValueError("invalid state/evidence")
        for screenshot in self.screenshots:
            identifier(screenshot)
        if len(set(self.screenshots)) != len(self.screenshots):
            raise ValueError("duplicate screenshot")
        if self.posthog_id is not None:
            identifier(self.posthog_id)
        if type(self.usage_consent) is not bool or type(self.credit) is not bool:
            raise ValueError("invalid consent")
        if self.fixed_version is not None and not re.fullmatch(r"\d+\.\d+\.\d+(?:\.\d+)?(?:-[a-z0-9.-]+)?", self.fixed_version):
            raise ValueError("invalid patch version")
        if (self.state == "fixed") != (self.fixed_version is not None):
            raise ValueError("fixed requires a version")


def plane_projection(report, posthog_project=None):
    """Closed mock payload. Screenshots are private evidence references, not signed URLs."""
    report.validate()
    link = None
    if report.usage_consent and report.posthog_id is not None:
        if not isinstance(posthog_project, int) or isinstance(posthog_project, bool) or posthog_project <= 0:
            raise ValueError("PostHog project required")
        link = f"https://eu.posthog.com/project/{posthog_project}/person/{report.posthog_id}"
    return {
        "external_id": report.id,
        "name": f"Informe {report.id[:8]}",
        "summary": report.summary,
        "state": report.state,
        "screenshots": [f"reports/{report.id}/screenshots/{item}" for item in report.screenshots],
        "posthog": link,
    }


class MockPlane:
    """Idempotent issue updates for tests. Intentionally no HTTP/credential path."""
    def __init__(self):
        self.issues = {}
        self.writes = 0

    def sync(self, report, posthog_project=None, enabled=False):
        if not enabled:
            return None
        payload = plane_projection(report, posthog_project)
        if self.issues.get(report.id) != payload:
            self.issues[report.id] = payload
            self.writes += 1
        return payload


def patch_notes(reports, version):
    """Review candidate only; no publication and no display-name lookup."""
    rows = []
    seen = set()
    for report in sorted(reports, key=lambda item: item.id):
        report.validate()
        if report.id in seen:
            raise ValueError("duplicate report")
        seen.add(report.id)
        if report.state == "fixed" and report.fixed_version == version:
            credit = f" Gracias al colaborador del informe {report.id[:8]}." if report.credit else ""
            # Render as HTML text to prevent arbitrary links/markup in review candidates.
            rows.append(f"<li>{html.escape(report.summary)}{credit}</li>")
    return "<ul>" + "".join(rows) + "</ul>" if rows else ""
