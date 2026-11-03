//! Explicit OS context. QA never falls back to real HKCU or shell folders.
use super::{
    Installation, Request, installation, validation,
    write_fs::{self as disk, Result, WriteError, ensure},
};
use crate::model::Info;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Context {
    pub local_app_data: PathBuf,
    pub registry_prefix: String,
    pub shell_root: Option<PathBuf>,
}
impl Context {
    pub fn isolated(
        local_app_data: PathBuf,
        registry_prefix: String,
        shell_root: PathBuf,
    ) -> Result<Self> {
        let result = Self {
            local_app_data,
            registry_prefix,
            shell_root: Some(shell_root),
        };
        result.validate_isolation()?;
        Ok(result)
    }
    fn validate_isolation(&self) -> Result<()> {
        let prefix = "Software\\VantareInstallerMatrix\\";
        let suffix = self
            .registry_prefix
            .strip_prefix(prefix)
            .ok_or_else(|| WriteError::new(1, "HKCU QA no inyectado"))?;
        let mut parts = suffix.split('\\');
        ensure(
            parts.next().is_some_and(|id| validation::hex(id, 32)),
            "HKCU QA inválido",
        )?;
        ensure(
            parts.all(|part| {
                !part.is_empty() && part.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
            }),
            "Subclave QA inválida",
        )?;
        qa_path(&self.local_app_data)?;
        let shell_root = self
            .shell_root
            .as_ref()
            .ok_or_else(|| WriteError::new(1, "Carpetas QA no inyectadas"))?;
        qa_path(shell_root)?;
        ensure(
            !overlap(&self.local_app_data, shell_root)?,
            "Raíces QA solapadas",
        )?;
        Ok(())
    }
    pub fn system() -> Result<Self> {
        if crate::QA {
            let path = std::env::var_os("VANTARE_INSTALLER_QA_CONTEXT").ok_or_else(|| {
                WriteError::new(
                    1,
                    "Una build TEST necesita contexto Windows aislado explícito",
                )
            })?;
            qa_path(Path::new(&path))?;
            let context: Self =
                serde_json::from_value(disk::read_json(Path::new(&path), Some(65536))?)?;
            context.validate_isolation()?;
            return Ok(context);
        }
        Ok(Self {
            local_app_data: std::env::var_os("LOCALAPPDATA")
                .ok_or_else(|| WriteError::new(1, "LOCALAPPDATA ausente"))?
                .into(),
            registry_prefix: String::new(),
            shell_root: None,
        })
    }
    pub fn is_isolated(&self) -> bool {
        !self.registry_prefix.is_empty()
    }
    #[cfg(feature = "test-installer")]
    pub fn from_qa_env(root: &Path) -> Result<Self> {
        let required =
            |name| std::env::var_os(name).ok_or_else(|| WriteError::new(1, "Falta contexto QA"));
        qa_path(root)?;
        let registry = required("VANTARE_QA_REGISTRY_PREFIX")?
            .into_string()
            .map_err(|_| WriteError::new(1, "Registro QA inválido"))?;
        Self::isolated(
            required("VANTARE_QA_LOCAL_APP_DATA")?.into(),
            registry,
            required("VANTARE_QA_SHELL_ROOT")?.into(),
        )
    }
    pub fn validate_root(&self, root: &Path) -> Result<()> {
        self.validate_context()?;
        if self.is_isolated() {
            qa_path(root)?;
            let shell_root = self
                .shell_root
                .as_ref()
                .ok_or_else(|| WriteError::new(1, "Carpetas QA no inyectadas"))?;
            ensure(
                !overlap(root, &self.local_app_data)? && !overlap(root, shell_root)?,
                "Raíz de instalación QA solapada",
            )?;
        }
        disk::path(root)?;
        Ok(())
    }
    pub fn install_location(&self) -> Result<Option<String>> {
        self.registry(UNINSTALL_KEY, "InstallLocation")
    }
    pub fn has_registration(&self) -> Result<bool> {
        self.validate_context()?;
        Ok(super::windows::registry_exists(
            &self.registry_prefix,
            UNINSTALL_KEY,
        ))
    }
    fn validate_context(&self) -> Result<()> {
        if self.is_isolated() {
            self.validate_isolation()
        } else {
            ensure(
                self.shell_root.is_none() && !crate::QA,
                "Contexto Windows incoherente",
            )
        }
    }
    fn registry(&self, key: &str, name: &str) -> Result<Option<String>> {
        self.validate_context()?;
        super::windows::registry_string(
            &self.registry_prefix,
            key,
            name,
            key == "Control Panel\\Desktop\\WindowMetrics" && name == "MinAnimate",
        )
    }
    pub fn resolve_root(&self, request: &Request) -> Result<PathBuf> {
        self.validate_context()?;
        if request.qa {
            ensure(
                self.is_isolated(),
                "Una petición QA necesita HKCU y carpetas inyectados",
            )?;
        }
        let registered = self.install_location()?;
        let explicit = request
            .root
            .as_ref()
            .filter(|root| !root.as_os_str().is_empty());
        if request.qa {
            ensure(explicit.is_some(), "QA necesita una raíz aislada explícita")?;
        }
        if request.uninstall
            && let (Some(registered), Some(explicit)) = (&registered, explicit)
        {
            ensure(
                same_path(Path::new(registered), explicit)?,
                "El desinstalador no pertenece a esta instalación",
            )?;
        }
        let root = registered
            .as_ref()
            .map(PathBuf::from)
            .or_else(|| explicit.cloned())
            .unwrap_or_else(|| self.local_app_data.join("Programs/Vantare"));
        let root = disk::path(&root)?;
        self.validate_root(&root)?;
        Ok(root)
    }
    pub fn probe(&self, request: &Request) -> Result<Info> {
        let root = self.resolve_root(request)?;
        let (installed_version, data_path) = if request.uninstall {
            let state = super::State::read(&root)?;
            let directory = state
                .as_ref()
                .map(|state| root.join("generations").join(&state.active.generation));
            let version = state
                .as_ref()
                .zip(directory.as_ref())
                .and_then(|(state, directory)| {
                    super::Manifest::authenticated(directory, &state.active, &state.channel).ok()
                })
                .map(|manifest| manifest.version);
            (
                version,
                directory.map_or_else(
                    || root.join("generations"),
                    |directory| directory.join("data"),
                ),
            )
        } else {
            let view = Installation::read(&root)?;
            if view
                .manifest
                .as_ref()
                .is_some_and(|manifest| manifest.channel != "beta")
            {
                return Err(super::ReadError::Rejected(super::Rejection::Manifest).into());
            }
            (view.installed_version().map(str::to_owned), view.data_path)
        };
        let (desktop, autostart) = preferences(&root, request.uninstall, request.silent)?;
        // DisplayVersion no longer supplies installation truth in p4. A partial
        // uninstall remains usable, but cannot invent a missing manifest version.
        Ok(Info {
            root,
            version: request.version.clone(),
            installed_version,
            data_path,
            desktop,
            autostart,
            size: request.size,
            reduced_motion: self
                .registry("Control Panel\\Desktop\\WindowMetrics", "MinAnimate")?
                .as_deref()
                == Some("0"),
        })
    }
}

