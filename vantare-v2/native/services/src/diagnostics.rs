//! Diagnóstico anónimo: productores locales; solo services posee la red.
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const FILE_LIMIT: u64 = 24 * 1024;
const QUEUE_LIMIT: usize = 32;
pub const PRIVACY_FILE: &str = "privacy.json";
mod redaction;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Privacy {
    pub crashes: bool,
    pub usage: bool,
    /// Solo una decisión explícita de la nueva pregunta o de Ajustes habilita fallos.
    #[serde(default)]
    pub crashes_decided: bool,
}
impl Privacy {
    pub fn load(root: &Path) -> Result<Self> {
        match read_bounded(&root.join(PRIVACY_FILE), 1024) {
            Ok(bytes) => {
                let mut privacy: Self =
                    serde_json::from_slice(&bytes).map_err(|_| Error::Protocol)?;
                // Los archivos antiguos no distinguen el sí implícito del consentimiento.
                if !privacy.crashes_decided {
                    privacy.crashes = false;
                }
                Ok(privacy)
            }
            Err(Error::NotFound) => Ok(Self::default()),
            Err(error) => Err(error),
        }
    }

    /// Borra únicamente los slots de diagnóstico sin permiso; nunca datos del usuario.
    pub fn discard_disabled(self, root: &Path) -> Result<()> {
        for (folder, allowed) in [
            ("crashes", self.crashes && self.crashes_decided),
            ("usage", self.usage),
        ] {
            if allowed {
                continue;
            }
            for slot in 0..QUEUE_LIMIT {
                match fs::remove_file(root.join(folder).join(format!("{slot:02}.json"))) {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(_) => return Err(Error::Storage),
                }
            }
        }
        Ok(())
    }
}

/// Igual raíz que layout.json; no depende de UI, identidad ni licencia.
pub fn data_root() -> Result<PathBuf> {
    #[cfg(windows)]
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    #[cfg(target_os = "linux")]
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|p| PathBuf::from(p).join(".local/share")));
    #[cfg(target_os = "macos")]
    let base =
        std::env::var_os("HOME").map(|p| PathBuf::from(p).join("Library/Application Support"));
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    let base: Option<PathBuf> = None;
    std::env::var_os("VANTARE_NATIVE_DATA_ROOT")
        .map(PathBuf::from)
        .or(base)
        .filter(|p| p.is_absolute())
        .map(|p| p.join("Vantare/native"))
        .ok_or(Error::Storage)
}

fn read_bounded(path: &Path, limit: u64) -> Result<Vec<u8>> {
    let file = File::open(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            Error::NotFound
        } else {
            Error::Storage
        }
    })?;
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| Error::Storage)?;
    if bytes.len() as u64 > limit {
        return Err(Error::TooLarge);
    }
    Ok(bytes)
}

fn uuid() -> Result<String> {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes).map_err(|_| Error::Storage)?;
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    let mut id = String::with_capacity(36);
    for (i, byte) in bytes.into_iter().enumerate() {
        if [4, 6, 8, 10].contains(&i) {
            id.push('-');
        }
        id.push(char::from(HEX[usize::from(byte >> 4)]));
        id.push(char::from(HEX[usize::from(byte & 15)]));
    }
    Ok(id)
}
fn valid_uuid(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit() && !b.is_ascii_uppercase()
            }
        })
        && id.as_bytes()[14] == b'4'
        && matches!(id.as_bytes()[19], b'8' | b'9' | b'a' | b'b')
}

/// UUID v4 estable por namespace; Testing usa otro. Publicación atómica entre procesos.
pub fn anonymous_id(root: &Path) -> Result<String> {
    fs::create_dir_all(root).map_err(|_| Error::Storage)?;
    let path = root.join("anonymous-id");
    if !path.exists() {
        let id = uuid()?;
        let temp = root.join(format!("anonymous-id-{id}.tmp"));
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|_| Error::Storage)?;
        let publish = (|| {
            file.write_all(id.as_bytes())
                .and_then(|()| file.sync_all())
                .map_err(|_| Error::Storage)?;
            match fs::hard_link(&temp, &path) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
                Err(_) => Err(Error::Storage),
            }
        })();
        drop(file);
        let cleanup = fs::remove_file(temp).map_err(|_| Error::Storage);
        publish.and(cleanup)?;
    }
    let id = String::from_utf8(read_bounded(&path, 36)?).map_err(|_| Error::Protocol)?;
    if !valid_uuid(&id) {
        return Err(Error::Protocol);
    }
    Ok(id)
}

