import importlib.util
import json
import pathlib
import re
import tempfile
import unittest
import urllib.error


MODULE_PATH = pathlib.Path(__file__).parents[1] / "discord_communications.py"
SPEC = importlib.util.spec_from_file_location("discord_communications", MODULE_PATH)
communications = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(communications)


def fragment(issue="ISA-95", summary="Mensajes fiables"):
    return {
        "schemaVersion": 1,
        "issue": issue,
        "type": "fix",
        "summary": summary,
        "technicalNotes": ["El workflow solo escucha develop."],
        "testing": ["Confirmar que el mensaje llega una vez."],
        "knownLimitations": ["Validación manual pendiente."],
    }


def tc_fragment():
    return fragment("TC-0123456789AB", "Corrección automática verificada")


class FragmentTests(unittest.TestCase):
    def test_tc_fragment_is_accepted_without_an_isa_id(self):
        self.assertEqual(
            communications.validate_fragment(tc_fragment())["issue"],
            "TC-0123456789AB",
        )

    def test_tc_fragment_requires_exact_uppercase_hex12(self):
        for issue in ("TC-0123456789ab", "TC-123", "TC-G123456789AB"):
            with self.subTest(issue=issue), self.assertRaises(ValueError):
                communications.validate_fragment(fragment(issue))

    def test_mixed_tc_and_isa_fragments_have_stable_family_order(self):
        values = [
            fragment("ISA-304", "ISA nueva"),
            fragment("TC-ABCDEFABCDEF", "Automática sin dígitos"),
            fragment("ISA-95", "ISA antigua"),
            fragment("TC-0123456789AB", "Automática con dígitos"),
        ]
        ordered = sorted(values, key=communications._fragment_order, reverse=True)
        self.assertEqual(
            [item["issue"] for item in ordered],
            ["TC-ABCDEFABCDEF", "TC-0123456789AB", "ISA-304", "ISA-95"],
        )

    def test_validate_fragment_rejects_missing_required_field(self):
        value = fragment()
        del value["testing"]
        with self.assertRaisesRegex(ValueError, "testing"):
            communications.validate_fragment(value, "missing.json")

    def test_load_fragments_is_sorted_and_rejects_duplicate_issue(self):
        values = [fragment("ISA-2", "Segundo"), fragment("ISA-1", "Primero")]
        loaded = communications.load_fragments(values)
        self.assertEqual([item["issue"] for item in loaded], ["ISA-1", "ISA-2"])
        with self.assertRaisesRegex(ValueError, "duplicate issue"):
            communications.load_fragments([fragment(), fragment()])

    def test_render_testers_contains_four_professional_sections_without_raw_url(self):
        payload = communications.render_testers([fragment()], "abc1234")
        embed = payload["embeds"][0]
        fields = {field["name"]: field["value"] for field in embed["fields"]}
        self.assertEqual(embed["title"], "Vantare — candidata para testers")
        self.assertIn("Resumen", fields)
        self.assertIn("Notas técnicas", fields)
        self.assertIn("Qué comprobar", fields)
        self.assertIn("Limitaciones conocidas", fields)
        self.assertNotIn("https://github.com", str(payload))
        self.assertEqual(payload["allowed_mentions"], {"parse": []})

    def test_testers_html_is_branded_and_contains_release_candidate_content(self):
        output = communications.render_testers_html([fragment()], "abc1234")
        self.assertIn("VANTARE", output)
        self.assertIn("ACTUALIZACIÓN PARA TESTERS", output)
        self.assertIn("Mensajes fiables", output)
        self.assertIn("QUÉ DEBES PROBAR", output)
        self.assertIn("LIMITACIONES", output)
        self.assertNotIn("briefing", output.casefold())
        self.assertNotIn("Sin información adicional", output)

    def test_testers_payload_can_reference_its_visual_card(self):
        payload = communications.render_testers([fragment()], "abc1234", include_image=True)
        self.assertEqual(payload["embeds"][0]["image"]["url"], "attachment://vantare-testers.png")

    def test_semantic_dedup_ignores_json_formatting_only_changes(self):
        current = fragment()
        previous = json.loads(json.dumps(current, indent=4))
        self.assertFalse(communications.fragment_changed(current, previous))
        previous["summary"] = "Resumen anterior"
        self.assertTrue(communications.fragment_changed(current, previous))

    def test_tester_embed_fields_respect_discord_limits(self):
        values = []
        for index in range(8):
            item = fragment(f"ISA-{index + 1}", "S" * 300)
            item["technicalNotes"] = ["T" * 500]
            item["testing"] = ["P" * 500]
            item["knownLimitations"] = ["L" * 500]
            values.append(item)
        payload = communications.render_testers(values, "abc1234")
        self.assertTrue(all(len(field["value"]) <= 1024 for field in payload["embeds"][0]["fields"]))


