//! Modelo consumible por la vista; sin GPUI ni dependencia del proceso Engineer.
use super::history::{Filter, MAX_MESSAGES};
use crate::engineer_control::{
    self as control,
    runtime::{Connection, Delivery, Report, RuntimeStatus, Spotter},
};
use std::{collections::VecDeque, io, path::PathBuf};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Health {
    Fresh,
    Stopped,
    Missing,
    Invalid,
    Expired,
    /// Contrato v1: no hay heartbeat para acreditar que el proceso siga vivo.
    LegacyUnavailable,
}
impl Health {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Fresh => "fresh",
            Self::Stopped => "stopped",
            Self::Missing => "missing",
            Self::Invalid => "invalid",
            Self::Expired => "expired",
            Self::LegacyUnavailable => "legacy_unavailable",
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ObservedDelivery {
    pub pid: u32,
    pub instance_ms: u64,
    pub delivery: Delivery,
    pub observed_at_ms: u64,
}

pub struct View<'a> {
    pub health: Health,
    pub running: bool,
    pub connected: bool,
    pub connection: Connection,
    pub spotter: Spotter,
    /// None = no disponible; nunca presentar datos viejos como estado actual.
    pub runtime: Option<&'a RuntimeStatus>,
    pub error: Option<&'a str>,
}

pub const UNAVAILABLE: &[&str] = &[
    "síntesis TTS",
    "entrada por micrófono/PTT",
    "catálogo de voces TTS",
    "selección de voz independiente por canal",
    "modo de salida por familia",
    "ACK de subtítulos en pantalla",
    "disponibilidad del dispositivo de audio",
    "prueba de audio desde Hub",
    "contadores de policy y percentiles de latencia",
    "historial durable/completo",
];

