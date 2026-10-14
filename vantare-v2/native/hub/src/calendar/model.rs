//! Horario publicado en UTC: modelo, validación y expansión de salidas.
//! Sin red ni UI; el respaldo externo entra por `Schedule::with_fallback`.
use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveTime, Utc};
use serde::Deserialize;
use std::collections::HashSet;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    version: u32,
    timezone: String,
    pub(crate) valid_from: String,
    pub(crate) valid_until: String,
    pub series: Vec<Series>,
}

/// Procedencia del dato: el oficial siempre gana al respaldo.
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    #[default]
    Official,
    RaceControl,
    #[serde(other)]
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Daily,
    Weekly,
    Special,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Series {
    pub id: String,
    pub name: String,
    pub track: String,
    pub vehicle_class: String,
    #[serde(default)]
    pub classes: Vec<VehicleClass>,
    #[serde(default)]
    pub race_duration_min: Option<u32>,
    #[serde(default)]
    pub event_duration_min: Option<u32>,
    #[serde(default)]
    pub sessions: Vec<Session>,
    pub license_label: String,
    #[serde(default)]
    pub tier: String,
    #[serde(default)]
    pub event_kind: String,
    #[serde(default)]
    pub format: String,
    #[serde(default)]
    pub setup: String,
    #[serde(default)]
    pub assists: String,
    #[serde(default)]
    pub tyre_warmers: bool,
    #[serde(default)]
    pub tyres: Option<u32>,
    #[serde(default)]
    pub splits: Option<u32>,
    #[serde(default)]
    pub safety_rating: String,
    #[serde(default)]
    pub ve_limit: Option<u32>,
    #[serde(default)]
    pub notes: Vec<String>,
    #[serde(default)]
    pub source: Source,
    #[serde(default)]
    pub(crate) start_offset_minute: i64,
    pub(crate) recurrence: Recurrence,
}

