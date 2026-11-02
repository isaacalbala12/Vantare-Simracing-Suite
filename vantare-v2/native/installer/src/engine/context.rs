//! Explicit OS context. QA never falls back to real HKCU or shell folders.
use super::{
    Installation, ReadProfile, Request, installation, validation,
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
        qa_path(
            self.shell_root
                .as_ref()
                .ok_or_else(|| WriteError::new(1, "Carpetas QA no inyectadas"))?,
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
        #[cfg(windows)]
        {
            Ok(Self {
                local_app_data: std::env::var_os("LOCALAPPDATA")
                    .ok_or_else(|| WriteError::new(1, "LOCALAPPDATA ausente"))?
                    .into(),
                registry_prefix: String::new(),
                shell_root: None,
            })
        }
        #[cfg(not(windows))]
        {
            Err(WriteError::new(1, "El instalador requiere Windows"))
        }
    }
    pub fn is_isolated(&self) -> bool {
        !self.registry_prefix.is_empty()
    }
    pub fn validate_root(&self, root: &Path) -> Result<()> {
        if self.is_isolated() {
            self.validate_isolation()?;
            qa_path(root)?;
        } else {
            ensure(
                self.shell_root.is_none() && !crate::QA,
                "Contexto Windows incoherente",
            )?;
        }
        disk::path(root)?;
        Ok(())
    }
    pub fn registration(&self, request: &Request, name: &str) -> Result<Option<String>> {
        self.registry(
            &format!(
                "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{}",
                identity(request)?
            ),
            name,
        )
    }
    pub fn has_registration(&self, request: &Request) -> Result<bool> {
        self.validate_context()?;
        #[cfg(windows)]
        {
            super::platform::registry_exists(
                &self.registry_prefix,
                &format!(
                    "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{}",
                    identity(request)?
                ),
            )
        }
        #[cfg(not(windows))]
        {
            let _ = request;
            Err(WriteError::new(1, "Registro Windows no disponible"))
        }
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
        #[cfg(windows)]
        {
            super::platform::registry_string(&self.registry_prefix, key, name)
        }
        #[cfg(not(windows))]
        {
            let _ = (key, name);
            Err(WriteError::new(1, "Registro Windows no disponible"))
        }
    }
    pub fn probe(&self, request: &Request) -> Result<Info> {
        self.validate_context()?;
        if request.qa {
            ensure(
                self.is_isolated(),
                "Una petición QA necesita HKCU y carpetas inyectados",
            )?;
        }
        identity(request)?;
        let registered = self.registration(request, "InstallLocation")?;
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
        let mut root = registered
            .as_ref()
            .map(PathBuf::from)
            .or_else(|| explicit.cloned())
            .unwrap_or_else(|| self.local_app_data.join("Programs/Vantare"));
        if registered.is_none() && explicit.is_none() && !request.qa && !request.uninstall {
            let old = self.local_app_data.join("Programs/Vantare Native Beta");
            if old.join("state.json").try_exists()?
                || old.join("retained-data.json").try_exists()?
            {
                root = old;
            }
        }
        root = disk::path(&root)?;
        self.validate_root(&root)?;
        if request.qa {
            let prefix = Path::new(
                request
                    .qa_prefix
                    .as_deref()
                    .ok_or_else(|| WriteError::new(1, "Prefijo QA ausente"))?,
            );
            ensure(
                root != prefix && root.starts_with(prefix),
                "QA fuera de su prefijo",
            )?;
            for real in [
                self.local_app_data.join("Programs/Vantare"),
                self.local_app_data.join("Programs/Vantare Native Beta"),
            ] {
                ensure(
                    !root.starts_with(&real) && !real.starts_with(&root),
                    "QA no puede usar la instalación del usuario",
                )?;
            }
        }
        if root.try_exists()? {
            installation::tree(&root)?;
        }
        let view = Installation::read(
            &root,
            if request.uninstall {
                ReadProfile::Uninstall
            } else {
                ReadProfile::Probe
            },
        )?;
        super::validate_setup_channel(view.manifest.as_ref(), request.uninstall)?;
        let ui = options(&root, request.uninstall)?;
        let desktop = ui.as_ref().map_or(!request.silent, |ui| ui.desktop);
        let autostart = match ui {
            Some(ui) => ui.autostart,
            None => startup_preference(&root)?.unwrap_or(false),
        };
        // DisplayVersion no longer supplies installation truth in p4. A partial
        // uninstall remains usable, but cannot invent a missing manifest version.
        let installed_version = view.installed_version().map(str::to_owned);
        Ok(Info {
            root,
            version: request.version.clone(),
            installed_version,
            data_path: view.data_path,
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
fn same_path(left: &Path, right: &Path) -> Result<bool> {
    let left: PathBuf = disk::path(left)?.components().collect();
    let right: PathBuf = disk::path(right)?.components().collect();
    #[cfg(windows)]
    {
        super::platform::paths_equal(&left, &right)
    }
    #[cfg(not(windows))]
    {
        Ok(left == right)
    }
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
    let in_server = path != prefix && path.starts_with(prefix);
    let in_ci = std::env::var("CI").as_deref() == Ok("true")
        && std::env::var_os("RUNNER_TEMP").is_some_and(|prefix| path.starts_with(prefix));
    ensure(in_server || in_ci, "Guard QA rechazó la ruta")
}
pub fn identity(request: &Request) -> Result<&str> {
    if !request.qa {
        return Ok("VantareNativeBeta");
    }
    let identity = request
        .qa_identity
        .as_deref()
        .ok_or_else(|| WriteError::new(1, "Identidad QA ausente"))?;
    ensure(
        !identity.is_empty()
            && identity.len() <= 64
            && identity.bytes().all(|b| b.is_ascii_alphanumeric())
            && !identity.eq_ignore_ascii_case("VantareNativeBeta"),
        "Identidad QA inválida",
    )?;
    let folder = request
        .qa_shortcut_folder
        .as_deref()
        .ok_or_else(|| WriteError::new(1, "Carpeta QA ausente"))?;
    let legacy = request
        .qa_legacy_shortcut_folder
        .as_deref()
        .ok_or_else(|| WriteError::new(1, "Carpeta QA antigua ausente"))?;
    for value in [folder, legacy] {
        ensure(
            !value.is_empty()
                && value.len() <= 64
                && value.as_bytes()[0].is_ascii_alphanumeric()
                && value
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b' ' || b == b'-')
                && !["Vantare", "Vantare Native Beta"]
                    .iter()
                    .any(|name| value.eq_ignore_ascii_case(name)),
            "Carpeta QA inválida",
        )?;
    }
    ensure(
        !folder.eq_ignore_ascii_case(legacy),
        "Carpetas QA repetidas",
    )?;
    disk::path(Path::new(
        request
            .qa_prefix
            .as_deref()
            .ok_or_else(|| WriteError::new(1, "Prefijo QA ausente"))?,
    ))?;
    Ok(identity)
}
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
    if !path.try_exists()? {
        return Ok(None);
    }
    let ui: Options = serde_json::from_value(disk::read_json(&path, Some(4096))?)?;
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
fn startup_preference(root: &Path) -> Result<Option<bool>> {
    let path = root.join("startup-options.json");
    if !path.try_exists()? {
        return Ok(None);
    }
    // Corrupt, oversized or wrongly typed legacy preference is absence, as PS.
    let read = || -> Result<Option<bool>> {
        let value = disk::read_json(&path, Some(1024))?;
        Ok(
            (value.as_object().is_some_and(|map| map.len() == 2) && value["schema"] == 1)
                .then(|| value["autostart"].as_bool())
                .flatten(),
        )
    };
    Ok(read().unwrap_or(None))
}

#[cfg(all(test, windows))]
mod tests {
    use super::same_path;
    use std::path::Path;

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
