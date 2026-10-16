//! Filas y rejillas puras de cada vista. Reciben el horario, el reloj y la zona;
//! nunca tocan disco ni UI, así se prueban sin ventana.
use super::{
    alerts::Alerts,
    clock::{Zone, week_days},
    model::{Kind, Schedule, Series},
};
use chrono::{DateTime, Duration, NaiveDate, Utc};

/// Antes de «ahora» que enseña la línea de tiempo, y su ancho total (min).
pub const LINE_BEFORE: i64 = 10;
pub const LINE_SPAN: i64 = 100;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Filter {
    pub only_favs: bool,
    /// `beginner`, `intermediate`, `advanced` o `weekly`.
    pub tier: Option<String>,
    pub class: Option<String>,
    pub query: String,
}

impl Filter {
    pub fn includes(&self, series: &Series, fav: bool) -> bool {
        let query = self.query.trim().to_lowercase();
        (!self.only_favs || fav)
            && self.tier.as_ref().is_none_or(|tier| *tier == series.tier)
            && self
                .class
                .as_ref()
                .is_none_or(|class| series.class_chips().iter().any(|c| c.name == *class))
            && (query.is_empty()
                || series.name.to_lowercase().contains(&query)
                || series.track.to_lowercase().contains(&query))
    }
}

pub struct Row<'a> {
    pub series: &'a Series,
    pub fav: bool,
    pub next: Option<DateTime<Utc>>,
    /// Salidas dentro de la línea de tiempo (-10 min, +90 min).
    pub starts: Vec<DateTime<Utc>>,
}

pub struct Board<'a> {
    pub favs: Vec<Row<'a>>,
    pub rest: Vec<Row<'a>>,
}

pub fn is_fav(favs: &[String], series: &Series) -> bool {
    favs.contains(&series.id)
}

/// Una fila por serie: favoritas arriba por salida más cercana; el resto por
/// nivel (Bronce → Oro → Semanal), especiales al final y luego por nombre.
pub fn board<'a>(
    schedule: &'a Schedule,
    now: DateTime<Utc>,
    favs: &[String],
    filter: &Filter,
) -> Board<'a> {
    let from = now - Duration::minutes(LINE_BEFORE);
    let to = from + Duration::minutes(LINE_SPAN);
    let mut favorites = vec![];
    let mut rest = vec![];
    for series in &schedule.series {
        let fav = is_fav(favs, series);
        if !filter.includes(series, fav) {
            continue;
        }
        let row = Row {
            series,
            fav,
            next: schedule.next_start(series, now),
            starts: schedule.starts(series, from, to).unwrap_or_default(),
        };
        if fav {
            favorites.push(row);
        } else {
            rest.push(row);
        }
    }
    favorites.sort_by_key(|row| (row.next.is_none(), row.next, row.series.name.clone()));
    rest.sort_by(|a, b| (a.series.rank(), &a.series.name).cmp(&(b.series.rank(), &b.series.name)));
    Board {
        favs: favorites,
        rest,
    }
}

pub struct Hero<'a> {
    pub series: &'a Series,
    pub at: DateTime<Utc>,
    pub race_at: DateTime<Utc>,
    pub alert: bool,
    /// Siguientes salidas de tus favoritas en las 6 h siguientes.
    pub after: Vec<(&'a Series, DateTime<Utc>)>,
}

/// La próxima carrera de tus favoritas, con lo que viene después.
pub fn hero<'a>(
    schedule: &'a Schedule,
    now: DateTime<Utc>,
    favs: &[String],
    alerts: &Alerts,
) -> Option<Hero<'a>> {
    let (series, at) = schedule
        .series
        .iter()
        .filter(|series| is_fav(favs, series))
        .filter_map(|series| Some((series, schedule.next_start(series, now)?)))
        .min_by_key(|(series, at)| (*at, series.name.clone()))?;
    let mut after = vec![];
    for other in schedule.series.iter().filter(|s| is_fav(favs, s)) {
        let starts = schedule
            .starts(other, at, at + Duration::hours(6))
            .unwrap_or_default();
        after.extend(
            starts
                .into_iter()
                .take(4)
                .filter(|t| !(other.id == series.id && *t == at))
                .map(|t| (other, t)),
        );
    }
    after.sort_by_key(|(s, t)| (*t, s.name.clone()));
    Some(Hero {
        series,
        at,
        race_at: at + Duration::minutes(series.lead_in_min()),
        alert: alerts.cause(schedule, series, at).is_some(),
        after,
    })
}

