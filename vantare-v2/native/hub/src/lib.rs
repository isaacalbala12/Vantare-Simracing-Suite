//! Proceso Hub de ADR 0099: edición local, sin dependencia del runtime.
#![deny(unsafe_code)] // Fronteras Win32 documentadas: launcher/windows y testing/windows (BCrypt).

pub mod analysis;
pub mod calendar;
#[cfg(feature = "parity-capture")]
pub mod capture;
pub mod comparison;
pub mod demo;
pub mod document;
// Un único contrato serde_json sin arrastrar engineer → runtime al Hub.
pub mod engineer;
#[path = "../../engineer/src/control.rs"]
pub mod engineer_control;
pub mod files;
mod inspector;
pub mod launcher;
pub mod lifecycle;
pub mod notifications;
pub mod orbit;
#[path = "../../packaging/version.rs"]
pub mod product;
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
            Self::Strategy => "Strategy",
            Self::Engineer => "Engineer / Spotter",
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
            Self::Workshop => "Widgets, escenas y paridad",
            Self::Studio => "Layout, contenido y apariencia",
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
