//! Datos de apariencia del Hub, alineados con `frontend/src/styles/orbit.*.css`.
//! Los colores son `0xRRGGBB`; las líneas y superficies con transparencia usan
//! `0xRRGGBBAA`, igual que los tokens del kit `orbit.rs`.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Palette {
    #[default]
    Vantare,
    /// «Vantare clásico»: tokens de la ronda 8 (§1).
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

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Scheme {
    System,
    Light,
    #[default]
    Dark,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum InterfaceFont {
    #[default]
    Inter,
    Segoe,
    Arial,
}

impl InterfaceFont {
    /// Las caras Inter Wxxx contienen el peso; una familia alternativa lo necesita.
    pub fn face_weight(self, requested: u16) -> u16 {
        match self {
            Self::Inter => 400,
            Self::Segoe | Self::Arial => requested,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MonoFont {
    #[default]
    Cascadia,
    Consolas,
    Courier,
}

/// Preferencias persistibles. Oscuro mantiene el aspecto inicial del Hub nativo.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppearanceSettings {
    pub palette: Palette,
    pub scheme: Scheme,
    pub contrast: u8,
    pub glass_opacity: u8,
    pub interface_font: InterfaceFont,
    pub mono_font: MonoFont,
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
        }
    }
}

/// Fondo temático del canvas de Studio (`--stage-accent/top/base`).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StageBackground {
    pub accent: u32,
    pub top: u32,
    pub base: u32,
}

/// Tokens compartidos por el kit Orbit y la apariencia del Hub.
///
/// Contiene colores y opciones que cambian con la apariencia. La geometría
/// fija vive en las constantes de `orbit.rs`.
#[derive(Clone, Debug, PartialEq)]
pub struct Theme {
    // Colores ya usados como constantes por el kit Orbit.
    pub coral: u32,
    pub ember: u32,
    pub red: u32,
    pub cyan: u32,
    pub bronze: u32,
    pub silver: u32,
    pub ink_4: u32,
    pub white: u32,
    pub line_chip: u32,
    pub line_pill: u32,
    pub primary_bg: u32,
    pub canvas: u32,
    pub surface_1: u32,
    pub surface_2: u32,
    pub surface_3: u32,
    pub column_bg: u32,
    pub ink: u32,
    pub ink_2: u32,
    pub ink_3: u32,
    pub ink_muted: u32,
    pub carmine: u32,
    pub carmine_dark: u32,
    pub green: u32,
    pub line: u32,
    pub line_strong: u32,
    pub line_row: u32,
    pub rail_bg: u32,
    pub palette_backdrop: u32,
    pub menu_shadow_color: u32,
    pub palette_shadow_color: u32,

    // Nuevos tokens cromáticos de Wails.
    pub surface_0: u32,
    pub panel_bg: u32,
    pub topbar_bg: u32,
    pub ink_5: u32,
    pub scroll_thumb: u32,
    pub scroll_thumb_hover: u32,
    pub scroll_thumb_idle: u32,
    pub scroll_track: u32,
    pub scroll_size: f32,
    pub panel_blur: f32,
    pub accent_rgb: u32,
    pub danger: u32,
    pub danger_rgb: u32,
    pub cyan_soft: u32,
    pub wine: u32,
    pub tier_bronze: u32,
    pub tier_silver: u32,
    pub tier_gold: u32,
    pub tyre_soft: u32,
    pub tyre_medium: u32,
    pub tyre_hard: u32,
    pub primary_ink: u32,

    // Opciones de apariencia reflejadas en el tema resuelto.
    pub palette: Palette,
    pub scheme: Scheme,
    pub contrast: u8,
    pub glass_opacity: u8,
    pub interface_font: InterfaceFont,
    pub mono_font: MonoFont,
    pub font_sans: &'static str,
    pub font_mono: &'static str,
    pub stage: StageBackground,
    /// Tokens del Hub R9/R10 para shell y kit.
    pub skin: super::skin::Skin,
}

impl gpui::Global for Theme {}

impl Default for Theme {
    fn default() -> Self {
        Self::from_settings(AppearanceSettings::default())
    }
}

impl Theme {
    pub fn apply_design(&mut self, tokens: &vantare_ui::theme::Tokens) {
        let c = &tokens.colors;
        self.stage = StageBackground {
            accent: c.accent,
            top: c.neo_top,
            base: c.base,
        };
        self.canvas = c.base;
        self.surface_0 = c.window;
        self.surface_1 = c.l1;
        self.surface_2 = c.l2;
        self.surface_3 = c.l3;
        self.rail_bg = c.sidebar;
        self.column_bg = c.base;
        self.panel_bg = (c.l1 << 8) | 0xff;
        self.topbar_bg = (c.sidebar << 8) | 0xff;
        self.ink = c.text;
        self.ink_2 = c.text2;
        self.ink_3 = c.text3;
        self.ink_muted = c.caption;
        self.ink_4 = c.caption;
        self.ink_5 = c.caption;
        self.white = c.text;
        self.primary_bg = c.text;
        self.primary_ink = c.on_primary;
        self.carmine = c.accent_bright;
        self.coral = c.accent_bright;
        self.carmine_dark = c.accent_dark;
        self.accent_rgb = c.accent;
        self.wine = c.wine;
        self.green = c.ok;
        self.ember = c.warn;
        self.red = c.error;
        self.danger = c.error;
        self.danger_rgb = c.error;
        self.line = c.line;
        self.line_strong = c.line2;
        self.line_row = c.line;
        self.line_chip = c.line;
        self.line_pill = c.line2;
    }

    /// Resuelve `system` como oscuro, igual que el fallback de Wails cuando no
    /// hay información del sistema. El llamador puede elegir explícitamente luz.
    pub fn resolve(palette: Palette, scheme: Scheme, contrast: u8, glass: u8) -> Self {
        let resolved_scheme = match scheme {
            Scheme::System | Scheme::Dark => Scheme::Dark,
            Scheme::Light => Scheme::Light,
        };
        let mut theme = Self::dark_defaults(palette, resolved_scheme, contrast, glass);
        theme.skin = super::skin::Skin::resolve(palette, resolved_scheme);
        if resolved_scheme == Scheme::Light {
            theme.apply_light_defaults();
        }
        theme.apply_palette();
        if theme.scheme == Scheme::Light {
            theme.white = theme.ink;
            theme.line_chip = (theme.ink << 8) | 0x09;
            theme.line_pill = (theme.ink << 8) | 0x0f;
            theme.palette_backdrop = (theme.canvas << 8) | 0x9e;
        }
        theme.apply_accessibility(contrast, glass);
        theme
    }

    /// Resuelve también las dos familias tipográficas guardadas en Ajustes.
    pub fn from_settings(settings: AppearanceSettings) -> Self {
        let mut theme = Self::resolve(
            settings.palette,
            settings.scheme,
            settings.contrast,
            settings.glass_opacity,
        );
        theme.interface_font = settings.interface_font;
        theme.mono_font = settings.mono_font;
        (theme.font_sans, theme.font_mono) = fonts(settings.interface_font, settings.mono_font);
        theme
    }

