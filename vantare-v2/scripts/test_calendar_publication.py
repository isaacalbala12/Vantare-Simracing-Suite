import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("calendar_publication", Path(__file__).with_name("calendar-publication.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CalendarPublicationTests(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[1]
        source = (root / "internal/calendar/testdata/daily-schedule-2026-08-25.txt").read_text(encoding="utf-8")
        schedule = json.loads((root / "internal/calendar/seed/lmu-weekly-schedule.json").read_text(encoding="utf-8"))
        self.inbox = {"version": 1, "candidates": [{
            "messageId": "fixture", "guildId": "731597245992009768",
            "channelId": "1529245213598552134", "sourceText": source,
            "sourceHash": hashlib.sha256(source.encode()).hexdigest(), "schedule": schedule,
        }]}
        self.now = dt.datetime(2026, 8, 26, tzinfo=dt.timezone.utc)

    def test_real_archived_source_prepares_exact_owner_contract_in_its_window(self):
        payload = module.prepare(self.inbox, "fixture", self.now)
        self.assertEqual(payload["p_schedule"], self.inbox["candidates"][0]["schedule"])
        self.assertEqual(payload["p_series_count"], len(payload["p_schedule"]["series"]))
        self.assertEqual(set(payload), {"p_source_text", "p_schedule", "p_valid_from", "p_series_count"})

    def test_expired_current_week_and_changed_source_fail_closed(self):
        with self.assertRaises(ValueError):
            module.prepare(self.inbox, "fixture", dt.datetime(2026, 10, 9, tzinfo=dt.timezone.utc))
        self.inbox["candidates"][0]["sourceText"] += "alterado"
        with self.assertRaises(ValueError):
            module.prepare(self.inbox, "fixture", self.now)

    def test_wrong_channel_and_ambiguous_selection_fail(self):
        self.inbox["candidates"][0]["channelId"] = "otro"
        with self.assertRaises(ValueError):
            module.prepare(self.inbox, "fixture", self.now)
        self.inbox["candidates"] *= 2
        with self.assertRaises(ValueError):
            module.prepare(self.inbox, "fixture", self.now)


if __name__ == "__main__":
    unittest.main()