// Legacy root ownership compares normalized Windows paths without case sensitivity.
pub fn same_path(left: &Path, right: &Path) -> Result<bool> {
    let left: PathBuf = disk::path(left)?.components().collect();
    let right: PathBuf = disk::path(right)?.components().collect();
    super::windows::paths_equal(&left, &right)
}

fn overlap(left: &Path, right: &Path) -> Result<bool> {
    let normalize = |path: &Path| -> Result<String> {
        Ok(disk::path(path)?
            .to_string_lossy()
            .replace('\\', "/")
            .trim_end_matches('/')
            .to_lowercase())
    };
    let left = normalize(left)?;
    let right = normalize(right)?;
    Ok(left == right
        || left.starts_with(&format!("{right}/"))
        || right.starts_with(&format!("{left}/")))
}

pub fn qa_path(path: &Path) -> Result<()> {
    ensure(
        !path.components().any(|part| {
            matches!(
                part,
                std::path::Component::ParentDir | std::path::Component::CurDir
            )
        }),
        "Guard QA rechazó segmentos relativos",
    )?;
    let path = disk::path(path)?;
    let prefix = Path::new("D:/VantareServer/qa");
    let in_server = below_prefix(&path, prefix);
    let in_ci = std::env::var("CI").as_deref() == Ok("true")
        && std::env::var_os("RUNNER_TEMP")
            .is_some_and(|prefix| below_prefix(&path, Path::new(&prefix)));
    ensure(in_server || in_ci, "Guard QA rechazó la ruta")
}
fn below_prefix(path: &Path, prefix: &Path) -> bool {
    !prefix.as_os_str().is_empty() && path != prefix && path.starts_with(prefix)
}
pub(crate) const UNINSTALL_KEY: &str =
    "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\VantareNativeBeta";
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Options {
    pub schema: u32,
    pub kind: String,
    pub uninstaller: String,
    pub sha256: String,
    pub desktop: bool,
    pub autostart: bool,
}
pub fn options(root: &Path, verify_uninstaller: bool) -> Result<Option<Options>> {
    let path = root.join("installer-ui.json");
    let Some(value) = disk::read_optional(&path, Some(4096))? else {
        return Ok(None);
    };
    let ui: Options = serde_json::from_value(value)?;
    ensure(
        ui.schema == 1
            && ui.kind == "rust-gpui"
            && ui.uninstaller == "Uninstall.exe"
            && validation::hex(&ui.sha256, 64),
        "Opciones del instalador inválidas",
    )?;
    if verify_uninstaller {
        let exe = root.join("Uninstall.exe");
        ensure(
            installation::hash_file(&exe)? == ui.sha256,
            "Desinstalador propio alterado",
        )?;
        installation::verify_pe(&exe)?;
    }
    Ok(Some(ui))
}
pub(crate) fn preferences(root: &Path, uninstall: bool, silent: bool) -> Result<(bool, bool)> {
    Ok(match options(root, uninstall)? {
        Some(ui) => (ui.desktop, ui.autostart),
        None => (!silent, startup_preference(root).unwrap_or(false)),
    })
}
pub(crate) fn startup_preference(root: &Path) -> Option<bool> {
    // A malformed legacy preference is absence, as in PowerShell.
    disk::read_optional(&root.join("startup-options.json"), Some(1024))
        .ok()
        .flatten()
        .filter(|value| value.as_object().is_some_and(|map| map.len() == 2) && value["schema"] == 1)
        .and_then(|value| value["autostart"].as_bool())
}
pub fn startup(root: &Path) -> Option<bool> {
    match options(root, false) {
        Ok(Some(ui)) => Some(ui.autostart),
        Ok(None) => startup_preference(root),
        Err(_) => None,
    }
}

