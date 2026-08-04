import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import roadmap_linear_snapshot as exporter

REPO_ROOT = Path(__file__).resolve().parents[3]


def localized(value):
    return {locale: value for locale in exporter.LOCALES}


def catalog():
    return {
        "schemaVersion": 1,
        "channel": "nightly",
        "staleAfterSeconds": 86400,
        "tabs": [
            {
                "id": "tab-one",
                "label": localized("Tab one"),
                "projects": [
                    {"sourceId": "project-source-1", "id": "project-one", "title": localized("Project one"), "summary": localized("Public summary")},
                    {"sourceId": "project-source-2", "id": "project-two", "title": localized("Project two"), "summary": localized("Public summary two")},
                ],
            }
        ],
    }


def issue(source_id="issue-1", title="Public task", state_type="started", state_name=None, **extra):
    result = {
        "id": source_id,
        "title": title,
        "updatedAt": "2026-08-03T10:00:00Z",
        "archivedAt": None,
        "state": {"type": state_type, "name": state_name or state_type},
    }
    result.update(extra)
    return result


def source_projects():
    return {
        "project-source-1": {"id": "project-source-1", "complete": True, "issues": [issue("a", "ISA-9 — Public A", "completed"), issue("b", "Public B", "backlog")]},
        "project-source-2": {"id": "project-source-2", "complete": True, "issues": [issue("c", "Hidden", "canceled")]},
    }


class Response:
    def __init__(self, payload, status=200):
        self.payload = json.dumps(payload).encode("utf-8")
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.payload


