//! Informational installer projection. The existing supervisor owns applying updates.
use serde::{Deserialize, Serialize};
use std::{
    io::Read as _,
    path::{Path, PathBuf},
};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_installer::engine::{Installation, Manifest};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum InstallationState {
    Development,
    Installed,
    Invalid,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(deny_unknown_fields)]
pub struct BetaStatus {
    pub schema: u32,
    pub state: String,
    pub message: String,
    pub version: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default, rename = "rejectedVersion")]
    pub rejected_version: Option<String>,
}
impl BetaStatus {
    fn ready_for(&self, installed: &str) -> bool {
        self.schema == 1
            && self.state == "ready"
            && !self.version.trim().is_empty()
            && self.version != installed
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub struct ReleaseNote {
    pub schema_version: u32,
    pub tag: String,
    pub channel: String,
    pub title: String,
    pub summary: String,
    pub kind: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdatesView {
    pub installation: InstallationState,
    pub version: String,
    pub channel: String,
    pub previous: bool,
    pub beta: Option<BetaStatus>,
    pub registration_warning: Option<String>,
    pub news: Vec<ReleaseNote>,
    pub restart_available: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RegistrationStatus {
    schema: u32,
    state: String,
    message: String,
}

fn local(path: &Path) -> bool {
    let value = path.to_string_lossy();
    path.is_absolute() && !value.starts_with('\\') && !value.starts_with("//")
}

fn read<T: serde::de::DeserializeOwned>(path: &Path, limit: u64) -> Option<T> {
    if !local(path) {
        return None;
    }
    let metadata = std::fs::symlink_metadata(path).ok()?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > limit {
        return None;
    }
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .ok()?
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() as u64 > limit {
        return None;
    }
    serde_json::from_slice(&bytes).ok()
}
fn beta(root: &Path) -> Option<BetaStatus> {
    let status: BetaStatus = read(&root.join("update-status.json"), 64 * 1024)?;
    (status.schema == 1
        && status.message.len() <= 8192
        && status.notes.len() <= 8192
        && status.state.len() <= 64
        && status.version.len() <= 32
        && status
            .rejected_version
            .as_ref()
            .is_none_or(|value| value.len() <= 32))
    .then_some(status)
}
fn registration(root: &Path) -> Option<String> {
    let status: RegistrationStatus = read(&root.join("registration-status.json"), 16 * 1024)?;
    (status.schema == 1
        && status.state == "warning"
        && !status.message.is_empty()
        && status.message.len() <= 8192)
        .then_some(status.message)
}
fn news(channel: &str) -> Vec<ReleaseNote> {
    let notes = serde_json::from_str::<Vec<ReleaseNote>>(include_str!(
        "../../hub/src/settings/customer-news.json"
    ));
    notes
        .unwrap_or_default()
        .into_iter()
        .filter(|note| {
            note.schema_version == 1
                && matches!(note.kind.as_str(), "Nuevo" | "Mejora" | "Arreglo")
                && match channel {
                    "nightly" => matches!(note.channel.as_str(), "master" | "testers" | "nightly"),
                    "testers" | "beta" => matches!(note.channel.as_str(), "master" | "testers"),
                    _ => note.channel == "master",
                }
        })
        .collect()
}

pub struct Reader {
    view: UpdatesView,
    installed_root: Option<PathBuf>,
    beta_root: Option<PathBuf>,
}
impl Reader {
    pub fn current() -> Self {
        Self::from_executable(
            std::env::current_exe().ok(),
            std::env::var_os("VANTARE_BETA_ROOT")
                .map(PathBuf::from)
                .filter(|path| local(path)),
        )
    }
    fn from_executable(executable: Option<PathBuf>, beta_root: Option<PathBuf>) -> Self {
        let mut reader = Self {
            view: UpdatesView {
                installation: InstallationState::Development,
                version: vantare_ipc::product::VERSION.into(),
                channel: vantare_ipc::product::CHANNEL.into(),
                previous: false,
                beta: None,
                registration_warning: None,
                news: Vec::new(),
                restart_available: false,
            },
            installed_root: None,
            beta_root,
        };
        match executable {
            Some(executable) => reader.inspect(&executable),
            None => reader.view.installation = InstallationState::Invalid,
        }
        reader.view.news = news(&reader.view.channel);
        reader
    }
    fn inspect(&mut self, executable: &Path) {
        let Some(package) = executable
            .parent()
            .filter(|bin| bin.file_name().is_some_and(|name| name == "bin"))
            .and_then(Path::parent)
        else {
            return;
        };
        let installed = package
            .parent()
            .is_some_and(|parent| parent.file_name().is_some_and(|name| name == "generations"));
        if !installed && !package.join("manifest.json").exists() {
            return;
        }
        self.view.installation = InstallationState::Invalid;
        if installed {
            let Some(root) = package
                .parent()
                .and_then(Path::parent)
                .filter(|path| local(path))
            else {
                return;
            };
            let Ok(installation) = Installation::read(root) else {
                return;
            };
            let Some(state) = &installation.state else {
                return;
            };
            if package.file_name().and_then(|name| name.to_str()) != Some(&state.active.generation)
            {
                return;
            }
            self.view.previous = installation.usable_previous().is_some();
            let Some(manifest) = installation.manifest else {
                return;
            };
            self.installed_root = Some(root.into());
            self.present(manifest);
        } else if let Ok(manifest) = Manifest::read(&package.join("manifest.json")) {
            self.present(manifest);
        }
    }
    fn present(&mut self, manifest: Manifest) {
        self.view.installation = InstallationState::Installed;
        self.view.version = manifest.version;
        self.view.channel = manifest.channel;
    }
    pub fn view(&self) -> UpdatesView {
        let mut view = self.view.clone();
        if let Some(root) = &self.beta_root {
            view.beta = beta(root);
            view.registration_warning = registration(root);
            let same_root = self
                .installed_root
                .as_ref()
                .and_then(|path| path.canonicalize().ok())
                .zip(root.canonicalize().ok())
                .is_some_and(|(a, b)| {
                    a.to_string_lossy()
                        .eq_ignore_ascii_case(&b.to_string_lossy())
                });
            view.restart_available = same_root
                && view
                    .beta
                    .as_ref()
                    .is_some_and(|status| status.ready_for(&view.version));
        }
        view
    }
    /// Recheck the active generation and staged status immediately before requesting exit 10.
    pub fn can_restart() -> bool {
        Self::current().view().restart_available
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_remembered_or_current_version_never_enables_restart() {
        let mut status = BetaStatus {
            schema: 1,
            state: "ready".into(),
            message: String::new(),
            version: "0.0.989".into(),
            notes: String::new(),
            rejected_version: None,
        };
        assert!(status.ready_for("0.0.988"));
        assert!(!status.ready_for("0.0.989"));
        for state in ["rollback", "current", "error", "applied"] {
            status.state = state.into();
            assert!(!status.ready_for("0.0.988"));
        }
    }
    #[test]
    fn public_notes_respect_the_installed_channel() {
        assert!(!news("nightly").is_empty());
        for channel in ["master", "development", "unknown"] {
            assert!(news(channel).iter().all(|note| note.channel == "master"));
        }
        for channel in ["testers", "beta"] {
            assert!(news(channel).iter().all(|note| note.channel != "nightly"));
        }
    }
    #[test]
    fn restart_requires_the_active_generation_and_matching_installer_root() {
        let base = std::env::var_os("VANTARE_HUB_QA_ROOT").map_or_else(
            || std::env::temp_dir().join("vantare-updates"),
            PathBuf::from,
        );
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let root = base.join(format!("{}-{unique}", std::process::id()));
        let id = "a".repeat(32);
        let package = root.join("generations").join(&id);
        std::fs::create_dir_all(package.join("bin")).expect("QA generation");
        std::fs::create_dir_all(package.join("data")).expect("generation data");
        let executable = package.join("bin/vantare-hub.exe");
        std::fs::write(&executable, b"QA metadata fixture; never executed").expect("inert image");
        let manifest = serde_json::json!({"schema":1,"product":"vantare-native","candidate":true,
            "architecture":"windows-x64","version":"0.0.988","channel":"testers","data_schema":"opaque-v1",
            "source_sha":"a".repeat(40),"source_dirty":false,"build_profile":"Debug",
            "files":[{"path":"bin/vantare-hub.exe","size":0,"sha256":"b".repeat(64)}]});
        let path = package.join("manifest.json");
        std::fs::write(&path, manifest.to_string()).expect("manifest");
        let state = serde_json::json!({"schema":1,"product":"vantare-native","channel":"testers",
            "active":{"generation":id,"manifest_sha256":Manifest::read(&path).expect("manifest").sha256()},"previous":null});
        std::fs::write(root.join("state.json"), state.to_string()).expect("state");
        std::fs::write(root.join("update-status.json"),br#"{"schema":1,"state":"ready","message":"QA staged","version":"0.0.989","notes":"QA"}"#).expect("staged");
        Installation::read(&root).expect("valid bound installation fixture");
        let mut reader = Reader::from_executable(Some(executable.clone()), Some(root.clone()));
        assert_eq!(reader.view().installation, InstallationState::Installed);
        assert!(reader.view().restart_available);
        let other = root.join("unbound");
        std::fs::create_dir(&other).expect("unbound root");
        std::fs::copy(
            root.join("update-status.json"),
            other.join("update-status.json"),
        )
        .expect("cosmetic copy");
        reader.beta_root = Some(other);
        assert!(!reader.view().restart_available);
        let mut wrong = state;
        wrong["active"]["generation"] = "b".repeat(32).into();
        std::fs::write(root.join("state.json"), wrong.to_string()).expect("active changed");
        let fresh = Reader::from_executable(Some(executable), Some(root.clone()));
        assert!(!fresh.view().restart_available);
        let resolved = root.canonicalize().expect("owned root");
        let namespace = base.canonicalize().expect("QA namespace");
        assert!(resolved.starts_with(&namespace) && resolved != namespace);
        std::fs::remove_dir_all(resolved).expect("remove owned fixture");
    }
}