class DevelopmentDigestSourceTests(unittest.TestCase):
    """The digest falls back roadmap -> open milestones -> honest silence."""

    def _roadmap(self, payload):
        path = pathlib.Path(tempfile.mkdtemp()) / "roadmap.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def _absent(self):
        return pathlib.Path(tempfile.mkdtemp()) / "absent.json"

    def test_public_text_neutralizes_discord_mass_mentions(self):
        value = communications.sanitize_public_text("@everyone avance @here")
        self.assertNotIn("@everyone", value)
        self.assertNotIn("@here", value)

    def test_roadmap_wins_and_tolerates_percentages_and_wrappers(self):
        path = self._roadmap({"phases": [
            {"title": "Telemetry Core", "status": "in_progress", "progress": 42,
             "summary": "Contrato canonico en curso.", "url": "https://example.test/1"},
            {"name": "Ya hecho", "state": "done", "progress": 1.0},
        ]})
        projects, source = communications.resolve_development_projects(roadmap_path=path)
        self.assertEqual(source, communications.DEVELOPMENT_SOURCE_ROADMAP)
        self.assertEqual([item["name"] for item in projects], ["Telemetry Core"])
        self.assertAlmostEqual(projects[0]["progress"], 0.42)

    def test_localized_fields_are_read_in_spanish(self):
        path = self._roadmap({"phases": [{
            "title": {"en": "Public beta", "es": "Beta publica"},
            "summary": {"en": "Ships soon.", "es": "Sale pronto."},
            "status": "in-progress",
        }]})
        projects, _ = communications.resolve_development_projects(roadmap_path=path)
        self.assertEqual(projects[0]["name"], "Beta publica")
        self.assertEqual(projects[0]["update"], "Sale pronto.")

    def test_the_real_roadmap_file_still_feeds_the_digest(self):
        """Guards against ISA-378's schema drifting away from this reader."""
        path = (pathlib.Path(__file__).parents[3]
                / "vantare-v2/docs/roadmap/roadmap.json")
        if not path.is_file():
            self.skipTest("roadmap.json not in this checkout")
        projects = communications.load_roadmap_projects(path)
        self.assertTrue(projects, "the real roadmap.json yields no active phase")
        for project in projects:
            self.assertTrue(project["name"].strip())
            self.assertNotIn("{", project["name"])  # a locale map leaked through
            self.assertTrue(0.0 <= project["progress"] <= 1.0)
            self.assertTrue(project["update"].strip())

    def test_phase_label_prefixes_the_name_without_duplicating_it(self):
        path = self._roadmap({"phases": [
            {"phaseLabel": {"es": "Fase 2"}, "title": {"es": "Pulido beta"}, "status": "in-progress"},
            {"phaseLabel": "Fase 3", "title": "Fase 3 ya rotulada", "status": "in-progress"},
        ]})
        projects, _ = communications.resolve_development_projects(roadmap_path=path)
        self.assertEqual(projects[0]["name"], "Fase 2 \u00b7 Pulido beta")
        self.assertEqual(projects[1]["name"], "Fase 3 ya rotulada")

    def test_only_in_progress_phases_reach_the_digest(self):
        path = self._roadmap({"phases": [
            {"title": "Hecha", "status": "done"},
            {"title": "En curso", "status": "in-progress"},
            {"title": "Planeada", "status": "planned"},
            {"title": "Futura", "status": "future"},
        ]})
        projects, _ = communications.resolve_development_projects(roadmap_path=path)
        self.assertEqual([item["name"] for item in projects], ["En curso"])

    def test_roadmap_accepts_a_bare_list_and_done_over_total_progress(self):
        path = self._roadmap([{"label": "Billing", "progress": {"done": 3, "total": 4}}])
        projects, source = communications.resolve_development_projects(roadmap_path=path)
        self.assertEqual(source, communications.DEVELOPMENT_SOURCE_ROADMAP)
        self.assertAlmostEqual(projects[0]["progress"], 0.75)
        self.assertIn("Desarrollo en curso", projects[0]["update"])

    def test_unreadable_or_absent_roadmap_falls_through_instead_of_failing(self):
        broken = self._roadmap([])
        broken.write_text("{not json", encoding="utf-8")
        for path in (self._absent(), broken):
            with self.subTest(path=path.name):
                self.assertEqual(communications.load_roadmap_projects(path), [])

    def test_milestones_are_the_second_source_with_closed_over_total_progress(self):
        milestones = [{"title": "Overlay Studio V3", "state": "open", "description": "Paridad visual.",
                       "closed_issues": 2, "open_issues": 8, "html_url": "https://example.test/m/1",
                       "updated_at": "2026-08-01T00:00:00Z"}]

        class _Response:
            status = 200

            def read(self):
                return json.dumps(milestones).encode("utf-8")

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

        projects, source = communications.resolve_development_projects(
            roadmap_path=self._absent(), token="t", repository="owner/repo",
            opener=lambda *args, **kwargs: _Response(),
        )
        self.assertEqual(source, communications.DEVELOPMENT_SOURCE_MILESTONES)
        self.assertAlmostEqual(projects[0]["progress"], 0.2)
        self.assertEqual(projects[0]["url"], "https://example.test/m/1")

    def test_a_failing_milestone_lookup_degrades_to_no_news(self):
        def _boom(*args, **kwargs):
            raise urllib.error.URLError("offline")

        projects, source = communications.resolve_development_projects(
            roadmap_path=self._absent(), token="t", repository="owner/repo", opener=_boom,
        )
        self.assertEqual((projects, source), ([], communications.DEVELOPMENT_SOURCE_NONE))

    def test_no_source_at_all_still_renders_the_honest_embed(self):
        payload = communications.render_development([])
        self.assertIn("No hay actualizaciones", payload["embeds"][0]["description"])

    def test_the_digest_never_mentions_the_retired_tracker(self):
        projects = [{"name": "Telemetry Core", "url": "https://example.test/m/1", "progress": 0.42,
                     "update": "Contrato canonico en curso.", "updatedAt": "2026-07-15T10:00:00Z"}]
        rendered = (str(communications.render_development(projects))
                    + communications.render_development_html(projects)).casefold()
        self.assertNotIn("linear.app", rendered)
        self.assertNotIn("desde linear", rendered)

    def test_project_digest_stays_inside_discord_limit(self):
        projects = [{"name": f"Project {index}", "url": "https://example.test/m/x", "progress": 0.5,
                     "update": "x" * 2000} for index in range(10)]
        payload = communications.render_development(projects)
        self.assertLessEqual(len(payload["embeds"][0]["fields"]), 3)
        self.assertLessEqual(sum(len(field["value"]) for field in payload["embeds"][0]["fields"]), 3072)

    def test_development_embed_hides_raw_urls_and_uses_attachment(self):
        projects = [{"name": "Telemetry Core", "url": "https://example.test/m/1", "progress": 0.42,
                     "update": "Contrato canonico en curso.", "updatedAt": "2026-07-15T10:00:00Z"}]
        payload = communications.render_development(projects, include_image=True)
        embed = payload["embeds"][0]
        self.assertEqual(embed["image"]["url"], "attachment://vantare-development.png")
        self.assertNotIn("<https://", str(payload))
        self.assertIn("[Abrir proyecto](https://example.test/m/1)", embed["fields"][0]["value"])

    def test_development_html_uses_vantare_brand_and_escapes_source_text(self):
        projects = [{"name": "Overlay <Studio>", "url": "https://example.test/m/2", "progress": 0.08,
                     "update": "Paridad & revision", "updatedAt": "2026-07-15T10:00:00Z"}]
        output = communications.render_development_html(projects)
        # The eyebrow and footer are uppercased by CSS now, so the markup
        # carries the sentence-case source text.
        self.assertIn("Vantare", output)
        self.assertIn("Estado de desarrollo", output)
        self.assertIn("Overlay &lt;Studio&gt;", output)
        self.assertIn("Paridad &amp; revision", output)
        self.assertNotIn("Overlay <Studio>", output)
        self.assertNotIn("Development pulse", output)
        self.assertNotIn("BUILDING IN PUBLIC", output)

    def test_development_html_does_not_add_empty_placeholder_projects(self):
        projects = [{"name": "Overlay Studio", "url": "https://example.test/m/2", "progress": 0.08,
                     "update": "Paridad visual en curso.", "updatedAt": "2026-07-15T10:00:00Z"}]
        output = communications.render_development_html(projects)
        self.assertNotIn("Proximo proyecto", output)
        self.assertNotIn("DISPONIBLE", output)


