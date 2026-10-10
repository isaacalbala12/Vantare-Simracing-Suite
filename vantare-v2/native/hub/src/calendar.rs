//! Horario publicado UTC y caché local; red exclusivamente por services.
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

const SEED: &str = include_str!("../data/lmu-weekly-schedule.json");
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
    #[serde(skip)]
    reminder_ids: Vec<String>,
}
pub struct Calendar {
    adapt: orbit::Adapt,
    schedule: Schedule,
    remote: Option<gpui::Entity<crate::services::view::Remote>>,
    refreshing: bool,
    first_open_requested: bool,
    path: PathBuf,
    following: Following,
    reminder_saved: Option<Vec<u8>>,
    saved: Option<Vec<u8>>,
    demo_now: Option<DateTime<Utc>>,
    view: CalendarView,
    agenda_scroll: Option<gpui::ScrollHandle>,
    class_filter: Option<String>,
    tier_filter: Option<String>,
    clock_started: bool,
    test_session: Option<TestSession>,
    pub error: Option<String>,
    pub status: String,
}

struct TestSession {
    schedule: Schedule,
    following: Following,
    status: String,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum CalendarView {
    Times,
    #[default]
    Agenda,
    Posters,
}

impl CalendarView {
    #[cfg(feature = "parity-capture")]
    fn from_capture_name(name: &str) -> Option<Self> {
        match name {
            "calendario-base" | "calendario-beta-archivo" => Some(Self::Times),
            "calendario-dia" => Some(Self::Agenda),
            "calendario-semana" => Some(Self::Agenda),
            "calendario-mes" => Some(Self::Posters),
            "calendario-timeline" => Some(Self::Times),
            _ => None,
        }
    }
}

#[cfg(feature = "parity-capture")]
fn capture_view() -> CalendarView {
    // Selector exclusivamente QA: el reloj archivado puede cubrir las tres vistas.
    if let Ok(view) = std::env::var("VANTARE_CAPTURE_CALENDAR_VIEW") {
        match view.as_str() {
            "a" => return CalendarView::Agenda,
            "b" => return CalendarView::Posters,
            "c" => return CalendarView::Times,
            _ => {}
        }
    }
    let args: Vec<_> = std::env::args().collect();
    for pair in args.windows(2) {
        if pair[0] == "--capture"
            && let Some(view) = CalendarView::from_capture_name(&pair[1])
        {
            return view;
        }
    }
    CalendarView::Times
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
    pub(crate) fn set_adapt(&mut self, adapt: orbit::Adapt, cx: &mut Context<Self>) {
        if self.adapt != adapt {
            self.adapt = adapt;
            cx.notify();
        }
    }

    pub fn load(data_dir: &Path) -> Result<Self, String> {
        let schedule = Schedule::parse(SEED.as_bytes())?;
        let path = data_dir.join("calendar-following.json");
        let saved = match std::fs::metadata(&path) {
            Ok(_) => Some(files::read(&path, 64 * 1024)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(format!("seguimiento: {error}")),
        };
        let mut following: Following = saved
            .as_deref()
            .map(serde_json::from_slice)
            .transpose()
            .map_err(|error| format!("seguimiento inválido: {error}"))?
            .unwrap_or_default();
        let reminder_path = data_dir.join("calendar-reminders.json");
        let reminder_saved = match std::fs::metadata(&reminder_path) {
            Ok(_) => Some(files::read(&reminder_path, 64 * 1024)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(format!("recordatorios: {error}")),
        };
        following.reminder_ids = reminder_saved
            .as_deref()
            .map(serde_json::from_slice::<Vec<String>>)
            .transpose()
            .map_err(|error| format!("recordatorios inválidos: {error}"))?
            .unwrap_or_default();
        let mut ids = HashSet::new();
        if [&following.series_ids, &following.reminder_ids]
            .iter()
            .any(|list| {
                ids.clear();
                list.len() > 256
                    || list
                        .iter()
                        .any(|id| id.trim().is_empty() || !ids.insert(id))
            })
        {
            return Err("seguimiento inválido: límite o identidad vacía/duplicada".into());
        }
        let schedule_path = path.with_file_name("official-schedule.json");
        let cached =
            files::read(&schedule_path, 64 * 1024).and_then(|bytes| Schedule::parse(&bytes));
        let schedule = cached.unwrap_or(schedule);
        let status = if schedule.is_current(Utc::now())? {
            "Horario guardado en este equipo"
        } else {
            "Aún no hay horario publicado para esta semana"
        }
        .into();
        Ok(Self {
            adapt: orbit::Adapt::default(),
            schedule,
            remote: None,
            refreshing: false,
            first_open_requested: false,
            path,
            following,
            reminder_saved,
            saved,
            demo_now: None,
            view: CalendarView::default(),
            agenda_scroll: None,
            class_filter: None,
            tier_filter: None,
            clock_started: false,
            test_session: None,
            error: None,
            status,
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
            if std::env::args()
                .collect::<Vec<_>>()
                .windows(2)
                .any(|pair| pair[0] == "--capture" && pair[1] == "calendario-lmu-local")
            {
                calendar.schedule = Schedule::parse(include_bytes!(
                    "../reference/fixtures/calendar-lmu-2026-10-06.json"
                ))?;
                calendar.demo_now = None;
                calendar.status = "QA · horario real LMU 6–13 oct recibido de Discord; publicación Supabase pendiente".into();
                let id = calendar.schedule.series[0].id.clone();
                calendar.follow(id.clone())?;
                calendar.toggle_reminder(id)?;
            }
            if calendar_test_capture() {
                calendar.toggle_test_schedule(true, Utc::now())?;
                calendar.demo_now = None;
                let id = calendar.schedule.series[0].id.clone();
                calendar.follow(id.clone())?;
                calendar.toggle_reminder(id)?;
            }
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
        let following = Following {
            series_ids: next,
            reminder_ids: self.following.reminder_ids.clone(),
        };
        let data = serde_json::to_vec_pretty(&following).map_err(|error| error.to_string())?;
        if self.test_session.is_some() {
            self.following = following;
            return Ok(());
        }
        files::save(&self.path, &data, self.saved.as_deref())?;
        self.following = following;
        self.saved = Some(data);
        Ok(())
    }
    /// Preferencia local; no promete una notificación sin servicio de avisos.
    fn toggle_reminder(&mut self, id: String) -> Result<(), String> {
        let mut next = self.following.reminder_ids.clone();
        if next.contains(&id) {
            next.retain(|item| item != &id);
        } else {
            if next.len() == 256 {
                return Err("máximo 256 recordatorios".into());
            }
            next.push(id);
        }
        let data = serde_json::to_vec_pretty(&next).map_err(|error| error.to_string())?;
        if self.test_session.is_some() {
            self.following.reminder_ids = next;
            return Ok(());
        }
        files::save(
            &self.path.with_file_name("calendar-reminders.json"),
            &data,
            self.reminder_saved.as_deref(),
        )?;
        self.following.reminder_ids = next;
        self.reminder_saved = Some(data);
        Ok(())
    }
    pub(crate) fn attach_remote(&mut self, remote: gpui::Entity<crate::services::view::Remote>) {
        self.remote = Some(remote);
    }
    fn refresh(&mut self, cx: &mut Context<Self>) {
        if self.refreshing || self.demo_now.is_some() || self.test_session.is_some() {
            return;
        }
        let target = cx.entity().downgrade();
        let started = self.remote.as_ref().is_some_and(|remote| {
            remote.update(cx, |remote, cx| remote.refresh_calendar(target, cx))
        });
        if started {
            self.refreshing = true;
            self.first_open_requested = true;
            self.error = None;
            self.status = "Actualizando horario…".into();
        } else {
            self.error = Some("No se pudo actualizar el horario: servicios ocupados o no disponibles. Vuelve a intentarlo.".into());
        }
        cx.notify();
    }
    fn apply_publication(&mut self, data: Option<&str>, now: DateTime<Utc>) -> Result<(), String> {
        if self.test_session.is_some() {
            return Ok(());
        }
        let Some(data) = data else {
            self.status = if self.schedule.is_current(now)? {
                "No hay una nueva publicación; se conserva el horario guardado"
            } else {
                "Aún no hay horario publicado para esta semana"
            }
            .into();
            return Ok(());
        };
        if data.len() > 64 * 1024 {
            return Err("horario demasiado grande".into());
        }
        let schedule = Schedule::parse(data.as_bytes())?;
        if !schedule.is_current(now)? {
            self.status = if self.schedule.is_current(now)? {
                "La publicación no está vigente; se conserva el horario guardado"
            } else {
                "Aún no hay horario publicado para esta semana"
            }
            .into();
            return Ok(());
        }
        if self.schedule.is_current(now)? && schedule.window()?.0 < self.schedule.window()?.0 {
            self.status = "La publicación es anterior; se conserva el horario guardado".into();
            return Ok(());
        }
        let path = self.path.with_file_name("official-schedule.json");
        let previous = match std::fs::metadata(&path) {
            Ok(_) => Some(files::read(&path, 64 * 1024)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(format!("caché del horario: {error}")),
        };
        files::save(&path, data.as_bytes(), previous.as_deref())?;
        self.schedule = schedule;
        self.status = "Horario publicado actualizado".into();
        Ok(())
    }
    pub(crate) fn complete_refresh(&mut self, reply: crate::services::protocol::Reply) {
        use crate::services::protocol::Reply;
        self.refreshing = false;
        let result = match reply {
            Reply::Calendar { schedule } => self.apply_publication(schedule.as_deref(), Utc::now()),
            Reply::Error { message } => Err(message),
            _ => Err("respuesta de horario inválida".into()),
        };
        self.error = result.err().map(|error| {
            let retained = if matches!(self.schedule.is_current(Utc::now()), Ok(true)) {
                "Se conserva el último horario válido."
            } else {
                "Vuelve a intentarlo."
            };
            format!("No se pudo actualizar el horario: {error}. {retained}")
        });
        if self.error.is_some() {
            self.status = if matches!(self.schedule.is_current(Utc::now()), Ok(true)) {
                "Horario guardado en este equipo"
            } else {
                "Aún no hay horario publicado para esta semana"
            }
            .into();
        }
    }
}
impl Calendar {
    fn upcoming(&self, now: DateTime<Utc>) -> (Vec<(DateTime<Utc>, String)>, Option<String>) {
        let mut starts = vec![];
        let mut error = None;
        if matches!(self.schedule.is_current(now), Ok(true)) {
            for series in &self.schedule.series {
                if self.following.series_ids.contains(&series.id) {
                    let horizon = if series.recurrence.kind == "interval" {
                        Duration::days(1).max(Duration::minutes(series.recurrence.interval_minutes))
                    } else {
                        Duration::days(7)
                    };
                    match self.schedule.starts(series, now, now + horizon) {
                        Ok(times) => {
                            starts.extend(times.into_iter().map(|time| (time, series.id.clone())));
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
    fn official_state(&self) -> (&Schedule, &Following) {
        self.test_session
            .as_ref()
            .map_or((&self.schedule, &self.following), |previous| {
                (&previous.schedule, &previous.following)
            })
    }

    fn tester_access(&self, cx: &gpui::App) -> bool {
        #[cfg(feature = "parity-capture")]
        if calendar_test_capture() {
            return true;
        }
        self.remote.as_ref().is_some_and(|remote| {
            let access = remote.read(cx).navigation_access();
            access.verified && access.tester && !access.blocked
        })
    }

    fn toggle_test_schedule(&mut self, allowed: bool, now: DateTime<Utc>) -> Result<(), String> {
        if let Some(previous) = self.test_session.take() {
            self.schedule = previous.schedule;
            self.following = previous.following;
            self.status = previous.status;
        } else {
            if !allowed || self.refreshing {
                return Err("Prueba disponible solo para testers, después de actualizar".into());
            }
            // Catálogo REAL archivado; solo en memoria se traslada su ventana.
            // No se presenta como publicación actual ni se guarda en la caché.
            let mut data: serde_json::Value = serde_json::from_str(SEED)
                .map_err(|error| format!("horario de prueba: {error}"))?;
            data["validFrom"] = serde_json::json!(now.to_rfc3339());
            data["validUntil"] = serde_json::json!((now + Duration::days(7)).to_rfc3339());
            let mut schedule = Schedule::parse(data.to_string().as_bytes())?;
            for series in &mut schedule.series {
                series.id = format!("test-{}", series.id);
            }
            self.test_session = Some(TestSession {
                schedule: std::mem::replace(&mut self.schedule, schedule),
                following: std::mem::take(&mut self.following),
                status: std::mem::replace(&mut self.status,
                    "PRUEBA LOCAL · catálogo LMU archivado del 25-ago; fechas trasladadas, no horario oficial actual. Favoritas y avisos de prueba no se guardan.".into()),
            });
        }
        self.error = None;
        self.class_filter = None;
        self.tier_filter = None;
        self.agenda_scroll = None;
        Ok(())
    }

    pub(crate) fn page_header(&self, adapt: orbit::Adapt, cx: &mut Context<Self>) -> gpui::Div {
        let tester = self.tester_access(cx);
        let testing = self.test_session.is_some();
        div()
            .flex()
            .items_center()
            .justify_between()
            .gap(px(12.0))
            .child(
                orbit::neo_page_header("Calendario LMU", "Carreras diarias y semanales", adapt, cx)
                    .flex_1(),
            )
            .when(tester || testing, |header| {
                header.child(
                    orbit::button(
                        "calendar-test",
                        if testing {
                            "Salir de la prueba"
                        } else {
                            "Probar calendario"
                        },
                        cx,
                    )
                    .tab_stop(!self.refreshing)
                    .when(self.refreshing, |button| {
                        orbit::disabled(button, "Espera a que termine la actualización")
                    })
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.error = this
                            .toggle_test_schedule(this.tester_access(cx), Utc::now())
                            .err();
                        cx.notify();
                    })),
                )
            })
            .child(
                orbit::button("calendar-reload", "Actualizar horario", cx)
                    .tab_stop(!testing)
                    .when(testing, |button| {
                        orbit::disabled(
                            button,
                            "Sal de la prueba para actualizar el horario oficial",
                        )
                    })
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.refresh(cx);
                    })),
            )
    }
    pub(crate) fn topbar_controls(&self, cx: &mut Context<Self>) -> gpui::Div {
        presentation::views_control(self, cx)
    }
    pub(crate) fn rail_sections(&self, cx: &mut Context<Self>) -> Vec<orbit::RailSection> {
        beta::rail_sections(self, cx)
    }
}

#[cfg(feature = "parity-capture")]
fn calendar_test_capture() -> bool {
    std::env::args()
        .collect::<Vec<_>>()
        .windows(2)
        .any(|pair| pair[0] == "--capture" && pair[1] == "calendario-beta-prueba")
}
impl Render for Calendar {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.test_session.is_some() && !self.tester_access(cx) {
            self.error = self.toggle_test_schedule(false, Utc::now()).err();
        }
        if !self.first_open_requested
            && self.demo_now.is_none()
            && !matches!(self.schedule.is_current(Utc::now()), Ok(true))
            && self
                .remote
                .as_ref()
                .is_some_and(|remote| !remote.read(cx).calendar_busy())
        {
            self.refresh(cx);
            self.first_open_requested = true;
        } else if matches!(self.schedule.is_current(Utc::now()), Ok(true)) {
            self.first_open_requested = true;
        }
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
        div()
            .size_full()
            .min_h_0()
            .flex()
            .flex_col()
            .gap(px(12.0))
            .when(self.test_session.is_some(), |page| {
                page.child(orbit::callout(self.status.clone(), cx))
            })
            .child(beta::render(self, cx).flex_1().min_h_0())
            .into_any_element()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn real_october_publication_is_current_and_keeps_official_weekly_slots() {
        let schedule = Schedule::parse(include_bytes!(
            "../reference/fixtures/calendar-lmu-2026-10-06.json"
        ))
        .expect("horario real serializado por el bot");
        let now = timestamp("2026-10-09T10:00:00Z").expect("reloj");
        assert!(schedule.is_current(now).expect("vigencia"));
        assert_eq!(schedule.series.len(), 11);
        let special = schedule
            .series
            .iter()
            .find(|series| series.name == "10 Hours of Road Atlanta")
            .expect("evento real");
        assert_eq!(special.track, "Road Atlanta (RC)");
        assert_eq!(special.race_duration_min, Some(600));
        assert_eq!(
            schedule
                .starts(special, now, now + Duration::days(1))
                .expect("salidas"),
            vec![
                timestamp("2026-10-09T15:00:00Z").expect("slot"),
                timestamp("2026-10-09T21:00:00Z").expect("slot"),
                timestamp("2026-10-10T02:00:00Z").expect("slot"),
                timestamp("2026-10-10T09:00:00Z").expect("slot"),
            ]
        );
    }
    #[test]
    fn tester_schedule_is_current_ephemeral_and_restores_real_preferences() {
        let dir = std::env::temp_dir().join(format!("vantare-calroad-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("directorio propio");
        let mut calendar = Calendar::load(&dir).expect("cargar");
        let real_from = calendar.schedule.valid_from.clone();
        let id = calendar.schedule.series[0].id.clone();
        calendar.follow(id.clone()).expect("favorita real");
        calendar
            .toggle_reminder(id.clone())
            .expect("preferencia real");
        let favorites = std::fs::read(&calendar.path).expect("favoritas");
        let reminders = std::fs::read(dir.join("calendar-reminders.json")).expect("avisos");
        let now = timestamp("2026-10-09T10:00:00Z").expect("reloj");
        assert!(calendar.toggle_test_schedule(false, now).is_err());
        calendar.toggle_test_schedule(true, now).expect("tester");
        assert_eq!(calendar.official_state().0.valid_from, real_from);
        assert_eq!(calendar.official_state().1.series_ids, vec![id.clone()]);
        assert!(calendar.schedule.is_current(now).expect("vigencia"));
        assert!(calendar.following.series_ids.is_empty());
        let test_id = calendar.schedule.series[0].id.clone();
        calendar
            .follow(test_id.clone())
            .expect("favorita de prueba");
        calendar
            .toggle_reminder(test_id)
            .expect("preferencia de prueba");
        assert!(!calendar.upcoming(now).0.is_empty());
        assert_eq!(std::fs::read(&calendar.path).expect("favoritas"), favorites);
        assert_eq!(
            std::fs::read(dir.join("calendar-reminders.json")).expect("avisos"),
            reminders
        );
        assert!(!dir.join("official-schedule.json").exists());
        calendar
            .apply_publication(Some("no JSON"), now)
            .expect("no mezcla red y prueba");
        calendar
            .toggle_test_schedule(false, now)
            .expect("salir al revocar acceso");
        assert_eq!(calendar.schedule.valid_from, real_from);
        assert_eq!(calendar.following.series_ids, vec![id.clone()]);
        assert_eq!(calendar.following.reminder_ids, vec![id]);
        std::fs::remove_dir_all(dir).expect("limpiar fixture propia");
    }

    #[test]
    fn favorites_and_pending_reminders_survive_restart_and_conflicts() {
        let dir = std::env::temp_dir().join(format!("vantare-calendar-r6-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("directorio aislado");
        // Archivo del formato anterior: la migración no pierde favoritas.
        std::fs::write(
            dir.join("calendar-following.json"),
            br#"{"seriesIds":["retained"]}"#,
        )
        .expect("formato anterior");
        let mut calendar = Calendar::load(&dir).expect("cargar");
        assert!(calendar.following.reminder_ids.is_empty());
        let id = calendar.schedule.series[0].id.clone();
        calendar
            .toggle_reminder(id.clone())
            .expect("guardar preferencia");
        calendar
            .follow(id.clone())
            .expect("guardar favorita sin perder campana");
        let favorite_document: serde_json::Value = serde_json::from_slice(
            &std::fs::read(dir.join("calendar-following.json")).expect("favoritas"),
        )
        .expect("JSON");
        assert_eq!(
            favorite_document
                .as_object()
                .expect("formato anterior")
                .len(),
            1
        );
        assert!(favorite_document.get("seriesIds").is_some());
        assert!(dir.join("calendar-reminders.json").exists());
        let mut restored = Calendar::load(&dir).expect("reiniciar");
        assert_eq!(
            restored.following.series_ids,
            vec!["retained".to_owned(), id.clone()]
        );
        assert_eq!(restored.following.reminder_ids, vec![id.clone()]);
        calendar
            .toggle_reminder(id.clone())
            .expect("otra escritura válida");
        assert!(restored.toggle_reminder(id.clone()).is_err());
        assert_eq!(restored.following.reminder_ids, vec![id.clone()]);
        let mut final_state = Calendar::load(&dir).expect("releer conflicto");
        assert!(final_state.following.reminder_ids.is_empty());
        final_state.follow(id).expect("quitar favorita");
        assert_eq!(
            Calendar::load(&dir)
                .expect("reinicio final")
                .following
                .series_ids,
            vec!["retained"]
        );
        std::fs::remove_dir_all(dir).expect("limpiar solo fixture propia");
    }

    #[test]
    fn calendar_copy_has_no_registration_actions() {
        let copy = [
            include_str!("calendar/beta.rs"),
            include_str!("calendar/presentation.rs"),
        ]
        .join("\n")
        .to_lowercase();
        for forbidden in ["apuntarme", "apuntado", "tu split", "inscripción"] {
            assert!(
                !copy.contains(forbidden),
                "acción ajena al horario: {forbidden}"
            );
        }
    }

    #[cfg(feature = "parity-capture")]
    #[test]
    fn capture_names_select_the_three_calendar_views() {
        for (name, expected) in [
            ("calendario-base", CalendarView::Times),
            ("calendario-dia", CalendarView::Agenda),
            ("calendario-semana", CalendarView::Agenda),
            ("calendario-mes", CalendarView::Posters),
            ("calendario-timeline", CalendarView::Times),
        ] {
            assert_eq!(CalendarView::from_capture_name(name), Some(expected));
        }
        assert_eq!(CalendarView::from_capture_name("inicio-base"), None);
        assert_eq!(CalendarView::default(), CalendarView::Agenda);
    }

    #[test]
    fn upcoming_only_includes_followed_current_series_in_order_and_is_bounded() {
        let mut calendar = Calendar {
            adapt: orbit::Adapt::default(),
            schedule: Schedule::parse(SEED.as_bytes()).expect("catálogo real empaquetado"),
            remote: None,
            refreshing: false,
            first_open_requested: false,
            path: PathBuf::new(),
            following: Following::default(),
            reminder_saved: None,
            saved: None,
            demo_now: None,
            view: CalendarView::Times,
            agenda_scroll: None,
            class_filter: None,
            tier_filter: None,
            clock_started: false,
            test_session: None,
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
        let identity = series.id.clone();
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
                .all(|(time, series)| *time >= now && *series == identity)
        );
        assert!(starts.windows(2).all(|pair| pair[0].0 < pair[1].0));
        calendar.schedule.series[0].recurrence.interval_minutes = 2880;
        assert!(!calendar.upcoming(now).0.is_empty());
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
        std::fs::write(&lock, "").expect("lock residual");
        // Un lock residual no debe impedir seguir la serie. `follow` alterna,
        // asi que esta segunda llamada la deja de seguir: que el efecto se
        // aplique es la prueba de que el lock residual no bloqueo.
        calendar
            .follow(id.clone())
            .expect("un lock residual no debe bloquear");
        assert!(
            calendar.following.series_ids.is_empty(),
            "el efecto debe aplicarse pese al lock residual"
        );
        let before = calendar.schedule.window().expect("ventana");
        let schedule = dir.join("official-schedule.json");
        std::fs::write(&schedule, "{}").expect("agenda inválida de test");
        assert!(calendar.apply_publication(Some("{}"), Utc::now()).is_err());
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
        std::fs::remove_dir_all(dir).expect("limpiar directorio");
    }

    fn published_fixture(now: DateTime<Utc>) -> String {
        let mut value: serde_json::Value = serde_json::from_str(SEED).expect("fixture");
        value["validFrom"] = serde_json::json!((now - Duration::days(1)).to_rfc3339());
        value["validUntil"] = serde_json::json!((now + Duration::days(6)).to_rfc3339());
        serde_json::to_string(&value).expect("JSON")
    }

    #[test]
    fn publication_is_validated_cached_and_restored_and_failures_keep_last_valid() {
        use crate::services::protocol::Reply;
        let dir = std::env::temp_dir().join(format!(
            "vantare-calendar-publication-{}",
            vantare_services::random_id().expect("id")
        ));
        let now = Utc::now();
        let mut calendar = Calendar::load(&dir).expect("sin caché");
        let data = published_fixture(now);
        calendar
            .apply_publication(Some(&data), now)
            .expect("publicado");
        assert!(calendar.schedule.is_current(now).expect("vigencia"));
        let path = dir.join("official-schedule.json");
        assert_eq!(
            files::read(&path, 64 * 1024).expect("caché"),
            data.as_bytes()
        );
        let mut restored = Calendar::load(&dir).expect("reinicio");
        assert_eq!(
            restored.schedule.window().expect("ventana"),
            calendar.schedule.window().expect("ventana")
        );
        restored.complete_refresh(Reply::Error {
            message: "sin conexión".into(),
        });
        assert!(restored.error.is_some());
        assert!(restored.schedule.is_current(now).expect("conservado"));
        assert!(restored.apply_publication(Some("{}"), now).is_err());
        restored
            .apply_publication(Some(SEED), now)
            .expect("caducado no sustituye");
        restored
            .apply_publication(None, now)
            .expect("vacío no sustituye");
        restored
            .apply_publication(Some(&published_fixture(now - Duration::days(2))), now)
            .expect("publicación anterior aún vigente no sustituye una nueva");
        assert_eq!(
            files::read(&path, 64 * 1024).expect("caché intacta"),
            data.as_bytes()
        );
        assert!(
            !restored
                .schedule
                .is_current(now + Duration::days(6))
                .expect("fin exclusivo")
        );
        // Un guardado bloqueado tampoco altera el horario en memoria ni disco.
        let lock = std::fs::OpenOptions::new()
            .write(true)
            .open(dir.join("official-schedule.json.lock"))
            .expect("lock");
        lock.try_lock().expect("bloqueo real");
        assert!(
            restored
                .apply_publication(Some(&published_fixture(now + Duration::hours(1))), now)
                .is_err()
        );
        assert_eq!(
            restored.schedule.window().expect("ventana"),
            calendar.schedule.window().expect("ventana")
        );
        drop(lock);
        std::fs::remove_dir_all(dir).expect("limpiar propio");
    }

    #[test]
    fn no_network_or_current_cache_is_an_honest_empty_state() {
        use crate::services::protocol::Reply;
        let dir = std::env::temp_dir().join(format!(
            "vantare-calendar-empty-{}",
            vantare_services::random_id().expect("id")
        ));
        let now = Utc::now();
        let mut calendar = Calendar::load(&dir).expect("vacío");
        calendar.complete_refresh(Reply::Error {
            message: "sin conexión".into(),
        });
        assert!(!calendar.schedule.is_current(now).expect("sin vigente"));
        assert!(calendar.upcoming(now).0.is_empty());
        assert_eq!(
            calendar.status,
            "Aún no hay horario publicado para esta semana"
        );
        calendar.complete_refresh(Reply::Calendar { schedule: None });
        assert!(calendar.error.is_none());
        assert_eq!(
            calendar.status,
            "Aún no hay horario publicado para esta semana"
        );
        std::fs::create_dir_all(&dir).expect("propio");
        std::fs::write(dir.join("official-schedule.json"), SEED).expect("caché caducada");
        let restored = Calendar::load(&dir).expect("caducada");
        assert!(!restored.schedule.is_current(now).expect("caducada"));
        assert_eq!(restored.status, calendar.status);
        std::fs::write(dir.join("official-schedule.json"), "{}").expect("caché inválida");
        assert_eq!(
            Calendar::load(&dir)
                .expect("inválida no impide actualizar")
                .status,
            calendar.status
        );
        std::fs::remove_dir_all(dir).expect("limpiar propio");
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
