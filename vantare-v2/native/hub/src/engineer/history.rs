//! Historial puro de estados observados. No equivale al journal de Engineer:
//! latest-wins puede omitir mensajes; secuencia de eventos tampoco es consecutiva.
use crate::engineer_control::{Message, Status};
use serde_json::{Value, json};
use std::collections::VecDeque;

pub const MAX_MESSAGES: usize = 1000;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entry {
    pub message: Message,
    /// Reloj del Hub, no timestamp de emisión (no lo publica el contrato).
    pub observed_at_ms: u64,
    /// Indica salto del cursor; no afirma que cada evento omitido fuera radio.
    pub cursor_gap: bool,
}

#[derive(Default)]
pub struct History {
    entries: VecDeque<Entry>,
    last: Option<(u64, u64)>,
    current_epoch: Option<u64>,
    evicted: usize,
}

#[derive(Clone, Copy, Default)]
pub struct Filter<'a> {
    pub current_cycle_only: bool,
    /// None = todas; prefijo de intent (fuel, flags, laps, pitstops, spotter…).
    pub family: Option<&'a str>,
    pub query: &'a str,
}

pub struct HistoryView<'a> {
    /// Más recientes primero, como deliveriesFor del frontend.
    pub rows: Vec<&'a Entry>,
    pub current_epoch: Option<u64>,
    pub retained: usize,
    pub evicted: usize,
}

impl History {
    /// El llamador pasa solamente estados parseados válidos. Poll repetido o
    /// cursor viejo en la misma época no añade duplicados.
    pub fn observe(&mut self, status: &Status, observed_at_ms: u64) -> bool {
        let Some(message) = &status.last_message else {
            return false;
        };
        let key = (message.epoch, message.sequence);
        if self
            .last
            .is_some_and(|(epoch, seq)| epoch == key.0 && seq >= key.1)
            || self
                .entries
                .iter()
                .any(|entry| (entry.message.epoch, entry.message.sequence) == key)
        {
            return false;
        }
        let cursor_gap = self
            .last
            .is_some_and(|(epoch, seq)| epoch == key.0 && key.1.saturating_sub(seq) > 1);
        self.entries.push_back(Entry {
            message: message.clone(),
            observed_at_ms,
            cursor_gap,
        });
        self.last = Some(key);
        self.current_epoch = Some(message.epoch);
        if self.entries.len() > MAX_MESSAGES {
            self.entries.pop_front();
            self.evicted += 1;
        }
        true
    }

    pub fn view(&self, filter: Filter<'_>) -> HistoryView<'_> {
        let query = filter.query.trim().to_lowercase();
        let rows = self
            .entries
            .iter()
            .rev()
            .filter(|entry| {
                (!filter.current_cycle_only || Some(entry.message.epoch) == self.current_epoch)
                    && filter
                        .family
                        .is_none_or(|family| entry.message.intent.split('.').next() == Some(family))
                    && (query.is_empty()
                        || entry.message.text.to_lowercase().contains(&query)
                        || entry.message.intent.to_lowercase().contains(&query))
            })
            .collect();
        HistoryView {
            rows,
            current_epoch: self.current_epoch,
            retained: self.entries.len(),
            evicted: self.evicted,
        }
    }

    /// Preview JSON congelada, independiente de polls y filtros posteriores.
    /// Incluye el estado completo recibido y TODO el historial retenido.
    pub fn prepare_export(&self, status: Option<&Status>) -> Result<String, serde_json::Error> {
        let messages: Vec<Value> = self.entries.iter().map(|entry| json!({
            "epoch": entry.message.epoch, "sequence": entry.message.sequence,
            "intent": entry.message.intent, "locale": entry.message.locale, "text": entry.message.text,
            "observedAtMs": entry.observed_at_ms, "cursorGap": entry.cursor_gap,
        })).collect();
        serde_json::to_string_pretty(&json!({"version":1, "source":"observed-latest-status",
            "status":status.map(Status::json), "currentEpoch":self.current_epoch,
            "evicted":self.evicted, "messages":messages}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engineer_control::Settings;
    fn status(epoch: u64, sequence: u64, intent: &str) -> Status {
        Status {
            version: 1,
            active: true,
            pid: 7,
            settings: Settings::default(),
            assets: std::collections::BTreeMap::default(),
            last_message: Some(Message {
                epoch,
                sequence,
                intent: intent.into(),
                locale: "es".into(),
                text: "Radio nativa".into(),
            }),
            error: None,
        }
    }
    #[test]
    fn cycles_families_deduplication_and_frozen_export() {
        let mut history = History::default();
        for (epoch, sequence, intent, accepted) in [
            (1, 2, "fuel.low_1l", true),
            (1, 2, "fuel.low_1l", false),
            (1, 1, "laps.completed", false),
            (1, 5, "laps.completed", true),
            (2, 1, "flags.yellow", true),
            (1, 2, "fuel.low_1l", false),
        ] {
            assert_eq!(
                history.observe(&status(epoch, sequence, intent), 100),
                accepted
            );
        }
        for (current_cycle_only, family, query, expected) in [
            (false, None, "", 3),
            (true, None, "", 1),
            (false, Some("fuel"), "", 1),
            (true, Some("fuel"), "", 0),
            (false, None, "RADIO", 3),
            (false, None, "missing", 0),
        ] {
            assert_eq!(
                history
                    .view(Filter {
                        current_cycle_only,
                        family,
                        query
                    })
                    .rows
                    .len(),
                expected
            );
        }
        let view = history.view(Filter::default());
        assert_eq!(view.rows[0].message.epoch, 2);
        assert!(view.rows[1].cursor_gap);
        let frozen = history
            .prepare_export(Some(&status(2, 1, "flags.yellow")))
            .expect("export");
        history.observe(&status(2, 2, "pitstops.exit"), 200);
        let decoded: Value = serde_json::from_str(&frozen).expect("json");
        assert_eq!(decoded["messages"].as_array().expect("messages").len(), 3);
        assert_eq!(decoded["status"]["last_message"]["intent"], "flags.yellow");
    }
    #[test]
    fn retention_and_absent_status_do_not_fabricate_messages() {
        let mut history = History::default();
        let mut empty = status(1, 0, "fuel.low_1l");
        empty.last_message = None;
        assert!(!history.observe(&empty, 0));
        for seq in 0..=u64::try_from(MAX_MESSAGES).expect("limit") {
            history.observe(&status(1, seq, "laps.completed"), seq);
        }
        let view = history.view(Filter::default());
        assert_eq!(view.retained, MAX_MESSAGES);
        assert_eq!(view.evicted, 1);
        assert_eq!(view.rows.last().expect("oldest").message.sequence, 1);
    }
}
