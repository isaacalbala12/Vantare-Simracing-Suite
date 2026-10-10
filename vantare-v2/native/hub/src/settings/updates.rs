//! Lectura informativa del contrato offline de fase 7. No concede autoridad.
use serde::Deserialize;
use std::{fs, io::Read, path::Path};

#[derive(Debug, Default, PartialEq, Eq)]
pub(super) enum LocalUpdate {
    #[default]
    Unread,
    Development,
    Package {
        version: String,
        channel: String,
        previous: bool,
    },
    Invalid,
}
#[derive(Deserialize)]
struct Manifest {
    schema: u32,
    product: String,
    candidate: bool,
    architecture: String,
    version: String,
    channel: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Installation {
    schema: u32,
    product: String,
    channel: String,
    active: Generation,
    previous: Option<Generation>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Generation {
    generation: String,
    manifest_sha256: String,
}
fn hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn channel(value: &str) -> bool {
    matches!(value, "nightly" | "testers" | "master" | "beta")
}
impl Generation {
    fn valid(&self) -> bool {
        hex(&self.generation, 32) && hex(&self.manifest_sha256, 64)
    }
}
fn read<T: serde::de::DeserializeOwned>(path: &Path, limit: u64) -> Result<T, ()> {
    if !crate::testing::diagnostic::local_path(path) {
        return Err(());
    }
    let meta = fs::symlink_metadata(path).map_err(|_| ())?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > limit {
        return Err(());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|_| ())?
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| ())?;
    if bytes.len() as u64 > limit {
        return Err(());
    }
    serde_json::from_slice(&bytes).map_err(|_| ())
}
impl LocalUpdate {
    pub(super) fn current() -> Self {
        match std::env::current_exe() {
            Ok(exe) => Self::at(&exe),
            Err(_) => Self::Invalid,
        }
    }
    fn at(exe: &Path) -> Self {
        let Some(package) = exe
            .parent()
            .filter(|bin| bin.file_name().is_some_and(|name| name == "bin"))
            .and_then(Path::parent)
        else {
            return Self::Development;
        };
        let path = package.join("manifest.json");
        // Un checkout puede llamarse bin; una generación instalada con el
        // manifiesto ausente o inaccesible debe mostrar estado inválido.
        match path.try_exists() {
            Ok(true) => Self::package(package).unwrap_or(Self::Invalid),
            Ok(false)
                if package.parent().is_some_and(|parent| {
                    parent.file_name().is_some_and(|name| name == "generations")
                }) =>
            {
                Self::Invalid
            }
            Ok(false) => Self::Development,
            Err(_) => Self::Invalid,
        }
    }
    fn package(package: &Path) -> Result<Self, ()> {
        let manifest: Manifest = read(&package.join("manifest.json"), 1024 * 1024)?;
        if manifest.schema != 1
            || manifest.product != "vantare-native"
            || !manifest.candidate
            || manifest.architecture != "windows-x64"
            || !channel(&manifest.channel)
            || !valid_version(&manifest.version)
        {
            return Err(());
        }
        let mut previous = false;
        if let Some(generations) = package
            .parent()
            .filter(|parent| parent.file_name().is_some_and(|name| name == "generations"))
        {
            let install = generations.parent().ok_or(())?;
            let state: Installation = read(&install.join("state.json"), 16 * 1024)?;
            if state.schema != 1
                || state.product != "vantare-native"
                || state.channel != manifest.channel
                || !state.active.valid()
                || state
                    .previous
                    .as_ref()
                    .is_some_and(|generation| !generation.valid())
                || package.file_name().and_then(|name| name.to_str())
                    != Some(&state.active.generation)
            {
                return Err(());
            }
            previous = state.previous.is_some();
        }
        Ok(Self::Package {
            version: manifest.version,
            channel: manifest.channel,
            previous,
        })
    }
}
fn valid_version(value: &str) -> bool {
    if value.len() > 100 {
        return false;
    }
    let (numbers, suffix) = value
        .split_once('-')
        .map_or((value, None), |(a, b)| (a, Some(b)));
    let parts: Vec<_> = numbers.split('.').collect();
    (3..=4).contains(&parts.len())
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
        && suffix.is_none_or(|suffix| {
            !suffix.is_empty()
                && suffix.len() <= 64
                && suffix
                    .as_bytes()
                    .first()
                    .is_some_and(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
                && suffix
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.' || b == b'-')
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_only_packaging_versions_and_closed_channels() {
        assert_eq!(LocalUpdate::default(), LocalUpdate::Unread);
        for value in ["0.0.0-local", "1.2.3", "1.2.3.4-nightly.11"] {
            assert!(valid_version(value));
        }
        for value in [
            "",
            "1.2",
            "1.2.3-",
            "1.2.3--local",
            "1.2.3-.local",
            "1.2.3<script>",
            "1.2.3-TEST",
            "1..3",
        ] {
            assert!(!valid_version(value));
        }
        assert!(!channel("stable"));
        assert!(!hex("../manifest.json", 32));
    }
    #[test]
    fn reads_real_files_and_rejects_wrong_active_generation_and_corrupt_state() {
        let root = std::env::temp_dir().join(format!(
            "vantare-settings-update-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().expect("reloj")
        ));
        let id = "a".repeat(32);
        let package = root.join("generations").join(&id);
        fs::create_dir_all(package.join("bin")).expect("directorio");
        let exe = package.join("bin/vantare-hub.exe");
        assert_eq!(LocalUpdate::at(&exe), LocalUpdate::Invalid);
        fs::write(package.join("manifest.json"), r#"{"schema":1,"product":"vantare-native","candidate":true,"architecture":"windows-x64","version":"1.2.3-local","channel":"nightly"}"#).expect("manifiesto");
        let state = serde_json::json!({"schema":1,"product":"vantare-native","channel":"nightly","active":{"generation":id,"manifest_sha256":"b".repeat(64)},"previous":null});
        fs::write(root.join("state.json"), state.to_string()).expect("estado");
        assert_eq!(
            LocalUpdate::at(&exe),
            LocalUpdate::Package {
                version: "1.2.3-local".into(),
                channel: "nightly".into(),
                previous: false
            }
        );
        let mut rollback = state.clone();
        rollback["previous"] =
            serde_json::json!({"generation":"c".repeat(32), "manifest_sha256":"d".repeat(64)});
        fs::write(root.join("state.json"), rollback.to_string()).expect("rollback disponible");
        assert!(matches!(
            LocalUpdate::at(&exe),
            LocalUpdate::Package { previous: true, .. }
        ));
        let mut wrong_channel = state.clone();
        wrong_channel["channel"] = "master".into();
        fs::write(root.join("state.json"), wrong_channel.to_string()).expect("canal distinto");
        assert_eq!(LocalUpdate::at(&exe), LocalUpdate::Invalid);
        let mut wrong = state.clone();
        wrong["active"]["generation"] = "c".repeat(32).into();
        fs::write(root.join("state.json"), wrong.to_string()).expect("estado distinto");
        assert_eq!(LocalUpdate::at(&exe), LocalUpdate::Invalid);
        fs::write(root.join("state.json"), b"{").expect("estado corrupto");
        assert_eq!(LocalUpdate::at(&exe), LocalUpdate::Invalid);
        fs::write(root.join("state.json"), vec![b' '; 16 * 1024 + 1])
            .expect("estado demasiado grande");
        assert_eq!(LocalUpdate::at(&exe), LocalUpdate::Invalid);
        // Portable usa el mismo manifiesto sin state.json de instalación.
        let portable = root.join("portable");
        fs::create_dir_all(portable.join("bin")).expect("portable");
        assert_eq!(
            LocalUpdate::at(&portable.join("bin/vantare-hub.exe")),
            LocalUpdate::Development
        );
        fs::copy(
            package.join("manifest.json"),
            portable.join("manifest.json"),
        )
        .expect("manifiesto portable");
        assert!(matches!(
            LocalUpdate::at(&portable.join("bin/vantare-hub.exe")),
            LocalUpdate::Package {
                previous: false,
                ..
            }
        ));
        assert_eq!(
            LocalUpdate::at(&root.join("target/debug/vantare-hub.exe")),
            LocalUpdate::Development
        );
        fs::remove_dir_all(root).expect("limpiar fixture propia");
    }
}

#[derive(Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub(super) struct BetaStatus {
    pub schema: u32,
    pub state: String,
    pub message: String,
    pub version: String,
    #[serde(default)]
    pub notes: String,
}
impl BetaStatus {
    pub(super) fn ready_for(&self, installed: &str) -> bool {
        self.state == "ready" && !self.version.trim().is_empty() && self.version != installed
    }
}

#[cfg(test)]
#[test]
fn install_requires_a_staged_different_version() {
    let mut status = BetaStatus {
        schema: 1,
        state: "ready".into(),
        message: String::new(),
        version: "0.1.1".into(),
        notes: String::new(),
    };
    assert!(status.ready_for("0.1.0"));
    assert!(!status.ready_for("0.1.1"));
    status.version.clear();
    assert!(!status.ready_for("0.1.0"));
    status.version = "0.1.1".into();
    for state in ["current", "error", "rollback", "applied"] {
        status.state = state.into();
        assert!(!status.ready_for("0.1.0"));
    }
}

pub(super) fn beta_status() -> Option<BetaStatus> {
    let root = std::env::var_os("VANTARE_BETA_ROOT")?;
    let status: BetaStatus = read(&Path::new(&root).join("update-status.json"), 64 * 1024).ok()?;
    (status.schema == 1
        && status.message.len() <= 8192
        && status.version.len() <= 32
        && status.notes.len() <= 8192)
        .then_some(status)
}
pub(super) fn request_restart() -> Result<(), String> {
    let root = std::env::var_os("VANTARE_BETA_ROOT").ok_or("Instalación beta no disponible")?;
    fs::write(Path::new(&root).join("restart-request"), b"restart")
        .map_err(|error| format!("solicitar reinicio: {error}"))
}
pub(super) fn cancel_restart() -> Result<(), String> {
    let Some(root) = std::env::var_os("VANTARE_BETA_ROOT") else {
        return Ok(());
    };
    match fs::remove_file(Path::new(&root).join("restart-request")) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("cancelar reinicio beta: {error}")),
    }
}
