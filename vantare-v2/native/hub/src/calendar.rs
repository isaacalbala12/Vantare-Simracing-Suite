//! Calendario LMU: horario publicado en UTC (oficial, con respaldo externo
//! indicado), favoritas, avisos y vistas. La red entra solo por services.
// Composición visual por píxeles y horas: las conversiones están acotadas por la rejilla y las
// funciones de pintado son largas por construcción (mismo criterio que home.rs).
#![allow(
    clippy::too_many_lines,
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_possible_wrap,
    clippy::similar_names,
    clippy::float_cmp
)]
use crate::{files, orbit};
use chrono::{DateTime, Duration, Utc};
use gpui::{Context, EventEmitter, FocusHandle, IntoElement, Render, Window};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    time::Instant,
};

pub mod alerts;
mod chrome;
pub mod clock;
mod history;
pub mod ics;
pub mod model;
pub mod rows;
mod ui;

#[cfg(feature = "parity-capture")]
mod capture;
#[cfg(test)]
mod tests;

// Inicio comparte el calendario local; la shell mantiene la navegación y el IPC.
#[path = "home.rs"]
pub mod home;

pub use model::{Schedule, Series};

use alerts::Alerts;
use clock::Zone;
use history::History;

const DOC_LIMIT: u64 = 256 * 1024;

/// Lo que la shell debe hacer con el calendario: avisar o lanzar.
#[derive(Clone, Debug)]
pub enum Event {
    /// Aviso de salida próxima: título, texto y serie para «Ver ficha».
    Alert {
        series_id: String,
        title: String,
        body: String,
    },
    /// Lanzamiento automático opcional, 3 min antes de la salida.
    Launch { series_id: String },
}
impl EventEmitter<Event> for Calendar {}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Following {
    series_ids: Vec<String>,
}

/// Preferencias de visualización, no del horario.
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Prefs {
    #[serde(default)]
    utc: bool,
}

/// Cuándo se comprobó y actualizó el horario (segundos Unix; 0 = nunca).
#[derive(Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stamps {
    #[serde(default)]
    checked: i64,
    #[serde(default)]
    updated: i64,
}

/// Estado del horario para el carril y los estados vacíos.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Health {
    Loading,
    Ok,
    Fallback,
    Offline,
    /// La semana terminó y la nueva aún no está: se enseña la anterior.
    Expired,
    /// Nunca se descargó nada.
    Missing,
}