#[derive(Clone, Deserialize)]
pub struct VehicleClass {
    pub name: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub name: String,
    pub duration_min: u32,
    #[serde(default)]
    pub estimated: bool,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Recurrence {
    pub(crate) kind: String,
    #[serde(default)]
    pub(crate) interval_minutes: i64,
    #[serde(default)]
    pub(crate) days: Vec<String>,
    #[serde(default, rename = "timesUTC")]
    pub(crate) times_utc: Vec<String>,
}

pub(crate) fn timestamp(value: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(value)
        .map(|date| date.with_timezone(&Utc))
        .map_err(|error| format!("fecha RFC3339: {error}"))
}

fn weekday(day: &str) -> Option<u32> {
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        .iter()
        .position(|name| *name == day)
        .and_then(|index| u32::try_from(index).ok())
}

/// Clase con su variante opcional (p. ej. LMGT3 · `McLaren` 720S).
#[derive(Clone)]
pub struct ClassChip {
    pub name: String,
    pub extra: Option<String>,
}

impl Series {
    pub fn kind(&self) -> Kind {
        match self.event_kind.as_str() {
            "special" => Kind::Special,
            "weekly" => Kind::Weekly,
            _ if self.recurrence.kind == "interval" => Kind::Daily,
            _ => Kind::Weekly,
        }
    }
    /// Minutos entre salidas de una serie diaria.
    pub fn every(&self) -> Option<i64> {
        (self.recurrence.kind == "interval").then_some(self.recurrence.interval_minutes)
    }
    /// Orden de nivel: Bronce, Plata, Oro, Semanal; los especiales al final.
    pub fn rank(&self) -> (u8, bool) {
        let tier = match self.tier.as_str() {
            "beginner" => 0,
            "intermediate" => 1,
            "advanced" => 2,
            _ => 3,
        };
        (tier, self.kind() == Kind::Special)
    }
    pub fn tier_label(&self) -> &'static str {
        if self.kind() == Kind::Special {
            return "Especial";
        }
        match self.tier.as_str() {
            "beginner" => "Bronce",
            "intermediate" => "Plata",
            "advanced" => "Oro",
            "weekly" => "Semanal",
            _ => "Sin nivel",
        }
    }
    /// Circuito sin el trazado entre paréntesis: «Sebring (WEC)» -> «Sebring».
    pub fn track_short(&self) -> &str {
        self.track.split(" (").next().unwrap_or(&self.track)
    }
    pub fn track_layout(&self) -> &str {
        self.track
            .split_once(" (")
            .map_or("", |(_, rest)| rest.trim_end_matches(')'))
    }
    pub fn class_chips(&self) -> Vec<ClassChip> {
        if self.classes.is_empty() {
            return vec![ClassChip {
                name: self.vehicle_class.clone(),
                extra: None,
            }];
        }
        self.classes
            .iter()
            .map(|class| {
                if class.name.contains("McLaren") {
                    ClassChip {
                        name: "LMGT3".into(),
                        extra: Some("McLaren 720S".into()),
                    }
                } else {
                    ClassChip {
                        name: class.name.clone(),
                        extra: None,
                    }
                }
            })
            .collect()
    }
    /// Práctica, clasificación y carrera en minutos; práctica 3 y clasificación 8
    /// cuando la publicación no trae sesiones (estimadas, nunca oficiales).
    pub fn phases(&self) -> [(u32, bool); 3] {
        let find = |name: &str, default: u32| {
            self.sessions
                .iter()
                .find(|session| session.name == name)
                .map_or((default, true), |s| (s.duration_min, s.estimated))
        };
        let race = self
            .sessions
            .iter()
            .find(|session| session.name == "race")
            .map(|s| (s.duration_min, s.estimated))
            .or_else(|| self.race_duration_min.map(|m| (m, false)))
            .unwrap_or((0, true));
        [find("practice", 3), find("qualifying", 8), race]
    }
    /// Minutos desde la salida hasta que empieza la carrera.
    pub fn lead_in_min(&self) -> i64 {
        let [practice, qualifying, _] = self.phases();
        i64::from(practice.0 + qualifying.0)
    }
    pub fn event_minutes(&self) -> i64 {
        self.event_duration_min.map_or_else(
            || self.lead_in_min() + i64::from(self.phases()[2].0),
            i64::from,
        )
    }
    pub fn race_minutes(&self) -> u32 {
        self.phases()[2].0
    }
    /// Minutos de la hora en que sale una serie diaria, ordenados; vacío si el
    /// intervalo no divide la hora (el patrón no se repite cada hora).
    pub fn minutes_of_hour(&self) -> Vec<i64> {
        let Some(every) = self.every().filter(|every| *every > 0 && 60 % *every == 0) else {
            return vec![];
        };
        let first = self.start_offset_minute.rem_euclid(every);
        (0..60 / every).map(|i| first + i * every).collect()
    }
    pub fn is_fallback(&self) -> bool {
        self.source == Source::RaceControl
    }
}

