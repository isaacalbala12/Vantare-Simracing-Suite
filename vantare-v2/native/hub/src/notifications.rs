//! Centro local acotado; fuentes y acciones cerradas del contrato Go.
use crate::{Section, shell::button};
use gpui::{Context, IntoElement, Render, Window, div, prelude::*};
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
}
impl Notifications {
    pub fn report(&mut self, key: &str, cause: String, cx: &mut Context<Self>) {
        if let Err(error) = self.center.publish(
            Record::local_error(key, cause),
            chrono::Utc::now().timestamp_millis(),
            false,
        ) {
            self.error = Some(error);
        }
        cx.notify();
    }
}
impl Render for Notifications {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let mut rows = div().flex().flex_col().gap_2();
        for (index, record) in self.center.records.iter().enumerate() {
            let id = record.id.clone();
            let destination = record
                .action
                .as_ref()
                .and_then(|action| action.destination().ok());
            rows = rows.child(
                div()
                    .id(("notification", index))
                    .flex()
                    .flex_col()
                    .gap_1()
                    .child(format!(
                        "{:?} · {:?} · {} · {}",
                        record.source,
                        record.severity,
                        record.occurred_at,
                        if record.unread { "sin leer" } else { "leído" }
                    ))
                    .child(if record.title_key == "hub.local.error" {
                        "Error local del Hub".into()
                    } else {
                        record.title_key.clone()
                    })
                    .child(record.concrete_cause.clone())
                    .child(button("read", "Marcar leído").on_click(cx.listener(
                        move |this, _, _, cx| {
                            this.center.mark_read(&id);
                            cx.notify();
                        },
                    )))
                    .when_some(destination, |row, destination| {
                        row.child(button("notification-action", "Abrir destino").on_click(
                            cx.listener(move |this, _, _, cx| {
                                this.destination = Some(destination);
                                cx.notify();
                            }),
                        ))
                    }),
            );
        }
        div().id("notification-center").flex().flex_col().gap_2().overflow_y_scroll()
            .child(format!("{} sin leer · revisión {}",self.center.unread(),self.center.revision))
            .child("Historial local de esta sesión (máximo 50). Solo errores reales. Sin toasts ni publishers remotos; calendario/Spotter son otras superficies.")
            .when_some(self.error.clone(),gpui::ParentElement::child)
            .child(div().flex().gap_2()
                .child(button("read-all","Marcar todo leído").on_click(cx.listener(|this,_,_,cx|{this.center.mark_read("all");cx.notify();})))
                .child(button("clear-notifications","Vaciar historial").on_click(cx.listener(|this,_,_,cx|{this.center.clear();cx.notify();}))))
            .child(rows)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
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