/// Un documento JSON del directorio de datos con conflicto por bytes vistos.
struct Doc {
    path: PathBuf,
    seen: Option<Vec<u8>>,
}
impl Doc {
    fn open(dir: &Path, name: &str) -> Self {
        Self {
            path: dir.join(name),
            seen: None,
        }
    }
    /// `Ok(None)` si no existe todavía.
    fn read(&mut self) -> Result<Option<Vec<u8>>, String> {
        match std::fs::metadata(&self.path) {
            Ok(_) => {
                let data = files::read(&self.path, DOC_LIMIT)?;
                self.seen = Some(data.clone());
                Ok(Some(data))
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(format!("{}: {error}", self.path.display())),
        }
    }
    fn write(&mut self, data: Vec<u8>) -> Result<(), String> {
        files::save(&self.path, &data, self.seen.as_deref())?;
        self.seen = Some(data);
        Ok(())
    }
    fn json<T: Serialize>(&mut self, value: &T) -> Result<(), String> {
        self.write(serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?)
    }
}

struct Docs {
    following: Doc,
    alerts: Doc,
    prefs: Doc,
    stamps: Doc,
    history: Doc,
    official: Doc,
    previous: Doc,
    fallback: Doc,
}

/// La publicación, si su semana ya terminó.
fn expired(schedule: Option<&Schedule>, now: DateTime<Utc>) -> Option<&Schedule> {
    schedule.filter(|schedule| schedule.window().is_ok_and(|(_, to)| to <= now))
}

#[allow(clippy::struct_excessive_bools)] // Estado independiente de la vista y del ciclo de refresco.
pub struct Calendar {
    adapt: orbit::Adapt,
    remote: Option<gpui::Entity<crate::services::view::Remote>>,
    focus: Option<FocusHandle>,
    docs: Docs,
    /// Publicaciones guardadas tal cual llegaron.
    official: Option<Schedule>,
    previous: Option<Schedule>,
    fallback: Option<Schedule>,
    /// Horario vigente (oficial + respaldo) y última semana pasada (solo lectura).
    current: Option<Schedule>,
    last_week: Option<Schedule>,
    differences: Vec<String>,
    following: Following,
    alerts: Alerts,
    prefs: Prefs,
    stamps: Stamps,
    history: History,
    /// Carreras corridas esta semana (telemetría local); vacío sin fuente.
    runs: Vec<history::Run>,
    refreshing: bool,
    refresh_failed: bool,
    first_open_requested: bool,
    clock_started: bool,
    last_render: Option<Instant>,
    alerts_checked: Option<DateTime<Utc>>,
    in_track: bool,
    /// Nombre del perfil que lanzaría la shell, para el botón del hero.
    profile: Option<String>,
    /// Lanzamiento programado desde el hero: serie y momento.
    armed: Option<(String, DateTime<Utc>)>,
    pub(crate) demo_now: Option<DateTime<Utc>>,
    ui: ui::State,
    pub error: Option<String>,
}

impl Calendar {
    pub(crate) fn set_adapt(&mut self, adapt: orbit::Adapt, cx: &mut Context<Self>) {
        if self.adapt != adapt {
            self.adapt = adapt;
            cx.notify();
        }
    }

    pub fn load(data_dir: &Path) -> Result<Self, String> {
        let mut docs = Docs {
            following: Doc::open(data_dir, "calendar-following.json"),
            alerts: Doc::open(data_dir, "calendar-alerts.json"),
            prefs: Doc::open(data_dir, "calendar-prefs.json"),
            stamps: Doc::open(data_dir, "calendar-stamps.json"),
            history: Doc::open(data_dir, "calendar-history.json"),
            official: Doc::open(data_dir, "official-schedule.json"),
            previous: Doc::open(data_dir, "official-schedule-previous.json"),
            fallback: Doc::open(data_dir, "fallback-schedule.json"),
        };
        let following: Following = docs
            .following
            .read()?
            .map(|data| serde_json::from_slice(&data))
            .transpose()
            .map_err(|error| format!("seguimiento inválido: {error}"))?
            .unwrap_or_default();
        let mut seen = HashSet::new();
        if following.series_ids.len() > 256
            || following
                .series_ids
                .iter()
                .any(|id| id.trim().is_empty() || !seen.insert(id))
        {
            return Err("seguimiento inválido: límite o identidad vacía/duplicada".into());
        }
        let alerts = docs
            .alerts
            .read()?
            .map(|data| Alerts::parse(&data))
            .transpose()?
            .unwrap_or_default();
        // Un archivo dañado de ajustes menores no impide abrir el calendario.
        let prefs = docs
            .prefs
            .read()
            .ok()
            .flatten()
            .and_then(|data| serde_json::from_slice(&data).ok())
            .unwrap_or_default();
        let stamps = docs
            .stamps
            .read()
            .ok()
            .flatten()
            .and_then(|data| serde_json::from_slice(&data).ok())
            .unwrap_or_default();
        let history = History::load(&mut docs.history);
        // Una caché inválida no impide actualizar: se descarta y se vuelve a pedir.
        let cached = |doc: &mut Doc| {
            doc.read()
                .ok()
                .flatten()
                .and_then(|data| Schedule::parse(&data).ok())
        };
        let (official, previous, fallback) = (
            cached(&mut docs.official),
            cached(&mut docs.previous),
            cached(&mut docs.fallback),
        );
        let mut calendar = Self {
            adapt: orbit::Adapt::default(),
            remote: None,
            focus: None,
            docs,
            official,
            previous,
            fallback,
            current: None,
            last_week: None,
            differences: vec![],
            following,
            alerts,
            prefs,
            stamps,
            history,
            runs: vec![],
            refreshing: false,
            refresh_failed: false,
            first_open_requested: false,
            clock_started: false,
            last_render: None,
            alerts_checked: None,
            in_track: false,
            profile: None,
            armed: None,
            demo_now: None,
            ui: ui::State::default(),
            error: None,
        };
        calendar.rebuild(Utc::now());
        Ok(calendar)
    }