fn normalized(name: &str) -> String {
    name.chars()
        .filter(char::is_ascii_alphanumeric)
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

impl Schedule {
    pub fn parse(data: &[u8]) -> Result<Self, String> {
        let schedule: Self =
            serde_json::from_slice(data).map_err(|error| format!("agenda: {error}"))?;
        let (from, to) = schedule.window()?;
        if schedule.version != 1
            || schedule.timezone != "UTC"
            || to <= from
            || schedule.series.is_empty()
            || schedule.series.len() > 256
        {
            return Err("agenda inválida o zona no soportada (solo UTC)".into());
        }
        let mut ids = HashSet::new();
        for series in &schedule.series {
            if series.id.trim().is_empty()
                || series.name.trim().is_empty()
                || !ids.insert(&series.id)
            {
                return Err("serie sin identidad/nombre o duplicada".into());
            }
            let recurrence = &series.recurrence;
            match recurrence.kind.as_str() {
                "interval" if (1..=10080).contains(&recurrence.interval_minutes) => {}
                "weekly-slots"
                    if !recurrence.days.is_empty()
                        && !recurrence.times_utc.is_empty()
                        && recurrence.days.iter().all(|day| weekday(day).is_some())
                        && recurrence
                            .times_utc
                            .iter()
                            .all(|time| NaiveTime::parse_from_str(time, "%H:%M").is_ok()) => {}
                _ => return Err(format!("recurrencia inválida: {}", series.id)),
            }
        }
        Ok(schedule)
    }
    pub fn window(&self) -> Result<(DateTime<Utc>, DateTime<Utc>), String> {
        Ok((timestamp(&self.valid_from)?, timestamp(&self.valid_until)?))
    }
    pub fn is_current(&self, now: DateTime<Utc>) -> Result<bool, String> {
        let (from, to) = self.window()?;
        Ok(from <= now && now < to)
    }
    pub fn by_id(&self, id: &str) -> Option<&Series> {
        self.series.iter().find(|series| series.id == id)
    }
    /// Completa con el respaldo solo lo que el horario oficial no trae. Una
    /// serie presente en los dos gana la oficial; si difiere, se anota.
    /// Devuelve el horario combinado y las diferencias detectadas.
    pub fn with_fallback(mut self, mut fallback: Self) -> (Self, Vec<String>) {
        let mut differences = vec![];
        for extra in fallback.series.drain(..) {
            let key = normalized(&extra.name);
            match self.series.iter().find(|s| normalized(&s.name) == key) {
                None if self.series.len() < 256 && self.by_id(&extra.id).is_none() => {
                    self.series.push(Series {
                        source: Source::RaceControl,
                        ..extra
                    });
                }
                Some(official)
                    if official.every() != extra.every()
                        || normalized(&official.track) != normalized(&extra.track) =>
                {
                    differences.push(format!(
                        "{}: el oficial difiere de RaceControl",
                        official.name
                    ));
                }
                _ => {}
            }
        }
        (self, differences)
    }
    /// Mismos intervalos/slots UTC y ventana [from,to) que `ExpandSeries` de Go.
    pub fn starts(
        &self,
        series: &Series,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
    ) -> Result<Vec<DateTime<Utc>>, String> {
        let (valid_from, valid_to) = self.window()?;
        let from = from.max(valid_from);
        let to = to.min(valid_to);
        if to <= from {
            return Ok(vec![]);
        }
        let mut result = vec![];
        if series.recurrence.kind == "interval" {
            let base = NaiveDate::from_ymd_opt(1, 1, 1)
                .and_then(|date| date.and_hms_opt(0, 0, 0))
                .ok_or("fecha base")?
                .and_utc();
            let base = base
                .checked_add_signed(Duration::minutes(
                    series
                        .start_offset_minute
                        .rem_euclid(series.recurrence.interval_minutes),
                ))
                .ok_or("offset fuera de rango")?;
            let interval = Duration::minutes(series.recurrence.interval_minutes);
            let width = interval.num_milliseconds();
            let elapsed = (from - base).num_milliseconds();
            let rounded = elapsed.div_euclid(width) * width;
            let mut start = base
                .checked_add_signed(Duration::milliseconds(rounded))
                .ok_or("fecha fuera de rango")?;
            if start < from {
                start = start
                    .checked_add_signed(interval)
                    .ok_or("fecha fuera de rango")?;
            }
            while start < to {
                if result.len() == 10000 {
                    return Err("agenda supera 10000 carreras por serie".into());
                }
                result.push(start);
                start = start
                    .checked_add_signed(interval)
                    .ok_or("fecha fuera de rango")?;
            }
        } else {
            let mut date = from.date_naive();
            while date <= to.date_naive() {
                if series
                    .recurrence
                    .days
                    .iter()
                    .any(|day| weekday(day) == Some(date.weekday().num_days_from_monday()))
                {
                    for time in &series.recurrence.times_utc {
                        let time = NaiveTime::parse_from_str(time, "%H:%M")
                            .map_err(|error| error.to_string())?;
                        let start = date.and_time(time).and_utc();
                        if from <= start && start < to {
                            if result.len() == 10000 {
                                return Err("agenda supera 10000 carreras por serie".into());
                            }
                            result.push(start);
                        }
                    }
                }
                date = date.succ_opt().ok_or("fecha fuera de rango")?;
            }
        }
        result.sort_unstable();
        result.dedup();
        Ok(result)
    }
    /// Primera salida de la serie desde `now` hasta el fin de la publicación.
    pub fn next_start(&self, series: &Series, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
        let horizon = series
            .every()
            .map_or(Duration::days(7), |every| Duration::minutes(every.max(1)));
        self.starts(series, now, now + horizon)
            .ok()?
            .into_iter()
            .next()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(crate) const OCTOBER: &[u8] =
        include_bytes!("../../reference/fixtures/calendar-lmu-2026-10-06.json");

    fn at(value: &str) -> DateTime<Utc> {
        timestamp(value).expect("fecha")
    }

    #[test]
    fn real_october_publication_keeps_official_weekly_slots() {
        let schedule = Schedule::parse(OCTOBER).expect("horario real");
        assert!(
            schedule
                .is_current(at("2026-10-09T10:00:00Z"))
                .expect("vigencia")
        );
        assert_eq!(schedule.series.len(), 11);
        let special = schedule
            .by_id("weekly-10-hours-of-road-atlanta")
            .expect("evento");
        assert_eq!(special.kind(), Kind::Special);
        assert_eq!(special.race_minutes(), 600);
        assert_eq!(
            schedule
                .starts(
                    special,
                    at("2026-10-09T10:00:00Z"),
                    at("2026-10-10T10:00:00Z")
                )
                .expect("salidas"),
            vec![
                at("2026-10-09T15:00:00Z"),
                at("2026-10-09T21:00:00Z"),
                at("2026-10-10T02:00:00Z"),
                at("2026-10-10T09:00:00Z")
            ]
        );
    }

    #[test]
    fn interval_rounds_up_and_end_is_exclusive() {
        let schedule = Schedule::parse(OCTOBER).expect("horario");
        let daily = schedule.by_id("beginner-lmgt3-fixed").expect("serie");
        let from = at("2026-10-06T00:07:00Z");
        let starts = schedule
            .starts(daily, from, at("2026-10-06T01:00:00Z"))
            .expect("salidas");
        assert_eq!(
            starts,
            vec![
                at("2026-10-06T00:15:00Z"),
                at("2026-10-06T00:30:00Z"),
                at("2026-10-06T00:45:00Z")
            ]
        );
        assert!(
            schedule
                .starts(
                    daily,
                    at("2026-10-13T00:00:00Z"),
                    at("2026-10-14T00:00:00Z")
                )
                .expect("fuera")
                .is_empty()
        );
        assert_eq!(daily.minutes_of_hour(), vec![0, 15, 30, 45]);
    }

    #[test]
    fn phases_are_estimated_unless_published() {
        let schedule = Schedule::parse(OCTOBER).expect("horario");
        let series = schedule.by_id("beginner-lmgt3-fixed").expect("serie");
        assert_eq!(series.phases(), [(3, true), (8, true), (20, false)]);
        assert_eq!(series.lead_in_min(), 11);
        assert_eq!(series.event_minutes(), 31);
    }

    #[test]
    fn fallback_only_adds_missing_series_and_official_wins() {
        let official = Schedule::parse(OCTOBER).expect("horario");
        let mut raw: serde_json::Value = serde_json::from_slice(OCTOBER).expect("json");
        let mut series = raw["series"].as_array().expect("series").clone();
        let mut extra = series[0].clone();
        extra["id"] = "rc-caterham".into();
        extra["name"] = "Caterham Cup".into();
        let mut conflicting = series[1].clone();
        conflicting["id"] = "rc-lmp3".into();
        conflicting["recurrence"]["intervalMinutes"] = 45.into();
        series = vec![extra, conflicting];
        raw["series"] = series.into();
        let fallback = Schedule::parse(raw.to_string().as_bytes()).expect("respaldo");
        let (merged, differences) = official.with_fallback(fallback);
        assert_eq!(merged.series.len(), 12);
        let added = merged.by_id("rc-caterham").expect("añadida");
        assert!(added.is_fallback());
        assert!(
            !merged
                .by_id("beginner-lmp3-fixed")
                .expect("oficial")
                .is_fallback()
        );
        assert_eq!(
            merged.by_id("beginner-lmp3-fixed").and_then(Series::every),
            Some(15)
        );
        assert_eq!(differences.len(), 1);
    }

    #[test]
    fn malformed_recurrence_timezone_and_duplicate_ids_are_rejected() {
        let mut value: serde_json::Value = serde_json::from_slice(OCTOBER).expect("json");
        value["series"][0]["recurrence"]["intervalMinutes"] = 0.into();
        assert!(Schedule::parse(&serde_json::to_vec(&value).expect("json")).is_err());
        let mut value: serde_json::Value = serde_json::from_slice(OCTOBER).expect("json");
        value["timezone"] = "Europe/Madrid".into();
        assert!(Schedule::parse(&serde_json::to_vec(&value).expect("json")).is_err());
        let mut value: serde_json::Value = serde_json::from_slice(OCTOBER).expect("json");
        value["series"][1]["id"] = value["series"][0]["id"].clone();
        assert!(Schedule::parse(&serde_json::to_vec(&value).expect("json")).is_err());
    }
}
