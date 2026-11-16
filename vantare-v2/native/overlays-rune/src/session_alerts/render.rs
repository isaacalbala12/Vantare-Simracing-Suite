//! Vantare Look for Avisos de sesión: panel, franja, textos y filas de mini.
//! Every box, face and colour is copied from the GPUI painter.
use super::scene::{
    MAIN_HEIGHT, MAIN_WIDTH, MINI_HEIGHT, MINI_STEP, MINI_WIDTH, Notice, Placeholder, Scene,
};
use crate::vantare::paint::{Face, font};
use crate::vantare::{Style, Variant, alpha};
use rune::{Align, Color, El, Live, LiveText, Spring, el, text};
use std::sync::Arc;
use vantare_domain::geometry::Size;
use vantare_domain::session_alerts::Tone;

const fn rgb(value: u32, a: f32) -> Color {
    Color {
        r: ((value >> 16) & 0xff) as f32 / 255.0,
        g: ((value >> 8) & 0xff) as f32 / 255.0,
        b: (value & 0xff) as f32 / 255.0,
        a,
    }
}
/// GPUI literals: the title ink, the transparent-style shadow and the three panel styles.
const TITLE_INK: Color = rgb(0xfaf7f7, 1.0);
const SHADOW_INK: Color = rgb(0, 0.9);
const CARMIN_TOP: Color = rgb(0x341018, 0.96);
const CARMIN_BOTTOM: Color = rgb(0x14080c, 0.96);
const CLEAN: Color = rgb(0x080809, 0.82);
const CLEAR: Color = rgb(0, 0.0);

#[derive(Clone, Copy)]
struct Rect {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}
#[derive(Clone, Copy)]
struct Ink {
    face: Face,
    size: f32,
    tracking: f32,
    weight: f32,
}

/// Everything that decides a rebuild; the texts that change every second stay Live.
#[derive(PartialEq)]
struct Structure {
    size: (f32, f32),
    scale: f32,
    notice: Option<Notice>,
    placeholder: Option<Placeholder>,
    ghost: Option<String>,
    rows: Vec<(String, bool)>,
    style: String,
}

pub(super) struct Painter {
    style: Arc<Style>,
    panel_style: String,
    size: (f32, f32),
    scale: f32,
    notice: Option<Notice>,
    placeholder: Option<Placeholder>,
    ghost: Option<String>,
    rows: Vec<(String, bool)>,
    opacity: Live<f32>,
    value: LiveText,
    row_values: Vec<LiveText>,
    last: Option<Structure>,
}
impl Painter {
    pub fn new(scene: &Scene, panel_style: &str) -> Self {
        let mut painter = Self {
            style: Style::compiled(),
            panel_style: panel_style.to_owned(),
            size: scene.size,
            scale: scene.scale,
            notice: None,
            placeholder: None,
            ghost: None,
            rows: Vec::new(),
            opacity: Live::new(scene.opacity),
            value: LiveText::new(""),
            row_values: Vec::new(),
            last: None,
        };
        painter.sync(scene);
        painter
    }
    pub fn size(&self) -> Size {
        Size {
            width: self.size.0,
            height: self.size.1,
        }
    }
    pub fn view(&self) -> El {
        view(self)
    }
    /// The only build decision: panel style, presence of notice/rows and the static texts.
    pub fn sync(&mut self, scene: &Scene) -> crate::widget::Update {
        let mut pixels = self.opacity.set(scene.opacity);
        if let Some(notice) = &scene.notice {
            pixels |= self.value.set(notice.value.clone());
        }
        self.rows = scene
            .rows
            .iter()
            .map(|row| (row.label.clone(), row.calm))
            .collect();
        if self.row_values.len() != self.rows.len() {
            self.row_values = scene
                .rows
                .iter()
                .map(|row| LiveText::new(row.value.as_str()))
                .collect();
        } else {
            for (live, row) in self.row_values.iter_mut().zip(&scene.rows) {
                pixels |= live.set(row.value.clone());
            }
        }
        self.size = scene.size;
        self.scale = scene.scale;
        self.notice = scene.notice.clone();
        self.placeholder = scene.placeholder.clone();
        self.ghost = scene.ghost.clone();
        let structure = self.structure();
        let build = self.last.as_ref() != Some(&structure);
        self.last = Some(structure);
        crate::widget::Update { build, pixels }
    }
    fn structure(&self) -> Structure {
        Structure {
            size: self.size,
            scale: self.scale,
            notice: self.notice.clone(),
            placeholder: self.placeholder.clone(),
            ghost: self.ghost.clone(),
            rows: self.rows.clone(),
            style: self.panel_style.clone(),
        }
    }
}

