//! Persisted shapes copied from frozen Hub general.rs and orbit/theme.rs.
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Palette {
    /// Grafito con rojo oficial; tema predeterminado desde el feedback 7.
    #[default]
    Vantare,
    /// Carmín intenso de la ronda 9; antes se llamaba «Vantare».
    Classic,
    /// Grises neutros con acento azul (R10.1).
    DeepSeek,
    Rose,
    Grove,
    Ocean,
    Ember,
    Iris,
    Mono,
}

impl Palette {
    /// Orden de Ajustes › Apariencia (R10.1).
    pub const ALL: [Self; 9] = [
        Self::Vantare,
        Self::Classic,
        Self::DeepSeek,
        Self::Rose,
        Self::Grove,
        Self::Ocean,
        Self::Ember,
        Self::Iris,
        Self::Mono,
    ];
    pub fn label(self) -> &'static str {
        match self {
            Self::Vantare => "Vantare",
            Self::Classic => "Vantare clásico",
            Self::DeepSeek => "DeepSeek",
            Self::Rose => "Rose",
            Self::Grove => "Grove",
            Self::Ocean => "Ocean",
            Self::Ember => "Ember",
            Self::Iris => "Iris",
            Self::Mono => "Mono",
        }
    }
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Scheme {
    System,
    Light,
    #[default]
    Dark,
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum InterfaceFont {
    #[default]
    Inter,
    Segoe,
    Arial,
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MonoFont {
    #[default]
    Cascadia,
    Consolas,
    Courier,
}

/// Preferencias persistibles. Oscuro mantiene el aspecto inicial del Hub nativo.
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppearanceSettings {
    pub palette: Palette,
    pub scheme: Scheme,
    pub contrast: u8,
    pub glass_opacity: u8,
    pub interface_font: InterfaceFont,
    pub mono_font: MonoFont,
    pub reduced_motion: bool,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            palette: Palette::Vantare,
            scheme: Scheme::Dark,
            contrast: 100,
            glass_opacity: 80,
            interface_font: InterfaceFont::Inter,
            mono_font: MonoFont::Cascadia,
            reduced_motion: false,
        }
    }
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Density {
    Compact,
    #[default]
    Balanced,
    Comfortable,
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct Preferences {
    pub onboarding_completed: bool,
    pub density: Density,
    #[serde(skip)]
    pub startup: bool,
    pub minimized: bool,
    pub updates: bool,
    pub launcher: bool,
    pub toasts: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            // Los JSON anteriores al onboarding pertenecen a instalaciones existentes.
            onboarding_completed: true,
            density: Density::Balanced,
            startup: false,
            minimized: false,
            updates: true,
            launcher: true,
            toasts: false,
        }
    }
}

pub const ZOOM_LEVELS: [u16; 4] = [90, 100, 110, 125];
pub const DEFAULT_ZOOM: u16 = 100;
pub const CONTRAST_MIN: u8 = 80;
pub const CONTRAST_MAX: u8 = 120;
pub const GLASS_OPACITY_MIN: u8 = 50;
pub const GLASS_OPACITY_MAX: u8 = 100;