    fn dark_defaults(palette: Palette, scheme: Scheme, contrast: u8, glass: u8) -> Self {
        Self {
            coral: 0xff_6a5f,
            ember: 0xff_9b57,
            red: 0xf0_4755,
            cyan: 0x5c_cbd5,
            bronze: 0xd2_9a6c,
            silver: 0xc9_c9cf,
            ink_4: 0x78_7379,
            white: 0xff_ffff,
            line_chip: 0xffff_ff09,
            line_pill: 0xffff_ff0f,
            primary_bg: 0xf3_eeee,
            canvas: 0x08_090b,
            surface_0: 0x0d_0e11,
            surface_1: 0x12_1316,
            surface_2: 0x18_191e,
            surface_3: 0x20_2127,
            column_bg: 0x0f_1013,
            ink: 0xf5_f3f2,
            ink_2: 0xb7_b2b2,
            ink_3: 0x8a_858b,
            ink_5: 0x57_545a,
            ink_muted: 0x57_545a,
            carmine: 0xd5_2f49,
            carmine_dark: 0x9a_0606,
            green: 0x78_d68b,
            line: 0xffff_ff13,
            line_strong: 0xffff_ff21,
            line_row: 0xffff_ff0b,
            rail_bg: 0x0b_0c0e,
            palette_backdrop: 0x0404_069e,
            menu_shadow_color: 0x0000_0099,
            palette_shadow_color: 0x0000_00a8,
            panel_bg: 0x1011_14c9,
            topbar_bg: 0x0809_0bd1,
            scroll_thumb: 0xffff_ff21,
            scroll_thumb_hover: 0xffff_ff3d,
            scroll_thumb_idle: 0x0000_0000,
            scroll_track: 0x0000_0000,
            scroll_size: 6.0,
            panel_blur: 16.0,
            accent_rgb: 0xd5_2f49,
            danger: 0xf0_4755,
            danger_rgb: 0xf0_4755,
            cyan_soft: 0x8f_d6dd,
            wine: 0x64_1526,
            tier_bronze: 0xd2_9a6c,
            tier_silver: 0xc9_c9cf,
            tier_gold: 0xff_9b57,
            tyre_soft: 0xff_8b8b,
            tyre_medium: 0xff_d166,
            tyre_hard: 0xe6_e2e2,
            primary_ink: 0x1c_1719,
            palette,
            scheme,
            contrast,
            glass_opacity: glass,
            interface_font: InterfaceFont::Inter,
            mono_font: MonoFont::Cascadia,
            font_sans: "Inter, \"Segoe UI Variable\", \"Segoe UI\", system-ui, sans-serif",
            font_mono: "\"Cascadia Code\", \"SFMono-Regular\", ui-monospace, monospace",
            stage: StageBackground {
                accent: 0xf0_4755,
                top: 0x29_2026,
                base: 0x10_0d11,
            },
            skin: super::skin::Skin::vantare(),
        }
    }

    fn apply_light_defaults(&mut self) {
        self.canvas = 0xf8_f7f6;
        self.surface_0 = 0xff_ffff;
        self.surface_1 = 0xf1_efee;
        self.surface_2 = 0xe9_e6e5;
        self.surface_3 = 0xde_dad9; // replaced below to keep literal easy to inspect
        self.surface_3 = 0xde_dad9;
        self.rail_bg = 0xf2_eeee;
        self.column_bg = 0xf5_f2f1;
        self.panel_bg = 0xffff_ffe0;
        self.topbar_bg = 0xf8f7_f6e0;
        self.ink = 0x21_1b1d;
        self.ink_2 = 0x51_494c;
        self.ink_3 = 0x67_5d61;
        self.ink_4 = 0x74_6a6e;
        self.ink_5 = 0x8b_8185;
        self.ink_muted = 0x8b_8185;
        self.line = 0x2319_1e1f;
        self.line_strong = 0x2319_1e33;
        self.line_row = 0x2319_1e17;
        self.scroll_thumb = 0x2319_1e38;
        self.scroll_thumb_hover = 0x2319_1e5c;
        self.carmine = 0xb7_2341;
        self.accent_rgb = 0xb7_2341;
        self.red = 0xbd_2946;
        self.danger = 0xb4_233d;
        self.danger_rgb = 0xb4_233d;
        self.coral = 0xa5_1e39;
        self.ember = 0x8c_4715;
        self.wine = 0x74_1c35;
        self.green = 0x17_6c3a;
        self.cyan = 0x07_6986;
        self.cyan_soft = 0x13_7c96;
        self.primary_bg = 0xa5_1e39;
        self.primary_ink = 0xff_ffff;
        self.stage = StageBackground {
            accent: 0xb2_3546,
            top: 0xff_f4f2,
            base: 0xf9_f1ef,
        };
    }

