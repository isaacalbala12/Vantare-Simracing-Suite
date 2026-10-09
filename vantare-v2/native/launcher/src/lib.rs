//! Motor compartido sin GPUI; Hub y supervisor dependen de este crate.
#![deny(unsafe_code)]

pub mod chain;
pub mod discovery;
pub mod migration;
pub mod policy;
pub mod processes;
#[cfg(windows)]
pub(crate) mod shortcuts;
pub mod triggers;
#[cfg(windows)]
#[allow(unsafe_code)] // Frontera Win32 documentada, igual que antes de compartir el motor.
pub(crate) mod windows;

pub mod files;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct App {
    pub id: String,
    pub name: String,
    pub executable: Option<PathBuf>,
    pub args: Vec<String>,
    pub favorite: bool,
}

pub struct CatalogApp {
    pub id: &'static str,
    pub name: &'static str,
    pub category: &'static str,
    pub executables: &'static [&'static str],
    pub matchers: &'static [&'static str],
    pub paths: &'static [&'static str],
    pub steam_id: Option<u32>,
}

// Mismos IDs, ejecutables y Steam AppID que internal/app/launcher/catalog.go.
pub const CATALOG: &[CatalogApp] = &[
    CatalogApp {
        id: "lmu",
        name: "Le Mans Ultimate",
        category: "Simulador",
        executables: &["Le Mans Ultimate.exe", "LMU.exe"],
        matchers: &["le mans ultimate"],
        paths: &[],
        steam_id: Some(2_399_420),
    },
    CatalogApp {
        id: "obs",
        name: "OBS Studio",
        category: "Streaming",
        executables: &["obs64.exe", "obs32.exe"],
        matchers: &["obs studio"],
        paths: &[
            r"%PROGRAMFILES%\obs-studio\bin\64bit",
            r"%PROGRAMFILES(X86)%\obs-studio\bin\64bit",
        ],
        steam_id: None,
    },
    CatalogApp {
        id: "crewchief",
        name: "CrewChief",
        category: "Utilidad",
        executables: &["CrewChiefV4.exe", "CrewChief.exe"],
        matchers: &["crewchief", "crew chief"],
        paths: &[r"%LOCALAPPDATA%\CrewChief"],
        steam_id: None,
    },
    CatalogApp {
        id: "discord",
        name: "Discord",
        category: "Utilidad",
        executables: &["Discord.exe", "Update.exe"],
        matchers: &["discord"],
        paths: &[r"%LOCALAPPDATA%\Discord", r"%PROGRAMFILES%\Discord"],
        steam_id: None,
    },
    CatalogApp {
        id: "spotify",
        name: "Spotify",
        category: "Audio",
        executables: &["Spotify.exe"],
        matchers: &["spotify"],
        paths: &[r"%APPDATA%\Spotify", r"%LOCALAPPDATA%\Spotify"],
        steam_id: None,
    },
    CatalogApp {
        id: "motec",
        name: "MoTeC",
        category: "Telemetría",
        executables: &["app.exe", "i2.exe", "MoTeC.exe"],
        matchers: &["motec"],
        paths: &[r"%PROGRAMFILES%\MoTeC", r"%PROGRAMFILES(X86)%\MoTeC"],
        steam_id: None,
    },
    CatalogApp {
        id: "simhub",
        name: "SimHub",
        category: "Telemetría",
        executables: &["SimHubWPF.exe", "SimHub.exe"],
        matchers: &["simhub"],
        paths: &[
            r"%PROGRAMFILES%\SimHub",
            r"%PROGRAMFILES(X86)%\SimHub",
            r"%LOCALAPPDATA%\SimHub",
        ],
        steam_id: None,
    },
];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Step {
    pub app_id: String,
    pub delay_seconds: u32,
    pub args_override: Option<Vec<String>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)] // Preferencias independientes y compatibilidad de los dos flags v1.
pub struct Profile {
    #[serde(default)]
    pub imported: bool,
    pub id: String,
    pub name: String,
    pub favorite: bool,
    pub steps: Vec<Step>,
    pub first_step_delay: u32,
    pub continue_on_error: bool,
    pub reuse_running: bool,
    pub max_retries: u8,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub advanced: bool,
    #[serde(default)]
    pub hotkey: String,
    #[serde(default)]
    pub launch_on_windows_startup: bool,
    #[serde(default)]
    pub launch_count: u64,
    #[serde(default)]
    pub last_launched_at: Option<String>,
    #[serde(default)]
    pub avg_chain_duration_ms: u64,
    #[serde(default)]
    pub policy: Option<policy::Policy>,
}

