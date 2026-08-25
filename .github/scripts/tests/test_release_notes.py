import importlib.util
import json
import pathlib
import tempfile
import unittest


MODULE_PATH = pathlib.Path(__file__).parents[1] / "release_notes.py"
SPEC = importlib.util.spec_from_file_location("release_notes", MODULE_PATH)
release_notes = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release_notes)


TAG = "v0.1.0.7-nightly.12"
SUMMARY = (
    "Esta Nightly reordena los ajustes de actualizacion y explica en castellano "
    "llano que cambia en cada version antes de descargarla."
)


def manifest(**overrides):
    value = {
        "schemaVersion": 1,
        "tag": TAG,
        "channel": "nightly",
        "title": "Vantare — notas de version legibles",
        "summary": SUMMARY,
        "issues": ["ISA-1"],
    }
    value.update(overrides)
    return value


def fragment(issue="ISA-1", kind="feature", **overrides):
    value = {
        "schemaVersion": 1,
        "issue": issue,
        "type": kind,
        "summary": f"Resumen legible de {issue}.",
        "technicalNotes": [f"Nota tecnica de {issue}."],
        "testing": ["Abrir Ajustes y comprobar la seccion de actualizaciones."],
        "knownLimitations": [],
    }
    value.update(overrides)
    return value


def write_tree(root: pathlib.Path, manifest_value, fragments):
    releases = root / "vantare-v2" / "docs" / "releases"
    fragments_dir = root / "vantare-v2" / "docs" / "changelog" / "fragments"
    releases.mkdir(parents=True, exist_ok=True)
    fragments_dir.mkdir(parents=True, exist_ok=True)
    if manifest_value is not None:
        (releases / f"{manifest_value['tag']}.json").write_text(
            json.dumps(manifest_value, ensure_ascii=False), encoding="utf-8"
        )
    for item in fragments:
        (fragments_dir / f"{item['issue']}.json").write_text(
            json.dumps(item, ensure_ascii=False), encoding="utf-8"
        )
    return root


class TreeCase(unittest.TestCase):
    def build(self, manifest_value=None, fragments=None):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = pathlib.Path(directory.name)
        write_tree(
            root,
            manifest() if manifest_value is None else manifest_value,
            [fragment()] if fragments is None else fragments,
        )
        return root

    def load(self, root, tag=TAG):
        return release_notes.load_release(tag, root, "vantare-v2")


class GateTests(TreeCase):
    """The gate exists so a release cannot ship without notes somebody can read."""

    def test_missing_manifest_names_the_file_to_write(self):
        root = self.build(manifest_value=manifest(tag="v0.0.0.1-nightly.1"))
        with self.assertRaises(ValueError) as error:
            self.load(root)
        self.assertIn(f"docs/releases/{TAG}.json", str(error.exception))

    def test_missing_fragment_names_the_issue(self):
        root = self.build(manifest_value=manifest(issues=["ISA-1", "ISA-2"]))
        with self.assertRaises(ValueError) as error:
            self.load(root)
        self.assertIn("ISA-2", str(error.exception))

    def test_placeholder_summary_is_rejected(self):
        root = self.build(manifest_value=manifest(summary="Release v1"))
        with self.assertRaises(ValueError) as error:
            self.load(root)
        self.assertIn("summary", str(error.exception))

    def test_summary_of_a_single_long_word_is_rejected(self):
        root = self.build(manifest_value=manifest(summary="correcciones-" * 6))
        with self.assertRaises(ValueError):
            self.load(root)

    def test_manifest_tag_must_match_the_tag_being_released(self):
        root = self.build(manifest_value=manifest(tag=TAG))
        with self.assertRaises(ValueError) as error:
            release_notes.load_release("v0.1.0.7-nightly.13", root, "vantare-v2")
        self.assertIn("Missing release manifest", str(error.exception))

    def test_unknown_channel_is_rejected(self):
        root = self.build(manifest_value=manifest(channel="beta"))
        with self.assertRaises(ValueError) as error:
            self.load(root)
        self.assertIn("channel", str(error.exception))

    def test_empty_issue_list_is_rejected(self):
        root = self.build(manifest_value=manifest(issues=[]), fragments=[])
        with self.assertRaises(ValueError) as error:
            self.load(root)
        self.assertIn("no issues", str(error.exception))

    def test_a_fragment_without_testing_steps_is_rejected(self):
        root = self.build(fragments=[fragment(testing=[])])
        with self.assertRaises(ValueError) as error:
            self.load(root)
        self.assertIn("testing", str(error.exception))

    def test_check_mode_returns_zero_on_a_complete_release(self):
        root = self.build()
        code = release_notes.main(["--tag", TAG, "--root", str(root), "--check"])
        self.assertEqual(code, 0)

    def test_check_mode_returns_one_without_a_manifest(self):
        root = self.build(manifest_value=manifest(tag="v0.0.0.1-nightly.1"))
        code = release_notes.main(["--tag", TAG, "--root", str(root), "--check"])
        self.assertEqual(code, 1)


