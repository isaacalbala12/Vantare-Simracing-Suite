//! Explicit OS context. QA never falls back to real HKCU or shell folders.
use super::{
    Installation, Request, installation,
    product::{self, Product},
    validation,
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
    /// Producto cuyos nombres de Windows usa este contexto (#2812). Nunca hay
    /// uno por defecto: quien lo crea lo ata al canal del paquete o de la instalación.
    #[serde(skip)]
    product: Option<&'static Product>,
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
            product: None,
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
            product: None,
        })
    }
    /// Ata el contexto al producto de un canal. Un contexto ya atado a otro
    /// canal se rechaza: un producto nunca actúa con los nombres de otro.
    pub fn for_channel(mut self, channel: &str) -> Result<Self> {
        let product = product::for_channel(channel)
            .ok_or_else(|| WriteError::new(1, "Canal sin producto de instalación"))?;
        ensure(
            self.product.is_none_or(|bound| bound == product),
            "Canal de instalación incompatible",
        )?;
        self.product = Some(product);
        Ok(self)
    }
    pub fn product(&self) -> Result<&'static Product> {
        self.product
            .ok_or_else(|| WriteError::new(1, "Contexto sin producto de instalación"))
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
        self.registry(self.product()?.uninstall_key, "InstallLocation")
    }
    pub fn has_registration(&self) -> Result<bool> {
        self.validate_context()?;
        Ok(super::windows::registry_exists(
            &self.registry_prefix,
            self.product()?.uninstall_key,
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
        let product = self.product()?;
        let mut root = registered
            .as_ref()
            .map(PathBuf::from)
            .or_else(|| explicit.cloned())
            .unwrap_or_else(|| product::default_root(&self.local_app_data, product));
        if registered.is_none() && explicit.is_none() && !request.qa && !request.uninstall {
            root = self.legacy_root(product)?.unwrap_or(root);
        }
        root = disk::path(&root)?;
        self.validate_root(&root)?;
        Ok(root)
    }
    /// Raíz anterior al Setup GPUI con una instalación o datos dentro. Solo beta
    /// existió entonces: ningún otro producto la adopta.
    fn legacy_root(&self, product: &Product) -> Result<Option<PathBuf>> {
        if !product.legacy {
            return Ok(None);
        }
        let old = self.local_app_data.join("Programs/Vantare Native Beta");
        let used =
            old.join("state.json").try_exists()? || old.join("retained-data.json").try_exists()?;
        Ok(used.then_some(old))
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
            let channel = self.product()?.channel;
            if view
                .manifest
                .as_ref()
                .is_some_and(|manifest| manifest.channel != channel)
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
    let accepted = below_prefix(&path, prefix)
        || ci_prefix(
            |name| std::env::var_os(name),
            super::windows::real_user_folders,
        )
        .is_some_and(|prefix| below_prefix(&path, &prefix));
    ensure(accepted, "Guard QA rechazó la ruta")
}
/// Temporal de un runner alojado por GitHub (#2794). Una variable de entorno no es una
/// frontera frente a quien lanza el proceso: esto evita accidentes, y la raíz de CI nunca
/// puede contener ni caer dentro de las carpetas reales de Windows, leídas por API.
fn ci_prefix(
    env: impl Fn(&str) -> Option<std::ffi::OsString>,
    real_folders: impl FnOnce() -> Result<Vec<PathBuf>>,
) -> Option<PathBuf> {
    let is =
        |name: &str, value: &str| env(name).is_some_and(|actual| actual.to_str() == Some(value));
    if !(is("CI", "true")
        && is("GITHUB_ACTIONS", "true")
        && is("RUNNER_ENVIRONMENT", "github-hosted"))
    {
        return None;
    }
    let prefix = PathBuf::from(env("RUNNER_TEMP")?);
    let relative = prefix.components().any(|part| {
        matches!(
            part,
            std::path::Component::ParentDir | std::path::Component::CurDir
        )
    });
    if !prefix.is_absolute() || relative {
        return None;
    }
    // Volumen local y nunca la raíz de una unidad.
    let prefix = disk::path(&prefix).ok()?;
    // Comparación en forma canónica en los dos lados (nombres largos en vez de 8.3,
    // unidades `subst` y enlaces resueltos): el texto solo se saltaría `RUNNER~1`.
    // Lo que no se pueda canonicalizar deja sin rama de CI.
    let own = canonical(&prefix)?;
    for real in real_folders().ok()? {
        let real = canonical(&real)?;
        if own == real
            || own.starts_with(&format!("{real}/"))
            || real.starts_with(&format!("{own}/"))
        {
            return None;
        }
    }
    Some(prefix)
}
fn canonical(path: &Path) -> Option<String> {
    let full = std::fs::canonicalize(path).ok()?;
    Some(
        full.to_string_lossy()
            .replace('\\', "/")
            .trim_end_matches('/')
            .to_lowercase(),
    )
}
fn below_prefix(path: &Path, prefix: &Path) -> bool {
    !prefix.as_os_str().is_empty() && path != prefix && path.starts_with(prefix)
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
    use super::{WriteError, below_prefix, canonical, ci_prefix, disk, same_path};
    use std::path::{Path, PathBuf};

    fn hosted(
        temp: &Path,
        overrides: &[(&str, Option<&str>)],
    ) -> impl Fn(&str) -> Option<std::ffi::OsString> {
        let mut values: Vec<(String, Option<String>)> = [
            ("CI", "true"),
            ("GITHUB_ACTIONS", "true"),
            ("RUNNER_ENVIRONMENT", "github-hosted"),
        ]
        .iter()
        .map(|(name, value)| (name.to_string(), Some(value.to_string())))
        .collect();
        values.push((
            "RUNNER_TEMP".into(),
            Some(temp.to_string_lossy().into_owned()),
        ));
        for (name, value) in overrides {
            values.retain(|(known, _)| known.as_str() != *name);
            values.push((name.to_string(), value.map(str::to_string)));
        }
        move |name| {
            values
                .iter()
                .find(|(known, _)| known.as_str() == name)
                .and_then(|(_, value)| value.clone().map(Into::into))
        }
    }
    /// Disposición de un runner con carpetas que existen de verdad (canonicalizar lo exige):
    /// un perfil con sus carpetas, un temporal fuera y un hermano de nombre parecido.
    struct Tree(PathBuf);
    impl Tree {
        /// `None` (y lo dice) fuera de la CI si no existe la raíz QA del servidor.
        fn new() -> Option<Self> {
            let parent = if std::env::var("CI").as_deref() == Ok("true") {
                PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI root"))
            } else {
                if !Path::new("D:/VantareServer/qa").is_dir() {
                    eprintln!(
                        "omitido: no existe la raíz QA D:/VantareServer/qa; este test solo corre en el servidor o en CI"
                    );
                    return None;
                }
                PathBuf::from("D:/VantareServer/qa/isa-2794")
            };
            let tree = Self(parent.join(disk::id().expect("ID")));
            for directory in [
                "Users/runneradmin/AppData/Local/Temp",
                "Users/runneradmin/Desktop/qa",
                "Users/runneradmin/Start Menu/Programs/Startup",
                "Users/runneradmin2/_temp",
                "a/_temp",
            ] {
                std::fs::create_dir_all(tree.0.join(directory)).expect("tree");
            }
            Some(tree)
        }
        fn at(&self, relative: &str) -> PathBuf {
            self.0.join(relative)
        }
        fn folders(&self) -> Vec<PathBuf> {
            [
                "Users/runneradmin",
                "Users/runneradmin/AppData/Local",
                "Users/runneradmin/Start Menu/Programs",
                "Users/runneradmin/Desktop",
                "Users/runneradmin/Start Menu/Programs/Startup",
            ]
            .map(|relative| self.at(relative))
            .to_vec()
        }
    }
    impl Drop for Tree {
        fn drop(&mut self) {
            if !std::thread::panicking() {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
    }

    #[test]
    fn github_hosted_temporary_root_is_the_only_ci_prefix() {
        let Some(tree) = Tree::new() else { return };
        let folders = || Ok(tree.folders());
        for temp in ["a/_temp", "Users/runneradmin2/_temp"] {
            let temp = tree.at(temp);
            assert_eq!(
                ci_prefix(hosted(&temp, &[]), folders),
                Some(temp.clone()),
                "{temp:?}"
            );
        }
        let temp = tree.at("a/_temp");
        for missing in [
            ("CI", None),
            ("CI", Some("1")),
            ("GITHUB_ACTIONS", None),
            ("GITHUB_ACTIONS", Some("false")),
            ("RUNNER_ENVIRONMENT", None),
            ("RUNNER_ENVIRONMENT", Some("self-hosted")),
            ("RUNNER_TEMP", None),
        ] {
            assert_eq!(
                ci_prefix(hosted(&temp, &[missing]), folders),
                None,
                "{missing:?}"
            );
        }
    }

    #[test]
    fn ci_prefix_never_reaches_real_user_folders_or_a_drive_root() {
        let Some(tree) = Tree::new() else { return };
        let folders = || Ok(tree.folders());
        let profile = tree.at("Users/runneradmin");
        let mut rejected = vec![
            PathBuf::from("a\\_temp"),
            PathBuf::from(format!("{}\\..\\_temp", tree.at("a").display())),
            PathBuf::from("D:\\"),
            PathBuf::from("C:\\"),
            tree.at("Users"),
            PathBuf::from(format!(
                "{}\\",
                profile.display().to_string().to_uppercase()
            )),
            tree.at("Users/runneradmin/AppData/Local/Temp"),
            tree.at("Users/runneradmin/Desktop/qa"),
            // No existe: sin forma canónica no hay rama de CI.
            tree.at("a/no-existe"),
        ];
        rejected.extend(tree.folders());
        for temp in rejected {
            assert_eq!(ci_prefix(hosted(&temp, &[]), folders), None, "{temp:?}");
        }
        // Fallo cerrado: sin API de carpetas o con una carpeta real que no se puede
        // canonicalizar, se rechaza; un error nunca equivale a aceptar.
        let temp = tree.at("a/_temp");
        assert_eq!(
            ci_prefix(hosted(&temp, &[]), || Err(WriteError::new(1, "sin API"))),
            None
        );
        let mut missing = tree.folders();
        missing.push(tree.at("Users/runneradmin/no-existe"));
        assert_eq!(ci_prefix(hosted(&temp, &[]), || Ok(missing)), None);
    }

    /// Perfil real (USERPROFILE): los scripts de CI cambian LOCALAPPDATA, APPDATA, TEMP y
    /// TMP, pero no el perfil.
    fn real_profile() -> PathBuf {
        PathBuf::from(std::env::var_os("USERPROFILE").expect("USERPROFILE"))
    }

    #[test]
    fn short_names_cannot_hide_the_real_profile() {
        // Alias construido a propósito: en windows-latest el perfil tiene nombre corto
        // (C:\Users\RUNNER~1), que como texto no se parece al largo.
        let profile = real_profile();
        let short = match super::super::windows::short_path(&profile) {
            Ok(short) if short != profile => short,
            other => {
                // En CI el caso tiene que ejercitarse; fuera, se dice y no se da por probado.
                assert!(
                    std::env::var("CI").as_deref() != Ok("true"),
                    "Windows no dio nombre corto del perfil en CI: {other:?}"
                );
                eprintln!("omitido: el volumen no da nombre corto del perfil ({other:?})");
                return;
            }
        };
        assert_ne!(
            short.to_string_lossy().to_lowercase(),
            profile.to_string_lossy().to_lowercase()
        );
        assert_eq!(
            ci_prefix(
                hosted(&short, &[]),
                super::super::windows::real_user_folders
            ),
            None,
            "{short:?}"
        );
    }

    #[test]
    fn production_folder_list_covers_the_real_profile() {
        let folders = super::super::windows::real_user_folders().expect("Windows known folders");
        assert_eq!(folders.len(), 5, "{folders:?}");
        let listed: Vec<_> = folders
            .iter()
            .map(|folder| canonical(folder).expect("canonical"))
            .collect();
        // El entorno solo es un oráculo independiente: el guard pregunta a Windows.
        let home = canonical(&real_profile()).expect("profile");
        assert_eq!(listed[0], home, "{listed:?}");
        for folder in &listed[1..] {
            assert!(folder.starts_with(&format!("{home}/")), "{folder}");
        }
    }

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

#[cfg(test)]
mod legacy_root_tests {
    use super::*;

    #[test]
    fn only_beta_adopts_the_root_of_the_old_beta_installer() {
        let parent = if std::env::var("CI").as_deref() == Ok("true") {
            PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI root"))
        } else {
            PathBuf::from("D:/VantareServer/qa/isa-1840")
        };
        let id = disk::id().expect("ID");
        let qa = parent.join("p2812-legacy-root").join(&id);
        qa_path(&qa).expect("QA guard");
        let old = qa.join("LocalAppData/Programs/Vantare Native Beta");
        std::fs::create_dir_all(&old).expect("old root");
        std::fs::write(old.join("state.json"), b"{}").expect("old installation");
        let context = |channel| {
            Context::isolated(
                qa.join("LocalAppData"),
                format!("Software\\VantareInstallerMatrix\\{id}"),
                qa.join("shell"),
            )
            .and_then(|context| context.for_channel(channel))
            .expect("isolated context")
        };
        let beta = context("beta");
        assert_eq!(
            beta.legacy_root(beta.product().unwrap()).unwrap(),
            Some(old.clone())
        );
        let nightly = context("nightly");
        assert_eq!(
            nightly.legacy_root(nightly.product().unwrap()).unwrap(),
            None
        );
        std::fs::remove_dir_all(qa).expect("owned QA tree");
    }
}
