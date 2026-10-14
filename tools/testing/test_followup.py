import dataclasses
import unittest
from followup import MockPlane, ReviewedReport, patch_notes, plane_projection

ID = "16100000-0000-0000-0000-000000000010"
SHOT = "16100000-0000-0000-0000-000000000011"
POSTHOG = "16100000-0000-0000-0000-000000000012"


class FollowupTests(unittest.TestCase):
    def report(self, **kwargs):
        return dataclasses.replace(ReviewedReport(ID, "Corregido el scroll del editor", "accepted"), **kwargs)

    def test_closed_plane_projection_and_consent_revocation(self):
        report = self.report(screenshots=(SHOT,), posthog_id=POSTHOG, usage_consent=True, credit=True)
        payload = plane_projection(report, 7)
        self.assertEqual(set(payload), {"external_id", "name", "summary", "state", "screenshots", "posthog"})
        self.assertEqual(payload["screenshots"], [f"reports/{ID}/screenshots/{SHOT}"])
        self.assertEqual(payload["posthog"], f"https://eu.posthog.com/project/7/person/{POSTHOG}")
        self.assertIsNone(plane_projection(dataclasses.replace(report, usage_consent=False))["posthog"])
        self.assertIsNone(plane_projection(self.report())["posthog"])

    def test_kill_switch_idempotency_updates_and_removes_revoked_link(self):
        plane = MockPlane()
        report = self.report(posthog_id=POSTHOG, usage_consent=True)
        self.assertIsNone(plane.sync(report))
        self.assertEqual(plane.writes, 0)
        plane.sync(report, 7, enabled=True)
        plane.sync(report, 7, enabled=True)
        self.assertEqual(plane.writes, 1)
        plane.sync(dataclasses.replace(report, usage_consent=False), enabled=True)
        self.assertEqual(plane.writes, 2)
        self.assertIsNone(plane.issues[ID]["posthog"])

    def test_untrusted_projection_rejects_private_content_and_urls(self):
        for text in ("mail tester@example.invalid", "C:/Users/Isaac", "\\\\host\\share", "account_id 42", "Bearer token", "https://host.invalid", "192.168.1.1"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                plane_projection(self.report(summary=text))
        for changes in ({"id": "bad"}, {"posthog_id": "https://host.invalid"}, {"state": "unknown"}, {"state": "fixed"}, {"usage_consent": "true"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                plane_projection(self.report(**changes), 7)

    def test_patch_notes_only_fixed_version_credit_opt_in_and_escape(self):
        report = self.report(state="fixed", fixed_version="1.2.3", summary="Scroll <editor>")
        self.assertEqual(patch_notes([report], "1.2.3"), "<ul><li>Scroll &lt;editor&gt;</li></ul>")
        self.assertNotIn("Gracias", patch_notes([report], "1.2.3"))
        self.assertIn(f"informe {ID[:8]}", patch_notes([dataclasses.replace(report, credit=True)], "1.2.3"))
        self.assertEqual(patch_notes([report, self.report(id=SHOT)], "1.2.4"), "")
        with self.assertRaises(ValueError):
            patch_notes([report, report], "1.2.3")


if __name__ == "__main__":
    unittest.main()
