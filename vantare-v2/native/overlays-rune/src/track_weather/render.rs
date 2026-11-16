//! Vantare paints the shared Track weather scene. The session label and the wind
//! heading come from `domain::track_weather`; the wet fraction is `ViewModel::wet_percent`.
use super::scene::{self, Layout, Scene};
use crate::vantare::paint::{Face, WHITE, font};
use crate::vantare::{Style, alpha};
use rune::{Align, Color, El, Shape, canvas, el, text};
use std::sync::Arc;
use vantare_domain::{
    format::{Language, Preferences},
    track_weather::Status,
};

const WET_BANNER: Color = Color {
    r: 0x20 as f32 / 255.0,
    g: 0x33 as f32 / 255.0,
    b: 0x4f as f32 / 255.0,
    a: 1.0,
};
const DRY_BANNER: Color = Color {
    r: 0x2b as f32 / 255.0,
    g: 0x25 as f32 / 255.0,
    b: 0x27 as f32 / 255.0,
    a: 1.0,
};
const BIG: Color = Color {
    r: 0xfa as f32 / 255.0,
    g: 0xf7 as f32 / 255.0,
    b: 0xf7 as f32 / 255.0,
    a: 1.0,
};
const BLUE: Color = Color {
    r: 0x4f as f32 / 255.0,
    g: 0x8e as f32 / 255.0,
    b: 0xf7 as f32 / 255.0,
    a: 1.0,
};
const CARD_NOW: Color = Color {
    r: 0x2a as f32 / 255.0,
    g: 0x24 as f32 / 255.0,
    b: 0x26 as f32 / 255.0,
    a: 1.0,
};
const CARD: Color = Color {
    r: 0x11 as f32 / 255.0,
    g: 0x0f as f32 / 255.0,
    b: 0x10 as f32 / 255.0,
    a: 1.0,
};
const PLACEHOLDER: Color = Color {
    r: 0x5e as f32 / 255.0,
    g: 0x56 as f32 / 255.0,
    b: 0x58 as f32 / 255.0,
    a: 1.0,
};

pub(super) struct Painter {
    prefs: Preferences,
    style: Arc<Style>,
    scene: Scene,
}

