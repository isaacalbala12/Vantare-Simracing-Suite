"""Pruebas sin red: python -B -m unittest discover -s tools/plane -v."""

from contextlib import redirect_stderr, redirect_stdout
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

spec = importlib.util.spec_from_file_location("plane_estado", Path(__file__).with_name("plane-estado.py"))
plane = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plane)


class PlaneEstadoTests(unittest.TestCase):
    def capture(self, args):
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            try:
                code = plane.main(args)
            except SystemExit as exc:
                code = exc.code
        return code, stdout.getvalue() + stderr.getvalue()

    def test_arguments(self):
        args = plane.parse_args(["VANTA-12", "Por revisar", "--comentario", "PR https://example.com/12"])
        self.assertEqual((args.tarea, args.estado, args.comentario),
                         ("VANTA-12", "Por revisar", "PR https://example.com/12"))
        self.assertTrue(plane.parse_args(["VANTA-8", "--ver"]).ver)

    def test_allowed_states(self):
        for state in plane.STATES:
            with self.subTest(state=state):
                args = ["VANTA-12", state]
                code, _ = self.capture(args) if state in plane.ISAAC_STATES else (0, "")
                if state in plane.ISAAC_STATES:
                    self.assertEqual(code, 2)
                    args.append("--isaac")
                self.assertEqual(plane.parse_args(args).estado, state)

    def test_rejects_invalid_arguments_without_network(self):
        for args in (["VANTA-0", "--ver"], ["OTHER-8", "--ver"], ["VANTA-8"],
                     ["VANTA-8", "Inventado"], ["VANTA-8", "--ver", "En curso"],
                     ["VANTA-8", "--ver", "--comentario", "texto"], ["VANTA-8", "--ver", "--isaac"]):
            with self.subTest(args=args), patch.object(plane, "read_token") as token:
                self.assertEqual(self.capture(args)[0], 2)
                token.assert_not_called()

    def test_token_source_and_missing(self):
        with patch.dict(plane.os.environ, {"PLANE_API_TOKEN": " secret "}, clear=True), patch.object(Path, "read_text") as read:
            self.assertEqual(plane.read_token(), "secret")
            read.assert_not_called()
        with patch.dict(plane.os.environ, {}, clear=True), patch.object(Path, "home", return_value=Path("fake-home")), patch.object(Path, "read_text", return_value="file-token\n"):
            self.assertEqual(plane.read_token(), "file-token")
        with patch.dict(plane.os.environ, {}, clear=True), patch.object(Path, "home", return_value=Path("fake-home")), patch.object(Path, "read_text", side_effect=FileNotFoundError):
            code, output = self.capture(["VANTA-8", "--ver"])
            self.assertEqual(code, 1)
            self.assertIn("Falta el token", output)

    def test_token_never_printed(self):
        secret = "synthetic-private-token"
        with patch.dict(plane.os.environ, {"PLANE_API_TOKEN": secret}):
            with patch.object(plane, "run", return_value="name " + secret):
                code, output = self.capture(["VANTA-8", "--ver"])
                self.assertEqual(code, 0)
                self.assertNotIn(secret, output)
            for failure in (plane.PlaneError(secret), RuntimeError(secret)):
                with patch.object(plane, "run", side_effect=failure):
                    code, output = self.capture(["VANTA-8", "--ver"])
                    self.assertEqual(code, 1)
                    self.assertNotIn(secret, output)
            for args in (["VANTA-8", secret], ["VANTA-8", "--" + secret], [secret, "--ver"]):
                code, output = self.capture(args)
                self.assertEqual(code, 2)
                self.assertNotIn(secret, output)

    def test_transport_errors_do_not_echo_token(self):
        secret = "synthetic-private-token"
        client = plane.Plane(secret)
        for failure in (URLError(secret), HTTPError("https://example.com/" + secret, 403, secret, {}, None)):
            with patch.object(client.opener, "open", side_effect=failure):
                with self.assertRaises(plane.PlaneError) as raised:
                    client.call("projects/")
                self.assertNotIn(secret, str(raised.exception))
        self.assertIsNone(plane.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.example"))

    def test_change_and_comment(self):
        from unittest.mock import Mock
        client = Mock()
        client.project.return_value = "project"
        client.items.return_value = [{"id": "old", "name": "Para Claude"}, {"id": "new", "name": "Por revisar"}]
        client.call.side_effect = [{"id": "issue", "project": "project", "state": "old", "name": "Feature - Test"},
                                   {}, {"state": "new"}, {}]
        result = plane.run(plane.parse_args(["VANTA-12", "Por revisar", "--comentario", "PR <https://example.com>"]), client)
        self.assertIn("verificado", result)
        self.assertEqual(client.call.call_args_list[1].args, ("projects/project/work-items/issue/", "PATCH", {"state": "new"}))
        self.assertEqual(client.call.call_args_list[-1].args,
                         ("projects/project/work-items/issue/comments/", "POST", {"comment_html": "<p>[orquestador] PR &lt;https://example.com&gt;</p>"}))

    def test_unknown_remote_state_does_not_patch(self):
        from unittest.mock import Mock
        client = Mock()
        client.project.return_value = "project"
        client.items.return_value = [{"id": "old", "name": "Para Claude"}]
        client.call.return_value = {"id": "issue", "project": "project", "state": "old"}
        with self.assertRaises(plane.PlaneError):
            plane.run(plane.parse_args(["VANTA-12", "Por revisar"]), client)
        self.assertEqual(client.call.call_count, 1)

    def test_pagination_and_project_fallback(self):
        client = plane.Plane("synthetic-private-token")
        with patch.object(client, "call", side_effect=[{"results": [], "next_page_results": True, "next_cursor": "1:1:0"},
                                                       {"results": [{"identifier": "VANTA", "id": "resolved"}]}]) as call:
            self.assertEqual(client.project(), "resolved")
            self.assertEqual(call.call_args.args[0], "projects/?cursor=1%3A1%3A0")
        with patch.object(client, "call", side_effect=plane.PlaneError("HTTP 403")):
            self.assertEqual(client.project(), plane.PROJECT_ID)


if __name__ == "__main__":
    unittest.main()


class SummaryTests(unittest.TestCase):
    def test_summary_replaces_previous_section_and_escapes(self):
        first = plane.with_summary("<p>Encargo</p>", "- Uno\n\n- <b>Dos</b>")
        self.assertEqual(first, "<p>Encargo</p><h3>Qué se ha hecho</h3><ul><li>Uno</li><li>&lt;b&gt;Dos&lt;/b&gt;</li></ul>")
        second = plane.with_summary(first, "Tres")
        self.assertEqual(second, "<p>Encargo</p><h3>Qué se ha hecho</h3><ul><li>Tres</li></ul>")
