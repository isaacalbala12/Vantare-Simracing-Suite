//! Avisos del calendario: franjas horarias para series diarias y tandas para
//! eventos. Lógica pura y persistencia; quien notifica es la shell.
//! Las franjas se evalúan en hora local: el cambio de hora no las mueve.
use super::{
    clock::Zone,
    model::{Kind, Schedule, Series},
};
use chrono::{DateTime, Datelike, Duration, TimeZone, Timelike, Utc, Weekday};
use serde::{Deserialize, Serialize};

pub const LEADS: [u8; 4] = [5, 10, 15, 30];
const MAX_BANDS: usize = 64;
const MAX_SLOTS: usize = 512;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Days {
    #[default]
    All,
    Weekdays,
    Weekend,
}

impl Days {
    pub fn label(self) -> &'static str {
        match self {
            Self::All => "Todos los días",
            Self::Weekdays => "Lun–vie",
            Self::Weekend => "Fin de semana",
        }
    }
    fn includes(self, day: Weekday) -> bool {
        match self {
            Self::All => true,
            Self::Weekdays => day.num_days_from_monday() < 5,
            Self::Weekend => day.num_days_from_monday() >= 5,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    /// Una notificación por cada salida de la franja.
    #[default]
    Each,
    /// Solo la primera salida de cada día dentro de la franja.
    First,
}

/// Franja de una serie diaria, en minutos desde medianoche local.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Band {
    pub series_id: String,
    pub from: u16,
    pub to: u16,
    #[serde(default)]
    pub days: Days,
    #[serde(default)]
    pub mode: Mode,
}

impl Band {
    /// ¿Cae la hora que empieza en `from` dentro de la franja? La franja va en
    /// minutos de la hora del sistema (`system`, `Zone::Local` en la app), aunque
    /// la rejilla se muestre en otra zona como UTC.
    pub fn covers(&self, from: DateTime<Utc>, system: Zone) -> bool {
        let minute = u16::try_from(system.minute_of_day(from)).unwrap_or(0);
        (self.from..self.to).contains(&minute)
    }
}

/// Aviso de una tanda concreta: serie y salida UTC (segundos Unix).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Slot {
    pub series_id: String,
    pub at: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Channels {
    pub windows: bool,
    pub in_track: bool,
    pub sound: bool,
}

impl Default for Channels {
    fn default() -> Self {
        Self {
            windows: true,
            in_track: true,
            sound: false,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Alerts {
    #[serde(default = "default_lead")]
    pub lead_min: u8,
    #[serde(default)]
    pub bands: Vec<Band>,
    #[serde(default)]
    pub slots: Vec<Slot>,
    #[serde(default)]
    pub channels: Channels,
    /// Lanza el perfil 3 min antes de la salida avisada. Apagado por defecto.
    #[serde(default)]
    pub auto_launch: bool,
    /// Avisa cuando LMU publica la semana nueva.
    #[serde(default = "yes")]
    pub notify_week: bool,
}

fn yes() -> bool {
    true
}

fn default_lead() -> u8 {
    10
}

impl Default for Alerts {
    fn default() -> Self {
        Self {
            lead_min: default_lead(),
            bands: vec![],
            slots: vec![],
            channels: Channels::default(),
            auto_launch: false,
            notify_week: true,
        }
    }
}

/// Por qué una salida tiene aviso.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cause {
    Band,
    Slot,
}

/// Aviso que toca disparar ahora.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Due {
    pub series_id: String,
    pub at: DateTime<Utc>,
    pub cause: Cause,
}

/// Entrada agrupada para el carril y «Mis carreras».
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Upcoming {
    pub series_id: String,
    pub at: DateTime<Utc>,
    pub band: Option<Band>,
}

impl Alerts {
    pub fn parse(data: &[u8]) -> Result<Self, String> {
        let alerts: Self =
            serde_json::from_slice(data).map_err(|error| format!("avisos inválidos: {error}"))?;
        if !LEADS.contains(&alerts.lead_min)
            || alerts.bands.len() > MAX_BANDS
            || alerts.slots.len() > MAX_SLOTS
            || alerts.bands.iter().any(|b| b.from >= b.to || b.to > 1440)
        {
            return Err("avisos inválidos: límites o franja vacía".into());
        }
        Ok(alerts)
    }

