"""Pruebas offline: no claves personales, red ni proyecto real."""
import contextlib
import io
import unittest
from unittest.mock import patch

import posthog_paneles as panels


class MemoryApi:
    base = panels.HOST + "/api/projects/123/"

    def __init__(self):
        self.resources = {"dashboards/": [], "insights/": []}
        self.writes = []

    def list(self, resource):
        return self.resources[resource]

    def request(self, method, path, value=None):
        assert method == "POST"
        item = {**value, "id": len(self.resources[path]) + 1}
        self.resources[path].append(item)
        self.writes.append((path, value))
        return item


class PanelsTests(unittest.TestCase):
    def test_dry_run_does_not_read_key_or_connect(self):
        class Output(io.StringIO):
            def reconfigure(self, **_):
                pass
        with patch("sys.argv", ["posthog_paneles.py"]), \
                patch.object(panels.Path, "home", side_effect=AssertionError("key lookup")), \
                patch.object(panels, "Api", side_effect=AssertionError("network")), \
                contextlib.redirect_stdout(Output()) as output:
            panels.main()
        self.assertIn("widget_usage", output.getvalue())

    def test_measures_observations_and_preserves_sum_and_funnel_order(self):
        definitions = panels.definitions()["insights"]
        self.assertEqual(len(definitions), 8)
        sources = [item["query"]["source"] for item in definitions]
        sums = [source for source in sources if source.get("series", [{}])[0].get("math") == "sum"]
        self.assertEqual(len(sums), 2)
        self.assertTrue(all(source["series"][0]["math_property"] == "duration_seconds" for source in sums))
        funnel = next(source for source in sources if source["kind"] == "FunnelsQuery")
        self.assertEqual([series["event"] for series in funnel["series"]],
                         ["installation_observed", "account_signed_in", "commercial_license_observed"])
        self.assertEqual(funnel["funnelsFilter"]["funnelOrderType"], "ordered")
        self.assertNotIn("purchase_completed", str(definitions))

    def test_creation_is_idempotent_and_resumes_partial_creation(self):
        api = MemoryApi()
        specification = panels.definitions()
        panels.apply(api, {"dashboard": specification["dashboard"], "insights": specification["insights"][:3]})
        self.assertEqual(len(api.writes), 4)
        url = panels.apply(api, specification)
        self.assertEqual(len(api.writes), 9)
        panels.apply(api, specification)
        self.assertEqual(len(api.writes), 9)
        self.assertEqual(url, panels.HOST + "/project/123/dashboard/1")

    def test_foreign_or_duplicate_names_fail_before_writes(self):
        for items in [[{"name": panels.NAME, "tags": []}],
                      [{"name": panels.NAME, "tags": [panels.TAG]}] * 2]:
            api = MemoryApi()
            api.resources["dashboards/"] = items
            with self.assertRaises(RuntimeError):
                panels.apply(api, panels.definitions())
            self.assertEqual(api.writes, [])

    def test_divergent_or_unassociated_insights_fail_before_any_creation(self):
        for associated in [True, False]:
            api = MemoryApi()
            specification = panels.definitions()
            if associated:
                api.resources["dashboards/"] = [{**specification["dashboard"], "id": 1}]
            api.resources["insights/"] = [{**specification["insights"][0],
                "query": {}, "id": 1, "dashboards": [1]}]
            with self.assertRaises(RuntimeError):
                panels.apply(api, specification)
            self.assertEqual(api.writes, [])

    def test_api_rejects_foreign_pagination_without_sending_authorization(self):
        api = panels.Api(123, "test-only")
        for path in ["https://foreign.test/api/projects/123/insights/",
                     "https://eu.posthog.com/api/projects/124/insights/",
                     "http://eu.posthog.com/api/projects/123/insights/", "../124/insights/"]:
            with patch.object(api.opener, "open", side_effect=AssertionError("request")):
                with self.assertRaises(ValueError):
                    api.request("GET", path)

    def test_pagination_reads_all_pages_and_rejects_cycles(self):
        api = panels.Api(123, "test-only")
        with patch.object(api, "request", side_effect=[
            {"results": [{"id": 1}], "next": api.base + "insights/?offset=1"},
            {"results": [{"id": 2}], "next": None},
        ]):
            self.assertEqual(api.list("insights/"), [{"id": 1}, {"id": 2}])
        with patch.object(api, "request", return_value={"results": [], "next": "insights/?limit=100"}):
            with self.assertRaises(RuntimeError):
                api.list("insights/")


if __name__ == "__main__":
    unittest.main()
