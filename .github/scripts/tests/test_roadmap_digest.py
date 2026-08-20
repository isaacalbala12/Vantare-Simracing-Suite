import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import roadmap_digest as digest

REPO_ROOT = Path(__file__).resolve().parents[3]

MINIMAL_PLAN = """
# Plan

## Fases

### Pulido beta

- id: beta
- estado: in-progress
- progreso: 75
- etiqueta: Fase 2
- etiqueta.en: Phase 2
- objetivo: v0.1.x
- titulo.en: Beta polish
- resumen: Un resumen.
- resumen.en: A summary.
- item: Primer punto
- item.en: First bullet
- item: Segundo punto

## Areas

### Telemetria

- id: telemetry
- estado: in-progress
- progreso: 25
- titulo.en: Telemetry
- proyectos: telemetry-core, telemetry-analysis

## Hitos

### Canales

- id: channels
- tipo: plan
- cuerpo: Tres canales.
- etiqueta: Plan
"""


class ParsePlanTest(unittest.TestCase):
    def test_reads_phases_areas_and_milestones(self):
        plan = digest.parse_plan(MINIMAL_PLAN)

        phase = plan["phases"][0]
        self.assertEqual(phase["id"], "beta")
        self.assertEqual(phase["status"], "in-progress")
        self.assertEqual(phase["progress"], 75)
        self.assertEqual(phase["title"]["es"], "Pulido beta")
        self.assertEqual(phase["title"]["en"], "Beta polish")
        # Sin traduccion declarada, el portugues se queda con el espanol.
        self.assertEqual(phase["title"]["pt"], "Pulido beta")
        self.assertEqual(phase["phaseLabel"]["en"], "Phase 2")
        self.assertEqual([h["es"] for h in phase["highlights"]], ["Primer punto", "Segundo punto"])
        self.assertEqual(phase["highlights"][0]["en"], "First bullet")

        area = plan["areas"][0]
        self.assertEqual(area["projects"], ["telemetry-core", "telemetry-analysis"])
        self.assertEqual(area["title"]["en"], "Telemetry")

        self.assertEqual(plan["milestones"][0]["type"], "plan")

    def test_prose_and_unknown_sections_are_ignored(self):
        plan = digest.parse_plan(MINIMAL_PLAN + "\n## Formato\n\n- clave: valor\n\nUna frase suelta.\n")
        self.assertEqual(len(plan["phases"]), 1)

    def test_rejects_unknown_field(self):
        with self.assertRaises(digest.DigestError):
            digest.parse_plan(MINIMAL_PLAN.replace("- objetivo: v0.1.x", "- inventado: v0.1.x"))

    def test_rejects_invalid_status(self):
        with self.assertRaises(digest.DigestError):
            digest.parse_plan(MINIMAL_PLAN.replace("- estado: in-progress\n- progreso: 75", "- estado: casi\n- progreso: 75"))

    def test_rejects_two_phases_in_progress(self):
        doubled = MINIMAL_PLAN + "\n### Otra\n\n- id: otra\n- estado: in-progress\n"
        with self.assertRaises(digest.DigestError):
            digest.parse_plan(doubled)

    def test_rejects_duplicate_id(self):
        doubled = MINIMAL_PLAN + "\n### Otra\n\n- id: beta\n- estado: planned\n"
        with self.assertRaises(digest.DigestError):
            digest.parse_plan(doubled)

    def test_rejects_translation_without_base(self):
        with self.assertRaises(digest.DigestError):
            digest.parse_plan(MINIMAL_PLAN.replace("- resumen: Un resumen.\n", ""))


