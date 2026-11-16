//! Vantare neo Look for Cara a cara: it paints only what the pure scene gives.
//! Boxes, faces and colours live here; nothing is measured or invented.
use super::scene::{Duel, Scene};
use super::{HEIGHT, PAUSE_HEIGHT, WIDTH};
use crate::vantare::Style;
use crate::vantare::alpha;
use crate::vantare::paint::{Face, WHITE, font};
use rune::{Align, Color, El, Live, LiveText, Spring, el, text};
use std::sync::Arc;
use vantare_domain::format::PLACEHOLDER;
use vantare_domain::geometry::Size;

/// One painted box in widget pixels.
#[derive(Clone, Copy)]
struct Rect {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}

/// Face, size and tracking of one text; the weight completes the GPUI ink.
#[derive(Clone, Copy)]
struct Ink {
    face: Face,
    size: f32,
    tracking: f32,
    weight: f32,
}

// Fixed boxes copied from the GPUI painter; the halves bring their own left edge.
const BAND: Rect = Rect {
    x: 0.0,
    y: 6.0,
    w: 200.0,
    h: 60.0,
};
const HEADER: Rect = Rect {
    x: 265.0,
    y: 6.0,
    w: 127.0,
    h: 12.0,
};
/// Centre column: the free gap between both halves, centred on x = 300.
const CENTRE: Rect = Rect {
    x: 208.0,
    y: 0.0,
    w: 184.0,
    h: 0.0,
};
const DIVIDER: Rect = Rect {
    x: 600.0,
    y: 6.0,
    w: 1.0,
    h: 60.0,
};
const STATUS: Rect = Rect {
    x: 330.0,
    y: 26.0,
    w: 442.0,
    h: 20.0,
};

/// GPUI never truncates the lap or the sector value, so their boxes are wider than
/// any value the projection can emit (a 12-minute lap is 66 px at Mono 12).
const LAP_WIDTH: f32 = 96.0;
const SECTOR_WIDTH: f32 = 96.0;
/// Colours of the GPUI painter literals: the player band, the name cell and the pause band.
const PLAYER_FILL: Color = Color {
    r: 0.7529422,
    g: 0.06847817,
    b: 0.08865559,
    a: 0.18,
}; // #e14a54
const NAME_INK: Color = Color {
    r: 0.9559733,
    g: 0.9301109,
    b: 0.9301109,
    a: 1.0,
}; // #faf7f7
const PAUSE_FILL: Color = Color {
    r: 0.00518152,
    g: 0.00560539,
    b: 0.00651209,
    a: 242.0 / 255.0,
}; // #101113

struct HalfLive {
    x: f32,
    /// Static: GPUI cuts this cell with a marker, so the Look must `truncate` it.
    label: String,
    lap: LiveText,
    caption: LiveText,
}
struct SectorLive {
    x: f32,
    label: &'static str,
    delta: LiveText,
    color: Live<Color>,
}

/// Structure decides a rebuild; texts and inks stay Live for fixed boxes.
#[derive(PartialEq)]
struct Structure {
    duel: bool,
    band: Option<usize>,
    halves: [f32; 2],
    /// The cut cell is static so Rune can paint its «…»; a new label rebuilds.
    labels: [String; 2],
    sectors: Vec<f32>,
    bars: [Color; 3],
    paused: bool,
}