    #[allow(clippy::too_many_lines)]
    fn apply_palette(&mut self) {
        match (self.palette, self.scheme) {
            (Palette::Rose, Scheme::Dark) => self.set_palette(
                [
                    0x1b_1119,
                    0x24_1720,
                    0x2b_1c28,
                    0x35_2333,
                    0x43_2d40,
                    0x1d_131b,
                    0x24_1822,
                    0x281a_25d4,
                    0x1b11_19db,
                    0xff_f3f9,
                    0xe1_bbd0,
                    0xc2_9ab1,
                    0xad_88a0,
                    0x95_7489,
                    0xffd0_eb1f,
                    0xffd0_eb33,
                    0xffd0_eb14,
                    0xe1_63a3,
                    0xf1_84ba,
                    0xff_b1d4,
                    0x82_3554,
                    0xff_e1ef,
                    0x31_1525,
                ],
                StageBackground {
                    accent: 0xe1_63a3,
                    top: 0x35_2032,
                    base: 0x1b_1119,
                },
            ),
            (Palette::Rose, Scheme::Light) => self.set_palette(
                [
                    0xff_f7fa,
                    0xff_ffff,
                    0xf9_eaf2,
                    0xf2_dce8,
                    0xe9_c9da,
                    0xf8_e9f1,
                    0xfc_f1f6,
                    0xffff_ffe0,
                    0xfff7_fae0,
                    0x39_212f,
                    0x63_495a,
                    0x78_5e6f,
                    0x87_6c7d,
                    0x9c_8292,
                    0x461e_351f,
                    0x461e_3538,
                    0x461e_3517,
                    0xa8_316c,
                    0xb8_437a,
                    0xc3_5c8d,
                    0x71_3050,
                    0xa8_316c,
                    0xff_ffff,
                ],
                StageBackground {
                    accent: 0xa8_316c,
                    top: 0xff_f0f6,
                    base: 0xff_f7fa,
                },
            ),
            (Palette::Grove, Scheme::Dark) => self.set_palette(
                [
                    0x10_1a15,
                    0x16_221b,
                    0x1b_2b22,
                    0x23_352a,
                    0x2e_4435,
                    0x11_1e17,
                    0x17_251d,
                    0x1829_1fd4,
                    0x101a_15db,
                    0xf1_fbf2,
                    0xbd_dbc5,
                    0x98_bea3,
                    0x83_ab8d,
                    0x6d_9477,
                    0xcaf1_d21f,
                    0xcaf1_d233,
                    0xcaf1_d214,
                    0x64_bd88,
                    0x83_d7a2,
                    0xb0_e9be,
                    0x28_5d42,
                    0xda_f5df,
                    0x17_3222,
                ],
                StageBackground {
                    accent: 0x64_bd88,
                    top: 0x20_3c30,
                    base: 0x10_1a15,
                },
            ),
            (Palette::Grove, Scheme::Light) => self.set_palette(
                [
                    0xf5_faf5,
                    0xff_ffff,
                    0xea_f4ec,
                    0xdc_ebdd,
                    0xc9_dfcd,
                    0xe9_f3eb,
                    0xf0_f7f1,
                    0xffff_ffe0,
                    0xf5fa_f5e0,
                    0x19_3125,
                    0x3e_5c48,
                    0x56_715d,
                    0x64_806a,
                    0x81_9a86,
                    0x1942_2721,
                    0x1942_2738,
                    0x1942_2717,
                    0x26_714d,
                    0x31_8359,
                    0x42_8d66,
                    0x1c_563a,
                    0x26_714d,
                    0xff_ffff,
                ],
                StageBackground {
                    accent: 0x26_714d,
                    top: 0xea_f5e9,
                    base: 0xf5_faf5,
                },
            ),
            (Palette::Ocean, Scheme::Dark) => self.set_palette(
                [
                    0x09_141c,
                    0x0e_1b24,
                    0x13_232d,
                    0x1a_2b35,
                    0x24_3640,
                    0x0b_1821,
                    0x0e_1c26,
                    0x1122_2dd4,
                    0x0914_1cdb,
                    0xf1_f8fb,
                    0xb8_d0dc,
                    0x91_adbd,
                    0x80_9dae,
                    0x64_8090,
                    0xbce0_f21a,
                    0xbce0_f22b,
                    0xbce0_f212,
                    0x32_95c0,
                    0x54_b8dc,
                    0x84_d5eb,
                    0x12_496c,
                    0xd4_f1fa,
                    0x10_232b,
                ],
                StageBackground {
                    accent: 0x6b_bbe1,
                    top: 0x1c_3446,
                    base: 0x10_1820,
                },
            ),
            (Palette::Ocean, Scheme::Light) => self.set_palette(
                [
                    0xf4_f9fb,
                    0xff_ffff,
                    0xea_f3f7,
                    0xde_edf3,
                    0xd0_e3ec,
                    0xe9_f3f7,
                    0xef_f7fa,
                    0xffff_ffe0,
                    0xf4f9_fbe0,
                    0x15_2b36,
                    0x3a_5260,
                    0x52_6a77,
                    0x60_7784,
                    0x80_939e,
                    0x0f2d_411f,
                    0x0f2d_4133,
                    0x0f2d_4117,
                    0x17_6d99,
                    0x16_7ca8,
                    0x0d_638d,
                    0x16_4d72,
                    0x17_6d99,
                    0xff_ffff,
                ],
                StageBackground {
                    accent: 0x29_7aa8,
                    top: 0xe9_f4fa,
                    base: 0xf3_f9fc,
                },
            ),
            (Palette::Ember, Scheme::Dark) => self.set_palette(
                [
                    0x1d_1511,
                    0x28_1c17,
                    0x30_221b,
                    0x3b_2a20,
                    0x49_352a,
                    0x21_1711,
                    0x28_1d17,
                    0x2d1f_18d4,
                    0x1d15_11db,
                    0xff_f6ed,
                    0xe2_c9b3,
                    0xc5_a98f,
                    0xb9_9a7f,
                    0x98_7f6d,
                    0xffdf_bf1f,
                    0xffdf_bf33,
                    0xffdf_bf14,
                    0xde_985e,
                    0xf0_ad72,
                    0xf9_c99a,
                    0x86_5339,
                    0xfb_e5ca,
                    0x35_2217,
                ],
                StageBackground {
                    accent: 0xde_985e,
                    top: 0x3b_291f,
                    base: 0x1d_1511,
                },
            ),
            (Palette::Ember, Scheme::Light) => self.set_palette(
                [
                    0xfd_f8f3,
                    0xff_ffff,
                    0xf7_eee4,
                    0xef_dfcf,
                    0xe5_ceb8,
                    0xf6_ecdf,
                    0xfb_f3e9,
                    0xffff_ffe0,
                    0xfdf8_f3e0,
                    0x38_291d,
                    0x61_4e3c,
                    0x7a_6652,
                    0x8b_745e,
                    0x9d_8976,
                    0x4b30_1f21,
                    0x4b30_1f38,
                    0x4b30_1f17,
                    0xa6_5b30,
                    0xb7_6a39,
                    0xc4_7e48,
                    0x78_4426,
                    0xa6_5b30,
                    0xff_ffff,
                ],
                StageBackground {
                    accent: 0xa6_5b30,
                    top: 0xfc_f0e5,
                    base: 0xfd_f8f3,
                },
            ),
            (Palette::Iris, Scheme::Dark) => self.set_palette(
                [
                    0x15_111f,
                    0x1b_1627,
                    0x21_1b2e,
                    0x29_2239,
                    0x34_2b44,
                    0x18_1321,
                    0x1c_1728,
                    0x201a_2dd4,
                    0x1511_1fdb,
                    0xf7_f3fc,
                    0xce_c2dd,
                    0xaa_9bbd,
                    0x96_86aa,
                    0x77_6985,
                    0xdcca_f41a,
                    0xdcca_f42b,
                    0xdcca_f412,
                    0x95_72d7,
                    0xbb_98f1,
                    0xd2_b8ff,
                    0x57_3677,
                    0xee_e1ff,
                    0x26_1932,
                ],
                StageBackground {
                    accent: 0xb9_92e8,
                    top: 0x31_253d,
                    base: 0x17_131f,
                },
            ),
            (Palette::Iris, Scheme::Light) => self.set_palette(
                [
                    0xf8_f6fc,
                    0xff_ffff,
                    0xf0_eaf8,
                    0xe8_dff3,
                    0xdb_ceed,
                    0xf0_eaf8,
                    0xf5_f0fa,
                    0xffff_ffe0,
                    0xf8f6_fce0,
                    0x2a_1f36,
                    0x52_445f,
                    0x6c_5c79,
                    0x7b_6b88,
                    0x95_869f,
                    0x361e_491f,
                    0x361e_4933,
                    0x361e_4917,
                    0x72_49ae,
                    0x80_56bb,
                    0x68_419f,
                    0x4d_3074,
                    0x72_49ae,
                    0xff_ffff,
                ],
                StageBackground {
                    accent: 0x79_54a8,
                    top: 0xf3_edfc,
                    base: 0xf8_f5fc,
                },
            ),
            (Palette::Mono, Scheme::Dark) => self.set_mono_dark(),
            (Palette::Mono, Scheme::Light) => self.set_mono_light(),
            (Palette::Vantare, Scheme::Light) => self.set_vantare_light(),
            _ => self.set_vantare_dark(),
        }
    }

