use super::*;
use chrono::{FixedOffset, LocalResult, NaiveDateTime};

fn at(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .expect("fecha")
        .with_timezone(&Utc)
}
fn fixture() -> Schedule {
    Schedule::parse(br#"{"version":1,"timezone":"UTC","validFrom":"2026-01-01T00:00:00Z","validUntil":"2029-01-01T00:00:00Z","series":[
        {"id":"a","name":"Alfa","tier":"beginner","track":"Fuji","vehicleClass":"GT3","licenseLabel":"Bronze","recurrence":{"kind":"interval","intervalMinutes":15}},
        {"id":"w","name":"Weekly","tier":"weekly","eventKind":"weekly","track":"Fuji","vehicleClass":"GT3","licenseLabel":"Gold","recurrence":{"kind":"weekly-slots","days":["Tue"],"timesUTC":["02:00","23:00"]}},
        {"id":"s","name":"Special","tier":"weekly","eventKind":"special","track":"Fuji","vehicleClass":"GT3","licenseLabel":"Gold","recurrence":{"kind":"weekly-slots","days":["Tue"],"timesUTC":["12:00"]}}
    ]}"#).expect("agenda")
}

#[test]
fn frontend_day_week_month_categories_and_followed_cases() {
    let schedule = fixture();
    let now = at("2026-07-07T18:07:30Z");
    let followed = vec!["w".into()];
    for (tier, followed_only, expected) in [
        (None, false, 3),
        (Some("beginner"), false, 1),
        (Some("weekly"), false, 2),
        (None, true, 1),
        (Some("beginner"), true, 0),
    ] {
        let filter = Filter {
            tier,
            followed_only,
            followed: &followed,
        };
        assert_eq!(
            timeline_rows(&schedule, filter, now, 24)
                .expect("timeline")
                .len(),
            expected
        );
    }
    assert_eq!(tier_counts(&schedule)["all"], 3);
    let day = now.date_naive();
    let rows = day_rows(&schedule, Filter::default(), day, now, &Utc).expect("día");
    assert_eq!(rows.len(), 24);
    assert_eq!(rows.iter().filter(|r| r.now).count(), 1);
    assert_eq!(rows[0].events.len(), 4);
    let week = week_rows(
        &schedule,
        Filter::default(),
        week_anchor(day).expect("lunes"),
        now,
        &Utc,
    )
    .expect("semana");
    assert_eq!(week[0].cells.len(), 7);
    let today = &week[0].cells[1];
    assert_eq!(today.total, 96);
    assert_eq!(today.slots.len(), WEEK_SLOTS);
    assert!(today.slots[0] >= now);
    assert_eq!(today.more, 19);
    let closed = week_rows(
        &schedule,
        Filter::default(),
        day,
        at("2026-07-07T23:59:59Z"),
        &Utc,
    )
    .expect("cerrado");
    assert_eq!(closed[0].cells[0].more, 92);
}

#[test]
fn frontend_month_grid_and_classification_cases() {
    let schedule = fixture();
    for month in [
        "2026-03-01T00:00:00Z",
        "2026-10-01T00:00:00Z",
        "2026-12-01T00:00:00Z",
        "2028-02-01T00:00:00Z",
    ] {
        let first = at(month);
        let cells = month_days(
            &schedule,
            Filter::default(),
            first.date_naive(),
            first,
            &Utc,
        )
        .expect("mes");
        assert_eq!(cells.len(), 42);
        assert_eq!(
            cells
                .iter()
                .map(|c| c.day)
                .collect::<std::collections::BTreeSet<_>>()
                .len(),
            42
        );
        assert_eq!(cells.iter().filter(|c| c.today).count(), 1);
        assert!(
            cells
                .iter()
                .filter(|c| c.other)
                .all(|c| c.daily == 0 && c.weekly.is_empty() && c.special_series.is_empty())
        );
        if first.year() == 2028 {
            assert!(
                cells
                    .iter()
                    .any(|c| c.day.day() == 29 && c.day.month() == 2)
            );
        }
        assert!(
            cells
                .iter()
                .flat_map(|c| &c.weekly)
                .all(|s| s.series.id == "w")
        );
        assert!(
            cells
                .iter()
                .flat_map(|c| &c.special_series)
                .all(|s| s.series.id == "s")
        );
    }
}