class RenderTests(TreeCase):
    def render(self, fragments, manifest_value=None, revision=""):
        return release_notes.render_markdown(
            manifest() if manifest_value is None else manifest_value,
            fragments,
            revision=revision,
        )

    def test_each_type_lands_under_its_plain_language_heading(self):
        body = self.render(
            [
                fragment("ISA-1", "feature", summary="Llega el modo nuevo."),
                fragment("ISA-2", "change", summary="El panel abre mas rapido."),
                fragment("ISA-3", "fix", summary="Ya no se pierde el perfil."),
                fragment("ISA-4", "security", summary="La credencial se borra al salir."),
            ]
        )
        for heading, sentence in (
            ("## Novedades", "Llega el modo nuevo."),
            ("## Mejorado", "El panel abre mas rapido."),
            ("## Corregido", "Ya no se pierde el perfil."),
            ("## Seguridad", "La credencial se borra al salir."),
        ):
            self.assertIn(heading, body)
            self.assertIn(f"- {sentence}", body)

    def test_headings_of_absent_types_are_not_printed(self):
        body = self.render([fragment("ISA-1", "fix")])
        self.assertNotIn("## Novedades", body)
        self.assertIn("## Corregido", body)

    def test_technical_notes_stay_behind_a_fold(self):
        body = self.render([fragment("ISA-1", technicalNotes=["El emisor deduplica por tag."])])
        fold = body.split("<details>", 1)[1]
        self.assertIn("El emisor deduplica por tag.", fold)
        self.assertNotIn("El emisor deduplica por tag.", body.split("<details>", 1)[0])

    def test_testing_steps_are_announced_for_testers(self):
        body = self.render([fragment("ISA-1", testing=["Reiniciar y comprobar el aviso."])])
        self.assertIn("## Para testers", body)
        self.assertIn("- Reiniciar y comprobar el aviso.", body)

    def test_a_repeated_step_is_printed_once(self):
        step = "Abrir Ajustes y comprobar la seccion de actualizaciones."
        body = self.render([fragment("ISA-1", testing=[step]), fragment("ISA-2", testing=[step])])
        self.assertEqual(body.count(f"- {step}"), 1)

    def test_no_limitations_is_stated_rather_than_left_blank(self):
        body = self.render([fragment("ISA-1")])
        self.assertIn(release_notes.NO_LIMITATIONS, body)

    def test_declared_limitations_replace_the_placeholder(self):
        body = self.render([fragment("ISA-1", knownLimitations=["La voz sigue tras flag."])])
        self.assertIn("- La voz sigue tras flag.", body)
        self.assertNotIn(release_notes.NO_LIMITATIONS, body)

    def test_the_newest_issue_leads_the_list(self):
        body = self.render(
            [
                fragment("ISA-9", summary="Cambio antiguo."),
                fragment("ISA-40", summary="Cambio reciente."),
            ]
        )
        self.assertLess(body.index("Cambio reciente."), body.index("Cambio antiguo."))

    def test_the_brand_prefix_is_dropped_and_the_sentence_starts_upright(self):
        body = self.render(
            [fragment("ISA-1")],
            manifest_value=manifest(title="Vantare — nucleo de telemetria completo"),
        )
        self.assertTrue(body.startswith("**Nucleo de telemetria completo**"))

    def test_a_lowercase_brand_name_survives_untouched(self):
        body = self.render(
            [fragment("ISA-1")],
            manifest_value=manifest(title="Vantare — iRacing entra en catalogo"),
        )
        self.assertTrue(body.startswith("**iRacing entra en catalogo**"))

    def test_the_footer_states_channel_tag_and_revision(self):
        body = self.render([fragment("ISA-1")], revision="8a90c3a7abcd1234567")
        self.assertIn("Canal Nightly", body)
        self.assertIn(f"`{TAG}`", body)
        self.assertIn("`8a90c3a7abcd`", body)

    def test_the_footer_omits_the_revision_when_there_is_none(self):
        self.assertNotIn("revisión", self.render([fragment("ISA-1")]))

    def test_the_body_starts_with_the_headline_and_the_summary(self):
        body = self.render([fragment("ISA-1")])
        head, lead = body.split("\n\n")[:2]
        self.assertTrue(head.startswith("**"))
        self.assertEqual(lead, SUMMARY)

    def test_the_rendered_body_is_written_to_the_requested_file(self):
        root = self.build()
        output = root / "changelog_body.md"
        code = release_notes.main(
            ["--tag", TAG, "--root", str(root), "--output", str(output)]
        )
        self.assertEqual(code, 0)
        self.assertIn("## Novedades", output.read_text(encoding="utf-8"))

    def test_json_mode_carries_the_body_and_its_plain_language_header(self):
        root = self.build()
        output = root / "notes.json"
        release_notes.main(
            ["--tag", TAG, "--root", str(root), "--output", str(output), "--json"]
        )
        payload = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(payload["tag"], TAG)
        self.assertEqual(payload["channel"], "nightly")
        self.assertEqual(payload["summary"], SUMMARY)
        self.assertIn("## Novedades", payload["body"])


class ShippedManifestTests(unittest.TestCase):
    """Every manifest already in the repo must survive the gate being added."""

    def test_every_published_manifest_still_renders(self):
        root = pathlib.Path(__file__).resolve().parents[3]
        releases = root / "vantare-v2" / "docs" / "releases"
        manifests = sorted(releases.glob("*.json"))
        self.assertTrue(manifests, "no release manifests found")
        for path in manifests:
            with self.subTest(manifest=path.name):
                value, fragments = release_notes.load_release(
                    path.stem, root, "vantare-v2"
                )
                body = release_notes.render_markdown(value, fragments)
                self.assertIn("## Limitaciones conocidas", body)


if __name__ == "__main__":
    unittest.main()
