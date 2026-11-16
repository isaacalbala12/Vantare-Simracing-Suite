//! Canonical GPUI layout. Straight segments retain GPUI's line-then-fill order.
use crate::{
    vantare::{
        Style, alpha,
        paint::{Face, font},
    },
    widget::Update,
};
use rune::{Align, Color, El, LineCap, LiveText, Path, Shape, canvas, el, text};
use std::sync::Arc;
use vantare_domain::{
    delta_trace::{Details, LapHistory, Sample, ViewModel},
    format::{Language, Preferences},
};

#[derive(Clone, Debug, PartialEq)]
pub(super) enum Op {
    Line([f32; 2], [f32; 2], f32, u32, f32),
    Fill([[f32; 2]; 4], u32, f32),
    Rect([f32; 4], f32, u32, f32),
}
type Points = Vec<(f32, f32, bool)>;
#[derive(PartialEq)]
struct GraphKey {
    current: Points,
    previous: Points,
    invalid: bool,
}
#[derive(PartialEq)]
struct Scene {
    texts: [String; 7],
    colors: [u32; 4],
    graph: Arc<Vec<Op>>,
}
pub(super) struct Painter {
    style: Arc<Style>,
    es: bool,
    scene: Scene,
    texts: [LiveText; 7],
    samples: Arc<Vec<Sample>>,
    key: GraphKey,
    shape: Shape,
}
fn color(rgb: u32, a: f32) -> Color {
    let channel = |shift: u32| rune::color::srgb_decode(((rgb >> shift) & 255_u32) as f32 / 255.0);
    Color {
        r: channel(16),
        g: channel(8),
        b: channel(0),
        a,
    }
}
fn graph_key(history: &LapHistory, invalid: bool) -> GraphKey {
    let points = |p: &[vantare_domain::delta_trace::LapPoint]| {
        p.iter().map(|p| (p.progress, p.delta, p.cut)).collect()
    };
    GraphKey {
        current: points(&history.points),
        previous: points(&history.previous),
        invalid,
    }
}
fn gain(delta: f32) -> u32 {
    if delta < 0.0 { 0x4ade80 } else { 0xff7a82 }
}
fn graph(samples: &[Sample], key: &GraphKey) -> Vec<Op> {
    let mut ops = Vec::new();
    let position = |p: (f32, f32, bool)| [12.0 + 736.0 * p.0, 92.0 - 108.0 * p.1.clamp(-0.5, 0.5)];
    if key.current.is_empty() {
        let end = samples.last().map_or(std::time::Duration::ZERO, |s| s.at);
        let start = samples.first().map_or(end, |s| s.at);
        let span = end.saturating_sub(start).as_secs_f32().max(0.001);
        let mut connected = false;
        for (index, pair) in samples.windows(2).enumerate() {
            if key.invalid && index / 3 % 2 == 1 {
                continue;
            }
            if let (Some(a), Some(b)) = (pair[0].delta_seconds, pair[1].delta_seconds) {
                if pair[1].break_before {
                    continue;
                }
                let point = |s: &Sample, v: f64| {
                    [
                        12.0 + 736.0 * s.at.saturating_sub(start).as_secs_f32() / span,
                        92.0 - 108.0 * v.clamp(-0.5, 0.5) as f32,
                    ]
                };
                ops.push(Op::Line(
                    point(&pair[0], a),
                    point(&pair[1], b),
                    2.2,
                    if key.invalid {
                        0x6e6668
                    } else if b < 0.0 {
                        0x4ade80
                    } else {
                        0xff7a82
                    },
                    1.0,
                ));
                connected = true;
            }
        }
        if connected && let Some(v) = samples.last().and_then(|s| s.delta_seconds) {
            ops.push(Op::Rect(
                [744.0, 88.0 - 108.0 * v.clamp(-0.5, 0.5) as f32, 8.0, 8.0],
                4.0,
                0xffffff,
                1.0,
            ));
        }
    } else {
        for (points, previous) in [(&key.previous, true), (&key.current, false)] {
            for (index, pair) in points.windows(2).enumerate() {
                if pair[1].2 || (key.invalid && !previous && index / 3 % 2 == 1) {
                    continue;
                }
                let a = position(pair[0]);
                let b = position(pair[1]);
                let rgb = if previous {
                    0xffffff
                } else if key.invalid {
                    0x6e6668
                } else {
                    gain(pair[1].1)
                };
                ops.push(Op::Line(
                    a,
                    b,
                    if previous { 1.2 } else { 2.2 },
                    rgb,
                    if previous { 0.22 } else { 1.0 },
                ));
                if !previous && !key.invalid {
                    ops.push(Op::Fill([a, b, [b[0], 92.0], [a[0], 92.0]], rgb, 0.22));
                }
            }
        }
        let last = *key.current.last().expect("current lap");
        let p = position(last);
        ops.push(Op::Rect([p[0], 32.0, 1.0, 120.0], 0.0, 0xffffff, 0.25));
        ops.push(Op::Rect(
            [p[0] - 4.0, p[1] - 4.0, 8.0, 8.0],
            4.0,
            0xffffff,
            1.0,
        ));
    }
    ops
}
fn scene(vm: &ViewModel, details: &Details, graph: Arc<Vec<Op>>) -> Scene {
    Scene {
        texts: [
            details.header.clone(),
            details.position.clone(),
            vm.current_text.clone(),
            vm.status_text.unwrap_or_default().into(),
            details.sector_text[0].clone(),
            details.sector_text[1].clone(),
            details.sector_text[2].clone(),
        ],
        colors: [
            if details.invalid {
                0x6e6668
            } else if vm.current_text.starts_with(['-', '−']) {
                0x4ade80
            } else {
                0xff7a82
            },
            details.sectors[0].map_or(0x3a3335, |v| if v < 0.0 { 0x22c55e } else { 0xf25a5a }),
            details.sectors[1].map_or(0x3a3335, |v| if v < 0.0 { 0x22c55e } else { 0xf25a5a }),
            details.sectors[2].map_or(0x3a3335, |v| if v < 0.0 { 0x22c55e } else { 0xf25a5a }),
        ],
        graph,
    }
}
impl Painter {
    pub fn new(
        vm: &ViewModel,
        samples: &Arc<Vec<Sample>>,
        history: &LapHistory,
        details: &Details,
        prefs: Preferences,
    ) -> Self {
        let key = graph_key(history, details.invalid);
        let graph = Arc::new(graph(samples, &key));
        let scene = scene(vm, details, graph);
        let texts = std::array::from_fn(|i| LiveText::new(scene.texts[i].as_str()));
        let mut p = Self {
            style: Style::compiled(),
            es: prefs.language == Language::Es,
            scene,
            texts,
            samples: samples.clone(),
            key,
            shape: Shape::new(),
        };
        p.shape = p.make_shape();
        p
    }
    pub fn sync(
        &mut self,
        vm: &ViewModel,
        samples: &Arc<Vec<Sample>>,
        history: &LapHistory,
        details: &Details,
    ) -> Update {
        let key = graph_key(history, details.invalid);
        let graph = if Arc::ptr_eq(samples, &self.samples) && key == self.key {
            self.scene.graph.clone()
        } else {
            Arc::new(graph(samples, &key))
        };
        let next = scene(vm, details, graph);
        if next == self.scene {
            self.samples = samples.clone();
            self.key = key;
            return Update::default();
        }
        let build = next.graph != self.scene.graph || next.colors != self.scene.colors;
        for (live, value) in self.texts.iter().zip(&next.texts) {
            live.set(value.clone());
        }
        let changed_graph = next.graph != self.scene.graph;
        self.scene = next;
        self.samples = samples.clone();
        self.key = key;
        if changed_graph {
            self.shape = self.make_shape();
        }
        Update {
            build,
            pixels: true,
        }
    }
    #[cfg(test)]
    pub(super) fn graph(&self) -> Arc<Vec<Op>> {
        self.scene.graph.clone()
    }
    fn make_shape(&self) -> Shape {
        let mut shape = Shape::new();
        for op in self.scene.graph.iter() {
            match op {
                Op::Line(a, b, width, rgb, opacity) => {
                    shape = shape.stroke_path(
                        &Path::new().move_to(*a).line_to(*b),
                        *width,
                        LineCap::Butt,
                        color(*rgb, *opacity),
                    )
                }
                Op::Fill(points, rgb, opacity) => {
                    let mut p = Path::new().move_to(points[0]);
                    for point in &points[1..] {
                        p = p.line_to(*point);
                    }
                    shape = shape.fill_path(&p.close(), color(*rgb, *opacity));
                }
                Op::Rect(..) => {} // Exact rounded primitives follow the ordered graph paths.
            }
        }
        shape
    }
    #[allow(clippy::too_many_arguments)] // Canonical GPUI label geometry.
    fn label(
        &self,
        value: El,
        key: &str,
        b: [f32; 4],
        face: Face,
        size: f32,
        tracking: f32,
        rgb: Color,
        right: bool,
    ) -> El {
        let [x, y, w, h] = b;
        let s = &self.style;
        let y = y + match face {
            Face::Display => s.fonts.display_baseline,
            Face::Mono => s.fonts.mono_baseline,
            Face::Body => 0.0,
        };
        value
            .key(key)
            .size(w, h)
            .font(font(
                s,
                face,
                size,
                h,
                tracking,
                match face {
                    Face::Display => 600.0,
                    Face::Mono => 400.0,
                    Face::Body => s.fonts.regular_weight,
                },
            ))
            .color(rgb)
            .align(if right { Align::End } else { Align::Start })
            .pin(Some(x), Some(y), None, None)
    }
    pub fn view(&self) -> El {
        let s = &self.style;
        let v = &s.styles.neo;
        let border = if v.border_accent > 0.0 {
            alpha(s.accents.red, v.border_accent)
        } else {
            v.border
        };
        let mut root = el()
            .key("delta-trace")
            .size(760.0, 192.0)
            .motion(rune::Spring::NONE)
            .radius(v.radius)
            .border(1.0, border)
            .linear_gradient(std::f32::consts::PI, [(0.0, v.top), (1.0, v.bottom)])
            .shadow(
                v.shadow_y,
                v.shadow_blur,
                alpha(s.colors.shadow, v.shadow_alpha),
            );
        let rect = |key: String, b: [f32; 4], radius: f32, rgb: u32, a: f32| {
            el().key(key)
                .size(b[2], b[3])
                .radius(radius)
                .fill(color(rgb, a))
                .pin(Some(b[0]), Some(b[1]), None, None)
        };
        for (i, fraction) in [0.25, 0.5, 0.75].iter().enumerate() {
            root = root.child(rect(
                format!("grid-{i}"),
                [12.0, 32.0 + 120.0 * fraction, 736.0, 1.0],
                0.0,
                0xffffff,
                if i == 1 { 0.35 } else { 0.05 },
            ));
        }
        for (i, fraction) in [1.0 / 3.0, 2.0 / 3.0].iter().enumerate() {
            for y in (32..152).step_by(5) {
                root = root.child(rect(
                    format!("sector-grid-{i}-{y}"),
                    [12.0 + 736.0 * fraction, y as f32, 1.0, 2.0],
                    0.0,
                    0xffffff,
                    0.08,
                ));
            }
        }
        root = root
            .child(self.label(
                text(if self.es {
                    "+0.25 pierdes"
                } else {
                    "+0.25 lost"
                }),
                "loss-legend",
                [16.0, 46.0, 240.0, 12.0],
                Face::Mono,
                9.0,
                0.0,
                color(0x6e6668, 1.0),
                false,
            ))
            .child(self.label(
                text(if self.es {
                    "−0.25 ganas"
                } else {
                    "−0.25 gained"
                }),
                "gain-legend",
                [16.0, 118.0, 240.0, 12.0],
                Face::Mono,
                9.0,
                0.0,
                color(0x6e6668, 1.0),
                false,
            ))
            .child(
                canvas(self.shape.clone())
                    .key("history-path")
                    .size(760.0, 192.0)
                    .pin(Some(0.0), Some(0.0), None, None),
            );
        for (i, op) in self.scene.graph.iter().enumerate() {
            if let Op::Rect(b, radius, rgb, a) = op {
                root = root.child(rect(format!("cursor-{i}"), *b, *radius, *rgb, *a));
            }
        }
        root = root.child(rect(
            "value-panel".into(),
            [638.0, 40.0, 102.0, 54.0],
            6.0,
            0x110f10,
            0.85,
        ));
        for (i, key, b, face, size, tracking, ink, right) in [
            (
                0,
                "heading",
                [12.0, 10.0, 736.0, 18.0],
                Face::Body,
                11.0,
                0.3,
                s.colors.muted,
                false,
            ),
            (
                1,
                "position",
                [12.0, 10.0, 736.0, 18.0],
                Face::Body,
                11.0,
                0.3,
                s.colors.muted,
                true,
            ),
            (
                2,
                "current",
                [0.0, 42.0, 732.0, 30.0],
                Face::Display,
                30.0,
                0.0,
                color(self.scene.colors[0], 1.0),
                true,
            ),
            (
                3,
                "status",
                [260.0, 90.0, 488.0, 20.0],
                Face::Body,
                11.0,
                0.3,
                s.colors.muted,
                false,
            ),
        ] {
            root = root.child(self.label(
                text(self.texts[i].get().to_string()).live_text(&self.texts[i]),
                key,
                b,
                face,
                size,
                tracking,
                ink,
                right,
            ));
        }
        root = root.child(self.label(
            text(if self.es { "ahora" } else { "now" }),
            "now",
            [0.0, 74.0, 732.0, 14.0],
            Face::Mono,
            9.0,
            0.0,
            color(0x6e6668, 1.0),
            true,
        ));
        for (i, caption) in ["S1", "S2", "S3"].iter().enumerate() {
            let x = 12.0 + i as f32 * 247.3;
            root = root
                .child(rect(
                    format!("sector-bar-{i}"),
                    [x, 158.0, 241.3, 4.0],
                    2.0,
                    self.scene.colors[i + 1],
                    1.0,
                ))
                .child(self.label(
                    text(*caption),
                    &format!("sector-label-{i}"),
                    [x, 166.0, 80.0, 14.0],
                    Face::Mono,
                    9.0,
                    0.0,
                    s.colors.muted,
                    false,
                ))
                .child(self.label(
                    text(self.texts[i + 4].get().to_string()).live_text(&self.texts[i + 4]),
                    &format!("sector-time-{i}"),
                    [x, 166.0, 241.3, 14.0],
                    Face::Mono,
                    9.0,
                    0.0,
                    s.colors.muted,
                    true,
                ));
        }
        root
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn temporal_fallback_keeps_gpui_endpoints_and_never_bridges_a_cut() {
        let key = GraphKey {
            previous: vec![],
            current: vec![],
            invalid: false,
        };
        let mut samples = [
            Sample {
                at: std::time::Duration::ZERO,
                delta_seconds: Some(0.25),
                break_before: false,
            },
            Sample {
                at: std::time::Duration::from_secs(1),
                delta_seconds: Some(-0.25),
                break_before: false,
            },
        ];
        assert_eq!(
            graph(&samples, &key),
            vec![
                Op::Line([12.0, 65.0], [748.0, 119.0], 2.2, 0x4ade80, 1.0),
                Op::Rect([744.0, 115.0, 8.0, 8.0], 4.0, 0xffffff, 1.0),
            ]
        );
        samples[1].break_before = true;
        assert!(graph(&samples, &key).is_empty());
    }
    #[test]
    fn lap_segments_keep_literal_gpui_line_fill_and_cursor_order() {
        let key = GraphKey {
            previous: vec![(0.0, 0.0, false), (0.5, 0.25, false)],
            current: vec![(0.0, 0.0, false), (0.5, -0.25, false)],
            invalid: false,
        };
        assert_eq!(
            graph(&[], &key),
            vec![
                Op::Line([12.0, 92.0], [380.0, 65.0], 1.2, 0xffffff, 0.22),
                Op::Line([12.0, 92.0], [380.0, 119.0], 2.2, 0x4ade80, 1.0),
                Op::Fill(
                    [[12.0, 92.0], [380.0, 119.0], [380.0, 92.0], [12.0, 92.0]],
                    0x4ade80,
                    0.22
                ),
                Op::Rect([380.0, 32.0, 1.0, 120.0], 0.0, 0xffffff, 0.25),
                Op::Rect([376.0, 115.0, 8.0, 8.0], 4.0, 0xffffff, 1.0),
            ]
        );
    }
    #[test]
    fn invalid_and_cut_segments_do_not_gain_fills_or_bridge_gaps() {
        let key = GraphKey {
            previous: vec![],
            current: vec![(0.0, 0.0, false), (0.5, 0.25, true), (1.0, 0.5, false)],
            invalid: true,
        };
        let ops = graph(&[], &key);
        assert_eq!(
            ops[0],
            Op::Line([380.0, 65.0], [748.0, 38.0], 2.2, 0x6e6668, 1.0)
        );
        assert!(!ops.iter().any(|op| matches!(op, Op::Fill(..))));
    }
}