// Zona de prueba con una transición explícita; no cambia TZ global ni usa I/O.
#[derive(Clone)]
struct Transition {
    at: DateTime<Utc>,
    before: FixedOffset,
    after: FixedOffset,
}
impl TimeZone for Transition {
    type Offset = FixedOffset;
    fn from_offset(offset: &FixedOffset) -> Self {
        Self {
            at: DateTime::<Utc>::MAX_UTC,
            before: *offset,
            after: *offset,
        }
    }
    fn offset_from_local_date(&self, date: &NaiveDate) -> LocalResult<FixedOffset> {
        self.offset_from_local_datetime(&date.and_hms_opt(0, 0, 0).expect("medianoche"))
    }
    fn offset_from_local_datetime(&self, date: &NaiveDateTime) -> LocalResult<FixedOffset> {
        let mut candidates = Vec::new();
        for offset in [self.before, self.after] {
            let utc = *date - Duration::seconds(i64::from(offset.local_minus_utc()));
            if self.offset_from_utc_datetime(&utc) == offset && !candidates.contains(&offset) {
                candidates.push(offset);
            }
        }
        match candidates.as_slice() {
            [one] => LocalResult::Single(*one),
            [one, two] => LocalResult::Ambiguous(*one, *two),
            _ => LocalResult::None,
        }
    }
    fn offset_from_utc_date(&self, date: &NaiveDate) -> FixedOffset {
        self.offset_from_utc_datetime(&date.and_hms_opt(0, 0, 0).expect("medianoche"))
    }
    fn offset_from_utc_datetime(&self, date: &NaiveDateTime) -> FixedOffset {
        if *date < self.at.naive_utc() {
            self.before
        } else {
            self.after
        }
    }
}
#[test]
fn frontend_dst_days_and_repeated_half_hours_keep_all_instants() {
    let schedule = fixture();
    for (transition, before, after, day, slots) in [
        (
            "2026-03-29T01:00:00Z",
            3600,
            7200,
            "2026-03-29T12:00:00Z",
            92,
        ),
        (
            "2026-10-25T01:00:00Z",
            7200,
            3600,
            "2026-10-25T12:00:00Z",
            100,
        ),
        (
            "2026-04-04T15:00:00Z",
            39600,
            37800,
            "2026-04-05T02:00:00Z",
            98,
        ),
    ] {
        let zone = Transition {
            at: at(transition),
            before: FixedOffset::east_opt(before).expect("offset"),
            after: FixedOffset::east_opt(after).expect("offset"),
        };
        let now = at(day);
        let date = now.with_timezone(&zone).date_naive();
        assert_eq!(
            day_rows(
                &schedule,
                Filter {
                    tier: Some("beginner"),
                    ..Filter::default()
                },
                date,
                now,
                &zone
            )
            .expect("día DST")
            .iter()
            .map(|r| r.events.len())
            .sum::<usize>(),
            slots
        );
        assert_eq!(
            week_rows(&schedule, Filter::default(), date, now, &zone).expect("semana DST")[0].cells
                [0]
            .total,
            slots
        );
    }
    for (transition, before, after, now, expected) in [
        (
            "2026-10-25T01:00:00Z",
            7200,
            3600,
            "2026-10-25T01:30:00Z",
            "2026-10-25T01:00:00Z",
        ),
        (
            "2026-04-04T15:00:00Z",
            39600,
            37800,
            "2026-04-04T15:15:00Z",
            "2026-04-04T15:00:00Z",
        ),
        (
            "2026-10-03T15:30:00Z",
            37800,
            39600,
            "2026-10-03T15:45:00Z",
            "2026-10-03T15:30:00Z",
        ),
    ] {
        let zone = Transition {
            at: at(transition),
            before: FixedOffset::east_opt(before).expect("offset"),
            after: FixedOffset::east_opt(after).expect("offset"),
        };
        assert_eq!(timeline_start(at(now), &zone).expect("tramo"), at(expected));
    }
}

