//! Lectura local del catálogo oficial UTC; sin publicación, Discord ni recordatorios.
use crate::{files, orbit};
pub mod views;

// Inicio comparte el calendario local; la shell mantiene la navegación y el IPC.
#[path = "home.rs"]
pub mod home;
use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveTime, Utc};
#[cfg(feature = "parity-capture")]
use chrono::{Local, Timelike};
use gpui::{Context, IntoElement, Render, Styled, Window, div, prelude::*, px};
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
    #[serde(default)]
    pub classes: Vec<VehicleClass>,
    #[serde(default)]
    pub race_duration_min: Option<u32>,
    pub license_label: String,
    #[serde(default)]
    pub tier: String,
    #[serde(default)]
    pub event_kind: String,
    #[serde(default)]
    start_offset_minute: i64,
    recurrence: Recurrence,
}
#[derive(Deserialize)]
pub struct VehicleClass {
    pub name: String,
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
    demo_now: Option<DateTime<Utc>>,
    view: CalendarView,
    class_filter: Option<String>,
    tier_filter: Option<String>,
    clock_started: bool,
    pub error: Option<String>,
    pub status: String,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum CalendarView {
    #[default]
    Upcoming,
    Day,
    Week,
    Month,
    Timeline,
}

impl CalendarView {
    #[cfg(feature = "parity-capture")]
    fn from_capture_name(name: &str) -> Option<Self> {
        match name {
            "calendario-base" | "calendario-beta-archivo" => Some(Self::Upcoming),
            "calendario-dia" => Some(Self::Day),
            "calendario-semana" => Some(Self::Week),
            "calendario-mes" => Some(Self::Month),
            "calendario-timeline" => Some(Self::Timeline),
            _ => None,
        }
    }
}

#[cfg(feature = "parity-capture")]
fn capture_view() -> CalendarView {
    let args: Vec<_> = std::env::args().collect();
    for pair in args.windows(2) {
        if pair[0] == "--capture"
            && let Some(view) = CalendarView::from_capture_name(&pair[1])
        {
            return view;
        }
    }
    CalendarView::Upcoming
}

#[cfg(feature = "parity-capture")]
fn capture_clock(now: DateTime<Utc>) -> DateTime<Utc> {
    let local = now.with_timezone(&Local);
    match local
        .with_hour(16)
        .and_then(|time| time.with_minute(0))
        .and_then(|time| time.with_second(0))
        .and_then(|time| time.with_nanosecond(0))
    {
        Some(local) => local.with_timezone(&Utc),
        None => now,
    }
}

mod beta;
mod presentation;

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
            demo_now: None,
            view: CalendarView::default(),
            class_filter: None,
            tier_filter: None,
            clock_started: false,
            error: None,
            status: "Horario guardado en este equipo".into(),
        })
    }
    pub fn load_demo(data_dir: &Path, demo: &crate::demo::DemoData) -> Result<Self, String> {
        let mut calendar = Self::load(data_dir)?;
        // Las capturas comparan el calendario visual con el seed oficial compartido.
        calendar.schedule = Schedule::parse(SEED.as_bytes())?;
        let now = demo.fixed_now()?;
        #[cfg(feature = "parity-capture")]
        let now = capture_clock(now);
        calendar.demo_now = Some(now);
        calendar.status = "Horario de ejemplo".into();
        #[cfg(feature = "parity-capture")]
        {
            calendar.view = capture_view();
            if std::env::args().any(|arg| arg == "calendario-beta-archivo") {
                // Escena QA explícita: catálogo oficial archivado y reloj dentro de su publicación.
                calendar.demo_now = Some(
                    calendar.schedule.window()?.0 + Duration::hours(16) - Duration::minutes(13),
                );
                if let Some(series) = calendar
                    .schedule
                    .series
                    .iter()
                    .find(|series| series.tier == "weekly")
                {
                    calendar.following.series_ids = vec![series.id.clone()];
                }
                calendar.status =
                    "QA · catálogo oficial archivado · reloj congelado; no es el horario actual"
                        .into();
            }
        }
        Ok(calendar)
    }
    /// Sigue una serie usando el estado local existente del calendario.
    pub fn follow(&mut self, id: String) -> Result<(), String> {
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
    pub fn reload(&mut self) -> Result<(), String> {
        let path = self.path.with_file_name("official-schedule.json");
        let schedule = Schedule::parse(&files::read(&path, 1024 * 1024)?)?;
        self.schedule = schedule;
        self.status = format!("Agenda local explícita: {}", path.display());
        Ok(())
    }
}
impl Calendar {
    fn upcoming(&self, now: DateTime<Utc>) -> (Vec<(DateTime<Utc>, String)>, Option<String>) {
        let mut starts = vec![];
        let mut error = None;
        if matches!(self.schedule.is_current(now), Ok(true)) {
            for series in &self.schedule.series {
                if self.following.series_ids.contains(&series.id) {
                    match self.schedule.starts(series, now, now + Duration::days(1)) {
                        Ok(times) => {
                            starts
                                .extend(times.into_iter().map(|time| (time, series.name.clone())));
                        }
                        Err(cause) => error = Some(cause),
                    }
                }
            }
        }
        starts.sort_unstable();
        starts.truncate(20);
        (starts, error)
    }
}

