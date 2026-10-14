//! Histórico de publicaciones (últimas 8 semanas): circuito por semana para la
//! página de serie y el Mes, y la hora típica en que LMU publica.
use super::{Doc, model::Schedule};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

const MAX_WEEKS: usize = 8;
/// Hora típica de publicación si aún no hay observaciones: lunes 08:00 UTC.
const DEFAULT_SEEN_SECS: i64 = 8 * 3600;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub series_id: String,
    pub name: String,
    #[allow(clippy::struct_field_names)] // Nombre del contrato publicado.
    pub track: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Week {
    pub from: i64,
    pub until: i64,
    /// Cuándo la vio por primera vez este equipo (segundos Unix).
    pub seen_at: i64,
    pub tracks: Vec<Track>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct History {
    weeks: Vec<Week>,
}

impl History {
    /// Un histórico dañado no impide abrir el calendario: empieza vacío.
    pub(super) fn load(doc: &mut Doc) -> Self {
        doc.read()
            .ok()
            .flatten()
            .and_then(|data| serde_json::from_slice(&data).ok())
            .unwrap_or_default()
    }

    /// Anota una semana (una sola vez por su inicio); conserva las 8 últimas.
    pub fn upsert(&mut self, schedule: &Schedule, seen_at: i64) {
        let Ok((from, until)) = schedule.window() else {
            return;
        };
        if self.weeks.iter().any(|week| week.from == from.timestamp()) {
            return;
        }
        self.weeks.push(Week {
            from: from.timestamp(),
            until: until.timestamp(),
            seen_at,
            tracks: schedule
                .series
                .iter()
                .map(|s| Track {
                    series_id: s.id.clone(),
                    name: s.name.clone(),
                    track: s.track.clone(),
                })
                .collect(),
        });
        self.weeks.sort_by_key(|week| week.from);
        let excess = self.weeks.len().saturating_sub(MAX_WEEKS);
        self.weeks.drain(..excess);
    }

    /// Circuitos de una serie por semana, de la más antigua a la más reciente.
    pub fn rotation(&self, series_id: &str) -> Vec<(DateTime<Utc>, String)> {
        self.weeks
            .iter()
            .filter_map(|week| {
                let track = week.tracks.iter().find(|t| t.series_id == series_id)?;
                Some((DateTime::from_timestamp(week.from, 0)?, track.track.clone()))
            })
            .collect()
    }

    /// Estimación de cuándo se publicará la semana que empieza en `next_from`:
    /// la mediana de las demoras observadas respecto al lunes anterior.
    pub fn publication_estimate(&self, next_from: DateTime<Utc>) -> DateTime<Utc> {
        let mut delays: Vec<i64> = self
            .weeks
            .iter()
            .map(|w| (w.seen_at - (w.from - 86_400)).clamp(0, 86_400))
            .collect();
        delays.sort_unstable();
        let delay = delays
            .get(delays.len() / 2)
            .copied()
            .unwrap_or(DEFAULT_SEEN_SECS);
        next_from - Duration::days(1) + Duration::seconds(delay)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::calendar::model::timestamp;

    const OCTOBER: &[u8] = include_bytes!("../../reference/fixtures/calendar-lmu-2026-10-06.json");

    #[test]
    fn keeps_eight_weeks_and_each_week_once() {
        let mut history = History::default();
        let base: serde_json::Value = serde_json::from_slice(OCTOBER).expect("json");
        for week in 0..10 {
            let mut value = base.clone();
            let from = timestamp("2026-08-04T00:00:00Z").expect("fecha") + Duration::days(7 * week);
            value["validFrom"] = from.to_rfc3339().into();
            value["validUntil"] = (from + Duration::days(7)).to_rfc3339().into();
            let schedule = Schedule::parse(value.to_string().as_bytes()).expect("semana");
            history.upsert(&schedule, from.timestamp());
            history.upsert(&schedule, from.timestamp() + 99);
        }
        assert_eq!(history.weeks.len(), MAX_WEEKS);
        assert_eq!(history.rotation("beginner-lmgt3-fixed").len(), MAX_WEEKS);
        assert!(history.rotation("nope").is_empty());
    }

    #[test]
    fn publication_estimate_uses_observed_median_or_a_default() {
        let next = timestamp("2026-10-13T00:00:00Z").expect("fecha");
        let empty = History::default();
        assert_eq!(
            empty.publication_estimate(next),
            timestamp("2026-10-12T08:00:00Z").expect("fecha")
        );
        let schedule = Schedule::parse(OCTOBER).expect("horario");
        let mut history = History::default();
        // Vista el lunes 5 a las 09:30 UTC.
        history.upsert(
            &schedule,
            timestamp("2026-10-05T09:30:00Z")
                .expect("fecha")
                .timestamp(),
        );
        assert_eq!(
            history.publication_estimate(next),
            timestamp("2026-10-12T09:30:00Z").expect("fecha")
        );
    }
}
