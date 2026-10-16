"""Rutas y entregas del bot con red, Docker y BD simulados."""

from contextlib import contextmanager, redirect_stdout
from email.header import decode_header, make_header
import importlib.util
import io
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from uuid import uuid4
from unittest.mock import Mock, patch

import test_vantare_plane_para_claude as legacy

w, row, comment = legacy.w, legacy.row, legacy.comment

spec = importlib.util.spec_from_file_location("plane_notify", Path(__file__).with_name("plane_notify_workers.py"))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def bot(event_id="workers:a", kind="workers_state", **kwargs):
    return row(event_id, kind=kind, actor_id="bot-id", author_email=w.BOT_EMAIL,
               author_bot=True, author="Workers Bot", **kwargs)


class WorkersTests(unittest.TestCase):
    setUp = legacy.WatcherTests.setUp
    state = legacy.WatcherTests.state

    def run_watcher(self, records, **kwargs):
        with redirect_stdout(io.StringIO()) as output:
            code = w.run(records, self.path, sender=self.sender, url_file=self.url_file,
                         plane_sender=self.plane, ntfy_sender=self.ntfy, **kwargs)
        return code, output.getvalue()

    def initialize(self):
        self.plane, self.ntfy = Mock(), Mock(return_value=200)
        self.run_watcher([])

    def test_four_types_one_ntfy_and_four_bells_then_deduplicated(self):
        self.initialize()
        records = [bot("workers:" + k, kind="workers_" + k)
                   for k in ("created", "state", "description", "comment")]
        self.run_watcher(records)
        self.assertEqual(self.plane.call_count, 4)
        self.assertEqual(self.ntfy.call_count, 1)
        self.assertEqual(len(self.ntfy.call_args.args[0]), 4)
        self.run_watcher(records)
        self.assertEqual(self.plane.call_count, 4)
        self.assertEqual(self.ntfy.call_count, 1)
        self.assertEqual(self.state()["workers_pending"], [])
        self.sender.assert_not_called()

    def test_isaac_only_goes_to_orchestrator_bot_never_does(self):
        self.initialize()
        self.run_watcher([row(), comment(), bot(),
                          row("state:bot", actor_id="bot-id", author_bot=True),
                          row("state:other", actor_id="other")])
        self.assertEqual(self.sender.call_count, 2)
        self.assertEqual(self.plane.call_count, 1)
        self.assertEqual(self.ntfy.call_count, 1)
        self.assertEqual(self.ntfy.call_args.args[0], [bot()])

    def test_distinct_tasks_have_distinct_ntfy(self):
        self.initialize()
        self.run_watcher([bot(), bot("workers:b", id="issue-2", seq=13)])
        self.assertEqual(self.ntfy.call_count, 2)

    def test_ntfy_failure_retries_without_repeating_plane(self):
        self.initialize()
        self.ntfy.side_effect = TimeoutError("private-destination")
        code, output = self.run_watcher([bot()])
        self.assertEqual(code, 1)
        self.assertNotIn("private-destination", output)
        self.assertTrue(self.state()["workers_pending"][0]["plane_done"])
        self.ntfy.side_effect = None
        self.run_watcher([])
        self.assertEqual(self.ntfy.call_count, 2)
        self.assertEqual(self.plane.call_count, 1)
        self.assertEqual(self.state()["workers_pending"], [])

    def test_plane_failure_does_not_repeat_successful_ntfy(self):
        self.initialize()
        self.plane.side_effect = RuntimeError("private-data")
        self.assertEqual(self.run_watcher([bot()])[0], 1)
        self.assertTrue(self.state()["workers_pending"][0]["ntfy_done"])
        self.plane.side_effect = None
        self.run_watcher([])
        self.assertEqual(self.plane.call_count, 2)
        self.assertEqual(self.ntfy.call_count, 1)

    def test_group_retries_only_failed_destinations_and_merges_new_activity(self):
        self.initialize()
        self.plane.side_effect = [None, TimeoutError()]
        self.ntfy.return_value = 503
        self.run_watcher([bot(), bot("workers:b")])
        self.plane.side_effect = None
        self.ntfy.return_value = 200
        self.run_watcher([bot("workers:c")])
        self.assertEqual(self.plane.call_count, 4)
        self.assertEqual(len(self.ntfy.call_args.args[0]), 3)
        self.assertEqual(self.state()["workers_pending"], [])

    def test_missing_bell_abandoned_after_three_persisted_attempts(self):
        self.initialize()
        self.plane.side_effect = RuntimeError("private-data")
        self.assertEqual(self.run_watcher([bot()])[0], 1)
        self.assertEqual(self.state()["workers_pending"][0]["plane_attempts"], 1)
        self.assertEqual(self.run_watcher([])[0], 1)
        code, output = self.run_watcher([])
        self.assertEqual(code, 0)
        self.assertIn("campana abandonada", output)
        self.assertNotIn("private-data", output)
        self.assertEqual(self.state()["workers_pending"], [])
        self.run_watcher([bot()])
        self.assertEqual(self.plane.call_count, 3)
        self.assertEqual(self.ntfy.call_count, 1)

    def test_abandoned_bell_does_not_block_ntfy_retry(self):
        self.initialize()
        self.plane.side_effect = RuntimeError()
        self.ntfy.return_value = 503
        for _ in range(4):
            self.run_watcher([bot()])
        self.assertEqual(self.plane.call_count, 3)
        self.assertTrue(self.state()["workers_pending"][0]["plane_abandoned"])
        self.ntfy.return_value = 200
        self.run_watcher([])
        self.assertEqual(self.state()["workers_pending"], [])

    def test_initial_deploy_migrates_without_history_or_loss_of_t3_queue(self):
        self.initialize()
        self.sender.side_effect = TimeoutError()
        self.run_watcher([row()])
        state = self.state()
        del state["workers_observed"], state["workers_pending"]
        self.path.write_text(json.dumps(state), encoding="utf-8")
        self.run_watcher([bot()])
        self.plane.assert_not_called()
        self.ntfy.assert_not_called()
        self.assertEqual(len(self.state()["pending"]), 1)
        self.run_watcher([bot(), bot("workers:new")])
        self.assertEqual(self.ntfy.call_count, 1)

    def test_fresh_seed_suppresses_bot_and_dry_run_reads_no_secrets(self):
        self.initialize()
        self.run_watcher([bot()], reset=True)
        before = self.path.read_bytes()
        self.url_file.unlink()
        self.run_watcher([bot(), bot("workers:new")], dry=True)
        self.assertEqual(self.path.read_bytes(), before)
        self.plane.assert_not_called()
        self.ntfy.assert_not_called()

    def test_description_reused_activity_timestamp_counts_as_new_revision(self):
        self.initialize()
        records = [bot("workers:desc@time1", kind="workers_description")]
        self.run_watcher(records)
        self.run_watcher([bot("workers:desc@time2", kind="workers_description")])
        self.assertEqual(self.ntfy.call_count, 2)

    def test_hidden_or_forged_bot_is_not_sent(self):
        self.initialize()
        records = [bot(eligible=False), row("workers:fake", kind="workers_state")]
        self.run_watcher(records)
        self.run_watcher([bot(eligible=True)])
        self.plane.assert_not_called()
        self.ntfy.assert_not_called()

    def test_summary_is_spanish_plain_limited_and_keeps_all_types(self):
        rows = [bot(kind="workers_comment", comment_html="<p>[orquestador] Hola &amp; " + "á" * 500 + "</p>"),
                bot("workers:b", old="En curso", new="Por testear"),
                bot("workers:c", kind="workers_description"), bot("workers:d", kind="workers_created")]
        body = w.ntfy_body(rows)
        self.assertLessEqual(len(body), 300)
        for value in ["Workers Bot:", "Hola &", "En curso → Por testear", "Descripción actualizada", "Tarea creada"]:
            self.assertIn(value, body)
        self.assertNotIn("<p>", body)
        self.assertNotIn("[orquestador]", body)

    def test_ntfy_post_headers_body_and_no_real_network(self):
        response = Mock(status=201)
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        opener = Mock()
        opener.open.return_value = response
        for new, priority in [("En curso", "default"), ("Por revisar", "high"), ("Por testear", "high")]:
            with patch.object(Path, "read_text", return_value="synthetic-topic"), patch.object(w.request, "build_opener", return_value=opener):
                self.assertEqual(w.post_ntfy([bot(new=new)]), 201)
            req = opener.open.call_args.args[0]
            self.assertEqual(req.method, "POST")
            self.assertEqual(str(make_header(decode_header(req.get_header("Title")))), "VANTA-12 · Feature - Ejemplo")
            self.assertEqual(req.get_header("Priority"), priority)
            self.assertEqual(req.get_header("Click"), w.PLANE_URL + "issue-1")
            self.assertLessEqual(len(req.data.decode()), 300)

    def test_docker_missing_ack_is_failure_and_output_is_not_exposed(self):
        with patch.object(w.subprocess, "run", return_value=Mock(stdout="private-data")):
            with self.assertRaises(RuntimeError):
                w.notify_plane(bot())