class ReleaseAndBuildTests(unittest.TestCase):
    def test_nightly_and_testers_have_distinct_contracts(self):
        nightly = communications.render_channel_update([fragment()], "abc1234", "nightly", include_image=True)
        testers = communications.render_channel_update([fragment()], "abc1234", "testers", include_image=True)
        self.assertIn("Nightly", nightly["embeds"][0]["title"])
        self.assertIn("testers", testers["embeds"][0]["title"])
        self.assertEqual(nightly["embeds"][0]["image"]["url"], "attachment://vantare-nightly.png")
        self.assertEqual(testers["embeds"][0]["image"]["url"], "attachment://vantare-testers.png")

    def test_visual_card_aggregates_every_fragment(self):
        output = communications.render_channel_update_html(
            [fragment("ISA-95", "Discord fiable"), fragment("ISA-257", "Perfil desbloqueado")],
            "abc1234", "nightly"
        )
        self.assertIn("ISA-95", output)
        self.assertIn("ISA-257", output)
        self.assertIn("Discord fiable", output)
        self.assertIn("Perfil desbloqueado", output)

    def test_fragment_may_truthfully_have_no_known_limitations(self):
        value = fragment()
        value["knownLimitations"] = []
        communications.validate_fragment(value)
        payload = communications.render_channel_update([value], "abc1234", "nightly")
        self.assertIn("No hay limitaciones conocidas", str(payload))

    def test_release_html_presents_public_version_and_changelog(self):
        output = communications.render_release_html(
            "v1.2.3",
            "Resumen de la versión.\n\n**Nuevo**\n- Perfiles rápidos en Launcher.\n\n**Mejorado**\n- El canvas responde mejor al redimensionar.\n\n**Corregido**\n- Los iconos vuelven a mostrarse.",
            "abc1234",
        )
        self.assertIn("NUEVA VERSIÓN", output)
        self.assertIn("v1.2.3", output)
        self.assertIn("Perfiles rápidos en Launcher", output)
        self.assertIn("El canvas responde mejor", output)
        self.assertIn("Los iconos vuelven a mostrarse", output)
        self.assertIn("VERSIÓN ESTABLE", output)
        self.assertNotIn(">Changelog<", output)
        self.assertNotIn("Incluido en esta versión", output)

    def test_release_html_preserves_long_changelog_copy_across_the_card(self):
        change = (
            "El backend actualiza la lista de perfiles tras crear, copiar o eliminar "
            "un perfil para que el usuario vea el resultado sin recargar la aplicación."
        )
        output = communications.render_release_html(
            "v1.2.3", f"**Corregido**\n- {change}", "abc1234"
        )
        heading, body = communications._split_visual_copy(change)
        self.assertEqual(f"{heading} {body}".strip(), change)
        self.assertIn("El backend actualiza la lista de perfiles tras crear", output)
        self.assertIn("un perfil para que el usuario vea el resultado", output)
        self.assertNotIn("…", output)

    def test_release_payload_is_accessible_and_references_visual_card(self):
        payload = communications.render_release(
            "v1.2.3", "### Novedades\n- Nuevo launcher", "abc1234", "https://example.test/release", include_image=True
        )
        embed = payload["embeds"][0]
        self.assertEqual(embed["image"]["url"], "attachment://vantare-release.png")
        self.assertIn("Nuevo launcher", str(payload))
        self.assertIn("[Ver lanzamiento]", str(payload))

    def test_build_html_presents_download_and_verification_context(self):
        output = communications.render_build_html(
            "v1.2.3-beta.1", "Validar Launcher y Overlay Studio", "a" * 64
        )
        self.assertIn("CHANGELOG TÉCNICO", output)
        self.assertIn("v1.2.3-beta.1", output)
        self.assertIn("Validar Launcher", output)
        self.assertIn("SHA-256 VERIFICADO", output)
        self.assertIn("CHANGELOG TÉCNICO", output)
        self.assertNotIn("Public preview", output)

    def test_all_customer_facing_cards_avoid_internal_or_placeholder_copy(self):
        outputs = [
            communications.render_testers_html([fragment()], "abc1234"),
            communications.render_release_html("v1.2.3", "**Corregido**\n- El login vuelve a abrirse correctamente.", "abc1234"),
            communications.render_build_html("v1.2.3-beta.1", "Validar el inicio de sesión.", "a" * 64),
            communications.render_development_html([{"name": "Launcher", "progress": 0.5, "update": "Mejora de iconos en curso."}]),
        ]
        forbidden = ("sin información adicional", "próximo proyecto", "public preview", "tester briefing", "building in public")
        for output in outputs:
            normalized = output.casefold()
            for phrase in forbidden:
                self.assertNotIn(phrase, normalized)

    def test_build_payload_keeps_download_link_and_visual_card(self):
        payload = communications.render_build(
            "v1.2.3-beta.1",
            "Validar Launcher",
            "https://example.test/download",
            "a" * 64,
            "https://example.test/release",
            "https://example.test/issues",
            include_image=True,
        )
        embed = payload["embeds"][0]
        self.assertEqual(embed["image"]["url"], "attachment://vantare-changelog.png")
        self.assertIn("[Descargar build]", str(payload))


