//! Vantare paints the shared Pedals telemetry scene; the wheel is the same SVG GPUI uses.
use super::scene::{SIZE, Scene};
use super::wheels;
use crate::vantare::paint::{Face, WHITE, font};
use crate::vantare::{Style, alpha};
use rune::{Align, Color, El, el, text};
use std::sync::Arc;
use vantare_domain::format::{Language, Preferences};

const LEFT_BOX: f32 = 76.0;
const BARS_X: f32 = 90.0;
const BARS_W: f32 = 188.0;
const BARS_H: f32 = 8.0;
const VALUE_RIGHT: f32 = 308.0;
const VALUE_BOX: f32 = 58.0;
const ANGLE_CENTER: f32 = 340.0;
const ANGLE_BOX: f32 = 80.0;

const BLUE: Color = Color {
    r: 0.07818742,
    g: 0.2704978,
    b: 0.9301109,
    a: 1.0,
}; // #4f8ef7
const RED: Color = Color {
    r: 0.7529422,
    g: 0.06847817,
    b: 0.08865559,
    a: 1.0,
}; // #e14a54
const GREEN: Color = Color {
    r: 0.01599629,
    g: 0.5583404,
    b: 0.11193243,
    a: 1.0,
}; // #22c55e
const STALE: Color = Color {
    r: 0.15592647,
    g: 0.13286832,
    b: 0.13843162,
    a: 1.0,
}; // #6e6668

/// What the Look actually paints: the wheel id and its rotation, so a steering change redraws.
#[derive(PartialEq)]
struct Painted {
    bars: [Option<f32>; 3],
    show_clutch: bool,
    gear: String,
    speed: String,
    stale: bool,
    status_text: &'static str,
    angle_text: String,
    wheel: &'static str,
    rotation_deg: f64,
}

fn painted(scene: &Scene) -> Painted {
    Painted {
        bars: scene.bars,
        show_clutch: scene.show_clutch,
        gear: scene.gear.clone(),
        speed: scene.speed.clone(),
        stale: scene.stale,
        status_text: scene.status_text,
        angle_text: scene.angle_text.clone(),
        wheel: scene.wheel,
        rotation_deg: scene.wheel_rotation_deg,
    }
}

pub(super) struct Painter {
    prefs: Preferences,
    style: Arc<Style>,
    painted: Painted,
}

