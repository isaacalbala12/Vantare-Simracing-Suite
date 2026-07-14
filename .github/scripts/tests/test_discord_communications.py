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
        content = payload["content"]
        self.assertIn("Resumen", content)
        self.assertIn("Notas técnicas", content)
        self.assertIn("Qué comprobar", content)
        self.assertIn("Limitaciones conocidas", content)
        self.assertNotIn("https://github.com", content)
        self.assertEqual(payload["allowed_mentions"], {"parse": []})

    def test_semantic_dedup_ignores_json_formatting_only_changes(self):
        current = fragment()
        previous = json.loads(json.dumps(current, indent=4))
        self.assertFalse(communications.fragment_changed(current, previous))
        previous["summary"] = "Resumen anterior"
        self.assertTrue(communications.fragment_changed(current, previous))


class LinearDigestTests(unittest.TestCase):
    def test_parse_public_update_requires_marker(self):
        private = "Estado interno que no debe salir"
        public = "<!-- discord:development -->\nAvanzamos en el parser."
        self.assertIsNone(communications.parse_public_update(private))
        self.assertEqual(communications.parse_public_update(public), "Avanzamos en el parser.")

    def test_public_update_neutralizes_discord_mass_mentions(self):
        value = communications.parse_public_update("<!-- discord:development -->\n@everyone avance")
        self.assertNotIn("@everyone", value)

    def test_active_projects_excludes_inactive_and_unapproved_text(self):
        projects = [
            {"name": "Billing", "url": "https://linear.app/p/1", "progress": 0.5,
             "status": {"type": "started"}, "projectUpdates": {"nodes": [{"body": "<!-- discord:development -->\nPolar en curso."}]}},
            {"name": "Privado", "url": "https://linear.app/p/2", "progress": 0.2,
             "status": {"type": "started"}, "projectUpdates": {"nodes": [{"body": "Notas internas"}]}},
            {"name": "Terminado", "url": "https://linear.app/p/3", "progress": 1,
             "status": {"type": "completed"}, "projectUpdates": {"nodes": [{"body": "<!-- discord:development -->\nListo"}]}},
        ]
        active = communications.select_public_projects(projects)
        self.assertEqual([item["name"] for item in active], ["Billing"])

    def test_empty_project_digest_is_explicit(self):
        payload = communications.render_development([])
        self.assertIn("No hay actualizaciones públicas", payload["content"])

    def test_project_digest_stays_inside_discord_limit(self):
        projects = [{"name": f"Project {index}", "url": "https://linear.app/p/x", "progress": 0.5, "update": "x" * 2000} for index in range(10)]
        self.assertLessEqual(len(communications.render_development(projects)["content"]), 2000)


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
        self.assertIn("origin/master", release)
        self.assertNotIn("secrets.DISCORD_WEBHOOK_URL", tester + development + release + build)


if __name__ == "__main__":
    unittest.main()