class SafetyTests(unittest.TestCase):
    def test_validate_channel_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError, "actual=wrong expected=expected"):
            communications.assert_channel({"channel_id": "wrong"}, "expected")

    def test_validate_channel_requires_expected_destination(self):
        with self.assertRaisesRegex(RuntimeError, "required"):
            communications.assert_channel({"channel_id": "123"}, "")

    def test_send_dry_run_never_calls_network(self):
        called = False

        def opener(*args, **kwargs):
            nonlocal called
            called = True
            raise AssertionError("network called")

        communications.publish("secret", {"content": "ok"}, "123", dry_run=True, opener=opener)
        self.assertFalse(called)

    def test_live_publish_identifies_metadata_and_post_requests(self):
        requests = []

        class Response:
            status = 204
            def __init__(self, body=b""):
                self.body = body
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self):
                return self.body

        def opener(request, timeout):
            requests.append(request)
            if request.get_method() == "GET":
                return Response(b'{"channel_id":"123"}')
            return Response()

        communications.publish("https://discord.test/webhook", {"content": "ok"}, "123", opener=opener)
        self.assertEqual([request.get_method() for request in requests], ["GET", "POST"])
        self.assertTrue(all(request.get_header("User-agent") == communications.USER_AGENT for request in requests))

    def test_live_publish_can_attach_generated_dashboard(self):
        requests = []

        class Response:
            status = 204
            def __init__(self, body=b""):
                self.body = body
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self):
                return self.body

        def opener(request, timeout):
            requests.append(request)
            if request.get_method() == "GET":
                return Response(b'{"channel_id":"123"}')
            return Response()

        image = pathlib.Path(self.id().replace(".", "-") + ".png")
        try:
            image.write_bytes(b"fake-png")
            payload = {"embeds": [{"image": {"url": "attachment://vantare-development.png"}}]}
            communications.publish("https://discord.test/webhook", payload, "123", attachment_path=image, opener=opener)
        finally:
            image.unlink(missing_ok=True)
        post = requests[-1]
        self.assertIn("multipart/form-data", post.get_header("Content-type"))
        self.assertIn(b"vantare-development.png", post.data)

    def test_live_publish_uses_the_requested_attachment_filename(self):
        requests = []

        class Response:
            status = 204
            def __init__(self, body=b""):
                self.body = body
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self):
                return self.body

        def opener(request, timeout):
            requests.append(request)
            if request.get_method() == "GET":
                return Response(b'{"channel_id":"123"}')
            return Response()

        image = pathlib.Path("vantare-release.png")
        try:
            image.write_bytes(b"fake-png")
            communications.publish(
                "https://discord.test/webhook",
                {"embeds": [{"image": {"url": "attachment://vantare-release.png"}}]},
                "123",
                attachment_path=image,
                opener=opener,
            )
        finally:
            image.unlink(missing_ok=True)
        self.assertIn(b"vantare-release.png", requests[-1].data)

    def test_workflow_routes_are_explicit_and_have_no_legacy_fallback(self):
        root = pathlib.Path(__file__).parents[3]
        tester = (root / ".github/workflows/discord-channel-update-v2.yml").read_text(encoding="utf-8")
        development = (root / ".github/workflows/discord-development-v2.yml").read_text(encoding="utf-8")
        release = (root / ".github/workflows/release.yml").read_text(encoding="utf-8")
        self.assertIn("nightly", tester)
        self.assertIn("testers", tester)
        self.assertNotIn("current-plan.md", tester)
        self.assertNotIn("LINEAR_API_KEY", development)
        self.assertNotIn("linear", development.casefold())
        self.assertIn("schedule:", development)
        self.assertIn("google-chrome", development)
        self.assertIn("--image", development)
        self.assertIn("render-discord-card", tester)
        self.assertIn("Render Discord cards", release)
        self.assertIn("--prerelease", release)
        self.assertIn("(\\.[0-9]+)?-${PUBLISH_CHANNEL}", release)
        self.assertIn("origin/master", release)
        self.assertNotIn("secrets.DISCORD_WEBHOOK_URL", tester + development + release)


