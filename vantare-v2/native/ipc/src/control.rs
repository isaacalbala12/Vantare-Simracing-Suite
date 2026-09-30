//! Plano de derechos: JSON acotado, distinto de adquisición, sin tokens.
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::io::{self, Read, Write};
use std::time::{SystemTime, UNIX_EPOCH};

pub const VERSION: u32 = 1;
const LIMIT: usize = 64 * 1024;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Policy {
    pub version: u32,
    pub epoch: u64,
    pub revision: u64,
    pub checked_at_ms: u64,
    pub valid_until_ms: Option<u64>,
    pub overlays_advanced: bool,
    pub engineer: bool,
    pub live: bool,
    pub error: Option<String>,
}
impl Policy {
    pub fn current_at(&self, now_ms: u64) -> bool {
        self.version == VERSION
            && self.revision > 0
            && now_ms >= self.checked_at_ms
            && now_ms.saturating_sub(self.checked_at_ms) < 2_000
            && self.valid_until_ms.is_none_or(|end| now_ms < end)
    }
    pub fn current(&self) -> bool {
        wall_ms().is_ok_and(|now| self.current_at(now))
    }
}

// No Debug: nonce de autorización solo por stdin heredado, jamás logs/CLI.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CoreLink {
    pub pipe: String,
    pub image: std::path::PathBuf,
    pub nonce: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Bootstrap {
    pub nonce: String,
}
#[derive(Serialize, Deserialize)]
#[serde(tag = "command", deny_unknown_fields)]
pub enum Command {
    Read,
    Install { credential: String },
    Invalidate,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub version: u32,
    pub sequence: u64,
    pub nonce: String,
    pub command: Command,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Response {
    pub version: u32,
    pub sequence: u64,
    pub policy: Policy,
    pub error: Option<String>,
}
pub fn pipe_name(photo: &str) -> String {
    format!("{photo}-rights")
}
pub fn wall_ms() -> io::Result<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|time| u64::try_from(time.as_millis()).ok())
        .ok_or_else(|| io::Error::other("reloj de derechos inválido"))
}
pub fn read<T: DeserializeOwned>(reader: &mut impl Read) -> io::Result<T> {
    let mut prefix = [0; 4];
    reader.read_exact(&mut prefix)?;
    let size =
        usize::try_from(u32::from_le_bytes(prefix)).map_err(|_| io::ErrorKind::InvalidData)?;
    if size == 0 || size > LIMIT {
        return Err(io::ErrorKind::InvalidData.into());
    }
    let mut bytes = vec![0; size];
    reader.read_exact(&mut bytes)?;
    serde_json::from_slice(&bytes).map_err(|_| io::ErrorKind::InvalidData.into())
}
pub fn write(writer: &mut impl Write, value: &impl Serialize) -> io::Result<()> {
    let bytes = serde_json::to_vec(value).map_err(|_| io::ErrorKind::InvalidData)?;
    if bytes.len() > LIMIT {
        return Err(io::ErrorKind::InvalidData.into());
    }
    writer.write_all(
        &u32::try_from(bytes.len())
            .map_err(|_| io::ErrorKind::InvalidData)?
            .to_le_bytes(),
    )?;
    writer.write_all(&bytes)?;
    writer.flush()
}