/// Elimina perfiles Windows/Unix, correos y tokens antes de persistir y enviar.
pub fn clean_paths(text: &str) -> String {
    redaction::clean(text)
}
fn bounded(text: &str, max: usize) -> String {
    let mut clean = clean_paths(text);
    let mut end = clean.len().min(max);
    while !clean.is_char_boundary(end) {
        end -= 1;
    }
    clean.truncate(end);
    clean
}
fn timestamp() -> Result<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|t| t.as_secs())
        .map_err(|_| Error::Storage)
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Crash {
    binary: String,
    version: String,
    message: String,
    backtrace: String,
    timestamp: u64,
    #[serde(default)]
    frames: Vec<u64>,
}
fn queue(root: &Path, folder: &str, value: &impl Serialize) -> Result<()> {
    let bytes = serde_json::to_vec(value).map_err(|_| Error::Protocol)?;
    if bytes.len() as u64 > FILE_LIMIT {
        return Err(Error::TooLarge);
    }
    let dir = root.join(folder);
    fs::create_dir_all(&dir).map_err(|_| Error::Storage)?;
    // Publicar solo bytes completos; hard_link reserva cada slot sin reemplazar
    // el de otro productor. El sender puede descartar JSON parcial heredado.
    let temporary = dir.join(format!("{}.tmp", crate::random_id()?));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|_| Error::Storage)?;
    let result = (|| {
        file.write_all(&bytes)
            .and_then(|()| file.sync_all())
            .map_err(|_| Error::Storage)?;
        drop(file);
        for slot in 0..QUEUE_LIMIT {
            match fs::hard_link(&temporary, dir.join(format!("{slot:02}.json"))) {
                Ok(()) => return Ok(()),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(_) => return Err(Error::Storage),
            }
        }
        Err(Error::TooLarge)
    })();
    if let Err(error) = fs::remove_file(temporary)
        && error.kind() != std::io::ErrorKind::NotFound
    {
        eprintln!("diagnóstico: limpiar temporal de cola: {error}");
    }
    result
}
fn write_crash(root: &Path, _binary: &str, _message: &str, _backtrace: &str) -> Result<()> {
    if !Privacy::load(root)?.crashes {
        return Ok(());
    }
    queue(
        root,
        "crashes",
        &Crash {
            binary: "native".into(),
            version: bounded(crate::product::VERSION, 64),
            message: "native_panic".into(),
            backtrace: String::new(),
            timestamp: timestamp()?,
            frames: capture_stack(),
        },
    )
}

// Direcciones numéricas, nunca símbolos, mensajes ni rutas del compilador/usuario.
#[cfg(windows)]
#[allow(unsafe_code)] // Frontera Win32 acotada al buffer propio de esta función.
fn capture_stack() -> Vec<u64> {
    let mut frames = [std::ptr::null_mut(); 64];
    // SAFETY: array válido de 64 punteros, cota idéntica, sin hash de salida.
    let count = unsafe {
        windows_sys::Win32::System::Diagnostics::Debug::RtlCaptureStackBackTrace(
            0,
            64,
            frames.as_mut_ptr(),
            std::ptr::null_mut(),
        )
    };
    frames[..usize::from(count)]
        .iter()
        .map(|frame| *frame as usize as u64)
        .collect()
}
#[cfg(not(windows))]
fn capture_stack() -> Vec<u64> {
    Vec::new()
}

fn install_at(root: PathBuf, binary: &'static str) {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Err(error) = write_crash(&root, binary, "", "") {
            eprintln!("diagnóstico local: {error}");
        }
        previous(info);
    }));
}
/// Sin clave de build no captura ni hace red. No cambia el comportamiento del panic.
pub fn install_panic_hook(binary: &'static str) {
    if !configured() {
        return;
    }
    match data_root() {
        Ok(root) => install_at(root, binary),
        Err(error) => eprintln!("diagnóstico local: {error}"),
    }
}
pub fn configured() -> bool {
    option_env!("VANTARE_POSTHOG_KEY").is_some_and(|key| !key.trim().is_empty())
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "event", content = "properties", deny_unknown_fields)]
pub enum Usage {
    #[serde(rename = "app_started")]
    AppStarted { version: String, channel: String },
    #[serde(rename = "live_session_started")]
    LiveSessionStarted { simulator: String },
    #[serde(rename = "layout_widgets")]
    LayoutWidgets { widget_types: Vec<String> },
}
impl Usage {
    fn valid(&self) -> bool {
        match self {
            Self::AppStarted { version, channel } => {
                version.len() <= 64
                    && clean_paths(version) == *version
                    && version
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || ".-+".contains(c))
                    && matches!(
                        channel.as_str(),
                        "nightly" | "testers" | "master" | "beta" | "development" | "unknown"
                    )
            }
            Self::LiveSessionStarted { simulator } => matches!(simulator.as_str(), "lmu" | "acc"),
            Self::LayoutWidgets { widget_types } => {
                widget_types.len() <= 32
                    && widget_types
                        .iter()
                        .all(|t| WIDGET_TYPES.contains(&t.as_str()))
            }
        }
    }
}
// Solo nombres del catálogo; nunca IDs libres, layout, posiciones ni datos del piloto.
const WIDGET_TYPES: &[&str] = &[
    "standings",
    "radar",
    "pedals",
    "delta",
    "car-damage-visual",
    "input-telemetry",
    "multiclass-relative",
    "broadcast-tower",
    "delta-trace",
    "track-map",
    "track-weather",
    "car-damage-numbers",
    "head-to-head",
    "fuel-strategy",
    "pedals-telemetry",
    "relative",
    "racing-flags",
    "fastest-lap",
];
pub fn record_usage(event: &Usage) {
    if !configured() {
        return;
    }
    let result = data_root().and_then(|root| enqueue_usage(&root, event));
    if let Err(error) = result {
        eprintln!("diagnóstico local: {error}");
    }
}
fn enqueue_usage(root: &Path, event: &Usage) -> Result<()> {
    if !Privacy::load(root)?.usage {
        return Ok(());
    }
    if !event.valid() {
        return Err(Error::Protocol);
    }
    queue(root, "usage", event)
}

#[cfg(feature = "network")]
mod sender;
#[cfg(feature = "network")]
pub use sender::Worker;

#[cfg(test)]
mod tests;