    fn set_palette(&mut self, v: [u32; 23], stage: StageBackground) {
        let [
            canvas,
            s0,
            s1,
            s2,
            s3,
            rail,
            column,
            panel,
            topbar,
            ink,
            ink2,
            ink3,
            ink4,
            muted,
            line,
            strong,
            row,
            accent,
            red,
            coral,
            wine,
            primary,
            primary_ink,
        ] = v;
        self.canvas = canvas;
        self.surface_0 = s0;
        self.surface_1 = s1;
        self.surface_2 = s2;
        self.surface_3 = s3;
        self.rail_bg = rail;
        self.column_bg = column;
        self.panel_bg = panel;
        self.topbar_bg = topbar;
        self.ink = ink;
        self.ink_2 = ink2;
        self.ink_3 = ink3;
        self.ink_4 = ink4;
        self.ink_5 = muted;
        self.ink_muted = muted;
        self.line = line;
        self.line_strong = strong;
        self.line_row = row;
        self.carmine = accent;
        self.accent_rgb = accent;
        self.red = red;
        self.coral = coral;
        self.wine = wine;
        self.primary_bg = primary;
        self.primary_ink = primary_ink;
        self.stage = stage;
    }

    fn set_vantare_dark(&mut self) {
        self.stage = StageBackground {
            accent: 0xf0_4755,
            top: 0x29_2026,
            base: 0x10_0d11,
        };
    }

    fn set_vantare_light(&mut self) {
        // Los tokens restantes conservan su valor oscuro si Wails no los redefine.
        self.stage = StageBackground {
            accent: 0xb2_3546,
            top: 0xff_f4f2,
            base: 0xf9_f1ef,
        };
    }

    fn set_mono_dark(&mut self) {
        self.canvas = 0x11_1111;
        self.surface_0 = 0x19_1919;
        self.surface_1 = 0x22_2222;
        self.surface_2 = 0x2c_2c2c;
        self.surface_3 = 0x38_3838;
        self.rail_bg = 0x15_1515;
        self.column_bg = 0x1c_1c1c;
        self.panel_bg = 0x2121_21d4;
        self.topbar_bg = 0x1111_11db;
        self.ink = 0xf4_f4f4;
        self.ink_2 = 0xd0_d0d0;
        self.ink_3 = 0xab_abab;
        self.ink_4 = 0x99_9999;
        self.ink_5 = 0x80_8080;
        self.ink_muted = 0x80_8080;
        self.line = 0xffff_ff24;
        self.line_strong = 0xffff_ff42;
        self.line_row = 0xffff_ff17;
        self.scroll_thumb = 0xffff_ff33;
        self.scroll_thumb_hover = 0xffff_ff55;
        self.coral = 0xa6_a6a6;
        self.ember = 0xa6_a6a6;
        self.red = 0xf2_f2f2;
        self.cyan = 0xbd_bdbd;
        self.cyan_soft = 0xbd_bdbd;
        self.bronze = 0x8a_8a8a;
        self.silver = 0xbc_bcbc;
        self.carmine = 0xf2_f2f2;
        self.carmine_dark = 0x3a_3a3a;
        self.accent_rgb = 0xf2_f2f2;
        self.palette_backdrop = 0x0404_049e;
        self.danger = 0xf2_f2f2;
        self.danger_rgb = 0xf2_f2f2;
        self.wine = 0x66_6666;
        self.green = 0xd6_d6d6;
        self.tier_bronze = 0x8a_8a8a;
        self.tier_silver = 0xbc_bcbc;
        self.tier_gold = 0xee_eeee;
        self.tyre_soft = 0x8c_8c8c;
        self.tyre_medium = 0xc4_c4c4;
        self.tyre_hard = 0xf2_f2f2;
        self.primary_bg = 0xf2_f2f2;
        self.primary_ink = 0x11_1111;
        self.stage = StageBackground {
            accent: 0xbd_bdbd,
            top: 0x29_2929,
            base: 0x11_1111,
        };
    }

    fn set_mono_light(&mut self) {
        self.canvas = 0xf5_f5f5;
        self.surface_0 = 0xff_ffff;
        self.surface_1 = 0xec_ecec;
        self.surface_2 = 0xdf_dfdf;
        self.surface_3 = 0xd6_d6d6;
        self.rail_bg = 0xeb_ebeb;
        self.column_bg = 0xf1_f1f1;
        self.panel_bg = 0xffff_ffe0;
        self.topbar_bg = 0xf5f5_f5e0;
        self.ink = 0x1d_1d1d;
        self.ink_2 = 0x48_4848;
        self.ink_3 = 0x60_6060;
        self.ink_4 = 0x70_7070;
        self.ink_5 = 0x85_8585;
        self.ink_muted = 0x85_8585;
        self.line = 0x0000_0024;
        self.line_strong = 0x0000_0042;
        self.line_row = 0x0000_0017;
        self.scroll_thumb = 0x1e1e_1e38;
        self.scroll_thumb_hover = 0x1e1e_1e5c;
        self.carmine = 0x1a_1a1a;
        self.carmine_dark = 0xd6_d6d6;
        self.accent_rgb = 0x1a_1a1a;
        self.bronze = 0x8a_8a8a;
        self.silver = 0x5a_5a5a;
        self.palette_backdrop = 0x0404_049e;
        self.red = 0x1a_1a1a;
        self.danger = 0x1a_1a1a;
        self.danger_rgb = 0x1a_1a1a;
        self.coral = 0x6e_6e6e;
        self.ember = 0x6e_6e6e;
        self.wine = 0x35_3535;
        self.green = 0x3a_3a3a;
        self.cyan = 0x55_5555;
        self.cyan_soft = 0x55_5555;
        self.tier_bronze = 0x8a_8a8a;
        self.tier_silver = 0x5a_5a5a;
        self.tier_gold = 0x1f_1f1f;
        self.tyre_soft = 0x8a_8a8a;
        self.tyre_medium = 0x55_5555;
        self.tyre_hard = 0x1a_1a1a;
        self.primary_bg = 0x1a_1a1a;
        self.primary_ink = 0xff_ffff;
        self.stage = StageBackground {
            accent: 0x55_5555,
            top: 0xeb_ebeb,
            base: 0xf5_f5f5,
        };
    }