    pub fn load_demo(data_dir: &Path, demo: &crate::demo::DemoData) -> Result<Self, String> {
        let mut calendar = Self::load(data_dir)?;
        let now = demo.fixed_now()?;
        calendar.demo_now = Some(now);
        #[cfg(feature = "parity-capture")]
        capture::apply(&mut calendar, demo)?;
        #[cfg(not(feature = "parity-capture"))]
        {
            calendar.official = Some(Schedule::parse(&demo.calendar_json()?)?);
            calendar.rebuild(now);
        }
        Ok(calendar)
    }

    pub(crate) fn now(&self) -> DateTime<Utc> {
        self.demo_now.unwrap_or_else(Utc::now)
    }
    pub(crate) fn zone(&self) -> Zone {
        if self.prefs.utc {
            Zone::Utc
        } else {
            Zone::Local
        }
    }
    /// Horario vigente, si lo hay.
    pub(crate) fn schedule(&self) -> Option<&Schedule> {
        self.current.as_ref()
    }
    pub(crate) fn favorites(&self) -> &[String] {
        &self.following.series_ids
    }

    /// Vuelve a combinar publicaciones según el reloj: oficial vigente más el
    /// respaldo solo para lo que falte; sin oficial vigente, el respaldo solo.
    fn rebuild(&mut self, now: DateTime<Utc>) {
        let live = |schedule: &Option<Schedule>| {
            schedule
                .as_ref()
                .filter(|schedule| matches!(schedule.is_current(now), Ok(true)))
                .cloned()
        };
        self.differences.clear();
        self.current = match (live(&self.official), live(&self.fallback)) {
            (Some(official), Some(fallback)) => {
                let (merged, differences) = official.with_fallback(fallback);
                self.differences = differences;
                Some(merged)
            }
            (Some(official), None) => Some(official),
            (None, fallback) => fallback,
        };
        self.last_week = [
            expired(self.official.as_ref(), now),
            expired(self.previous.as_ref(), now),
        ]
        .into_iter()
        .flatten()
        .max_by_key(|schedule| schedule.window().ok().map(|(_, to)| to))
        .cloned();
        self.alerts.prune(now);
    }

    pub(crate) fn health(&self) -> Health {
        if self.current.is_none() {
            if self.refreshing {
                Health::Loading
            } else if self.last_week.is_some() {
                Health::Expired
            } else {
                Health::Missing
            }
        } else if self.refresh_failed {
            Health::Offline
        } else if self
            .current
            .as_ref()
            .is_some_and(|schedule| schedule.series.iter().any(Series::is_fallback))
        {
            Health::Fallback
        } else {
            Health::Ok
        }
    }

    /// Series que vienen del respaldo, para el rótulo «RC» y el rail.
    pub(crate) fn fallback_count(&self) -> usize {
        self.current
            .as_ref()
            .map_or(0, |s| s.series.iter().filter(|s| s.is_fallback()).count())
    }

    /// Alterna una favorita; el estado se guarda antes de cambiar la memoria.
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
        self.docs.following.json(&following)?;
        self.following = following;
        Ok(())
    }

