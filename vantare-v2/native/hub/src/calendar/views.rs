//! Rejillas puras de Carreras Orbit. El propietario proporciona zona y reloj;
//! `chrono::Local` usa la zona del SO, `FixedOffset` sirve para UTC/offsets.
use super::{Schedule, Series};
use chrono::{DateTime, Datelike, Duration, NaiveDate, Offset, TimeZone, Timelike, Utc};
use std::collections::BTreeMap;

pub const WEEK_SLOTS: usize = 4;

#[derive(Clone, Copy, Default)]
pub struct Filter<'a> {
    /// None = todas; valores publicados: beginner/intermediate/advanced/weekly.
    pub tier: Option<&'a str>,
    pub followed_only: bool,
    pub followed: &'a [String],
}
impl Filter<'_> {
    pub fn includes(self, series: &Series) -> bool {
        self.tier.is_none_or(|tier| tier == series.tier)
            && (!self.followed_only || self.followed.contains(&series.id))
    }
}

pub fn tier_counts(schedule: &Schedule) -> BTreeMap<&str, usize> {
    let mut counts = BTreeMap::from([("all", schedule.series.len())]);
    for series in &schedule.series {
        *counts.entry(series.tier.as_str()).or_default() += 1;
    }
    counts
}

#[derive(Clone)]
pub struct Start<'a> {
    pub series: &'a Series,
    pub at: DateTime<Utc>,
}

pub fn starts<'a>(
    schedule: &'a Schedule,
    filter: Filter<'_>,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
) -> Result<Vec<Start<'a>>, String> {
    let mut rows = Vec::new();
    for series in schedule.series.iter().filter(|s| filter.includes(s)) {
        rows.extend(
            schedule
                .starts(series, from, to)?
                .into_iter()
                .map(|at| Start { series, at }),
        );
    }
    rows.sort_by(|a, b| {
        a.at.cmp(&b.at)
            .then_with(|| a.series.name.cmp(&b.series.name))
    });
    Ok(rows)
}

/// Medianoche civil, no suma 24 h: conserva días DST de 23/25 h.
pub fn midnight<T: TimeZone>(date: NaiveDate, zone: &T) -> Result<DateTime<Utc>, String> {
    let local = date.and_hms_opt(0, 0, 0).ok_or("medianoche inválida")?;
    zone.from_local_datetime(&local)
        .earliest()
        .map(|at| at.with_timezone(&Utc))
        .ok_or_else(|| "medianoche inexistente en la zona elegida".into())
}

pub fn week_anchor(date: NaiveDate) -> Result<NaiveDate, String> {
    date.checked_sub_signed(Duration::days(i64::from(
        date.weekday().num_days_from_monday(),
    )))
    .ok_or_else(|| "semana fuera de rango".into())
}

/// Inicio del tramo horario observado, incluso hora repetida y cambios de 30 min.
pub fn timeline_start<T: TimeZone>(now: DateTime<Utc>, zone: &T) -> Result<DateTime<Utc>, String> {
    let local = now.with_timezone(zone);
    let elapsed = Duration::seconds(i64::from(local.minute() * 60 + local.second()))
        + Duration::nanoseconds(i64::from(local.nanosecond()));
    let mut start = now
        .checked_sub_signed(elapsed)
        .ok_or("hora fuera de rango")?;
    let offset = local.offset().fix();
    if start.with_timezone(zone).offset().fix() != offset {
        let mut end = now;
        while (end - start).num_milliseconds() > 1 {
            let middle = start + Duration::milliseconds((end - start).num_milliseconds() / 2);
            if middle.with_timezone(zone).offset().fix() == offset {
                end = middle;
            } else {
                start = middle;
            }
        }
        start = end;
    }
    Ok(start)
}

pub fn group_by_day<'a, T: TimeZone>(
    rows: &[Start<'a>],
    zone: &T,
) -> BTreeMap<NaiveDate, Vec<Start<'a>>> {
    let mut groups: BTreeMap<_, Vec<_>> = BTreeMap::new();
    for row in rows {
        groups
            .entry(row.at.with_timezone(zone).date_naive())
            .or_default()
            .push(row.clone());
    }
    groups
}

/// Evento fechado, distinto de las ocurrencias generadas del catálogo.
pub struct Event {
    pub id: String,
    pub title: String,
    pub source: String,
    pub start: DateTime<Utc>,
    pub end: Option<DateTime<Utc>>,
}

