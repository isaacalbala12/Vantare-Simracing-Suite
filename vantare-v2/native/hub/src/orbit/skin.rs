//! Tokens del Hub R9/R10 (`ESPEC-GPUI.md`): shell, kit y superficies con carácter.
//! Vantare = R9.1 y Clásico = §1, con los valores exactos de la espec. El resto de
//! temas se derivan con la misma regla HSL de la maqueta (`hub.html`, «tono»/«claro»):
//! los rojos toman el acento/fondo del tema y los neutros conservan su luminosidad.
//! Colores `0xRRGGBB`; con alfa `0xRRGGBBAA`. Estados, apps y logotipo no cambian.
use super::theme::{Palette, Scheme};

/// Degradado lineal de dos paradas: colores y posición (0..1) de la segunda.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Ramp {
    pub from: u32,
    pub to: u32,
    pub end: f32,
}

const fn ramp(from: u32, to: u32) -> Ramp {
    Ramp { from, to, end: 1.0 }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Radii {
    pub xs: f32,
    pub sm: f32,
    pub md: f32,
    pub lg: f32,
    pub xl: f32,
    pub panel: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Skin {
    /// Fondo de ventana (155°) y lavado superior (`wash`, alto `wash_h`).
    pub window: Ramp,
    pub wash: u32,
    pub wash_h: f32,
    /// Color plano equivalente al fondo (anillos, recortes).
    pub base: u32,
    /// Barras izquierda y derecha (180°) y su divisor estructural.
    pub sidebar: Ramp,
    pub sidebar_line: u32,
    pub l1: u32,
    pub l2: u32,
    pub l3: u32,
    pub el: u32,
    pub neo: Ramp,
    /// Luz superior, alfa de sombra, desenfoque y desplazamiento de la tarjeta neo.
    pub neo_light: u32,
    pub neo_shadow: (f32, f32, f32),
    pub hover: u32,
    pub active: u32,
    pub line1: u32,
    pub line2: u32,
    pub line3: u32,
    pub text1: u32,
    pub text2: u32,
    pub text3: u32,
    pub cap: u32,
    pub on_primary: u32,
    pub accent: u32,
    pub accent_bright: u32,
    pub accent_fill: u32,
    pub wine: u32,
    pub accent_tint: u32,
    pub ok: u32,
    pub ok_tint: u32,
    pub warn: u32,
    pub warn_tint: u32,
    pub err: u32,
    pub err_tint: u32,
    pub radius: Radii,
    /// Hero de Inicio y escaparate (118°/120°), lavado 160° y anillo.
    pub hero: Ramp,
    pub hero_wash: Ramp,
    pub hero_light: u32,
    pub hero_ring: u32,
    /// Tarjeta carmín contenida (Roadmap, Calendario, Actualizaciones).
    pub now: Ramp,
    pub now_wash: Ramp,
    pub now_light: u32,
    pub now_ring: u32,
    /// Ítem activo de barra y opción activa de segmentado.
    pub nav_active: Ramp,
    pub nav_light: u32,
    pub nav_ring: u32,
    /// Anillo de selección: inset 2 px, nunca sobresale.
    pub selection: u32,
    /// Botón principal R10.8.
    pub button: Ramp,
    pub button_hover: Ramp,
    pub button_pressed: u32,
    /// Subrayado de pestaña, símbolo y contador (135°/90°).
    pub brand: Ramp,
    pub live: Ramp,
    pub live_halo: u32,
    pub progress: Ramp,
    pub progress_glow: u32,
}

const fn alpha(rgb: u32, a: u8) -> u32 {
    (rgb << 8) | a as u32
}

impl Skin {
    pub fn resolve(palette: Palette, scheme: Scheme) -> Self {
        let mut skin = match palette {
            Palette::Classic => Self::classic(),
            Palette::Vantare => Self::vantare(),
            other => {
                let mut skin = Self::vantare();
                skin.map(|color| retone(color, other));
                if other == Palette::DeepSeek {
                    skin.base = 0x15_1517;
                    skin.window = Ramp {
                        from: 0x23_2324,
                        to: 0x15_1517,
                        end: 0.58,
                    };
                    skin.l1 = 0x23_2324;
                    skin.l2 = 0x2c_2c2e;
                    skin.l3 = 0x37_3739;
                    skin.el = 0x44_4447;
                    skin.neo = ramp(0x23_2324, 0x1b_1b1d);
                    skin.accent = 0x56_86fe;
                }
                skin
            }
        };
        if scheme == Scheme::Light {
            skin.map(light);
        }
        skin
    }

    /// R9.1 + R10.8, exactos.
    pub fn vantare() -> Self {
        Self {
            window: Ramp {
                from: 0x3a_111b,
                to: 0x12_080b,
                end: 0.58,
            },
            wash: alpha(0xff_525c, 0x1a),
            wash_h: 520.0,
            base: 0x17_0a0e,
            sidebar: ramp(0x1c_0a0f, 0x0f_0608),
            sidebar_line: alpha(0xff_7882, 0x1f),
            l1: 0x24_1116,
            l2: 0x2e_161c,
            l3: 0x3b_1e25,
            el: 0x4b_2830,
            neo: ramp(0x2a_151b, 0x1f_0f14),
            neo_light: alpha(0xff_cdd2, 0x12),
            neo_shadow: (0.5, 32.0, 14.0),
            hover: alpha(0xff_c8cd, 0x12),
            active: alpha(0xff_c8cd, 0x1f),
            line1: alpha(0xff_aab2, 0x14),
            line2: alpha(0xff_aab2, 0x21),
            line3: alpha(0xff_aab2, 0x33),
            text1: 0xfa_f7f7,
            text2: 0xde_cfd2,
            text3: 0xb9_9fa4,
            cap: 0x8f_7278,
            on_primary: 0x17_110f,
            accent: 0xe1_4a54,
            accent_bright: 0xff_7a82,
            accent_fill: 0xb5_2b35,
            wine: 0x6e_1019,
            accent_tint: alpha(0xe1_4a54, 0x26),
            ok: 0x22_c55e,
            ok_tint: 0x1f_3426,
            warn: 0xf5_9e0b,
            warn_tint: 0x33_291a,
            err: 0xf2_5a5a,
            err_tint: 0x3a_2023,
            radius: Radii {
                xs: 4.0,
                sm: 6.0,
                md: 8.0,
                lg: 10.0,
                xl: 14.0,
                panel: 10.0,
            },
            hero: Ramp {
                from: 0x8e_1d2b,
                to: 0x2a_0c13,
                end: 0.62,
            },
            hero_wash: Ramp {
                from: alpha(0xff_6e76, 0x52),
                to: alpha(0xff_525c, 0),
                end: 0.46,
            },
            hero_light: alpha(0xff_aaaf, 0x47),
            hero_ring: alpha(0xff_525c, 0x61),
            now: Ramp {
                from: 0x6e_1824,
                to: 0x22_090f,
                end: 0.62,
            },
            now_wash: Ramp {
                from: alpha(0xff_6e76, 0x47),
                to: alpha(0xff_525c, 0),
                end: 0.46,
            },
            now_light: alpha(0xff_aaaf, 0x3d),
            now_ring: alpha(0xff_525c, 0x52),
            nav_active: ramp(0x4a_1b25, 0x36_131b),
            nav_light: alpha(0xff_bec3, 0x1f),
            nav_ring: alpha(0xff_525c, 0x47),
            selection: alpha(0xff_525c, 0xcc),
            button: ramp(0xe5_434f, 0xc5_2f3b),
            button_hover: ramp(0xec_535e, 0xcf_3844),
            button_pressed: 0xb9_2a35,
            brand: ramp(0xff_525c, 0xb9_000d),
            live: ramp(0xff_7a82, 0xd1_1f2e),
            live_halo: alpha(0xe1_4a54, 0x33),
            progress: ramp(0x8e_1823, 0xff_525c),
            progress_glow: alpha(0xff_525c, 0x80),
        }
    }

    /// §1 (ronda 8, «grafito carmín»), exactos; el botón principal sigue R10.8.
    pub fn classic() -> Self {
        Self {
            window: ramp(0x16_1314, 0x16_1314),
            wash: alpha(0xe1_4a54, 0x0b),
            wash_h: 420.0,
            base: 0x16_1314,
            sidebar: ramp(0x1b_1718, 0x1b_1718),
            sidebar_line: alpha(0xff_ffff, 0x0f),
            l1: 0x22_1d1f,
            l2: 0x2b_2527,
            l3: 0x35_2e30,
            el: 0x43_3a3d,
            neo: ramp(0x26_2022, 0x1f_1a1c),
            neo_light: alpha(0xff_ffff, 0x12),
            neo_shadow: (0.35, 28.0, 12.0),
            hover: alpha(0xff_ffff, 0x12),
            active: alpha(0xff_ffff, 0x1f),
            line1: alpha(0xff_ffff, 0x0f),
            line2: alpha(0xff_ffff, 0x1a),
            line3: alpha(0xff_ffff, 0x26),
            text2: 0xd6_cfd0,
            text3: 0xb0_a7a9,
            cap: 0x87_7d80,
            radius: Radii {
                xs: 4.0,
                sm: 8.0,
                md: 12.0,
                lg: 16.0,
                xl: 20.0,
                panel: 28.0,
            },
            hero: ramp(0x5c_1720, 0x1e_1517),
            hero_wash: Ramp {
                from: alpha(0xff_525c, 0x42),
                to: alpha(0xff_525c, 0),
                end: 0.5,
            },
            hero_light: alpha(0xff_969b, 0x2e),
            hero_ring: alpha(0xff_525c, 0x38),
            now: ramp(0x33_191d, 0x1f_1719),
            now_wash: Ramp {
                from: alpha(0xff_525c, 0x24),
                to: alpha(0xff_525c, 0),
                end: 0.5,
            },
            now_light: alpha(0xff_969b, 0x1f),
            now_ring: alpha(0xff_525c, 0x29),
            nav_active: ramp(0x46_3c3f, 0x3b_3335),
            nav_light: alpha(0xff_ffff, 0x14),
            nav_ring: alpha(0xff_ffff, 0x0f),
            selection: alpha(0xe1_4a54, 0xa6),
            ..Self::vantare()
        }
    }

    /// Aplica `f` a todo color salvo estados (ok/aviso/error), que no cambian con el tema.
    fn map(&mut self, f: impl Fn(u32) -> u32) {
        let rgba = |c: u32| (f(c >> 8) << 8) | (c & 0xff);
        let ramp_rgb = |r: Ramp| Ramp {
            from: f(r.from),
            to: f(r.to),
            ..r
        };
        let ramp_rgba = |r: Ramp| Ramp {
            from: rgba(r.from),
            to: rgba(r.to),
            ..r
        };
        self.window = ramp_rgb(self.window);
        self.wash = rgba(self.wash);
        self.base = f(self.base);
        self.sidebar = ramp_rgb(self.sidebar);
        self.sidebar_line = rgba(self.sidebar_line);
        for c in [
            &mut self.l1,
            &mut self.l2,
            &mut self.l3,
            &mut self.el,
            &mut self.text1,
            &mut self.text2,
            &mut self.text3,
            &mut self.cap,
            &mut self.on_primary,
            &mut self.accent,
            &mut self.accent_bright,
            &mut self.accent_fill,
            &mut self.wine,
            &mut self.button_pressed,
        ] {
            *c = f(*c);
        }
        for c in [
            &mut self.neo_light,
            &mut self.hover,
            &mut self.active,
            &mut self.line1,
            &mut self.line2,
            &mut self.line3,
            &mut self.accent_tint,
            &mut self.hero_light,
            &mut self.hero_ring,
            &mut self.now_light,
            &mut self.now_ring,
            &mut self.nav_light,
            &mut self.nav_ring,
            &mut self.selection,
            &mut self.live_halo,
            &mut self.progress_glow,
        ] {
            *c = rgba(*c);
        }
        self.neo = ramp_rgb(self.neo);
        self.hero = ramp_rgb(self.hero);
        self.now = ramp_rgb(self.now);
        self.nav_active = ramp_rgb(self.nav_active);
        self.button = ramp_rgb(self.button);
        self.button_hover = ramp_rgb(self.button_hover);
        self.brand = ramp_rgb(self.brand);
        self.live = ramp_rgb(self.live);
        self.progress = ramp_rgb(self.progress);
        self.hero_wash = ramp_rgba(self.hero_wash);
        self.now_wash = ramp_rgba(self.now_wash);
    }
}

/// Acento y fondo oscuros de cada tema (theme.rs), como `P` en la maqueta.
fn anchors(palette: Palette) -> (u32, u32) {
    match palette {
        Palette::Rose => (0xe1_63a3, 0x1b_1119),
        Palette::Grove => (0x64_bd88, 0x10_1a15),
        Palette::Ocean => (0x32_95c0, 0x09_141c),
        Palette::Ember => (0xde_985e, 0x1d_1511),
        Palette::Iris => (0x95_72d7, 0x15_111f),
        Palette::Mono => (0xf2_f2f2, 0x11_1111),
        Palette::Vantare | Palette::Classic | Palette::DeepSeek => (0xe1_4a54, 0x17_0a0e),
    }
}

/// `tono` de la maqueta: solo los colores rojizos cambian; los neutros quedan.
fn retone(color: u32, palette: Palette) -> u32 {
    let (h, s, l) = hsl(color);
    let red = (h <= 25.0 || h >= 330.0) && s >= 0.12;
    if !red {
        return color;
    }
    let (h, s, l) = match palette {
        Palette::Vantare => (h, s, l),
        Palette::Classic => {
            if l < 0.25 {
                (h, s.min(0.12), l)
            } else if l > 0.75 {
                (h, s.min(0.15), l)
            } else {
                (h, s, l)
            }
        }
        Palette::DeepSeek => {
            if l > 0.75 {
                (220.0, s.min(0.1), l)
            } else if l >= 0.45 && s >= 0.45 {
                (222.0, s, l)
            } else if s >= 0.45 && l >= 0.18 {
                (222.0, s * 0.5, l * 0.8)
            } else {
                (240.0, s.min(0.05), l)
            }
        }
        Palette::Mono => (h, 0.0, l),
        other => {
            let (accent, background) = anchors(other);
            let (ah, as_, _) = hsl(accent);
            let (bh, bs, _) = hsl(background);
            if l > 0.75 {
                (ah, s * 0.3, l)
            } else if l >= 0.45 && s >= 0.45 {
                (ah, as_, l)
            } else if s >= 0.45 && l >= 0.18 {
                (ah, as_ * 0.55, l * 0.85)
            } else {
                (bh, s.min(bs * 1.2), l)
            }
        }
    };
    from_hsl(h, s, l)
}

/// `claro` de la maqueta: el modo claro es orientativo; solo debe ser legible.
fn light(color: u32) -> u32 {
    if color == 0 || color == 0xff_ffff {
        return color;
    }
    let (h, s, l) = hsl(color);
    if s >= 0.4 && (0.3..=0.8).contains(&l) {
        return from_hsl(h, s, (l - 0.12).max(0.28));
    }
    let lightness = 1.0 - l * 0.94;
    from_hsl(h, if lightness > 0.8 { s.min(0.18) } else { s }, lightness)
}

fn hsl(color: u32) -> (f32, f32, f32) {
    let [_, r, g, b] = color.to_be_bytes();
    let (r, g, b) = (
        f32::from(r) / 255.0,
        f32::from(g) / 255.0,
        f32::from(b) / 255.0,
    );
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = f32::midpoint(max, min);
    if (max - min).abs() < f32::EPSILON {
        return (0.0, 0.0, l);
    }
    let d = max - min;
    let s = if l > 0.5 {
        d / (2.0 - max - min)
    } else {
        d / (max + min)
    };
    let h = if (max - r).abs() < f32::EPSILON {
        (g - b) / d + if g < b { 6.0 } else { 0.0 }
    } else if (max - g).abs() < f32::EPSILON {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };
    (h * 60.0, s, l)
}

// Canales acotados a 0..255 antes de convertirlos en byte.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn from_hsl(h: f32, s: f32, l: f32) -> u32 {
    let a = s * l.min(1.0 - l);
    let channel = |n: f32| {
        let k = (n + h / 30.0) % 12.0;
        let v = l - a * (k - 3.0).min(9.0 - k).clamp(-1.0, 1.0);
        (255.0 * v).round().clamp(0.0, 255.0) as u32
    };
    (channel(0.0) << 16) | (channel(8.0) << 8) | channel(4.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vantare_dark_uses_the_exact_r9_and_r10_tokens() {
        let s = Skin::resolve(Palette::Vantare, Scheme::Dark);
        assert_eq!(
            (s.window.from, s.window.to, s.window.end),
            (0x3a_111b, 0x12_080b, 0.58)
        );
        assert_eq!((s.wash, s.wash_h), (0xff52_5c1a, 520.0));
        assert_eq!(
            (s.sidebar.from, s.sidebar.to, s.sidebar_line),
            (0x1c_0a0f, 0x0f_0608, 0xff78_821f)
        );
        assert_eq!(
            [s.l1, s.l2, s.l3, s.el],
            [0x24_1116, 0x2e_161c, 0x3b_1e25, 0x4b_2830]
        );
        assert_eq!((s.neo.from, s.neo.to), (0x2a_151b, 0x1f_0f14));
        assert_eq!(
            [s.line1, s.line2, s.line3],
            [0xffaa_b214, 0xffaa_b221, 0xffaa_b233]
        );
        assert_eq!(
            [s.text1, s.text2, s.text3, s.cap],
            [0xfa_f7f7, 0xde_cfd2, 0xb9_9fa4, 0x8f_7278]
        );
        let r = s.radius;
        assert_eq!(
            [r.sm, r.md, r.lg, r.xl, r.panel],
            [6.0, 8.0, 10.0, 14.0, 10.0]
        );
        assert_eq!(
            (s.hero.from, s.hero.to, s.hero.end, s.hero_wash.from),
            (0x8e_1d2b, 0x2a_0c13, 0.62, 0xff6e_7652)
        );
        assert_eq!((s.now.from, s.now.to), (0x6e_1824, 0x22_090f));
        assert_eq!(
            (s.nav_active.from, s.nav_active.to, s.nav_ring),
            (0x4a_1b25, 0x36_131b, 0xff52_5c47)
        );
        assert_eq!(s.selection, 0xff52_5ccc);
        assert_eq!((s.button.from, s.button.to), (0xe5_434f, 0xc5_2f3b));
        assert_eq!(s.accent, 0xe1_4a54);
    }

    #[test]
    fn classic_uses_the_exact_round_8_tokens() {
        let s = Skin::resolve(Palette::Classic, Scheme::Dark);
        assert_eq!(
            (s.base, s.window.from, s.window.to),
            (0x16_1314, 0x16_1314, 0x16_1314)
        );
        assert_eq!(s.sidebar.from, 0x1b_1718);
        assert_eq!(
            [s.l1, s.l2, s.l3, s.el],
            [0x22_1d1f, 0x2b_2527, 0x35_2e30, 0x43_3a3d]
        );
        assert_eq!((s.neo.from, s.neo.to), (0x26_2022, 0x1f_1a1c));
        assert_eq!(
            [s.line1, s.line2, s.line3],
            [0xffff_ff0f, 0xffff_ff1a, 0xffff_ff26]
        );
        assert_eq!(
            [s.text1, s.text2, s.text3, s.cap, s.on_primary],
            [0xfa_f7f7, 0xd6_cfd0, 0xb0_a7a9, 0x87_7d80, 0x17_110f]
        );
        let r = s.radius;
        assert_eq!(
            [r.sm, r.md, r.lg, r.xl, r.panel],
            [8.0, 12.0, 16.0, 20.0, 28.0]
        );
        assert_eq!((s.hero.from, s.hero.to), (0x5c_1720, 0x1e_1517));
        assert_eq!((s.now.from, s.now.to), (0x33_191d, 0x1f_1719));
        assert_eq!((s.nav_active.from, s.nav_active.to), (0x46_3c3f, 0x3b_3335));
        assert_eq!(
            [s.accent, s.accent_bright, s.accent_fill, s.wine],
            [0xe1_4a54, 0xff_7a82, 0xb5_2b35, 0x6e_1019]
        );
        assert_eq!(
            [s.ok, s.ok_tint, s.warn, s.warn_tint, s.err, s.err_tint],
            [
                0x22_c55e, 0x1f_3426, 0xf5_9e0b, 0x33_291a, 0xf2_5a5a, 0x3a_2023
            ]
        );
    }

    #[test]
    fn derived_themes_follow_their_accent_and_keep_states_and_neutrals() {
        let d = Skin::resolve(Palette::DeepSeek, Scheme::Dark);
        assert_eq!(
            [d.base, d.l1, d.l2, d.accent],
            [0x15_1517, 0x23_2324, 0x2c_2c2e, 0x56_86fe]
        );
        let (h, _, _) = hsl(d.button.from);
        assert!((h - 222.0).abs() < 2.0, "botón azul: {h}");
        for palette in [
            Palette::DeepSeek,
            Palette::Rose,
            Palette::Grove,
            Palette::Ocean,
            Palette::Ember,
            Palette::Iris,
            Palette::Mono,
        ] {
            let s = Skin::resolve(palette, Scheme::Dark);
            assert_eq!((s.ok, s.warn, s.err), (0x22_c55e, 0xf5_9e0b, 0xf2_5a5a));
            let (_, saturation, lightness) = hsl(s.text1);
            assert!(lightness > 0.95 && saturation < 0.35, "{palette:?}: texto");
        }
        let mono = Skin::resolve(Palette::Mono, Scheme::Dark);
        let [_, r, g, b] = mono.accent.to_be_bytes();
        assert!(r.abs_diff(g) <= 1 && g.abs_diff(b) <= 1, "Mono sin color");
    }

    #[test]
    fn light_scheme_keeps_text_readable_on_its_surfaces() {
        for palette in [Palette::Vantare, Palette::Classic, Palette::DeepSeek] {
            let s = Skin::resolve(palette, Scheme::Light);
            let (_, _, text) = hsl(s.text1);
            let (_, _, surface) = hsl(s.l1);
            assert!(surface - text > 0.6, "{palette:?}: {text} sobre {surface}");
        }
    }

    #[test]
    fn hsl_round_trips_the_spec_colors() {
        for color in [0xe1_4a54, 0x17_0a0e, 0xfa_f7f7, 0x56_86fe, 0x00_0000] {
            let (h, s, l) = hsl(color);
            assert_eq!(from_hsl(h, s, l), color, "{color:06x}");
        }
    }
}