impl Calendar {
    pub(crate) fn page_header(cx: &mut Context<Self>) -> gpui::Div {
        div()
            .flex()
            .items_center()
            .justify_between()
            .gap(px(12.0))
            .child(
                orbit::neo_page_header(
                    "Calendario LMU",
                    "Carreras diarias y semanales · hora local del equipo",
                    cx,
                )
                .flex_1(),
            )
            .child(
                orbit::button("calendar-reload", "Actualizar horario", cx).on_click(cx.listener(
                    |this, _, _, cx| {
                        this.error = this.reload().err();
                        cx.notify();
                    },
                )),
            )
    }
    pub(crate) fn topbar_controls(&self, cx: &mut Context<Self>) -> gpui::Div {
        presentation::views_control(self, cx)
    }
    pub(crate) fn context_column(&self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        beta::context_column(self, cx)
    }
}
impl Render for Calendar {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if !self.clock_started && self.demo_now.is_none() {
            self.clock_started = true;
            cx.spawn(async move |this, cx| {
                loop {
                    cx.background_executor()
                        .timer(std::time::Duration::from_secs(30))
                        .await;
                    if this.update(cx, |_, cx| cx.notify()).is_err() {
                        break;
                    }
                }
            })
            .detach();
        }
        let height = (f32::from(window.viewport_size().height)
            - cx.global::<crate::orbit::design::Tokens>().geometry.topbar
            - 2.0 * cx.global::<crate::orbit::design::Tokens>().geometry.gutter
            - 76.0)
            .max(0.0);
        if self.view == CalendarView::Upcoming {
            beta::render(self, cx)
                .h(gpui::px(height))
                .into_any_element()
        } else {
            presentation::render(self, cx)
                .min_h(gpui::px(height))
                .into_any_element()
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(feature = "parity-capture")]
    #[test]
    fn capture_names_select_the_five_calendar_views() {
        for (name, expected) in [
            ("calendario-base", CalendarView::Upcoming),
            ("calendario-dia", CalendarView::Day),
            ("calendario-semana", CalendarView::Week),
            ("calendario-mes", CalendarView::Month),
            ("calendario-timeline", CalendarView::Timeline),
        ] {
            assert_eq!(CalendarView::from_capture_name(name), Some(expected));
        }
        assert_eq!(CalendarView::from_capture_name("inicio-base"), None);
        assert_eq!(CalendarView::default(), CalendarView::Upcoming);
    }

    #[test]
    fn upcoming_only_includes_followed_current_series_in_order_and_is_bounded() {
        let mut calendar = Calendar {
            schedule: Schedule::parse(SEED.as_bytes()).expect("catálogo real empaquetado"),
            path: PathBuf::new(),
            following: Following::default(),
            saved: None,
            demo_now: None,
            view: CalendarView::Upcoming,
            class_filter: None,
            tier_filter: None,
            clock_started: false,
            error: None,
            status: String::new(),
        };
        let now = timestamp("2026-08-25T00:07:00Z").expect("dentro de vigencia");
        assert!(calendar.upcoming(now).0.is_empty());
        let series = &mut calendar.schedule.series[0];
        series.recurrence = Recurrence {
            kind: "interval".into(),
            interval_minutes: 15,
            days: vec![],
            times_utc: vec![],
        };
        let name = series.name.clone();
        calendar.following.series_ids.push(series.id.clone());
        let (starts, error) = calendar.upcoming(now);
        assert!(error.is_none());
        assert_eq!(starts.len(), 20);
        assert_eq!(
            starts[0].0,
            timestamp("2026-08-25T00:15:00Z").expect("salida")
        );
        assert!(
            starts
                .iter()
                .all(|(time, series)| *time >= now && *series == name)
        );
        assert!(starts.windows(2).all(|pair| pair[0].0 < pair[1].0));
        let expired = timestamp("2026-09-30T12:00:00Z").expect("caducado");
        assert!(calendar.upcoming(expired).0.is_empty());
    }

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