    fn save_alerts(&mut self, next: Alerts) -> Result<(), String> {
        self.docs.alerts.json(&next)?;
        self.alerts = next;
        Ok(())
    }
    /// Cambia los avisos con una función y los guarda; si falla, no cambia nada.
    pub(crate) fn edit_alerts(
        &mut self,
        change: impl FnOnce(&mut Alerts) -> Result<(), String>,
    ) -> Result<(), String> {
        let mut next = self.alerts.clone();
        change(&mut next)?;
        self.save_alerts(next)
    }
    pub(crate) fn set_utc(&mut self, utc: bool) {
        let prefs = Prefs { utc };
        self.error = self.docs.prefs.json(&prefs).err();
        if self.error.is_none() {
            self.prefs = prefs;
        }
    }

    pub(crate) fn attach_remote(&mut self, remote: gpui::Entity<crate::services::view::Remote>) {
        self.remote = Some(remote);
    }

    pub(crate) fn refresh(&mut self, cx: &mut Context<Self>) {
        if self.refreshing || self.demo_now.is_some() {
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
        } else {
            self.error = Some(
                "No se pudo actualizar el horario: servicios ocupados o no disponibles. Vuelve a intentarlo."
                    .into(),
            );
        }
        cx.notify();
    }

    /// Aplica lo recibido: oficial y respaldo se validan y guardan por separado;
    /// uno inválido nunca destruye el último válido.
    fn apply_publication(
        &mut self,
        official: Option<&str>,
        fallback: Option<&str>,
        now: DateTime<Utc>,
    ) -> Result<(), String> {
        let mut changed = false;
        let mut failure = None;
        if let Some(data) = official {
            match self.store_official(data, now) {
                Ok(updated) => changed |= updated,
                Err(error) => failure = Some(error),
            }
        }
        if let Some(data) = fallback {
            match self.store_fallback(data, now) {
                Ok(updated) => changed |= updated,
                Err(error) => failure = failure.or(Some(error)),
            }
        }
        self.stamps.checked = now.timestamp();
        if changed {
            self.stamps.updated = now.timestamp();
        }
        let _ = self.docs.stamps.json(&self.stamps);
        self.rebuild(now);
        failure.map_or(Ok(()), Err)
    }

    fn store_official(&mut self, data: &str, now: DateTime<Utc>) -> Result<bool, String> {
        if data.len() > 64 * 1024 {
            return Err("horario demasiado grande".into());
        }
        let schedule = Schedule::parse(data.as_bytes())?;
        if !schedule.is_current(now)? {
            return Ok(false);
        }
        let from = schedule.window()?.0;
        let saved_from = self
            .official
            .as_ref()
            .map(|s| s.window().map(|w| w.0))
            .transpose()?;
        match saved_from {
            Some(saved) if from < saved => return Ok(false),
            Some(saved) if from > saved => {
                // Semana nueva: la anterior pasa a solo lectura y al histórico.
                if let (Some(old), Some(raw)) =
                    (self.official.take(), self.docs.official.seen.clone())
                {
                    self.history.upsert(&old, now.timestamp());
                    self.docs.previous.write(raw)?;
                    self.previous = Some(old);
                }
            }
            _ => {}
        }
        let changed = self.docs.official.seen.as_deref() != Some(data.as_bytes());
        if changed {
            self.docs.official.write(data.as_bytes().to_vec())?;
        }
        self.history.upsert(&schedule, now.timestamp());
        let _ = self.docs.history.json(&self.history);
        self.official = Some(schedule);
        Ok(changed)
    }

    fn store_fallback(&mut self, data: &str, now: DateTime<Utc>) -> Result<bool, String> {
        if data.len() > 64 * 1024 {
            return Err("respaldo demasiado grande".into());
        }
        let schedule = Schedule::parse(data.as_bytes())?;
        if !schedule.is_current(now)? {
            return Ok(false);
        }
        self.docs.fallback.write(data.as_bytes().to_vec())?;
        self.fallback = Some(schedule);
        Ok(true)
    }