    pub fn band(&self, series_id: &str) -> Option<&Band> {
        self.bands.iter().find(|b| b.series_id == series_id)
    }
    pub fn slot_at(&self, series_id: &str, at: DateTime<Utc>) -> bool {
        self.slots
            .iter()
            .any(|s| s.series_id == series_id && s.at == at.timestamp())
    }
    pub fn count(&self) -> usize {
        self.bands.len() + self.slots.len()
    }

    /// Pone, cambia o quita (con `None`) la franja de una serie.
    pub fn set_band(&mut self, series_id: &str, band: Option<Band>) -> Result<(), String> {
        self.bands.retain(|b| b.series_id != series_id);
        if let Some(band) = band {
            if band.from >= band.to || band.to > 1440 {
                return Err("la franja debe tener fin posterior al inicio".into());
            }
            if self.bands.len() == MAX_BANDS {
                return Err("máximo 64 franjas".into());
            }
            self.bands.push(band);
        }
        Ok(())
    }
    /// Alterna el aviso de una tanda de evento.
    pub fn toggle_slot(&mut self, series_id: &str, at: DateTime<Utc>) -> Result<(), String> {
        let before = self.slots.len();
        self.slots
            .retain(|s| !(s.series_id == series_id && s.at == at.timestamp()));
        if self.slots.len() == before {
            if before == MAX_SLOTS {
                return Err("máximo 512 tandas con aviso".into());
            }
            self.slots.push(Slot {
                series_id: series_id.into(),
                at: at.timestamp(),
            });
        }
        Ok(())
    }
    /// Los avisos de tanda caducan con su evento.
    pub fn prune(&mut self, now: DateTime<Utc>) {
        self.slots.retain(|s| s.at >= now.timestamp());
    }
    /// Series con aviso que ya no están en el horario: se avisa al usuario.
    pub fn orphans<'a>(&'a self, schedule: &Schedule) -> Vec<&'a str> {
        self.bands
            .iter()
            .map(|b| b.series_id.as_str())
            .chain(self.slots.iter().map(|s| s.series_id.as_str()))
            .filter(|id| schedule.by_id(id).is_none())
            .collect()
    }

    fn in_band(band: &Band, at: DateTime<Utc>) -> bool {
        let local = Zone::Local.naive(at);
        let minute = (local.time().num_seconds_from_midnight() / 60) as u16;
        band.days.includes(local.weekday()) && (band.from..band.to).contains(&minute)
    }

    /// ¿Tiene aviso esta salida concreta?
    pub fn cause(&self, schedule: &Schedule, series: &Series, at: DateTime<Utc>) -> Option<Cause> {
        if series.kind() != Kind::Daily {
            return self.slot_at(&series.id, at).then_some(Cause::Slot);
        }
        let band = self.band(&series.id)?;
        if !Self::in_band(band, at) {
            return None;
        }
        if band.mode == Mode::First {
            let day = Zone::Local.date(at);
            let from = Zone::Local.day_start(day) + Duration::minutes(i64::from(band.from));
            let first = schedule
                .starts(
                    series,
                    from,
                    from + Duration::minutes(i64::from(band.to - band.from)),
                )
                .ok()?
                .into_iter()
                .next()?;
            return (first == at).then_some(Cause::Band);
        }
        Some(Cause::Band)
    }

    /// Avisos cuyo momento (salida menos antelación) cae en `(since, now]`.
    /// Con `in_track`, las franjas «cada salida» se callan: ya estás en pista.
    pub fn due(
        &self,
        schedule: &Schedule,
        now: DateTime<Utc>,
        since: DateTime<Utc>,
        in_track: bool,
    ) -> Vec<Due> {
        let lead = Duration::minutes(i64::from(self.lead_min));
        let mut due = vec![];
        for series in &schedule.series {
            let Ok(starts) = schedule.starts(series, now, now + lead + Duration::minutes(1)) else {
                continue;
            };
            for at in starts {
                let fire = at - lead;
                if fire <= since || fire > now {
                    continue;
                }
                match self.cause(schedule, series, at) {
                    Some(Cause::Band) if in_track => {}
                    Some(cause) => due.push(Due {
                        series_id: series.id.clone(),
                        at,
                        cause,
                    }),
                    None => {}
                }
            }
        }
        due.sort_by_key(|d| (d.at, d.series_id.clone()));
        due
    }

    /// Lo próximo con aviso: una entrada por franja (su siguiente salida) y una
    /// por cada tanda futura.
    pub fn upcoming(&self, schedule: &Schedule, now: DateTime<Utc>) -> Vec<Upcoming> {
        let mut items = vec![];
        for band in &self.bands {
            let Some(series) = schedule.by_id(&band.series_id) else {
                continue;
            };
            let Ok((_, end)) = schedule.window() else {
                continue;
            };
            let found = schedule
                .starts(series, now, end.min(now + Duration::days(8)))
                .unwrap_or_default()
                .into_iter()
                .find(|at| self.cause(schedule, series, *at).is_some());
            if let Some(at) = found {
                items.push(Upcoming {
                    series_id: band.series_id.clone(),
                    at,
                    band: Some(band.clone()),
                });
            }
        }
        for slot in &self.slots {
            if let Some(at) = Utc
                .timestamp_opt(slot.at, 0)
                .single()
                .filter(|at| *at >= now)
            {
                items.push(Upcoming {
                    series_id: slot.series_id.clone(),
                    at,
                    band: None,
                });
            }
        }
        items.sort_by_key(|item| (item.at, item.series_id.clone()));
        items
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::calendar::model::{Schedule, timestamp};

    const OCTOBER: &[u8] = include_bytes!("../../reference/fixtures/calendar-lmu-2026-10-06.json");

    fn at(value: &str) -> DateTime<Utc> {
        timestamp(value).expect("fecha")
    }

    /// Franja 20:00–23:00 en la zona del sistema, convertida para que el test
    /// no dependa de dónde corra: se construye con minutos de `Zone::Local`.
    fn evening_band(id: &str) -> Band {
        Band {
            series_id: id.into(),
            from: 20 * 60,
            to: 23 * 60,
            days: Days::All,
            mode: Mode::Each,
        }
    }

    /// Primera salida a partir de `from` que la zona local ve a las 20:00.
    fn local_eight_pm() -> DateTime<Utc> {
        let day = Zone::Local.date(at("2026-10-08T12:00:00Z"));
        Zone::Local.day_start(day) + Duration::hours(20)
    }

    #[test]
    fn the_alert_band_is_measured_in_system_time_even_if_the_grid_shows_utc() {
        // Franja 20:00–23:00 de Madrid (sistema); la rejilla enseña UTC.
        let madrid = Zone::Eu(3600);
        let band = evening_band("any");
        // 18:00Z del 8-oct = 20:00 CEST: dentro. Con la hora de la rejilla (UTC)
        // se habría mirado 18:00 y quedaría fuera: el desfase de 2 h del informe.
        assert!(band.covers(at("2026-10-08T18:00:00Z"), madrid));
        assert!(
            !band.covers(at("2026-10-08T21:00:00Z"), madrid),
            "23:00 CEST ya es el fin"
        );
        assert!(!band.covers(at("2026-10-08T18:00:00Z"), Zone::Utc));
        // Tras el cambio de hora el mismo 20:00 local son las 19:00Z.
        assert!(band.covers(at("2026-10-26T19:00:00Z"), madrid));
        assert!(!band.covers(at("2026-10-26T18:00:00Z"), madrid));
    }

    #[test]
    fn band_covers_only_its_hours_and_the_default_is_off() {
        let schedule = Schedule::parse(OCTOBER).expect("horario");
        let series = schedule.by_id("beginner-lmgt3-fixed").expect("serie");
        let mut alerts = Alerts::default();
        assert!(
            !alerts.auto_launch,
            "el lanzamiento automático nace apagado"
        );
        assert_eq!(alerts.cause(&schedule, series, local_eight_pm()), None);
        alerts
            .set_band(&series.id, Some(evening_band(&series.id)))
            .expect("franja");
        let eight = local_eight_pm();
        assert_eq!(alerts.cause(&schedule, series, eight), Some(Cause::Band));
        assert_eq!(
            alerts.cause(&schedule, series, eight + Duration::minutes(165)),
            Some(Cause::Band)
        );
        assert_eq!(
            alerts.cause(&schedule, series, eight + Duration::minutes(180)),
            None
        );
        assert_eq!(
            alerts.cause(&schedule, series, eight - Duration::minutes(15)),
            None
        );
    }

    #[test]
    fn first_only_mode_fires_once_per_day() {
        let schedule = Schedule::parse(OCTOBER).expect("horario");
        let series = schedule.by_id("beginner-lmgt3-fixed").expect("serie");
        let mut alerts = Alerts::default();
        let mut band = evening_band(&series.id);
        band.mode = Mode::First;
        alerts.set_band(&series.id, Some(band)).expect("franja");
        let eight = local_eight_pm();
        assert_eq!(alerts.cause(&schedule, series, eight), Some(Cause::Band));
        assert_eq!(
            alerts.cause(&schedule, series, eight + Duration::minutes(15)),
            None
        );
    }

    #[test]
    fn due_uses_lead_time_and_is_silent_in_track() {
        let schedule = Schedule::parse(OCTOBER).expect("horario");
        let series = schedule.by_id("beginner-lmgt3-fixed").expect("serie");
        let mut alerts = Alerts::default();
        alerts
            .set_band(&series.id, Some(evening_band(&series.id)))
            .expect("franja");
        let eight = local_eight_pm();
        let fire = eight - Duration::minutes(10);
        let due = alerts.due(&schedule, fire, fire - Duration::seconds(30), false);
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].at, eight);
        // Ya se avisó: no se repite en la siguiente comprobación.
        assert!(
            alerts
                .due(&schedule, fire + Duration::seconds(30), fire, false)
                .is_empty()
        );
        // Todavía no toca.
        assert!(
            alerts
                .due(
                    &schedule,
                    fire - Duration::minutes(2),
                    fire - Duration::minutes(3),
                    false
                )
                .is_empty()
        );
        // En pista, la franja se calla.
        assert!(
            alerts
                .due(&schedule, fire, fire - Duration::seconds(30), true)
                .is_empty()
        );
    }

    #[test]
    fn slot_alerts_toggle_expire_and_survive_new_weeks() {
        let schedule = Schedule::parse(OCTOBER).expect("horario");
        let series = schedule.by_id("weekly-wec-weekly").expect("evento");
        let start = at("2026-10-08T18:00:00Z");
        let mut alerts = Alerts::default();
        alerts.toggle_slot(&series.id, start).expect("poner");
        assert!(alerts.slot_at(&series.id, start));
        assert_eq!(alerts.cause(&schedule, series, start), Some(Cause::Slot));
        let upcoming = alerts.upcoming(&schedule, at("2026-10-08T17:47:00Z"));
        assert_eq!(upcoming.len(), 1);
        alerts.prune(at("2026-10-08T18:30:00Z"));
        assert!(alerts.slots.is_empty(), "caduca con su evento");
        alerts.toggle_slot(&series.id, start).expect("poner");
        alerts.toggle_slot(&series.id, start).expect("quitar");
        assert!(alerts.slots.is_empty());
    }

    #[test]
    fn vanished_series_are_reported_not_dropped() {
        let schedule = Schedule::parse(OCTOBER).expect("horario");
        let mut alerts = Alerts::default();
        alerts
            .set_band("ya-no-existe", Some(evening_band("ya-no-existe")))
            .expect("franja");
        assert_eq!(alerts.orphans(&schedule), vec!["ya-no-existe"]);
        assert_eq!(alerts.bands.len(), 1);
    }

    #[test]
    fn persisted_format_round_trips_and_rejects_bad_bands() {
        let mut alerts = Alerts::default();
        alerts
            .set_band("a", Some(evening_band("a")))
            .expect("franja");
        alerts
            .toggle_slot("b", at("2026-10-08T18:00:00Z"))
            .expect("tanda");
        let json = serde_json::to_vec(&alerts).expect("json");
        assert_eq!(Alerts::parse(&json).expect("leer"), alerts);
        assert!(Alerts::parse(br#"{"leadMin":7}"#).is_err());
        assert!(Alerts::parse(br#"{"bands":[{"seriesId":"a","from":600,"to":600}]}"#).is_err());
        assert!(
            alerts
                .set_band(
                    "a",
                    Some(Band {
                        from: 100,
                        to: 50,
                        ..evening_band("a")
                    })
                )
                .is_err()
        );
    }
}
