//! Vantare paints the shared Car damage scene: one 200 × 272 panel with the Car
//! drawing and the Values rows, no animation.
use super::scene::{HEIGHT, ROW_PITCH, ROWS_TOP, SEPARATOR, Scene, View, WIDTH};
use crate::vantare::paint::{Face, WHITE, font};
use crate::vantare::{Style, alpha};
use rune::{Align, Color, El, LineCap, Path, Shape, canvas, el, text};
use std::sync::Arc;

const RED: Color = Color {
    r: 0xf2 as f32 / 255.0,
    g: 0x5a as f32 / 255.0,
    b: 0x5a as f32 / 255.0,
    a: 1.0,
};
const AMBER: Color = Color {
    r: 0xf5 as f32 / 255.0,
    g: 0x9e as f32 / 255.0,
    b: 0x0b as f32 / 255.0,
    a: 1.0,
};
const GREEN: Color = Color {
    r: 0x22 as f32 / 255.0,
    g: 0xc5 as f32 / 255.0,
    b: 0x5e as f32 / 255.0,
    a: 1.0,
};
const UNKNOWN: Color = Color {
    r: 0x5a as f32 / 255.0,
    g: 0x50 as f32 / 255.0,
    b: 0x52 as f32 / 255.0,
    a: 1.0,
};
const BAND: Color = Color {
    r: 0xb5 as f32 / 255.0,
    g: 0x2b as f32 / 255.0,
    b: 0x35 as f32 / 255.0,
    a: 1.0,
};
const TAB_ON: Color = Color {
    r: 0xe1 as f32 / 255.0,
    g: 0x4a as f32 / 255.0,
    b: 0x54 as f32 / 255.0,
    a: 1.0,
};
const TAB_IN: Color = Color {
    r: 0x51 as f32 / 255.0,
    g: 0x27 as f32 / 255.0,
    b: 0x2c as f32 / 255.0,
    a: 1.0,
};
const TAB_TEXT_ON: Color = Color {
    r: 0xec as f32 / 255.0,
    g: 0xe6 as f32 / 255.0,
    b: 0xe7 as f32 / 255.0,
    a: 1.0,
};
const TAB_TEXT_OFF: Color = Color {
    r: 0x8e as f32 / 255.0,
    g: 0x85 as f32 / 255.0,
    b: 0x87 as f32 / 255.0,
    a: 1.0,
};
const BODY_INTACT: Color = Color {
    r: 0x3a as f32 / 255.0,
    g: 0x33 as f32 / 255.0,
    b: 0x35 as f32 / 255.0,
    a: 1.0,
};
const TYRE: Color = UNKNOWN;
const PANEL_LINE: Color = Color {
    r: 0x11 as f32 / 255.0,
    g: 0x0f as f32 / 255.0,
    b: 0x10 as f32 / 255.0,
    a: 1.0,
};
const CABIN: Color = Color {
    r: 0x0d as f32 / 255.0,
    g: 0x0b as f32 / 255.0,
    b: 0x0c as f32 / 255.0,
    a: 1.0,
};

/// GPUI's `tone`: red below 60 %, amber below 90 %, green otherwise.
fn tone(value: Option<f64>) -> Color {
    match value {
        Some(value) if value < 0.6 => RED,
        Some(value) if value < 0.9 => AMBER,
        Some(_) => GREEN,
        None => UNKNOWN,
    }
}

/// Body of the car: the intact grey, otherwise the damage tone at 22 %.
fn body_fill(integrity: Option<f64>) -> Color {
    if integrity == Some(1.0) {
        alpha(BODY_INTACT, 0.5)
    } else {
        alpha(tone(integrity), 0.22)
    }
}

pub(super) struct Painter {
    style: Arc<Style>,
    scene: Scene,
}