    pub(crate) fn complete_refresh(
        &mut self,
        reply: crate::services::protocol::Reply,
        cx: &mut Context<Self>,
    ) {
        use crate::services::protocol::Reply;
        self.refreshing = false;
        let now = Utc::now();
        let week_before = self.week_from();
        let result = match reply {
            Reply::Calendar { schedule, fallback } => {
                self.refresh_failed = false;
                self.apply_publication(schedule.as_deref(), fallback.as_deref(), now)
            }
            Reply::Error { message } => {
                self.refresh_failed = true;
                self.stamps.checked = now.timestamp();
                Err(message)
            }
            _ => Err("respuesta de horario inválida".into()),
        };
        self.error = result.err().map(|error| {
            let retained = if self.current.is_some() {
                "Se conserva el último horario válido."
            } else {
                "Vuelve a intentarlo."
            };
            format!("No se pudo actualizar el horario: {error}. {retained}")
        });
        self.report_orphans();
        let week_after = self.week_from();
        if self.alerts.notify_week
            && self.alerts.channels.windows
            && week_before.is_some_and(|before| week_after.is_some_and(|after| after > before))
            && let Some(from) = week_after
        {
            let title = clock::week_title(&clock::week_days(from));
            cx.emit(Event::Alert {
                series_id: "semana-nueva".into(),
                title: format!("Ya está el horario de la semana {title}"),
                body: "Tus favoritas y tus avisos pasan solos a la semana nueva.".into(),
            });
        }
    }

    /// Inicio de la semana LMU del horario vigente (o de la última, ya caducada).
    fn week_from(&self) -> Option<DateTime<Utc>> {
        self.current
            .as_ref()
            .or(self.last_week.as_ref())
            .and_then(|s| s.window().ok())
            .map(|(from, _)| from)
    }

    /// Avisos que apuntan a una serie que ya no está: se dice, no se borran.
    fn report_orphans(&mut self) {
        let Some(schedule) = &self.current else {
            return;
        };
        let gone: Vec<_> = self.alerts.orphans(schedule);
        if !gone.is_empty() && self.error.is_none() {
            self.error = Some(format!(
                "Un aviso apunta a una serie que ya no está en el horario: {}. Puedes quitarlo en Avisos.",
                gone.join(", ")
            ));
        }
    }

    /// Cada cuánto se busca: 15 min; 5 min el lunes por la mañana (UTC) mientras
    /// la semana siguiente no esté publicada.
    fn poll_interval(now: DateTime<Utc>) -> Duration {
        use chrono::{Datelike, Timelike, Weekday};
        let monday_morning = now.weekday() == Weekday::Mon && now.hour() < 12;
        Duration::minutes(if monday_morning { 5 } else { 15 })
    }

    /// Tick de reloj: sondeo periódico, caducidad de la semana y avisos.
    fn tick(&mut self, cx: &mut Context<Self>) {
        let now = Utc::now();
        if self
            .current
            .as_ref()
            .is_some_and(|s| s.window().is_ok_and(|w| w.1 <= now))
        {
            self.rebuild(now);
        }
        let last = DateTime::from_timestamp(self.stamps.checked, 0);
        if last.is_none_or(|last| now - last >= Self::poll_interval(now)) && !self.refreshing {
            self.refresh(cx);
        }
        if self.armed.as_ref().is_some_and(|(_, at)| *at <= now)
            && let Some((series_id, _)) = self.armed.take()
        {
            cx.emit(Event::Launch { series_id });
        }
        self.check_alerts(now, cx);
    }