    fn apply_accessibility(&mut self, contrast: u8, glass: u8) {
        self.contrast = contrast.clamp(80, 120);
        self.glass_opacity = glass.clamp(50, 100);
        let strength = f32::from(self.contrast.abs_diff(100)) / 100.0;
        if strength > 0.0 {
            let target = if self.contrast > 100 {
                self.ink
            } else {
                self.canvas
            };
            self.ink_2 = mix_rgb(self.ink_2, target, strength);
            self.ink_3 = mix_rgb(self.ink_3, target, strength);
            self.ink_4 = mix_rgb(self.ink_4, target, strength);
            self.ink_5 = mix_rgb(self.ink_5, target, strength);
            self.ink_muted = self.ink_5;
            self.line = scale_alpha(self.line, f32::from(self.contrast) / 100.0);
            self.line_strong = scale_alpha(self.line_strong, f32::from(self.contrast) / 100.0);
            self.line_row = scale_alpha(self.line_row, f32::from(self.contrast) / 100.0);
        }
        // Skin es la fuente semántica; Tokens y los adaptadores nacen después.
        let target = if self.contrast > 100 {
            self.skin.text1
        } else {
            self.skin.base
        };
        self.skin.text2 = mix_rgb(self.skin.text2, target, strength);
        self.skin.text3 = mix_rgb(self.skin.text3, target, strength);
        self.skin.cap = mix_rgb(self.skin.cap, target, strength);
        let factor = f32::from(self.contrast) / 100.0;
        self.skin.line1 = scale_alpha(self.skin.line1, factor);
        self.skin.line2 = scale_alpha(self.skin.line2, factor);
        self.skin.line3 = scale_alpha(self.skin.line3, factor);
        if self.glass_opacity != 80 {
            let alpha_factor = f32::from(self.glass_opacity) / 80.0;
            self.panel_bg = scale_alpha(self.panel_bg, alpha_factor);
            self.topbar_bg = scale_alpha(self.topbar_bg, alpha_factor);
        }
        (self.font_sans, self.font_mono) = fonts(self.interface_font, self.mono_font);
    }

    /// Colores literales de secciones portadas antes de los temas. La identidad
    /// del tema inicial conserva esos píxeles; el resto usa el token semántico.
    pub fn legacy_color(&self, color: u32) -> u32 {
        let token = match color {
            0x00ff_6a5f => Some(self.coral),
            0x00ff_9b57 => Some(self.ember),
            0x00f0_4755 => Some(self.red),
            0x005c_cbd5 => Some(self.cyan),
            0x00d2_9a6c => Some(self.bronze),
            0x00c9_c9cf => Some(self.silver),
            0x00f5_f3f2 => Some(self.ink),
            0x00b7_b2b2 => Some(self.ink_2),
            0x008a_858b => Some(self.ink_3),
            0x0078_7379 => Some(self.ink_4),
            0x0057_545a => Some(self.ink_muted),
            0x00ff_ffff => Some(self.white),
            0x00d5_2f49 => Some(self.carmine),
            0x009a_0606 => Some(self.carmine_dark),
            0x0078_d68b => Some(self.green),
            0x0008_090b => Some(self.canvas),
            0x0012_1316 => Some(self.surface_1),
            0x0018_191e => Some(self.surface_2),
            0x0020_2127 => Some(self.surface_3),
            0x000f_1013 => Some(self.column_bg),
            0x000b_0c0e => Some(self.rail_bg),
            0x00f3_eeee => Some(self.primary_bg),
            0x001c_1719 => Some(self.primary_ink),
            0x0064_1526 => Some(self.wine),
            _ => None,
        };
        if let Some(token) = token {
            return token;
        }
        if self.palette == Palette::Vantare && self.scheme == Scheme::Dark {
            return color;
        }
        // Contratos históricos de Engineer, fondos y selección de secciones.
        match color {
            0x00e6_e9ec | 0x00f5_f5f5 | 0x00f1_f5fa => self.ink,
            0x00b8_c3cf | 0x00c4_c4c8 | 0x00b0_b0b6 | 0x00c9_c4c6 | 0x00d9_d5d5 => self.ink_2,
            0x0017_1d25 | 0x0013_1317 | 0x000e_0f11 | 0x0010_1114 => self.surface_1,
            0x0026_313e | 0x0019_191e | 0x001e_191c | 0x0015_1619 | 0x0019_191b | 0x0023_2325
            | 0x002a_2a30 | 0x0022_2228 | 0x001b_1c1e | 0x002c_2c2c | 0x0018_181b => self.surface_2,
            0x0042_4954 | 0x0067_768a | 0x0062_6268 | 0x0099_9999 | 0x0053_5353 | 0x005f_5b62 => {
                self.ink_4
            }
            0x008d_c9ff | 0x0081_96c6 => self.cyan,
            0x0033_171c | 0x0024_1215 | 0x001e_171c | 0x0044_444a | 0x0033_3336 | 0x003b_3b40
            | 0x0035_3539 | 0x001c_1216 => self.surface_3,
            0x000b_0d0f | 0x000a_0c0d | 0x0009_0c0d | 0x000b_0e0f | 0x000c_1012 | 0x000f_1212
            | 0x000a_0c0e | 0x0008_0b0c | 0x0010_151b | 0x0017_171b | 0x0010_1214 | 0x0010_0d0f
            | 0x000f_1214 | 0x0010_1315 | 0x000c_1011 | 0x000e_1213 | 0x0011_1416 | 0x0010_1113
            | 0x0010_1012 | 0x0015_1113 | 0x0010_1415 | 0x0011_1515 | 0x0018_181d | 0x000f_1012
            | 0x000f_0f12 | 0x000d_0e10 => self.canvas,
            0x00c1_121f | 0x00c5_2e42 => self.carmine,
            0x0054_3f18 => self.ember,
            other => other,
        }
    }
    pub fn legacy_alpha(&self, color: u32) -> u32 {
        match color {
            0x1011_14c9 => self.panel_bg,
            0x0809_0bd1 => self.topbar_bg,
            other => (self.legacy_color(other >> 8) << 8) | (other & 0xff),
        }
    }

    pub fn stage_background(&self) -> StageBackground {
        self.stage
    }

    #[cfg(test)]
    fn color_tokens(&self) -> [(u32, bool); 53] {
        [
            (self.coral, false),
            (self.ember, false),
            (self.red, false),
            (self.cyan, false),
            (self.bronze, false),
            (self.silver, false),
            (self.ink_4, false),
            (self.white, false),
            (self.line_chip, true),
            (self.line_pill, true),
            (self.primary_bg, false),
            (self.canvas, false),
            (self.surface_0, false),
            (self.surface_1, false),
            (self.surface_2, false),
            (self.surface_3, false),
            (self.column_bg, false),
            (self.ink, false),
            (self.ink_2, false),
            (self.ink_3, false),
            (self.ink_muted, false),
            (self.carmine, false),
            (self.carmine_dark, false),
            (self.green, false),
            (self.line, true),
            (self.line_strong, true),
            (self.line_row, true),
            (self.rail_bg, false),
            (self.palette_backdrop, true),
            (self.menu_shadow_color, true),
            (self.palette_shadow_color, true),
            (self.panel_bg, true),
            (self.topbar_bg, true),
            (self.ink_5, false),
            (self.scroll_thumb, true),
            (self.scroll_thumb_hover, true),
            (self.scroll_thumb_idle, true),
            (self.scroll_track, true),
            (self.accent_rgb, false),
            (self.danger, false),
            (self.danger_rgb, false),
            (self.cyan_soft, false),
            (self.wine, false),
            (self.tier_bronze, false),
            (self.tier_silver, false),
            (self.tier_gold, false),
            (self.tyre_soft, false),
            (self.tyre_medium, false),
            (self.tyre_hard, false),
            (self.primary_ink, false),
            (self.stage.accent, false),
            (self.stage.top, false),
            (self.stage.base, false),
        ]
    }
}