impl Painter {
    pub fn new(prefs: Preferences, scene: &Scene) -> Self {
        Self {
            prefs,
            style: Style::compiled(),
            painted: painted(scene),
        }
    }
    /// The only build decision: compare what will be painted.
    pub fn sync(&mut self, scene: &Scene) -> crate::widget::Update {
        let painted = painted(scene);
        let build = painted != self.painted;
        self.painted = painted;
        crate::widget::Update {
            build,
            pixels: false,
        }
    }
    pub fn capture_images(&self, assets: Option<&Arc<rune::ImageCache>>) -> Vec<rune::Image> {
        assets.map_or_else(Vec::new, |cache| vec![self.wheel(cache)])
    }
    fn wheel(&self, cache: &rune::ImageCache) -> rune::Image {
        cache.svg(wheels::svg(self.painted.wheel), 40.0, 1.0)
    }
    pub fn view(&self, assets: Option<&Arc<rune::ImageCache>>) -> El {
        let s = &self.style;
        let c = &s.colors;
        let v = &s.styles.neo;
        let p = &self.painted;
        let border = if v.border_accent > 0.0 {
            alpha(s.accents.red, v.border_accent)
        } else {
            v.border
        };
        let mut root = el()
            .key("pedals-telemetry-view")
            .size(SIZE.0, SIZE.1)
            .motion(rune::Spring::NONE)
            .radius(v.radius)
            .border(1.0, border)
            .linear_gradient(std::f32::consts::PI, [(0.0, v.top), (1.0, v.bottom)])
            .shadow(v.shadow_y, v.shadow_blur, alpha(c.shadow, v.shadow_alpha));
        if !p.status_text.is_empty() {
            root = root.child(
                text(p.status_text)
                    .key("pedals-telemetry-status")
                    .font(font(s, Face::Body, 9.0, 10.0, 0.0, s.fonts.regular_weight))
                    .color(c.loss)
                    .size(SIZE.0 - 8.0, 10.0)
                    .pin(Some(8.0), Some(text_top(s, Face::Body, 0.0)), None, None),
            );
        }
        let gear_ink = if p.stale { STALE } else { c.text };
        root = root.child(
            text(p.gear.clone())
                .key("pedals-telemetry-gear")
                .font(font(s, Face::Display, 36.0, 32.0, 0.0, 600.0))
                .color(gear_ink)
                .size(LEFT_BOX, 32.0)
                .align(Align::Center)
                .pin(Some(0.0), Some(text_top(s, Face::Display, 8.0)), None, None),
        );
        root = root.child(
            text(p.speed.clone())
                .key("pedals-telemetry-speed")
                .font(font(s, Face::Mono, 10.0, 14.0, 0.0, 400.0))
                .color(c.muted)
                .size(LEFT_BOX, 14.0)
                .align(Align::Center)
                .pin(Some(0.0), Some(text_top(s, Face::Mono, 42.0)), None, None),
        );
        let labels = if self.prefs.language == Language::Es {
            ["E", "F", "A"]
        } else {
            ["C", "B", "T"]
        };
        let colors = [BLUE, RED, GREEN];
        for (index, value) in p.bars.iter().enumerate() {
            if index == 0 && !p.show_clutch {
                continue;
            }
            let y = 10.0 + index as f32 * 16.0;
            root = root.child(
                text(labels[index])
                    .key(format!("pedals-telemetry-label-{index}"))
                    .font(font(s, Face::Display, 10.0, 12.0, 1.0, 600.0))
                    .color(STALE)
                    .size(14.0, 12.0)
                    .pin(Some(76.0), Some(text_top(s, Face::Display, y)), None, None),
            );
            root = root.child(
                el().key(format!("pedals-telemetry-track-{index}"))
                    .size(BARS_W, BARS_H)
                    .radius(BARS_H / 2.0)
                    .fill(alpha(WHITE, 0.08))
                    .pin(Some(BARS_X), Some(y + 2.0), None, None),
            );
            if let Some(value) = value
                && *value > 0.0
            {
                let width = BARS_W * value;
                root = root.child(
                    el().key(format!("pedals-telemetry-fill-{index}"))
                        .size(width, BARS_H)
                        .radius((width / 2.0).min(BARS_H / 2.0))
                        .fill(colors[index])
                        .pin(Some(BARS_X), Some(y + 2.0), None, None),
                );
            }
            let value_text =
                value.map_or_else(|| "—".into(), |value| format!("{:.0}", value * 100.0));
            root = root.child(
                text(value_text)
                    .key(format!("pedals-telemetry-value-{index}"))
                    .font(font(s, Face::Mono, 10.0, 12.0, 0.0, 400.0))
                    .color(c.text)
                    .size(VALUE_BOX, 12.0)
                    .align(Align::End)
                    .pin(
                        Some(VALUE_RIGHT - VALUE_BOX),
                        Some(text_top(s, Face::Mono, y)),
                        None,
                        None,
                    ),
            );
        }
        // The wheel rasterizes from the same SVG GPUI uses; without assets, a hole its size.
        let wheel = match assets {
            Some(cache) => el()
                .key("pedals-telemetry-wheel")
                .size(40.0, 40.0)
                .pixels(self.wheel(cache).pixels())
                .rotate((p.rotation_deg as f32).to_radians())
                .opacity(if p.stale { 0.55 } else { 1.0 })
                .pin(Some(320.0), Some(2.0), None, None),
            None => el().key("pedals-telemetry-wheel").size(40.0, 40.0).pin(
                Some(320.0),
                Some(2.0),
                None,
                None,
            ),
        };
        root = root.child(wheel);
        root = root.child(
            text(p.angle_text.clone())
                .key("pedals-telemetry-angle")
                .font(font(s, Face::Mono, 10.0, 12.0, 0.0, 400.0))
                .color(c.muted)
                .size(ANGLE_BOX, 12.0)
                .align(Align::Center)
                .pin(
                    Some(ANGLE_CENTER - ANGLE_BOX / 2.0),
                    Some(text_top(s, Face::Mono, 46.0)),
                    None,
                    None,
                ),
        );
        root
    }
}