impl Painter {
    pub fn new(prefs: Preferences, scene: &Scene) -> Self {
        Self {
            prefs,
            style: Style::compiled(),
            scene: scene.clone(),
        }
    }
    /// The only build decision: compare what will be painted.
    pub fn sync(&mut self, scene: &Scene) -> crate::widget::Update {
        let build = *scene != self.scene;
        self.scene = scene.clone();
        crate::widget::Update {
            build,
            pixels: false,
        }
    }
    pub fn view(&self) -> El {
        let s = &self.style;
        let (width, height) = self.scene.layout.size();
        let v = &s.styles.neo;
        let border = if v.border_accent > 0.0 {
            alpha(s.accents.red, v.border_accent)
        } else {
            v.border
        };
        let root = el()
            .key("track-weather-view")
            .size(width, height)
            .motion(rune::Spring::NONE)
            .radius(v.radius)
            .border(1.0, border)
            .linear_gradient(std::f32::consts::PI, [(0.0, v.top), (1.0, v.bottom)])
            .shadow(
                v.shadow_y,
                v.shadow_blur,
                alpha(s.colors.shadow, v.shadow_alpha),
            );
        if self.scene.layout == Layout::Wide
            && matches!(self.scene.status, Status::Missing | Status::Disconnected)
        {
            self.wide_placeholder(root)
        } else if self.scene.layout == Layout::Wide {
            self.wide(root)
        } else {
            self.vertical(root)
        }
    }
    fn metric(&self, index: usize) -> &str {
        self.scene
            .metrics
            .get(index)
            .map_or("—", |metric| metric.value.as_str())
    }
    fn es(&self) -> bool {
        self.prefs.language == Language::Es
    }
    fn banner_fill(&self) -> Color {
        if self.scene.wet.is_some_and(|wet| wet > 0.0) {
            WET_BANNER
        } else {
            DRY_BANNER
        }
    }
    fn wide_placeholder(&self, mut root: El) -> El {
        let s = &self.style;
        let muted = font(s, Face::Body, 11.0, 18.0, 0.3, s.fonts.regular_weight);
        root = root.child(
            text(if self.es() {
                "TIEMPO EN PISTA"
            } else {
                "TRACK WEATHER"
            })
            .key("track-weather-title")
            .font(muted)
            .color(s.colors.muted)
            .size(200.0, 18.0)
            .pin(Some(14.0), Some(text_top(s, Face::Body, 10.0)), None, None),
        );
        for (index, (x, size, label)) in [
            (14.0, 24.0, if self.es() { "pista" } else { "track" }),
            (104.0, 18.0, if self.es() { "aire" } else { "air" }),
        ]
        .into_iter()
        .enumerate()
        {
            root = root
                .child(
                    text("--°")
                        .key(format!("track-weather-empty-{index}"))
                        .font(font(s, Face::Mono, size, 34.0, 0.0, 400.0))
                        .color(PLACEHOLDER)
                        .size(80.0, 34.0)
                        .pin(Some(x), Some(text_top(s, Face::Mono, 36.0)), None, None),
                )
                .child(
                    text(label)
                        .key(format!("track-weather-empty-label-{index}"))
                        .font(muted)
                        .color(s.colors.muted)
                        .size(80.0, 14.0)
                        .pin(Some(x), Some(text_top(s, Face::Body, 74.0)), None, None),
                );
        }
        root.child(
            el().key("track-weather-waiting-dot")
                .size(7.0, 7.0)
                .radius(3.5)
                .fill(s.colors.muted)
                .pin(Some(14.0), Some(109.0), None, None),
        )
        .child(
            text(if self.es() {
                "Esperando a LMU"
            } else {
                "Waiting for LMU"
            })
            .key("track-weather-waiting")
            .font(muted)
            .color(s.colors.muted)
            .size(240.0, 20.0)
            .pin(Some(28.0), Some(text_top(s, Face::Body, 102.0)), None, None),
        )
    }
    fn wide(&self, mut root: El) -> El {
        let s = &self.style;
        let c = &s.colors;
        root = root
            .child(
                el().key("track-weather-band")
                    .size(278.0, 26.0)
                    .radius(8.0)
                    .fill(self.banner_fill())
                    .pin(Some(1.0), Some(1.0), None, None),
            )
            .child(
                text(self.scene.banner)
                    .key("track-weather-banner")
                    .font(font(s, Face::Display, 11.0, 18.0, 0.5, 600.0))
                    .color(c.text)
                    .size(254.0, 18.0)
                    .pin(
                        Some(12.0),
                        Some(text_top(s, Face::Display, 6.0)),
                        None,
                        None,
                    ),
            )
            .child(
                text(if self.es() {
                    "TIEMPO EN PISTA"
                } else {
                    "TRACK WEATHER"
                })
                .key("track-weather-title")
                .font(font(s, Face::Body, 10.0, 14.0, 0.4, s.fonts.regular_weight))
                .color(c.muted)
                .size(140.0, 14.0)
                .pin(Some(14.0), Some(text_top(s, Face::Body, 38.0)), None, None),
            );
        if !self.scene.session.is_empty() {
            root = root.child(
                text(self.scene.session.clone())
                    .key("track-weather-session")
                    .font(font(s, Face::Body, 10.0, 14.0, 0.4, s.fonts.regular_weight))
                    .color(c.muted)
                    .size(254.0, 14.0)
                    .align(Align::End)
                    .pin(Some(12.0), Some(text_top(s, Face::Body, 38.0)), None, None),
            );
        }
        root = root
            .child(
                text(self.track_big())
                    .key("track-weather-track")
                    .font(font(s, Face::Display, 32.0, 34.0, 0.0, 600.0))
                    .color(BIG)
                    .size(90.0, 34.0)
                    .pin(
                        Some(14.0),
                        Some(text_top(s, Face::Display, 54.0)),
                        None,
                        None,
                    ),
            )
            .child(
                text(if self.es() { "PISTA" } else { "TRACK" })
                    .key("track-weather-track-label")
                    .font(font(s, Face::Body, 10.0, 14.0, 0.4, s.fonts.regular_weight))
                    .color(c.muted)
                    .size(80.0, 14.0)
                    .pin(Some(14.0), Some(text_top(s, Face::Body, 92.0)), None, None),
            )
            .child(
                text(self.air())
                    .key("track-weather-air")
                    .font(font(s, Face::Display, 22.0, 26.0, 0.0, 600.0))
                    .color(c.text)
                    .size(80.0, 26.0)
                    .pin(
                        Some(104.0),
                        Some(text_top(s, Face::Display, 62.0)),
                        None,
                        None,
                    ),
            )
            .child(
                text(if self.es() { "AIRE" } else { "AIR" })
                    .key("track-weather-air-label")
                    .font(font(s, Face::Body, 10.0, 14.0, 0.4, s.fonts.regular_weight))
                    .color(c.muted)
                    .size(80.0, 14.0)
                    .pin(Some(104.0), Some(text_top(s, Face::Body, 92.0)), None, None),
            );
        if let Some(heading) = self.scene.wind_heading {
            let points = scene::arrow(heading)
                .map(|[x, y]| [x + 10.0, y + 10.0])
                .to_vec();
            root = root
                .child(
                    el().key("track-weather-wind-circle")
                        .size(20.0, 20.0)
                        .radius(10.0)
                        .border(1.0, alpha(WHITE, 0.12))
                        .pin(Some(193.0), Some(69.0), None, None),
                )
                .child(
                    canvas(Shape::new().fill(points, c.text))
                        .key("track-weather-arrow")
                        .size(20.0, 20.0)
                        .pin(Some(193.0), Some(69.0), None, None),
                );
        }
        root = root
            .child(
                text(self.wind())
                    .key("track-weather-wind")
                    .font(font(s, Face::Mono, 13.0, 18.0, 0.0, 400.0))
                    .color(c.text)
                    .size(86.0, 18.0)
                    .align(Align::End)
                    .pin(Some(180.0), Some(text_top(s, Face::Mono, 70.0)), None, None),
            )
            .child(
                text(if self.es() { "VIENTO" } else { "WIND" })
                    .key("track-weather-wind-label")
                    .font(font(s, Face::Body, 10.0, 14.0, 0.4, s.fonts.regular_weight))
                    .color(c.muted)
                    .size(86.0, 14.0)
                    .align(Align::End)
                    .pin(Some(180.0), Some(text_top(s, Face::Body, 92.0)), None, None),
            )
            .child(
                text(if self.es() { "Pista" } else { "Track" })
                    .key("track-weather-track-name")
                    .font(font(s, Face::Body, 10.0, 16.0, 0.4, s.fonts.regular_weight))
                    .color(c.muted)
                    .size(80.0, 16.0)
                    .pin(Some(14.0), Some(text_top(s, Face::Body, 116.0)), None, None),
            );
        root = self.wet_bar(root, 56.0, 122.0, 176.0, 5.0);
        root = root.child(
            text(self.wet_text())
                .key("track-weather-wet")
                .font(font(s, Face::Mono, 13.0, 16.0, 0.0, 400.0))
                .color(c.text)
                .size(66.0, 16.0)
                .align(Align::End)
                .pin(
                    Some(200.0),
                    Some(text_top(s, Face::Mono, 116.0)),
                    None,
                    None,
                ),
        );
        for index in 0..5 {
            root = self.forecast_card(root, index, 14.0 + index as f32 * 50.4, 142.0, 49.0, 58.0);
        }
        root
    }
    fn vertical(&self, mut root: El) -> El {
        let s = &self.style;
        let c = &s.colors;
        root = root
            .child(
                el().key("track-weather-band")
                    .size(130.0, 22.0)
                    .radius(8.0)
                    .fill(self.banner_fill())
                    .pin(Some(1.0), Some(1.0), None, None),
            )
            .child(
                text(self.scene.banner)
                    .key("track-weather-banner")
                    .font(font(s, Face::Display, 11.0, 18.0, 0.5, 600.0))
                    .color(c.text)
                    .size(118.0, 18.0)
                    .pin(
                        Some(12.0),
                        Some(text_top(s, Face::Display, 3.0)),
                        None,
                        None,
                    ),
            )
            .child(
                text(if self.es() { "TIEMPO" } else { "WEATHER" })
                    .key("track-weather-title")
                    .font(font(s, Face::Body, 10.0, 18.0, 0.4, s.fonts.regular_weight))
                    .color(c.muted)
                    .size(100.0, 18.0)
                    .pin(Some(12.0), Some(text_top(s, Face::Body, 30.0)), None, None),
            )
            .child(
                text(self.track_big())
                    .key("track-weather-track")
                    .font(font(s, Face::Display, 40.0, 40.0, 0.0, 600.0))
                    .color(BIG)
                    .size(100.0, 40.0)
                    .pin(
                        Some(12.0),
                        Some(text_top(s, Face::Display, 52.0)),
                        None,
                        None,
                    ),
            )
            .child(
                text(if self.es() { "PISTA" } else { "TRACK" })
                    .key("track-weather-track-label")
                    .font(font(s, Face::Body, 10.0, 14.0, 0.4, s.fonts.regular_weight))
                    .color(c.muted)
                    .size(40.0, 14.0)
                    .pin(Some(83.0), Some(text_top(s, Face::Body, 68.0)), None, None),
            );
        for (row, (label, value)) in [
            (if self.es() { "AIRE" } else { "AIR" }, self.air()),
            (
                if self.es() { "VIENTO" } else { "WIND" },
                self.metric(2).to_owned(),
            ),
            (
                if self.es() { "AGUA" } else { "WATER" },
                self.metric(4).to_owned(),
            ),
        ]
        .into_iter()
        .enumerate()
        {
            let y = 98.0 + row as f32 * 24.0;
            root = root
                .child(
                    el().key(format!("track-weather-row-line-{row}"))
                        .size(108.0, 1.0)
                        .fill(alpha(WHITE, 0.05))
                        .pin(Some(12.0), Some(y), None, None),
                )
                .child(
                    text(label)
                        .key(format!("track-weather-row-label-{row}"))
                        .font(font(s, Face::Body, 10.0, 20.0, 0.4, s.fonts.regular_weight))
                        .color(c.muted)
                        .size(60.0, 20.0)
                        .pin(
                            Some(12.0),
                            Some(text_top(s, Face::Body, y + 3.0)),
                            None,
                            None,
                        ),
                )
                .child(
                    text(value)
                        .key(format!("track-weather-row-{row}"))
                        .font(font(
                            s,
                            Face::Mono,
                            if row == 1 { 9.0 } else { 13.0 },
                            20.0,
                            0.0,
                            400.0,
                        ))
                        .color(c.text)
                        .size(80.0, 20.0)
                        .align(Align::End)
                        .pin(
                            Some(40.0),
                            Some(text_top(s, Face::Mono, y + 3.0)),
                            None,
                            None,
                        ),
                );
        }
        root = self.wet_bar(root, 12.0, 174.0, 108.0, 5.0);
        for index in 0..5 {
            root = self.forecast_card(root, index, 12.0, 189.0 + index as f32 * 47.5, 108.0, 46.5);
        }
        root
    }
    fn wet_bar(&self, mut root: El, x: f32, y: f32, width: f32, height: f32) -> El {
        root = root.child(
            el().key("track-weather-wet-track")
                .size(width, height)
                .radius(height / 2.0)
                .fill(alpha(WHITE, 0.08))
                .pin(Some(x), Some(y), None, None),
        );
        if let Some(wet) = self.scene.wet {
            root = root.child(
                el().key("track-weather-wet-fill")
                    .size(width * wet.clamp(0.0, 100.0) / 100.0, height)
                    .radius(height / 2.0)
                    .fill(BLUE)
                    .pin(Some(x), Some(y), None, None),
            );
        }
        root
    }
    fn forecast_card(&self, mut root: El, index: usize, x: f32, y: f32, w: f32, h: f32) -> El {
        let s = &self.style;
        let c = &s.colors;
        let labels = if self.es() {
            ["Ahora", "+15", "+30", "+45", "+60"]
        } else {
            ["Now", "+15", "+30", "+45", "+60"]
        };
        root = root.child(
            el().key(format!("track-weather-card-{index}"))
                .size(w, h)
                .radius(3.0)
                .fill(alpha(if index == 0 { CARD_NOW } else { CARD }, 0.98))
                .pin(Some(x), Some(y), None, None),
        );
        let (dot_x, dot_y, dot, radius, value_right, value_y, value_h, label_x, label_y, label_w) =
            match self.scene.layout {
                Layout::Wide => (
                    x + 18.0,
                    y + 8.0,
                    13.0,
                    6.5,
                    x + 32.5,
                    y + 26.0,
                    14.0,
                    x + 10.0,
                    y + 41.0,
                    w - 10.0,
                ),
                Layout::Vertical => (
                    x + 52.0,
                    y + 16.0,
                    14.0,
                    7.0,
                    113.0,
                    y + 15.0,
                    16.0,
                    x + 8.0,
                    y + 15.0,
                    w - 20.0,
                ),
            };
        root = root
            .child(
                el().key(format!("track-weather-card-dot-{index}"))
                    .size(dot, dot)
                    .radius(radius)
                    .fill(alpha(WHITE, 0.06))
                    .pin(Some(dot_x), Some(dot_y), None, None),
            )
            .child(
                text(if index == 0 {
                    self.metric(3).to_owned()
                } else {
                    "—".into()
                })
                .key(format!("track-weather-card-value-{index}"))
                .font(font(s, Face::Mono, 11.0, value_h, 0.0, 400.0))
                .color(c.text)
                .size(40.0, value_h)
                .align(Align::End)
                .pin(Some(value_right - 40.0), Some(value_y), None, None),
            )
            .child(
                text(labels[index])
                    .key(format!("track-weather-card-label-{index}"))
                    .font(font(
                        s,
                        Face::Body,
                        10.0,
                        value_h,
                        0.4,
                        s.fonts.regular_weight,
                    ))
                    .color(c.muted)
                    .size(label_w, value_h)
                    .pin(Some(label_x), Some(label_y), None, None),
            );
        root
    }
    fn track_big(&self) -> String {
        self.metric(0)
            .split_whitespace()
            .next()
            .filter(|value| *value != "—")
            .map_or_else(|| "--°".into(), |value| format!("{value}°"))
    }
    fn air(&self) -> String {
        self.metric(1).replace(" °C", "°").replace(" °F", "°")
    }
    /// La columna pinta el valor completo; solo la tarjeta con flecha quita el cardinal.
    fn wind(&self) -> String {
        if self.scene.wind_heading.is_some() {
            self.metric(2)
                .rsplit_once(' ')
                .map_or(self.metric(2), |(speed, _)| speed)
                .to_owned()
        } else {
            self.metric(2).to_owned()
        }
    }
    fn wet_text(&self) -> String {
        if self.scene.wet == Some(0.0) {
            if self.es() {
                "Seca".into()
            } else {
                "Dry".into()
            }
        } else {
            self.metric(4).to_owned()
        }
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
    use vantare_domain::track_weather::{Metric, ViewModel};

    struct Stub(Painter);

    fn stub_view(stub: &Stub, _: &mut Cx<Stub>) -> El {
        stub.0.view()
    }

    fn reference() -> ViewModel {
        ViewModel {
            status: Status::Ready,
            status_text: "",
            metrics: vec![
                Metric {
                    label: "PISTA",
                    value: "28 °C".into(),
                },
                Metric {
                    label: "AIRE",
                    value: "21 °C".into(),
                },
                Metric {
                    label: "VIENTO",
                    value: "14 km/h NO".into(),
                },
                Metric {
                    label: "LLUVIA",
                    value: "0 %".into(),
                },
                Metric {
                    label: "HÚMEDO",
                    value: "25 %".into(),
                },
                Metric {
                    label: "SECO",
                    value: "75%".into(),
                },
                Metric {
                    label: "PRES",
                    value: "1013 hPa".into(),
                },
            ],
            wet_percent: Some(25),
        }
    }

    fn build(
        layout: Layout,
        vm: &ViewModel,
        language: Language,
        session: &str,
        heading: Option<f32>,
    ) -> Scene {
        scene::sample(vm, layout, language, session, heading)
    }

    fn runtime(prefs: Preferences, scene: &Scene) -> Runtime<Stub> {
        let mut runtime = Runtime::with_text(
            Stub(Painter::new(prefs, scene)),
            stub_view,
            scene.layout.size(),
            Env::new(true, 1.0),
            TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.frame(0.0);
        runtime
    }

    fn elements(prefs: Preferences, scene: &Scene) -> Vec<ElementInfo> {
        runtime(prefs, scene).elements()
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

    fn near_rect(element: &ElementInfo, expected: [f32; 4]) {
        let [x, y, w, h] = element.rect;
        let [ex, ey, ew, eh] = expected;
        assert!(
            (x - ex).abs() < 0.01
                && (y - ey).abs() < 0.01
                && (w - ew).abs() < 0.01
                && (h - eh).abs() < 0.01,
            "{}: rect {:?} != {:?}",
            element.key.as_deref().unwrap_or("?"),
            element.rect,
            expected
        );
    }

    #[test]
    fn the_wide_card_paints_every_box_text_colour_and_band() {
        let vm = reference();
        let scene = build(
            Layout::Wide,
            &vm,
            Language::Es,
            "CLASIFICACIÓN · 08:42",
            Some(0.0),
        );
        let elements = elements(Preferences::default(), &scene);
        let style = Style::compiled();
        let band = by_key(&elements, "track-weather-band");
        near_rect(band, [1.0, 1.0, 278.0, 26.0]);
        assert_eq!(band.fill, WET_BANNER);
        let banner = by_key(&elements, "track-weather-banner");
        assert_eq!(banner.text.as_deref(), Some("PISTA MOJADA"));
        near_rect(
            banner,
            [12.0, 6.0 + style.fonts.display_baseline, 254.0, 18.0],
        );
        let title = by_key(&elements, "track-weather-title");
        assert_eq!(title.text.as_deref(), Some("TIEMPO EN PISTA"));
        let session = by_key(&elements, "track-weather-session");
        assert_eq!(session.text.as_deref(), Some("CLASIFICACIÓN · 08:42"));
        near_rect(session, [12.0, 38.0, 254.0, 14.0]);
        let track = by_key(&elements, "track-weather-track");
        assert_eq!(track.text.as_deref(), Some("28°"));
        assert_eq!(track.text_color, Some(BIG));
        near_rect(
            track,
            [14.0, 54.0 + style.fonts.display_baseline, 90.0, 34.0],
        );
        assert_eq!(
            by_key(&elements, "track-weather-track-label")
                .text
                .as_deref(),
            Some("PISTA")
        );
        let air = by_key(&elements, "track-weather-air");
        assert_eq!(air.text.as_deref(), Some("21°"));
        near_rect(
            air,
            [104.0, 62.0 + style.fonts.display_baseline, 80.0, 26.0],
        );
        assert_eq!(
            by_key(&elements, "track-weather-air-label").text.as_deref(),
            Some("AIRE")
        );
        let wind = by_key(&elements, "track-weather-wind");
        assert_eq!(wind.text.as_deref(), Some("14 km/h"));
        near_rect(wind, [180.0, 70.0, 86.0, 18.0]);
        assert_eq!(
            by_key(&elements, "track-weather-wind-label")
                .text
                .as_deref(),
            Some("VIENTO")
        );
        let name = by_key(&elements, "track-weather-track-name");
        assert_eq!(name.text.as_deref(), Some("Pista"));
        near_rect(name, [14.0, 116.0, 80.0, 16.0]);
        near_rect(
            by_key(&elements, "track-weather-wet-track"),
            [56.0, 122.0, 176.0, 5.0],
        );
        let fill = by_key(&elements, "track-weather-wet-fill");
        near_rect(fill, [56.0, 122.0, 44.0, 5.0]);
        assert_eq!(fill.fill, BLUE);
        assert_eq!(
            by_key(&elements, "track-weather-wet").text.as_deref(),
            Some("25 %")
        );
        for index in 0..5 {
            near_rect(
                by_key(&elements, &format!("track-weather-card-{index}")),
                [14.0 + index as f32 * 50.4, 142.0, 49.0, 58.0],
            );
            near_rect(
                by_key(&elements, &format!("track-weather-card-dot-{index}")),
                [14.0 + index as f32 * 50.4 + 18.0, 150.0, 13.0, 13.0],
            );
        }
        assert_eq!(
            by_key(&elements, "track-weather-card-value-0")
                .text
                .as_deref(),
            Some("0 %")
        );
        assert_eq!(
            by_key(&elements, "track-weather-card-value-1")
                .text
                .as_deref(),
            Some("—")
        );
        assert_eq!(
            by_key(&elements, "track-weather-card-label-0")
                .text
                .as_deref(),
            Some("Ahora")
        );
        near_rect(
            by_key(&elements, "track-weather-arrow"),
            [193.0, 69.0, 20.0, 20.0],
        );
        near_rect(
            by_key(&elements, "track-weather-wind-circle"),
            [193.0, 69.0, 20.0, 20.0],
        );
    }

    #[test]
    fn the_vertical_column_keeps_the_full_wind_and_drops_the_arrow() {
        let vm = reference();
        let scene = build(Layout::Vertical, &vm, Language::Es, "", Some(0.7));
        assert_eq!(scene.wind_heading, None, "la columna no pinta la flecha");
        let elements = elements(Preferences::default(), &scene);
        let style = Style::compiled();
        assert_eq!(by_key(&elements, "track-weather-band").fill, WET_BANNER);
        near_rect(
            by_key(&elements, "track-weather-banner"),
            [12.0, 3.0 + style.fonts.display_baseline, 118.0, 18.0],
        );
        assert_eq!(
            by_key(&elements, "track-weather-title").text.as_deref(),
            Some("TIEMPO")
        );
        near_rect(
            by_key(&elements, "track-weather-track"),
            [12.0, 52.0 + style.fonts.display_baseline, 100.0, 40.0],
        );
        assert_eq!(
            by_key(&elements, "track-weather-row-label-0")
                .text
                .as_deref(),
            Some("AIRE")
        );
        assert_eq!(
            by_key(&elements, "track-weather-row-label-1")
                .text
                .as_deref(),
            Some("VIENTO")
        );
        assert_eq!(
            by_key(&elements, "track-weather-row-label-2")
                .text
                .as_deref(),
            Some("AGUA")
        );
        for row in 0..3 {
            near_rect(
                by_key(&elements, &format!("track-weather-row-line-{row}")),
                [12.0, 98.0 + row as f32 * 24.0, 108.0, 1.0],
            );
        }
        assert_eq!(
            by_key(&elements, "track-weather-row-0").text.as_deref(),
            Some("21°")
        );
        assert_eq!(
            by_key(&elements, "track-weather-row-1").text.as_deref(),
            Some("14 km/h NO"),
            "la columna no quita el cardinal"
        );
        near_rect(
            by_key(&elements, "track-weather-row-0"),
            [40.0, 101.0, 80.0, 20.0],
        );
        near_rect(
            by_key(&elements, "track-weather-wet-fill"),
            [12.0, 174.0, 27.0, 5.0],
        );
        for index in 0..5 {
            near_rect(
                by_key(&elements, &format!("track-weather-card-{index}")),
                [12.0, 189.0 + index as f32 * 47.5, 108.0, 46.5],
            );
        }
        near_rect(
            by_key(&elements, "track-weather-card-dot-0"),
            [64.0, 205.0, 14.0, 14.0],
        );
        assert!(absent(&elements, "track-weather-arrow"));
    }

    #[test]
    fn missing_uses_the_wide_placeholder_without_a_banner() {
        let mut vm = reference();
        vm.status = Status::Missing;
        vm.status_text = "SIN DATOS";
        vm.metrics.clear();
        vm.wet_percent = None;
        let scene = build(Layout::Wide, &vm, Language::Es, "", None);
        let elements = elements(Preferences::default(), &scene);
        assert_eq!(
            by_key(&elements, "track-weather-title").text.as_deref(),
            Some("TIEMPO EN PISTA")
        );
        assert_eq!(
            by_key(&elements, "track-weather-empty-0").text.as_deref(),
            Some("--°")
        );
        assert_eq!(
            by_key(&elements, "track-weather-empty-label-0")
                .text
                .as_deref(),
            Some("pista")
        );
        assert_eq!(
            by_key(&elements, "track-weather-waiting").text.as_deref(),
            Some("Esperando a LMU")
        );
        assert!(absent(&elements, "track-weather-banner"));
        assert!(absent(&elements, "track-weather-band"));
    }

    #[test]
    fn stale_keeps_the_layout_and_shows_the_source_notice() {
        let mut vm = reference();
        vm.status = Status::Stale;
        vm.status_text = "DATOS ANTIGUOS";
        vm.metrics.clear();
        vm.wet_percent = None;
        let scene = build(Layout::Wide, &vm, Language::Es, "", None);
        let elements = elements(Preferences::default(), &scene);
        assert_eq!(by_key(&elements, "track-weather-band").fill, DRY_BANNER);
        assert_eq!(
            by_key(&elements, "track-weather-banner").text.as_deref(),
            Some("DATOS ANTIGUOS")
        );
        assert_eq!(
            by_key(&elements, "track-weather-track").text.as_deref(),
            Some("--°")
        );
        assert!(absent(&elements, "track-weather-wet-fill"));
        assert_eq!(
            by_key(&elements, "track-weather-card-value-0")
                .text
                .as_deref(),
            Some("—")
        );
    }

    #[test]
    fn vertical_missing_and_stale_paint_the_normal_layout() {
        for (status, notice) in [
            (Status::Missing, "SIN DATOS"),
            (Status::Stale, "DATOS ANTIGUOS"),
        ] {
            let mut vm = reference();
            vm.status = status;
            vm.status_text = notice;
            vm.metrics.clear();
            vm.wet_percent = None;
            let scene = build(Layout::Vertical, &vm, Language::Es, "", None);
            let elements = elements(Preferences::default(), &scene);
            assert_eq!(
                by_key(&elements, "track-weather-banner").text.as_deref(),
                Some(notice)
            );
            assert_eq!(
                by_key(&elements, "track-weather-title").text.as_deref(),
                Some("TIEMPO")
            );
            assert_eq!(
                by_key(&elements, "track-weather-track").text.as_deref(),
                Some("--°")
            );
            assert_eq!(
                by_key(&elements, "track-weather-row-0").text.as_deref(),
                Some("—")
            );
            assert!(absent(&elements, "track-weather-waiting"));
            assert!(absent(&elements, "track-weather-wet-fill"));
        }
    }

    #[test]
    fn disconnected_uses_the_wide_placeholder_and_the_vertical_band() {
        let mut vm = reference();
        vm.status = Status::Disconnected;
        vm.status_text = "DESCONECTADO";
        vm.metrics.clear();
        vm.wet_percent = None;
        let wide = elements(
            Preferences::default(),
            &build(Layout::Wide, &vm, Language::Es, "", None),
        );
        assert_eq!(
            by_key(&wide, "track-weather-waiting").text.as_deref(),
            Some("Esperando a LMU")
        );
        assert!(absent(&wide, "track-weather-banner"));
        let vertical = elements(
            Preferences::default(),
            &build(Layout::Vertical, &vm, Language::Es, "", None),
        );
        assert_eq!(
            by_key(&vertical, "track-weather-banner").text.as_deref(),
            Some("DESCONECTADO")
        );
    }

    #[test]
    fn wet_zero_says_seca_or_dry() {
        let mut vm = reference();
        vm.wet_percent = Some(0);
        let spanish = elements(
            Preferences::default(),
            &build(Layout::Wide, &vm, Language::Es, "", None),
        );
        assert_eq!(
            by_key(&spanish, "track-weather-wet").text.as_deref(),
            Some("Seca")
        );
        let english = elements(
            Preferences {
                language: Language::En,
                ..Preferences::default()
            },
            &build(Layout::Wide, &vm, Language::En, "", None),
        );
        assert_eq!(
            by_key(&english, "track-weather-wet").text.as_deref(),
            Some("Dry")
        );
    }

    #[test]
    fn imperial_values_keep_the_domain_texts() {
        let mut vm = reference();
        vm.metrics = vec![
            Metric {
                label: "TRACK",
                value: "82 °F".into(),
            },
            Metric {
                label: "AIR",
                value: "70 °F".into(),
            },
            Metric {
                label: "WIND",
                value: "9 mph NW".into(),
            },
            Metric {
                label: "RAIN",
                value: "0 %".into(),
            },
            Metric {
                label: "WET",
                value: "0 %".into(),
            },
            Metric {
                label: "DRY",
                value: "100%".into(),
            },
            Metric {
                label: "PRESS",
                value: "—".into(),
            },
        ];
        vm.wet_percent = Some(0);
        let prefs = Preferences {
            language: Language::En,
            ..Preferences::default()
        };
        let wide = elements(
            prefs,
            &build(Layout::Wide, &vm, Language::En, "", Some(0.0)),
        );
        assert_eq!(
            by_key(&wide, "track-weather-air").text.as_deref(),
            Some("70°")
        );
        assert_eq!(
            by_key(&wide, "track-weather-wind").text.as_deref(),
            Some("9 mph")
        );
        let vertical = elements(
            prefs,
            &build(Layout::Vertical, &vm, Language::En, "", Some(0.0)),
        );
        assert_eq!(
            by_key(&vertical, "track-weather-row-1").text.as_deref(),
            Some("9 mph NW")
        );
    }

    #[test]
    fn english_changes_the_words_and_a_long_session_is_not_ellipsized() {
        let mut vm = reference();
        vm.wet_percent = Some(0);
        let long = "CARRERA · 08:42 · CIRCUIT DE BARCELONA-CATALUNYA";
        let scene = build(Layout::Wide, &vm, Language::En, long, None);
        let elements = elements(
            Preferences {
                language: Language::En,
                ..Preferences::default()
            },
            &scene,
        );
        assert_eq!(
            by_key(&elements, "track-weather-banner").text.as_deref(),
            Some("DRY")
        );
        assert_eq!(
            by_key(&elements, "track-weather-card-label-0")
                .text
                .as_deref(),
            Some("Now")
        );
        let session = by_key(&elements, "track-weather-session");
        assert_eq!(session.text.as_deref(), Some(long));
        assert!(
            !session
                .text
                .as_deref()
                .is_some_and(|text| text.ends_with('…'))
        );
    }

    #[test]
    fn the_narrow_boxes_fit_their_painted_text_with_margin() {
        let style = Style::compiled();
        let mut text = TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter"));
        let mut measured = |value: &str, face: Face, size: f32, tracking: f32, weight: f32| {
            text.measure(value, font(&style, face, size, 20.0, tracking, weight), 1.0)
                .0
        };
        let vm = reference();
        let wide = elements(
            Preferences::default(),
            &build(
                Layout::Wide,
                &vm,
                Language::Es,
                "CLASIFICACIÓN · 08:42",
                None,
            ),
        );
        let session = by_key(&wide, "track-weather-session");
        assert!(
            measured(
                "CLASIFICACIÓN · 08:42",
                Face::Body,
                10.0,
                0.4,
                style.fonts.regular_weight
            ) + 2.0
                <= session.rect[2]
        );
        let label = by_key(&wide, "track-weather-card-label-0");
        assert!(
            measured("Ahora", Face::Body, 10.0, 0.4, style.fonts.regular_weight) + 2.0
                <= label.rect[2]
        );
        let mut stale = reference();
        stale.status = Status::Stale;
        stale.status_text = "DATOS ANTIGUOS";
        stale.metrics.clear();
        stale.wet_percent = None;
        let vertical = elements(
            Preferences::default(),
            &build(Layout::Vertical, &stale, Language::Es, "", None),
        );
        let wind = by_key(&vertical, "track-weather-row-label-1");
        assert!(
            measured("VIENTO", Face::Body, 10.0, 0.4, style.fonts.regular_weight) + 2.0
                <= wind.rect[2]
        );
        let banner = by_key(&vertical, "track-weather-banner");
        assert!(
            measured("DATOS ANTIGUOS", Face::Display, 11.0, 0.5, 600.0) + 2.0 <= banner.rect[2]
        );
    }

    #[test]
    fn arrow_points_stay_inside_its_canvas() {
        for heading in [
            0.0,
            std::f32::consts::FRAC_PI_2,
            std::f32::consts::PI,
            1.234,
        ] {
            for [x, y] in scene::arrow(heading) {
                let (x, y) = (x + 10.0, y + 10.0);
                assert!((0.0..=20.0).contains(&x), "x {x} con rumbo {heading}");
                assert!((0.0..=20.0).contains(&y), "y {y} con rumbo {heading}");
            }
        }
    }

    #[test]
    fn no_painted_element_falls_outside_the_window() {
        let vm = reference();
        for (layout, size) in [
            (Layout::Wide, (280.0, 210.0)),
            (Layout::Vertical, (132.0, 440.0)),
        ] {
            for status in [Status::Ready, Status::Stale, Status::Missing] {
                let mut view = vm.clone();
                view.status = status;
                if status != Status::Ready {
                    view.status_text = "SIN DATOS";
                    view.metrics.clear();
                    view.wet_percent = None;
                }
                let scene = build(layout, &view, Language::Es, "CARRERA · 08:42", Some(0.7));
                let mut runtime = runtime(Preferences::default(), &scene);
                crate::testdata::assert_inside_window(&mut runtime, size);
            }
        }
    }
}