class ChannelUpdateOverflowTests(unittest.TestCase):
    """Fragments accumulate forever, so the message always outgrows Discord."""

    @staticmethod
    def _many(count):
        return [
            fragment(issue=f"ISA-{index}", summary=f"Cambio numero {index} " + "detalle " * 12)
            for index in range(1, count + 1)
        ]

    def _fields(self, payload, name):
        return [f for f in payload["embeds"][0]["fields"] if f["name"].startswith(name)]

    def test_newest_issues_lead_the_summary(self):
        payload = communications.render_channel_update(self._many(40), "abc1234", "nightly")
        summary = "\n".join(f["value"] for f in self._fields(payload, "Resumen"))
        self.assertIn("ISA-40", summary)
        self.assertLess(summary.index("ISA-40"), summary.index("ISA-39"))

    def test_overflow_is_declared_rather_than_dropped(self):
        payload = communications.render_channel_update(self._many(40), "abc1234", "nightly")
        summary = "\n".join(f["value"] for f in self._fields(payload, "Resumen"))
        self.assertRegex(summary, r"…y \d+ más")

    def test_every_field_respects_the_discord_limit(self):
        payload = communications.render_channel_update(self._many(40), "abc1234", "nightly")
        for field in payload["embeds"][0]["fields"]:
            self.assertLessEqual(len(field["value"]), communications.EMBED_FIELD_LIMIT)

    def test_message_stays_within_the_six_thousand_character_budget(self):
        payload = communications.render_channel_update(self._many(80), "abc1234", "nightly")
        embed = payload["embeds"][0]
        total = len(embed["title"]) + len(embed["description"]) + len(embed["footer"]["text"])
        total += sum(len(f["name"]) + len(f["value"]) for f in embed["fields"])
        self.assertLess(total, 6000)

    def test_bullets_are_never_cut_mid_sentence(self):
        payload = communications.render_channel_update(self._many(40), "abc1234", "nightly")
        for field in payload["embeds"][0]["fields"]:
            for line in field["value"].split("\n"):
                if line.endswith("…"):
                    self.assertTrue(line.startswith("- …y "), line)

    def test_a_short_cut_keeps_every_entry(self):
        payload = communications.render_channel_update(self._many(3), "abc1234", "nightly")
        summary = "\n".join(f["value"] for f in self._fields(payload, "Resumen"))
        for issue in ("ISA-1", "ISA-2", "ISA-3"):
            self.assertIn(issue, summary)
        self.assertNotIn("más, en el changelog", summary)


