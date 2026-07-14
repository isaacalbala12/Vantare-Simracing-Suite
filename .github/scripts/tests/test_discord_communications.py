import importlib.util
import json
import pathlib
import re
import unittest


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


class FragmentTests(unittest.TestCase):
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
        self.assertEqual(embed["title"], "Vantare — actualización para testers")
        self.assertIn("Resumen", fields)
        self.assertIn("Notas técnicas", fields)
        self.assertIn("Qué comprobar", fields)
        self.assertIn("Limitaciones conocidas", fields)
        self.assertNotIn("https://github.com", str(payload))
        self.assertEqual(payload["allowed_mentions"], {"parse": []})

    def test_testers_html_is_branded_and_contains_release_candidate_content(self):
        output = communications.render_testers_html([fragment()], "abc1234")
        self.assertIn("VANTARE", output)
        self.assertIn("BUILD CANDIDATA", output)
        self.assertIn("Mensajes fiables", output)
        self.assertIn("QUÉ COMPROBAR", output)

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


class LinearDigestTests(unittest.TestCase):
    def test_parse_public_update_requires_marker(self):
        private = "Estado interno que no debe salir"
        public = "<!-- discord:development -->\nAvanzamos en el parser."
        self.assertIsNone(communications.parse_public_update(private))
        self.assertEqual(communications.parse_public_update(public), "Avanzamos en el parser.")

    def test_public_update_neutralizes_discord_mass_mentions(self):
        value = communications.parse_public_update("<!-- discord:development -->\n@everyone avance")
        self.assertNotIn("@everyone", value)

    def test_active_projects_show_safe_metadata_but_hide_unapproved_text(self):
        projects = [
            {"name": "Billing", "url": "https://linear.app/p/1", "progress": 0.5,
             "summary": "Billing seguro", "status": {"type": "started"}, "projectUpdates": {"nodes": [{"body": "<!-- discord:development -->\nPolar en curso."}]}},
            {"name": "Privado", "url": "https://linear.app/p/2", "progress": 0.2,
             "summary": "Resumen público seguro", "status": {"type": "started"}, "projectUpdates": {"nodes": [{"body": "Notas internas"}]}},
            {"name": "Contenido", "url": "https://linear.app/p/content", "progress": 0.1,
             "summary": "", "status": {"type": "started"}, "projectUpdates": {"nodes": []}},
            {"name": "Terminado", "url": "https://linear.app/p/3", "progress": 1,
             "summary": "Finalizado", "status": {"type": "completed"}, "projectUpdates": {"nodes": [{"body": "<!-- discord:development -->\nListo"}]}},
        ]
        active = communications.select_public_projects(projects, {"Billing", "Privado"})
        self.assertEqual([item["name"] for item in active], ["Privado", "Billing"])
        self.assertIn("Desarrollo en curso", active[0]["update"])
        self.assertNotIn("Notas internas", str(active))

    def test_empty_project_digest_is_explicit(self):
        payload = communications.render_development([])
        self.assertIn("No hay actualizaciones públicas", payload["embeds"][0]["description"])

    def test_project_digest_stays_inside_discord_limit(self):
        projects = [{"name": f"Project {index}", "url": "https://linear.app/p/x", "progress": 0.5, "update": "x" * 2000} for index in range(10)]
        payload = communications.render_development(projects)
        self.assertLessEqual(len(payload["embeds"][0]["fields"]), 3)
        self.assertLessEqual(sum(len(field["value"]) for field in payload["embeds"][0]["fields"]), 3072)

    def test_development_embed_hides_raw_urls_and_uses_attachment(self):
        projects = [{"name": "Telemetry Core", "url": "https://linear.app/p/telemetry", "progress": 0.42,
                     "update": "Contrato canónico en curso.", "updatedAt": "2026-07-15T10:00:00Z"}]
        payload = communications.render_development(projects, include_image=True)
        embed = payload["embeds"][0]
        self.assertEqual(embed["image"]["url"], "attachment://vantare-development.png")
        self.assertNotIn("<https://", str(payload))
        self.assertIn("[Abrir proyecto](https://linear.app/p/telemetry)", embed["fields"][0]["value"])

    def test_development_html_uses_vantare_brand_and_escapes_linear_text(self):
        projects = [{"name": "Overlay <Studio>", "url": "https://linear.app/p/overlay", "progress": 0.08,
                     "update": "Paridad & revisión", "updatedAt": "2026-07-15T10:00:00Z"}]
        output = communications.render_development_html(projects)
        self.assertIn("VANTARE", output)
        self.assertIn("DESARROLLO ACTIVO", output)
        self.assertIn("Overlay &lt;Studio&gt;", output)
        self.assertIn("Paridad &amp; revisión", output)
        self.assertNotIn("Overlay <Studio>", output)


class ReleaseAndBuildTests(unittest.TestCase):
    def test_release_html_presents_public_version_and_changelog(self):
        output = communications.render_release_html(
            "v1.2.3",
            "### Novedades\n- Nuevo launcher\n- Mejor rendimiento",
            "abc1234",
        )
        self.assertIn("LANZAMIENTO PÚBLICO", output)
        self.assertIn("v1.2.3", output)
        self.assertIn("Nuevo launcher", output)
        self.assertIn("VERSIÓN ESTABLE", output)

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
        self.assertIn("BUILD BETA", output)
        self.assertIn("v1.2.3-beta.1", output)
        self.assertIn("Validar Launcher", output)
        self.assertIn("SHA-256 VERIFICADO", output)

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
        self.assertEqual(embed["image"]["url"], "attachment://vantare-build.png")
        self.assertIn("[Descargar build]", str(payload))


class SafetyTests(unittest.TestCase):
    def test_validate_channel_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError, "channel"):
            communications.assert_channel({"channel_id": "wrong"}, "expected")

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
        tester = (root / ".github/workflows/discord-beta-progress.yml").read_text(encoding="utf-8")
        development = (root / ".github/workflows/discord-known-issues.yml").read_text(encoding="utf-8")
        release = (root / ".github/workflows/discord-release.yml").read_text(encoding="utf-8")
        build = (root / ".github/workflows/discord-build-available.yml").read_text(encoding="utf-8")
        self.assertRegex(tester, r"branches:\s*\[develop\]")
        self.assertNotIn("current-plan.md", tester)
        self.assertIn("LINEAR_API_KEY", development)
        self.assertIn("schedule:", development)
        self.assertIn("google-chrome", development)
        self.assertIn("--image", development)
        self.assertIn("render-discord-card", tester)
        self.assertIn("render-discord-card", release)
        self.assertIn("render-discord-card", build)
        self.assertIn("origin/master", release)
        self.assertNotIn("secrets.DISCORD_WEBHOOK_URL", tester + development + release + build)


if __name__ == "__main__":
    unittest.main()
