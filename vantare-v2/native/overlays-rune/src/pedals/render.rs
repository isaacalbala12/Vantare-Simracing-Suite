//! Vantare and Eficiencia paint the shared Pedals scene; retained Rune values stay here.
use super::scene::{self, HEIGHT, Scene};
use crate::vantare::paint::{Face, WHITE, font};
use crate::vantare::{Style, alpha};
use rune::{Align, Color, El, el, text};
use std::sync::Arc;
use vantare_domain::{
    format::{Language, Preferences},
    geometry::Size,
    widget_settings::{
        look::{Accent, Look, Tone},
        pedals::Settings,
    },
};

const VANTARE_TRACK_W: f32 = 16.0;
const VANTARE_VALUE_SIZE: f32 = 10.0;
const VANTARE_VALUE_TOP: f32 = 11.0;
const VANTARE_VALUE_H: f32 = 14.0;
const VANTARE_PAD_BOTTOM: f32 = 11.0;
const EFICIENCIA_TRACK_W: f32 = 14.0;
const EFICIENCIA_LABEL_H: f32 = 11.0;
const EFICIENCIA_VALUE_H: f32 = 11.0;
const EFICIENCIA_PAD_TOP: f32 = 8.0;
const EFICIENCIA_PAD_BOTTOM: f32 = 10.0;
/// Caja de texto holgada y centrada: `100%` no cabe en la columna y GPUI tampoco lo recorta.
const TEXT_BOX: f32 = 40.0;
const BLACK: Color = Color {
    r: 0.0,
    g: 0.0,
    b: 0.0,
    a: 1.0,
};
const LABELS: [&str; 3] = ["C", "B", "T"];

/// What the Look actually paints after its settings: peak and limiter can be invisible.
#[derive(PartialEq)]
struct Painted {
    pedals: [scene::Pedal; 3],
    band: Option<&'static str>,
    limiter: bool,
    peak: Option<f32>,
}

fn painted(scene: &Scene, look: Look, language: Language, show_peak: bool) -> Painted {
    Painted {
        pedals: scene.pedals.clone(),
        band: match look {
            Look::Vantare if scene.limiter => Some(if language == Language::Es {
                "LIMITADOR"
            } else {
                "LIMITER"
            }),
            _ => scene.status,
        },
        limiter: look == Look::Vantare && scene.limiter,
        peak: (look == Look::Vantare && show_peak)
            .then_some(scene.peak)
            .flatten(),
    }
}

pub(super) struct Painter {
    prefs: Preferences,
    look: Look,
    tone: Tone,
    accent: Accent,
    gap: f32,
    transparent: bool,
    show_peak: bool,
    style: Arc<Style>,
    painted: Painted,
}