/// Identidad productiva Go `makeSeriesEvent`, nunca título ni filtro activo.
/// El llamador agrupa estas listas junto a las celdas Día/Mes de la misma fecha.
pub fn specials_by_day<'a, T: TimeZone>(
    schedule: &Schedule,
    events: &'a [Event],
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    zone: &T,
) -> BTreeMap<NaiveDate, Vec<&'a Event>> {
    let mut groups: BTreeMap<_, Vec<_>> = BTreeMap::new();
    let mut visible: Vec<_> = events
        .iter()
        .filter(|event| {
            if event.start < from || event.start >= to {
                return false;
            }
            let suffix = format!("-{}", event.start.format("%Y%m%dT%H%M%SZ"));
            let generated = event.source == "vantare-bundled-lmu"
                && event
                    .id
                    .strip_suffix(&suffix)
                    .is_some_and(|id| schedule.series.iter().any(|s| s.id == id));
            !generated
        })
        .collect();
    visible.sort_by_key(|event| event.start);
    for event in visible {
        groups
            .entry(event.start.with_timezone(zone).date_naive())
            .or_default()
            .push(event);
    }
    groups
}

pub struct DayHour<'a> {
    pub hour: u32,
    pub now: bool,
    /// Dos ocurrencias de una hora repetida conservan sus instantes UTC distintos.
    pub events: Vec<Start<'a>>,
}
pub fn day_rows<'a, T: TimeZone>(
    schedule: &'a Schedule,
    filter: Filter<'_>,
    day: NaiveDate,
    now: DateTime<Utc>,
    zone: &T,
) -> Result<Vec<DayHour<'a>>, String> {
    let end = day.succ_opt().ok_or("día fuera de rango")?;
    let events = starts(schedule, filter, midnight(day, zone)?, midnight(end, zone)?)?;
    let local_now = now.with_timezone(zone);
    Ok((0..24)
        .map(|hour| DayHour {
            hour,
            now: day == local_now.date_naive() && hour == local_now.hour(),
            events: events
                .iter()
                .filter(|row| row.at.with_timezone(zone).hour() == hour)
                .cloned()
                .collect(),
        })
        .collect())
}

#[derive(Debug)]
pub struct WeekCell {
    pub day: NaiveDate,
    pub today: bool,
    pub past: bool,
    pub slots: Vec<DateTime<Utc>>,
    pub more: usize,
    pub total: usize,
}
pub struct WeekRow<'a> {
    pub series: &'a Series,
    pub cells: Vec<WeekCell>,
}
pub fn week_rows<'a, T: TimeZone>(
    schedule: &'a Schedule,
    filter: Filter<'_>,
    monday: NaiveDate,
    now: DateTime<Utc>,
    zone: &T,
) -> Result<Vec<WeekRow<'a>>, String> {
    let today = now.with_timezone(zone).date_naive();
    let mut rows = Vec::new();
    for series in schedule.series.iter().filter(|s| filter.includes(s)) {
        let mut cells = Vec::new();
        for index in 0..7 {
            let day = monday
                .checked_add_signed(Duration::days(index))
                .ok_or("semana fuera de rango")?;
            let end = day.succ_opt().ok_or("día fuera de rango")?;
            let all = schedule.starts(series, midnight(day, zone)?, midnight(end, zone)?)?;
            let upcoming: Vec<_> = all
                .iter()
                .copied()
                .filter(|at| day != today || *at >= now)
                .collect();
            let shown = if upcoming.is_empty() { &all } else { &upcoming };
            cells.push(WeekCell {
                day,
                today: day == today,
                past: day < today,
                slots: shown.iter().copied().take(WEEK_SLOTS).collect(),
                more: shown.len().saturating_sub(WEEK_SLOTS),
                total: all.len(),
            });
        }
        rows.push(WeekRow { series, cells });
    }
    Ok(rows)
}

