//! Buzón local del Launcher. IDs nunca se interpretan como rutas o comandos.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const VERSION: u32 = 2;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub enum Action {
    Trust,
    Reuse,
    Restart,
    Cancel,
    Stop,
    Continue,
    Leave,
    CloseStarted,
}
impl Action {
    pub const ALL: [Self; 8] = [
        Self::Trust,
        Self::Reuse,
        Self::Restart,
        Self::Cancel,
        Self::Stop,
        Self::Continue,
        Self::Leave,
        Self::CloseStarted,
    ];
    pub fn id(self) -> &'static str {
        match self {
            Self::Trust => "trust",
            Self::Reuse => "reuse",
            Self::Restart => "restart",
            Self::Cancel => "cancel",
            Self::Stop => "stop",
            Self::Continue => "continue",
            Self::Leave => "leave",
            Self::CloseStarted => "close-started",
        }
    }
    pub fn from_id(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|action| action.id() == id)
    }
    pub fn label(self) -> &'static str {
        match self {
            Self::Trust => "Confiar y lanzar",
            Self::Reuse => "Reutilizar",
            Self::Restart => "Reiniciar",
            Self::Cancel => "Cancelar",
            Self::Stop => "Parar",
            Self::Continue => "Continuar",
            Self::Leave => "Dejar abiertas",
            Self::CloseStarted => "Cerrar solo las iniciadas",
        }
    }
}
impl TryFrom<String> for Action {
    type Error = &'static str;
    fn try_from(id: String) -> Result<Self, Self::Error> {
        Self::from_id(&id).ok_or("acción Launcher desconocida")
    }
}
impl From<Action> for String {
    fn from(action: Action) -> Self {
        action.id().into()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Request {
    #[serde(rename = "launch-v1")]
    Launch { profile: String },
    #[serde(rename = "answer-v2")]
    Answer { decision: u64, action: Action },
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Registration {
    pub profile: String,
    pub hotkey: String,
    pub registered: bool,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Status {
    pub version: u32,
    pub updated_ms: u64,
    pub profiles: Vec<Registration>,
    pub startup_profile: Option<String>,
    pub error: Option<String>,
    pub progress: String,
    pub running: bool,
    pub decision: Option<Decision>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Decision {
    pub id: u64,
    pub message: String,
    pub actions: Vec<Action>,
}

pub fn status_path(settings: &Path) -> PathBuf {
    settings.with_extension("resident-status.json")
}

pub fn request_path(settings: &Path) -> PathBuf {
    settings.with_extension("resident-request.json")
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |duration| {
            u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
        })
}

pub fn read_status(settings: &Path) -> Option<Status> {
    use std::io::Read;
    let file = std::fs::File::open(status_path(settings)).ok()?;
    let mut bytes = Vec::new();
    file.take(128 * 1024 + 1).read_to_end(&mut bytes).ok()?;
    if bytes.len() > 128 * 1024 {
        return None;
    }
    let status: Status = serde_json::from_slice(&bytes).ok()?;
    is_fresh(&status).then_some(status)
}

pub fn is_fresh(status: &Status) -> bool {
    status.version == VERSION
        && now_ms()
            .checked_sub(status.updated_ms)
            .is_some_and(|age| age < 3_000)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stable_action_ids_round_trip_without_collisions_or_labels_on_the_wire() {
        let expected = [
            (Action::Trust, "trust"),
            (Action::Reuse, "reuse"),
            (Action::Restart, "restart"),
            (Action::Cancel, "cancel"),
            (Action::Stop, "stop"),
            (Action::Continue, "continue"),
            (Action::Leave, "leave"),
            (Action::CloseStarted, "close-started"),
        ];
        assert_eq!(Action::ALL, expected.map(|(action, _)| action));
        let mut ids = std::collections::BTreeSet::new();
        for (action, id) in expected {
            assert!(ids.insert(id));
            assert_eq!(action.id(), id);
            assert_eq!(Action::from_id(id), Some(action));
            let bytes = serde_json::to_vec(&Request::Answer {
                decision: 42,
                action,
            })
            .unwrap();
            let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(value["answer-v2"]["action"], id);
            let Request::Answer {
                decision,
                action: decoded,
            } = serde_json::from_slice(&bytes).unwrap()
            else {
                panic!("respuesta tipada");
            };
            assert_eq!(decision, 42);
            assert_eq!(decoded, action);
        }
        for id in ["desconocida", "", "Dejar abiertas", "Leave"] {
            assert_eq!(Action::from_id(id), None);
            let value = serde_json::json!({"answer-v2": {"decision": 42, "action": id}});
            assert!(serde_json::from_value::<Request>(value).is_err());
        }
        assert!(
            serde_json::from_value::<Request>(serde_json::json!({
                "answer-v1": {"decision": 42, "action": "Dejar abiertas"}
            }))
            .is_err()
        );
    }

    #[test]
    fn status_freshness_rejects_other_generations_expired_and_future_times() {
        let mut status = Status {
            version: VERSION,
            updated_ms: now_ms(),
            ..Status::default()
        };
        assert!(is_fresh(&status));
        for version in [0, 1, VERSION + 1] {
            status.version = version;
            assert!(!is_fresh(&status));
        }
        status.version = VERSION;
        for updated in [0, u64::MAX] {
            status.updated_ms = updated;
            assert!(!is_fresh(&status));
        }
    }

    #[test]
    fn status_requires_recent_bounded_valid_json() {
        let settings =
            std::env::temp_dir().join(format!("launcher-ipc-{}.json", std::process::id()));
        let path = status_path(&settings);
        let mut status = Status {
            version: VERSION,
            updated_ms: now_ms(),
            ..Status::default()
        };
        std::fs::write(&path, serde_json::to_vec(&status).expect("JSON")).expect("estado propio");
        assert!(read_status(&settings).is_some());
        status.updated_ms = 0;
        std::fs::write(&path, serde_json::to_vec(&status).expect("JSON")).expect("caducar");
        assert!(read_status(&settings).is_none());
        std::fs::write(&path, vec![b' '; 128 * 1024 + 1]).expect("exceso");
        assert!(read_status(&settings).is_none());
        std::fs::remove_file(path).expect("limpiar estado propio");
    }
}
