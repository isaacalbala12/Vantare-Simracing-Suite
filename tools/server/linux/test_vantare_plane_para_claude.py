"""Sin red ni BD: python -B -m unittest discover -s tools/server/linux -p 'test_*.py' -v."""

from contextlib import redirect_stderr, redirect_stdout
import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("watcher", Path(__file__).with_name("vantare-plane-para-claude.py"))
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)


def row(event_id="state:1", old="En curso", new="Para Claude", **kwargs):
    result = dict(event_id=event_id, kind="state", id="issue-1", seq=12,
                  key="VANTA", name="Feature - Ejemplo", old_state=old,
                  new_state=new, actor_id=w.ISAAC, author_email=w.ISAAC_EMAIL,
                  author_bot=False, author="Isaac", ready=True, via_api=False,
                  comment_html="", comment_text="")
    result.update(kwargs)
    return result


def comment(event_id="comment:1", **kwargs):
    return row(event_id, "En curso", "En curso", kind="comment",
               comment_html=kwargs.pop("comment_html", "<p>¿Cómo va?</p>"), **kwargs)


class WatcherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "state.json"
        self.url_file = Path(self.temp.name) / "url"
        self.url_file.write_text("synthetic-private-destination", encoding="utf-8")
        self.sender = Mock(return_value=202)

    def run_watcher(self, records, **kwargs):
        out = io.StringIO()
        with redirect_stdout(out):
            result = w.run(records, self.path, sender=self.sender,
                           url_file=self.url_file, **kwargs)
        return result, out.getvalue()

    def initialize(self, records=()):
        code, output = self.run_watcher(list(records))
        self.assertEqual(code, 0)
        self.assertIn("sin avisos", output)
        self.sender.assert_not_called()

    def state(self):
        return json.loads(self.path.read_text(encoding="utf-8"))

    def test_unarchiving_does_not_replay_hidden_task_history(self):
        self.initialize([row("state:old", eligible=False)])
        self.run_watcher([row("state:old", eligible=True)])
        self.sender.assert_not_called()
        self.run_watcher([row("state:old", eligible=True),
                          row("state:new", eligible=False)])
        self.run_watcher([row("state:old", eligible=True),
                          row("state:new", eligible=True), row("state:fresh")])
        self.assertEqual(self.sender.call_count, 1)
        self.assertEqual(self.sender.call_args.args[2], "state:fresh")

    def test_each_state_event_has_complete_payload(self):
        cases = [("En curso", "Para Claude", "para_claude"),
                 ("Por testear", "Entregado", "entregado"),
                 ("En curso", "Cancelado", "cancelado"),
                 ("Por testear", "En curso", "devuelta")]
        for old, new, event in cases:
            with self.subTest(event=event):
                body = w.payload(row(old=old, new=new))
                self.assertEqual(body, dict(tarea="VANTA-12", nombre="Feature - Ejemplo",
                                           id="issue-1", evento=event, estado_anterior=old,
                                           estado_nuevo=new, autor="Isaac", comentario=""))

    def test_created_directly_in_para_claude_is_an_entry(self):
        self.initialize()
        self.run_watcher([row("created:1", old=None)])
        self.assertEqual(self.sender.call_count, 1)
        self.assertEqual(self.sender.call_args.args[1]["evento"], "para_claude")
        self.assertIsNone(self.sender.call_args.args[1]["estado_anterior"])

    def test_other_states_and_non_transitions_are_ignored(self):
        for old, new in [("Por revisar", "En curso"), ("Para Claude", "Para Claude"),
                         ("En curso", "Por testear"), ("Entregado", "Entregado")]:
            self.assertIsNone(w.payload(row(old=old, new=new)))
        self.assertIsNone(w.payload(row(kind="description")))

    def test_isaac_comment_plain_text_and_limit(self):
        body = w.payload(comment(comment_html="<p>Hola &amp; gracias</p><p>" + "á" * 1600 + "</p>"))
        self.assertEqual(body["evento"], "comentario")
        self.assertEqual(body["estado_anterior"], body["estado_nuevo"])
        self.assertTrue(body["comentario"].startswith("Hola & gracias á"))
        self.assertEqual(len(body["comentario"]), 1500)
        self.assertNotIn("<p>", body["comentario"])

    def test_comments_with_only_stripped_text(self):
        self.assertEqual(w.payload(comment(comment_html="", comment_text=" A\n B "))["comentario"], "A B")

    def test_script_and_style_not_in_plain_text(self):
        body = w.payload(comment(comment_html="<script>oculto</script><style>otro</style><p>visible<br>dos</p>"))
        self.assertEqual(body["comentario"], "visible dos")

    def test_only_isaac_excludes_bot_other_actor_and_api(self):
        for changes in [dict(actor_id="workers-bot", author_bot=True),
                        dict(actor_id="another-user"), dict(author_email="other@example.test"),
                        dict(author_bot=True), dict(via_api=True)]:
            with self.subTest(changes=changes):
                self.assertIsNone(w.payload(comment(**changes)))
        self.assertEqual(w.payload(comment())["autor"], "Isaac")

    def test_signed_comments_are_ignored_even_as_isaac(self):
        for text in ["<p>[orquestador] PR lista</p>", "<p> [ORQUESTADOR] firmado</p>"]:
            self.assertIsNone(w.payload(comment(comment_html=text)))

    def test_seed_and_v1_migration_never_notify_old_records(self):
        records = [row(), comment(), row("state:2", new="Entregado")]
        self.initialize(records)
        self.run_watcher(records)
        self.sender.assert_not_called()
        self.path.write_text('["old-issue-id"]', encoding="utf-8")
        self.run_watcher(records)
        self.sender.assert_not_called()
        self.assertEqual(len(self.state()["observed"]), 3)

    def test_explicit_seed_clears_pending_without_sending(self):
        self.initialize()
        self.sender.side_effect = TimeoutError("synthetic-private-destination")
        self.run_watcher([row()])
        self.sender.reset_mock()
        self.run_watcher([row(), comment()], reset=True)
        self.sender.assert_not_called()
        self.assertEqual(self.state()["pending"], [])

    def test_seed_includes_recent_comments_so_they_never_backfill(self):
        self.initialize([comment(ready=False)])
        self.run_watcher([comment(ready=True)])
        self.sender.assert_not_called()

    def test_all_events_are_sent_once_then_deduplicated(self):
        self.initialize()
        records = [row(), row("state:2", new="Entregado"),
                   row("state:3", new="Cancelado"),
                   row("state:4", old="Por testear", new="En curso"), comment()]
        self.assertEqual(self.run_watcher(records)[0], 0)
        self.assertEqual(self.sender.call_count, 5)
        self.run_watcher(records)
        self.assertEqual(self.sender.call_count, 5)
        self.assertEqual(self.state()["pending"], [])

    def test_several_transitions_same_minute_and_exit_reenter(self):
        self.initialize()
        events = [row("state:a"), row("state:b", old="Para Claude", new="En curso"), row("state:c")]
        # Dos entradas reales; mismo estado final que la primera entrada.
        self.run_watcher(events)
        self.assertEqual(self.sender.call_count, 2)
        self.assertEqual([c.args[2] for c in self.sender.call_args_list], ["state:a", "state:c"])
        self.run_watcher(events)
        self.assertEqual(self.sender.call_count, 2)

    def test_failed_post_retries_even_if_record_disappears(self):
        self.initialize()
        self.sender.side_effect = TimeoutError("synthetic-private-destination")
        code, output = self.run_watcher([row()])
        self.assertEqual(code, 1)
        self.assertNotIn("synthetic-private-destination", output)
        self.assertEqual(len(self.state()["pending"]), 1)
        self.sender.side_effect = None
        self.run_watcher([])
        self.assertEqual(self.sender.call_count, 2)
        self.assertEqual(self.state()["pending"], [])
        self.run_watcher([row()])
        self.assertEqual(self.sender.call_count, 2)

    def test_non_2xx_keeps_pending_but_success_not_retried(self):
        self.initialize()
        self.sender.side_effect = [503, 204]
        self.run_watcher([row(), comment()])
        self.assertEqual(len(self.state()["pending"]), 1)
        self.sender.side_effect = None
        self.run_watcher([row(), comment()])
        self.assertEqual(self.sender.call_count, 3)
        self.assertEqual(self.sender.call_args.args[1]["evento"], "para_claude")

    def test_queue_persisted_before_send_and_success_checkpointed(self):
        self.initialize()
        def send(url, body, event_id):
            self.assertEqual(len(self.state()["pending"]), 1)
            return 202
        self.sender.side_effect = send
        self.run_watcher([row()])
        self.assertEqual(self.state()["pending"], [])

    def test_edited_comment_not_a_new_event(self):
        self.initialize()
        self.run_watcher([comment()])
        self.run_watcher([comment(comment_html="<p>Editado</p>")])
        self.assertEqual(self.sender.call_count, 1)

    def test_async_api_log_is_rechecked_after_grace(self):
        self.initialize()
        self.run_watcher([comment(ready=False)])
        self.assertEqual(self.state()["observed"], [])
        self.sender.assert_not_called()
        self.run_watcher([comment(ready=True, via_api=True)])
        self.sender.assert_not_called()
        self.assertEqual(self.state()["observed"], ["comment:1"])

    def test_ui_comment_sent_after_grace(self):
        self.initialize()
        self.run_watcher([comment(ready=False)])
        self.run_watcher([comment(ready=True)])
        self.assertEqual(self.sender.call_count, 1)

    def test_dry_run_prints_payload_without_send_or_state_write(self):
        self.initialize()
        before = self.path.read_bytes()
        self.url_file.unlink()  # dry-run no necesita leer el secreto.
        code, output = self.run_watcher([row(), comment()], dry=True)
        self.assertEqual(code, 0)
        self.assertIn('"evento": "para_claude"', output)
        self.assertIn('"evento": "comentario"', output)
        self.assertEqual(self.path.read_bytes(), before)
        self.sender.assert_not_called()

    def test_first_dry_run_does_not_create_state(self):
        self.run_watcher([row()], dry=True)
        self.assertFalse(self.path.exists())
        self.sender.assert_not_called()

    def test_corrupt_or_unknown_state_does_not_reset_silently(self):
        for text in ['{"version":99}', '{broken']:
            self.path.write_text(text, encoding="utf-8")
            with self.assertRaises(ValueError):
                self.run_watcher([row()])
            self.assertEqual(self.path.read_text(encoding="utf-8"), text)
        self.sender.assert_not_called()

    def test_collect_does_not_mutate_input_or_duplicate_repeated_id(self):
        state = w.seed([])
        before = copy.deepcopy(state)
        result = w.collect(state, [row(), row()])
        self.assertEqual(state, before)
        self.assertEqual(len(result["pending"]), 1)

    def test_database_is_read_only_and_uses_history_not_description(self):
        with patch.object(w.subprocess, "run", return_value=Mock(stdout="[]")) as run:
            self.assertEqual(w.current(), [])
        args = run.call_args.args[0]
        self.assertIn("PGOPTIONS=-c default_transaction_read_only=on", args)
        self.assertIn("issue_activities", run.call_args.kwargs["input"])
        self.assertIn("issue_comments", run.call_args.kwargs["input"])
        self.assertNotIn("description_html", run.call_args.kwargs["input"])

    def test_invalid_api_body_is_skipped_without_losing_other_comments(self):
        records = [comment("comment:api", via_api=[
            {"id": "bad", "body": "private-invalid-json"},
            {"id": "empty", "body": ""}, {"id": "null", "body": None},
            {"id": "scalar", "body": "[]"},
            {"id": "valid", "body": '{"id":"api"}'}]),
            comment("comment:ui", via_api=[{"id": "bad", "body": "private-invalid-json"}])]
        with redirect_stdout(io.StringIO()) as output:
            parsed = w.classify_api_comments(records)
        self.assertTrue(parsed[0]["via_api"])
        self.assertFalse(parsed[1]["via_api"])
        self.assertEqual(output.getvalue().count("id=bad "), 1)
        self.assertNotIn("private-invalid", output.getvalue())
        self.assertIsNone(w.payload(parsed[0]))
        self.assertIsNotNone(w.payload(parsed[1]))

    def test_api_response_is_never_cast_to_json_in_sql(self):
        self.assertNotIn("response_body::json", w.SQL)

    def test_scan_window_uses_mark_overlap_and_bounded_catchup(self):
        now = datetime(2026, 10, 15, tzinfo=timezone.utc)
        self.assertEqual(w.scan_since(None, now), now - w.RETENTION)
        self.assertEqual(w.scan_since({"last_scan": (now - timedelta(minutes=1)).isoformat()}, now),
                         now - timedelta(minutes=6))
        self.assertEqual(w.scan_since({"last_scan": (now - timedelta(days=60)).isoformat()}, now),
                         now - w.RETENTION)
        self.assertEqual(w.SQL.count("created_at >= :'since'::timestamptz"), 5)

    def test_pruning_preserves_pending_and_overlap_deduplication(self):
        now = datetime(2026, 10, 15, tzinfo=timezone.utc)
        old = (now - timedelta(days=31)).isoformat()
        recent = (now - timedelta(minutes=3)).isoformat()
        state = w.seed([row("old", created_at=old), row("pending", created_at=old),
                        row("recent", created_at=recent)], now)
        state["pending"] = [{"event_id": "pending", "payload": w.payload(row())}]
        result = w.collect(state, [row("recent", created_at=recent),
                                  comment("late", created_at=recent)], now)
        self.assertNotIn("old", result["observed"])
        self.assertNotIn("old", result["event_times"])
        self.assertIn("pending", result["observed"])
        self.assertIn("recent", result["observed"])
        self.assertEqual(len(result["pending"]), 2)
        self.assertEqual(w.collect(result, [comment("late", created_at=recent)], now)["pending"],
                         result["pending"])

    def test_legacy_ids_migrate_without_replay_then_expire(self):
        now = datetime(2026, 10, 15, tzinfo=timezone.utc)
        state = {"version": 2, "observed": ["old"], "pending": [],
                 "workers_observed": ["workers:old"], "workers_pending": []}
        migrated = w.collect(state, [row("old")], now)
        self.assertEqual(migrated["pending"], [])
        pruned = w.collect(migrated, [], now + timedelta(days=31))
        self.assertEqual(pruned["observed"], [])
        self.assertEqual(pruned["workers_observed"], [])
        self.assertEqual(pruned["event_times"], {})

    def test_post_user_agent_idempotency_and_no_redirect(self):
        response = Mock(status=202)
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        opener = Mock()
        opener.open.return_value = response
        with patch.object(w.request, "build_opener", return_value=opener):
            self.assertEqual(w.post("https://example.invalid/synthetic", w.payload(row()), "state:1"), 202)
        req = opener.open.call_args.args[0]
        self.assertEqual(req.get_header("User-agent"), w.USER_AGENT)
        self.assertEqual(req.get_header("Idempotency-key"), "state:1")
        self.assertEqual(json.loads(req.data)["evento"], "para_claude")
        self.assertIsNone(w.NoRedirect().redirect_request(None, None, 302, "", {}, "https://example.invalid"))

    def test_main_error_never_prints_exception_details(self):
        out = io.StringIO()
        with patch.object(w, "STATE_FILE", str(self.path)), patch.object(w, "current", side_effect=RuntimeError("synthetic-private-destination")), redirect_stderr(out):
            self.assertEqual(w.main(["--dry-run"]), 1)
        self.assertNotIn("synthetic-private-destination", out.getvalue())


if __name__ == "__main__":
    unittest.main()