pub(super) struct Painter {
    style: Arc<Style>,
    duel: bool,
    band: Option<usize>,
    paused: bool,
    halves: [HalfLive; 2],
    sectors: Vec<SectorLive>,
    header: LiveText,
    gap: LiveText,
    trend: LiveText,
    catch: LiveText,
    status: LiveText,
    pause: LiveText,
    gap_ink: Live<Color>,
    trend_ink: Live<Color>,
    last_structure: Option<Structure>,
}
impl Painter {
    pub fn new(scene: &Scene) -> Self {
        let mut painter = Self {
            style: Style::compiled(),
            duel: false,
            band: None,
            paused: false,
            halves: std::array::from_fn(|_| HalfLive {
                x: 0.0,
                label: String::new(),
                lap: LiveText::new(""),
                caption: LiveText::new(""),
            }),
            sectors: Vec::new(),
            header: LiveText::new(""),
            gap: LiveText::new(""),
            trend: LiveText::new(""),
            catch: LiveText::new(""),
            status: LiveText::new(""),
            pause: LiveText::new(""),
            gap_ink: Live::new(WHITE),
            trend_ink: Live::new(WHITE),
            last_structure: None,
        };
        painter.sync(scene);
        painter
    }
    pub fn size(&self) -> Size {
        Size {
            width: WIDTH,
            height: HEIGHT + if self.paused { PAUSE_HEIGHT } else { 0.0 },
        }
    }
    pub fn view(&self) -> El {
        view(self)
    }
    /// The only build decision: structure, while texts and inks stay Live.
    pub fn sync(&mut self, scene: &Scene) -> crate::widget::Update {
        let mut pixels = false;
        self.paused = scene.pause.is_some();
        pixels |= self.pause.set(scene.pause.clone().unwrap_or_default());
        if let Some(duel) = &scene.duel {
            self.duel = true;
            for (live, half) in self.halves.iter_mut().zip(&duel.halves) {
                live.x = half.x;
                live.label = half.label();
                pixels |= live.lap.set(half.lap.clone());
                pixels |= live.caption.set(half.caption.clone());
            }
            pixels |= self.header.set(duel.header.clone());
            pixels |= self.gap.set(duel.gap.clone());
            pixels |= self.trend.set(duel.trend.clone());
            pixels |= self.catch.set(duel.catch.clone());
            pixels |= self.gap_ink.set(difference_color(&duel.gap, &self.style));
            pixels |= self.trend_ink.set(trend_color(duel, &self.style));
            self.band = duel.halves.iter().position(|half| half.is_player);
            // Handles are created before the view that paints them and then reused.
            if self.sectors.len() != duel.sectors.len() {
                self.sectors = duel
                    .sectors
                    .iter()
                    .map(|sector| SectorLive {
                        x: sector.x,
                        label: sector.label,
                        delta: LiveText::new(sector.delta.as_str()),
                        color: Live::new(difference_color(&sector.delta, &self.style)),
                    })
                    .collect();
            } else {
                for (live, sector) in self.sectors.iter_mut().zip(&duel.sectors) {
                    live.x = sector.x;
                    live.label = sector.label;
                    pixels |= live.delta.set(sector.delta.clone());
                    pixels |= live.color.set(difference_color(&sector.delta, &self.style));
                }
            }
        } else {
            self.duel = false;
            self.band = None;
            self.sectors.clear();
            pixels |= self.status.set(scene.status.clone().unwrap_or_default());
        }
        let structure = self.structure();
        let build = self.last_structure.as_ref() != Some(&structure);
        self.last_structure = Some(structure);
        crate::widget::Update { build, pixels }
    }
    fn structure(&self) -> Structure {
        Structure {
            duel: self.duel,
            band: self.band,
            halves: self.halves.each_ref().map(|half| half.x),
            labels: self.halves.each_ref().map(|half| half.label.clone()),
            sectors: self.sectors.iter().map(|sector| sector.x).collect(),
            bars: std::array::from_fn(|index| {
                self.sectors
                    .get(index)
                    .map_or(WHITE, |sector| sector.color.get())
            }),
            paused: self.paused,
        }
    }
}

/// GPUI colours a printed value by its own sign; `—` and empty stay muted.
fn difference_color(value: &str, style: &Style) -> Color {
    let parsed = value.strip_prefix('−').map_or_else(
        || value.parse::<f64>().ok(),
        |rest| rest.parse::<f64>().ok().map(|seconds| -seconds),
    );
    match parsed.filter(|seconds| seconds.is_finite()) {
        Some(seconds) if seconds < 0.0 => style.colors.gain,
        Some(seconds) if seconds > 0.0 => style.colors.loss,
        _ => style.colors.muted,
    }
}
fn trend_color(duel: &Duel, style: &Style) -> Color {
    if duel.trend.is_empty() || duel.trend == PLACEHOLDER {
        style.colors.muted
    } else if duel.good {
        style.colors.gain
    } else {
        style.colors.loss
    }
}

