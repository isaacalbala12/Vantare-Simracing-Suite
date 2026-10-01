//! Datos de apariencia del Hub, alineados con `frontend/src/styles/orbit.*.css`.
//! Los colores son `0xRRGGBB`; las líneas y superficies con transparencia usan
//! `0xRRGGBBAA`, igual que los tokens del kit `orbit.rs`.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Palette {
    #[default]
    Vantare,
    Rose,
    Grove,
    Ocean,
    Ember,
    Iris,
    Mono,
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

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MonoFont {
    #[default]
    Cascadia,
    Consolas,
    Courier,
}

/// Preferencias persistibles. Los valores por defecto coinciden con Wails.
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
            scheme: Scheme::System,
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
/// Los campos de geometría conservan su nombre en minúscula respecto a las
/// constantes de `orbit.rs`. Los tokens de Wails se añaden con el nombre CSS
/// sin el prefijo `--orbit-`.
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
    pub featured_bg: &'static str,
    pub featured_border: &'static str,
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
    pub brand_gradient: &'static str,
    pub selection_bg: &'static str,
    pub glow_active: &'static str,
    pub shadow_featured: &'static str,
    pub shadow_featured_hover: &'static str,
    pub shadow_primary: &'static str,
    pub shadow_toast: &'static str,
    pub shadow_palette: &'static str,
    pub shadow_menu: &'static str,
    pub inset_glass: &'static str,

    // Geometría y tipografía del kit Orbit.
    pub row_h: f32,
    pub chip_h: f32,
    pub pill_h: f32,
    pub radius_chip: f32,
    pub body: f32,
    pub secondary: f32,
    pub micro: f32,
    pub chip_text: f32,
    pub pill_text: f32,
    pub chip_pad: f32,
    pub pill_gap: f32,
    pub line_width: f32,
    pub field_w: f32,
    pub textarea_h: f32,
    pub field_pad: f32,
    pub field_text: f32,
    pub tab_pad: f32,
    pub tab_inset: f32,
    pub fader_w: f32,
    pub fader_h: f32,
    pub fader_radius: f32,
    pub fader_thumb: f32,
    pub option_h: f32,
    pub menu_pad: f32,
    pub check_size: f32,
    pub check_radius: f32,
    pub segment_h: f32,
    pub segment_pad: f32,
    pub segment_gap: f32,
    pub dot: f32,
    pub pill_dot: f32,
    pub focus_width: f32,
    pub disabled: f32,
    pub menu_z: usize,
    pub modal_z: usize,
    pub menu_shadow_y: f32,
    pub menu_shadow_blur: f32,
    pub palette_shadow_y: f32,
    pub palette_shadow_blur: f32,
    pub column_w: f32,
    pub topbar_h: f32,
    pub gutter: f32,
    pub topbar_gutter: f32,
    pub radius: f32,
    pub radius_control: f32,
    pub control_h: f32,
    pub rail_w: f32,
    pub column_compact_w: f32,
    pub column_breakpoint: f32,
    pub rail_button: f32,
    pub palette_w: f32,
    pub popover_w: f32,
    pub popover_radius: f32,
    pub popover_max_h: f32,
    pub featured_radius: f32,

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
}

