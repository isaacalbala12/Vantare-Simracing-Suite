//! Tokens compartidos por Hub y Workshop; los JSON son su fuente unica.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::SystemTime;
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Design {
    #[default]
    GrafitoCarmin,
    DeepseekHarness,
    NocheLeMans,
    PiedraCalida,
}
impl Design {
    pub const ALL: [Self; 4] = [
        Self::GrafitoCarmin,
        Self::DeepseekHarness,
        Self::NocheLeMans,
        Self::PiedraCalida,
    ];
    pub fn file(self) -> &'static str {
        match self {
            Self::GrafitoCarmin => "grafito-carmin.json",
            Self::DeepseekHarness => "deepseek-harness.json",
            Self::NocheLeMans => "noche-le-mans.json",
            Self::PiedraCalida => "piedra-calida.json",
        }
    }
    pub fn compiled(self) -> Result<Tokens, String> {
        Tokens::from_json(match self {
            Self::GrafitoCarmin => include_str!("../themes/grafito-carmin.json"),
            Self::DeepseekHarness => include_str!("../themes/deepseek-harness.json"),
            Self::NocheLeMans => include_str!("../themes/noche-le-mans.json"),
            Self::PiedraCalida => include_str!("../themes/piedra-calida.json"),
        })
    }
}
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Tokens {
    pub name: String,
    pub colors: Colors,
    pub geometry: Geometry,
    pub fonts: Fonts,
    pub shadow: Shadow,
    pub gradients: Gradients,
}
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Colors {
    pub window: u32,
    pub base: u32,
    pub sidebar: u32,
    pub l1: u32,
    pub l2: u32,
    pub l3: u32,
    pub elevated: u32,
    pub neo_top: u32,
    pub neo_bottom: u32,
    pub text: u32,
    pub text2: u32,
    pub text3: u32,
    pub caption: u32,
    pub on_primary: u32,
    pub accent: u32,
    pub accent_bright: u32,
    pub accent_dark: u32,
    pub wine: u32,
    pub ok: u32,
    pub warn: u32,
    pub error: u32,
    pub line: u32,
    pub line2: u32,
    pub line3: u32,
}
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Geometry {
    pub sidebar: f32,
    pub sidebar_collapsed: f32,
    pub gap: f32,
    pub gutter: f32,
    pub radius: f32,
    pub control_radius: f32,
    pub control_height: f32,
    pub topbar: f32,
    pub columns: u8,
}
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Fonts {
    pub body: String,
    pub display: String,
    pub mono: String,
    pub body_size: f32,
    pub small_size: f32,
    pub title_size: f32,
}
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Shadow {
    pub light_alpha: f32,
    pub alpha: f32,
    pub blur: f32,
    pub y: f32,
}
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Gradients {
    pub hero: [u32; 2],
    pub button: [u32; 2],
    pub progress: [u32; 2],
    pub active: [u32; 2],
    #[serde(default = "game_gradient")]
    pub app_game: [u32; 2],
    #[serde(default = "voice_gradient")]
    pub app_voice: [u32; 2],
    #[serde(default = "tools_gradient")]
    pub app_tools: [u32; 2],
    #[serde(default = "video_gradient")]
    pub app_video: [u32; 2],
    #[serde(default = "music_gradient")]
    pub app_music: [u32; 2],
}
// Colores aprobados de las apps; los defaults conservan JSON de autoría anteriores.
fn game_gradient() -> [u32; 2] {
    [0x002f_6ad8, 0x0012_2e6a]
}
fn voice_gradient() -> [u32; 2] {
    [0x00e9_852a, 0x008f_450b]
}
fn tools_gradient() -> [u32; 2] {
    [0x008a_4ce0, 0x0040_207a]
}
fn video_gradient() -> [u32; 2] {
    [0x005a_5d64, 0x0026_272b]
}
fn music_gradient() -> [u32; 2] {
    [0x0022_c35d, 0x000e_6b30]
}
impl gpui::Global for Tokens {}
impl Tokens {
    pub fn from_json(json: &str) -> Result<Self, String> {
        let tokens: Self = serde_json::from_str(json).map_err(|error| format!("tema: {error}"))?;
        let g = &tokens.geometry;
        if tokens.name.trim().is_empty()
            || g.columns != 3
            || [
                g.sidebar,
                g.sidebar_collapsed,
                g.gap,
                g.gutter,
                g.radius,
                g.control_radius,
                g.control_height,
                g.topbar,
                tokens.fonts.body_size,
                tokens.fonts.small_size,
                tokens.fonts.title_size,
            ]
            .iter()
            .any(|n| !n.is_finite() || !(1.0..=1024.0).contains(n))
            || g.sidebar <= g.sidebar_collapsed
            || !(0.0..=1.0).contains(&tokens.shadow.alpha)
            || !(0.0..=1.0).contains(&tokens.shadow.light_alpha)
            || !tokens.shadow.blur.is_finite()
            || !(0.0..=256.0).contains(&tokens.shadow.blur)
            || !tokens.shadow.y.is_finite()
            || tokens.shadow.y.abs() > 256.0
            || [
                &tokens.fonts.body,
                &tokens.fonts.display,
                &tokens.fonts.mono,
            ]
            .iter()
            .any(|font| font.trim().is_empty() || font.len() > 128)
        {
            return Err("tema: geometría, tipografía o sombra fuera de rango".into());
        }
        let colors = &tokens.colors;
        if [
            colors.window,
            colors.base,
            colors.sidebar,
            colors.l1,
            colors.l2,
            colors.l3,
            colors.elevated,
            colors.neo_top,
            colors.neo_bottom,
            colors.text,
            colors.text2,
            colors.text3,
            colors.caption,
            colors.on_primary,
            colors.accent,
            colors.accent_bright,
            colors.accent_dark,
            colors.wine,
            colors.ok,
            colors.warn,
            colors.error,
        ]
        .iter()
        .chain(tokens.gradients.hero.iter())
        .chain(tokens.gradients.button.iter())
        .chain(tokens.gradients.progress.iter())
        .chain(tokens.gradients.active.iter())
        .chain(tokens.gradients.app_game.iter())
        .chain(tokens.gradients.app_voice.iter())
        .chain(tokens.gradients.app_tools.iter())
        .chain(tokens.gradients.app_video.iter())
        .chain(tokens.gradients.app_music.iter())
        .any(|color| *color > 0xff_ffff)
        {
            return Err("tema: color RGB fuera de rango".into());
        }
        Ok(tokens)
    }
}
/// Igual que #1467: mtime, JSON validado y último estilo válido durante una escritura parcial.
pub struct LiveTheme {
    live: bool,
    design: Design,
    path: PathBuf,
    modified: Option<SystemTime>,
    pub value: Tokens,
    pub error: Option<String>,
}
fn modified(path: &Path) -> Option<SystemTime> {
    std::fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
}
impl LiveTheme {
    pub fn new(design: Design) -> Result<Self, String> {
        let directory = std::env::var_os("VANTARE_UI_THEMES").map_or_else(
            || PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/themes")),
            PathBuf::from,
        );
        let mut live = Self {
            live: cfg!(debug_assertions),
            design,
            path: directory.join(design.file()),
            modified: None,
            value: design.compiled()?,
            error: None,
        };
        if live.live {
            live.reload();
        }
        Ok(live)
    }
    /// Autoría explícita, también para Workshop --dev compilado con perfil prueba.
    /// Los consumidores de producto usan new; Release no lee JSON del disco.
    pub fn for_authoring(design: Design) -> Result<Self, String> {
        let mut live = Self::new(design)?;
        live.live = true;
        live.reload();
        Ok(live)
    }
    fn reload(&mut self) {
        self.modified = modified(&self.path);
        match std::fs::read_to_string(&self.path)
            .map_err(|error| format!("{}: {error}", self.path.display()))
            .and_then(|json| Tokens::from_json(&json))
        {
            Ok(value) => {
                self.value = value;
                self.error = None;
            }
            Err(error) => self.error = Some(error),
        }
    }
    pub fn select(&mut self, design: Design) -> Result<(), String> {
        if self.design == design {
            if self.live {
                self.reload();
            }
        } else {
            *self = if self.live {
                Self::for_authoring(design)?
            } else {
                Self::new(design)?
            };
        }
        Ok(())
    }
    pub fn poll(&mut self, design: Design) -> Result<bool, String> {
        if self.design != design {
            self.select(design)?;
            return Ok(true);
        }
        if self.live && modified(&self.path) != self.modified {
            self.reload();
            return Ok(true);
        }
        Ok(false)
    }
}
pub fn register_fonts(cx: &gpui::App) -> Result<(), String> {
    cx.text_system()
        .add_fonts(vec![
            std::borrow::Cow::Borrowed(include_bytes!("../assets/fonts/Rajdhani.ttf")),
            std::borrow::Cow::Borrowed(include_bytes!("../assets/fonts/SpaceMono.ttf")),
        ])
        .map_err(|error| format!("fuentes del Hub: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn app_gradients_keep_older_authoring_json_and_reject_invalid_rgb() {
        let mut json: serde_json::Value =
            serde_json::from_str(include_str!("../themes/grafito-carmin.json"))
                .expect("tema aprobado");
        for key in ["appGame", "appVoice", "appTools", "appVideo", "appMusic"] {
            json["gradients"]
                .as_object_mut()
                .expect("degradados")
                .remove(key);
        }
        let legacy = Tokens::from_json(&json.to_string()).expect("JSON anterior compatible");
        assert_eq!(legacy.gradients.app_game, game_gradient());
        assert_eq!(legacy.gradients.app_tools, tools_gradient());
        json["gradients"]["appGame"] = serde_json::json!([0x0100_0000, 0]);
        assert!(Tokens::from_json(&json.to_string()).is_err());
    }
    #[test]
    fn all_compiled_themes_are_valid_and_deepseek_uses_the_reference_tokens() {
        for design in Design::ALL {
            design.compiled().expect("tema válido");
        }
        let theme = Design::DeepseekHarness.compiled().expect("DSH");
        assert_eq!(theme.colors.base, 0x15_1517);
        assert_eq!(theme.colors.l2, 0x2c_2c2e);
        assert_eq!(theme.colors.text, 0xf9_fafb);
        assert_eq!(theme.geometry.sidebar, 272.0);
        assert_eq!(theme.geometry.sidebar_collapsed, 76.0);
        assert!(Tokens::from_json("{}").is_err());
        let original = include_str!("../themes/grafito-carmin.json");
        assert!(Tokens::from_json(&original.replace("\"columns\": 3", "\"columns\": 2")).is_err());
    }
    #[test]
    fn partial_live_edit_keeps_the_previous_theme_and_can_recover() {
        let path = std::env::temp_dir().join(format!("vantare-theme-{}.json", std::process::id()));
        let mut live = LiveTheme::for_authoring(Design::GrafitoCarmin).expect("tema");
        live.path = path.clone();
        std::fs::write(&path, "{").expect("escritura parcial");
        let previous = live.value.clone();
        assert!(live.poll(Design::GrafitoCarmin).expect("poll parcial"));
        assert!(!live.poll(Design::GrafitoCarmin).expect("sin cambios"));
        assert!(live.error.is_some());
        assert_eq!(live.value, previous);
        std::fs::write(&path, include_str!("../themes/deepseek-harness.json")).expect("guardar");
        let file = std::fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .expect("archivo");
        file.set_times(
            std::fs::FileTimes::new()
                .set_modified(SystemTime::now() + std::time::Duration::from_secs(2)),
        )
        .expect("mtime distinto");
        assert!(live.poll(Design::GrafitoCarmin).expect("poll recuperado"));
        assert!(live.error.is_none());
        assert_eq!(live.value.name, "Harness");
        std::fs::remove_file(path).expect("limpiar");
    }
}
