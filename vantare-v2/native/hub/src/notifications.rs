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
            source: Source::System,
            severity: Severity::Error,
            occurred_at: 0,
            dedupe_key: key.into(),
            title_key: "hub.local.error".into(),
            text_key: String::new(),
            params: BTreeMap::new(),
            concrete_cause: cause,
            action: None,
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
    /// El orden de fuentes sigue su aviso más reciente; cada grupo conserva el historial.
    fn groups(&self) -> Vec<(Source, Vec<&Record>)> {
        let mut groups: Vec<(Source, Vec<&Record>)> = Vec::new();
        for record in &self.records {
            if let Some((_, records)) = groups
                .iter_mut()
                .find(|(source, _)| *source == record.source)
            {
                records.push(record);
            } else {
                groups.push((record.source, vec![record]));
            }
        }
        groups
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
}
#[derive(Clone)]
enum Intent {
    ReadAll,
    Clear,
    FullView,
    Activate(String),
}

/// La capa no mantiene viva su dueña: evita Notifications → Layer → Panel → Notifications.
struct Panel {
    notifications: WeakEntity<Notifications>,
}
impl Render for Panel {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        match self.notifications.upgrade() {
            Some(notifications) => notifications.update(cx, |this, cx| this.history(true, cx)),
            None => div(),
        }
    }
}

fn source_label(source: Source) -> &'static str {
    match source {
        Source::Updater => "Actualizador",
        Source::Launcher => "Launcher",
        Source::System => "Sistema",
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

    pub fn unread(&self) -> usize {
        self.center.unread()
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
            bounds.origin.x + bounds.size.width - px(orbit::POPOVER_W),
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
    fn record_row(
        record: &Record,
        focus: &FocusHandle,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let id = record.id.clone();
        let (severity, tone) = severity(record, cx);
        let detail = [
            message(&record.text_key, &record.params),
            record.concrete_cause.clone(),
        ]
        .into_iter()
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join(" · ");

        orbit::list_row(
            id.clone(),
            &message(&record.title_key, &record.params),
            &detail,
            record.unread,
            true,
            cx,
        )
        .track_focus(focus)
        .child(
            div()
                .flex()
                .flex_wrap()
                .items_center()
                .gap(px(orbit::MENU_PAD))
                .child(orbit::chip(severity, tone, cx))
                .child(orbit::text(
                    time(record.occurred_at),
                    orbit::MICRO,
                    400,
                    orbit::ink_3(cx),
                    cx,
                ))
                .child(orbit::text(
                    if record.unread { "Sin leer" } else { "Leído" },
                    orbit::MICRO,
                    400,
                    orbit::ink_3(cx),
                    cx,
                ))
                .when(record.action.is_some(), |row| {
                    row.child(orbit::text(
                        "Abrir destino",
                        orbit::MICRO,
                        500,
                        orbit::ink_2(cx),
                        cx,
                    ))
                }),
        )
        .on_click(cx.listener(move |this, _, window, cx| {
            this.execute(Intent::Activate(id.clone()), window, cx);
        }))
    }
    fn history(&mut self, compact: bool, cx: &mut Context<Self>) -> gpui::Div {
        // Mantiene solo los controles del historial acotado, sin crecer por sesión.
        self.focus.retain(|id, _| {
            matches!(
                id.as_str(),
                "read-all" | "clear-notifications" | "full-notifications"
            ) || self.center.records.iter().any(|record| record.id == *id)
        });
        let mut targets = Vec::new();
        let unread = self.center.unread();
        let nonempty = !self.center.records.is_empty();
        let read = self.tool(
            "read-all",
            "Marcar todo como leído",
            unread > 0,
            Intent::ReadAll,
            compact,
            cx,
        );
        let clear = self.tool(
            "clear-notifications",
            "Limpiar",
            nonempty,
            Intent::Clear,
            compact,
            cx,
        );
        for (id, enabled) in [("read-all", unread > 0), ("clear-notifications", nonempty)] {
            if enabled {
                targets.push(self.focus(id, cx));
            }
        }
        let tools = div()
            .flex()
            .flex_wrap()
            .gap(px(orbit::MENU_PAD))
            .child(read)
            .child(clear);
        let header = if compact {
            div()
                .flex()
                .items_center()
                .justify_between()
                .child(orbit::tracked_text(
                    "NOTIFICACIONES",
                    10.5,
                    800,
                    orbit::ink_4(cx),
                    1.155,
                    cx,
                ))
                .child(tools)
        } else {
            tools
        };
        let mut view = div()
            .flex()
            .flex_col()
            .gap(px(orbit::MENU_PAD))
            .p(px(if compact { 12.0 } else { orbit::FIELD_PAD }))
            .child(header);
        if self.center.records.is_empty() {
            view = view.child(if compact {
                orbit::text("Sin notificaciones.", 11.0, 400, orbit::ink_muted(cx), cx)
                    .line_height(px(16.5))
                    .my(px(6.0))
            } else {
                orbit::empty_state("Sin notificaciones.", "", cx)
            });
        }
        // Clonar el máximo de 50 registros permite componer controles con su propio foco.
        let groups: Vec<_> = self
            .center
            .groups()
            .into_iter()
            .map(|(source, records)| (source, records.into_iter().cloned().collect::<Vec<_>>()))
            .collect();
        for (source, records) in groups {
            view = view.child(orbit::eyebrow(source_label(source), cx));
            for record in records {
                let id = record.id.clone();
                let focus = self.focus(&id, cx);
                targets.push(focus.clone());
                view = view.child(Self::record_row(&record, &focus, cx));
            }
        }
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
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div().flex().flex_col().gap(px(orbit::FIELD_PAD))
            .child(orbit::card("Notificaciones", cx).child(self.history(false, cx)))
            .child(orbit::callout("Historial local de esta sesión (máximo 50). Avisos del actualizador y notificación de prueba: pendiente.", cx))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn groups_follow_recency_and_keep_each_sources_order() {
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
        let groups = center.groups();
        assert_eq!(
            groups.iter().map(|(source, _)| *source).collect::<Vec<_>>(),
            [Source::Updater, Source::Launcher, Source::System]
        );
        assert_eq!(
            groups[1]
                .1
                .iter()
                .map(|record| record.dedupe_key.as_str())
                .collect::<Vec<_>>(),
            ["three", "one"]
        );
        center.clear();
        assert!(center.groups().is_empty());
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