impl Painter {
    pub fn new(scene: &Scene) -> Self {
        Self {
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
        let v = &s.styles.neo;
        let border = if v.border_accent > 0.0 {
            alpha(s.accents.red, v.border_accent)
        } else {
            v.border
        };
        let root = el()
            .key("car-damage-visual-view")
            .size(WIDTH, HEIGHT)
            .motion(rune::Spring::NONE)
            .radius(v.radius)
            .border(1.0, border)
            .linear_gradient(std::f32::consts::PI, [(0.0, v.top), (1.0, v.bottom)])
            .shadow(
                v.shadow_y,
                v.shadow_blur,
                alpha(s.colors.shadow, v.shadow_alpha),
            );
        let root = self.header(root);
        let root = match self.scene.view {
            View::Car => self.car(root),
            View::Numbers => self.numbers(root),
        };
        root.child(
            el().key("car-damage-visual-rule")
                .size(176.0, 1.0)
                .fill(alpha(WHITE, 0.08))
                .pin(Some(12.0), Some(244.0), None, None),
        )
        .child(
            text(self.scene.status.clone())
                .key("car-damage-visual-status")
                .font(self.body_font(11.0, 16.0, 0.3))
                .color(self.style.colors.muted)
                .size(176.0, 16.0)
                .pin(Some(12.0), Some(248.0), None, None),
        )
    }
    fn body_font(&self, size: f32, height: f32, tracking: f32) -> rune::TextStyle {
        font(
            &self.style,
            Face::Body,
            size,
            height,
            tracking,
            self.style.fonts.regular_weight,
        )
    }
    fn header(&self, mut root: El) -> El {
        let s = &self.style;
        if let Some(band) = self.scene.band {
            root = root
                .child(
                    el().key("car-damage-visual-band")
                        .size(198.0, 22.0)
                        .radius(9.0)
                        .fill(BAND)
                        .pin(Some(1.0), Some(1.0), None, None),
                )
                .child(
                    text(band)
                        .key("car-damage-visual-band-text")
                        .font(font(s, Face::Display, 12.0, 18.0, 1.4, 600.0))
                        .color(s.colors.text)
                        .size(176.0, 18.0)
                        .pin(Some(12.0), Some(2.0 + s.fonts.display_baseline), None, None),
                );
        }
        root = root.child(
            text(self.scene.heading)
                .key("car-damage-visual-heading")
                .font(self.body_font(11.0, 18.0, 0.3))
                .color(s.colors.muted)
                .size(120.0, 18.0)
                .pin(Some(12.0), Some(31.0), None, None),
        );
        for (index, (label, x, selected)) in [
            (self.scene.tab_car, 100.0, self.scene.view == View::Car),
            (
                self.scene.tab_numbers,
                144.0,
                self.scene.view == View::Numbers,
            ),
        ]
        .into_iter()
        .enumerate()
        {
            root = root.child(
                el().key(format!("car-damage-visual-tab-{index}"))
                    .size(44.0, 24.0)
                    .radius(4.0)
                    .fill(alpha(
                        if selected { TAB_ON } else { WHITE },
                        if selected { 0.38 } else { 0.03 },
                    ))
                    .pin(Some(x), Some(28.0), None, None),
            );
            if selected {
                root = root.child(
                    el().key(format!("car-damage-visual-tab-inner-{index}"))
                        .size(42.0, 22.0)
                        .radius(3.0)
                        .fill(TAB_IN)
                        .pin(Some(x + 1.0), Some(29.0), None, None),
                );
            }
            root = root.child(
                text(label)
                    .key(format!("car-damage-visual-tab-text-{index}"))
                    .font(self.body_font(10.0, 16.0, 0.0))
                    .color(if selected { TAB_TEXT_ON } else { TAB_TEXT_OFF })
                    .size(32.0, 16.0)
                    .pin(Some(x + 6.0), Some(32.0), None, None),
            );
        }
        root
    }
    fn numbers(&self, mut root: El) -> El {
        let s = &self.style;
        let slots = 4 - usize::from(!self.scene.show_aero);
        for slot in 0..slots {
            root = root.child(
                el().key(format!("car-damage-visual-rule-{slot}"))
                    .size(176.0, 1.0)
                    .fill(alpha(WHITE, 0.06))
                    .pin(
                        Some(12.0),
                        Some(ROWS_TOP + slot as f32 * ROW_PITCH + SEPARATOR),
                        None,
                        None,
                    ),
            );
        }
        for index in self.scene.rows() {
            let slot = index - usize::from(!self.scene.show_aero);
            let y = ROWS_TOP + slot as f32 * ROW_PITCH;
            root = root.child(
                text(self.scene.labels[index])
                    .key(format!("car-damage-visual-row-label-{index}"))
                    .font(self.body_font(11.0, 18.0, 0.3))
                    .color(s.colors.muted)
                    .size(176.0, 18.0)
                    .pin(Some(12.0), Some(y), None, None),
            );
            if index < 3 {
                root = root.child(
                    text(self.scene.percentages[index].clone())
                        .key(format!("car-damage-visual-row-value-{index}"))
                        .font(font(s, Face::Display, 22.0, 24.0, 0.0, 600.0))
                        .color(tone(self.scene.integrity[index]))
                        .size(100.0, 24.0)
                        .align(Align::End)
                        .pin(
                            Some(88.0),
                            Some(y + 12.0 + s.fonts.display_baseline),
                            None,
                            None,
                        ),
                );
            } else {
                for tyre in 0..4 {
                    root = root.child(
                        text(self.scene.tyre_percentages[tyre].clone())
                            .key(format!("car-damage-visual-tyre-{tyre}"))
                            .font(font(s, Face::Mono, 10.0, 16.0, 0.0, 400.0))
                            .color(tone(self.scene.tyres[tyre]))
                            .size(40.0, 16.0)
                            .pin(
                                Some(16.0 + tyre as f32 * ROW_PITCH),
                                Some(y + 18.0 + s.fonts.mono_baseline),
                                None,
                                None,
                            ),
                    );
                }
            }
        }
        root
    }
    fn car(&self, mut root: El) -> El {
        let s = &self.style;
        let pt = |x: f32, y: f32| [47.2 + x * 0.88, 70.0 + y * 0.88];
        // Approved SVG: viewBox 120 × 180 fitted to the card body.
        let mut body = Path::new()
            .move_to(pt(32.0, 34.0))
            .quad_to(pt(48.0, 9.0), pt(30.0, 14.0))
            .line_to(pt(72.0, 9.0))
            .quad_to(pt(88.0, 34.0), pt(90.0, 14.0))
            .line_to(pt(90.0, 58.0))
            .quad_to(pt(90.0, 122.0), pt(85.0, 90.0))
            .line_to(pt(88.0, 148.0))
            .quad_to(pt(76.0, 158.0), pt(86.0, 158.0))
            .line_to(pt(44.0, 158.0))
            .quad_to(pt(32.0, 148.0), pt(34.0, 158.0))
            .line_to(pt(30.0, 122.0))
            .quad_to(pt(30.0, 58.0), pt(35.0, 90.0));
        let fill = body_fill(self.scene.integrity[1]);
        body = body.close();
        root = root.child(
            canvas(Shape::new().fill_path(&body, fill).stroke_path(
                &body,
                1.2,
                LineCap::Butt,
                alpha(WHITE, 0.28),
            ))
            .key("car-damage-visual-body")
            .size(WIDTH, HEIGHT)
            .pin(Some(0.0), Some(0.0), None, None),
        );
        for (index, (x, y)) in [(18.0, 24.0), (92.0, 24.0), (18.0, 118.0), (92.0, 118.0)]
            .into_iter()
            .enumerate()
        {
            root = root.child(
                el().key(format!("car-damage-visual-wheel-{index}"))
                    .size(8.8, 24.64)
                    .radius(3.0)
                    .fill(TYRE)
                    .pin(Some(pt(x, y)[0]), Some(pt(x, y)[1]), None, None),
            );
        }
        let panels = Path::new()
            .move_to(pt(60.0, 54.0))
            .line_to(pt(60.0, 124.0))
            .move_to(pt(30.0, 54.0))
            .line_to(pt(90.0, 54.0))
            .move_to(pt(30.0, 124.0))
            .line_to(pt(90.0, 124.0));
        root = root.child(
            canvas(Shape::new().stroke_path(&panels, 2.0, LineCap::Butt, PANEL_LINE))
                .key("car-damage-visual-panels")
                .size(WIDTH, HEIGHT)
                .pin(Some(0.0), Some(0.0), None, None),
        );
        let cabin = Path::new()
            .move_to(pt(52.0, 62.0))
            .quad_to(pt(68.0, 62.0), pt(60.0, 50.0))
            .line_to(pt(68.0, 92.0))
            .quad_to(pt(52.0, 92.0), pt(60.0, 98.0))
            .close();
        root = root.child(
            canvas(Shape::new().fill_path(&cabin, CABIN).stroke_path(
                &cabin,
                1.0,
                LineCap::Butt,
                alpha(WHITE, 0.18),
            ))
            .key("car-damage-visual-cabin")
            .size(WIDTH, HEIGHT)
            .pin(Some(0.0), Some(0.0), None, None),
        );
        if self.scene.show_aero {
            // Aggregated aero integrity cannot tell one wing from another.
            root = root.child(
                el().key("car-damage-visual-wing")
                    .size(63.36, 7.92)
                    .radius(2.0)
                    .fill(alpha(WHITE, 0.09))
                    .pin(Some(68.32), Some(212.56), None, None),
            );
            if let Some(legend) = &self.scene.aero_legend {
                root = root.child(
                    text(legend.clone())
                        .key("car-damage-visual-aero")
                        .font(font(s, Face::Mono, 10.0, 16.0, 0.0, 400.0))
                        .color(tone(self.scene.integrity[0]))
                        .size(100.0, 16.0)
                        .pin(Some(12.0), Some(62.0 + s.fonts.mono_baseline), None, None),
                );
            }
        }
        root
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::car_damage_visual::scene;
    use rune::{Cx, ElementInfo, Env, Runtime, text::TextSystem};
    use vantare_domain::car_damage_visual::ViewModel;

    struct Stub(Painter);

    fn stub_view(stub: &Stub, _: &mut Cx<Stub>) -> El {
        stub.0.view()
    }

    fn vm() -> ViewModel {
        ViewModel {
            show_aero: true,
            integrity: [Some(0.2), Some(0.7), Some(0.9)],
            tyres: [Some(0.98), Some(0.91), Some(0.87), Some(0.93)],
            status: None,
            damage: [Some(0.8), Some(0.3), Some(0.1)],
            labels: ["AERO", "CARROC.", "SUSP"],
            percentages: ["80%".into(), "30%".into(), "10%".into()],
        }
    }

    fn runtime(scene: &Scene) -> Runtime<Stub> {
        let mut runtime = Runtime::with_text(
            Stub(Painter::new(scene)),
            stub_view,
            (WIDTH, HEIGHT),
            Env::new(true, 1.0),
            TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.frame(0.0);
        runtime
    }

    fn elements(scene: &Scene) -> Vec<ElementInfo> {
        runtime(scene).elements()
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
    fn the_car_view_paints_the_panel_header_and_approved_shape() {
        let scene = scene::sample(&vm(), View::Car, true, vantare_domain::format::Language::Es);
        let elements = elements(&scene);
        let style = Style::compiled();
        near_rect(
            by_key(&elements, "car-damage-visual-view"),
            [0.0, 0.0, 200.0, 272.0],
        );
        near_rect(
            by_key(&elements, "car-damage-visual-band"),
            [1.0, 1.0, 198.0, 22.0],
        );
        assert_eq!(
            by_key(&elements, "car-damage-visual-band-text")
                .text
                .as_deref(),
            Some("REVISA EL COCHE")
        );
        near_rect(
            by_key(&elements, "car-damage-visual-band-text"),
            [12.0, 2.0 + style.fonts.display_baseline, 176.0, 18.0],
        );
        assert_eq!(
            by_key(&elements, "car-damage-visual-heading")
                .text
                .as_deref(),
            Some("DAÑOS")
        );
        let tab = by_key(&elements, "car-damage-visual-tab-0");
        near_rect(tab, [100.0, 28.0, 44.0, 24.0]);
        assert_eq!(tab.fill, alpha(TAB_ON, 0.38));
        assert!(absent(&elements, "car-damage-visual-tab-inner-1"));
        near_rect(
            by_key(&elements, "car-damage-visual-tab-inner-0"),
            [101.0, 29.0, 42.0, 22.0],
        );
        assert_eq!(
            by_key(&elements, "car-damage-visual-tab-text-0")
                .text
                .as_deref(),
            Some("Coche")
        );
        let body = by_key(&elements, "car-damage-visual-body");
        near_rect(body, [0.0, 0.0, 200.0, 272.0]);
        assert_eq!(body_fill(Some(0.7)), alpha(tone(Some(0.7)), 0.22));
        for (index, (x, y)) in [(18.0, 24.0), (92.0, 24.0), (18.0, 118.0), (92.0, 118.0)]
            .into_iter()
            .enumerate()
        {
            near_rect(
                by_key(&elements, &format!("car-damage-visual-wheel-{index}")),
                [47.2 + x * 0.88, 70.0 + y * 0.88, 8.8, 24.64],
            );
        }
        near_rect(
            by_key(&elements, "car-damage-visual-wing"),
            [68.32, 212.56, 63.36, 7.92],
        );
        assert_eq!(
            by_key(&elements, "car-damage-visual-aero").text.as_deref(),
            Some("Aero 20%")
        );
        near_rect(
            by_key(&elements, "car-damage-visual-rule"),
            [12.0, 244.0, 176.0, 1.0],
        );
        assert_eq!(
            by_key(&elements, "car-damage-visual-status")
                .text
                .as_deref(),
            Some("Integridad del coche")
        );
        assert!(absent(&elements, "car-damage-visual-row-label-1"));
    }

    #[test]
    fn the_numbers_view_paints_rows_values_and_tyres() {
        let scene = scene::sample(
            &vm(),
            View::Numbers,
            true,
            vantare_domain::format::Language::Es,
        );
        let elements = elements(&scene);
        let style = Style::compiled();
        assert_eq!(
            by_key(&elements, "car-damage-visual-tab-text-1")
                .text
                .as_deref(),
            Some("Cifras")
        );
        near_rect(
            by_key(&elements, "car-damage-visual-tab-inner-1"),
            [145.0, 29.0, 42.0, 22.0],
        );
        for slot in 0..4 {
            near_rect(
                by_key(&elements, &format!("car-damage-visual-rule-{slot}")),
                [12.0, 62.0 + slot as f32 * 43.0 + 39.0, 176.0, 1.0],
            );
        }
        for (index, (label, value, y)) in [
            ("Aero", "80%", 62.0),
            ("Carrocería", "30%", 105.0),
            ("Suspensión", "10%", 148.0),
        ]
        .into_iter()
        .enumerate()
        {
            assert_eq!(
                by_key(&elements, &format!("car-damage-visual-row-label-{index}"))
                    .text
                    .as_deref(),
                Some(label)
            );
            let painted = by_key(&elements, &format!("car-damage-visual-row-value-{index}"));
            assert_eq!(painted.text.as_deref(), Some(value));
            near_rect(
                painted,
                [88.0, y + 12.0 + style.fonts.display_baseline, 100.0, 24.0],
            );
        }
        assert_eq!(
            by_key(&elements, "car-damage-visual-row-label-3")
                .text
                .as_deref(),
            Some("Neumáticos")
        );
        for (tyre, text) in ["2%", "9%", "13%", "7%"].into_iter().enumerate() {
            let painted = by_key(&elements, &format!("car-damage-visual-tyre-{tyre}"));
            assert_eq!(painted.text.as_deref(), Some(text));
            near_rect(
                painted,
                [
                    16.0 + tyre as f32 * 43.0,
                    209.0 + style.fonts.mono_baseline,
                    40.0,
                    16.0,
                ],
            );
        }
        assert_eq!(
            by_key(&elements, "car-damage-visual-row-value-0").text_color,
            Some(RED)
        );
        assert_eq!(
            by_key(&elements, "car-damage-visual-tyre-0").text_color,
            Some(GREEN)
        );
        assert!(absent(&elements, "car-damage-visual-body"));
        assert!(absent(&elements, "car-damage-visual-wing"));
    }

    #[test]
    fn hidden_aero_compacts_the_numbers_without_moving_the_tyres_row() {
        let mut view = vm();
        view.show_aero = false;
        let scene = scene::sample(
            &view,
            View::Numbers,
            true,
            vantare_domain::format::Language::Es,
        );
        let elements = elements(&scene);
        assert!(absent(&elements, "car-damage-visual-row-label-0"));
        assert!(absent(&elements, "car-damage-visual-rule-3"));
        near_rect(
            by_key(&elements, "car-damage-visual-row-label-1"),
            [12.0, 62.0, 176.0, 18.0],
        );
        near_rect(
            by_key(&elements, "car-damage-visual-row-label-3"),
            [12.0, 148.0, 176.0, 18.0],
        );
        near_rect(
            by_key(&elements, "car-damage-visual-rule-0"),
            [12.0, 101.0, 176.0, 1.0],
        );
    }

    #[test]
    fn the_severity_band_and_the_english_words() {
        let mut view = vm();
        view.integrity = [Some(0.1), Some(0.2), Some(0.3)];
        let scene = scene::sample(&view, View::Car, true, vantare_domain::format::Language::En);
        let elements = elements(&scene);
        assert_eq!(
            by_key(&elements, "car-damage-visual-band-text")
                .text
                .as_deref(),
            Some("CHECK YOUR CAR")
        );
        assert_eq!(
            by_key(&elements, "car-damage-visual-heading")
                .text
                .as_deref(),
            Some("DAMAGE")
        );
        assert_eq!(
            by_key(&elements, "car-damage-visual-tab-text-0")
                .text
                .as_deref(),
            Some("Car")
        );
    }

    #[test]
    fn without_a_band_or_aero_the_boxes_disappear() {
        let mut view = vm();
        view.integrity = [Some(1.0); 3];
        let scene = scene::sample(
            &view,
            View::Car,
            false,
            vantare_domain::format::Language::Es,
        );
        let elements = elements(&scene);
        assert!(absent(&elements, "car-damage-visual-band"));
        assert!(absent(&elements, "car-damage-visual-aero"));
        assert_eq!(
            by_key(&elements, "car-damage-visual-status")
                .text
                .as_deref(),
            Some("Coche intacto")
        );
        assert_eq!(body_fill(Some(1.0)), alpha(BODY_INTACT, 0.5));
    }

    #[test]
    fn missing_data_keeps_the_grey_tone_and_the_notice() {
        let mut view = vm();
        view.integrity = [None; 3];
        view.tyres = [None; 4];
        view.percentages = ["-".to_owned(), "-".to_owned(), "-".to_owned()];
        view.status = Some("DATOS ANTIGUOS");
        let scene = scene::sample(
            &view,
            View::Numbers,
            true,
            vantare_domain::format::Language::Es,
        );
        let elements = elements(&scene);
        assert_eq!(
            by_key(&elements, "car-damage-visual-row-value-0").text_color,
            Some(UNKNOWN)
        );
        assert_eq!(
            by_key(&elements, "car-damage-visual-tyre-0").text_color,
            Some(UNKNOWN)
        );
        assert_eq!(
            by_key(&elements, "car-damage-visual-status")
                .text
                .as_deref(),
            Some("DATOS ANTIGUOS")
        );
        assert!(absent(&elements, "car-damage-visual-band"));
    }

    #[test]
    fn the_whole_box_stays_inside_the_window() {
        for view in [View::Car, View::Numbers] {
            for status in [None, Some("DATOS ANTIGUOS"), Some("DESCONECTADO")] {
                let mut data = vm();
                data.status = status;
                if status.is_some() {
                    data.integrity = [None; 3];
                    data.tyres = [None; 4];
                }
                let scene = scene::sample(&data, view, true, vantare_domain::format::Language::Es);
                let mut runtime = runtime(&scene);
                crate::testdata::assert_inside_window(&mut runtime, (WIDTH, HEIGHT));
            }
        }
    }

    #[test]
    fn the_painted_texts_fit_their_boxes_with_margin() {
        let style = Style::compiled();
        let mut texts = TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter"));
        let mut measure = |value: &str, face: Face, size: f32, tracking: f32, weight: f32| {
            texts
                .measure(value, font(&style, face, size, 18.0, tracking, weight), 1.0)
                .0
        };
        let numbers = scene::sample(
            &vm(),
            View::Numbers,
            true,
            vantare_domain::format::Language::Es,
        );
        let painted_elements = elements(&numbers);
        for index in 0..4 {
            let label = by_key(
                &painted_elements,
                &format!("car-damage-visual-row-label-{index}"),
            );
            assert!(
                measure(
                    label.text.as_deref().unwrap(),
                    Face::Body,
                    11.0,
                    0.3,
                    style.fonts.regular_weight
                ) + 2.0
                    <= label.rect[2],
                "rótulo {} no cabe",
                label.text.as_deref().unwrap_or("?")
            );
        }
        let tab = by_key(&painted_elements, "car-damage-visual-tab-text-1");
        assert!(
            measure(
                tab.text.as_deref().unwrap(),
                Face::Body,
                10.0,
                0.0,
                style.fonts.regular_weight
            ) + 2.0
                <= tab.rect[2]
        );
        let heading = by_key(&painted_elements, "car-damage-visual-heading");
        assert!(
            measure(
                heading.text.as_deref().unwrap(),
                Face::Body,
                11.0,
                0.3,
                style.fonts.regular_weight
            ) + 2.0
                <= heading.rect[2]
        );
        let status = by_key(&painted_elements, "car-damage-visual-status");
        assert!(
            measure(
                status.text.as_deref().unwrap(),
                Face::Body,
                11.0,
                0.3,
                style.fonts.regular_weight
            ) + 2.0
                <= status.rect[2]
        );
        let car = scene::sample(&vm(), View::Car, true, vantare_domain::format::Language::Es);
        let painted = elements(&car);
        let band = by_key(&painted, "car-damage-visual-band-text");
        assert!(
            measure(
                band.text.as_deref().unwrap(),
                Face::Display,
                12.0,
                1.4,
                600.0
            ) + 2.0
                <= band.rect[2]
        );
        let aero = by_key(&painted, "car-damage-visual-aero");
        assert!(
            measure(aero.text.as_deref().unwrap(), Face::Mono, 10.0, 0.0, 400.0) + 2.0
                <= aero.rect[2]
        );
    }
}