#[cfg(windows)]
pub fn request(link: &CoreLink, command: Command) -> io::Result<Policy> {
    use crate::transport::Event;
    let stop = std::sync::Arc::new(Event::new()?);
    request_cancelled(link, command, &stop)
}
#[cfg(windows)]
pub fn request_cancelled(
    link: &CoreLink,
    command: Command,
    stop: &std::sync::Arc<crate::transport::Event>,
) -> io::Result<Policy> {
    use crate::transport::IO_TIMEOUT;
    let mut pipe = connect_ready(&link.pipe, stop, IO_TIMEOUT)?;
    if !pipe.server_peer()?.is_image(&link.image) {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    write(
        &mut pipe,
        &Request {
            version: VERSION,
            sequence: 1,
            nonce: link.nonce.clone(),
            command,
        },
    )?;
    let response: Response = read(&mut pipe)?;
    if response.version != VERSION || response.sequence != 1 || response.policy.version != VERSION {
        return Err(io::ErrorKind::InvalidData.into());
    }
    if response.error.is_some() {
        // No cuerpos arbitrarios del peer en logs/errores.
        return Err(io::Error::other("núcleo rechazó la operación de derechos"));
    }
    Ok(response.policy)
}

/// Espera acotada solo al abrir un pipe ocupado/en arranque. Nunca reenvía RPC.
#[cfg(windows)]
pub fn connect_ready(
    name: &str,
    stop: &std::sync::Arc<crate::transport::Event>,
    timeout: std::time::Duration,
) -> io::Result<crate::transport::Pipe> {
    let started = std::time::Instant::now();
    loop {
        if stop.is_set() {
            return Err(io::ErrorKind::Interrupted.into());
        }
        match crate::transport::connect(name, std::sync::Arc::clone(stop), timeout) {
            Ok(pipe) => return Ok(pipe),
            Err(error)
                if matches!(error.raw_os_error(), Some(2 | 231)) && started.elapsed() < timeout =>
            {
                stop.wait(std::time::Duration::from_millis(10));
            }
            Err(error) => return Err(error),
        }
    }
}

#[cfg(windows)]
pub struct Feed {
    latest: std::sync::Arc<std::sync::Mutex<Option<Policy>>>,
    stop: std::sync::Arc<crate::transport::Event>,
    thread: Option<std::thread::JoinHandle<()>>,
}
#[cfg(windows)]
impl Feed {
    pub fn connect(photo: &str, core_image: std::path::PathBuf) -> io::Result<Self> {
        use crate::transport::Event;
        let latest = std::sync::Arc::new(std::sync::Mutex::new(None));
        let stop = std::sync::Arc::new(Event::new()?);
        let target = std::sync::Arc::clone(&latest);
        let cancel = std::sync::Arc::clone(&stop);
        let link = CoreLink {
            pipe: pipe_name(photo),
            image: core_image,
            nonce: String::new(),
        };
        let thread = std::thread::Builder::new()
            .name("rights-feed".into())
            .spawn(move || {
                let mut cursor = (0, 0);
                while !cancel.is_set() {
                    let policy = request_cancelled(&link, Command::Read, &cancel)
                        .ok()
                        .filter(|p| {
                            p.current()
                                && (p.epoch > cursor.0
                                    || (p.epoch == cursor.0 && p.revision >= cursor.1))
                        });
                    if let Some(p) = &policy {
                        cursor = (p.epoch, p.revision);
                    }
                    if let Ok(mut slot) = target.lock() {
                        *slot = policy;
                    } else {
                        break;
                    }
                    if cancel.wait(std::time::Duration::from_millis(250)) {
                        break;
                    }
                }
            })?;
        Ok(Self {
            latest,
            stop,
            thread: Some(thread),
        })
    }
    pub fn policy(&self) -> Policy {
        self.latest
            .lock()
            .ok()
            .and_then(|p| p.clone())
            .filter(Policy::current)
            .unwrap_or_default()
    }
}
#[cfg(windows)]
impl Drop for Feed {
    fn drop(&mut self) {
        self.stop.set();
        if let Some(thread) = self.thread.take() {
            let _joined = thread.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn old_version_clock_rollback_stale_or_expired_policy_denies() {
        let mut p = Policy {
            version: VERSION,
            epoch: 1,
            revision: 1,
            checked_at_ms: 10_000,
            valid_until_ms: Some(11_500),
            overlays_advanced: true,
            ..Policy::default()
        };
        assert!(p.current_at(11_499));
        assert!(!p.current_at(11_500));
        assert!(!p.current_at(9_999));
        p.valid_until_ms = None;
        assert!(!p.current_at(12_000));
        p.version += 1;
        assert!(!p.current_at(10_000));
        assert!(read::<Request>(&mut u32::MAX.to_le_bytes().as_slice()).is_err());
    }
}
