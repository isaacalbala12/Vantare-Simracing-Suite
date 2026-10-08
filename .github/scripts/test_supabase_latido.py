import contextlib
import io
import json
import os
import unittest
import urllib.error
from unittest.mock import MagicMock, patch

import supabase_latido as latido


class LatidoTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            "VITE_SUPABASE_URL": "https://mock.supabase.co",
            "VITE_SUPABASE_ANON_KEY": "mock-anon-do-not-log",
            "DISCORD_KNOWN_ISSUES_WEBHOOK_URL": "https://discord.com/api/webhooks/mock/mock-token",
            "GITHUB_REPOSITORY": "isaacalbala12/Vantare-Simracing-Suite",
            "GITHUB_RUN_ID": "123",
        }, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        # All network requests are blocked unless a test supplies a fake response.
        self.network = patch.object(latido.urllib.request, "build_opener")
        self.opener = self.network.start().return_value
        self.opener.open.side_effect = AssertionError("Unexpected network request")
        self.addCleanup(self.network.stop)

    def response(self, body=b'[{"id":true}]', status=200):
        response = MagicMock()
        response.status = status
        response.read.return_value = body
        self.opener.open.side_effect = None
        self.opener.open.return_value.__enter__.return_value = response
        return response

    def run_sanitized(self, fn):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = fn()
        for secret in ("mock-anon-do-not-log", "mock-token", "private-response", "mock.supabase.co"):
            self.assertNotIn(secret, output.getvalue())
        return result

    def test_database_read_uses_anon_and_bounded_response(self):
        response = self.response()
        self.assertEqual(self.run_sanitized(latido.probe), 0)
        req = self.opener.open.call_args.args[0]
        self.assertEqual(req.get_method(), "GET")
        self.assertEqual(req.full_url, "https://mock.supabase.co/rest/v1/supabase_heartbeat?select=id&limit=1")
        self.assertEqual(req.get_header("Apikey"), "mock-anon-do-not-log")
        self.assertEqual(req.get_header("Authorization"), "Bearer mock-anon-do-not-log")
        self.assertEqual(self.opener.open.call_args.kwargs["timeout"], 20)
        response.read.assert_called_once_with(1025)

    def test_bad_configuration_never_contacts_network(self):
        cases = [{"VITE_SUPABASE_ANON_KEY": ""}, {"VITE_SUPABASE_URL": ""}]
        cases += [{"VITE_SUPABASE_URL": url} for url in (
            "http://mock.supabase.co", "https://user:password@mock.supabase.co",
            "https://mock.supabase.co/path", "https://mock.supabase.co?token=private-response",
            "https://mock.supabase.co#private-response",
        )]
        for env in cases:
            with self.subTest(env=env), patch.dict(os.environ, env):
                self.assertEqual(self.run_sanitized(latido.probe), 1)
        self.opener.open.assert_not_called()

    def test_http_failures_and_redirects_fail_without_logging_body(self):
        for code in (301, 302, 401, 403, 404, 429, 500, 503):
            with self.subTest(code=code):
                self.opener.open.side_effect = urllib.error.HTTPError(
                    "https://mock.supabase.co", code, "private-response", {}, io.BytesIO(b"private-response"))
                self.assertEqual(self.run_sanitized(latido.probe), 1)

    def test_timeout_and_dns_failure_are_sanitized(self):
        for error in (TimeoutError("private-response"), urllib.error.URLError("private-response")):
            with self.subTest(error=type(error)):
                self.opener.open.side_effect = error
                self.assertEqual(self.run_sanitized(latido.probe), 1)

    def test_empty_invalid_and_unexpected_responses_fail(self):
        for body in (b"[]", b"{}", b"private-response", b'[{"id":false}]', b'[{"id":1}]',
                     b'[{"id":true,"private-response":1}]'):
            with self.subTest(body=body):
                self.response(body)
                self.assertEqual(self.run_sanitized(latido.probe), 1)
        self.response(status=204)
        self.assertEqual(self.run_sanitized(latido.probe), 1)

    def test_redirect_handler_never_forwards_credentials(self):
        self.assertIsNone(latido.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.test"))

    def test_discord_failure_message_contains_only_run_link_and_no_mentions(self):
        self.response(status=204)
        self.assertEqual(self.run_sanitized(latido.notify_failure), 0)
        req = self.opener.open.call_args.args[0]
        self.assertEqual(req.get_method(), "POST")
        payload = json.loads(req.data)
        self.assertIn("https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/123", payload["content"])
        self.assertEqual(payload["allowed_mentions"], {"parse": []})
        self.assertNotIn("mock-anon-do-not-log", req.data.decode())

    def test_absent_webhook_is_explicit_and_no_network(self):
        with patch.dict(os.environ, {"DISCORD_KNOWN_ISSUES_WEBHOOK_URL": ""}):
            self.assertEqual(self.run_sanitized(latido.notify_failure), 0)
        self.opener.open.assert_not_called()

    def test_invalid_webhook_is_rejected(self):
        for url in ("http://discord.com/api/webhooks/mock/token", "https://evil.test/api/webhooks/mock/token",
                    "https://discord.com/not-a-webhook", "https://user:password@discord.com/api/webhooks/mock/token"):
            with self.subTest(url=url), patch.dict(os.environ, {"DISCORD_KNOWN_ISSUES_WEBHOOK_URL": url}):
                self.assertEqual(self.run_sanitized(latido.notify_failure), 1)
        self.opener.open.assert_not_called()

    def test_discord_failure_does_not_expose_token(self):
        self.opener.open.side_effect = urllib.error.HTTPError("mock-token", 429, "private-response", {}, None)
        self.assertEqual(self.run_sanitized(latido.notify_failure), 1)

    def test_untrusted_run_metadata_is_not_sent(self):
        self.response(status=204)
        with patch.dict(os.environ, {"GITHUB_REPOSITORY": "@everyone/private-response"}):
            self.assertEqual(self.run_sanitized(latido.notify_failure), 0)
        self.assertNotIn("private-response", self.opener.open.call_args.args[0].data.decode())


if __name__ == "__main__":
    unittest.main()