class OrbitSkinTests(unittest.TestCase):
    """The card must keep speaking the hub's visual language, not its own."""

    TOKENS_CSS = (pathlib.Path(__file__).parents[3]
                  / "vantare-v2/frontend/src/styles/orbit.tokens.css")

    def _outputs(self):
        return {
            "channel": communications.render_channel_update_html(
                [fragment()], "abc1234", "nightly", manifest=manifest()),
            "development": communications.render_development_html(
                [{"name": "Overlay Studio", "url": "", "progress": 0.4,
                  "update": "Paridad visual en curso.", "updatedAt": "2026-07-15T10:00:00Z"}]),
        }

    def test_no_invented_palette_survives(self):
        for name, output in self._outputs().items():
            with self.subTest(card=name):
                # #ff3b3b was never a Vantare colour, and Courier is not the
                # hub's mono face.
                self.assertNotIn("#ff3b3b", output.lower())
                self.assertNotIn("courier", output.lower())

    def test_cards_use_the_real_orbit_tokens(self):
        for name, output in self._outputs().items():
            with self.subTest(card=name):
                self.assertIn("--orbit-carmine:#d52f49", output)
                self.assertIn("--orbit-canvas:#08090b", output)
                self.assertIn("Cascadia Code", output)
                self.assertIn("var(--orbit-radius-featured)", output)
                self.assertIn("var(--orbit-shadow-featured)", output)

    @unittest.skipUnless(TOKENS_CSS.is_file(), "frontend tokens not in this checkout")
    def test_token_values_match_the_frontend_stylesheet(self):
        source = self.TOKENS_CSS.read_text(encoding="utf-8")
        for token in ("--orbit-canvas", "--orbit-carmine", "--orbit-red",
                      "--orbit-ink", "--orbit-ink-2", "--orbit-wine"):
            expected = re.search(rf"{token}:\s*([^;]+);", source).group(1).strip()
            self.assertIn(f"{token}:{expected}", communications.ORBIT_TOKENS,
                          f"{token} drifted from orbit.tokens.css")

    def test_embed_stripe_uses_the_brand_carmine(self):
        payload = communications.render_channel_update(
            [fragment()], "abc1234", "nightly", manifest=manifest())
        self.assertEqual(payload["embeds"][0]["color"], 0xD52F49)

    def test_card_geometry_stays_within_the_discord_frame(self):
        for name, output in self._outputs().items():
            with self.subTest(card=name):
                self.assertIn("width:1200px;height:630px", output)