class RoadmapLinearSnapshotTests(unittest.TestCase):
    def test_repository_catalog_and_public_snapshot_share_the_v1_contract(self):
        repository_catalog = exporter.load_catalog(REPO_ROOT / "vantare-v2" / "docs" / "roadmap-linear-catalog.json")
        snapshot = json.loads((REPO_ROOT / "vantare-v2" / "docs" / "roadmap-public.snapshot.json").read_text(encoding="utf-8"))
        self.assertEqual(snapshot["schemaVersion"], repository_catalog["schemaVersion"])
        self.assertEqual(snapshot["channel"], repository_catalog["channel"])
        self.assertEqual([tab["id"] for tab in snapshot["tabs"]], [tab["id"] for tab in repository_catalog["tabs"]])
        self.assertEqual(sum(len(tab["projects"]) for tab in snapshot["tabs"]), 6)
        for tab in snapshot["tabs"]:
            for project in tab["projects"]:
                tasks = project["tasks"]
                done = sum(task["status"] == "done" for task in tasks)
                expected_percent = None if not tasks else round(done * 100 / len(tasks))
                self.assertEqual(project["progress"], {"done": done, "total": len(tasks), "percent": expected_percent})
                for task in tasks:
                    self.assertIsNone(exporter._INTERNAL_CODE_RE.search(task["title"]))
                    self.assertIsNone(exporter._URL_RE.search(task["title"]))
                    self.assertIsNone(exporter._EMAIL_RE.search(task["title"]))
                    self.assertIsNone(exporter._UUID_RE.search(task["title"]))
                    self.assertIsNone(exporter._DOMAIN_RE.search(task["title"]))
        public_json = json.dumps(snapshot)
        for source_id in exporter._source_ids(repository_catalog):
            self.assertNotIn(source_id, public_json)

    def test_contract_is_nested_and_progress_uses_visible_tasks(self):
        snapshot = exporter.build_snapshot(catalog(), source_projects(), "2026-08-03T12:00:00Z")
        self.assertEqual(snapshot["schemaVersion"], 1)
        self.assertEqual(snapshot["channel"], "nightly")
        self.assertEqual(snapshot["tabs"][0]["id"], "tab-one")
        first, second = snapshot["tabs"][0]["projects"]
        self.assertEqual(first["progress"], {"done": 1, "total": 2, "percent": 50})
        self.assertEqual(second["progress"], {"done": 0, "total": 0, "percent": None})
        self.assertEqual([task["status"] for task in first["tasks"]], ["planned", "done"])
        self.assertNotIn("projects", snapshot)
        self.assertNotIn("tasks", snapshot)

    def test_snapshot_contains_no_source_identifiers_or_private_fields(self):
        snapshot = exporter.build_snapshot(catalog(), source_projects(), "2026-08-03T12:00:00Z")
        encoded = json.dumps(snapshot)
        for forbidden in ("sourceId", "project-source-1", "ISA-", "linear.app"):
            self.assertNotIn(forbidden, encoded)
        forbidden_keys = {"sourceId", "identifier", "url", "description", "comments", "assignee", "labels", "workspace"}

        def assert_public_keys(value):
            if isinstance(value, dict):
                self.assertTrue(forbidden_keys.isdisjoint(value))
                for child in value.values():
                    assert_public_keys(child)
            elif isinstance(value, list):
                for child in value:
                    assert_public_keys(child)

        assert_public_keys(snapshot)
        task = snapshot["tabs"][0]["projects"][0]["tasks"][0]
        self.assertRegex(task["id"], r"^task_[0-9a-f]{20}$")
        self.assertEqual(set(task), {"id", "title", "status", "updatedAt"})

    def test_status_mapping_exclusions_and_unknown_fail_closed(self):
        expected = {"completed": "done", "started": "in-progress", "unstarted": "planned", "backlog": "planned"}
        for source, public in expected.items():
            with self.subTest(source=source):
                self.assertEqual(exporter.transform_issue(issue(state_type=source))["status"], public)
        self.assertIsNone(exporter.transform_issue(issue(state_type="canceled")))
        self.assertIsNone(exporter.transform_issue(issue(state_type="started", state_name="Duplicate")))
        self.assertIsNone(exporter.transform_issue(issue(archivedAt="2026-08-01T00:00:00Z")))
        with self.assertRaises(exporter.ExportError):
            exporter.transform_issue(issue(state_type="triaged"))

    def test_title_sanitization_and_private_residue(self):
        self.assertEqual(exporter.sanitize_title(" ISA-258 — Safe title "), "Safe title")
        self.assertEqual(exporter.sanitize_title("TC-01E — Safe title"), "Safe title")
        self.assertEqual(exporter.sanitize_title("BIL-N04 — Safe title"), "Safe title")
        self.assertEqual(exporter.sanitize_title("Promote BIL-08 to Nightly"), "Promote to Nightly")
        self.assertEqual(exporter.sanitize_title("Safe https://linear.app/private"), "Safe")
        self.assertEqual(exporter.sanitize_title("Safe private.example/path"), "Safe")
        for value in ("ISA-258", "OS-08", "alice@example.com", "private.example/path", "166ba0ec-073f-45a5-8456-8a232a2bdf11"):
            with self.subTest(value=value), self.assertRaises(exporter.ExportError):
                exporter.sanitize_title(value)

    def test_catalog_and_snapshot_reject_incomplete_or_empty_sources(self):
        invalid = catalog()
        invalid["tabs"][0]["projects"][1]["id"] = "project-one"
        with self.assertRaises(exporter.ExportError):
            exporter.validate_catalog(invalid)
        missing = source_projects()
        del missing["project-source-2"]
        with self.assertRaises(exporter.ExportError):
            exporter.build_snapshot(catalog(), missing, "2026-08-03T12:00:00Z")
        empty = {key: {**value, "issues": []} for key, value in source_projects().items()}
        with self.assertRaises(exporter.ExportError):
            exporter.build_snapshot(catalog(), empty, "2026-08-03T12:00:00Z")

    def test_fetch_project_paginates_and_requires_complete_pages(self):
        payloads = [
            {"data": {"project": {"id": "p1", "name": "P", "issues": {"nodes": [issue("a")], "pageInfo": {"hasNextPage": True, "endCursor": "next"}}}}},
            {"data": {"project": {"id": "p1", "name": "P", "issues": {"nodes": [issue("b")], "pageInfo": {"hasNextPage": False, "endCursor": None}}}}},
        ]
        calls = []

        def opener(request, timeout):
            calls.append(json.loads(request.data)["variables"])
            return Response(payloads[len(calls) - 1])

        result = exporter.fetch_project("p1", "secret", opener)
        self.assertEqual([item["id"] for item in result["issues"]], ["a", "b"])
        self.assertEqual([call["after"] for call in calls], [None, "next"])

        def partial(_request, timeout):
            del timeout
            return Response({"data": {"project": {"id": "p1", "issues": {"nodes": []}}}})

        with self.assertRaises(exporter.ExportError):
            exporter.fetch_project("p1", "secret", partial)

    def test_fetch_project_rejects_non_adjacent_cursor_cycles(self):
        cursors = ["A", "B", "A"]
        calls = 0

        def cyclic(_request, timeout):
            nonlocal calls
            del timeout
            cursor = cursors[calls]
            calls += 1
            return Response({"data": {"project": {"id": "p1", "name": "P", "issues": {"nodes": [], "pageInfo": {"hasNextPage": True, "endCursor": cursor}}}}})

        with self.assertRaises(exporter.ExportError):
            exporter.fetch_project("p1", "secret", cyclic)
        self.assertEqual(calls, 3)

    def test_graphql_errors_and_http_failure_are_errors(self):
        def graphql_error(_request, timeout):
            del timeout
            return Response({"errors": [{"message": "private detail"}], "data": {}})

        def http_error(_request, timeout):
            del timeout
            return Response({}, status=500)

        with self.assertRaises(exporter.ExportError):
            exporter._graphql_request("secret", {}, graphql_error)
        with self.assertRaises(exporter.ExportError):
            exporter._graphql_request("secret", {}, http_error)

    def test_fixture_cli_writes_atomically_without_token(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            catalog_path = root / "catalog.json"
            fixture_path = root / "fixture.json"
            output_path = root / "nested" / "snapshot.json"
            catalog_path.write_text(json.dumps(catalog()), encoding="utf-8")
            fixture_path.write_text(json.dumps({"projects": list(source_projects().values())}), encoding="utf-8")
            with patch.dict(os.environ, {}, clear=True):
                self.assertEqual(exporter.main(["--catalog", str(catalog_path), "--fixture", str(fixture_path), "--output", str(output_path)]), 0)
            self.assertEqual(json.loads(output_path.read_text(encoding="utf-8"))["schemaVersion"], 1)
            self.assertEqual(list(output_path.parent.glob("*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