impl Profile {
    pub fn new(id: String, name: String) -> Self {
        Self {
            imported: false,
            id,
            name,
            favorite: false,
            steps: vec![],
            first_step_delay: 0,
            continue_on_error: false,
            reuse_running: true,
            max_retries: 0,
            description: String::new(),
            notes: String::new(),
            advanced: false,
            hotkey: String::new(),
            launch_on_windows_startup: false,
            launch_count: 0,
            last_launched_at: None,
            avg_chain_duration_ms: 0,
            policy: None,
        }
    }
}

impl Profile {
    #[must_use]
    pub fn duplicate(&self, id: String) -> Self {
        let mut profile = self.clone();
        profile.id = id;
        profile.name = format!("{} (copia)", self.name);
        profile.favorite = false;
        profile.hotkey.clear();
        profile.launch_on_windows_startup = false;
        profile.launch_count = 0;
        profile.last_launched_at = None;
        profile.avg_chain_duration_ms = 0;
        profile
    }
    pub fn validate_editor(&self, discovered: &discovery::Discovery) -> Result<(), String> {
        if !valid_text(&self.name) {
            return Err("Nombre: indica entre 1 y 256 caracteres sin NUL".into());
        }
        if self.steps.is_empty() {
            return Err("Pasos: anade al menos una aplicacion".into());
        }
        let mut apps = HashSet::new();
        for (index, step) in self.steps.iter().enumerate() {
            if !self.advanced && !apps.insert(&step.app_id) {
                return Err(format!(
                    "Paso {}: las apps repetidas requieren modo avanzado",
                    index + 1
                ));
            }
            if !discovered
                .app(&step.app_id)
                .is_some_and(|app| app.availability.launchable)
            {
                return Err(format!("Paso {}: selecciona una app disponible", index + 1));
            }
        }
        if self.description.len() > 8192
            || self.notes.len() > 32768
            || self.description.contains('\0')
            || self.notes.contains('\0')
        {
            return Err("Descripcion o notas demasiado largas o con NUL".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Document {
    pub version: u32,
    pub apps: Vec<App>,
    pub profiles: Vec<Profile>,
    pub lmu_trigger_profile: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wails_import: Option<migration::Import>,
}

impl Default for Document {
    fn default() -> Self {
        Self {
            version: 1,
            apps: CATALOG
                .iter()
                .map(|app| App {
                    id: app.id.into(),
                    name: app.name.into(),
                    executable: None,
                    args: vec![],
                    favorite: false,
                })
                .collect(),
            profiles: vec![],
            lmu_trigger_profile: None,
            wails_import: None,
        }
    }
}

fn valid_text(text: &str) -> bool {
    !text.trim().is_empty() && text.len() <= 256 && !text.contains('\0')
}

pub fn validate_args(args: &[String]) -> Result<(), String> {
    if args.len() > 128
        || args
            .iter()
            .any(|arg| arg.len() > 8192 || arg.contains('\0'))
    {
        return Err("argumentos demasiado largos o con NUL".into());
    }
    Ok(())
}

impl Document {
    pub fn fresh_install() -> Self {
        let mut document = Self::default();
        for (id, name, apps) in [
            ("creator", "Creator", &["lmu", "obs", "spotify"][..]),
            ("pro", "Pro", &["lmu", "crewchief", "spotify", "motec"][..]),
        ] {
            let mut profile = Profile::new(id.into(), name.into());
            profile.policy = Some(policy::Policy::default());
            profile.steps = apps
                .iter()
                .enumerate()
                .map(|(index, app)| Step {
                    app_id: (*app).into(),
                    delay_seconds: if index == 0 { 0 } else { 2 },
                    args_override: None,
                })
                .collect();
            document.profiles.push(profile);
        }
        document
    }
    pub fn remove_profile(&mut self, id: &str) -> Result<(), String> {
        let index = self
            .profiles
            .iter()
            .position(|p| p.id == id)
            .ok_or("perfil inexistente")?;
        self.profiles.remove(index);
        if self.lmu_trigger_profile.as_deref() == Some(id) {
            self.lmu_trigger_profile = None;
        }
        Ok(())
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.version != 1 || self.apps.len() > 256 || self.profiles.len() > 128 {
            return Err("versión o tamaño de Launcher no admitidos".into());
        }
        let mut ids = HashSet::new();
        for app in &self.apps {
            if !valid_text(&app.id) || !valid_text(&app.name) || !ids.insert(&app.id) {
                return Err("app vacía o duplicada".into());
            }
            if !CATALOG.iter().any(|item| item.id == app.id)
                && (!app.id.starts_with("custom:") || app.executable.is_none())
            {
                return Err("una app manual requiere ID custom y ruta de ejecutable".into());
            }
            if let Some(path) = &app.executable
                && (!is_local_path(path) || path.as_os_str().to_string_lossy().contains('\0'))
            {
                return Err(
                    "el ejecutable debe ser una ruta absoluta de disco local sin NUL".into(),
                );
            }
            validate_args(&app.args)?;
        }
        if CATALOG
            .iter()
            .any(|app| !ids.iter().any(|id| id.as_str() == app.id))
        {
            return Err("faltan apps oficiales".into());
        }
        let mut profiles = HashSet::new();
        for profile in &self.profiles {
            if !valid_text(&profile.id)
                || !valid_text(&profile.name)
                || !profiles.insert(&profile.id)
                || profile.steps.len() > 128
                || profile.max_retries > 3
                || profile.effective_policy().max_retries > 3
            {
                return Err("perfil inválido: identidad, pasos, delay o reintentos".into());
            }
            for step in &profile.steps {
                if !ids.contains(&step.app_id) {
                    return Err("paso sin app conocida".into());
                }
                if let Some(args) = &step.args_override {
                    validate_args(args)?;
                }
            }
        }
        if let Some(id) = &self.lmu_trigger_profile
            && !profiles.contains(id)
        {
            return Err("trigger LMU sin perfil".into());
        }
        Ok(())
    }

    pub fn add_app(&mut self, name: String, executable: PathBuf) -> Result<String, String> {
        if !valid_text(&name) || !is_executable(&executable) {
            return Err("indica nombre y ejecutable existente con ruta absoluta".into());
        }
        if self
            .apps
            .iter()
            .any(|app| app.executable.as_ref() == Some(&executable))
        {
            return Err("esa ruta ya está en el catálogo".into());
        }
        let id = (1..=257)
            .map(|n| format!("custom:{n}"))
            .find(|id| !self.apps.iter().any(|app| &app.id == id))
            .ok_or("catálogo lleno")?;
        self.apps.push(App {
            id: id.clone(),
            name,
            executable: Some(executable),
            args: vec![],
            favorite: false,
        });
        Ok(id)
    }

    pub fn remove_app(&mut self, id: &str) -> Result<(), String> {
        if !id.starts_with("custom:")
            || self
                .profiles
                .iter()
                .any(|p| p.steps.iter().any(|s| s.app_id == id))
        {
            return Err("solo se eliminan apps manuales sin pasos que las referencien".into());
        }
        let index = self
            .apps
            .iter()
            .position(|app| app.id == id)
            .ok_or("app inexistente")?;
        self.apps.remove(index);
        Ok(())
    }
}

pub struct Store {
    pub document: Document,
    pub path: PathBuf,
    saved: Option<Vec<u8>>,
}

impl Store {
    /// Documento de demostración en memoria, sin leer ni escribir archivos.
    pub fn in_memory(path: PathBuf, document: Document) -> Result<Self, String> {
        document.validate()?;
        Ok(Self {
            document,
            path,
            saved: None,
        })
    }

    /// Importar solo al crear el store productivo, nunca al cargar fixtures/QA.
    pub fn load_production(path: PathBuf) -> Result<Self, String> {
        if path
            .try_exists()
            .map_err(|e| format!("inspeccionar Launcher: {e}"))?
        {
            return Self::load(path);
        }
        // La beta mantiene datos propios; importar Wails requiere una acción explícita.
        if std::env::var_os("VANTARE_BETA_ROOT").is_some() {
            return Self::load_with_wails(path, None);
        }
        let source = migration::source()?;
        Self::load_with_wails(path, source.as_deref())
    }

    pub fn load_with_wails(path: PathBuf, source: Option<&Path>) -> Result<Self, String> {
        let mut store = Self::load(path)?;
        if store.saved.is_none() {
            let document = match source {
                Some(source) => migration::read(source)?,
                None => Document::fresh_install(),
            };
            store.replace(document)?;
        }
        Ok(store)
    }

    pub fn load(path: PathBuf) -> Result<Self, String> {
        if path.is_absolute() && !is_local_path(&path) {
            return Err("Launcher requiere un archivo de disco local".into());
        }
        let saved = match std::fs::metadata(&path) {
            Ok(_) => Some(files::read(&path, files::MAX_DOCUMENT)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(format!("inspeccionar Launcher: {error}")),
        };
        let mut document = saved
            .as_deref()
            .map(serde_json::from_slice::<Document>)
            .transpose()
            .map_err(|e| format!("Launcher inválido: {e}"))?
            .unwrap_or_default();
        // Conserva el origen al editar o duplicar perfiles importados por versiones anteriores.
        if let Some(imported) = document
            .wails_import
            .as_ref()
            .and_then(|import| import.launcher.get("launcherProfiles"))
            .and_then(serde_json::Value::as_array)
        {
            for profile in &mut document.profiles {
                profile.imported |= imported
                    .iter()
                    .any(|old| old["id"].as_str() == Some(profile.id.as_str()));
            }
        }
        document.validate()?;
        Ok(Self {
            document,
            path,
            saved,
        })
    }

    /// Confirmar en memoria solo después de escritura, sync y reemplazo atómicos.
    pub fn replace(&mut self, document: Document) -> Result<(), String> {
        document.validate()?;
        let bytes = serde_json::to_vec_pretty(&document)
            .map_err(|e| format!("serializar Launcher: {e}"))?;
        files::save(&self.path, &bytes, self.saved.as_deref())?;
        self.document = document;
        self.saved = Some(bytes);
        Ok(())
    }
}

pub fn is_executable(path: &Path) -> bool {
    is_local_path(path) && path.is_file()
}

/// Confianza del destino de un `.lnk` compartido; los del usuario se confían.
///
/// Un acceso directo en `%PUBLIC%\Desktop` o en el Start Menu de sistema lo
/// puede plantar cualquier usuario local, así que su `TargetPath` solo prueba
/// que existe un fichero: el destino tiene que estar además donde ese otro
/// usuario no pueda escribirlo. En Windows son las raíces administradas
/// (`%ProgramFiles%`, `%ProgramFiles(x86)%`, `%ProgramW6432%`) y el perfil del
/// propio usuario (`%LOCALAPPDATA%`, `%APPDATA%`, `%USERPROFILE%`). Fuera de
/// Windows no hay `.lnk` que leer: se exige que ni el binario ni sus carpetas
/// sean escribibles por grupo u otros.
///
/// Límite conocido: no valida firma Authenticode ni el contenido del binario, y
/// una instalación fuera de esas raíces no se detecta mediante un enlace compartido.
/// Los enlaces del propio usuario, el registro y las rutas de catálogo la cubren.
pub fn is_trusted_install_path(path: &Path) -> bool {
    if !is_local_path(path) {
        return false;
    }
    #[cfg(windows)]
    {
        let Ok(real) = std::fs::canonicalize(path) else {
            return false;
        };
        [
            "ProgramFiles",
            "ProgramFiles(x86)",
            "ProgramW6432",
            "LOCALAPPDATA",
            "APPDATA",
            "USERPROFILE",
        ]
        .into_iter()
        .filter_map(std::env::var_os)
        .filter_map(|root| std::fs::canonicalize(Path::new(&root)).ok())
        .any(|root| under_ascii_case(&real, &root))
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fn private(path: &Path) -> bool {
            std::fs::metadata(path).is_ok_and(|meta| meta.permissions().mode() & 0o022 == 0)
        }
        // Canonicalizar primero: un enlace simbólico no debe saltarse el control.
        let Ok(real) = std::fs::canonicalize(path) else {
            return false;
        };
        std::iter::successors(Some(real.as_path()), |current| current.parent())
            .take(64)
            .all(private)
    }
    #[cfg(not(any(windows, unix)))]
    {
        true
    }
}

/// Prefijo por componentes: `C:\Users\Bob` no contiene a `C:\Users\Bobby`, y en
/// Windows la comparación de rutas del sistema no distingue mayúsculas.
#[cfg(windows)]
fn under_ascii_case(path: &Path, root: &Path) -> bool {
    let mut parts = path.components();
    root.components().all(|want| {
        parts
            .next()
            .is_some_and(|part| part.as_os_str().eq_ignore_ascii_case(want.as_os_str()))
    })
}

pub fn is_local_path(path: &Path) -> bool {
    if !path.is_absolute() {
        return false;
    }
    #[cfg(windows)]
    {
        use std::path::{Component, Prefix};
        matches!(path.components().next(), Some(Component::Prefix(prefix)) if matches!(prefix.kind(), Prefix::Disk(_) | Prefix::VerbatimDisk(_)))
    }
    #[cfg(not(windows))]
    {
        true
    }
}

#[derive(Default)]
pub struct LmuTrigger {
    was_open: bool,
}
impl LmuTrigger {
    pub fn observe(&mut self, enabled: bool, open: bool) -> bool {
        let launch = enabled && open && !self.was_open;
        self.was_open = enabled && open;
        launch
    }
}

#[cfg(test)]
mod tests;