    fn check_alerts(&mut self, now: DateTime<Utc>, cx: &mut Context<Self>) {
        let since = self.alerts_checked.replace(now);
        let (Some(schedule), Some(since)) = (&self.current, since) else {
            return;
        };
        let due = self.alerts.due(schedule, now, since, self.in_track);
        let launch = self.alerts.auto_launch;
        for item in due.into_iter().filter(|_| self.alerts.channels.windows) {
            let Some(series) = schedule.by_id(&item.series_id) else {
                continue;
            };
            let zone = Zone::Local;
            cx.emit(Event::Alert {
                series_id: series.id.clone(),
                title: format!("{} sale a las {}", series.name, zone.hm(item.at)),
                body: format!(
                    "{} · carrera {} · {}",
                    series.track_short(),
                    clock::duration_txt(series.race_minutes()),
                    clock::in_txt(item.at - now)
                ),
            });
        }
        if launch {
            let lead = Duration::minutes(3);
            for series in &schedule.series {
                let Some(at) = schedule.next_start(series, now) else {
                    continue;
                };
                let fire = at - lead;
                if fire > since && fire <= now && self.alerts.cause(schedule, series, at).is_some()
                {
                    cx.emit(Event::Launch {
                        series_id: series.id.clone(),
                    });
                }
            }
        }
    }

    /// La shell dice qué perfil lanzaría el botón del hero.
    pub(crate) fn set_profile(&mut self, name: Option<String>) {
        // La escena de captura fija «Carrera LMU», el perfil del contrato visual.
        #[cfg(feature = "parity-capture")]
        if self.demo_now.is_some() && self.profile.is_some() {
            return;
        }
        self.profile = name;
    }

    /// Pide a la shell lanzar el perfil por la serie de la próxima carrera.
    pub(crate) fn launch_profile(&mut self, cx: &mut Context<Self>) {
        let Some(schedule) = self.current.as_ref() else {
            return;
        };
        if let Some(hero) = rows::hero(schedule, self.now(), self.favorites(), &self.alerts) {
            cx.emit(Event::Launch {
                series_id: hero.series.id.clone(),
            });
        }
    }

    /// Programa un lanzamiento puntual (3 min antes de la próxima carrera).
    pub(crate) fn schedule_launch(&mut self, at: DateTime<Utc>, cx: &mut Context<Self>) {
        let Some(schedule) = self.current.as_ref() else {
            return;
        };
        let id = rows::hero(schedule, self.now(), self.favorites(), &self.alerts)
            .map(|hero| hero.series.id.clone());
        if let Some(id) = id {
            self.arm_launch(&id, at, cx);
        }
    }

    pub(crate) fn arm_launch(
        &mut self,
        series_id: &str,
        at: DateTime<Utc>,
        cx: &mut Context<Self>,
    ) {
        self.armed = Some((series_id.to_owned(), at));
        cx.notify();
    }

    /// La shell informa de si hay una sesión en pista: las franjas se callan.
    pub(crate) fn set_in_track(&mut self, in_track: bool) {
        self.in_track = in_track;
    }
}

impl Render for Calendar {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.focus.is_none() {
            self.focus = Some(cx.focus_handle());
        }
        self.last_render = Some(Instant::now());
        if !self.first_open_requested
            && self.demo_now.is_none()
            && self.current.is_none()
            && self
                .remote
                .as_ref()
                .is_some_and(|remote| !remote.read(cx).calendar_busy())
        {
            self.refresh(cx);
        } else if self.current.is_some() {
            self.first_open_requested = true;
        }
        if !self.clock_started && self.demo_now.is_none() {
            self.clock_started = true;
            cx.spawn(async move |this, cx| {
                loop {
                    cx.background_executor()
                        .timer(std::time::Duration::from_secs(1))
                        .await;
                    let alive = this.update(cx, |this, cx| {
                        this.tick(cx);
                        // Solo repinta si la pantalla se está viendo.
                        if this
                            .last_render
                            .is_some_and(|at| at.elapsed() < std::time::Duration::from_secs(3))
                        {
                            cx.notify();
                        }
                    });
                    if alive.is_err() {
                        break;
                    }
                }
            })
            .detach();
        }
        ui::render(self, window, cx)
    }
}