class NativePlaneTests(unittest.TestCase):
    def setUp(self):
        self.saved = []
        self.activity = SimpleNamespace(id="activity", issue_id="issue", actor_id="bot", workspace_id="workspace",
            field="state", verb="updated", old_identifier="old", new_identifier="new", old_value="old html",
            actor=SimpleNamespace(email=w.BOT_EMAIL, is_bot=True), issue_comment=object(),
            issue=SimpleNamespace(id="issue", name="Ejemplo", description_html="new html", sequence_id=1,
                                  project=SimpleNamespace(identifier="VANTA"), state=SimpleNamespace(name="En curso", group="started")))
        self.serialized = dict(id="activity", field="state", verb="updated", actor_id="bot")

        class Query:
            def __init__(q, filters): q.filters = filters
            def filter(q, **filters): return Query({**q.filters, **filters})
            def exists(q):
                return any(all(record.get(k) == v for k, v in q.filters.items()) for record in self.saved)

        def create(**data):
            json.dumps(data["data"])  # JSONField también debe aceptar el complemento.
            self.saved.append(dict(project_id=PROJECT, entity_identifier="issue", triggered_by_id="bot",
                receiver_id=data["receiver_id"], data__issue_activity__id="activity",
                data__workers_revision=data["data"].get("workers_revision")))
        PROJECT = w.PROJECT
        self.notification = SimpleNamespace(objects=SimpleNamespace(filter=lambda **kw: Query(kw), create=create))
        subscribers = Mock()
        subscribers.filter.return_value.exclude.return_value = [SimpleNamespace(subscriber_id="isaac")]
        activities = Mock()
        activities.select_for_update.return_value.select_related.return_value.get.return_value = self.activity
        members = Mock()
        members.filter.return_value.values_list.return_value = ["isaac"]
        self.native = Mock(side_effect=self.native_success)

        @contextmanager
        def atomic():
            before = list(self.saved)
            try: yield
            except Exception:
                self.saved[:] = before
                raise

        modules = {
            "django.db": SimpleNamespace(transaction=SimpleNamespace(atomic=atomic)),
            "plane.app.serializers": SimpleNamespace(
                IssueActivitySerializer=lambda _: SimpleNamespace(data=dict(self.serialized, field=self.activity.field)),
                IssueCommentSerializer=lambda _: SimpleNamespace(data={"comment_html": "hola"})),
            "plane.bgtasks.notification_task": SimpleNamespace(notifications=self.native),
            "plane.db.models": SimpleNamespace(IssueActivity=SimpleNamespace(objects=activities),
                IssueSubscriber=SimpleNamespace(objects=subscribers), ProjectMember=SimpleNamespace(objects=members),
                Notification=self.notification)}
        self.modules = patch.dict(sys.modules, modules)
        self.modules.start()
        self.addCleanup(self.modules.stop)

    def native_success(self, **kwargs):
        if self.activity.field != "description":
            self.saved.append(dict(project_id=w.PROJECT, entity_identifier="issue", triggered_by_id="bot",
                                   receiver_id="isaac", data__issue_activity__id="activity"))

    def notify(self, revision=None):
        with redirect_stdout(io.StringIO()) as output:
            helper.notify("activity", revision)
        self.assertIn("WORKERS_NOTIFICATION_OK", output.getvalue())

    def test_all_native_types_and_description_fallback(self):
        for field, verb, expected in [("comment", "created", "comment.activity.created"),
                                      (None, "created", "issue.activity.created"),
                                      ("state", "updated", "issue.activity.updated"),
                                      ("description", "updated", "issue.activity.updated")]:
            with self.subTest(field=field):
                self.saved.clear()
                self.activity.field, self.activity.verb = field, verb
                self.notify("revision1")
                self.assertEqual(self.native.call_args.kwargs["type"], expected)
                self.assertFalse(self.native.call_args.kwargs["subscriber"])
                self.assertEqual(len(self.saved), 1)
                self.notify("revision1")
                self.assertEqual(len(self.saved), 1)

    def test_description_new_revision_not_lost_and_original_field_preserved(self):
        self.activity.field = "description"
        self.notify("r1")
        self.notify("r2")
        self.assertEqual(len(self.saved), 2)
        args = self.native.call_args.kwargs
        self.assertEqual(json.loads(args["issue_activities_created"])[0]["field"], "description")
        self.assertEqual(json.loads(args["current_instance"])["description_html"], "old html")

    def test_serializer_method_uuid_is_encoded_before_native_call(self):
        issue_uuid = uuid4()
        self.serialized["issue_detail"] = {"id": issue_uuid}
        self.notify()
        activities = json.loads(self.native.call_args.kwargs["issue_activities_created"])
        self.assertEqual(activities[0]["issue_detail"]["id"], str(issue_uuid))

    def test_description_jsonfield_accepts_serializer_uuid(self):
        self.activity.field = "description"
        self.serialized["actor_id"] = uuid4()
        self.notify("r1")
        self.assertEqual(len(self.saved), 1)

    def test_swallowed_native_error_rolls_back_then_can_retry(self):
        def fail(**kwargs):
            self.native_success(**kwargs)
            print("sensitive native error")
        self.native.side_effect = fail
        with self.assertRaises(RuntimeError), redirect_stdout(io.StringIO()) as output:
            helper.notify("activity")
        self.assertNotIn("sensitive", output.getvalue())
        self.assertEqual(self.saved, [])
        self.native.side_effect = self.native_success
        self.notify()
        self.assertEqual(len(self.saved), 1)

    def test_missing_subscriber_notification_never_acknowledged(self):
        self.native.side_effect = None
        with self.assertRaises(RuntimeError):
            helper.notify("activity")

    def test_other_actor_or_activity_rejected_without_native_call(self):
        self.activity.actor.is_bot = False
        with self.assertRaises(ValueError): helper.notify("activity")
        self.activity.actor.is_bot = True
        self.activity.field = "name"
        with self.assertRaises(ValueError): helper.notify("activity")
        self.native.assert_not_called()
