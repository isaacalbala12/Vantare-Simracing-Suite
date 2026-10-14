//! Estado local v2; independiente del DTO de fotos de vantare-ipc.
use super::{Status, decode, invalid};
use serde_json::{Value, json};
use std::{
    io,
    time::{SystemTime, UNIX_EPOCH},
};

pub const STATUS_VERSION: u8 = 2;
pub const HISTORY_LIMIT: usize = 64;
pub const HEARTBEAT_TIMEOUT_MS: u64 = 3_000;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Connection {
    #[default]
    Waiting,
    Live,
    Stale,
    Disconnected,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Spotter {
    Disabled,
    #[default]
    WaitingSource,
    WaitingPlayer,
    WaitingPitLane,
    WaitingLowSpeed,
    UnavailableSpatial,
    Ready,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VoiceEngine {
    CachedClipsWinmm,
    Unavailable,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CachedVoice {
    pub locale: String,
    pub voice: String,
    /// Pack completo de intents nativos validado; no acredita reproducción.
    pub clips_available: bool,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VoiceStatus {
    pub engine: VoiceEngine,
    pub clips_configured: bool,
    /// Mismo preset para Engineer y Spotter; no hay catálogo de motor TTS.
    pub selected_voice: String,
    pub cached_voices: Vec<CachedVoice>,
    pub error: Option<String>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AudioOutcome {
    Disabled,
    Started,
    Finished,
    Cancelled,
    Missing,
    Unavailable,
    Failed,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Delivery {
    /// Monótono dentro de una instancia; no confundir con sequence de foto.
    pub id: u64,
    pub message: super::Message,
    /// Texto escrito/flush al canal JSONL, no ACK de una vista ni escucha humana.
    pub text_emitted: bool,
    pub audio: AudioOutcome,
    pub selected_at_ms: u64,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DeliveryStatus {
    pub pending: usize,
    pub speaking: bool,
    pub text_enabled: bool,
    pub voice_requested: bool,
    pub history: Vec<Delivery>,
    pub evicted: u64,
}
impl DeliveryStatus {
    pub fn last(&self) -> Option<&Delivery> {
        self.history.last()
    }
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuntimeStatus {
    pub instance_ms: u64,
    /// Cambia cada segundo aunque no cambien fotos/ajustes; evita active zombie.
    pub heartbeat_ms: u64,
    pub connection: Connection,
    pub epoch: Option<u64>,
    pub telemetry_player_available: bool,
    pub spotter: Spotter,
    pub voice: VoiceStatus,
    pub delivery: DeliveryStatus,
}
impl RuntimeStatus {
    pub(super) fn parse(value: &Value) -> io::Result<Self> {
        super::fields(
            value,
            &[
                "instance_ms",
                "heartbeat_ms",
                "connection",
                "epoch",
                "telemetry_player_available",
                "spotter",
                "voice",
                "delivery",
            ],
        )?;
        let voice = &value["voice"];
        super::fields(
            voice,
            &[
                "engine",
                "clips_configured",
                "selected_voice",
                "cached_voices",
                "error",
                "synthesis",
                "voice_input",
            ],
        )?;
        if voice["synthesis"] != "unavailable" || voice["voice_input"] != "unavailable" {
            return Err(invalid("síntesis/entrada de voz no disponibles"));
        }
        let delivery = &value["delivery"];
        super::fields(
            delivery,
            &[
                "pending",
                "speaking",
                "text_enabled",
                "voice_requested",
                "history",
                "evicted",
            ],
        )?;
        let state = Self {
            instance_ms: super::number(&value["instance_ms"])?,
            heartbeat_ms: super::number(&value["heartbeat_ms"])?,
            connection: Connection::parse(&value["connection"])?,
            epoch: optional_number(&value["epoch"])?,
            telemetry_player_available: super::boolean(&value["telemetry_player_available"])?,
            spotter: Spotter::parse(&value["spotter"])?,
            voice: VoiceStatus {
                engine: VoiceEngine::parse(&voice["engine"])?,
                clips_configured: super::boolean(&voice["clips_configured"])?,
                selected_voice: super::string(&voice["selected_voice"])?,
                cached_voices: array(&voice["cached_voices"])?
                    .iter()
                    .map(|item| {
                        super::fields(item, &["locale", "voice", "clips_available"])?;
                        Ok(CachedVoice {
                            locale: super::string(&item["locale"])?,
                            voice: super::string(&item["voice"])?,
                            clips_available: super::boolean(&item["clips_available"])?,
                        })
                    })
                    .collect::<io::Result<_>>()?,
                error: optional_string(&voice["error"])?,
            },
            delivery: DeliveryStatus {
                pending: usize::try_from(super::number(&delivery["pending"])?)
                    .map_err(|_| invalid("cola inválida"))?,
                speaking: super::boolean(&delivery["speaking"])?,
                text_enabled: super::boolean(&delivery["text_enabled"])?,
                voice_requested: super::boolean(&delivery["voice_requested"])?,
                history: array(&delivery["history"])?
                    .iter()
                    .map(Delivery::parse)
                    .collect::<io::Result<_>>()?,
                evicted: super::number(&delivery["evicted"])?,
            },
        };
        if state.delivery.pending > 8
            || state.delivery.history.len() > HISTORY_LIMIT
            || state.voice.cached_voices.len() != super::LOCALES.len()
            || !super::LOCALES.iter().all(|locale| {
                state
                    .voice
                    .cached_voices
                    .iter()
                    .filter(|voice| voice.locale == *locale)
                    .count()
                    == 1
            })
            || state
                .delivery
                .history
                .windows(2)
                .any(|pair| pair[0].id >= pair[1].id)
        {
            return Err(invalid("estado runtime Engineer inválido"));
        }
        Ok(state)
    }
    pub fn fresh(&self, now_ms: u64) -> bool {
        now_ms
            .checked_sub(self.heartbeat_ms)
            .is_some_and(|age| age < HEARTBEAT_TIMEOUT_MS)
    }
}

/// Conserva el esquema v1 legible por vistas anteriores y lo amplía en v2.
/// v1 no tiene frescura ni diagnósticos: runtime=None significa no disponible.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Report {
    pub status: Status,
    pub runtime: Option<RuntimeStatus>,
}
impl Report {
    pub fn json(&self) -> Value {
        let mut value = self.status.json();
        if let Some(runtime) = &self.runtime {
            value["version"] = json!(STATUS_VERSION);
            value["runtime"] = runtime.json();
        }
        value
    }
    pub fn parse(bytes: &[u8]) -> io::Result<Self> {
        Status::parse_report(&decode(bytes)?)
    }
}
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |time| {
            u64::try_from(time.as_millis()).unwrap_or(u64::MAX)
        })
}

// Codificación cerrada de enums sin añadir serde/Cargo.lock fuera del alcance.
macro_rules! wire_enum {
    ($kind:ident { $($variant:ident => $text:literal),+ $(,)? }) => {
        impl $kind {
            pub fn as_str(self) -> &'static str {
                match self { $(Self::$variant => $text),+ }
            }
            fn parse(value: &Value) -> io::Result<Self> {
                match value.as_str() {
                    $(Some($text) => Ok(Self::$variant)),+,
                    _ => Err(invalid(concat!("estado desconocido: ", stringify!($kind)))),
                }
            }
        }
    };
}
wire_enum!(Connection { Waiting => "waiting", Live => "live", Stale => "stale", Disconnected => "disconnected" });
wire_enum!(Spotter { Disabled => "disabled", WaitingSource => "waiting_source", WaitingPlayer => "waiting_player",
    WaitingPitLane => "waiting_pit_lane", WaitingLowSpeed => "waiting_low_speed", UnavailableSpatial => "unavailable_spatial", Ready => "ready" });
wire_enum!(VoiceEngine { CachedClipsWinmm => "cached_clips_winmm", Unavailable => "unavailable" });
wire_enum!(AudioOutcome { Disabled => "disabled", Started => "started", Finished => "finished", Cancelled => "cancelled",
    Missing => "missing", Unavailable => "unavailable", Failed => "failed" });
fn optional_number(value: &Value) -> io::Result<Option<u64>> {
    if value.is_null() {
        Ok(None)
    } else {
        super::number(value).map(Some)
    }
}
fn optional_string(value: &Value) -> io::Result<Option<String>> {
    if value.is_null() {
        Ok(None)
    } else {
        super::string(value).map(Some)
    }
}
fn array(value: &Value) -> io::Result<&Vec<Value>> {
    value.as_array().ok_or_else(|| invalid("array requerido"))
}
impl Delivery {
    fn parse(value: &Value) -> io::Result<Self> {
        super::fields(
            value,
            &["id", "message", "text_emitted", "audio", "selected_at_ms"],
        )?;
        let message = &value["message"];
        super::fields(message, &["epoch", "sequence", "intent", "locale", "text"])?;
        Ok(Self {
            id: super::number(&value["id"])?,
            message: super::Message {
                epoch: super::number(&message["epoch"])?,
                sequence: super::number(&message["sequence"])?,
                intent: super::string(&message["intent"])?,
                locale: super::string(&message["locale"])?,
                text: super::string(&message["text"])?,
            },
            text_emitted: super::boolean(&value["text_emitted"])?,
            audio: AudioOutcome::parse(&value["audio"])?,
            selected_at_ms: super::number(&value["selected_at_ms"])?,
        })
    }
    pub fn json(&self) -> Value {
        let message = &self.message;
        json!({"id":self.id, "message":{"epoch":message.epoch, "sequence":message.sequence,
            "intent":message.intent, "locale":message.locale, "text":message.text},
            "text_emitted":self.text_emitted, "audio":self.audio.as_str(), "selected_at_ms":self.selected_at_ms})
    }
}
impl RuntimeStatus {
    pub fn json(&self) -> Value {
        let voices: Vec<_> = self
            .voice
            .cached_voices
            .iter()
            .map(|voice| {
                json!({"locale":voice.locale,
            "voice":voice.voice,"clips_available":voice.clips_available})
            })
            .collect();
        let history: Vec<_> = self.delivery.history.iter().map(Delivery::json).collect();
        json!({"instance_ms":self.instance_ms,"heartbeat_ms":self.heartbeat_ms,"connection":self.connection.as_str(),"epoch":self.epoch,
            "telemetry_player_available":self.telemetry_player_available,"spotter":self.spotter.as_str(),
            "voice":{"engine":self.voice.engine.as_str(),"clips_configured":self.voice.clips_configured,
                "selected_voice":self.voice.selected_voice,"cached_voices":voices,"error":self.voice.error,
                "synthesis":"unavailable","voice_input":"unavailable"},
            "delivery":{"pending":self.delivery.pending,"speaking":self.delivery.speaking,
                "text_enabled":self.delivery.text_enabled,"voice_requested":self.delivery.voice_requested,
                "history":history,"evicted":self.delivery.evicted}})
    }
}

#[cfg(any(test, feature = "test-support"))]
#[doc(hidden)]
pub fn test_report() -> Report {
    Report {
        status: Status {
            version: STATUS_VERSION,
            active: true,
            pid: 7,
            settings: super::Settings::default(),
            assets: super::LOCALES
                .iter()
                .map(|locale| ((*locale).into(), false))
                .collect(),
            last_message: None,
            error: None,
        },
        runtime: Some(RuntimeStatus {
            instance_ms: 50,
            heartbeat_ms: 100,
            connection: Connection::Live,
            epoch: Some(1),
            telemetry_player_available: true,
            spotter: Spotter::Ready,
            voice: VoiceStatus {
                engine: VoiceEngine::Unavailable,
                clips_configured: false,
                selected_voice: "ef_dora".into(),
                cached_voices: super::LOCALES
                    .iter()
                    .map(|locale| CachedVoice {
                        locale: (*locale).into(),
                        voice: "cache-preset".into(),
                        clips_available: false,
                    })
                    .collect(),
                error: None,
            },
            delivery: DeliveryStatus {
                pending: 0,
                speaking: false,
                text_enabled: true,
                voice_requested: false,
                history: Vec::new(),
                evicted: 0,
            },
        }),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn v2_roundtrip_legacy_and_closed_contract() {
        let report = test_report();
        let bytes = serde_json::to_vec(&report.json()).expect("json");
        assert_eq!(Report::parse(&bytes).expect("v2"), report);
        assert_eq!(
            Status::parse(&bytes).expect("compatibilidad vista"),
            report.status
        );
        let legacy_export =
            serde_json::to_vec(&report.status.json()).expect("exportación anterior");
        let projected = Status::parse(&legacy_export).expect("subconjunto v1 válido");
        assert_eq!(projected.version, 1);
        assert_eq!(projected.settings, report.status.settings);
        let mut legacy = report.status;
        legacy.version = 1;
        let bytes = serde_json::to_vec(&legacy.json()).expect("json v1");
        assert!(Report::parse(&bytes).expect("v1").runtime.is_none());
        for change in 0..6 {
            let mut value = test_report().json();
            match change {
                0 => {
                    value["runtime"]["connection"] = json!("inventado");
                }
                1 => {
                    value["runtime"]["delivery"]["pending"] = json!(9);
                }
                2 => {
                    value["runtime"]["voice"]["cached_voices"] = json!([]);
                }
                3 => {
                    value["version"] = json!(3);
                }
                4 => {
                    value["runtime"]["voice"]["synthesis"] = json!("available");
                }
                _ => {
                    value["runtime"]["extra"] = json!(true);
                }
            }
            assert!(Report::parse(&serde_json::to_vec(&value).expect("json")).is_err());
        }
        let runtime = test_report().runtime.expect("runtime");
        assert!(!runtime.fresh(99), "rollback del reloj falla cerrado");
        assert!(runtime.fresh(100));
        assert!(runtime.fresh(3_099));
        assert!(!runtime.fresh(3_100));
    }
}