fn variant(s: &Style, name: &str) -> Variant {
    let mut v = s.styles.neo.clone();
    match name {
        "carmin" => {
            v.top = CARMIN_TOP;
            v.bottom = CARMIN_BOTTOM;
            v.border_accent = 0.30;
            v.radius = 6.0;
            v.shadow_y = 12.0;
            v.shadow_blur = 28.0;
            v.shadow_alpha = 0.5;
        }
        "limpio" => {
            v.top = CLEAN;
            v.bottom = CLEAN;
            v.border = CLEAR;
            v.border_accent = 0.0;
            v.radius = 4.0;
            v.shadow_alpha = 0.0;
        }
        "transparente" => {
            v.top = CLEAR;
            v.bottom = CLEAR;
            v.border = CLEAR;
            v.border_accent = 0.0;
            v.shadow_alpha = 0.0;
        }
        _ => {}
    }
    v
}
/// The three tones of the notice, as the GPUI painter pairs fill and ink.
fn tones(s: &Style, tone: Tone) -> (Color, Color) {
    match tone {
        Tone::Mild => (s.colors.fcy_fill, s.colors.fcy_text),
        Tone::Final => (s.fuel.low_fill, s.fuel.low_text),
        Tone::Finished => (s.colors.final_fill, s.colors.final_text),
    }
}
/// GPUI adds the face baseline to the box top; Display needs it.
fn top(s: &Style, face: Face, y: f32) -> f32 {
    y + match face {
        Face::Display => s.fonts.display_baseline,
        Face::Mono => s.fonts.mono_baseline,
        Face::Body => 0.0,
    }
}
fn panel(s: &Style, v: &Variant, key: &str, w: f32, h: f32) -> El {
    let border = if v.border_accent > 0.0 {
        alpha(s.accents.red, v.border_accent)
    } else {
        v.border
    };
    el().key(key)
        .size(w, h)
        .pin(Some(0.0), Some(0.0), None, None)
        .radius(v.radius)
        .border(1.0, border)
        .linear_gradient(std::f32::consts::PI, [(0.0, v.top), (1.0, v.bottom)])
        .shadow(
            v.shadow_y,
            v.shadow_blur,
            alpha(
                Color {
                    a: 1.0,
                    ..s.colors.shadow
                },
                v.shadow_alpha,
            ),
        )
}
fn band(s: &Style, v: &Variant, key: &str, w: f32, fill: Color) -> El {
    let radius = (v.radius - 1.0).max(0.0);
    el().key(key)
        .size(w, s.geometry.banner_height)
        .pin(Some(0.0), Some(0.0), None, None)
        .corners([radius, radius, 0.0, 0.0])
        .fill(fill)
}
#[allow(clippy::too_many_arguments)] // Una celda de texto con su sombra, como la primitiva del kit.
fn text_node(
    s: &Style,
    value: &str,
    key: &str,
    at: Rect,
    ink: Ink,
    align: Align,
    color: Color,
    truncate: bool,
) -> El {
    let mut node = text(value)
        .key(key)
        .font(font(s, ink.face, ink.size, at.h, ink.tracking, ink.weight))
        .color(color)
        .size(at.w, at.h)
        .align(align);
    if truncate {
        node = node.truncate();
    }
    node.pin(Some(at.x), Some(top(s, ink.face, at.y)), None, None)
}
fn live_node(
    s: &Style,
    value: &LiveText,
    key: &str,
    at: Rect,
    ink: Ink,
    align: Align,
    color: Color,
) -> El {
    text(value.get().to_string())
        .key(key)
        .live_text(value)
        .font(font(s, ink.face, ink.size, at.h, ink.tracking, ink.weight))
        .color(color)
        .size(at.w, at.h)
        .align(align)
        .truncate_fade_width(0.0)
        .pin(Some(at.x), Some(top(s, ink.face, at.y)), None, None)
}
/// GPUI draws every label twice, one pixel lower, in the transparent style.
#[allow(clippy::too_many_arguments)] // Envoltorio de la sombra de una celda.
fn shadowed(
    s: &Style,
    root: El,
    value: &str,
    key: &str,
    at: Rect,
    ink: Ink,
    align: Align,
    shadow: bool,
) -> El {
    if !shadow {
        return root;
    }
    root.child(text_node(
        s,
        value,
        &format!("{key}-shadow"),
        Rect {
            y: at.y + 1.0,
            ..at
        },
        ink,
        align,
        SHADOW_INK,
        false,
    ))
}
#[allow(clippy::too_many_arguments)]
fn fixed(
    s: &Style,
    root: El,
    value: &str,
    key: &str,
    at: Rect,
    ink: Ink,
    align: Align,
    color: Color,
    shadow: bool,
    truncate: bool,
) -> El {
    let root = shadowed(s, root, value, key, at, ink, align, shadow);
    root.child(text_node(s, value, key, at, ink, align, color, truncate))
}
#[allow(clippy::too_many_arguments)]
fn live(
    s: &Style,
    root: El,
    value: &LiveText,
    key: &str,
    at: Rect,
    ink: Ink,
    align: Align,
    color: Color,
    shadow: bool,
) -> El {
    let root = shadowed(s, root, &value.get(), key, at, ink, align, shadow);
    root.child(live_node(s, value, key, at, ink, align, color))
}