/// GPUI adds the face's baseline offset to the box top; without it Display sits 1 px high.
fn top(s: &Style, face: Face, y: f32) -> f32 {
    y + match face {
        Face::Display => s.fonts.display_baseline,
        Face::Mono => s.fonts.mono_baseline,
        Face::Body => 0.0,
    }
}

fn area(key: &str, at: Rect, fill: Color, radius: f32) -> El {
    el().key(key)
        .size(at.w, at.h)
        .pin(Some(at.x), Some(at.y), None, None)
        .fill(fill)
        .radius(radius)
}
fn cell(
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
/// Static text: one line cut with the Rune ellipsis when wider than its box,
/// which is how the name cell and the sector labels are painted.
fn fixed(s: &Style, value: &str, key: &str, at: Rect, ink: Ink, align: Align, color: Color) -> El {
    text(value)
        .key(key)
        .font(font(s, ink.face, ink.size, at.h, ink.tracking, ink.weight))
        .color(color)
        .size(at.w, at.h)
        .align(align)
        .truncate()
        .pin(Some(at.x), Some(top(s, ink.face, at.y)), None, None)
}

fn view(state: &Painter) -> El {
    let s = &state.style;
    let v = &s.styles.neo;
    let border = if v.border_accent > 0.0 {
        alpha(s.accents.red, v.border_accent)
    } else {
        v.border
    };
    let mut root = el()
        .key("head-to-head-view")
        .size(state.size().width, state.size().height)
        .motion(Spring::NONE)
        .child(
            el().size(WIDTH, HEIGHT)
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
                ),
        );
    if state.duel {
        let player = PLAYER_FILL;
        let name = NAME_INK;
        for (index, live) in state.halves.iter().enumerate() {
            if state.band == Some(index) {
                root = root.child(area(
                    &format!("band-{index}"),
                    Rect { x: live.x, ..BAND },
                    player,
                    6.0,
                ));
            }
            root = root
                .child(fixed(
                    s,
                    &live.label,
                    &format!("name-{index}"),
                    Rect {
                        x: live.x + 10.0,
                        y: 18.0,
                        w: 180.0,
                        h: 18.0,
                    },
                    Ink {
                        face: Face::Body,
                        size: 13.0,
                        tracking: 0.0,
                        weight: s.fonts.regular_weight,
                    },
                    Align::Start,
                    name,
                ))
                .child(cell(
                    s,
                    &live.caption,
                    &format!("caption-{index}"),
                    Rect {
                        x: live.x + 10.0,
                        y: 40.0,
                        w: 50.0,
                        h: 16.0,
                    },
                    Ink {
                        face: Face::Body,
                        size: 10.0,
                        tracking: 0.3,
                        weight: s.fonts.regular_weight,
                    },
                    Align::Start,
                    s.colors.muted,
                ))
                .child(cell(
                    s,
                    &live.lap,
                    &format!("lap-{index}"),
                    Rect {
                        x: live.x + 62.0,
                        y: 40.0,
                        w: LAP_WIDTH,
                        h: 16.0,
                    },
                    Ink {
                        face: Face::Mono,
                        size: 12.0,
                        tracking: 0.0,
                        weight: 400.0,
                    },
                    Align::Start,
                    s.colors.text,
                ));
        }
        root = root
            .child(cell(
                s,
                &state.header,
                "header",
                HEADER,
                Ink {
                    face: Face::Display,
                    size: 10.0,
                    tracking: 1.4,
                    weight: 600.0,
                },
                Align::Start,
                s.colors.muted,
            ))
            .child(
                cell(
                    s,
                    &state.gap,
                    "gap",
                    Rect {
                        y: 18.0,
                        h: 22.0,
                        ..CENTRE
                    },
                    Ink {
                        face: Face::Display,
                        size: 22.0,
                        tracking: 0.5,
                        weight: 600.0,
                    },
                    Align::Center,
                    s.colors.muted,
                )
                .live_text_color(&state.gap_ink),
            )
            .child(
                cell(
                    s,
                    &state.trend,
                    "trend",
                    Rect {
                        y: 41.0,
                        h: 12.0,
                        ..CENTRE
                    },
                    Ink {
                        face: Face::Mono,
                        size: 10.0,
                        tracking: 0.0,
                        weight: 400.0,
                    },
                    Align::Center,
                    s.colors.muted,
                )
                .live_text_color(&state.trend_ink),
            )
            .child(cell(
                s,
                &state.catch,
                "catch",
                Rect {
                    y: 54.0,
                    h: 12.0,
                    ..CENTRE
                },
                Ink {
                    face: Face::Mono,
                    size: 10.0,
                    tracking: 0.0,
                    weight: 400.0,
                },
                Align::Center,
                s.colors.muted,
            ))
            .child(area("divider", DIVIDER, alpha(WHITE, 0.08), 0.0));
        for (index, live) in state.sectors.iter().enumerate() {
            root = root
                .child(fixed(
                    s,
                    live.label,
                    &format!("sector-label-{index}"),
                    Rect {
                        x: live.x,
                        y: 15.0,
                        w: 47.0,
                        h: 12.0,
                    },
                    Ink {
                        face: Face::Display,
                        size: 10.0,
                        tracking: 1.4,
                        weight: 600.0,
                    },
                    Align::Start,
                    s.colors.muted,
                ))
                .child(
                    cell(
                        s,
                        &live.delta,
                        &format!("sector-{index}"),
                        Rect {
                            x: live.x,
                            y: 30.0,
                            // El último sector no puede salirse de la ventana: el
                            // valor real (Mono 12, seis cifras) cabe de sobra.
                            w: SECTOR_WIDTH.min(WIDTH - live.x),
                            h: 16.0,
                        },
                        Ink {
                            face: Face::Mono,
                            size: 12.0,
                            tracking: 0.0,
                            weight: 400.0,
                        },
                        Align::Start,
                        s.colors.muted,
                    )
                    .live_text_color(&live.color),
                )
                .child(area(
                    &format!("sector-bar-{index}"),
                    Rect {
                        x: live.x,
                        y: 51.0,
                        w: 47.0,
                        h: 3.0,
                    },
                    live.color.get(),
                    1.5,
                ));
        }
    } else {
        root = root.child(cell(
            s,
            &state.status,
            "status",
            STATUS,
            Ink {
                face: Face::Display,
                size: 13.0,
                tracking: 1.4,
                weight: 600.0,
            },
            Align::Start,
            s.colors.muted,
        ));
    }
    if state.paused {
        root = root
            .child(area(
                "pause-band",
                Rect {
                    x: 0.0,
                    y: HEIGHT,
                    w: WIDTH,
                    h: PAUSE_HEIGHT,
                },
                PAUSE_FILL,
                0.0,
            ))
            .child(cell(
                s,
                &state.pause,
                "pause",
                Rect {
                    x: 8.0,
                    y: HEIGHT,
                    w: WIDTH - 8.0,
                    h: PAUSE_HEIGHT,
                },
                Ink {
                    face: Face::Body,
                    size: 11.0,
                    tracking: 0.22,
                    weight: 600.0,
                },
                Align::Start,
                WHITE,
            ));
    }
    root
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gpui_colors_are_srgb_decoded_in_linear_rune() {
        assert_eq!(PLAYER_FILL.hex(), "#e14a542e");
        assert_eq!(NAME_INK.hex(), "#faf7f7ff");
        assert_eq!(PAUSE_FILL.hex(), "#101113f2");
    }
}