/// GPUI's `baseline` adds the face offset; Rune's layout needs it in the y.
fn text_top(style: &Style, face: Face, top: f32) -> f32 {
    top + match face {
        Face::Display => style.fonts.display_baseline,
        Face::Mono => style.fonts.mono_baseline,
        Face::Body => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Cx, ElementInfo, Env, Runtime, text::TextSystem};

    struct Stub(Painter);

    fn stub_view(stub: &Stub, _: &mut Cx<Stub>) -> El {
        stub.0.view(None)
    }

    fn elements(prefs: Preferences, scene: &Scene) -> Vec<ElementInfo> {
        let mut runtime = Runtime::with_text(
            Stub(Painter::new(prefs, scene)),
            stub_view,
            (SIZE.0, SIZE.1),
            Env::new(true, 1.0),
            TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.frame(0.0);
        runtime.elements()
    }

    fn scene(status_text: &'static str) -> Scene {
        Scene {
            bars: [Some(0.06), Some(0.13), Some(0.75)],
            show_clutch: true,
            gear: "4".into(),
            speed: "180 km/h".into(),
            stale: false,
            status_text,
            wheel: "generic",
            wheel_rotation_deg: 36.0,
            angle_text: "+36°".into(),
        }
    }

    fn by_key<'a>(elements: &'a [ElementInfo], key: &str) -> &'a ElementInfo {
        elements
            .iter()
            .find(|element| element.key.as_deref() == Some(key))
            .unwrap_or_else(|| panic!("falta {key}"))
    }

    fn absent(elements: &[ElementInfo], key: &str) -> bool {
        !elements
            .iter()
            .any(|element| element.key.as_deref() == Some(key))
    }

    fn near(left: f32, right: f32) -> bool {
        (left - right).abs() < 0.01
    }

    fn rect(element: &ElementInfo, expected: [f32; 4]) {
        let [x, y, w, h] = element.rect;
        let [ex, ey, ew, eh] = expected;
        assert!(
            near(x, ex) && near(y, ey) && near(w, ew) && near(h, eh),
            "{}: rect {:?} != {:?}",
            element.key.as_deref().unwrap_or("?"),
            element.rect,
            expected
        );
    }

    fn keys(elements: &[ElementInfo]) -> Vec<String> {
        elements
            .iter()
            .filter_map(|element| element.key.clone())
            .filter(|key| key.starts_with("pedals-telemetry"))
            .collect()
    }

    fn key(index: usize, part: &str) -> String {
        format!("pedals-telemetry-{part}-{index}")
    }

    fn english() -> Preferences {
        Preferences {
            language: Language::En,
            ..Preferences::default()
        }
    }

    #[test]
    fn every_child_paints_its_box_text_color_and_order() {
        let elements = elements(english(), &scene(""));
        let style = Style::compiled();
        let neo = &style.styles.neo;
        assert!(near(
            by_key(&elements, "pedals-telemetry-view").rect[2],
            SIZE.0
        ));
        assert_eq!(by_key(&elements, "pedals-telemetry-view").rect[3], SIZE.1);
        assert_eq!(
            by_key(&elements, "pedals-telemetry-view").radius,
            neo.radius
        );

        let gear = by_key(&elements, "pedals-telemetry-gear");
        assert_eq!(gear.text.as_deref(), Some("4"));
        rect(gear, [0.0, 8.0 + style.fonts.display_baseline, 76.0, 32.0]);
        assert_eq!(gear.text_color, Some(style.colors.text));

        let speed = by_key(&elements, "pedals-telemetry-speed");
        assert_eq!(speed.text.as_deref(), Some("180 km/h"));
        rect(speed, [0.0, 42.0 + style.fonts.mono_baseline, 76.0, 14.0]);
        assert_eq!(speed.text_color, Some(style.colors.muted));

        for (index, color) in [(0, BLUE), (1, RED), (2, GREEN)] {
            let label = by_key(&elements, &key(index, "label"));
            assert_eq!(
                label.text.as_deref(),
                Some(["C", "B", "T"][index]),
                "inglés"
            );
            rect(
                label,
                [
                    76.0,
                    10.0 + index as f32 * 16.0 + style.fonts.display_baseline,
                    14.0,
                    12.0,
                ],
            );
            assert_eq!(label.text_color, Some(STALE));
            let track = by_key(&elements, &key(index, "track"));
            rect(track, [90.0, 12.0 + index as f32 * 16.0, 188.0, 8.0]);
            assert_eq!(track.fill, alpha(WHITE, 0.08));
            assert_eq!(track.radius, 4.0);
            let fill = by_key(&elements, &key(index, "fill"));
            rect(
                fill,
                [
                    90.0,
                    12.0 + index as f32 * 16.0,
                    188.0 * [0.06, 0.13, 0.75][index],
                    8.0,
                ],
            );
            assert_eq!(fill.fill, color);
            assert_eq!(fill.radius, 4.0);
            let value = by_key(&elements, &key(index, "value"));
            assert_eq!(value.text.as_deref(), Some(["6", "13", "75"][index]));
            rect(
                value,
                [308.0 - 58.0, 10.0 + index as f32 * 16.0, 58.0, 12.0],
            );
            assert_eq!(value.text_color, Some(style.colors.text));
        }

        let wheel = by_key(&elements, "pedals-telemetry-wheel");
        rect(wheel, [320.0, 2.0, 40.0, 40.0]);
        assert_eq!(wheel.text, None);

        let angle = by_key(&elements, "pedals-telemetry-angle");
        assert_eq!(angle.text.as_deref(), Some("+36°"));
        rect(
            angle,
            [340.0 - 40.0, 46.0 + style.fonts.mono_baseline, 80.0, 12.0],
        );
        assert_eq!(angle.text_color, Some(style.colors.muted));

        let expected: Vec<String> = vec![
            "pedals-telemetry-view".into(),
            "pedals-telemetry-gear".into(),
            "pedals-telemetry-speed".into(),
            key(0, "label"),
            key(0, "track"),
            key(0, "fill"),
            key(0, "value"),
            key(1, "label"),
            key(1, "track"),
            key(1, "fill"),
            key(1, "value"),
            key(2, "label"),
            key(2, "track"),
            key(2, "fill"),
            key(2, "value"),
            "pedals-telemetry-wheel".into(),
            "pedals-telemetry-angle".into(),
        ];
        assert_eq!(keys(&elements), expected);
    }

    #[test]
    fn spanish_stale_and_missing_states_paint_their_own_text_and_color() {
        let spanish = elements(
            Preferences {
                language: Language::Es,
                ..Preferences::default()
            },
            &scene(""),
        );
        for (index, label) in ["E", "F", "A"].iter().enumerate() {
            assert_eq!(
                by_key(&spanish, &key(index, "label")).text.as_deref(),
                Some(*label)
            );
        }

        let mut stale = scene("DATOS ANTIGUOS");
        stale.stale = true;
        let stale = elements(Preferences::default(), &stale);
        assert_eq!(
            by_key(&stale, "pedals-telemetry-gear").text_color,
            Some(STALE)
        );
        let status = by_key(&stale, "pedals-telemetry-status");
        assert_eq!(status.text.as_deref(), Some("DATOS ANTIGUOS"));
        rect(status, [8.0, 0.0, SIZE.0 - 8.0, 10.0]);
        assert_eq!(status.text_color, Some(Style::compiled().colors.loss));

        let mut missing = scene("SIN DATOS");
        missing.bars = [None; 3];
        missing.speed = "— km/h".into();
        missing.angle_text = "—".into();
        let missing = elements(Preferences::default(), &missing);
        assert_eq!(
            by_key(&missing, "pedals-telemetry-speed").text.as_deref(),
            Some("— km/h")
        );
        for index in 0..3 {
            assert_eq!(
                by_key(&missing, &key(index, "value")).text.as_deref(),
                Some("—")
            );
            assert!(absent(&missing, &key(index, "fill")));
        }
        assert_eq!(
            by_key(&missing, "pedals-telemetry-angle").text.as_deref(),
            Some("—")
        );
    }

    #[test]
    fn hidden_clutch_removes_its_whole_row() {
        let mut hidden = scene("");
        hidden.show_clutch = false;
        let elements = elements(Preferences::default(), &hidden);
        assert!(absent(&elements, &key(0, "label")));
        assert!(absent(&elements, &key(0, "track")));
        assert!(absent(&elements, &key(0, "value")));
        assert!(!absent(&elements, &key(1, "label")));
        assert!(!absent(&elements, &key(2, "label")));
    }

    #[test]
    fn a_longest_warning_paints_one_line_without_ellipsis() {
        let long = "DATOS ANTIGUOS DE LA FUENTE DE TELEMETRÍA (TEXTO MUY LARGO)";
        let elements = elements(Preferences::default(), &scene(long));
        let status = by_key(&elements, "pedals-telemetry-status");
        assert_eq!(status.text.as_deref(), Some(long));
        rect(status, [8.0, 0.0, SIZE.0 - 8.0, 10.0]);
        assert!(
            !status
                .text
                .as_deref()
                .is_some_and(|text| text.ends_with('…'))
        );
    }

    #[test]
    fn a_narrow_fill_uses_half_its_width_as_radius() {
        let mut short = scene("");
        short.bars = [Some(0.06), Some(0.13), Some(0.02)];
        let elements = elements(Preferences::default(), &short);
        let fill = by_key(&elements, &key(2, "fill"));
        let width = 188.0 * 0.02;
        assert!(near(fill.rect[2], width));
        assert!(near(fill.radius, width / 2.0));
    }

    #[test]
    fn gpui_colors_are_srgb_decoded_in_linear_rune() {
        assert_eq!(BLUE.hex(), "#4f8ef7ff");
        assert_eq!(RED.hex(), "#e14a54ff");
        assert_eq!(GREEN.hex(), "#22c55eff");
        assert_eq!(STALE.hex(), "#6e6668ff");
    }
}