fn fonts(interface: InterfaceFont, mono: MonoFont) -> (&'static str, &'static str) {
    let sans = match interface {
        InterfaceFont::Inter => "Inter, \"Segoe UI Variable\", \"Segoe UI\", system-ui, sans-serif",
        InterfaceFont::Segoe => "\"Segoe UI Variable\", \"Segoe UI\", system-ui, sans-serif",
        InterfaceFont::Arial => "Arial, \"Segoe UI\", sans-serif",
    };
    let mono = match mono {
        MonoFont::Cascadia => "\"Cascadia Code\", Consolas, ui-monospace, monospace",
        MonoFont::Consolas => "Consolas, ui-monospace, monospace",
        MonoFont::Courier => "\"Courier New\", ui-monospace, monospace",
    };
    (sans, mono)
}

fn rgb_channels(color: u32) -> (u8, u8, u8) {
    let [_, red, green, blue] = color.to_be_bytes();
    (red, green, blue)
}

// Los canales se acotan a 0..255 antes de convertirlos en el byte de salida.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn mix_rgb(from: u32, to: u32, amount: f32) -> u32 {
    let (fr, fg, fb) = rgb_channels(from);
    let (tr, tg, tb) = rgb_channels(to);
    let mix = |a: u8, b: u8| (f32::from(a) + (f32::from(b) - f32::from(a)) * amount).round() as u32;
    (mix(fr, tr) << 16) | (mix(fg, tg) << 8) | mix(fb, tb)
}

// El canal alfa se acota a 0..255 antes de convertirlo en byte.
#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss
)]
fn scale_alpha(color: u32, factor: f32) -> u32 {
    let alpha = f32::from(color.to_be_bytes()[3]);
    (color & 0xffff_ff00) | ((alpha * factor).round().clamp(0.0, 255.0) as u32)
}

