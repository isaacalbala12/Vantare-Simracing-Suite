//! Contrato de archivos local. Hub compila este mismo módulo, sin depender del
//! worker ni del runtime. Solo `std`/`serde_json`: no introduce otro transporte.
use serde_json::{Value, json};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;

pub const MAX_BYTES: u64 = 64 * 1024;
pub const LOCALES: &[&str] = &["es", "en", "it", "pt-BR"];

#[derive(Clone, Debug, PartialEq, Eq)]
#[allow(clippy::struct_excessive_bools)] // Preferencias independientes, no estados de una máquina.
pub struct Families {
    pub fuel: bool,
    pub flags: bool,
    pub pitstops: bool,
    pub laps: bool,
}
impl Default for Families {
    fn default() -> Self {
        Self {
            fuel: true,
            flags: true,
            pitstops: true,
            laps: true,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Settings {
    pub version: u8,
    pub enabled: bool,
    pub locale: String,
    pub voice: bool,
    pub families: Families,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            version: 1,
            enabled: true,
            locale: "es".into(),
            voice: false,
            families: Families::default(),
        }
    }
}
impl Settings {
    pub fn json(&self) -> Value {
        json!({"version":self.version, "enabled":self.enabled, "locale":self.locale, "voice":self.voice,
            "families":{"fuel":self.families.fuel, "flags":self.families.flags, "pitstops":self.families.pitstops, "laps":self.families.laps}})
    }
    pub fn validate(&self) -> io::Result<()> {
        if self.version != 1 || !LOCALES.contains(&self.locale.as_str()) {
            return Err(invalid("versión/locale de Engineer desconocido"));
        }
        Ok(())
    }
    pub fn parse(bytes: &[u8]) -> io::Result<Self> {
        let value = decode(bytes)?;
        fields(
            &value,
            &["version", "enabled", "locale", "voice", "families"],
        )?;
        let family = &value["families"];
        fields(family, &["fuel", "flags", "pitstops", "laps"])?;
        let settings = Self {
            version: u8::try_from(number(&value["version"])?)
                .map_err(|_| invalid("versión inválida"))?,
            enabled: boolean(&value["enabled"])?,
            locale: string(&value["locale"])?,
            voice: boolean(&value["voice"])?,
            families: Families {
                fuel: boolean(&family["fuel"])?,
                flags: boolean(&family["flags"])?,
                pitstops: boolean(&family["pitstops"])?,
                laps: boolean(&family["laps"])?,
            },
        };
        settings.validate()?;
        Ok(settings)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Message {
    pub epoch: u64,
    pub sequence: u64,
    pub intent: String,
    pub locale: String,
    pub text: String,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Status {
    pub version: u8,
    pub active: bool,
    pub pid: u32,
    pub settings: Settings,
    /// true si todos los clips de las familias nativas pasan validación WAV/MCI.
    pub assets: std::collections::BTreeMap<String, bool>,
    pub last_message: Option<Message>,
    pub error: Option<String>,
}
impl Status {
    pub fn json(&self) -> Value {
        let message = self
            .last_message
            .as_ref()
            .map(|m| json!({"epoch":m.epoch, "sequence":m.sequence, "intent":m.intent, "locale":m.locale, "text":m.text}));
        json!({"version":self.version, "active":self.active, "pid":self.pid, "settings":self.settings.json(), "assets":self.assets, "last_message":message, "error":self.error})
    }
    pub fn parse(bytes: &[u8]) -> io::Result<Self> {
        let value = decode(bytes)?;
        fields(
            &value,
            &[
                "version",
                "active",
                "pid",
                "settings",
                "assets",
                "last_message",
                "error",
            ],
        )?;
        let message = &value["last_message"];
        let last_message = if message.is_null() {
            None
        } else {
            fields(message, &["epoch", "sequence", "intent", "locale", "text"])?;
            Some(Message {
                epoch: number(&message["epoch"])?,
                sequence: number(&message["sequence"])?,
                intent: string(&message["intent"])?,
                locale: string(&message["locale"])?,
                text: string(&message["text"])?,
            })
        };
        let assets = value["assets"]
            .as_object()
            .ok_or_else(|| invalid("assets inválidos"))?
            .iter()
            .map(|(locale, present)| Ok((locale.clone(), boolean(present)?)))
            .collect::<io::Result<_>>()?;
        let status = Self {
            version: u8::try_from(number(&value["version"])?)
                .map_err(|_| invalid("versión inválida"))?,
            active: boolean(&value["active"])?,
            pid: u32::try_from(number(&value["pid"])?).map_err(|_| invalid("pid inválido"))?,
            settings: Settings::parse(
                &serde_json::to_vec(&value["settings"]).map_err(io::Error::other)?,
            )?,
            assets,
            last_message,
            error: if value["error"].is_null() {
                None
            } else {
                Some(string(&value["error"])?)
            },
        };
        status.settings.validate()?;
        if status.version != 1
            || status.pid == 0
            || status.assets.len() != LOCALES.len()
            || !LOCALES
                .iter()
                .all(|locale| status.assets.contains_key(*locale))
        {
            return Err(invalid("estado de Engineer inválido"));
        }
        Ok(status)
    }
}

pub fn default_path() -> io::Result<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("LOCALAPPDATA")
            .map(|root| PathBuf::from(root).join("Vantare/native/engineer.json"))
            .ok_or_else(|| invalid("LOCALAPPDATA no está definido"))
    }
    #[cfg(target_os = "linux")]
    {
        let root = match std::env::var_os("XDG_CONFIG_HOME") {
            Some(root) if PathBuf::from(&root).is_absolute() => PathBuf::from(root),
            Some(_) => return Err(invalid("XDG_CONFIG_HOME debe ser absoluto")),
            None => home()?.join(".config"),
        };
        Ok(root.join("Vantare/native/engineer.json"))
    }
    #[cfg(target_os = "macos")]
    {
        Ok(home()?.join("Library/Application Support/Vantare/native/engineer.json"))
    }
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    {
        Err(invalid("plataforma sin ruta de configuración"))
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn home() -> io::Result<PathBuf> {
    std::env::var_os("HOME")
        .filter(|home| !home.is_empty())
        .map(PathBuf::from)
        .filter(|home| home.is_absolute())
        .ok_or_else(|| invalid("HOME no está definido"))
}
pub fn status_path(settings: &Path) -> PathBuf {
    settings.with_file_name("engineer-status.json")
}
pub fn modified(path: &Path) -> Option<SystemTime> {
    fs::metadata(path).and_then(|meta| meta.modified()).ok()
}
fn invalid(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message.into())
}
fn fields(value: &Value, keys: &[&str]) -> io::Result<()> {
    let object = value
        .as_object()
        .ok_or_else(|| invalid("objeto requerido"))?;
    if object.len() != keys.len() || !keys.iter().all(|key| object.contains_key(*key)) {
        return Err(invalid("campos Engineer desconocidos/ausentes"));
    }
    Ok(())
}
fn boolean(value: &Value) -> io::Result<bool> {
    value.as_bool().ok_or_else(|| invalid("boolean requerido"))
}
fn string(value: &Value) -> io::Result<String> {
    value
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| invalid("texto requerido"))
}
fn number(value: &Value) -> io::Result<u64> {
    value.as_u64().ok_or_else(|| invalid("entero requerido"))
}
fn decode(bytes: &[u8]) -> io::Result<Value> {
    if bytes.len() as u64 > MAX_BYTES {
        return Err(invalid("Engineer supera 64 KiB"));
    }
    serde_json::from_slice(bytes).map_err(|error| invalid(error.to_string()))
}
pub fn read(path: &Path) -> io::Result<Option<Vec<u8>>> {
    check_path(path)?;
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(invalid("Engineer supera 64 KiB"));
    }
    Ok(Some(bytes))
}

/// Lock del SO entre escritores, temporal exclusivo + fsync + rename y conflicto
/// por bytes antes del reemplazo. Los editores externos deben respetar el lock.
pub fn save(path: &Path, expected: Option<&[u8]>, bytes: &[u8]) -> io::Result<()> {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    check_path(path)?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(invalid("Engineer supera 64 KiB"));
    }
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::create_dir_all(parent)?;
    }
    let lock = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(path.with_extension("json.lock"))?;
    lock.try_lock()
        .map_err(|error| io::Error::other(format!("conflicto de escritor Engineer: {error}")))?;
    let conflict =
        || io::Error::other("conflicto: Engineer cambió en disco; recargar antes de guardar");
    if read(path)?.as_deref() != expected {
        return Err(conflict());
    }
    let temporary = path.with_extension(format!(
        "json.{}.{}.tmp",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    let result = (|| {
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        if read(path)?.as_deref() != expected {
            return Err(conflict());
        }
        fs::rename(&temporary, path)
    })();
    if result.is_err()
        && let Err(error) = fs::remove_file(&temporary)
    {
        eprintln!("temporal Engineer: {error}");
    }
    result
}

fn check_path(path: &Path) -> io::Result<()> {
    if path.components().any(|part| {
        part.as_os_str()
            .to_string_lossy()
            .to_ascii_lowercase()
            .starts_with(".env")
    }) {
        return Err(invalid("archivo de entorno no permitido"));
    }
    Ok(())
}

/// Ausencia inicial usa los ajustes CLI. JSON roto/archivo retirado conserva lo
/// último válido y reintenta aun cuando una escritura parcial mantenga su mtime.
pub struct Document {
    path: PathBuf,
    bytes: Option<Vec<u8>>,
    stamp: Option<SystemTime>,
    loaded: bool,
    settings: Settings,
}
impl Document {
    pub fn new(path: PathBuf, settings: Settings) -> Self {
        Self {
            path,
            bytes: None,
            stamp: None,
            loaded: false,
            settings,
        }
    }
    pub fn settings(&self) -> &Settings {
        &self.settings
    }
    pub fn poll(&mut self) -> io::Result<bool> {
        let stamp = modified(&self.path);
        if self.loaded && stamp == self.stamp {
            return Ok(false);
        }
        let bytes = read(&self.path)?;
        let settings = match bytes.as_deref() {
            Some(bytes) => Settings::parse(bytes)?,
            None if self.bytes.is_none() => self.settings.clone(),
            None => return Err(invalid("engineer.json desaparecido")),
        };
        let changed = self.settings != settings;
        self.settings = settings;
        self.bytes = bytes;
        self.stamp = stamp;
        self.loaded = true;
        Ok(changed)
    }
    pub fn reload(&mut self) -> io::Result<()> {
        self.loaded = false;
        self.poll().map(|_| ())
    }
    pub fn save(&mut self, settings: Settings) -> io::Result<()> {
        settings.validate()?;
        let bytes = serde_json::to_vec_pretty(&settings.json()).map_err(io::Error::other)?;
        save(&self.path, self.bytes.as_deref(), &bytes)?;
        self.bytes = Some(bytes);
        self.settings = settings;
        self.stamp = modified(&self.path);
        self.loaded = true;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip_invalid_conflict_and_partial_write_keep_last_valid() {
        let root = std::env::temp_dir().join(format!("engineer-control-{}", std::process::id()));
        fs::create_dir(&root).expect("temporal");
        let path = root.join("engineer.json");
        let mut first = Document::new(path.clone(), Settings::default());
        first.poll().expect("ausente");
        first.save(Settings::default()).expect("crear");
        let mut second = Document::new(path.clone(), Settings::default());
        second.poll().expect("leer");
        let mut next = first.settings().clone();
        next.locale = "en".into();
        next.families.fuel = false;
        first.save(next.clone()).expect("cambiar");
        assert!(second.save(Settings::default()).is_err());
        assert_eq!(
            Settings::parse(&read(&path).expect("disco").expect("documento")).expect("válido"),
            next
        );
        second.reload().expect("recargar");
        assert_eq!(second.settings(), &next);
        fs::write(&path, b"{").expect("parcial");
        second.loaded = false;
        let stamp = modified(&path).expect("mtime parcial");
        assert!(second.poll().is_err());
        assert_eq!(second.settings(), &next);
        fs::write(
            &path,
            serde_json::to_vec(&Settings::default().json()).expect("serializar"),
        )
        .expect("terminar");
        OpenOptions::new()
            .write(true)
            .open(&path)
            .expect("abrir")
            .set_modified(stamp)
            .expect("mismo mtime");
        assert!(second.poll().expect("reintento"));
        for bytes in [b"{}".as_slice(), b"{", b"null"] {
            assert!(Settings::parse(bytes).is_err());
        }
        let mut extra = Settings::default().json();
        extra["volume"] = json!(0.5);
        assert!(Settings::parse(&serde_json::to_vec(&extra).expect("json")).is_err());
        assert!(
            Settings::parse(&vec![
                b' ';
                usize::try_from(MAX_BYTES).expect("límite") + 1
            ])
            .is_err()
        );
        assert!(read(Path::new(".env.local")).is_err());
        assert!(save(Path::new(".env.local"), None, b"{}").is_err());
        let invalid = Settings {
            locale: "xx".into(),
            ..Default::default()
        };
        assert!(second.save(invalid).is_err());
        let guard = OpenOptions::new()
            .write(true)
            .open(path.with_extension("json.lock"))
            .expect("lock");
        guard.try_lock().expect("tomar lock");
        assert!(second.save(next).is_err());
        drop(guard);
        fs::remove_file(&path).expect("retirar");
        assert!(second.poll().is_err());
        fs::remove_file(path.with_extension("json.lock")).expect("limpiar lock");
        fs::remove_dir(root).expect("limpiar temporal");
    }
}
