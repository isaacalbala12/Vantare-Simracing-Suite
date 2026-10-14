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
pub mod activity;
pub mod installer;
mod recorder;
pub use recorder::Recorder;
mod redaction;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
// Dos decisiones independientes y su registro explícito; contrato JSON existente.
#[allow(clippy::struct_excessive_bools)]
pub struct Privacy {
    /// Invalida eventos autorizados antes de retirar cualquiera de los permisos.
    #[serde(default)]
    pub generation: u64,
    pub crashes: bool,
    pub usage: bool,
    /// Solo una decisión explícita de la nueva pregunta o de Ajustes habilita fallos.
    #[serde(default)]
    pub crashes_decided: bool,
    /// Decisión independiente de uso; ningún sí heredado habilita analítica.
    #[serde(default)]
    pub usage_decided: bool,
}
impl Privacy {
    /// La UI conserva su guardado atómico y control de conflictos por bytes.
    pub fn save_with(
        root: &Path,
        mut next: Self,
        persist: impl FnOnce(Self) -> std::result::Result<(), String>,
    ) -> std::result::Result<Self, String> {
        let _guard = consent_lock(root).map_err(|error| error.to_string())?;
        let previous = Self::load(root).map_err(|error| error.to_string())?;
        next.generation = previous.generation;
        if (previous.usage && !next.usage) || (previous.crashes && !next.crashes) {
            next.generation = next
                .generation
                .checked_add(1)
                .filter(|generation| *generation < u64::MAX)
                .ok_or("generación de consentimiento agotada")?;
        }
        // No reactivar slots recogidos sin permiso. El conflicto se comprueba
        // antes de limpiar, en el guardado atómico del llamador.
        persist(next)?;
        previous
            .discard_disabled_locked(root)
            .map_err(|error| error.to_string())?;
        next.discard_disabled_locked(root)
            .map_err(|error| error.to_string())?;
        Ok(next)
    }
    pub fn load(root: &Path) -> Result<Self> {
        match read_bounded(&root.join(PRIVACY_FILE), 1024) {
            Ok(bytes) => {
                let mut privacy: Self =
                    serde_json::from_slice(&bytes).map_err(|_| Error::Protocol)?;
                // Los archivos antiguos no distinguen el sí implícito del consentimiento.
                if !privacy.crashes_decided {
                    privacy.crashes = false;
                }
                if !privacy.usage_decided {
                    privacy.usage = false;
                }
                Ok(privacy)
            }
            Err(Error::NotFound) => Ok(Self::default()),
            Err(error) => Err(error),
        }
    }