impl Theme {
    /// Resuelve `system` como oscuro, igual que el fallback de Wails cuando no
    /// hay información del sistema. El llamador puede elegir explícitamente luz.
    pub fn resolve(palette: Palette, scheme: Scheme, contrast: u8, glass: u8) -> Self {
        let resolved_scheme = match scheme {
            Scheme::System | Scheme::Dark => Scheme::Dark,
            Scheme::Light => Scheme::Light,
        };
        let mut theme = Self::dark_defaults(palette, resolved_scheme, contrast, glass);
        if resolved_scheme == Scheme::Light {
            theme.apply_light_defaults();
        }
        theme.apply_palette();
        theme.apply_palette_effects();
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

    #[allow(clippy::too_many_lines)]
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
            featured_bg: "linear-gradient(rgba(25,25,30,.98), rgba(19,19,23,.99))",
            featured_border: "linear-gradient(115deg, rgba(240,71,85,.62), rgba(255,106,95,.2), rgba(255,255,255,.06))",
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
            brand_gradient: "linear-gradient(145deg, var(--orbit-coral), var(--orbit-carmine) 62%, var(--orbit-wine))",
            selection_bg: "linear-gradient(90deg, rgba(213,47,73,.11), rgba(213,47,73,.02))",
            glow_active: "0 0 13px rgba(240,71,85,.6)",
            shadow_featured: "0 32px 91px rgba(0,0,0,.42), 0 0 42px rgba(213,47,73,.04)",
            shadow_featured_hover: "0 39px 110px rgba(0,0,0,.5), 0 0 62px rgba(213,47,73,.07)",
            shadow_primary: "0 13px 34px rgba(0,0,0,.35)",
            shadow_toast: "0 23px 78px rgba(0,0,0,.5)",
            shadow_palette: "0 44px 143px rgba(0,0,0,.66), 0 0 58px rgba(213,47,73,.05)",
            shadow_menu: "0 24px 70px rgba(0,0,0,.6)",
            inset_glass: "inset 0 1px 0 rgba(255,255,255,.08)",
            row_h: 49.0,
            chip_h: 26.0,
            pill_h: 30.0,
            radius_chip: 8.0,
            body: 13.5,
            secondary: 12.0,
            micro: 10.5,
            chip_text: 10.0,
            pill_text: 11.5,
            chip_pad: 9.0,
            pill_gap: 9.0,
            line_width: 1.0,
            field_w: 168.0,
            textarea_h: 83.0,
            field_pad: 13.0,
            field_text: 14.0,
            tab_pad: 14.0,
            tab_inset: 10.0,
            fader_w: 150.0,
            fader_h: 6.0,
            fader_radius: 3.0,
            fader_thumb: 16.0,
            option_h: 38.0,
            menu_pad: 6.0,
            check_size: 18.0,
            check_radius: 5.0,
            segment_h: 29.0,
            segment_pad: 4.0,
            segment_gap: 2.5,
            dot: 6.0,
            pill_dot: 8.0,
            focus_width: 2.0,
            disabled: 0.45,
            menu_z: 30,
            modal_z: 100,
            menu_shadow_y: 24.0,
            menu_shadow_blur: 70.0,
            palette_shadow_y: 44.0,
            palette_shadow_blur: 143.0,
            column_w: 296.0,
            topbar_h: 70.0,
            gutter: 32.0,
            topbar_gutter: 26.0,
            radius: 18.0,
            radius_control: 12.0,
            control_h: 39.0,
            rail_w: 81.0,
            column_compact_w: 216.0,
            column_breakpoint: 1152.0,
            rail_button: 52.0,
            palette_w: 640.0,
            popover_w: 360.0,
            popover_radius: 14.0,
            popover_max_h: 520.0,
            featured_radius: 25.0,
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
        self.featured_bg = "linear-gradient(#fff, #f5f2f1)";
        self.featured_border =
            "linear-gradient(115deg, rgba(183,35,65,.4), rgba(183,35,65,.12), rgba(31,25,28,.07))";
        self.brand_gradient = "linear-gradient(145deg, #cf3e59, #a51e39 62%, #741c35)";
        self.selection_bg = "linear-gradient(90deg, rgba(183,35,65,.13), rgba(183,35,65,.025))";
        self.glow_active = "0 0 0 3px rgba(183,35,65,.2)";
        self.shadow_featured = "0 25px 65px rgba(50,30,35,.12)";
        self.shadow_featured_hover = "0 30px 75px rgba(50,30,35,.17)";
        self.shadow_primary = "0 10px 25px rgba(70,25,40,.16)";
        self.shadow_toast = "0 18px 55px rgba(35,25,30,.19)";
        self.shadow_palette = "0 28px 90px rgba(35,25,30,.21)";
        self.shadow_menu = "0 16px 52px rgba(35,25,30,.17)";
        self.inset_glass = "inset 0 1px 0 rgba(255,255,255,.7)";
        self.stage = StageBackground {
            accent: 0xb2_3546,
            top: 0xff_f4f2,
            base: 0xf9_f1ef,
        };
    }