impl Painter {
    pub fn new(settings: &Settings, prefs: Preferences, scene: &Scene) -> Self {
        let show_peak = settings.show_brake_peak;
        let painted = painted(scene, settings.design_system, prefs.language, show_peak);
        Self {
            prefs,
            look: settings.design_system,
            tone: settings.style,
            accent: settings.accent,
            gap: settings.gap,
            transparent: settings.transparent_background,
            show_peak,
            style: Style::compiled(),
            painted,
        }
    }
    pub fn size(&self) -> Size {
        Size {
            width: scene::width_for_gap(self.look, self.gap),
            height: HEIGHT,
        }
    }
    /// The only build decision: compare what will be painted.
    pub fn sync(&mut self, scene: &Scene) -> crate::widget::Update {
        let painted = painted(scene, self.look, self.prefs.language, self.show_peak);
        let build = painted != self.painted;
        self.painted = painted;
        crate::widget::Update {
            build,
            pixels: false,
        }
    }
    pub fn view(&self) -> El {
        match self.look {
            Look::Vantare => self.vantare(),
            Look::Eficiencia => self.eficiencia(),
        }
    }
    fn variant(&self) -> &crate::vantare::Variant {
        match self.tone {
            Tone::Neo => &self.style.styles.neo,
            Tone::Neutro => &self.style.styles.neutro,
        }
    }
    fn accent_color(&self) -> Color {
        match self.accent {
            Accent::Red => self.style.accents.red,
            Accent::Amber => self.style.accents.amber,
            Accent::Green => self.style.accents.green,
            Accent::White => self.style.accents.white,
        }
    }
    fn panel(&self, root: El) -> El {
        if self.transparent {
            return root;
        }
        let v = self.variant();
        let border = if v.border_accent > 0.0 {
            alpha(self.accent_color(), v.border_accent)
        } else {
            v.border
        };
        root.radius(v.radius)
            .border(1.0, border)
            .linear_gradient(std::f32::consts::PI, [(0.0, v.top), (1.0, v.bottom)])
            .shadow(
                v.shadow_y,
                v.shadow_blur,
                alpha(self.style.colors.shadow, v.shadow_alpha),
            )
    }
    fn vantare(&self) -> El {
        let s = &self.style;
        let colors = [s.colors.compound_wet, s.colors.flash_loss, s.colors.green];
        let width = self.size().width;
        let root = el()
            .key("pedals-view")
            .size(width, HEIGHT)
            .motion(rune::Spring::NONE);
        let root = self.panel(root);
        let (mut root, top) = self.vantare_band(root, width);
        let value_top = top + VANTARE_VALUE_TOP;
        let track_top = value_top + VANTARE_VALUE_H + 6.0;
        let track_h = (HEIGHT - track_top - VANTARE_PAD_BOTTOM).max(0.0);
        let column_w = scene::VANTARE_COLUMN_W - 2.0 / 3.0;
        for (index, pedal) in self.painted.pedals.iter().enumerate() {
            let mid = scene::PAD_X + 1.0 + index as f32 * (column_w + self.gap) + column_w / 2.0;
            let x = mid - VANTARE_TRACK_W / 2.0;
            let track = if self.transparent {
                alpha(BLACK, 0.5)
            } else {
                s.fuel.track
            };
            root = root.child(
                el().size(VANTARE_TRACK_W, track_h)
                    .radius(VANTARE_TRACK_W / 2.0)
                    .fill(track)
                    .pin(Some(x), Some(track_top), None, None),
            );
            if self.transparent {
                root = root.child(
                    el().size(VANTARE_TRACK_W + 2.0, track_h + 2.0)
                        .radius(VANTARE_TRACK_W / 2.0 + 1.0)
                        .border(1.0, alpha(WHITE, 0.14))
                        .pin(Some(x - 1.0), Some(track_top - 1.0), None, None),
                );
            }
            if let Some(fill) = pedal.fill
                && fill > 0.0
            {
                let h = fill * track_h;
                root = root.child(
                    el().size(VANTARE_TRACK_W, h)
                        .radius(VANTARE_TRACK_W.min(h) / 2.0)
                        .linear_gradient(
                            0.0,
                            [(0.0, alpha(colors[index], 0.55)), (1.0, colors[index])],
                        )
                        .pin(Some(x), Some(track_top + track_h - h), None, None),
                );
            }
            if index == 1
                && let Some(peak) = self.painted.peak
            {
                root = root.child(
                    el().size(VANTARE_TRACK_W + 6.0, 2.0)
                        .radius(1.0)
                        .fill(alpha(WHITE, 0.85))
                        .pin(
                            Some(x - 3.0),
                            Some(track_top + track_h * peak - 1.0),
                            None,
                            None,
                        ),
                );
            }
            let value = if self.transparent {
                self.shadowed(&pedal.text, mid, value_top)
            } else {
                self.vantare_value(&pedal.text, mid, value_top)
            };
            root = root.child(value);
        }
        root
    }
    /// Top warning band; returns the root and its height (0 when there is none).
    fn vantare_band(&self, mut root: El, width: f32) -> (El, f32) {
        let Some(band) = self.painted.band else {
            return (root, 0.0);
        };
        let s = &self.style;
        let c = &s.colors;
        let (height, base) = if self.painted.limiter {
            (20.0, 11.0)
        } else {
            (s.geometry.banner_height, s.fonts.banner)
        };
        let room = width - 2.0 * scene::PAD_X;
        let mut ink = font(s, Face::Display, base, height, 0.6, 600.0);
        let used = rune::text::measure(band, &[], ink, None).0;
        if used > room {
            ink = font(s, Face::Display, base * (room / used), height, 0.6, 600.0);
        }
        let radius = (self.variant().radius - 1.0).max(0.0);
        root = root
            .child(el().size(width, height).radius(radius).fill(c.yellow_fill))
            .child(el().size(width, radius).fill(c.yellow_fill).pin(
                Some(0.0),
                Some(height - radius),
                None,
                None,
            ))
            .child(el().size(width, 1.0).fill(c.yellow_line).pin(
                Some(0.0),
                Some(height - 1.0),
                None,
                None,
            ))
            .child(
                text(band)
                    .font(ink)
                    .color(c.yellow_text)
                    .size(room, height)
                    .align(Align::Center)
                    .pin(Some(scene::PAD_X), Some(0.0), None, None),
            );
        (root, height)
    }
    fn vantare_value(&self, value: &str, mid: f32, top: f32) -> El {
        text(value.to_owned())
            .font(font(
                &self.style,
                Face::Mono,
                VANTARE_VALUE_SIZE,
                VANTARE_VALUE_H,
                0.0,
                400.0,
            ))
            .color(self.style.colors.text)
            .size(TEXT_BOX, VANTARE_VALUE_H)
            .align(Align::Center)
            .pin(Some(mid - TEXT_BOX / 2.0), Some(top), None, None)
    }
    /// Lifts the text off the game, as GPUI's `label_shadow` does.
    fn shadowed(&self, value: &str, mid: f32, top: f32) -> El {
        let mut node = el().size(TEXT_BOX, VANTARE_VALUE_H).pin(
            Some(mid - TEXT_BOX / 2.0),
            Some(top),
            None,
            None,
        );
        for (dx, dy, strength) in [
            (-1.0, 0.0, 0.35),
            (1.0, 0.0, 0.35),
            (0.0, -1.0, 0.35),
            (0.0, 2.0, 0.35),
            (0.0, 1.0, 0.9),
        ] {
            node = node.child(
                text(value.to_owned())
                    .font(font(
                        &self.style,
                        Face::Mono,
                        VANTARE_VALUE_SIZE,
                        VANTARE_VALUE_H,
                        0.0,
                        400.0,
                    ))
                    .color(alpha(BLACK, strength))
                    .size(TEXT_BOX, VANTARE_VALUE_H)
                    .align(Align::Center)
                    .pin(Some(dx), Some(dy), None, None),
            );
        }
        node.child(self.vantare_value(value, TEXT_BOX / 2.0, 0.0))
    }
    fn eficiencia(&self) -> El {
        let width = self.size().width;
        let mut root = el()
            .key("pedals-view")
            .size(width, HEIGHT)
            .motion(rune::Spring::NONE);
        if !self.transparent {
            root = root.radius(6.0).fill(alpha(hex("#101113"), 0.90)).child(
                el().size(width, HEIGHT).radius(6.0).linear_gradient(
                    std::f32::consts::PI,
                    [
                        (0.0, alpha(WHITE, 0.04)),
                        (0.32, alpha(WHITE, 0.0)),
                        (1.0, alpha(WHITE, 0.0)),
                    ],
                ),
            );
        }
        let (mut root, status_height) = self.eficiencia_status(root, width);
        let value_top = EFICIENCIA_PAD_TOP + status_height;
        let track_top = value_top + EFICIENCIA_VALUE_H + 4.0;
        let track_h = HEIGHT
            - EFICIENCIA_PAD_TOP
            - EFICIENCIA_PAD_BOTTOM
            - status_height
            - (4.0 + EFICIENCIA_LABEL_H + 4.0 + EFICIENCIA_VALUE_H);
        let colors = [hex("#c9a15c"), hex("#d95360"), hex("#6fae7d")];
        let value_ink = hex("#f5f5f5");
        for (index, pedal) in self.painted.pedals.iter().enumerate() {
            let left = scene::PAD_X + index as f32 * (scene::EFICIENCIA_COLUMN_W + self.gap);
            let mid = left + scene::EFICIENCIA_COLUMN_W / 2.0;
            let track_x = mid - EFICIENCIA_TRACK_W / 2.0;
            root = root.child(
                el().size(EFICIENCIA_TRACK_W, track_h)
                    .radius(4.0)
                    .linear_gradient(
                        std::f32::consts::PI,
                        [(0.0, alpha(value_ink, 0.08)), (1.0, alpha(value_ink, 0.05))],
                    )
                    .border(1.0, alpha(value_ink, 0.08))
                    .pin(Some(track_x), Some(track_top), None, None),
            );
            if let Some(fill) = pedal.fill
                && fill > 0.0
            {
                let inner = track_h - 2.0;
                let h = fill * inner;
                let y = track_top + 1.0 + inner - h;
                root = root.child(el().size(12.0, h).radius(3.0).fill(colors[index]).pin(
                    Some(track_x + 1.0),
                    Some(y),
                    None,
                    None,
                ));
                // GPUI redondea solo las esquinas de arriba; el pie cuadrado lo tapa.
                let foot = h.min(3.0);
                root = root.child(el().size(12.0, foot).fill(colors[index]).pin(
                    Some(track_x + 1.0),
                    Some(track_top + 1.0 + inner - foot),
                    None,
                    None,
                ));
            }
            let label_top = track_top + track_h + 4.0;
            root = root.child(
                text(LABELS[index])
                    .font(font(
                        &self.style,
                        Face::Body,
                        11.0,
                        EFICIENCIA_LABEL_H,
                        1.98,
                        600.0,
                    ))
                    .color(alpha(hex("#b9b9bd"), 0.78))
                    .size(TEXT_BOX, EFICIENCIA_LABEL_H)
                    .align(Align::Center)
                    .pin(Some(mid - TEXT_BOX / 2.0), Some(label_top), None, None),
            );
            root = root.child(
                text(pedal.text.clone())
                    .font(font(
                        &self.style,
                        Face::Body,
                        11.0,
                        EFICIENCIA_VALUE_H,
                        0.0,
                        700.0,
                    ))
                    .color(value_ink)
                    .size(TEXT_BOX, EFICIENCIA_VALUE_H)
                    .align(Align::Center)
                    .pin(Some(mid - TEXT_BOX / 2.0), Some(value_top), None, None),
            );
        }
        if !self.transparent {
            root = root
                .child(
                    el().size(width, HEIGHT)
                        .radius(6.0)
                        .border(1.0, alpha(WHITE, 0.12)),
                )
                .child(
                    el().size(width, 6.0)
                        .radius(6.0)
                        .border_sides([1.0, 0.0, 0.0, 0.0], alpha(WHITE, 0.136))
                        .pin(Some(0.0), Some(0.0), None, None),
                );
        }
        root
    }
    /// Warning lines at the top left; returns the root and their reserved height.
    fn eficiencia_status(&self, mut root: El, width: f32) -> (El, f32) {
        let Some(band) = self.painted.band else {
            return (root, 0.0);
        };
        let lines: Vec<&str> = match band {
            "DATOS ANTIGUOS" => vec!["DATOS", "ANTIGUOS"],
            "DATA OUT OF DATE" => vec!["DATA OUT OF", "DATE"],
            _ => vec![band],
        };
        let room = width - 24.0;
        let mut size = 14.0;
        let longest = lines
            .iter()
            .map(|line| {
                rune::text::measure(
                    line,
                    &[],
                    font(&self.style, Face::Body, size, 18.0, 0.0, 700.0),
                    None,
                )
                .0
            })
            .fold(0.0, f32::max);
        if longest > room {
            size *= room / longest;
        }
        let ink = hex("#e2c568");
        for (index, line) in lines.iter().enumerate() {
            root = root.child(
                text(*line)
                    .font(font(&self.style, Face::Body, size, 18.0, 0.0, 700.0))
                    .color(ink)
                    .size(room, 18.0)
                    .pin(Some(12.0), Some(10.0 + index as f32 * 18.0), None, None),
            );
        }
        (root, 20.0 + lines.len() as f32 * 18.0)
    }
}

fn hex(value: &str) -> Color {
    rune::color::hex(value).expect("canonical Eficiencia color")
}