def manifest(title="Vantare — Command Orbit, única interfaz del Hub",
             summary="Esta Nightly retira la interfaz anterior del Hub."):
    return {"schemaVersion": 1, "tag": "v0.1.0.7-nightly.11", "channel": "nightly",
            "title": title, "summary": summary, "issues": ["ISA-95"]}


def _card_texts(output):
    """Return (label, heading, body) for each card in the rendered HTML."""
    pattern = re.compile(
        r'<span class="status"><i></i> ([^<]*)</span></div>\s*<h2>([^<]*)</h2><p>([^<]*)</p>')
    return [tuple(html_unescape(part) for part in match)
            for match in pattern.findall(output)]


def html_unescape(value):
    import html as _html
    return _html.unescape(value)


class ManifestCopyTests(unittest.TestCase):
    def test_lead_card_uses_manifest_title_without_brand_prefix(self):
        output = communications.render_channel_update_html(
            [fragment()], "abc1234", "nightly", manifest=manifest())
        label, heading, body = _card_texts(output)[0]
        self.assertEqual(label, "1 CAMBIO")
        self.assertEqual(heading, "Command Orbit, única interfaz del Hub")
        self.assertNotIn("ISA-95", heading)
        self.assertIn("retira la interfaz anterior", body)

    def test_without_manifest_the_previous_id_based_copy_is_kept(self):
        output = communications.render_channel_update_html(
            [fragment("ISA-95", "Discord fiable")], "abc1234", "nightly")
        _, heading, body = _card_texts(output)[0]
        self.assertEqual(heading, "ISA-95")
        self.assertIn("Discord fiable", body)

    def test_testing_card_splits_the_step_into_headline_and_body(self):
        value = fragment()
        value["testing"] = [
            "Abrir el Hub y recorrer todas las secciones: no debe quedar ningún rastro de la interfaz anterior.",
            "Cambiar de idioma en Ajustes y verificar que no hay claves sin traducir.",
        ]
        output = communications.render_channel_update_html(
            [value], "abc1234", "nightly", manifest=manifest())
        label, heading, body = _card_texts(output)[1]
        self.assertEqual(label, "QUÉ DEBES PROBAR")
        self.assertEqual(heading, "Abrir el Hub y recorrer todas las secciones")
        self.assertIn("No debe quedar ningún rastro", body)
        self.assertIn("Cambiar de idioma", body)

    def test_card_copy_never_exceeds_the_clamp_budget(self):
        value = fragment()
        value["testing"] = ["Comprobar la paleta de comandos " + "y también cada atajo registrado " * 20]
        value["knownLimitations"] = ["Solo se valida en Windows " + "con la build firmada " * 40]
        output = communications.render_channel_update_html(
            [value], "abc1234", "nightly", manifest=manifest())
        for _, heading, body in _card_texts(output):
            self.assertLessEqual(len(heading), communications.CARD_HEADING_LIMIT)
            self.assertLessEqual(len(body), communications.CARD_BODY_LIMIT)
            self.assertFalse(body.endswith(" "), body)

    def test_aside_promoted_to_the_body_reads_as_a_plain_sentence(self):
        value = fragment()
        value["knownLimitations"] = [
            "Los pendientes de producto de la nightly.10 siguen vigentes "
            "(favoritos del Launcher, eventos múltiples de Estrategia, "
            "fuente de sesiones de Telemetría, registros en Diagnóstico)."
        ]
        output = communications.render_channel_update_html(
            [value], "abc1234", "nightly", manifest=manifest())
        _, heading, body = _card_texts(output)[2]
        self.assertEqual(heading, "Los pendientes de producto de la nightly.10 siguen vigentes")
        self.assertEqual(
            body,
            "Favoritos del Launcher, eventos múltiples de Estrategia, "
            "fuente de sesiones de Telemetría, registros en Diagnóstico.",
        )
        self.assertNotIn("(", body)
        self.assertNotIn(")", body)
        self.assertFalse(body.endswith(".."), body)

    def test_unwrap_parenthetical_handles_nesting_and_stray_brackets(self):
        self.assertEqual(
            communications._unwrap_parenthetical("(uno (dos) tres) resto."),
            "uno (dos) tres resto.",
        )
        self.assertEqual(communications._unwrap_parenthetical("(sin cierre"), "sin cierre")
        self.assertEqual(communications._unwrap_parenthetical("(solo esto)"), "solo esto")
        self.assertEqual(communications._unwrap_parenthetical("(ya con punto.)."), "ya con punto.")
        self.assertEqual(communications._unwrap_parenthetical("texto normal"), "texto normal")

    def test_missing_limitations_still_state_it_honestly(self):
        value = fragment()
        value["knownLimitations"] = []
        output = communications.render_channel_update_html(
            [value], "abc1234", "nightly", manifest=manifest())
        _, heading, body = _card_texts(output)[2]
        self.assertEqual(heading, "Sin limitaciones conocidas")
        self.assertIn("gates automáticos", body)

    def test_embed_description_leads_with_the_manifest_copy(self):
        payload = communications.render_channel_update(
            [fragment()], "abc1234", "nightly", manifest=manifest())
        embed = payload["embeds"][0]
        self.assertIn("Command Orbit, única interfaz del Hub", embed["description"])
        self.assertIn("retira la interfaz anterior", embed["description"])
        self.assertIn("abc1234", embed["description"])
        summary = next(f for f in embed["fields"] if f["name"] == "Resumen")
        self.assertIn("**ISA-95**", summary["value"])

    def test_embed_without_manifest_is_unchanged(self):
        payload = communications.render_channel_update([fragment()], "abc1234", "nightly")
        self.assertNotIn("Command Orbit", payload["embeds"][0]["description"])

    def test_load_manifest_rejects_an_incomplete_file(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "bad.json"
            path.write_text(json.dumps({"tag": "v1", "title": ""}), encoding="utf-8")
            with self.assertRaises(ValueError):
                communications.load_manifest(str(path))

    def test_fit_text_cuts_at_a_sentence_or_word_boundary(self):
        text = "Primera frase completa. Segunda frase que ya no cabe entera en el hueco."
        fitted = communications._fit_text(text, 40)
        self.assertEqual(fitted, "Primera frase completa.")
        word = communications._fit_text("palabra " * 20, 30)
        self.assertTrue(word.endswith("…"))
        self.assertFalse(word[:-1].endswith(" "))


if __name__ == "__main__":
    unittest.main()