/// Todas las series diarias o todas las de evento, como en el contrato visual.
pub fn is_daily(series: &Series) -> bool {
    series.kind() == Kind::Daily
}

pub struct WeekRow<'a> {
    pub series: &'a Series,
    pub fav: bool,
    pub next: Option<DateTime<Utc>>,
    /// Salidas de cada día civil (solo eventos; las diarias son una barra).
    pub per_day: Vec<Vec<DateTime<Utc>>>,
}

pub struct Week<'a> {
    pub days: [NaiveDate; 7],
    /// Ventana civil de la semana en la zona elegida.
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
    pub events: Vec<WeekRow<'a>>,
    pub daily: Vec<WeekRow<'a>>,
}

/// Semana LMU (martes a lunes) que empieza en `start`, UTC 00:00.
pub fn week<'a>(
    schedule: &'a Schedule,
    start: DateTime<Utc>,
    now: DateTime<Utc>,
    zone: Zone,
    favs: &[String],
    only_favs: bool,
) -> Week<'a> {
    let days = week_days(start);
    let from = zone.day_start(days[0]);
    let to = zone.day_start(days[6] + Duration::days(1));
    let mut events = vec![];
    let mut daily = vec![];
    for series in &schedule.series {
        let fav = is_fav(favs, series);
        if only_favs && !fav {
            continue;
        }
        let per_day = if is_daily(series) {
            vec![]
        } else {
            days.iter()
                .map(|day| {
                    let (a, b) = (
                        zone.day_start(*day),
                        zone.day_start(*day + Duration::days(1)),
                    );
                    schedule.starts(series, a, b).unwrap_or_default()
                })
                .collect()
        };
        let row = WeekRow {
            series,
            fav,
            next: schedule.next_start(series, now),
            per_day,
        };
        if is_daily(series) {
            daily.push(row);
        } else {
            events.push(row);
        }
    }
    daily.sort_by(|a, b| (a.series.rank(), &a.series.name).cmp(&(b.series.rank(), &b.series.name)));
    Week {
        days,
        from,
        to,
        events,
        daily,
    }
}

