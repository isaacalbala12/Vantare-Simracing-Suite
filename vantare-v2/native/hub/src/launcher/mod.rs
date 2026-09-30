//! Aplicaciones del sim-rig, independientes del supervisor core/overlays.
pub mod chain;
pub mod discovery;
mod input;
pub mod view;
#[cfg(windows)]
#[allow(unsafe_code)]
mod windows;

use crate::files;
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
pub struct Profile {
    pub id: String,
    pub name: String,
    pub favorite: bool,
    pub steps: Vec<Step>,
    pub first_step_delay: u32,
    pub continue_on_error: bool,
    pub reuse_running: bool,
    pub max_retries: u8,
}

impl Profile {
    pub fn new(id: String, name: String) -> Self {
        Self {
            id,
            name,
            favorite: false,
            steps: vec![],
            first_step_delay: 0,
            continue_on_error: false,
            reuse_running: true,
            max_retries: 0,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Document {
    pub version: u32,
    pub apps: Vec<App>,
    pub profiles: Vec<Profile>,
    pub lmu_trigger_profile: Option<String>,
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
                || profile.first_step_delay > 3600
            {
                return Err("perfil inválido: identidad, pasos, delay o reintentos".into());
            }
            for step in &profile.steps {
                if !ids.contains(&step.app_id) || step.delay_seconds > 3600 {
                    return Err("paso sin app conocida o delay mayor de una hora".into());
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

pub fn default_path() -> Result<PathBuf, String> {
    Ok(
        PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA no disponible")?)
            .join("Vantare")
            .join("native")
            .join("launcher.json"),
    )
}

impl Store {
    pub fn load(path: PathBuf) -> Result<Self, String> {
        if path.is_absolute() && !is_local_path(&path) {
            return Err("Launcher requiere un archivo de disco local".into());
        }
        let saved = match std::fs::metadata(&path) {
            Ok(_) => Some(files::read(&path, files::MAX_DOCUMENT)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(format!("inspeccionar Launcher: {error}")),
        };
        let document = saved
            .as_deref()
            .map(serde_json::from_slice::<Document>)
            .transpose()
            .map_err(|e| format!("Launcher inválido: {e}"))?
            .unwrap_or_default();
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
