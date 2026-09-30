//! Lectura local del catálogo oficial UTC; sin publicación, Discord ni recordatorios.
use crate::{files, shell::button};
use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveTime, Utc};
use gpui::{Context, IntoElement, Render, Window, div, prelude::*};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};

const SEED: &str = include_str!("../../../internal/calendar/seed/lmu-weekly-schedule.json");
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    version: u32,
    timezone: String,
    valid_from: String,
    valid_until: String,
    pub series: Vec<Series>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Series {
    pub id: String,
    pub name: String,
    pub track: String,
    pub vehicle_class: String,
    pub license_label: String,
    recurrence: Recurrence,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Recurrence {
    kind: String,
    #[serde(default)]
    interval_minutes: i64,
    #[serde(default)]
    days: Vec<String>,
    #[serde(default, rename = "timesUTC")]
    times_utc: Vec<String>,
}
fn timestamp(value: &str) -> Result<DateTime<Utc>, String> {
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
    fn window(&self) -> Result<(DateTime<Utc>, DateTime<Utc>), String> {
        Ok((timestamp(&self.valid_from)?, timestamp(&self.valid_until)?))
    }
    pub fn is_current(&self, now: DateTime<Utc>) -> Result<bool, String> {
        let (from, to) = self.window()?;
        Ok(from <= now && now < to)
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
}
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Following {
    series_ids: Vec<String>,
}
pub struct Calendar {
    schedule: Schedule,
    path: PathBuf,
    following: Following,
    saved: Option<Vec<u8>>,
    pub error: Option<String>,
    pub status: String,
}
impl Calendar {
    pub fn load(data_dir: &Path) -> Result<Self, String> {
        let schedule = Schedule::parse(SEED.as_bytes())?;
        let path = data_dir.join("calendar-following.json");
        let saved = match std::fs::metadata(&path) {
            Ok(_) => Some(files::read(&path, 64 * 1024)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(format!("seguimiento: {error}")),
        };
        let following: Following = saved
            .as_deref()
            .map(serde_json::from_slice)
            .transpose()
            .map_err(|error| format!("seguimiento inválido: {error}"))?
            .unwrap_or_default();
        let mut ids = HashSet::new();
        if following.series_ids.len() > 256
            || following
                .series_ids
                .iter()
                .any(|id| id.trim().is_empty() || !ids.insert(id))
        {
            return Err("seguimiento inválido: límite o identidad vacía/duplicada".into());
        }
        Ok(Self {
            schedule,
            path,
            following,
            saved,
            error: None,
            status: "Catálogo local empaquetado; sin consultar servicios".into(),
        })
    }
    fn follow(&mut self, id: String) -> Result<(), String> {
        let mut next = self.following.series_ids.clone();
        if next.contains(&id) {
            next.retain(|item| item != &id);
        } else {
            if next.len() == 256 {
                return Err("máximo 256 series seguidas".into());
            }
            next.push(id);
        }
        let following = Following { series_ids: next };
        let data = serde_json::to_vec_pretty(&following).map_err(|error| error.to_string())?;
        files::save(&self.path, &data, self.saved.as_deref())?;
        self.following = following;
        self.saved = Some(data);
        Ok(())
    }
    fn reload(&mut self) -> Result<(), String> {
        let path = self.path.with_file_name("official-schedule.json");
        let schedule = Schedule::parse(&files::read(&path, 1024 * 1024)?)?;
        self.schedule = schedule;
        self.status = format!("Agenda local explícita: {}", path.display());
        Ok(())
    }
}
impl Render for Calendar {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let now = Utc::now();
        let current = self.schedule.is_current(now).unwrap_or(false);
        let mut rows = div().flex().flex_col().gap_2();
        let mut starts = vec![];
        for (index, series) in self.schedule.series.iter().enumerate() {
            let id = series.id.clone();
            let followed = self.following.series_ids.contains(&id);
            rows = rows.child(
                div()
                    .flex()
                    .gap_2()
                    .child(
                        div()
                            .id(("follow", index))
                            .role(gpui::Role::Button)
                            .tab_index(0)
                            .cursor_pointer()
                            .child(if followed {
                                "Dejar de seguir"
                            } else {
                                "Seguir"
                            })
                            .on_click(cx.listener(move |this, _, _, cx| {
                                match this.follow(id.clone()) {
                                    Ok(()) => this.error = None,
                                    Err(error) => this.error = Some(error),
                                }
                                cx.notify();
                            })),
                    )
                    .child(format!(
                        "{} · {} · {} · {}",
                        series.name, series.track, series.vehicle_class, series.license_label
                    )),
            );
            if current && followed {
                match self.schedule.starts(series, now, now + Duration::days(1)) {
                    Ok(times) => {
                        starts.extend(times.into_iter().map(|time| (time, series.name.clone())));
                    }
                    Err(error) => self.error = Some(error),
                }
            }
        }
        starts.sort_unstable();
        let mut agenda = div().flex().flex_col().gap_1();
        for (time, name) in starts.iter().take(20) {
            agenda = agenda.child(format!("{} · {}", time.format("%Y-%m-%d %H:%M UTC"), name));
        }
        div().id("calendar").flex().flex_col().gap_2().overflow_y_scroll()
            .child(if current {"Agenda vigente (UTC)"}else{"Catálogo histórico o aún no vigente; no se ofrecen próximas carreras"})
            .child(format!("Ventana {} → {}",self.schedule.valid_from,self.schedule.valid_until))
            .child(self.status.clone()).when_some(self.error.clone(),gpui::ParentElement::child)
            .child(button("reload-calendar","Cargar official-schedule.json local").on_click(cx.listener(|this,_,_,cx|{
                match this.reload(){Ok(())=>this.error=None,Err(error)=>this.error=Some(error)}cx.notify();})))
            .child("Seguimiento local. Próximas 24 h, hasta 20 salidas. Sin recordatorios, eventos manuales, inbox Discord ni publicación Owner.")
            .child(rows).child(agenda)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn following_survives_restart_failed_writes_and_invalid_catalog_reload_keep_last_state() {
        let dir = std::env::temp_dir().join(format!("vantare-calendar-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("directorio propio");
        let mut calendar = Calendar::load(&dir).expect("cargar");
        let id = calendar.schedule.series[0].id.clone();
        calendar.follow(id.clone()).expect("seguir");
        let mut calendar = Calendar::load(&dir).expect("reiniciar");
        assert_eq!(calendar.following.series_ids, vec![id.clone()]);
        let lock = dir.join("calendar-following.json.lock");
        std::fs::write(&lock, "").expect("conflicto simulado");
        assert!(calendar.follow(id.clone()).is_err());
        assert_eq!(calendar.following.series_ids, vec![id]);
        let before = calendar.schedule.window().expect("ventana");
        let schedule = dir.join("official-schedule.json");
        std::fs::write(&schedule, "{}").expect("agenda inválida de test");
        assert!(calendar.reload().is_err());
        assert_eq!(
            calendar.schedule.window().expect("ventana conservada"),
            before
        );
        // IDs retenidos de publicaciones anteriores, solo para probar el límite.
        calendar.following.series_ids = (0..256).map(|index| format!("retained-{index}")).collect();
        assert!(
            calendar
                .follow(calendar.schedule.series[0].id.clone())
                .is_err()
        );
        assert_eq!(calendar.following.series_ids.len(), 256);
        for path in [lock, schedule, dir.join("calendar-following.json")] {
            std::fs::remove_file(path).expect("limpiar fichero propio");
        }
        std::fs::remove_dir(dir).expect("limpiar directorio vacío");
    }

    #[test]
    fn interval_rounds_up_and_weekly_slots_use_utc_weekdays_and_exclusive_end() {
        let mut schedule = Schedule::parse(SEED.as_bytes()).expect("seed");
        let from = timestamp("2026-08-25T00:07:00Z").expect("martes");
        let to = timestamp("2026-08-25T01:00:00Z").expect("límite");
        let series = &mut schedule.series[0];
        // Recurrencias de test, no un calendario publicado ni datos de producto.
        series.recurrence = Recurrence {
            kind: "interval".into(),
            interval_minutes: 15,
            days: vec![],
            times_utc: vec![],
        };
        assert_eq!(
            schedule
                .starts(&schedule.series[0], from, to)
                .expect("intervalo"),
            [
                "2026-08-25T00:15:00Z",
                "2026-08-25T00:30:00Z",
                "2026-08-25T00:45:00Z"
            ]
            .map(|date| timestamp(date).expect("fecha"))
        );
        schedule.series[0].recurrence = Recurrence {
            kind: "weekly-slots".into(),
            interval_minutes: 0,
            days: vec!["Tue".into()],
            times_utc: vec!["01:00".into(), "00:30".into()],
        };
        assert_eq!(
            schedule
                .starts(&schedule.series[0], from, to)
                .expect("slots"),
            vec![timestamp("2026-08-25T00:30:00Z").expect("fecha")]
        );
    }
    #[test]
    fn expired_seed_is_not_a_current_agenda_and_expansion_stops_at_publication_boundary() {
        let schedule = Schedule::parse(SEED.as_bytes()).expect("seed");
        let (from, to) = schedule.window().expect("ventana");
        assert!(
            !schedule
                .is_current(timestamp("2026-09-30T12:00:00Z").expect("fecha"))
                .expect("vigencia")
        );
        for series in &schedule.series {
            let starts = schedule
                .starts(series, from - Duration::days(1), to + Duration::days(1))
                .expect("expandir");
            assert!(!starts.is_empty());
            assert!(starts.iter().all(|time| from <= *time && *time < to));
            assert!(
                schedule
                    .starts(series, to, to + Duration::days(1))
                    .expect("fuera")
                    .is_empty()
            );
        }
    }
    #[test]
    fn malformed_recurrence_timezone_and_duplicate_ids_are_rejected() {
        let mut value: serde_json::Value = serde_json::from_str(SEED).expect("json");
        value["series"][0]["recurrence"]["intervalMinutes"] = serde_json::json!(0);
        assert!(Schedule::parse(&serde_json::to_vec(&value).expect("json")).is_err());
        let mut value: serde_json::Value = serde_json::from_str(SEED).expect("json");
        value["timezone"] = serde_json::json!("Europe/Madrid");
        assert!(Schedule::parse(&serde_json::to_vec(&value).expect("json")).is_err());
        let mut value: serde_json::Value = serde_json::from_str(SEED).expect("json");
        value["series"][1]["id"] = value["series"][0]["id"].clone();
        assert!(Schedule::parse(&serde_json::to_vec(&value).expect("json")).is_err());
    }
}