/// One Rust cleanup-marker contract. The caller may pass the hash from its
/// previously checked UI options; otherwise we hash the uninstaller image here.
/// PowerShell rechecks ownership after the parent exits (permanent boundary).
pub(crate) fn cleanup_marker(root: &Path, verified_image: Option<&str>) -> Result<Option<String>> {
    let Some(value) = disk::read_optional(&root.join("installer-cleanup.json"), Some(1024))? else {
        return Ok(None);
    };
    ensure(value["schema"] == 1, "Marker de limpieza inválido")?;
    let hash = value["sha256"]
        .as_str()
        .filter(|hash| validation::hex(hash, 64))
        .ok_or_else(|| WriteError::new(1, "Marker de limpieza inválido"))?;
    let image = root.join("Uninstall.exe");
    if image.try_exists()? {
        let actual = match verified_image {
            Some(hash) => hash.to_owned(),
            None => installation::hash_file(&image)?,
        };
        ensure(hash == actual, "El desinstalador cambió; se conserva")?;
    }
    Ok(Some(hash.to_owned()))
}

#[cfg(all(test, windows))]
mod tests {
    use super::{below_prefix, same_path};
    use std::path::Path;

    #[test]
    fn empty_qa_prefix_never_accepts_any_path() {
        for value in [
            "",
            "relative",
            "D:/VantareServer/qa/test",
            "C:/Users/fixture",
        ] {
            assert!(!below_prefix(Path::new(value), Path::new("")));
        }
        assert!(!below_prefix(
            Path::new("D:/VantareServer/qa"),
            Path::new("D:/VantareServer/qa")
        ));
    }

    #[test]
    fn root_ownership_preserves_windows_case_and_separator_equivalence() {
        let root = Path::new("D:/VantareServer/qa/Instalación/root");
        assert!(
            same_path(
                root,
                Path::new("d:\\VANTARESERVER\\QA\\INSTALACIÓN\\ROOT\\")
            )
            .expect("Windows path comparison")
        );
        assert!(
            !same_path(
                root,
                Path::new("D:/VantareServer/qa/Instalación/root-other")
            )
            .expect("different root")
        );
    }
}
