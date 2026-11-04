//! Proceso Hub de ADR 0099: edición local, sin dependencia del runtime.
#![deny(unsafe_code)] // Win32: launcher/windows, testing/windows (BCrypt), installation::tests (espera por handle).

pub mod analysis;
/// Identifica una generación instalada por la estructura exacta del ejecutable.
pub fn installed_generation(executable: &std::path::Path) -> Option<&std::path::Path> {
    let bin = executable.parent()?;
    let generation = bin.parent()?;
    let generations = generation.parent()?;
    let file = executable.file_name()?.to_string_lossy();
    let folder = bin.file_name()?.to_string_lossy();
    let parent = generations.file_name()?.to_string_lossy();
    let id = generation.file_name()?.to_string_lossy();
    (file.eq_ignore_ascii_case("vantare-hub.exe")
        && folder.eq_ignore_ascii_case("bin")
        && parent.eq_ignore_ascii_case("generations")
        && id.len() == 32
        && id
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)))
    .then_some(generation)
}

#[cfg(windows)]
fn verbatim_drive(value: &str) -> Option<&str> {
    let local = value.strip_prefix(r"\\?\")?;
    matches!(local.as_bytes(), [drive, b':', b'\\', ..] if drive.is_ascii_alphabetic())
        .then_some(local)
}

/// Canonicalize without passing Win32 drive-device paths to local consumers.
pub fn canonical_executable(path: &std::path::Path) -> std::io::Result<std::path::PathBuf> {
    let canonical = std::fs::canonicalize(path)?;
    #[cfg(windows)]
    {
        if let Some(local) = canonical.to_str().and_then(verbatim_drive) {
            return Ok(std::path::PathBuf::from(local));
        }
    }
    Ok(canonical)
}

#[cfg(test)]
#[test]
fn installed_generation_requires_lowercase_id() {
    let lower = std::path::Path::new(
        "root/generations/0123456789abcdef0123456789abcdef/bin/vantare-hub.exe",
    );
    let upper = std::path::Path::new(
        "root/generations/0123456789ABCDEF0123456789ABCDEF/bin/vantare-hub.exe",
    );
    assert!(installed_generation(lower).is_some());
    assert!(installed_generation(upper).is_none());
}

#[cfg(all(test, windows))]
#[test]
fn only_verbatim_drive_paths_lose_the_device_prefix() {
    assert_eq!(verbatim_drive(r"\\?\C:\Vantare"), Some(r"C:\Vantare"));
    assert_eq!(verbatim_drive(r"\\?\Volume{abcd}\Vantare"), None);
    assert_eq!(verbatim_drive(r"\\?\UNC\server\share"), None);
}

pub mod calendar;
#[cfg(feature = "parity-capture")]
pub mod capture;
pub mod comparison;
pub mod demo;
pub mod document;
// Un único contrato serde_json sin arrastrar engineer → runtime al Hub.
pub mod engineer;
pub use vantare_ipc::engineer_control;
pub use vantare_launcher::files;
mod inspector;
mod installation;
pub mod launcher;
pub mod lifecycle;
pub mod notifications;
pub mod onboarding;
pub mod orbit;
pub mod pilot;
pub use vantare_ipc::product;

/// Identidad del binario; Ajustes obtiene la instalación desde `installer::engine`.
pub(crate) fn version_label() -> &'static str {
    product::VERSION
}
pub mod roadmap;
pub mod scene;
pub mod services;
pub mod shell;
pub mod strategy;
pub mod studio;
pub mod testing;
pub mod workshop;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Section {
    #[default]
    Home,
    Workshop,
    Studio,
    Launcher,
    Calendar,
    Strategy,
    Engineer,
    Analysis,
    Testing,
    Roadmap,
    Account,
    Licenses,
    Notifications,
    Settings,
}

impl Section {
    pub const ALL: &[Self] = &[
        Self::Home,
        Self::Workshop,
        Self::Studio,
        Self::Launcher,
        Self::Calendar,
        Self::Strategy,
        Self::Engineer,
        Self::Analysis,
        Self::Testing,
        Self::Roadmap,
        Self::Account,
        Self::Licenses,
        Self::Notifications,
        Self::Settings,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::Home => "Inicio",
            Self::Workshop => "Workshop",
            Self::Studio => "Overlay Studio",
            Self::Launcher => "Launcher",
            Self::Calendar => "Calendario",
            Self::Strategy => "Estrategia",
            Self::Engineer => "Ingeniero",
            Self::Analysis => "Telemetría / Análisis",
            Self::Testing => "Testing Center",
            Self::Roadmap => "Roadmap",
            Self::Account => "Cuenta",
            Self::Licenses => "Licencias",
            Self::Notifications => "Notificaciones",
            Self::Settings => "Ajustes",
        }
    }

    /// Subtítulo de la entrada de navegación (columna de contexto Orbit).
    pub fn subtitle(self) -> &'static str {
        match self {
            Self::Home => "Resumen y próximas carreras",
            Self::Workshop => "Widgets y escenas",
            Self::Studio => "Diseño, contenido y apariencia",
            Self::Launcher => "Aplicaciones y cadena de arranque",
            Self::Calendar => "Series, sesiones y recordatorios",
            Self::Strategy => "Planes, variantes y paradas",
            Self::Engineer => "Radio, voz y Spotter",
            Self::Analysis => "Sesiones grabadas y vueltas",
            Self::Testing => "Diagnóstico y reportes",
            Self::Roadmap => "Lo que viene",
            Self::Account => "Sesión, plan y dispositivos",
            Self::Licenses => "Plan y derechos",
            Self::Notifications => "Avisos del Hub",
            Self::Settings => "Interfaz y preferencias",
        }
    }
}

#[cfg(test)]
// Calloop reinicia stop al entrar en run(): el cierre del harness debe
// ejecutarse desde el bucle, no dentro del callback inicial de lanzamiento.
fn quit_headless_test(cx: &mut gpui::App) {
    cx.spawn(async |cx| {
        cx.update(|cx| cx.quit());
    })
    .detach();
}

mod session_alerts;