pub struct MonthSeries<'a> {
    pub series: &'a Series,
    pub slots: usize,
}
pub struct MonthDay<'a> {
    pub day: NaiveDate,
    pub other: bool,
    pub today: bool,
    pub daily: usize,
    pub weekly: Vec<MonthSeries<'a>>,
    pub special_series: Vec<MonthSeries<'a>>,
}
pub fn month_days<'a, T: TimeZone>(
    schedule: &'a Schedule,
    filter: Filter<'_>,
    anchor: NaiveDate,
    now: DateTime<Utc>,
    zone: &T,
) -> Result<Vec<MonthDay<'a>>, String> {
    let first = anchor.with_day(1).ok_or("mes inválido")?;
    let start = week_anchor(first)?;
    let mut days = Vec::new();
    for index in 0..42 {
        let day = start
            .checked_add_signed(Duration::days(index))
            .ok_or("mes fuera de rango")?;
        let mut cell = MonthDay {
            day,
            other: day.month() != first.month() || day.year() != first.year(),
            today: day == now.with_timezone(zone).date_naive(),
            daily: 0,
            weekly: vec![],
            special_series: vec![],
        };
        if !cell.other {
            let end = day.succ_opt().ok_or("día fuera de rango")?;
            for series in schedule.series.iter().filter(|s| filter.includes(s)) {
                let slots = schedule
                    .starts(series, midnight(day, zone)?, midnight(end, zone)?)?
                    .len();
                if slots == 0 {
                    continue;
                }
                if series.recurrence.kind == "interval" {
                    cell.daily += 1;
                } else if series.event_kind == "special" {
                    cell.special_series.push(MonthSeries { series, slots });
                } else {
                    cell.weekly.push(MonthSeries { series, slots });
                }
            }
        }
        days.push(cell);
    }
    Ok(days)
}

pub struct TimelineRow<'a> {
    pub series: &'a Series,
    pub starts: Vec<DateTime<Utc>>,
    pub block_min: u32,
}
pub fn timeline_rows<'a>(
    schedule: &'a Schedule,
    filter: Filter<'_>,
    start: DateTime<Utc>,
    span_hours: u32,
) -> Result<Vec<TimelineRow<'a>>, String> {
    if !(1..=24).contains(&span_hours) {
        return Err("rango temporal fuera de 1..24 h".into());
    }
    let end = start
        .checked_add_signed(Duration::hours(i64::from(span_hours)))
        .ok_or("timeline fuera de rango")?;
    schedule
        .series
        .iter()
        .filter(|s| filter.includes(s))
        .map(|series| {
            Ok(TimelineRow {
                series,
                starts: schedule.starts(series, start, end)?,
                block_min: 4,
            })
        })
        .collect()
}

pub fn clamp_zoom(zoom: f64) -> f64 {
    if zoom.is_finite() {
        zoom.clamp(1.0, 4.0)
    } else {
        1.0
    }
}
pub fn fit_zoom(range: u32) -> Result<f64, String> {
    if ![6, 12, 24].contains(&range) {
        return Err("rango esperado: 6, 12 o 24 h".into());
    }
    Ok(clamp_zoom(24.0 / f64::from(range)))
}
pub fn px_per_hour(axis_width: f64, zoom: f64) -> f64 {
    (axis_width / 24.0 * clamp_zoom(zoom)).max(1.0)
}
pub fn tick_every_min(px_per_hour: f64) -> u32 {
    if px_per_hour >= 220.0 {
        return 15;
    }
    if px_per_hour >= 110.0 {
        return 30;
    }
    [60, 120, 180, 240, 360, 720, 1440]
        .into_iter()
        .find(|m| f64::from(*m) / 60.0 * px_per_hour >= 50.0)
        .unwrap_or(1440)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Interval {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}
/// Carriles para bloques [start,end), en orden de entrada; tocarse no es solapar.
pub fn overlap_lanes(intervals: &[Interval]) -> Result<Vec<usize>, String> {
    if intervals.iter().any(|i| i.end <= i.start) {
        return Err("intervalo vacío/invertido".into());
    }
    let mut order: Vec<_> = (0..intervals.len()).collect();
    order.sort_by_key(|&i| (intervals[i].start, i));
    let mut ends = Vec::new();
    let mut lanes = vec![0; intervals.len()];
    for index in order {
        let item = intervals[index];
        let lane = ends
            .iter()
            .position(|end| *end <= item.start)
            .unwrap_or(ends.len());
        if lane == ends.len() {
            ends.push(item.end);
        } else {
            ends[lane] = item.end;
        }
        lanes[index] = lane;
    }
    Ok(lanes)
}

#[cfg(test)]
mod tests;
