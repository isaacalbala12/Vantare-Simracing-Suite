import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid

spec = importlib.util.spec_from_file_location("clickup_roadmap", Path(__file__).with_name("clickup-roadmap.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
FIXTURE = Path(__file__).with_name("testdata") / "clickup-roadmap.json"


class RoadmapTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def test_all_statuses_names_nested_ancestry_and_stable_identity(self):
        doc = module.document(self.snapshot)
        visual_fixture = Path(__file__).resolve().parents[1] / "native/hub/reference/fixtures/roadmap-clickup-test.json"
        self.assertEqual(json.loads(visual_fixture.read_text(encoding="utf-8"))["document"], doc)
        self.assertEqual([i["section"] for i in doc["items"]], ["now", "now", "next", "later", "done"])
        self.assertEqual(doc["items"][0]["title"]["es"], "Feature · Calendario")
        self.assertIn("Feature · Calendario → Revisar favoritas", doc["items"][2]["body"]["es"])
        original = doc["items"][0]["id"]
        self.snapshot["tasks"][0]["name"] = "Feature · Renombrado"
        self.snapshot["tasks"][0]["status"]["status"] = "complete"
        self.assertEqual(module.document(self.snapshot)["items"][0]["id"], original)
        uuid.UUID(original)

    def test_unknown_status_duplicates_missing_parent_cycle_and_limits_reject(self):
        for mutation in [
            lambda s: s["tasks"][0]["status"].update(status="blocked"),
            lambda s: s["tasks"].append(s["tasks"][0]),
            lambda s: s["tasks"][1].update(parent="absent"),
            lambda s: s["tasks"][0].update(parent="example-3"),
            lambda s: s["tasks"][0].update(name="x" * 121),
            lambda s: s.update(tasks=[]),
            lambda s: s.update(tasks=[dict(s["tasks"][0], id=str(i)) for i in range(41)]),
            lambda s: s["space"].update(name="Otro"),
        ]:
            snapshot = copy.deepcopy(self.snapshot)
            mutation(snapshot)
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                module.document(snapshot)

    def test_sql_is_atomic_guarded_and_escapes_task_content(self):
        self.snapshot["tasks"][0]["name"] = "Feature · '); drop table x; --"
        sql = module.publication_sql(module.document(self.snapshot), "none")
        self.assertTrue(sql.startswith("begin;"))
        self.assertTrue(sql.endswith("commit;\n"))
        self.assertIn("is distinct from null", sql)
        self.assertIn("lock table public.visual_roadmap in exclusive mode", sql)
        self.assertIn("''); drop table x; --", sql)
        with self.assertRaises(ValueError):
            module.publication_sql(module.document(self.snapshot), "'); --")

    def test_fixture_publish_fails_before_psql_and_no_token_is_logged(self):
        with tempfile.TemporaryDirectory() as output:
            args = ["clickup-roadmap.py", "--fixture", str(FIXTURE), "--output-dir", output,
                    "--expected-publication", "none", "--publish"]
            with patch("sys.argv", args), patch.object(module.subprocess, "run") as execute:
                with self.assertRaises(SystemExit) as error:
                    module.main()
                self.assertEqual(error.exception.code, 1)
                execute.assert_not_called()

    def test_api_paginates_closed_subtasks_and_folder_lists(self):
        calls = []
        snapshot = self.snapshot
        class API:
            def get(self, path, **query):
                calls.append((path, query))
                responses = {
                    "team": {"teams": [{"id": "w"}]},
                    "team/w/space": {"spaces": [{"id": "s", "name": "Vantare"}]},
                    "space/s/list": {"lists": []},
                    "space/s/folder": {"folders": [{"id": "f"}]},
                    "folder/f/list": {"lists": [{"id": "l", "name": "Desarrollo"}]},
                }
                if path == "list/l/task":
                    page = query["page"]
                    return {"tasks": snapshot["tasks"][:2] if page == 0 else snapshot["tasks"][2:] if page == 1 else []}
                return responses[path]
        result = module.fetch(API(), "w")
        self.assertEqual(result["tasks"], self.snapshot["tasks"])
        pages = [query for path, query in calls if path == "list/l/task"]
        self.assertEqual([q["page"] for q in pages], [0, 1, 2])
        self.assertTrue(all(q["subtasks"] == "true" and q["include_closed"] == "true" for q in pages))

    def test_api_duplicate_pages_and_ambiguous_names_fail_closed(self):
        with self.assertRaises(ValueError):
            module.one_named([{"name": "Vantare"}, {"name": "Vantare"}], "Vantare")
        with self.assertRaises(ValueError):
            module.ClickUp("")
        with self.assertRaises(ValueError):
            module.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.invalid")

    def test_publish_requires_exact_reviewed_digest_and_target_and_sends_no_token(self):
        doc = module.document(self.snapshot)
        sql = module.publication_sql(doc, "none")
        digest = hashlib.sha256(sql.encode()).hexdigest()
        with tempfile.TemporaryDirectory() as output:
            args = ["script", "--workspace-id", "w", "--output-dir", output,
                    "--expected-publication", "none", "--publish", "--expected-db-host", "approved.invalid",
                    "--expected-db-user", "postgres.example"]
            with patch.dict(module.os.environ, {"CLICKUP_API_TOKEN": "private-test", "PGHOST": "approved.invalid", "PGUSER": "postgres.example"}), \
                    patch.object(module, "fetch", return_value=self.snapshot), \
                    patch.object(module.subprocess, "run") as execute:
                with patch("sys.argv", args), self.assertRaises(SystemExit):
                    module.main()
                execute.assert_not_called()
                execute.return_value.returncode = 0
                execute.return_value.stdout = "local-test-receipt"
                with patch("sys.argv", args + ["--approved-sql-sha256", digest]):
                    module.main()
                self.assertNotIn("private-test", repr(execute.call_args))
                self.assertEqual(execute.call_args.kwargs["input"], sql)


if __name__ == "__main__":
    unittest.main()
