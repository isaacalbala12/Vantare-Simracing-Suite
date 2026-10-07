//! Centro local acotado; fuentes y acciones cerradas del contrato Go.
use crate::{Section, orbit};
use gpui::{
    Context, Entity, FocusHandle, IntoElement, Render, WeakEntity, Window, div, prelude::*, px,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    Updater,
    Launcher,
    System,
    Beta,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info,
    Warning,
    Error,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Action {
    kind: String,
    target: String,
}
impl Action {
    pub fn destination(&self) -> Result<Section, String> {
        if self.kind != "navigate" {
            return Err("acción no permitida".into());
        }
        match self.target.as_str() {
            "launcher" => Ok(Section::Launcher),
            "settings:updates" => Ok(Section::Settings),
            _ => Err("destino no permitido".into()),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Record {
    pub v: u32,
    pub id: String,
    pub source: Source,
    pub severity: Severity,
    pub occurred_at: i64,
    pub dedupe_key: String,
    pub title_key: String,
    #[serde(default)]
    pub text_key: String,
    #[serde(default)]
    pub params: BTreeMap<String, String>,
    #[serde(default)]
    pub concrete_cause: String,
    #[serde(default)]
    pub action: Option<Action>,
    pub unread: bool,
}
impl Record {
    fn validate(&mut self) -> Result<(), String> {
        if self.title_key.is_empty()
            || self.title_key.len() > 120
            || self.text_key.len() > 120
            || self.dedupe_key.is_empty()
            || self.dedupe_key.len() > 160
            || self.params.len() > 8
            || self
                .params
                .iter()
                .any(|(key, value)| key.len() > 120 || value.len() > 120)
        {
            return Err("notificación fuera de límites".into());
        }
        if let Some(action) = &self.action {
            action.destination()?;
        }
        let mut end = self.concrete_cause.len().min(240);
        while !self.concrete_cause.is_char_boundary(end) {
            end -= 1;
        }
        self.concrete_cause.truncate(end);
        Ok(())
    }
    fn same_signature(&self, other: &Self) -> bool {
        self.severity == other.severity
            && self.title_key == other.title_key
            && self.text_key == other.text_key
            && self.params == other.params
            && self.concrete_cause == other.concrete_cause
    }
    pub fn local_error(key: &str, cause: String) -> Self {
        Self {
            v: 1,
            id: String::new(),
            source: if key == "hub.launcher" {
                Source::Launcher
            } else {
                Source::System
            },
            severity: Severity::Error,
            occurred_at: 0,
            dedupe_key: key.into(),
            title_key: "hub.local.error".into(),
            text_key: String::new(),
            params: BTreeMap::new(),
            concrete_cause: cause,
            action: (key == "hub.launcher").then(|| Action {
                kind: "navigate".into(),
                target: "launcher".into(),
            }),
            unread: true,
        }
    }
}
#[derive(Default)]
pub struct Center {
    pub records: Vec<Record>,
    pub revision: u64,
    sequence: u64,
}
impl Center {
    /// Exclusivamente escena visual explícita; nunca se llama en el Hub productivo.
    #[cfg(any(test, feature = "parity-capture"))]
    pub(crate) fn capture_fixture() -> Result<Self, String> {
        let records: Vec<Record> =
            serde_json::from_str(include_str!("../reference/fixtures/notifications-r8.json"))
                .map_err(|error| format!("fixture Notificaciones: {error}"))?;
        let mut center = Self::default();
        for record in records {
            let at = record.occurred_at;
            let unread = record.unread;
            center.publish(record, at, !unread)?;
        }
        Ok(center)
    }
    #[cfg(any(test, feature = "parity-capture"))]
    pub(crate) fn with_capture_scene(self, scene: Option<&str>) -> Result<Self, String> {
        if scene == Some("notificaciones-panel") {
            Self::capture_fixture()
        } else {
            Ok(self)
        }
    }
    pub fn demo(
        data: &crate::demo::DemoData,
        at: chrono::DateTime<chrono::Utc>,
    ) -> Result<Self, String> {
        let mut center = Self::default();
        for (index, notification) in data.notifications.iter().enumerate() {
            let source = match notification.source.as_str() {
                "updater" => Source::Updater,
                "launcher" => Source::Launcher,
                "system" => Source::System,
                _ => {
                    return Err(format!(
                        "fuente de notificación demo inválida: {}",
                        notification.source
                    ));
                }
            };
            let severity = match notification.severity.as_str() {
                "info" => Severity::Info,
                "warning" => Severity::Warning,
                "error" => Severity::Error,
                _ => {
                    return Err(format!(
                        "severidad de notificación demo inválida: {}",
                        notification.severity
                    ));
                }
            };
            let mut params = BTreeMap::new();
            if !notification.tag.is_empty() {
                params.insert("tag".into(), notification.tag.clone());
            }
            center.publish(
                Record {
                    v: 1,
                    id: String::new(),
                    source,
                    severity,
                    occurred_at: 0,
                    dedupe_key: format!("demo-{}", index + 1),
                    title_key: notification.title_key.clone(),
                    text_key: notification.text_key.clone(),
                    params,
                    concrete_cause: String::new(),
                    action: None,
                    unread: true,
                },
                at.timestamp_millis(),
                false,
            )?;
        }
        Ok(center)
    }

    pub fn publish(&mut self, mut record: Record, now: i64, muted: bool) -> Result<(), String> {
        record.validate()?;
        if let Some(index) = self
            .records
            .iter()
            .position(|item| item.dedupe_key == record.dedupe_key)
        {
            let old = self.records.remove(index);
            if old.same_signature(&record) {
                record = old;
            } else {
                record.id = old.id;
                record.unread = !muted;
            }
        } else {
            self.sequence = self.sequence.checked_add(1).ok_or("identidad agotada")?;
            record.id = format!("n-{}", self.sequence);
            record.unread = !muted;
        }
        record.v = 1;
        record.occurred_at = now;
        self.records.insert(0, record);
        self.records.truncate(50);
        self.revision = self.revision.saturating_add(1);
        Ok(())
    }
    pub fn unread(&self) -> usize {
        self.records.iter().filter(|record| record.unread).count()
    }
    pub fn mark_read(&mut self, id: &str) {
        for record in &mut self.records {
            if id == "all" || record.id == id {
                record.unread = false;
            }
        }
        self.revision = self.revision.saturating_add(1);
    }
    /// Agrupa por fecha civil local, conservando primero los avisos más recientes.
    fn groups<Tz: chrono::TimeZone>(
        &self,
        filter: Filter,
        tester: bool,
        now: &chrono::DateTime<Tz>,
    ) -> Vec<(&'static str, Vec<&Record>)> {
        let mut records: Vec<_> = self
            .records
            .iter()
            .filter(|record| filter.matches(record) && (tester || record.source != Source::Beta))
            .collect();
        records.sort_by_key(|record| std::cmp::Reverse(record.occurred_at));
        ["Hoy", "Ayer", "Esta semana", "Anteriores", "Sin fecha"]
            .into_iter()
            .filter_map(|group| {
                let records: Vec<_> = records
                    .iter()
                    .copied()
                    .filter(|record| date_group(record.occurred_at, now) == group)
                    .collect();
                (!records.is_empty()).then_some((group, records))
            })
            .collect()
    }
    fn activate(&mut self, id: &str) -> Option<Section> {
        let destination = self
            .records
            .iter()
            .find(|record| record.id == id)
            .and_then(|record| record.action.as_ref())
            .and_then(|action| action.destination().ok());
        self.mark_read(id);
        destination
    }
    pub fn clear(&mut self) {
        self.records.clear();
        self.revision = self.revision.saturating_add(1);
    }
}
#[derive(Default)]
pub struct Notifications {
    center: Center,
    pub destination: Option<Section>,
    pub error: Option<String>,
    layer: Option<Entity<orbit::Layer>>,
    pub bell_bounds: Option<gpui::Bounds<gpui::Pixels>>,
    pub bell_was_open: bool,
    focus: BTreeMap<String, FocusHandle>,
    filter: Filter,
    tester: bool,
    now: Option<chrono::DateTime<chrono::Local>>,
}
#[derive(Clone)]
enum Intent {
    ReadAll,
    Clear,
    FullView,
    Activate(String),
    Read(String),
    Filter(Filter),
}

pub const PANEL_WIDTH: f32 = 452.0;
#[derive(Clone, Copy, Default, Debug, PartialEq, Eq)]
enum Filter {
    #[default]
    All,
    Unread,
    Launcher,
    Beta,
    System,
}
impl Filter {
    fn label(self) -> &'static str {
        match self {
            Self::All => "Todas",
            Self::Unread => "Sin leer",
            Self::Launcher => "Launcher",
            Self::Beta => "Beta",
            Self::System => "Sistema",
        }
    }
    fn matches(self, record: &Record) -> bool {
        match self {
            Self::All => true,
            Self::Unread => record.unread,
            Self::Launcher => record.source == Source::Launcher,
            Self::Beta => record.source == Source::Beta,
            Self::System => matches!(record.source, Source::System | Source::Updater),
        }
    }
}
fn date_group<Tz: chrono::TimeZone>(at: i64, now: &chrono::DateTime<Tz>) -> &'static str {
    let Some(at) = chrono::DateTime::from_timestamp_millis(at) else {
        return "Sin fecha";
    };
    // La zona aplica el offset de cada fecha, incluido el cambio de horario.
    let days = now
        .date_naive()
        .signed_duration_since(at.with_timezone(&now.timezone()).date_naive())
        .num_days();
    match days {
        ..=0 => "Hoy",
        1 => "Ayer",
        2..=6 => "Esta semana",
        _ => "Anteriores",
    }
}

/// La capa no mantiene viva su dueña: evita Notifications → Layer → Panel → Notifications.
struct Panel {
    notifications: WeakEntity<Notifications>,
}
impl Render for Panel {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        match self.notifications.upgrade() {
            Some(notifications) => notifications.update(cx, |this, cx| {
                this.history(true, f32::from(window.viewport_size().height) - 72.0, cx)
            }),
            None => div(),
        }
    }
}

fn severity(record: &Record, cx: &gpui::App) -> (&'static str, orbit::Tone) {
    match record.severity {
        Severity::Info => (
            "Información",
            if orbit::is_mono(cx) {
                orbit::Tone::Reference
            } else {
                orbit::Tone::Neutral
            },
        ),
        Severity::Warning => ("Aviso", orbit::Tone::Warning),
        Severity::Error => ("Error", orbit::Tone::Danger),
    }
}
fn message(key: &str, params: &BTreeMap<String, String>) -> String {
    let template = match key {
        "hub.local.error" => "Error local del Hub",
        "notifications.record.launcher.finished.title" => "Perfil listo",
        "notifications.record.launcher.finished.text" => "{{profile}} se inició correctamente.",
        "notifications.record.launcher.failed.title" => "El perfil falló",
        "notifications.record.launcher.failed.text" => "{{profile}} no se pudo iniciar del todo.",
        "notifications.record.updater.available.title" => "Actualización disponible",
        "notifications.record.updater.available.text" => "{{tag}} ya está lista para instalar.",
        "notifications.record.updater.error.title" => "La actualización falló",
        "notifications.record.updater.installed.title" => "Instalador en marcha",
        "notifications.record.system.test.title" => "Notificación de prueba",
        "notifications.record.system.test.sent" => "Se envió la notificación de prueba.",
        "notifications.record.system.test.failed" => "La notificación de prueba falló.",
        _ => key,
    };
    params
        .iter()
        .fold(template.to_owned(), |text, (key, value)| {
            text.replace(&format!("{{{{{key}}}}}"), value)
        })
}
fn time(occurred_at: i64) -> String {
    chrono::DateTime::from_timestamp_millis(occurred_at)
        .map(|date| {
            date.with_timezone(&chrono::Local)
                .format("%H:%M")
                .to_string()
        })
        .unwrap_or_default()
}
impl Notifications {
    pub(crate) fn from_center(center: Center) -> Self {
        Self {
            center,
            ..Self::default()
        }
    }
    pub(crate) fn set_tester(&mut self, tester: bool, cx: &mut Context<Self>) {
        if self.tester != tester {
            self.tester = tester;
            if !tester && self.filter == Filter::Beta {
                self.filter = Filter::All;
            }
            cx.notify();
        }
    }
    #[cfg(feature = "parity-capture")]
    pub(crate) fn capture_clock(&mut self, now: chrono::DateTime<chrono::Utc>) {
        self.now = Some(now.with_timezone(&chrono::Local));
    }

    pub fn unread(&self) -> usize {
        self.center
            .records
            .iter()
            .filter(|record| record.unread && (self.tester || record.source != Source::Beta))
            .count()
    }
    pub fn popover(&self) -> Option<Entity<orbit::Layer>> {
        self.layer.clone()
    }
    pub fn popover_open(&self, cx: &gpui::App) -> bool {
        self.layer.as_ref().is_some_and(|layer| layer.read(cx).open)
    }
    pub fn click_bell(
        &mut self,
        event: &gpui::ClickEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if !matches!(event, gpui::ClickEvent::Mouse(_)) {
            self.bell_was_open = false;
        }
        // MouseDown fuera del panel lo cierra antes del click de su propia campana.
        if std::mem::take(&mut self.bell_was_open) {
            if let Some(layer) = &self.layer {
                layer.update(cx, |layer, cx| layer.dismiss(window, cx));
            }
        } else {
            self.toggle_popover(window, cx);
        }
        cx.notify();
    }
    pub fn toggle_popover(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(layer) = self.layer.take() {
            let was_open = layer.read(cx).open;
            layer.update(cx, |layer, cx| layer.dismiss(window, cx));
            if was_open {
                cx.notify();
                return;
            }
        }
        let notifications = cx.entity();
        let panel = cx.new(|cx| {
            cx.observe(&notifications, |_, _, cx| cx.notify()).detach();
            Panel {
                notifications: notifications.downgrade(),
            }
        });
        let Some(bounds) = self.bell_bounds else {
            return;
        };
        let position = gpui::point(
            bounds.origin.x + bounds.size.width - px(PANEL_WIDTH),
            bounds.origin.y + bounds.size.height + px(orbit::MENU_PAD),
        );
        let layer = cx.new(|cx| {
            orbit::Layer::new(
                "Notificaciones",
                orbit::LayerKind::Popover(position),
                panel.into(),
                vec![],
                window,
                cx,
            )
            .with_popover_size(PANEL_WIDTH, f32::from(window.viewport_size().height) - 72.0)
        });
        cx.subscribe(&layer, |_, _, _: &orbit::Dismissed, cx| cx.notify())
            .detach();
        layer.update(cx, |layer, cx| layer.show(window, cx));
        self.layer = Some(layer);
        cx.notify();
    }
    pub fn report(&mut self, key: &str, cause: String, cx: &mut Context<Self>) {
        self.publish_local(Record::local_error(key, cause), cx);
    }
    pub fn update_ready(&mut self, message: String, cx: &mut Context<Self>) {
        let mut record = Record::local_error("updater.ready", message);
        record.source = Source::Updater;
        record.severity = Severity::Info;
        record.title_key = "Actualización lista".into();
        self.publish_local(record, cx);
    }
    fn publish_local(&mut self, record: Record, cx: &mut Context<Self>) {
        if let Err(error) =
            self.center
                .publish(record, chrono::Utc::now().timestamp_millis(), false)
        {
            self.error = Some(error);
        }
        cx.notify();
    }
    fn execute(&mut self, intent: Intent, window: &mut Window, cx: &mut Context<Self>) {
        match intent {
            Intent::ReadAll => self.center.mark_read("all"),
            Intent::Clear => self.center.clear(),
            Intent::FullView => self.destination = Some(Section::Notifications),
            Intent::Activate(id) => self.destination = self.center.activate(&id),
            Intent::Read(id) => self.center.mark_read(&id),
            Intent::Filter(filter) => {
                if filter != Filter::Beta || self.tester {
                    self.filter = filter;
                }
            }
        }
        if self.destination.is_some()
            && let Some(layer) = &self.layer
        {
            layer.update(cx, |layer, cx| layer.dismiss(window, cx));
        }
        cx.notify();
    }
    fn focus(&mut self, id: &str, cx: &mut Context<Self>) -> FocusHandle {
        self.focus
            .entry(id.to_owned())
            .or_insert_with(|| cx.focus_handle())
            .clone()
    }
    fn tool(
        &mut self,
        id: &'static str,
        label: &str,
        enabled: bool,
        intent: Intent,
        compact: bool,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let focus = self.focus(id, cx);
        // Acción textual del popover Wails: composición del texto/foco del kit.
        let button = if compact {
            orbit::text(label.to_owned(), 10.5, 400, orbit::ink_3(cx), cx)
                .font_weight(gpui::FontWeight::NORMAL)
                .id(id)
                .role(gpui::Role::Button)
                .aria_label(label.to_owned())
                .tab_index(0)
                .cursor_pointer()
                .focus_visible(|s| s.border_2().border_color(gpui::rgb(orbit::coral(cx))))
        } else {
            orbit::button(id, label, cx)
        };
        button
            .track_focus(&focus)
            .tab_stop(enabled)
            .when(!enabled, |tool| {
                tool.aria_label(format!("{label} · deshabilitado"))
            })
            .when(!enabled, |tool| tool.opacity(orbit::DISABLED))
            .on_click(cx.listener(move |this, _, window, cx| {
                if enabled {
                    this.execute(intent.clone(), window, cx);
                }
            }))
    }
    fn record_actions(
        record: &Record,
        focus: &FocusHandle,
        action_focus: &FocusHandle,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let id = record.id.clone();
        let action_id = id.clone();
        let read_id = id.clone();
        let action_label = record.action.as_ref().map_or("Abrir", |action| {
            if action.target == "launcher" {
                "Ver Launcher"
            } else {
                "Ver ajustes"
            }
        });
        div()
            .flex()
            .flex_wrap()
            .gap(px(8.0))
            .when(record.action.is_some(), |row| {
                row.child(
                    orbit::button(format!("notification-action-{id}"), action_label, cx)
                        .track_focus(action_focus)
                        .on_click(cx.listener(move |this, _, window, cx| {
                            cx.stop_propagation();
                            this.execute(Intent::Activate(action_id.clone()), window, cx);
                        })),
                )
            })
            .when(record.unread, |row| {
                row.child(
                    orbit::ghost_button(format!("notification-read-{id}"), "Marcar leído", cx)
                        .track_focus(focus)
                        .on_click(cx.listener(move |this, _, window, cx| {
                            cx.stop_propagation();
                            this.execute(Intent::Read(read_id.clone()), window, cx);
                        })),
                )
            })
            .when(!record.unread && record.action.is_none(), |row| {
                row.child(orbit::text("Leído", 11.0, 400, orbit::ink_4(cx), cx))
            })
    }
    fn record_time(record: &Record, cx: &gpui::App) -> gpui::Div {
        orbit::text(time(record.occurred_at), 12.0, 400, orbit::ink_4(cx), cx)
            .relative()
            .when(record.unread, |stamp| {
                stamp.child(
                    orbit::status_dot(orbit::Tone::Accent, 8.0, cx)
                        .absolute()
                        .top(px(24.0))
                        .right_0(),
                )
            })
    }
    fn record_row(
        record: &Record,
        focus: &FocusHandle,
        action_focus: &FocusHandle,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let id = record.id.clone();
        let activate_id = id.clone();
        let (_, tone) = severity(record, cx);
        let icon = match record.source {
            Source::Launcher => "v-launch",
            Source::Updater => "v-download",
            Source::Beta => "v-testing",
            Source::System => "v-bell",
        };
        let detail = [
            message(&record.text_key, &record.params),
            record.concrete_cause.clone(),
        ]
        .into_iter()
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join(" · ");
        div()
            .id(id.clone())
            .flex_none()
            .flex()
            .gap(px(12.0))
            .p(px(12.0))
            .rounded(px(12.0))
            .when(record.unread, |row| {
                row.bg(orbit::tint(orbit::ink(cx), 0.035))
            })
            .child(
                div()
                    .size(px(34.0))
                    .flex_none()
                    .rounded(px(10.0))
                    .flex()
                    .items_center()
                    .justify_center()
                    .bg(gpui::rgb(orbit::surface_3(cx)))
                    .child(orbit::icon(
                        icon,
                        18.0,
                        match tone {
                            orbit::Tone::Danger => orbit::red(cx),
                            orbit::Tone::Warning => orbit::ember(cx),
                            _ => orbit::coral(cx),
                        },
                    )),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap(px(6.0))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .gap(px(10.0))
                            .child(
                                orbit::text(
                                    message(&record.title_key, &record.params),
                                    14.0,
                                    600,
                                    orbit::ink(cx),
                                    cx,
                                )
                                .flex_1()
                                .min_w_0(),
                            )
                            .child(Self::record_time(record, cx)),
                    )
                    .child(
                        orbit::text(detail, 13.0, 400, orbit::ink_3(cx), cx).line_height(px(18.0)),
                    )
                    .child(Self::record_actions(record, focus, action_focus, cx)),
            )
            .cursor_pointer()
            .on_click(cx.listener(move |this, _, window, cx| {
                this.execute(Intent::Activate(activate_id.clone()), window, cx);
            }))
    }
    #[allow(clippy::too_many_lines)] // Cabecera, filtros, historial desplazable y pie del mismo panel.
    fn history(&mut self, compact: bool, height: f32, cx: &mut Context<Self>) -> gpui::Div {
        self.focus.retain(|id, _| {
            matches!(
                id.as_str(),
                "read-all" | "clear-notifications" | "full-notifications"
            ) || id.starts_with("notifications-filter-")
                || self.center.records.iter().any(|record| {
                    record.id == *id || id.strip_prefix("action-") == Some(record.id.as_str())
                })
        });
        let unread = self.unread();
        let nonempty = !self.center.records.is_empty();
        let mut targets = Vec::new();
        let read = self.tool(
            "read-all",
            "Marcar todo como leído",
            unread > 0,
            Intent::ReadAll,
            true,
            cx,
        );
        if unread > 0 {
            targets.push(self.focus("read-all", cx));
        }
        let header = div()
            .flex()
            .items_center()
            .justify_between()
            .gap(px(10.0))
            .child(
                orbit::text("Notificaciones", 22.0, 600, orbit::ink(cx), cx)
                    .font_family(cx.global::<orbit::design::Tokens>().fonts.display.clone()),
            )
            .child(orbit::pill(
                &format!("{unread} sin leer"),
                if unread > 0 {
                    orbit::Tone::Accent
                } else {
                    orbit::Tone::Neutral
                },
                cx,
            ))
            .child(read);
        let mut filters = div()
            .id("notifications-filters")
            .flex()
            .flex_none()
            .overflow_x_scroll()
            .gap(px(4.0));
        for (id, filter) in [
            ("all", Filter::All),
            ("unread", Filter::Unread),
            ("launcher", Filter::Launcher),
            ("beta", Filter::Beta),
            ("system", Filter::System),
        ] {
            if filter == Filter::Beta && !self.tester {
                continue;
            }
            let key = format!("notifications-filter-{id}");
            let focus = self.focus(&key, cx);
            targets.push(focus.clone());
            filters = filters.child(
                orbit::ghost_button(
                    key,
                    &if filter == Filter::Unread {
                        format!("Sin leer · {unread}")
                    } else {
                        filter.label().to_owned()
                    },
                    cx,
                )
                .flex_none()
                .track_focus(&focus)
                .when(self.filter == filter, |button| {
                    button.bg(gpui::rgb(orbit::surface_3(cx)))
                })
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.execute(Intent::Filter(filter), window, cx);
                })),
            );
        }
        let now = self.now.unwrap_or_else(chrono::Local::now);
        let groups: Vec<_> = self
            .center
            .groups(self.filter, self.tester, &now)
            .into_iter()
            .map(|(group, records)| (group, records.into_iter().cloned().collect::<Vec<_>>()))
            .collect();
        let has_visible = !groups.is_empty();
        let mut history = div()
            .id("notifications-history")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .gap(px(8.0));
        if groups.is_empty() {
            history = history.child(
                div()
                    .min_h(px(220.0))
                    .flex_1()
                    .flex()
                    .flex_col()
                    .items_center()
                    .justify_center()
                    .gap(px(16.0))
                    .child(orbit::icon("v-bell", 42.0, orbit::ink_3(cx)))
                    .child(orbit::text("Todo al día", 16.0, 600, orbit::ink(cx), cx))
                    .child(orbit::text(
                        if nonempty {
                            "No hay notificaciones en este filtro."
                        } else {
                            "Aquí verás tus avisos y lanzamientos."
                        },
                        13.0,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    )),
            );
        }
        for (group, records) in groups {
            history = history.child(
                orbit::text(group, 12.0, 400, orbit::ink_4(cx), cx)
                    .flex_none()
                    .mt(px(12.0)),
            );
            for record in &records {
                let focus = self.focus(&record.id, cx);
                let action_focus = self.focus(&format!("action-{}", record.id), cx);
                if record.action.is_some() {
                    targets.push(action_focus.clone());
                }
                if record.unread {
                    targets.push(focus.clone());
                }
                history = history.child(Self::record_row(record, &focus, &action_focus, cx));
            }
        }
        let clear = self.tool(
            "clear-notifications",
            "Limpiar",
            nonempty,
            Intent::Clear,
            true,
            cx,
        );
        if nonempty {
            targets.push(self.focus("clear-notifications", cx));
        }
        let footer = div()
            .flex()
            .items_center()
            .justify_between()
            .gap(px(10.0))
            .border_t_1()
            .border_color(gpui::rgba(orbit::line(cx)))
            .pt(px(12.0))
            .child(orbit::text(
                "Historial de esta sesión · máximo 50",
                12.0,
                400,
                orbit::ink_4(cx),
                cx,
            ))
            .child(clear);
        let mut view = div()
            .flex()
            .flex_col()
            .gap(px(12.0))
            .p(px(20.0))
            .max_h(px(height))
            .when(has_visible, |view| view.h(px(height)))
            .child(header)
            .child(filters)
            .child(history)
            .child(footer);
        if compact && nonempty {
            view = view.child(self.tool(
                "full-notifications",
                "Ver todas las notificaciones",
                true,
                Intent::FullView,
                true,
                cx,
            ));
            targets.push(self.focus("full-notifications", cx));
        }
        if compact && let Some(layer) = &self.layer {
            layer.update(cx, |layer, _| layer.set_targets(targets));
        }
        view.when_some(self.error.clone(), |view, error| {
            view.child(orbit::callout(error, cx))
        })
    }
}
impl Render for Notifications {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        orbit::neo_card(cx)
            .size_full()
            .min_h_0()
            .p(px(0.0))
            .child(self.history(false, f32::from(window.viewport_size().height) - 130.0, cx))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn qa_notifications_only_enter_the_explicit_capture_scene() {
        for scene in [None, Some("inicio-base"), Some("notificaciones-vacio")] {
            let center = Center::default()
                .with_capture_scene(scene)
                .expect("centro real");
            assert!(center.records.is_empty());
        }
        let center = Center::default()
            .with_capture_scene(Some("notificaciones-panel"))
            .expect("escena QA explícita");
        assert_eq!(center.records.len(), 6);
        assert!(
            center
                .records
                .iter()
                .all(|record| record.text_key.starts_with("QA visual:"))
        );
    }
    #[test]
    fn filters_use_source_and_read_state_without_mutating_history() {
        let mut record = Record::local_error("test", "aviso".into());
        for (source, expected) in [
            (Source::Launcher, [true, true, true, false, false]),
            (Source::Beta, [true, true, false, true, false]),
            (Source::System, [true, true, false, false, true]),
            (Source::Updater, [true, true, false, false, true]),
        ] {
            record.source = source;
            assert_eq!(
                [
                    Filter::All,
                    Filter::Unread,
                    Filter::Launcher,
                    Filter::Beta,
                    Filter::System
                ]
                .map(|filter| filter.matches(&record)),
                expected
            );
        }
        record.unread = false;
        assert!(!Filter::Unread.matches(&record));
        assert!(Filter::All.matches(&record));
    }
    #[test]
    fn real_launcher_errors_are_filterable_and_keep_a_closed_navigation_action() {
        let record = Record::local_error("hub.launcher", "fallo real".into());
        assert!(Filter::Launcher.matches(&record));
        assert_eq!(
            record.action.expect("acción").destination(),
            Ok(Section::Launcher)
        );
        assert!(Filter::System.matches(&Record::local_error("hub.calendar", "fallo".into())));
    }
    #[test]
    fn beta_filter_and_counter_follow_role_and_read_all_clears_visible_unread() {
        let now = chrono::DateTime::parse_from_rfc3339("2026-10-05T18:30:00+02:00").expect("reloj");
        let mut center = Center::default();
        center
            .publish(
                Record::local_error("system", "aviso".into()),
                now.timestamp_millis(),
                false,
            )
            .expect("publicar");
        let mut beta = Record::local_error("beta", "aviso beta".into());
        beta.source = Source::Beta;
        center
            .publish(beta, now.timestamp_millis(), false)
            .expect("publicar");
        assert!(center.groups(Filter::Beta, false, &now).is_empty());
        assert_eq!(center.groups(Filter::All, false, &now)[0].1.len(), 1);
        let mut notifications = Notifications::from_center(center);
        assert_eq!(notifications.unread(), 1);
        notifications.tester = true;
        assert_eq!(notifications.unread(), 2);
        notifications.center.mark_read("all");
        assert_eq!(notifications.unread(), 0);
        assert!(
            notifications
                .center
                .groups(Filter::Unread, true, &now)
                .is_empty()
        );
    }
    #[test]
    fn date_groups_follow_local_midnight_and_keep_older_or_invalid_records() {
        let now = chrono::DateTime::parse_from_rfc3339("2026-10-05T00:30:00+02:00").expect("fecha");
        for (date, group) in [
            ("2026-10-04T22:15:00Z", "Hoy"),
            ("2026-10-04T21:59:00Z", "Ayer"),
            ("2026-10-01T12:00:00Z", "Esta semana"),
            ("2026-09-20T12:00:00Z", "Anteriores"),
            ("2026-10-06T12:00:00Z", "Hoy"),
        ] {
            let at = chrono::DateTime::parse_from_rfc3339(date)
                .expect("fecha")
                .timestamp_millis();
            assert_eq!(date_group(at, &now), group);
        }
        assert_eq!(date_group(i64::MAX, &now), "Sin fecha");
    }
    #[test]
    fn date_groups_keep_recency_and_source_filter_order() {
        let mut center = Center::default();
        for (key, source) in [
            ("one", Source::Launcher),
            ("two", Source::System),
            ("three", Source::Launcher),
            ("four", Source::Updater),
        ] {
            let mut record = Record::local_error(key, key.into());
            record.source = source;
            center.publish(record, 1, false).expect("publicar");
        }
        let now = chrono::DateTime::parse_from_rfc3339("1970-01-01T01:00:00+00:00").expect("reloj");
        let groups = center.groups(Filter::All, true, &now);
        assert_eq!(groups.len(), 1);
        assert!(groups.iter().all(|(_, records)| !records.is_empty()));
        assert_eq!(groups[0].0, "Hoy");
        assert_eq!(
            groups[0]
                .1
                .iter()
                .map(|record| record.dedupe_key.as_str())
                .collect::<Vec<_>>(),
            ["four", "three", "two", "one"]
        );
        let launcher = center.groups(Filter::Launcher, true, &now);
        assert!(center.groups(Filter::Beta, true, &now).is_empty());
        assert_eq!(
            launcher[0]
                .1
                .iter()
                .map(|record| record.dedupe_key.as_str())
                .collect::<Vec<_>>(),
            ["three", "one"]
        );
        center.clear();
        assert!(center.groups(Filter::All, true, &now).is_empty());
    }
    #[test]
    fn activation_reads_only_the_selected_record_and_uses_the_allowlist() {
        let mut center = Center::default();
        let mut record = Record::local_error("launch", "fallo real de prueba".into());
        record.action = Some(Action {
            kind: "navigate".into(),
            target: "launcher".into(),
        });
        center.publish(record, 1, false).expect("publicar");
        let id = center.records[0].id.clone();
        center
            .publish(Record::local_error("save", "otro error".into()), 2, false)
            .expect("publicar");
        assert_eq!(center.activate("unknown"), None);
        assert_eq!(center.unread(), 2);
        assert_eq!(center.activate(&id), Some(Section::Launcher));
        assert_eq!(center.unread(), 1);
        let local = center.records[0].id.clone();
        assert_eq!(center.activate(&local), None);
        assert_eq!(center.unread(), 0);
        assert_eq!(
            Action {
                kind: "navigate".into(),
                target: "settings:updates".into()
            }
            .destination(),
            Ok(Section::Settings)
        );
    }
    #[test]
    fn messages_and_time_use_the_product_text_instead_of_raw_timestamps() {
        let params = BTreeMap::from([
            ("profile".into(), "Carrera".into()),
            ("tag".into(), "v2".into()),
        ]);
        assert_eq!(
            message("notifications.record.launcher.finished.text", &params),
            "Carrera se inició correctamente."
        );
        assert_eq!(
            message("notifications.record.updater.available.text", &params),
            "v2 ya está lista para instalar."
        );
        assert_eq!(message("hub.local.error", &params), "Error local del Hub");
        assert_eq!(message("", &params), "");
        assert_eq!(message("future.key", &params), "future.key");
        assert_eq!(time(i64::MAX), "");
        assert_eq!(time(0).len(), 5);
    }
    #[test]
    fn repetitions_stay_read_changed_occurrences_resurface_and_retention_is_bounded() {
        let mut center = Center::default();
        let record = Record::local_error("save", "error uno".into());
        center.publish(record.clone(), 1, false).expect("publicar");
        let id = center.records[0].id.clone();
        center.mark_read(&id);
        center.publish(record, 2, false).expect("repetir");
        assert_eq!(center.unread(), 0);
        assert_eq!(center.records[0].occurred_at, 2);
        center
            .publish(Record::local_error("save", "error dos".into()), 3, false)
            .expect("otro");
        assert_eq!(center.records[0].id, id);
        assert_eq!(center.unread(), 1);
        for index in 0..55 {
            center
                .publish(
                    Record::local_error(&format!("error-{index}"), "real error en test".into()),
                    index,
                    true,
                )
                .expect("retención");
        }
        assert_eq!(center.records.len(), 50);
        assert_eq!(center.unread(), 0);
        center.clear();
        assert!(center.records.is_empty());
    }
    #[test]
    fn source_and_action_allowlists_and_utf8_bounds_match_the_contract() {
        assert!(serde_json::from_str::<Source>("\"spotter\"").is_err());
        assert!(serde_json::from_str::<Source>("\"calendar\"").is_err());
        let mut center = Center::default();
        let mut record = Record::local_error("save", "á".repeat(200));
        record.action = Some(Action {
            kind: "navigate".into(),
            target: "https://example.com".into(),
        });
        assert!(center.publish(record.clone(), 0, false).is_err());
        assert!(center.records.is_empty());
        record.action = None;
        center.publish(record, 0, false).expect("truncar");
        assert_eq!(center.records[0].concrete_cause.len(), 240);
    }
}