    #[allow(clippy::too_many_lines)]
    fn apply_palette(&mut self) {
        match (self.palette, self.scheme) {
            (Palette::Rose, Scheme::Dark) => self.set_palette_dark(
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
                    0xe1_63a3,
                ],
                StageBackground {
                    accent: 0xe1_63a3,
                    top: 0x35_2032,
                    base: 0x1b_1119,
                },
            ),
            (Palette::Rose, Scheme::Light) => self.set_palette_light(
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
                    0xa8_316c,
                ],
                StageBackground {
                    accent: 0xa8_316c,
                    top: 0xff_f0f6,
                    base: 0xff_f7fa,
                },
            ),
            (Palette::Grove, Scheme::Dark) => self.set_palette_dark(
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
                    0x64_bd88,
                ],
                StageBackground {
                    accent: 0x64_bd88,
                    top: 0x20_3c30,
                    base: 0x10_1a15,
                },
            ),
            (Palette::Grove, Scheme::Light) => self.set_palette_light(
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
                    0x26_714d,
                ],
                StageBackground {
                    accent: 0x26_714d,
                    top: 0xea_f5e9,
                    base: 0xf5_faf5,
                },
            ),
            (Palette::Ocean, Scheme::Dark) => self.set_palette_dark(
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
                    0x32_95c0,
                ],
                StageBackground {
                    accent: 0x6b_bbe1,
                    top: 0x1c_3446,
                    base: 0x10_1820,
                },
            ),
            (Palette::Ocean, Scheme::Light) => self.set_palette_light(
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
                    0x17_6d99,
                ],
                StageBackground {
                    accent: 0x29_7aa8,
                    top: 0xe9_f4fa,
                    base: 0xf3_f9fc,
                },
            ),
            (Palette::Ember, Scheme::Dark) => self.set_palette_dark(
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
                    0xde_985e,
                ],
                StageBackground {
                    accent: 0xde_985e,
                    top: 0x3b_291f,
                    base: 0x1d_1511,
                },
            ),
            (Palette::Ember, Scheme::Light) => self.set_palette_light(
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
                    0xa6_5b30,
                ],
                StageBackground {
                    accent: 0xa6_5b30,
                    top: 0xfc_f0e5,
                    base: 0xfd_f8f3,
                },
            ),
            (Palette::Iris, Scheme::Dark) => self.set_palette_dark(
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
                    0x95_72d7,
                ],
                StageBackground {
                    accent: 0xb9_92e8,
                    top: 0x31_253d,
                    base: 0x17_131f,
                },
            ),
            (Palette::Iris, Scheme::Light) => self.set_palette_light(
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
                    0x72_49ae,
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

    fn apply_palette_effects(&mut self) {
        let scheme = match self.scheme {
            Scheme::System => Scheme::Dark,
            resolved => resolved,
        };
        match (self.palette, scheme) {
            (Palette::Vantare, _) | (_, Scheme::System) => {}
            (Palette::Ocean, Scheme::Dark) => {
                self.featured_border = "linear-gradient(115deg, rgba(78,175,210,.58), rgba(78,175,210,.2), rgba(255,255,255,.07))";
                self.brand_gradient = "linear-gradient(145deg, #76d1e9, #3295c0 62%, #12496c)";
                self.selection_bg =
                    "linear-gradient(90deg, rgba(50,149,192,.2), rgba(50,149,192,.025))";
                self.glow_active = "0 0 13px rgba(84,184,220,.5)";
            }
            (Palette::Ocean, Scheme::Light) => {
                self.featured_border = "linear-gradient(115deg, rgba(28,105,143,.4), rgba(28,105,143,.12), rgba(15,40,54,.07))";
                self.brand_gradient = "linear-gradient(145deg, #2791bb, #176d99 62%, #164d72)";
                self.selection_bg =
                    "linear-gradient(90deg, rgba(23,109,153,.13), rgba(23,109,153,.025))";
                self.glow_active = "0 0 0 3px rgba(23,109,153,.2)";
            }
            (Palette::Iris, Scheme::Dark) => {
                self.featured_border = "linear-gradient(115deg, rgba(177,145,238,.56), rgba(177,145,238,.2), rgba(255,255,255,.07))";
                self.brand_gradient = "linear-gradient(145deg, #c9aaf7, #9572d7 62%, #573677)";
                self.selection_bg =
                    "linear-gradient(90deg, rgba(149,114,215,.2), rgba(149,114,215,.025))";
                self.glow_active = "0 0 13px rgba(187,152,241,.5)";
            }
            (Palette::Iris, Scheme::Light) => {
                self.featured_border = "linear-gradient(115deg, rgba(109,69,166,.4), rgba(109,69,166,.12), rgba(45,25,65,.07))";
                self.brand_gradient = "linear-gradient(145deg, #9469cc, #7249ae 62%, #4d3074)";
                self.selection_bg =
                    "linear-gradient(90deg, rgba(114,73,174,.13), rgba(114,73,174,.025))";
                self.glow_active = "0 0 0 3px rgba(114,73,174,.2)";
            }
            (Palette::Rose | Palette::Grove | Palette::Ember | Palette::Mono, Scheme::Dark) => {
                self.featured_border = "linear-gradient(115deg, rgba(var(--orbit-accent-rgb),.55), rgba(var(--orbit-accent-rgb),.18), var(--orbit-line))";
                self.brand_gradient = "linear-gradient(145deg, var(--orbit-coral), var(--orbit-carmine) 62%, var(--orbit-wine))";
                self.selection_bg = "linear-gradient(90deg, rgba(var(--orbit-accent-rgb),.2), rgba(var(--orbit-accent-rgb),.025))";
                self.glow_active = "0 0 13px rgba(var(--orbit-accent-rgb),.5)";
            }
            (Palette::Rose | Palette::Grove | Palette::Ember | Palette::Mono, Scheme::Light) => {
                self.featured_border = "linear-gradient(115deg, rgba(var(--orbit-accent-rgb),.4), rgba(var(--orbit-accent-rgb),.12), var(--orbit-line))";
                self.brand_gradient = "linear-gradient(145deg, var(--orbit-coral), var(--orbit-carmine) 62%, var(--orbit-wine))";
                self.selection_bg = "linear-gradient(90deg, rgba(var(--orbit-accent-rgb),.13), rgba(var(--orbit-accent-rgb),.025))";
                self.glow_active = "0 0 0 3px rgba(var(--orbit-accent-rgb),.2)";
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn set_palette_dark(&mut self, v: [u32; 24], stage: StageBackground) {
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
            _,
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

    #[allow(clippy::too_many_arguments)]
    fn set_palette_light(&mut self, v: [u32; 24], stage: StageBackground) {
        self.set_palette_dark(v, stage);
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
        self.line = 0xffff_ff1f;
        self.line_strong = 0xffff_ff33;
        self.line_row = 0xffff_ff14;
        self.scroll_thumb = 0xffff_ff33;
        self.scroll_thumb_hover = 0xffff_ff55;
        self.coral = 0xe4_e4e4;
        self.ember = 0xc4_c4c4;
        self.red = 0xd0_d0d0;
        self.cyan = 0xc6_c6c6;
        self.cyan_soft = 0xd8_d8d8;
        self.bronze = 0xa5_a5a5;
        self.silver = 0xc9_c9c9;
        self.carmine = 0xbd_bdbd;
        self.carmine_dark = 0x44_4444;
        self.accent_rgb = 0xbd_bdbd;
        self.palette_backdrop = 0x0404_049e;
        self.danger = 0xe0_e0e0;
        self.danger_rgb = 0xe0_e0e0;
        self.wine = 0x66_6666;
        self.green = 0xce_cece;
        self.tier_bronze = 0xa5_a5a5;
        self.tier_silver = 0xc9_c9c9;
        self.tier_gold = 0xe0_e0e0;
        self.tyre_soft = 0xb5_b5b5;
        self.tyre_medium = 0xce_cece;
        self.tyre_hard = 0xe6_e6e6;
        self.primary_bg = 0xe8_e8e8;
        self.primary_ink = 0x17_1717;
        self.featured_bg = "linear-gradient(#303030, #202020)";
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
        self.surface_3 = 0xce_cece;
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
        self.line = 0x1e1e_1e24;
        self.line_strong = 0x1e1e_1e3d;
        self.line_row = 0x1e1e_1e1a;
        self.scroll_thumb = 0x1e1e_1e38;
        self.scroll_thumb_hover = 0x1e1e_1e5c;
        self.carmine = 0x55_5555;
        self.carmine_dark = 0x55_5555;
        self.accent_rgb = 0x55_5555;
        self.bronze = 0x65_6565;
        self.silver = 0x8a_8a8a;
        self.palette_backdrop = 0x0404_049e;
        self.red = 0x49_4949;
        self.danger = 0x3a_3a3a;
        self.danger_rgb = 0x3a_3a3a;
        self.coral = 0x77_7777;
        self.ember = 0x70_7070;
        self.wine = 0x35_3535;
        self.green = 0x4c_4c4c;
        self.cyan = 0x51_5151;
        self.cyan_soft = 0x63_6363;
        self.tier_bronze = 0x65_6565;
        self.tier_silver = 0x8a_8a8a;
        self.tier_gold = 0x50_5050;
        self.tyre_soft = 0x99_9999;
        self.tyre_medium = 0x77_7777;
        self.tyre_hard = 0x55_5555;
        self.primary_bg = 0x39_3939;
        self.primary_ink = 0xff_ffff;
        self.featured_bg = "linear-gradient(#fff, #ececec)";
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
        if self.glass_opacity != 80 {
            let alpha_factor = f32::from(self.glass_opacity) / 80.0;
            self.panel_bg = scale_alpha(self.panel_bg, alpha_factor);
            self.topbar_bg = scale_alpha(self.topbar_bg, alpha_factor);
        }
        (self.font_sans, self.font_mono) = fonts(self.interface_font, self.mono_font);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::orbit;

    #[test]
    #[allow(clippy::float_cmp)]
    fn vantare_dark_matches_orbit_constants_field_by_field() {
        let theme = Theme::resolve(Palette::Vantare, Scheme::Dark, 100, 80);
        assert_eq!(theme.coral, orbit::CORAL);
        assert_eq!(theme.ember, orbit::EMBER);
        assert_eq!(theme.red, orbit::RED);
        assert_eq!(theme.cyan, orbit::CYAN);
        assert_eq!(theme.bronze, orbit::BRONZE);
        assert_eq!(theme.silver, orbit::SILVER);
        assert_eq!(theme.ink_4, orbit::INK_4);
        assert_eq!(theme.row_h, orbit::ROW_H);
        assert_eq!(theme.chip_h, orbit::CHIP_H);
        assert_eq!(theme.pill_h, orbit::PILL_H);
        assert_eq!(theme.radius_chip, orbit::RADIUS_CHIP);
        assert_eq!(theme.body, orbit::BODY);
        assert_eq!(theme.secondary, orbit::SECONDARY);
        assert_eq!(theme.micro, orbit::MICRO);
        assert_eq!(theme.chip_text, orbit::CHIP_TEXT);
        assert_eq!(theme.pill_text, orbit::PILL_TEXT);
        assert_eq!(theme.chip_pad, orbit::CHIP_PAD);
        assert_eq!(theme.pill_gap, orbit::PILL_GAP);
        assert_eq!(theme.line_width, orbit::LINE_WIDTH);
        assert_eq!(theme.white, orbit::WHITE);
        assert_eq!(theme.line_chip, orbit::LINE_CHIP);
        assert_eq!(theme.line_pill, orbit::LINE_PILL);
        assert_eq!(theme.field_w, orbit::FIELD_W);
        assert_eq!(theme.textarea_h, orbit::TEXTAREA_H);
        assert_eq!(theme.field_pad, orbit::FIELD_PAD);
        assert_eq!(theme.field_text, orbit::FIELD_TEXT);
        assert_eq!(theme.tab_pad, orbit::TAB_PAD);
        assert_eq!(theme.tab_inset, orbit::TAB_INSET);
        assert_eq!(theme.fader_w, orbit::FADER_W);
        assert_eq!(theme.fader_h, orbit::FADER_H);
        assert_eq!(theme.fader_radius, orbit::FADER_RADIUS);
        assert_eq!(theme.fader_thumb, orbit::FADER_THUMB);
        assert_eq!(theme.primary_bg, orbit::PRIMARY_BG);
        assert_eq!(theme.option_h, orbit::OPTION_H);
        assert_eq!(theme.menu_pad, orbit::MENU_PAD);
        assert_eq!(theme.check_size, orbit::CHECK_SIZE);
        assert_eq!(theme.check_radius, orbit::CHECK_RADIUS);
        assert_eq!(theme.segment_h, orbit::SEGMENT_H);
        assert_eq!(theme.segment_pad, orbit::SEGMENT_PAD);
        assert_eq!(theme.segment_gap, orbit::SEGMENT_GAP);
        assert_eq!(theme.dot, orbit::DOT);
        assert_eq!(theme.pill_dot, orbit::PILL_DOT);
        assert_eq!(theme.focus_width, orbit::FOCUS_WIDTH);
        assert_eq!(theme.disabled, orbit::DISABLED);
        assert_eq!(theme.menu_z, orbit::MENU_Z);
        assert_eq!(theme.modal_z, orbit::MODAL_Z);
        assert_eq!(theme.menu_shadow_y, orbit::MENU_SHADOW_Y);
        assert_eq!(theme.menu_shadow_blur, orbit::MENU_SHADOW_BLUR);
        assert_eq!(theme.palette_shadow_y, orbit::PALETTE_SHADOW_Y);
        assert_eq!(theme.palette_shadow_blur, orbit::PALETTE_SHADOW_BLUR);
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
        assert_eq!(theme.column_w, orbit::COLUMN_W);
        assert_eq!(theme.topbar_h, orbit::TOPBAR_H);
        assert_eq!(theme.gutter, orbit::GUTTER);
        assert_eq!(theme.topbar_gutter, orbit::TOPBAR_GUTTER);
        assert_eq!(theme.radius, orbit::RADIUS);
        assert_eq!(theme.radius_control, orbit::RADIUS_CONTROL);
        assert_eq!(theme.control_h, orbit::CONTROL_H);
        assert_eq!(theme.rail_bg, orbit::RAIL_BG);
        assert_eq!(theme.rail_w, orbit::RAIL_W);
        assert_eq!(theme.column_compact_w, orbit::COLUMN_COMPACT_W);
        assert_eq!(theme.column_breakpoint, orbit::COLUMN_BREAKPOINT);
        assert_eq!(theme.rail_button, orbit::RAIL_BUTTON);
        assert_eq!(theme.palette_w, orbit::PALETTE_W);
        assert_eq!(theme.popover_w, orbit::POPOVER_W);
        assert_eq!(theme.popover_radius, orbit::POPOVER_RADIUS);
        assert_eq!(theme.popover_max_h, orbit::POPOVER_MAX_H);
        assert_eq!(theme.palette_backdrop, orbit::PALETTE_BACKDROP);
        assert_eq!(theme.featured_radius, orbit::FEATURED_RADIUS);
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
        assert_eq!(defaults.scheme, Scheme::System);
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