fn view(state: &Painter) -> El {
    let s = &state.style;
    let v = &variant(s, &state.panel_style);
    let (width, height) = state.size;
    let shadow = state.panel_style == "transparente";
    let mut root = el()
        .key("session-alerts")
        .size(width, height)
        .motion(Spring::NONE)
        .live_opacity(&state.opacity);
    if let Some(notice) = &state.notice {
        let (fill, ink) = tones(s, notice.tone);
        let band_ink = Ink {
            face: Face::Display,
            size: s.fonts.banner,
            tracking: s.fonts.banner_tracking,
            weight: 600.0,
        };
        let mono = Ink {
            face: Face::Mono,
            size: s.fonts.mono_small,
            tracking: 0.0,
            weight: 400.0,
        };
        root = root
            .child(panel(s, v, "panel", MAIN_WIDTH, MAIN_HEIGHT))
            .child(band(s, v, "band", MAIN_WIDTH, fill));
        root = fixed(
            s,
            root,
            &notice.band.to_uppercase(),
            "band-title",
            Rect {
                x: v.padding_x,
                y: 0.0,
                w: MAIN_WIDTH / 2.0,
                h: s.geometry.banner_height,
            },
            band_ink,
            Align::Start,
            ink,
            shadow,
            false,
        );
        root = fixed(
            s,
            root,
            &notice.context,
            "band-context",
            Rect {
                x: v.padding_x,
                y: 0.0,
                w: MAIN_WIDTH - 2.0 * v.padding_x,
                h: s.geometry.banner_height,
            },
            mono,
            Align::End,
            ink,
            shadow,
            false,
        );
        root = fixed(
            s,
            root,
            &notice.title,
            "title",
            Rect {
                x: 14.0,
                y: 31.0,
                w: 340.0,
                h: 24.0,
            },
            Ink {
                face: Face::Display,
                size: 20.0,
                tracking: 1.4,
                weight: 600.0,
            },
            Align::Start,
            TITLE_INK,
            shadow,
            true,
        );
        root = fixed(
            s,
            root,
            &notice.detail,
            "detail",
            Rect {
                x: 14.0,
                y: 57.0,
                w: 338.0,
                h: 16.0,
            },
            Ink {
                face: Face::Body,
                size: 12.0,
                tracking: 0.0,
                weight: s.fonts.regular_weight,
            },
            Align::Start,
            s.colors.header_em,
            shadow,
            true,
        );
        root = live(
            s,
            root,
            &state.value,
            "value",
            Rect {
                x: 14.0,
                y: 27.0,
                w: 466.0 - 14.0,
                h: 38.0,
            },
            Ink {
                face: Face::Display,
                size: s.delta.big,
                tracking: 0.0,
                weight: 600.0,
            },
            Align::End,
            s.colors.text,
            shadow,
        );
        root = fixed(
            s,
            root,
            &notice.small,
            "small",
            Rect {
                x: 14.0,
                y: 64.0,
                w: 466.0 - 14.0,
                h: 12.0,
            },
            Ink {
                face: Face::Mono,
                size: 10.0,
                tracking: 0.0,
                weight: 400.0,
            },
            Align::End,
            s.colors.muted,
            shadow,
            false,
        );
    } else if let Some(placeholder) = &state.placeholder {
        root = root
            .child(panel(s, v, "panel", MAIN_WIDTH, MAIN_HEIGHT))
            .child(band(s, v, "band", MAIN_WIDTH, s.colors.stops_fill));
        root = fixed(
            s,
            root,
            &placeholder.band.to_uppercase(),
            "band-title",
            Rect {
                x: v.padding_x,
                y: 0.0,
                w: MAIN_WIDTH / 2.0,
                h: s.geometry.banner_height,
            },
            Ink {
                face: Face::Display,
                size: s.fonts.banner,
                tracking: s.fonts.banner_tracking,
                weight: 600.0,
            },
            Align::Start,
            s.colors.text,
            shadow,
            false,
        );
        root = fixed(
            s,
            root,
            &placeholder.context,
            "band-context",
            Rect {
                x: v.padding_x,
                y: 0.0,
                w: MAIN_WIDTH - 2.0 * v.padding_x,
                h: s.geometry.banner_height,
            },
            Ink {
                face: Face::Mono,
                size: s.fonts.mono_small,
                tracking: 0.0,
                weight: 400.0,
            },
            Align::End,
            s.colors.text,
            shadow,
            false,
        );
        root = fixed(
            s,
            root,
            &placeholder.title,
            "title",
            Rect {
                x: 14.0,
                y: 31.0,
                w: 340.0,
                h: 24.0,
            },
            Ink {
                face: Face::Display,
                size: 20.0,
                tracking: 1.4,
                weight: 600.0,
            },
            Align::Start,
            s.colors.text,
            shadow,
            false,
        );
        root = fixed(
            s,
            root,
            &placeholder.detail,
            "detail",
            Rect {
                x: 14.0,
                y: 57.0,
                w: 338.0,
                h: 16.0,
            },
            Ink {
                face: Face::Body,
                size: 12.0,
                tracking: 0.0,
                weight: s.fonts.regular_weight,
            },
            Align::Start,
            s.colors.header_em,
            shadow,
            false,
        );
    } else if let Some(ghost) = &state.ghost {
        let scale = state.scale;
        root = root
            .child(panel(
                s,
                v,
                "ghost-panel",
                MINI_WIDTH * scale,
                MINI_HEIGHT * scale,
            ))
            .child(text_node(
                s,
                ghost,
                "ghost",
                Rect {
                    x: 16.0 * scale,
                    y: 0.0,
                    w: MINI_WIDTH * scale - 16.0 * scale,
                    h: MINI_HEIGHT * scale,
                },
                Ink {
                    face: Face::Body,
                    size: 11.0 * scale,
                    tracking: 0.3,
                    weight: s.fonts.regular_weight,
                },
                Align::Start,
                s.colors.muted,
                false,
            ));
    }
    for (index, (label, calm)) in state.rows.iter().enumerate() {
        let scale = state.scale;
        let y = index as f32 * MINI_STEP * scale;
        let width = MINI_WIDTH * scale;
        let row = MINI_HEIGHT * scale;
        root = root.child(panel(s, v, &format!("row-{index}"), width, row).pin(
            Some(0.0),
            Some(y),
            None,
            None,
        ));
        root = fixed(
            s,
            root,
            label,
            &format!("row-label-{index}"),
            Rect {
                x: 16.0 * scale,
                y,
                w: 104.0 * scale,
                h: row,
            },
            Ink {
                face: Face::Body,
                size: s.delta.pill_label * scale,
                tracking: 0.3,
                weight: s.fonts.regular_weight,
            },
            Align::Start,
            s.colors.muted,
            false,
            true,
        );
        let color = if *calm {
            s.colors.yellow
        } else {
            s.colors.loss
        };
        if let Some(value) = state.row_values.get(index) {
            root = live(
                s,
                root,
                value,
                &format!("row-value-{index}"),
                Rect {
                    x: 16.0 * scale,
                    y,
                    w: 194.0 * scale - 16.0 * scale,
                    h: row,
                },
                Ink {
                    face: Face::Display,
                    size: s.delta.pill_value * scale,
                    tracking: 0.3,
                    weight: 600.0,
                },
                Align::End,
                color,
                false,
            );
        }
    }
    root
}
