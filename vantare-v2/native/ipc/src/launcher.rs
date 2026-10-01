//! Buzón local del Launcher. IDs nunca se interpretan como rutas o comandos.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Request {
    #[serde(rename = "launch-v1")]
    Launch { profile: String },
    #[serde(rename = "answer-v1")]
    Answer { decision: u64, action: String },
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
    pub decision: Option<Decision>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Decision {
    pub id: u64,
    pub message: String,
    pub actions: Vec<String>,
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
    (status.version == 1
        && now_ms()
            .checked_sub(status.updated_ms)
            .is_some_and(|age| age < 3_000))
    .then_some(status)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn status_requires_recent_bounded_valid_json() {
        let settings =
            std::env::temp_dir().join(format!("launcher-ipc-{}.json", std::process::id()));
        let path = status_path(&settings);
        let mut status = Status {
            version: 1,
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