pub struct Model {
    path: PathBuf,
    report: Option<Report>,
    error: Option<String>,
    history: VecDeque<ObservedDelivery>,
    pub evicted: u64,
    pub current_epoch: Option<u64>,
    last_health: Health,
    capture_time: Option<u64>,
}
impl Model {
    pub fn new(settings_path: &std::path::Path) -> Self {
        Self {
            path: control::status_path(settings_path),
            report: None,
            error: None,
            history: VecDeque::new(),
            evicted: 0,
            current_epoch: None,
            last_health: Health::Missing,
            capture_time: None,
        }
    }
    pub fn report(&self) -> Option<&Report> {
        self.report.as_ref()
    }
    pub fn now(&self) -> u64 {
        self.capture_time.unwrap_or_else(control::runtime::now_ms)
    }
    /// Modos del harness Wails congelado. El runtime no publica modos por familia.
    pub fn capture_output(&self, family: &str) -> Option<&'static str> {
        self.capture_time.map(|_| match family {
            "laps" => "Solo visual",
            "timings" => "Solo audio",
            _ => "Audio y visual",
        })
    }
    pub fn capture_duration_ms(&self) -> Option<u64> {
        self.capture_time.map(|_| 25)
    }
    /// El fixture Wails entra por el mismo contrato que el proceso. Nunca se
    /// llama fuera de la ruta aislada de captura, ni escribe archivos de usuario.
    pub fn capture(&mut self, demo: &crate::demo::DemoEngineer) -> Result<(), String> {
        use control::runtime::{
            AudioOutcome, CachedVoice, DeliveryStatus, VoiceEngine, VoiceStatus,
        };
        let captured = chrono::DateTime::parse_from_rfc3339(&demo.captured_at)
            .map_err(|error| format!("fecha del fixture: {error}"))?;
        let now = u64::try_from(captured.timestamp_millis())
            .map_err(|error| format!("fecha negativa del fixture: {error}"))?;
        let settings = control::Settings {
            voice: true,
            ..control::Settings::default()
        };
        let history = demo
            .messages
            .iter()
            .enumerate()
            .rev()
            .enumerate()
            .map(|(order, (index, message))| Delivery {
                id: order as u64 + 1,
                message: control::Message {
                    epoch: if index == 0 { 2 } else { 3 },
                    sequence: index as u64,
                    intent: message.intent.clone(),
                    locale: settings.locale.clone(),
                    text: message.text.clone(),
                },
                text_emitted: index % 3 != 0,
                audio: if index % 3 == 0 {
                    AudioOutcome::Finished
                } else {
                    AudioOutcome::Missing
                },
                selected_at_ms: now.saturating_sub(u64::from(message.seconds_ago) * 1_000),
            })
            .collect::<Vec<_>>();
        let report = Report {
            status: control::Status {
                version: control::runtime::STATUS_VERSION,
                pid: 1, // Identificador sintético del harness, no consulta ni arranca un PID.
                active: true,
                settings,
                assets: control::LOCALES
                    .iter()
                    .map(|locale| ((*locale).into(), true))
                    .collect(),
                last_message: history.last().map(|delivery| delivery.message.clone()),
                error: None,
            },
            runtime: Some(RuntimeStatus {
                instance_ms: now,
                heartbeat_ms: now,
                connection: Connection::Live,
                epoch: Some(3),
                telemetry_player_available: true,
                spotter: Spotter::Ready,
                voice: VoiceStatus {
                    engine: VoiceEngine::CachedClipsWinmm,
                    clips_configured: true,
                    selected_voice: "ef_dora".into(),
                    cached_voices: control::LOCALES
                        .iter()
                        .map(|locale| CachedVoice {
                            locale: (*locale).into(),
                            voice: "ef_dora".into(),
                            clips_available: true,
                        })
                        .collect(),
                    error: None,
                },
                delivery: DeliveryStatus {
                    pending: 0,
                    speaking: false,
                    text_enabled: true,
                    voice_requested: true,
                    history,
                    evicted: 0,
                },
            }),
        };
        let bytes = serde_json::to_vec(&report.json()).map_err(|error| error.to_string())?;
        self.observe(Some(&bytes), now);
        if let Some(error) = &self.error {
            return Err(error.clone());
        }
        self.capture_time = Some(now);
        Ok(())
    }
    /// Leer cada poll también detecta retirada/corrupción; evaluar view cada poll
    /// permite expirar un heartbeat aunque el archivo conserve bytes y mtime.
    pub fn poll(&mut self, now_ms: u64) -> bool {
        let previous = (self.report.clone(), self.error.clone());
        match control::read(&self.path) {
            Ok(bytes) => {
                self.observe(bytes.as_deref(), now_ms);
            }
            Err(error) => {
                self.error = Some(error.to_string());
            }
        }
        let health = self.view(now_ms).health;
        let changed =
            previous != (self.report.clone(), self.error.clone()) || health != self.last_health;
        self.last_health = health;
        changed
    }
    pub fn observe(&mut self, bytes: Option<&[u8]>, now_ms: u64) -> bool {
        let parsed = bytes.map(Report::parse).transpose();
        let previous = (self.report.clone(), self.error.clone());
        match parsed {
            Ok(report) => {
                if let Some(report) = &report
                    && let Some(runtime) = &report.runtime
                    && runtime.fresh(now_ms)
                {
                    self.current_epoch = runtime.epoch;
                    for delivery in &runtime.delivery.history {
                        if let Some(entry) = self.history.iter_mut().find(|entry| {
                            entry.pid == report.status.pid
                                && entry.instance_ms == runtime.instance_ms
                                && entry.delivery.id == delivery.id
                        }) {
                            entry.delivery = delivery.clone(); // ACK posterior/cancelación actualiza fila.
                        } else {
                            self.history.push_back(ObservedDelivery {
                                pid: report.status.pid,
                                instance_ms: runtime.instance_ms,
                                delivery: delivery.clone(),
                                observed_at_ms: now_ms,
                            });
                            if self.history.len() > MAX_MESSAGES {
                                self.history.pop_front();
                                self.evicted = self.evicted.saturating_add(1);
                            }
                        }
                    }
                }
                self.report = report;
                self.error = None;
            }
            Err(error) => self.error = Some(error.to_string()),
        }
        previous != (self.report.clone(), self.error.clone())
    }
    pub fn view(&self, now_ms: u64) -> View<'_> {
        let health = if self.error.is_some() {
            Health::Invalid
        } else if let Some(report) = &self.report {
            match &report.runtime {
                None => Health::LegacyUnavailable,
                Some(runtime) if !runtime.fresh(now_ms) => Health::Expired,
                Some(_) if !report.status.active => Health::Stopped,
                Some(_) => Health::Fresh,
            }
        } else {
            Health::Missing
        };
        let runtime = if health == Health::Fresh {
            self.report
                .as_ref()
                .and_then(|report| report.runtime.as_ref())
        } else {
            None
        };
        let connection = runtime.map_or(Connection::Disconnected, |runtime| runtime.connection);
        View {
            health,
            running: health == Health::Fresh,
            connected: connection == Connection::Live,
            connection,
            spotter: runtime.map_or(Spotter::WaitingSource, |runtime| runtime.spotter),
            runtime,
            error: self.error.as_deref(),
        }
    }
    pub fn history(&self, filter: Filter<'_>) -> Vec<&ObservedDelivery> {
        let query = filter.query.trim().to_lowercase();
        self.history
            .iter()
            .rev()
            .filter(|entry| {
                let message = &entry.delivery.message;
                (!filter.current_cycle_only || Some(message.epoch) == self.current_epoch)
                    && filter
                        .family
                        .is_none_or(|family| message.intent.split('.').next() == Some(family))
                    && (query.is_empty()
                        || message.text.to_lowercase().contains(&query)
                        || message.intent.to_lowercase().contains(&query))
            })
            .collect()
    }
    /// Preview congelada de estado recibido + entregas observadas, sin datos UI ficticios.
    pub fn prepare_export(&self, now_ms: u64) -> io::Result<String> {
        let history: Vec<_> = self
            .history
            .iter()
            .map(|entry| {
                serde_json::json!({
            "pid":entry.pid,"instance_ms":entry.instance_ms,"delivery":entry.delivery.json(),
            "observed_at_ms":entry.observed_at_ms})
            })
            .collect();
        serde_json::to_string_pretty(&serde_json::json!({"version":2,
            "source":"bounded-observed-engineer-status", "captured_at_ms":now_ms,
            "health":self.view(now_ms).health.as_str(),
            "running":self.view(now_ms).running,"connected":self.view(now_ms).connected,
            "status":self.report.as_ref().map(Report::json), "error":self.error,
            "current_epoch":self.current_epoch,"evicted":self.evicted,"deliveries":history,
            "unavailable":UNAVAILABLE}))
        .map_err(io::Error::other)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use control::{
        Message,
        runtime::{AudioOutcome, HEARTBEAT_TIMEOUT_MS, test_report},
    };
    fn bytes(report: &Report) -> Vec<u8> {
        serde_json::to_vec(&report.json()).expect("json")
    }
    fn delivery(id: u64, intent: &str) -> Delivery {
        Delivery {
            id,
            message: Message {
                epoch: 1,
                sequence: 5,
                intent: intent.into(),
                locale: "es".into(),
                text: intent.into(),
            },
            text_emitted: true,
            audio: AudioOutcome::Disabled,
            selected_at_ms: 100,
        }
    }
    #[test]
    fn crashed_stopped_corrupt_absent_and_legacy_are_disconnected() {
        let mut model = Model::new(std::path::Path::new("engineer.json"));
        assert_eq!(model.view(100).health, Health::Missing);
        let mut report = test_report();
        model.observe(Some(&bytes(&report)), 100);
        assert!(model.view(100).connected);
        // Engineer muerto no actualiza archivo: active=true no mantiene conexión.
        let view = model.view(100 + HEARTBEAT_TIMEOUT_MS);
        assert_eq!(view.health, Health::Expired);
        assert!(!view.running && !view.connected && view.runtime.is_none());
        model.observe(Some(b"{"), 100);
        assert_eq!(model.view(100).health, Health::Invalid);
        assert!(!model.view(100).connected);
        assert!(
            model.report().is_some(),
            "retiene evidencia, no estado actual"
        );
        model.observe(Some(&bytes(&report)), 100);
        assert!(model.view(100).connected);
        report.status.active = false;
        model.observe(Some(&bytes(&report)), 100);
        assert_eq!(model.view(100).health, Health::Stopped);
        assert!(!model.view(100).connected);
        report.status.version = 1;
        report.status.active = true;
        report.runtime = None;
        model.observe(Some(&bytes(&report)), 100);
        assert_eq!(model.view(100).health, Health::LegacyUnavailable);
        assert!(!model.view(100).connected);
        model.observe(None, 100);
        assert_eq!(model.view(100).health, Health::Missing);
    }
    #[test]
    fn retains_all_same_photo_deliveries_updates_audio_and_separates_restarts() {
        let mut report = test_report();
        report.runtime.as_mut().expect("runtime").delivery.history =
            vec![delivery(1, "fuel.low_1l"), delivery(2, "flags.yellow")];
        let mut model = Model::new(std::path::Path::new("engineer.json"));
        model.observe(Some(&bytes(&report)), 100);
        model.observe(Some(&bytes(&report)), 100);
        assert_eq!(model.history(Filter::default()).len(), 2);
        report.runtime.as_mut().expect("runtime").delivery.history[1].audio =
            AudioOutcome::Cancelled;
        model.observe(Some(&bytes(&report)), 100);
        assert_eq!(
            model.history(Filter::default())[0].delivery.audio,
            AudioOutcome::Cancelled
        );
        let frozen = model.prepare_export(100).expect("export");
        report.runtime.as_mut().expect("runtime").instance_ms = 99;
        model.observe(Some(&bytes(&report)), 100);
        assert_eq!(model.history(Filter::default()).len(), 4);
        let export: serde_json::Value = serde_json::from_str(&frozen).expect("json");
        assert_eq!(export["deliveries"].as_array().expect("filas").len(), 2);
        assert_eq!(
            model
                .history(Filter {
                    query: "FUEL",
                    ..Filter::default()
                })
                .len(),
            2
        );
        assert!(
            model
                .history(Filter {
                    query: "missing",
                    ..Filter::default()
                })
                .is_empty()
        );
        assert_eq!(
            model
                .history(Filter {
                    family: Some("fuel"),
                    ..Filter::default()
                })
                .len(),
            2
        );
        report.runtime.as_mut().expect("runtime").epoch = Some(2);
        model.observe(Some(&bytes(&report)), 100);
        assert!(
            model
                .history(Filter {
                    current_cycle_only: true,
                    ..Filter::default()
                })
                .is_empty()
        );
    }
    #[test]
    fn bounded_history_and_poll_health_without_mtime_changes() {
        let mut report = test_report();
        let mut model = Model::new(std::path::Path::new("engineer.json"));
        for id in 1..=1_001 {
            report.runtime.as_mut().expect("runtime").delivery.history =
                vec![delivery(id, "fuel.low_1l")];
            model.observe(Some(&bytes(&report)), 100);
        }
        assert_eq!(model.history(Filter::default()).len(), MAX_MESSAGES);
        assert_eq!(model.evicted, 1);
        assert_eq!(
            model
                .history(Filter::default())
                .last()
                .expect("más antigua")
                .delivery
                .id,
            2
        );
        model.observe(None, 100);
        assert_eq!(model.history(Filter::default()).len(), MAX_MESSAGES);
        let root = std::env::temp_dir().join(format!("hub-engineer-model-{}", std::process::id()));
        std::fs::create_dir(&root).expect("temp");
        let mut model = Model::new(&root.join("engineer.json"));
        std::fs::write(&model.path, bytes(&report)).expect("estado");
        assert!(model.poll(100));
        assert!(model.poll(100 + HEARTBEAT_TIMEOUT_MS)); // mismos bytes, salud cambió
        assert!(!model.poll(100 + HEARTBEAT_TIMEOUT_MS));
        assert_eq!(
            model.view(100 + HEARTBEAT_TIMEOUT_MS).health,
            Health::Expired
        );
        std::fs::remove_file(&model.path).expect("retirar");
        model.poll(100);
        assert!(!model.view(100).connected);
        std::fs::remove_dir(root).expect("limpiar");
    }
}
