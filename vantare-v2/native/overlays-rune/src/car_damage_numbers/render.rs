//! Eficiencia paints the shared Car damage numbers scene: one independent panel per
//! row, no outer background, no animation.
use super::scene::{Scene, WIDTH};
use crate::vantare::paint::{Face, WHITE, font};
use crate::vantare::{Style, alpha};
use rune::{Align, Color, El, el, text};
use std::sync::Arc;

const PANEL: Color = Color {
    r: 0x10 as f32 / 255.0,
    g: 0x11 as f32 / 255.0,
    b: 0x13 as f32 / 255.0,
    a: 1.0,
};
const MUTED: Color = Color {
    r: 0xb9 as f32 / 255.0,
    g: 0xb9 as f32 / 255.0,
    b: 0xbd as f32 / 255.0,
    a: 1.0,
};
const GREEN: Color = Color {
    r: 0x7f as f32 / 255.0,
    g: 0xb6 as f32 / 255.0,
    b: 0x86 as f32 / 255.0,
    a: 1.0,
};
const NOTICE: Color = Color {
    r: 0xe2 as f32 / 255.0,
    g: 0xc5 as f32 / 255.0,
    b: 0x68 as f32 / 255.0,
    a: 1.0,
};
const RADIUS: f32 = 6.0;
const ROW_H: f32 = 29.0;
const PANEL_H: f32 = 28.0;

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
        let mut root = el()
            .key("car-damage-numbers-view")
            .size(WIDTH, self.scene.height)
            .motion(rune::Spring::NONE);
        for (index, line) in self.scene.notice.iter().enumerate() {
            root = root.child(
                text(*line)
                    .key(format!("car-damage-numbers-notice-{index}"))
                    .font(font(s, Face::Body, 14.0, 24.0, 0.0, 700.0))
                    .color(NOTICE)
                    .size(WIDTH - 20.0, 24.0)
                    .pin(Some(20.0), Some(18.0 + index as f32 * 24.0), None, None),
            );
        }
        let top = 8.0
            + if self.scene.notice.is_empty() {
                0.0
            } else {
                20.0 + 24.0 * self.scene.notice.len() as f32
            };
        for (index, row) in self.scene.rows.iter().enumerate() {
            let y = top + index as f32 * ROW_H;
            root = root
                .child(
                    el().key(format!("car-damage-numbers-row-{index}"))
                        .size(148.0, PANEL_H)
                        .radius(RADIUS)
                        .fill(alpha(PANEL, 0.87))
                        .border(1.0, alpha(WHITE, 0.12))
                        .pin(Some(8.0), Some(y), None, None),
                )
                .child(
                    text(row.label)
                        .key(format!("car-damage-numbers-label-{index}"))
                        .font(font(s, Face::Body, 14.0, PANEL_H, 0.0, 750.0))
                        .color(MUTED)
                        .size(70.0, PANEL_H)
                        .pin(Some(14.0), Some(y), None, None),
                )
                .child(
                    text(row.value.clone())
                        .key(format!("car-damage-numbers-value-{index}"))
                        .font(font(s, Face::Body, 14.0, PANEL_H, 0.0, 750.0))
                        .color(GREEN)
                        .size(60.0, PANEL_H)
                        .align(Align::End)
                        .pin(Some(WIDTH - 14.0 - 60.0), Some(y), None, None),
                );
        }
        root
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::car_damage_numbers::scene;
    use rune::{Cx, ElementInfo, Env, Runtime, text::TextSystem};
    use vantare_domain::car_damage_numbers::ViewModel;

    struct Stub(Painter);

    fn stub_view(stub: &Stub, _: &mut Cx<Stub>) -> El {
        stub.0.view()
    }

    fn vm(show_tyres: bool, status: Option<&'static str>, spanish: bool) -> ViewModel {
        ViewModel {
            labels: if spanish {
                ["AERO", "CARROC.", "SUSP", "NEUM."]
            } else {
                ["AERO", "BODY", "SUSP", "TYRE"]
            },
            values: ["0%".into(), "13%".into(), "50%".into(), "100%".into()],
            status_text: status,
            show_tyres,
        }
    }

    fn runtime(scene: &Scene) -> Runtime<Stub> {
        let mut runtime = Runtime::with_text(
            Stub(Painter::new(scene)),
            stub_view,
            (WIDTH, scene.height),
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
    fn the_ready_card_paints_four_independent_panels_in_order() {
        let scene = scene::sample(&vm(true, None, true));
        assert_eq!(scene.height, 132.0);
        let elements = elements(&scene);
        assert_eq!(by_key(&elements, "car-damage-numbers-view").rect[3], 132.0);
        assert!(absent(&elements, "car-damage-numbers-notice-0"));
        for index in 0..4 {
            let y = 8.0 + index as f32 * ROW_H;
            let panel = by_key(&elements, &format!("car-damage-numbers-row-{index}"));
            near_rect(panel, [8.0, y, 148.0, 28.0]);
            assert_eq!(panel.fill, alpha(PANEL, 0.87));
            assert_eq!(panel.radius, RADIUS);
            let label = by_key(&elements, &format!("car-damage-numbers-label-{index}"));
            near_rect(label, [14.0, y, 70.0, 28.0]);
            assert_eq!(label.text_color, Some(MUTED));
            let value = by_key(&elements, &format!("car-damage-numbers-value-{index}"));
            near_rect(value, [90.0, y, 60.0, 28.0]);
            assert_eq!(value.text_color, Some(GREEN));
        }
        assert_eq!(
            by_key(&elements, "car-damage-numbers-label-1")
                .text
                .as_deref(),
            Some("CARROC.")
        );
        assert_eq!(
            by_key(&elements, "car-damage-numbers-value-1")
                .text
                .as_deref(),
            Some("13%")
        );
    }

    #[test]
    fn the_notice_lines_push_the_rows_down() {
        let scene = scene::sample(&vm(true, Some("DATOS ANTIGUOS"), true));
        assert_eq!(scene.height, 200.0);
        let elements = elements(&scene);
        for (index, text) in ["DATOS", "ANTIGUOS"].iter().enumerate() {
            let line = by_key(&elements, &format!("car-damage-numbers-notice-{index}"));
            near_rect(line, [20.0, 18.0 + index as f32 * 24.0, 144.0, 24.0]);
            assert_eq!(line.text.as_deref(), Some(*text));
            assert_eq!(line.text_color, Some(NOTICE));
        }
        near_rect(
            by_key(&elements, "car-damage-numbers-row-0"),
            [8.0, 76.0, 148.0, 28.0],
        );
        near_rect(
            by_key(&elements, "car-damage-numbers-row-3"),
            [8.0, 163.0, 148.0, 28.0],
        );
    }

    #[test]
    fn english_labels_and_the_two_line_english_notice() {
        let scene = scene::sample(&vm(true, Some("DATA OUT OF DATE"), false));
        let elements = elements(&scene);
        assert_eq!(
            by_key(&elements, "car-damage-numbers-label-1")
                .text
                .as_deref(),
            Some("BODY")
        );
        assert_eq!(
            by_key(&elements, "car-damage-numbers-notice-0")
                .text
                .as_deref(),
            Some("DATA OUT OF")
        );
        assert_eq!(
            by_key(&elements, "car-damage-numbers-notice-1")
                .text
                .as_deref(),
            Some("DATE")
        );
    }

    #[test]
    fn hidden_tyres_remove_the_fourth_row_and_shrink_the_box() {
        let scene = scene::sample(&vm(false, None, true));
        assert_eq!(scene.height, 103.0);
        let elements = elements(&scene);
        assert!(absent(&elements, "car-damage-numbers-row-3"));
        assert!(absent(&elements, "car-damage-numbers-label-3"));
        near_rect(
            by_key(&elements, "car-damage-numbers-row-2"),
            [8.0, 66.0, 148.0, 28.0],
        );
    }

    #[test]
    fn every_height_keeps_its_elements_inside_the_window() {
        for (tyres, status, height) in [
            (true, None, 132.0),
            (false, None, 103.0),
            (true, Some("SIN DATOS"), 176.0),
            (true, Some("DATOS ANTIGUOS"), 200.0),
            (false, Some("SIN DATOS"), 147.0),
            (false, Some("DATOS ANTIGUOS"), 171.0),
        ] {
            let scene = scene::sample(&vm(tyres, status, true));
            assert_eq!(scene.height, height);
            let mut runtime = runtime(&scene);
            crate::testdata::assert_inside_window(&mut runtime, (WIDTH, height));
        }
    }

    #[test]
    fn the_painted_texts_fit_their_boxes_with_margin() {
        // GPUI does not truncate, so every box must be wide enough for its text.
        let style = Style::compiled();
        let mut text = TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter"));
        let mut measured = |value: &str, size: f32, weight: f32| {
            text.measure(
                value,
                font(&style, Face::Body, size, 28.0, 0.0, weight),
                1.0,
            )
            .0
        };
        for (tyres, status) in [
            (true, None),
            (false, None),
            (true, Some("DATOS ANTIGUOS")),
            (true, Some("DATA OUT OF DATE")),
            (true, Some("DESCONECTADO")),
        ] {
            let spanish = !matches!(status, Some("DATA OUT OF DATE"));
            let scene = scene::sample(&vm(tyres, status, spanish));
            let elements = elements(&scene);
            for index in 0..scene.rows.len() {
                let label = by_key(&elements, &format!("car-damage-numbers-label-{index}"));
                let value = by_key(&elements, &format!("car-damage-numbers-value-{index}"));
                assert!(
                    measured(&label.text.clone().unwrap(), 14.0, 750.0) + 2.0 <= label.rect[2],
                    "rótulo {} no cabe",
                    label.text.as_deref().unwrap_or("?")
                );
                assert!(
                    measured(&value.text.clone().unwrap(), 14.0, 750.0) + 2.0 <= value.rect[2],
                    "valor {} no cabe",
                    value.text.as_deref().unwrap_or("?")
                );
            }
            for index in 0..scene.notice.len() {
                let line = by_key(&elements, &format!("car-damage-numbers-notice-{index}"));
                assert!(
                    measured(&line.text.clone().unwrap(), 14.0, 700.0) + 2.0 <= line.rect[2],
                    "aviso {} no cabe",
                    line.text.as_deref().unwrap_or("?")
                );
            }
        }
    }
}