#[test]
fn timezone_grouping_offsets_overlap_and_zoom_match_frontend() {
    let schedule = fixture();
    let start = at("2026-07-07T23:30:00Z");
    let rows = starts(
        &schedule,
        Filter {
            tier: Some("beginner"),
            ..Filter::default()
        },
        start,
        start + Duration::hours(1),
    )
    .expect("salidas");
    assert_eq!(group_by_day(&rows, &Utc).len(), 2);
    assert_eq!(
        group_by_day(&rows, &FixedOffset::east_opt(7200).expect("offset")).len(),
        1
    );
    let intervals = [(15, 25), (0, 10), (5, 15), (10, 20)].map(|(from, to)| Interval {
        start: start + Duration::minutes(from),
        end: start + Duration::minutes(to),
    });
    assert_eq!(overlap_lanes(&intervals).expect("carriles"), [1, 0, 1, 0]);
    assert!(overlap_lanes(&[Interval { start, end: start }]).is_err());
    for (input, expected) in [(f64::NAN, 1.0_f64), (-1.0, 1.0), (8.0, 4.0), (2.0, 2.0)] {
        assert_eq!(clamp_zoom(input).to_bits(), expected.to_bits());
    }
    for (range, expected) in [(6, 4.0_f64), (12, 2.0), (24, 1.0)] {
        assert_eq!(fit_zoom(range).expect("zoom").to_bits(), expected.to_bits());
    }
    for (pixels, expected) in [
        (220.0, 15),
        (110.0, 30),
        (50.0, 60),
        (25.0, 120),
        (1.0, 1440),
    ] {
        assert_eq!(tick_every_min(pixels), expected);
    }
    assert_eq!(px_per_hour(1200.0, 2.0).to_bits(), 100.0_f64.to_bits());
    assert!(timeline_rows(&schedule, Filter::default(), start, 0).is_err());
    let mut offset_schedule = fixture();
    offset_schedule.series[0].start_offset_minute = 5;
    assert_eq!(
        offset_schedule
            .starts(
                &offset_schedule.series[0],
                at("2026-07-07T00:00:00Z"),
                at("2026-07-07T00:15:00Z")
            )
            .expect("offset"),
        [at("2026-07-07T00:05:00Z")]
    );
}

#[test]
fn frontend_specials_classification_uses_all_published_identities() {
    let schedule = fixture();
    let start = at("2026-07-07T00:00:00Z");
    let events: Vec<_> = [
        ("vantare-bundled-lmu", "a-20260707T000000Z"),
        ("import", "a-20260707T000000Z"),
        ("vantare-bundled-lmu", "special-event-20260707"),
        ("vantare-bundled-lmu", "a-20260707T010000Z"),
        ("vantare-bundled-lmu", "unknown-20260707T000000Z"),
    ]
    .map(|(source, id)| Event {
        id: id.into(),
        title: "Otro título".into(),
        source: source.into(),
        start,
        end: None,
    })
    .into();
    let groups = specials_by_day(&schedule, &events, start, start + Duration::days(1), &Utc);
    assert_eq!(groups[&start.date_naive()].len(), 4);
    assert_eq!(events.len(), 5);
    assert!(specials_by_day(&schedule, &events, start - Duration::days(1), start, &Utc).is_empty());
}

#[test]
fn frontend_twelve_weekly_starts_case_uses_the_published_seed() {
    let schedule = Schedule::parse(super::super::SEED.as_bytes()).expect("seed productivo");
    let series = schedule
        .series
        .iter()
        .find(|s| s.recurrence.times_utc.len() == 12)
        .expect("serie publicada con doce slots");
    assert!(!series.tier.is_empty());
    let followed = [series.id.clone()];
    let filter = Filter {
        followed_only: true,
        followed: &followed,
        ..Filter::default()
    };
    let now = at("2026-08-26T00:00:00Z");
    let rows = day_rows(&schedule, filter, now.date_naive(), now, &Utc).expect("día del seed");
    assert_eq!(rows.iter().map(|row| row.events.len()).sum::<usize>(), 12);
    let week = week_rows(&schedule, filter, now.date_naive(), now, &Utc).expect("semana del seed");
    assert_eq!(week[0].cells[0].total, 12);
}
