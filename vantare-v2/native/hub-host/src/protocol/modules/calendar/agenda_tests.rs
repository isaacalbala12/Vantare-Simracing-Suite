use super::*;
use chrono::{FixedOffset, LocalResult, NaiveDate, NaiveDateTime};
#[derive(Clone)]
struct Zone {
    change: i64,
    before: i32,
    after: i32,
}
impl Zone {
    fn offset(&self, at: i64) -> FixedOffset {
        FixedOffset::east_opt(if at < self.change {
            self.before
        } else {
            self.after
        })
        .unwrap()
    }
}
impl TimeZone for Zone {
    type Offset = FixedOffset;
    fn from_offset(offset: &FixedOffset) -> Self {
        Self {
            change: i64::MAX,
            before: offset.local_minus_utc(),
            after: offset.local_minus_utc(),
        }
    }
    fn offset_from_local_date(&self, date: &NaiveDate) -> LocalResult<FixedOffset> {
        self.offset_from_local_datetime(&date.and_hms_opt(12, 0, 0).unwrap())
    }
    fn offset_from_local_datetime(&self, at: &NaiveDateTime) -> LocalResult<FixedOffset> {
        let mut candidates = Vec::new();
        for seconds in [self.before, self.after] {
            let utc = at.and_utc().timestamp_millis() - i64::from(seconds) * 1000;
            if self.offset(utc).local_minus_utc() == seconds && !candidates.contains(&seconds) {
                candidates.push(seconds);
            }
        }
        match candidates.as_slice() {
            [] => LocalResult::None,
            [only] => LocalResult::Single(FixedOffset::east_opt(*only).unwrap()),
            [a, b] => LocalResult::Ambiguous(
                FixedOffset::east_opt(*a).unwrap(),
                FixedOffset::east_opt(*b).unwrap(),
            ),
            _ => unreachable!(),
        }
    }
    fn offset_from_utc_date(&self, date: &NaiveDate) -> FixedOffset {
        self.offset(
            date.and_hms_opt(12, 0, 0)
                .unwrap()
                .and_utc()
                .timestamp_millis(),
        )
    }
    fn offset_from_utc_datetime(&self, at: &NaiveDateTime) -> FixedOffset {
        self.offset(at.and_utc().timestamp_millis())
    }
}
fn at(text: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(text)
        .unwrap()
        .timestamp_millis()
}
fn schedule(from: &str, until: &str) -> CalendarSchedule {
    super::super::CalendarSchedule::parse(&serde_json::to_vec(&serde_json::json!({"version":1,"timezone":"UTC","validFrom":from,"validUntil":until,"series":[{"id":"qa","name":"QA","track":"Spa","vehicleClass":"GT3","licenseLabel":"Bronce","recurrence":{"kind":"interval","intervalMinutes":60}}]})).unwrap()).unwrap()
}
fn alerts(days: super::super::CalendarDays, mode: CalendarBandMode) -> CalendarAlerts {
    CalendarAlerts {
        bands: vec![super::super::CalendarBand {
            series_id: "qa".into(),
            from: 0,
            to: 240,
            days,
            mode,
        }],
        ..Default::default()
    }
}
#[test]
fn first_uses_one_am_when_midnight_does_not_exist_and_failed_expansion_is_only_none() {
    let zone = Zone {
        change: at("2026-09-06T04:00:00Z"),
        before: -14400,
        after: -10800,
    };
    let mut schedule = schedule("2026-09-05T00:00:00Z", "2026-09-08T00:00:00Z");
    let alerts = alerts(super::super::CalendarDays::All, CalendarBandMode::First);
    assert_eq!(
        cause_in(
            &schedule,
            &schedule.series[0],
            at("2026-09-06T04:00:00Z"),
            &alerts,
            &zone
        ),
        Ok(Some(Cause::Band))
    );
    assert_eq!(
        cause_in(
            &schedule,
            &schedule.series[0],
            at("2026-09-06T05:00:00Z"),
            &alerts,
            &zone
        ),
        Ok(None)
    );
    schedule.series[0].recurrence.interval_minutes = 0;
    assert_eq!(
        cause_in(
            &schedule,
            &schedule.series[0],
            at("2026-09-06T04:00:00Z"),
            &alerts,
            &zone
        ),
        Ok(None)
    );
}
#[test]
fn civil_weekdays_weekends_and_repeated_hour_are_injected() {
    let schedule = schedule("2026-10-23T00:00:00Z", "2026-10-27T00:00:00Z");
    let zone = Zone {
        change: at("2026-10-25T01:00:00Z"),
        before: 7200,
        after: 3600,
    };
    let weekdays = alerts(super::super::CalendarDays::Weekdays, CalendarBandMode::Each);
    let weekend = alerts(super::super::CalendarDays::Weekend, CalendarBandMode::Each);
    assert_eq!(
        cause_in(
            &schedule,
            &schedule.series[0],
            at("2026-10-23T00:00:00Z"),
            &weekdays,
            &zone
        ),
        Ok(Some(Cause::Band))
    );
    assert_eq!(
        cause_in(
            &schedule,
            &schedule.series[0],
            at("2026-10-25T00:00:00Z"),
            &weekdays,
            &zone
        ),
        Ok(None)
    );
    for text in ["2026-10-25T00:00:00Z", "2026-10-25T01:00:00Z"] {
        assert_eq!(
            cause_in(&schedule, &schedule.series[0], at(text), &weekend, &zone),
            Ok(Some(Cause::Band))
        );
    }
    let mut first = weekend;
    first.bands[0].from = 120;
    first.bands[0].to = 180;
    first.bands[0].mode = CalendarBandMode::First;
    assert_eq!(
        cause_in(
            &schedule,
            &schedule.series[0],
            at("2026-10-25T00:00:00Z"),
            &first,
            &zone
        ),
        Ok(Some(Cause::Band))
    );
    assert_eq!(
        cause_in(
            &schedule,
            &schedule.series[0],
            at("2026-10-25T01:00:00Z"),
            &first,
            &zone
        ),
        Ok(None)
    );
}
#[test]
fn pure_host_agenda_matches_generated_frozen_gpui_oracle() {
    let cases: serde_json::Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../fixtures/calendar/cases.json"
    )))
    .unwrap();
    let october: serde_json::Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../hub/reference/fixtures/calendar-lmu-2026-10-06.json"
    )))
    .unwrap();
    let oracle: serde_json::Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../hub-web/fixtures/calendar-agenda-gpui.json"
    )))
    .unwrap();
    assert_eq!(
        oracle["sources"]["model"],
        vantare_services::content_hash(include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../hub/src/calendar/model.rs"
        )))
    );
    let cases_oracle = oracle["cases"].as_array().unwrap();
    assert!(cases_oracle.len() >= 30);
    for case in cases_oracle {
        let mut document = if case["source"] == "october" {
            october.clone()
        } else {
            cases
                .as_array()
                .unwrap()
                .iter()
                .find(|item| item["name"] == case["case"])
                .unwrap()["document"]
                .clone()
        };
        let raw = document["series"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|series| series["id"] == case["seriesId"])
            .unwrap();
        raw["startOffsetMinute"] = case["startOffsetMinute"].clone();
        raw["recurrence"]["intervalMinutes"] = case["intervalMinutes"].clone();
        let schedule = CalendarSchedule::parse(&serde_json::to_vec(&document).unwrap()).unwrap();
        let series = schedule
            .series
            .iter()
            .find(|s| s.id == case["seriesId"].as_str().unwrap())
            .unwrap();
        let expected: Vec<i64> = serde_json::from_value(case["starts"].clone()).unwrap();
        let actual = starts(
            &schedule,
            series,
            case["from"].as_i64().unwrap(),
            case["until"].as_i64().unwrap(),
        )
        .unwrap();
        assert_eq!(actual, expected, "{case}");
        let alerts: CalendarAlerts = serde_json::from_value(case["alerts"].clone()).unwrap();
        let zone =
            FixedOffset::east_opt(i32::try_from(case["offsetSeconds"].as_i64().unwrap()).unwrap())
                .unwrap();
        let actual: Vec<_> = actual
            .into_iter()
            .map(
                |at| match cause_in(&schedule, series, at, &alerts, &zone).unwrap() {
                    Some(Cause::Band) => "band",
                    Some(Cause::Slot) => "slot",
                    None => "none",
                },
            )
            .collect();
        let expected: Vec<String> = serde_json::from_value(case["causes"].clone()).unwrap();
        assert_eq!(actual, expected, "{case}");
    }
}