    /// Borra únicamente los slots de diagnóstico sin permiso; nunca datos del usuario.
    pub fn discard_disabled(self, root: &Path) -> Result<()> {
        let _guard = consent_lock(root)?;
        Self::load(root)?.discard_disabled_locked(root)
    }
    fn discard_disabled_locked(self, root: &Path) -> Result<()> {
        if !self.usage || !self.usage_decided {
            for name in [
                "anonymous-id",
                "installation-observed-v1",
                "account-observed-v1",
                "commercial-license-observed-v1",
            ] {
                match fs::remove_file(root.join(name)) {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(_) => return Err(Error::Storage),
                }
            }
        }
        for (folder, allowed) in [
            ("crashes", self.crashes && self.crashes_decided),
            ("usage", self.usage && self.usage_decided),
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

// Mismo cerrojo del SO para revocar, publicar y autorizar el POST, entre procesos.
// try_lock mantiene la UI sin espera: Busy nunca se presenta como revocación completa.
fn consent_lock(root: &Path) -> Result<File> {
    fs::create_dir_all(root).map_err(|_| Error::Storage)?;
    let guard = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(root.join("consent.lock"))
        .map_err(|_| Error::Storage)?;
    guard.try_lock().map_err(|_| Error::Busy)?;
    Ok(guard)
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
    anonymous_id_with_cleanup(root, |path| fs::remove_file(path))
}

/// Contrato #1610: ausencia sin consentimiento de uso vigente, sin crear un ID.
/// El informe voluntario no concede consentimiento de analítica.
pub fn consented_usage_id(root: &Path) -> Result<Option<String>> {
    let _guard = consent_lock(root)?;
    if !Privacy::load(root)?.usage {
        return Ok(None);
    }
    anonymous_id(root).map(Some)
}

fn anonymous_id_with_cleanup(
    root: &Path,
    cleanup: impl FnOnce(&Path) -> std::io::Result<()>,
) -> Result<String> {
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
        if cleanup(&temp).is_err() {
            eprintln!("diagnóstico: limpieza de anonymous-id temporal pendiente");
        }
        publish?;
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
    #[serde(default)]
    generation: u64,
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
    let privacy = Privacy::load(root)?;
    if !privacy.crashes {
        return Ok(());
    }
    let _guard = consent_lock(root)?;
    let current = Privacy::load(root)?;
    if !current.crashes || current.generation != privacy.generation {
        return Ok(());
    }
    queue(
        root,
        "crashes",
        &Crash {
            generation: privacy.generation,
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

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "event", content = "properties", deny_unknown_fields)]
pub enum Usage {
    #[serde(rename = "app_started")]
    AppStarted { version: String, channel: String },
    #[serde(rename = "live_session_started")]
    LiveSessionStarted { simulator: String },
    #[serde(rename = "layout_widgets")]
    LayoutWidgets { widget_types: Vec<String> },
    #[serde(rename = "page_viewed")]
    PageViewed { page: String },
    #[serde(rename = "page_usage")]
    PageUsage { page: String, duration_seconds: u64 },
    #[serde(rename = "widget_usage")]
    WidgetUsage {
        widget_type: String,
        duration_seconds: u64,
    },
    #[serde(rename = "feature_used")]
    FeatureUsed { feature: String },
    #[serde(rename = "installation_observed")]
    InstallationObserved {},
    #[serde(rename = "account_signed_in")]
    AccountSignedIn {},
    #[serde(rename = "commercial_license_observed")]
    CommercialLicenseObserved {},
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct PendingUsage {
    generation: u64,
    usage: Usage,
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
            Self::PageViewed { page } => PAGES.contains(&page.as_str()),
            Self::PageUsage {
                page,
                duration_seconds,
            } => PAGES.contains(&page.as_str()) && (1..=60).contains(duration_seconds),
            Self::WidgetUsage {
                widget_type,
                duration_seconds,
            } => {
                WIDGET_TYPES.contains(&widget_type.as_str()) && (1..=60).contains(duration_seconds)
            }
            Self::FeatureUsed { feature } => FEATURES.contains(&feature.as_str()),
            Self::InstallationObserved {}
            | Self::AccountSignedIn {}
            | Self::CommercialLicenseObserved {} => true,
        }
    }
}
const PAGES: &[&str] = &[
    "home",
    "workshop",
    "studio",
    "launcher",
    "calendar",
    "strategy",
    "engineer",
    "analysis",
    "testing",
    "roadmap",
    "account",
    "licenses",
    "notifications",
    "settings",
];
const FEATURES: &[&str] = &[
    "widget_added",
    "launch_profile",
    "strategy_recalculated",
    "report_sent",
    "checkout_opened",
];
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

/// Una observación consentida por instalación; nunca un recibo monetario.
pub fn record_usage_once(event: &Usage) {
    if !configured() {
        return;
    }
    if let Err(error) = data_root().and_then(|root| enqueue_once(&root, event)) {
        eprintln!("uso local: {error}");
    }
}

fn enqueue_once(root: &Path, event: &Usage) -> Result<()> {
    let privacy = Privacy::load(root)?;
    if !privacy.usage {
        return Ok(());
    }
    enqueue_once_authorized(root, event, privacy.generation)
}
fn enqueue_once_authorized(root: &Path, event: &Usage, generation: u64) -> Result<()> {
    let _guard = consent_lock(root)?;
    let privacy = Privacy::load(root)?;
    if !privacy.usage || privacy.generation != generation {
        return Ok(());
    }
    let marker = match event {
        Usage::InstallationObserved {} => "installation-observed-v1",
        Usage::AccountSignedIn {} => "account-observed-v1",
        Usage::CommercialLicenseObserved {} => "commercial-license-observed-v1",
        _ => return Err(Error::Protocol),
    };
    if root.join(marker).exists() {
        return Ok(());
    }
    // Services puede confirmar cuenta/licencia antes de que el Hub se abra.
    // Reservar la primera observación bajo el mismo lock conserva el orden.
    let installation = root.join("installation-observed-v1");
    if !matches!(event, Usage::InstallationObserved {}) && !installation.exists() {
        queue_usage(root, &Usage::InstallationObserved {}, generation)?;
        File::create(installation)
            .and_then(|file| file.sync_all())
            .map_err(|_| Error::Storage)?;
    }
    queue_usage(root, event, generation)?;
    File::create(root.join(marker))
        .and_then(|file| file.sync_all())
        .map_err(|_| Error::Storage)
}
fn enqueue_usage(root: &Path, event: &Usage) -> Result<()> {
    enqueue_usage_after_check(root, event, || {})
}
fn enqueue_usage_after_check(root: &Path, event: &Usage, checked: impl FnOnce()) -> Result<()> {
    let privacy = Privacy::load(root)?;
    if !privacy.usage {
        return Ok(());
    }
    if !event.valid() {
        return Err(Error::Protocol);
    }
    checked();
    enqueue_authorized(root, event, privacy.generation)
}
fn enqueue_authorized(root: &Path, event: &Usage, generation: u64) -> Result<()> {
    let _guard = consent_lock(root)?;
    let current = Privacy::load(root)?;
    if !current.usage || current.generation != generation {
        return Ok(());
    }
    queue_usage(root, event, generation)
}
fn queue_usage(root: &Path, event: &Usage, generation: u64) -> Result<()> {
    if !event.valid() {
        return Err(Error::Protocol);
    }
    queue(
        root,
        "usage",
        &PendingUsage {
            generation,
            usage: event.clone(),
        },
    )
}

#[cfg(feature = "network")]
mod sender;
#[cfg(feature = "network")]
pub use sender::Worker;

#[cfg(test)]
mod consent_tests;
#[cfg(test)]
mod tests;