/// Fracción 0..1 de `at` dentro de `[from, to)`, recortada.
pub fn fraction(at: DateTime<Utc>, from: DateTime<Utc>, to: DateTime<Utc>) -> f32 {
    let span = (to - from).num_seconds().max(1) as f32;
    ((at.clamp(from, to) - from).num_seconds() as f32 / span).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::calendar::{
        clock::week_start,
        model::{Schedule, timestamp},
    };

    const OCTOBER: &[u8] = include_bytes!("../../reference/fixtures/calendar-lmu-2026-10-06.json");
    const MADRID: Zone = Zone::Fixed(2 * 3600);

    fn at(value: &str) -> DateTime<Utc> {
        timestamp(value).expect("fecha")
    }
    fn favorites() -> Vec<String> {
        [
            "beginner-lmgt3-fixed",
            "weekly-wec-weekly",
            "weekly-10-hours-of-road-atlanta",
        ]
        .map(String::from)
        .to_vec()
    }

    #[test]
    fn board_puts_favorites_first_by_next_start_then_tier_order() {
        let schedule = Schedule::parse(OCTOBER).expect("horario");
        let now = at("2026-10-08T17:47:13Z");
        let board = board(&schedule, now, &favorites(), &Filter::default());
        assert_eq!(board.favs.len(), 3);
        assert_eq!(board.rest.len(), 8);
        // LMGT3 Fixed sale a las 18:00Z, WEC Weekly a las 18:00Z, 10 Hours mañana.
        assert_eq!(board.favs[0].series.id, "beginner-lmgt3-fixed");
        assert_eq!(board.favs[2].series.id, "weekly-10-hours-of-road-atlanta");
        let tiers: Vec<_> = board.rest.iter().map(|r| r.series.rank()).collect();
        assert!(tiers.windows(2).all(|w| w[0] <= w[1]), "Bronce → Oro");
        assert!(board.rest.iter().all(|r| r.next.is_some()));
    }

    #[test]
    fn board_filters_by_tier_class_search_and_favorites() {
        let schedule = Schedule::parse(OCTOBER).expect("horario");
        let now = at("2026-10-08T17:47:13Z");
        let favs = favorites();
        let only = Filter {
            only_favs: true,
            ..Filter::default()
        };
        assert_eq!(board(&schedule, now, &favs, &only).rest.len(), 0);
        let gold = Filter {
            tier: Some("advanced".into()),
            ..Filter::default()
        };
        assert_eq!(board(&schedule, now, &favs, &gold).rest.len(), 3);
        let class = Filter {
            class: Some("Hypercar".into()),
            ..Filter::default()
        };
        assert_eq!(board(&schedule, now, &favs, &class).favs.len(), 2);
        let search = Filter {
            query: "SPA".into(),
            ..Filter::default()
        };
        assert!(
            board(&schedule, now, &favs, &search)
                .rest
                .iter()
                .all(|r| r.series.track.contains("Spa"))
        );
    }

    #[test]
    fn expired_schedule_has_no_next_start() {
        let schedule = Schedule::parse(OCTOBER).expect("horario");
        let late = at("2026-10-13T08:12:40Z");
        let board = board(&schedule, late, &favorites(), &Filter::default());
        assert!(
            board
                .favs
                .iter()
                .chain(&board.rest)
                .all(|r| r.next.is_none() && r.starts.is_empty())
        );
        assert!(hero(&schedule, late, &favorites(), &Alerts::default()).is_none());
    }

    #[test]
    fn hero_is_the_nearest_favorite_with_what_comes_after() {
        let schedule = Schedule::parse(OCTOBER).expect("horario");
        let now = at("2026-10-08T17:47:13Z");
        let next = hero(&schedule, now, &favorites(), &Alerts::default()).expect("próxima");
        assert_eq!(next.at, at("2026-10-08T18:00:00Z"));
        // Práctica 3 + clasificación 8: la carrera sale 11 min después.
        assert_eq!(
            next.race_at - next.at,
            Duration::minutes(next.series.lead_in_min())
        );
        assert!(!next.alert);
        assert!(next.after.iter().all(|(_, t)| *t >= next.at));
        assert!(next.after.windows(2).all(|w| w[0].1 <= w[1].1));
        assert!(
            next.after
                .iter()
                .all(|(s, t)| !(s.id == next.series.id && *t == next.at))
        );
        assert!(
            next.after.iter().any(|(s, _)| s.id == "weekly-wec-weekly")
                || next.series.id == "weekly-wec-weekly"
        );
        assert!(hero(&schedule, now, &[], &Alerts::default()).is_none());
    }

    #[test]
    fn week_groups_events_by_local_day_and_dailies_into_bars() {
        let schedule = Schedule::parse(OCTOBER).expect("horario");
        let now = at("2026-10-08T17:47:13Z");
        let w = week(&schedule, week_start(now), now, MADRID, &favorites(), false);
        assert_eq!(w.events.len(), 2);
        assert_eq!(w.daily.len(), 9);
        assert!(w.daily.iter().all(|r| r.per_day.is_empty()));
        assert_eq!(w.from, at("2026-10-05T22:00:00Z"));
        let wec = &w.events[0];
        assert_eq!(wec.per_day.len(), 7);
        // WEC Weekly: martes a jueves, ocho tandas UTC por día; en Madrid la de
        // las 23:00Z del jueves ya es viernes y la de las 02:00Z del martes sigue siendo martes.
        let counts: Vec<_> = wec.per_day.iter().map(Vec::len).collect();
        assert_eq!(counts.iter().sum::<usize>(), 24);
        assert!(counts[0] >= 7);
        let only = week(&schedule, week_start(now), now, MADRID, &favorites(), true);
        assert_eq!(only.events.len(), 2);
        assert_eq!(only.daily.len(), 1);
    }

    #[test]
    fn fraction_is_clamped_to_the_window() {
        let (a, b) = (at("2026-10-06T00:00:00Z"), at("2026-10-13T00:00:00Z"));
        assert!((fraction(at("2026-10-09T12:00:00Z"), a, b) - 0.5).abs() < 1e-6);
        assert_eq!(fraction(at("2026-10-01T00:00:00Z"), a, b), 0.0);
        assert_eq!(fraction(at("2026-10-20T00:00:00Z"), a, b), 1.0);
    }
}