#[cfg(test)]
fn relative_luminance(color: u32) -> f64 {
    let (r, g, b) = rgb_channels(color);
    let channel = |v: u8| {
        let c = f64::from(v) / 255.0;
        if c <= 0.04045 {
            c / 12.92
        } else {
            ((c + 0.055) / 1.055).powf(2.4)
        }
    };
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

#[cfg(test)]
fn contrast_ratio(foreground: u32, background: u32) -> f64 {
    let a = relative_luminance(foreground);
    let b = relative_luminance(background);
    (a.max(b) + 0.05) / (a.min(b) + 0.05)
}

/// `System` sigue la apariencia que GPUI recibe del sistema operativo.
pub fn system_settings(
    mut settings: AppearanceSettings,
    appearance: gpui::WindowAppearance,
) -> AppearanceSettings {
    if settings.scheme == Scheme::System {
        settings.scheme = match appearance {
            gpui::WindowAppearance::Light | gpui::WindowAppearance::VibrantLight => Scheme::Light,
            gpui::WindowAppearance::Dark | gpui::WindowAppearance::VibrantDark => Scheme::Dark,
        };
    }
    settings
}

/// Ruta única de resolución usada por apply y sus regresiones.
pub fn resolve_hub(settings: AppearanceSettings, appearance: gpui::WindowAppearance) -> Theme {
    let mut resolved = Theme::from_settings(system_settings(settings, appearance));
    let tokens = design_tokens(&resolved.skin);
    resolved.apply_design(&tokens);
    // Solo menús y paneles flotantes: tarjetas y barras R4 son opacas.
    resolved.panel_bg = (resolved.skin.l2 << 8) | (u32::from(resolved.glass_opacity) * 255 / 100);
    resolved
}

pub fn apply(settings: AppearanceSettings, appearance: gpui::WindowAppearance, cx: &mut gpui::App) {
    let resolved = resolve_hub(settings, appearance);
    let tokens = design_tokens(&resolved.skin);
    cx.set_global(tokens);
    cx.set_global(settings);
    cx.set_global(resolved);
    cx.refresh_windows();
}

/// Contrato heredado de `vantare-ui` (#1470) derivado del tema R10.
pub fn design_tokens(skin: &super::skin::Skin) -> super::design::Tokens {
    use super::design::{Colors, Fonts, Geometry, Gradients, Shadow, Tokens};
    let (alpha, blur, y) = skin.neo_shadow;
    let ramp = |r: super::skin::Ramp| [r.from, r.to];
    let defaults = super::design::Design::GrafitoCarmin
        .compiled()
        .map(|tokens| tokens.gradients)
        .ok();
    Tokens {
        name: "Vantare".into(),
        colors: Colors {
            window: skin.base,
            base: skin.base,
            sidebar: skin.sidebar.to,
            l1: skin.l1,
            l2: skin.l2,
            l3: skin.l3,
            elevated: skin.el,
            neo_top: skin.neo.from,
            neo_bottom: skin.neo.to,
            text: skin.text1,
            text2: skin.text2,
            text3: skin.text3,
            caption: skin.cap,
            on_primary: skin.on_primary,
            accent: skin.accent,
            accent_bright: skin.accent_bright,
            accent_dark: skin.accent_fill,
            wine: skin.wine,
            ok: skin.ok,
            warn: skin.warn,
            error: skin.err,
            line: skin.line1,
            line2: skin.line2,
            line3: skin.line3,
        },
        geometry: Geometry {
            sidebar: 272.0,
            sidebar_collapsed: 76.0,
            gap: 16.0,
            gutter: 28.0,
            radius: skin.radius.lg,
            control_radius: skin.radius.sm,
            control_height: 36.0,
            topbar: 52.0,
            columns: 3,
        },
        fonts: Fonts {
            body: "Inter W400".into(),
            display: "Rajdhani".into(),
            mono: "Space Mono".into(),
            body_size: 14.0,
            small_size: 12.0,
            title_size: 56.0,
        },
        shadow: Shadow {
            light_alpha: f32::from((skin.neo_light & 0xff) as u8) / 255.0,
            alpha,
            blur,
            y,
        },
        gradients: Gradients {
            hero: ramp(skin.hero),
            button: ramp(skin.button),
            progress: ramp(skin.progress),
            active: ramp(skin.nav_active),
            // Los colores de las apps no cambian con el tema (R10.1).
            ..defaults.unwrap_or(Gradients {
                hero: [0; 2],
                button: [0; 2],
                progress: [0; 2],
                active: [0; 2],
                app_game: [0x002f_6ad8, 0x0012_2e6a],
                app_voice: [0x00e9_852a, 0x008f_450b],
                app_tools: [0x008a_4ce0, 0x0040_207a],
                app_video: [0x005a_5d64, 0x0026_272b],
                app_music: [0x0022_c35d, 0x000e_6b30],
            })
        },
    }
}
impl gpui::Global for AppearanceSettings {}

pub fn install(settings: AppearanceSettings, window: &mut gpui::Window, cx: &mut gpui::App) {
    apply(settings, window.appearance(), cx);
    window
        .observe_window_appearance(|window, cx| {
            let settings = *cx.global::<AppearanceSettings>();
            if settings.scheme == Scheme::System {
                apply(settings, window.appearance(), cx);
            }
        })
        .detach();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::orbit;

    #[test]
    fn production_design_keeps_text_accent_separate_from_brand_fill() {
        for palette in Palette::ALL {
            for scheme in [Scheme::Dark, Scheme::Light] {
                let mut theme = Theme::resolve(palette, scheme, 100, 80);
                let tokens = design_tokens(&theme.skin);
                theme.apply_design(&tokens);
                assert_eq!(theme.accent_rgb, theme.skin.accent);
                assert!(super::super::skin::contrast(theme.primary_ink, theme.primary_bg) >= 4.5);
                for background in [theme.skin.l1, theme.skin.l3] {
                    assert!(super::super::skin::contrast(theme.carmine, background) >= 4.5);
                    assert!(super::super::skin::contrast(theme.ink_muted, background) >= 4.5);
                }
            }
        }
    }

    #[test]
    fn vantare_dark_matches_orbit_constants_field_by_field() {
        let theme = Theme::resolve(Palette::Vantare, Scheme::Dark, 100, 80);
        assert_eq!(theme.coral, orbit::CORAL);
        assert_eq!(theme.ember, orbit::EMBER);
        assert_eq!(theme.red, orbit::RED);
        assert_eq!(theme.cyan, orbit::CYAN);
        assert_eq!(theme.bronze, orbit::BRONZE);
        assert_eq!(theme.silver, orbit::SILVER);
        assert_eq!(theme.ink_4, orbit::INK_4);
        assert_eq!(theme.primary_ink, 0x001c_1719);
        assert_eq!(theme.silver, orbit::SILVER);
        assert_eq!(theme.ink_4, orbit::INK_4);
        assert_eq!(theme.white, orbit::WHITE);
        assert_eq!(theme.line_chip, orbit::LINE_CHIP);
        assert_eq!(theme.line_pill, orbit::LINE_PILL);
        assert_eq!(theme.primary_bg, orbit::PRIMARY_BG);
        assert_eq!(theme.menu_shadow_color, orbit::MENU_SHADOW_COLOR);
        assert_eq!(theme.palette_shadow_color, orbit::PALETTE_SHADOW_COLOR);
        assert_eq!(theme.canvas, orbit::CANVAS);
        assert_eq!(theme.surface_1, orbit::SURFACE_1);
        assert_eq!(theme.surface_2, orbit::SURFACE_2);
        assert_eq!(theme.surface_3, orbit::SURFACE_3);
        assert_eq!(theme.column_bg, orbit::COLUMN_BG);
        assert_eq!(theme.ink, orbit::INK);
        assert_eq!(theme.ink_2, orbit::INK_2);
        assert_eq!(theme.ink_3, orbit::INK_3);
        assert_eq!(theme.ink_muted, orbit::INK_MUTED);
        assert_eq!(theme.carmine, orbit::CARMINE);
        assert_eq!(theme.carmine_dark, orbit::CARMINE_DARK);
        assert_eq!(theme.green, orbit::GREEN);
        assert_eq!(theme.line, orbit::LINE);
        assert_eq!(theme.line_strong, orbit::LINE_STRONG);
        assert_eq!(theme.line_row, orbit::LINE_ROW);
        assert_eq!(theme.rail_bg, orbit::RAIL_BG);
        assert_eq!(theme.palette_backdrop, orbit::PALETTE_BACKDROP);
    }

    #[test]
    fn system_scheme_tracks_os_without_overriding_explicit_choices() {
        for (os, expected) in [
            (gpui::WindowAppearance::Light, Scheme::Light),
            (gpui::WindowAppearance::VibrantLight, Scheme::Light),
            (gpui::WindowAppearance::Dark, Scheme::Dark),
            (gpui::WindowAppearance::VibrantDark, Scheme::Dark),
        ] {
            let settings = AppearanceSettings {
                scheme: Scheme::System,
                ..AppearanceSettings::default()
            };
            assert_eq!(system_settings(settings, os).scheme, expected);
            for scheme in [Scheme::Dark, Scheme::Light] {
                assert_eq!(
                    system_settings(AppearanceSettings { scheme, ..settings }, os).scheme,
                    scheme
                );
            }
        }
    }
    #[test]
    fn mono_uses_the_orchestrator_tokens_and_readable_inverted_danger() {
        for scheme in [Scheme::Dark, Scheme::Light] {
            let t = Theme::resolve(Palette::Mono, scheme, 100, 80);
            let expected = if scheme == Scheme::Dark {
                (
                    0x00f2_f2f2,
                    0x003a_3a3a,
                    0x00d6_d6d6,
                    0x00a6_a6a6,
                    0x00bd_bdbd,
                    0x0011_1111,
                )
            } else {
                (
                    0x001a_1a1a,
                    0x00d6_d6d6,
                    0x003a_3a3a,
                    0x006e_6e6e,
                    0x0055_5555,
                    0x00ff_ffff,
                )
            };
            assert_eq!(
                (
                    t.carmine,
                    t.carmine_dark,
                    t.green,
                    t.ember,
                    t.cyan,
                    t.primary_ink
                ),
                expected
            );
            assert_eq!(t.red, t.primary_bg);
            assert!(contrast_ratio(t.primary_ink, t.red) >= 4.5);
            assert!(contrast_ratio(t.ink, t.surface_1) >= 4.5);
            for color in [t.green, t.ember, t.cyan] {
                assert!(
                    contrast_ratio(color, t.surface_0) >= 4.5,
                    "{scheme:?}: {color:#08x}"
                );
            }
            let states = [t.green, t.ember, t.cyan];
            for (i, color) in states.iter().enumerate() {
                for other in &states[..i] {
                    let a = relative_luminance(*color);
                    let b = relative_luminance(*other);
                    // Separación relativa respecto al estado más luminoso (≥20%).
                    assert!((a - b).abs() / a.max(b) >= 0.2);
                }
            }
        }
    }
    #[test]
    fn legacy_section_tokens_keep_exact_default_pixels() {
        let t = Theme::from_settings(AppearanceSettings::default());
        for color in [
            0x0019_191e,
            0x0013_1317,
            0x00e6_e9ec,
            0x00b8_c3cf,
            0x0017_1d25,
            0x0026_313e,
            0x0042_4954,
            0x0067_768a,
            0x008d_c9ff,
            0x00d9_d5d5,
            0x000b_0d0f,
        ] {
            assert_eq!(t.legacy_color(color), color);
        }
        for color in [
            0xffff_ff09,
            0xffff_ff06,
            0xd52f_491c,
            0xf047_5530,
            0x1011_14c9,
        ] {
            assert_eq!(t.legacy_alpha(color), color);
        }
    }

    #[test]
    fn wcag_contrast_report_for_primary_and_secondary_text() {
        for palette in [
            Palette::Vantare,
            Palette::Rose,
            Palette::Grove,
            Palette::Ocean,
            Palette::Ember,
            Palette::Iris,
            Palette::Mono,
        ] {
            for scheme in [Scheme::Light, Scheme::Dark] {
                let theme = Theme::resolve(palette, scheme, 100, 80);
                let primary = contrast_ratio(theme.ink, theme.surface_0);
                let secondary = contrast_ratio(theme.ink_2, theme.surface_0);
                println!(
                    "{palette:?}/{scheme:?}: texto principal {primary:.2}:1, secundario {secondary:.2}:1{}",
                    if primary < 4.5 || secondary < 4.5 {
                        " (por debajo de AA)"
                    } else {
                        " (AA)"
                    }
                );
                assert!(
                    primary >= 4.5 && secondary >= 4.5,
                    "{palette:?}/{scheme:?}: texto AA"
                );
            }
        }
    }

    #[test]
    fn studio_stage_backgrounds_match_wails_palette_table() {
        let cases = [
            (
                Palette::Vantare,
                Scheme::Light,
                0xb2_3546,
                0xff_f4f2,
                0xf9_f1ef,
            ),
            (
                Palette::Vantare,
                Scheme::Dark,
                0xf0_4755,
                0x29_2026,
                0x10_0d11,
            ),
            (
                Palette::Rose,
                Scheme::Light,
                0xa8_316c,
                0xff_f0f6,
                0xff_f7fa,
            ),
            (Palette::Rose, Scheme::Dark, 0xe1_63a3, 0x35_2032, 0x1b_1119),
            (
                Palette::Grove,
                Scheme::Light,
                0x26_714d,
                0xea_f5e9,
                0xf5_faf5,
            ),
            (
                Palette::Grove,
                Scheme::Dark,
                0x64_bd88,
                0x20_3c30,
                0x10_1a15,
            ),
            (
                Palette::Ocean,
                Scheme::Light,
                0x29_7aa8,
                0xe9_f4fa,
                0xf3_f9fc,
            ),
            (
                Palette::Ocean,
                Scheme::Dark,
                0x6b_bbe1,
                0x1c_3446,
                0x10_1820,
            ),
            (
                Palette::Ember,
                Scheme::Light,
                0xa6_5b30,
                0xfc_f0e5,
                0xfd_f8f3,
            ),
            (
                Palette::Ember,
                Scheme::Dark,
                0xde_985e,
                0x3b_291f,
                0x1d_1511,
            ),
            (
                Palette::Iris,
                Scheme::Light,
                0x79_54a8,
                0xf3_edfc,
                0xf8_f5fc,
            ),
            (Palette::Iris, Scheme::Dark, 0xb9_92e8, 0x31_253d, 0x17_131f),
            (
                Palette::Mono,
                Scheme::Light,
                0x55_5555,
                0xeb_ebeb,
                0xf5_f5f5,
            ),
            (Palette::Mono, Scheme::Dark, 0xbd_bdbd, 0x29_2929, 0x11_1111),
        ];
        for (palette, scheme, accent, top, base) in cases {
            assert_eq!(
                Theme::resolve(palette, scheme, 100, 80).stage_background(),
                StageBackground { accent, top, base },
                "fondo Studio de {palette:?}/{scheme:?}"
            );
        }
    }

    #[test]
    fn mono_palette_has_no_saturated_color_tokens() {
        for scheme in [Scheme::Light, Scheme::Dark] {
            let theme = Theme::resolve(Palette::Mono, scheme, 100, 80);
            for (color, has_alpha) in theme.color_tokens() {
                let rgb = if has_alpha { color >> 8 } else { color };
                let (r, g, b) = rgb_channels(rgb);
                assert_eq!(r, g, "Grises {scheme:?}: token {color:#010x}");
                assert_eq!(g, b, "Grises {scheme:?}: token {color:#010x}");
            }
        }
    }

    #[test]
    fn appearance_settings_defaults_and_serde_round_trip() {
        let defaults = AppearanceSettings::default();
        assert_eq!(defaults.palette, Palette::Vantare);
        assert_eq!(defaults.scheme, Scheme::Dark);
        assert_eq!(defaults.contrast, 100);
        assert_eq!(defaults.glass_opacity, 80);
        assert_eq!(defaults.interface_font, InterfaceFont::Inter);
        assert_eq!(defaults.mono_font, MonoFont::Cascadia);
        let json = serde_json::to_string(&defaults).expect("serializar apariencia");
        assert!(json.contains("\"glassOpacity\":80"));
        let decoded: AppearanceSettings =
            serde_json::from_str(&json).expect("deserializar apariencia");
        assert_eq!(decoded, defaults);
        assert_eq!(
            serde_json::from_str::<AppearanceSettings>("{}").expect("valores por defecto"),
            defaults
        );
        let custom = AppearanceSettings {
            interface_font: InterfaceFont::Arial,
            mono_font: MonoFont::Courier,
            ..defaults
        };
        let theme = Theme::from_settings(custom);
        assert_eq!(theme.font_sans, "Arial, \"Segoe UI\", sans-serif");
        assert_eq!(theme.font_mono, "\"Courier New\", ui-monospace, monospace");
    }
}

#[cfg(test)]
#[path = "theme_tokens.rs"]
mod token_tests;

#[cfg(test)]
mod font_tests {
    use super::InterfaceFont;

    #[test]
    fn alternative_faces_keep_requested_weights() {
        for weight in [400, 500, 650, 700, 750, 800] {
            assert_eq!(InterfaceFont::Inter.face_weight(weight), 400);
            assert_eq!(InterfaceFont::Segoe.face_weight(weight), weight);
            assert_eq!(InterfaceFont::Arial.face_weight(weight), weight);
        }
    }
}

#[cfg(test)]
mod accessibility_route_tests {
    use super::*;
    #[test]
    fn saved_extremes_reach_skin_tokens_fields_and_floating_panels() {
        for scheme in [Scheme::Dark, Scheme::Light] {
            let base = resolve_hub(
                AppearanceSettings {
                    scheme,
                    ..AppearanceSettings::default()
                },
                gpui::WindowAppearance::Dark,
            );
            for contrast in [80, 120] {
                for glass_opacity in [50, 100] {
                    let settings = AppearanceSettings {
                        scheme,
                        contrast,
                        glass_opacity,
                        interface_font: InterfaceFont::Arial,
                        mono_font: MonoFont::Courier,
                        ..AppearanceSettings::default()
                    };
                    let saved: AppearanceSettings =
                        serde_json::from_str(&serde_json::to_string(&settings).unwrap()).unwrap();
                    let theme = resolve_hub(saved, gpui::WindowAppearance::Dark);
                    let tokens = design_tokens(&theme.skin);
                    assert_ne!(theme.skin.text2, base.skin.text2);
                    assert_ne!(theme.skin.line2, base.skin.line2);
                    assert_eq!(
                        (theme.ink_2, theme.ink_3, theme.ink_muted),
                        (
                            tokens.colors.text2,
                            tokens.colors.text3,
                            tokens.colors.caption
                        )
                    );
                    assert_eq!(theme.line_strong, tokens.colors.line2);
                    assert_eq!(theme.panel_bg >> 8, theme.skin.l2);
                    assert_eq!(theme.panel_bg & 255, u32::from(glass_opacity) * 255 / 100);
                    assert_eq!(theme.skin.l2, base.skin.l2);
                    assert_eq!(theme.skin.button, base.skin.button);
                    assert_eq!(theme.font_sans, "Arial, \"Segoe UI\", sans-serif");
                    assert_eq!(theme.font_mono, "\"Courier New\", ui-monospace, monospace");
                }
            }
        }
    }
}