class InterpretTest(unittest.TestCase):
    def test_conventional_commit_keeps_type_and_scope(self):
        entry = digest.interpret("perf(hub): launcher - primer escaneo 28% mas rapido (#291)")
        self.assertEqual(entry, {"kind": "perf", "scope": "hub", "text": "Launcher - primer escaneo 28% mas rapido"})

    def test_breaking_marker_is_kept(self):
        entry = digest.interpret("feat(api)!: nuevo contrato")
        self.assertTrue(entry["breaking"])

    def test_workshop_types_are_dropped(self):
        for subject in ("chore(deps): bump vite", "ci: cachear pnpm", "test(overlay): mas casos", "refactor(hub): extraer helper", "build: subir go"):
            self.assertIsNone(digest.interpret(subject), subject)

    def test_merges_reverts_and_promotions_are_dropped(self):
        for subject in ("Merge branch 'nightly'", "revert: feat(hub): algo", "promote: ISA-402 floating inspector to nightly", "fix(overlays): promote ISA-334 strip to nightly"):
            self.assertIsNone(digest.interpret(subject), subject)

    def test_issue_prefixed_commit_becomes_a_plain_change(self):
        entry = digest.interpret("ISA-368: canales de Actualizaciones clasifican stable/testers/nightly (#288)")
        self.assertEqual(entry["kind"], "change")
        self.assertEqual(entry["scope"], "")
        self.assertEqual(entry["text"], "Canales de Actualizaciones clasifican stable/testers/nightly")

    def test_trailing_issue_code_is_stripped(self):
        entry = digest.interpret("fix(relative): seleccionar vecinos fisicos 2+2 (ISA-365)")
        self.assertEqual(entry["text"], "Seleccionar vecinos fisicos 2+2")


class GroupAndMergeTest(unittest.TestCase):
    def test_groups_by_day_newest_first_and_dedupes(self):
        grouped = digest.group_by_day([
            {"sha": "a", "date": "2026-08-16", "subject": "feat(hub): uno"},
            {"sha": "b", "date": "2026-08-18", "subject": "fix(hub): dos"},
            {"sha": "c", "date": "2026-08-16", "subject": "feat(hub): uno"},
            {"sha": "d", "date": "2026-08-16", "subject": "chore: nada"},
        ])
        self.assertEqual([bucket["date"] for bucket in grouped], ["2026-08-18", "2026-08-16"])
        self.assertEqual(len(grouped[1]["entries"]), 1)

    def test_merge_keeps_history_and_caps_the_window(self):
        previous = [{"date": f"2026-07-{day:02d}", "entries": [{"kind": "feat", "scope": "", "text": f"viejo {day}"}]} for day in range(1, 26)]
        fresh = [{"date": "2026-08-01", "entries": [{"kind": "fix", "scope": "hub", "text": "nuevo"}]}]
        merged = digest.merge_delivered(previous, fresh)
        self.assertEqual(len(merged), digest.MAX_DELIVERED_DAYS)
        self.assertEqual(merged[0]["date"], "2026-08-01")

    def test_merge_does_not_duplicate_an_already_published_entry(self):
        bucket = [{"date": "2026-08-01", "entries": [{"kind": "fix", "scope": "hub", "text": "uno"}]}]
        merged = digest.merge_delivered(bucket, bucket)
        self.assertEqual(len(merged[0]["entries"]), 1)


class DocumentTest(unittest.TestCase):
    def test_build_document_shape(self):
        document = digest.build_document(digest.parse_plan(MINIMAL_PLAN), [], "abc123", "2026-08-20T00:00:00Z")
        self.assertEqual(document["schemaVersion"], digest.SCHEMA_VERSION)
        self.assertEqual(document["digest"]["lastCommit"], "abc123")
        self.assertEqual(set(document["phases"][0]), {"id", "phaseLabel", "title", "status", "target", "progress", "summary", "highlights"})
        self.assertEqual(set(document["milestones"][0]), {"id", "type", "title", "body", "label"})

    def test_timestamp_does_not_count_as_a_change(self):
        plan = digest.parse_plan(MINIMAL_PLAN)
        first = digest.build_document(plan, [], "abc", "2026-08-20T00:00:00Z")
        second = digest.build_document(plan, [], "abc", "2026-08-21T00:00:00Z")
        self.assertNotEqual(first, second)
        self.assertEqual(digest.content_without_timestamp(first), digest.content_without_timestamp(second))


class CommittedArtefactTest(unittest.TestCase):
    """El artefacto del repo debe seguir siendo el que produce el plan del repo."""

    def test_committed_json_matches_the_committed_plan(self):
        plan_path = REPO_ROOT / "vantare-v2" / "docs" / "roadmap" / "plan.md"
        output_path = REPO_ROOT / "vantare-v2" / "docs" / "roadmap" / "roadmap.json"
        committed = json.loads(output_path.read_text(encoding="utf-8"))
        rebuilt = digest.build_document(
            digest.parse_plan(plan_path.read_text(encoding="utf-8")),
            committed["delivered"],
            committed["digest"]["lastCommit"],
            committed["generatedAt"],
        )
        self.assertEqual(committed, rebuilt)


if __name__ == "__main__":
    unittest.main()
