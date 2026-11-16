//! The current GPUI Radar coordinates, colours and layer order. No motion or history.
use crate::{
    vantare::{
        Style, alpha,
        paint::{Face, WHITE, font},
    },
    widget::Update,
};
use rune::{Align, Color, El, Live, el, text};
use vantare_domain::{
    CarId,
    format::{Language, Preferences},
    radar::{Car, ViewModel},
};

struct CarLive {
    position: Live<[f32; 2]>,
    fill: Live<Color>,
}

#[derive(PartialEq)]
struct Structure {
    available: bool,
    cars: Vec<CarId>,
    // Rune ellipsis needs plain text, as in Relative; its intrinsic width may change.
    phrase: Option<String>,
}

pub(super) struct Painter {
    style: std::sync::Arc<Style>,
    show_phrases: bool,
    es: bool,
    cars: Vec<CarLive>,
    glow: [Live<f32>; 2],
    phrase_ink: Live<Color>,
    structure: Option<Structure>,
}

fn position(car: &Car) -> Option<[f32; 2]> {
    let x = 110.0 + car.right_m as f32 * 8.0;
    let y = 110.0 - car.ahead_m as f32 * 8.0;
    ((8.0..=212.0).contains(&x) && (20.0..=200.0).contains(&y)).then_some([x - 8.0, y - 19.2])
}

impl Painter {
    pub fn new(show_phrases: bool, prefs: Preferences, scene: &ViewModel) -> Self {
        let mut painter = Self {
            style: Style::compiled(),
            show_phrases,
            es: prefs.language == Language::Es,
            cars: Vec::new(),
            glow: std::array::from_fn(|_| Live::new(0.0)),
            phrase_ink: Live::new(WHITE),
            structure: None,
        };
        painter.sync(scene, &[]);
        painter
    }

    pub fn sync(&mut self, scene: &ViewModel, classes: &[(CarId, String)]) -> Update {
        let visible: Vec<_> = scene
            .cars
            .iter()
            .filter(|_| scene.available)
            .filter_map(|car| {
                let position = position(car)?;
                let class = classes
                    .iter()
                    .find(|(id, _)| *id == car.id)
                    .map_or("", |(_, c)| c.as_str());
                let fill = Color {
                    a: if car.near { 0.92 } else { 0.35 },
                    ..self.style.class(class).dot
                };
                Some((car.id, position, fill))
            })
            .collect();
        let next = Structure {
            available: scene.available,
            cars: visible.iter().map(|(id, _, _)| *id).collect(),
            phrase: (self.show_phrases || !scene.available)
                .then(|| phrase(scene, self.es).to_uppercase()),
        };
        let mut pixels = false;
        if self
            .structure
            .as_ref()
            .is_none_or(|old| old.cars != next.cars)
        {
            self.cars = visible
                .iter()
                .map(|(_, position, fill)| CarLive {
                    position: Live::new(*position),
                    fill: Live::new(*fill),
                })
                .collect();
        } else {
            for (live, (_, position, fill)) in self.cars.iter().zip(&visible) {
                pixels |= live.position.set(*position);
                pixels |= live.fill.set(*fill);
            }
        }
        for (live, active) in self
            .glow
            .iter()
            .zip([scene.overlap_left, scene.overlap_right])
        {
            pixels |= live.set(if active { 1.0 } else { 0.0 });
        }
        pixels |= self
            .phrase_ink
            .set(if scene.overlap_left || scene.overlap_right {
                ink("#ff8a8a")
            } else {
                self.style.colors.muted
            });
        // One build decision. Position, near colour and glow changes stay in Live values.
        let build = self.structure.as_ref() != Some(&next);
        self.structure = Some(next);
        Update {
            build,
            pixels: pixels || build,
        }
    }

    pub fn view(&self) -> El {
        let s = &self.style;
        let v = &s.styles.neo;
        let structure = self.structure.as_ref().expect("initial scene");
        let border = if v.border_accent > 0.0 {
            alpha(s.accents.red, v.border_accent)
        } else {
            v.border
        };
        let mut root = el()
            .key("radar")
            .size(220.0, 220.0)
            .motion(rune::Spring::NONE)
            .child(
                el().size(220.0, 220.0)
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
        // Same ellipse and rounded clip as GPUI's cached SVG; deliberately no pulse.
        for (index, center) in [[0.0, 0.5], [1.0, 0.5]].into_iter().enumerate() {
            root = root.child(
                el().key(format!("radar-glow-{index}"))
                    .size(220.0, 220.0)
                    .radius(8.0)
                    .radial_gradient(
                        center,
                        [54.0, 121.0],
                        [
                            (0.0, alpha(ink("#f25a5a"), 0.55)),
                            (1.0, alpha(ink("#f25a5a"), 0.0)),
                        ],
                    )
                    .live_opacity(&self.glow[index])
                    .pin(Some(0.0), Some(0.0), None, None),
            );
        }
        for radius in [40.0, 80.0] {
            root = root.child(
                rect(
                    110.0 - radius,
                    110.0 - radius,
                    radius * 2.0,
                    radius * 2.0,
                    radius,
                    alpha(WHITE, 0.0),
                )
                .border(1.0, alpha(WHITE, 0.07)),
            );
        }
        root = root
            .child(rect(109.5, 8.0, 1.0, 204.0, 0.0, alpha(WHITE, 0.05)))
            .child(rect(8.0, 109.5, 204.0, 1.0, 0.0, alpha(WHITE, 0.05)));
        for (value, x) in [("5", 153.0), ("10 m", 193.0)] {
            root = root.child(
                text(value)
                    .font(font(s, Face::Mono, 9.0, 13.0, 0.0, 400.0))
                    .color(s.colors.column)
                    .h(13.0)
                    .pin(Some(x), Some(94.0 + s.fonts.mono_baseline), None, None),
            );
        }
        if structure.available {
            for (id, live) in structure.cars.iter().zip(&self.cars) {
                root = root.child(
                    el().key(format!("radar-car-{}", id.0))
                        .size(16.0, 38.4)
                        .pin(Some(0.0), Some(0.0), None, None)
                        .live_offset(&live.position)
                        .child(
                            rect(0.0, 0.0, 16.0, 38.4, 4.0, live.fill.get()).live_fill(&live.fill),
                        )
                        .child(rect(3.0, 5.0, 10.0, 6.0, 2.0, alpha(ink("#000000"), 0.35))),
                );
            }
            root = root
                .child(
                    rect(102.0, 90.8, 16.0, 38.4, 4.0, ink("#f2eeee"))
                        .key("radar-player")
                        .border(2.5, ink("#e14a54")),
                )
                .child(rect(
                    105.0,
                    95.8,
                    10.0,
                    6.0,
                    2.0,
                    alpha(ink("#000000"), 0.35),
                ));
        } else {
            root = root.child(
                rect(102.0, 90.8, 16.0, 38.4, 4.0, alpha(WHITE, 0.0))
                    .key("radar-placeholder")
                    .border(1.0, s.colors.pulse),
            );
        }
        if let Some(phrase) = &structure.phrase {
            root = root
                .child(
                    rect(1.0, 190.0, 218.0, 29.0, 0.0, alpha(ink("#110f10"), 0.92))
                        .key("radar-phrase-bar"),
                )
                .child(
                    text(phrase)
                        .key("radar-phrase")
                        .font(font(s, Face::Display, 11.0, 16.0, 1.4, 600.0))
                        .live_text_color(&self.phrase_ink)
                        .size(202.0, 16.0)
                        .align(Align::Center)
                        .truncate()
                        .pin(
                            Some(9.0),
                            Some(197.0 + s.fonts.display_baseline),
                            None,
                            None,
                        ),
                );
        }
        root
    }
}

fn rect(x: f32, y: f32, w: f32, h: f32, radius: f32, fill: Color) -> El {
    el().size(w, h)
        .radius(radius)
        .fill(fill)
        .pin(Some(x), Some(y), None, None)
}

fn ink(hex: &str) -> Color {
    rune::color::hex(hex).expect("canonical GPUI colour")
}

fn phrase(vm: &ViewModel, es: bool) -> String {
    if !vm.available {
        use vantare_domain::Capability;
        return match (vm.capability, es) {
            (Capability::Unsupported, true) => "Sin posición espacial",
            (Capability::Unsupported, false) => "Spatial position unavailable",
            (Capability::Supported, true) => "Esperando posición espacial",
            (Capability::Supported, false) => "Waiting for spatial position",
            (Capability::WithData, true) => "Datos espaciales antiguos",
            (Capability::WithData, false) => "Spatial data out of date",
            (Capability::Fresh, true) => "Esperando posición propia",
            (Capability::Fresh, false) => "Waiting for player position",
        }
        .into();
    }
    if !vm.overlap_left && !vm.overlap_right {
        let closing = vm
            .cars
            .iter()
            .filter(|c| c.ahead_m < 0.0)
            .filter_map(|c| c.closing_mps)
            .filter(|v| (v * 3.6).round() >= 1.0)
            .max_by(f64::total_cmp);
        if let Some(speed) = closing {
            return format!(
                "{} · +{:.0} km/h",
                if es {
                    "Se acerca detrás"
                } else {
                    "Closing behind"
                },
                (speed * 3.6).round()
            );
        }
    }
    match (vm.overlap_left, vm.overlap_right, es) {
        (true, true, true) => "Tres en paralelo",
        (true, false, true) => "Coche a la izquierda",
        (false, true, true) => "Coche a la derecha",
        (true, true, false) => "Three wide",
        (true, false, false) => "Car left",
        (false, true, false) => "Car right",
        (_, _, true) => "Pista libre",
        (_, _, false) => "Clear track",
    }
    .into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};
    use vantare_domain::{Capability, Snapshot};

    fn scene() -> ViewModel {
        ViewModel {
            capability: Capability::Fresh,
            available: true,
            cars: vec![Car {
                id: CarId(2),
                ahead_m: 0.0,
                right_m: -4.0,
                overlap: true,
                near: true,
                lapped: false,
                closing_mps: None,
            }],
            overlap_left: true,
            overlap_right: false,
        }
    }

    #[test]
    fn painter_keeps_its_center_cull_inclusive_and_separate_from_domain_range() {
        let mut car = scene().cars[0];
        for (ahead, right, visible) in [
            (0.0, -12.75, true),
            (0.0, 12.75, true),
            (11.25, 0.0, true),
            (-11.25, 0.0, true),
            (0.0, -12.751, false),
            (0.0, 12.751, false),
            (11.251, 0.0, false),
            (-11.251, 0.0, false),
            (36.0, 0.0, false),
            (0.0, 36.0, false),
        ] {
            car.ahead_m = ahead;
            car.right_m = right;
            assert_eq!(
                position(&car).is_some(),
                visible,
                "ahead={ahead} right={right}"
            );
        }
        let photo = vantare_ipc::snapshot_from_json(include_str!(
            "../../../ui/fixtures/radar.snapshot.json"
        ))
        .unwrap();
        let vm = vantare_domain::radar::project(&photo);
        assert_eq!(vm.cars.len(), 3);
        assert_eq!(vm.cars.iter().filter_map(position).count(), 1);
    }

    #[test]
    fn only_visible_structure_rebuilds_and_colour_and_overlap_stay_live() {
        let mut vm = scene();
        let mut painter = Painter::new(false, Preferences::default(), &vm);
        let near = painter.cars[0].fill.get();
        assert_eq!(near.a, 0.92);
        vm.cars[0].near = false;
        vm.cars[0].lapped = true;
        let update = painter.sync(&vm, &[]);
        assert!(!update.build && update.pixels);
        assert_eq!(painter.cars[0].fill.get(), Color { a: 0.35, ..near });
        let update = painter.sync(&vm, &[(CarId(2), "LMGT3".into())]);
        assert!(!update.build && update.pixels);
        assert_eq!(
            painter.cars[0].fill.get(),
            Color {
                a: 0.35,
                ..painter.style.class("LMGT3").dot
            }
        );
        vm.overlap_left = false;
        vm.overlap_right = true;
        let update = painter.sync(&vm, &[(CarId(2), "LMGT3".into())]);
        assert!(!update.build && update.pixels);
        assert_eq!(painter.glow.each_ref().map(|l| l.get()), [0.0, 1.0]);
        // Culling tests the centre only: a marker may extend beyond the inner area.
        vm.cars[0].right_m = 12.75;
        assert!(!painter.sync(&vm, &[]).build);
        assert_eq!(painter.cars[0].position.get()[0], 204.0);
        vm.cars[0].right_m = 12.76;
        assert!(painter.sync(&vm, &[]).build);
        assert!(painter.cars.is_empty());
    }

    #[test]
    fn capability_phrases_match_gpui_even_when_the_bar_is_disabled() {
        for (capability, es, en) in [
            (
                Capability::Unsupported,
                "Sin posición espacial",
                "Spatial position unavailable",
            ),
            (
                Capability::Supported,
                "Esperando posición espacial",
                "Waiting for spatial position",
            ),
            (
                Capability::WithData,
                "Datos espaciales antiguos",
                "Spatial data out of date",
            ),
            (
                Capability::Fresh,
                "Esperando posición propia",
                "Waiting for player position",
            ),
        ] {
            for (language, expected) in [(Language::Es, es), (Language::En, en)] {
                let mut vm = vantare_domain::radar::project(&Snapshot::default());
                vm.capability = capability;
                assert_eq!(phrase(&vm, language == Language::Es), expected);
                let painter = Painter::new(
                    false,
                    Preferences {
                        language,
                        ..Default::default()
                    },
                    &vm,
                );
                assert_eq!(
                    painter.structure.as_ref().unwrap().phrase.as_deref(),
                    Some(expected.to_uppercase().as_str())
                );
            }
        }
    }

    #[test]
    fn phrases_keep_overlap_priority_and_use_radial_current_speed_even_offscreen() {
        let mut vm = scene();
        vm.cars[0].ahead_m = -20.0;
        vm.cars[0].closing_mps = Some(10.0);
        for (left, right, es, en) in [
            (true, false, "Coche a la izquierda", "Car left"),
            (false, true, "Coche a la derecha", "Car right"),
            (true, true, "Tres en paralelo", "Three wide"),
            (
                false,
                false,
                "Se acerca detrás · +36 km/h",
                "Closing behind · +36 km/h",
            ),
        ] {
            vm.overlap_left = left;
            vm.overlap_right = right;
            assert_eq!(phrase(&vm, true), es);
            assert_eq!(phrase(&vm, false), en);
        }
        assert!(position(&vm.cars[0]).is_none());
        for speed in [None, Some(-10.0), Some(0.13)] {
            vm.cars[0].closing_mps = speed;
            assert_eq!(phrase(&vm, true), "Pista libre");
        }
        vm.cars[0].closing_mps = Some(0.14);
        assert_eq!(phrase(&vm, true), "Se acerca detrás · +1 km/h");
        vm.cars[0].ahead_m = 1.0;
        assert_eq!(phrase(&vm, false), "Clear track");
    }

    #[test]
    fn layers_geometry_and_fixed_box_match_the_current_gpui() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let painter = Painter::new(true, Preferences::default(), &scene());
        let mut rt = Runtime::with_text(
            painter,
            |p, _| p.view(),
            (220.0, 220.0),
            Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        rt.frame(0.0);
        let elements = rt.elements();
        let find = |key: &str| {
            elements
                .iter()
                .find(|e| e.key.as_deref() == Some(key))
                .unwrap()
        };
        assert_eq!(find("radar").rect, [0.0, 0.0, 220.0, 220.0]);
        assert_eq!(find("radar-player").rect, [102.0, 90.8, 16.0, 38.4]);
        assert_eq!(find("radar-phrase-bar").rect, [1.0, 190.0, 218.0, 29.0]);
        assert_eq!(
            find("radar-phrase").text.as_deref(),
            Some("COCHE A LA IZQUIERDA")
        );
        assert_eq!(find("radar-phrase").text_color, Some(ink("#ff8a8a")));
        assert_eq!(find("radar-glow-0").opacity, 1.0);
        assert_eq!(find("radar-glow-1").opacity, 0.0);
        assert_eq!(find("radar-glow-0").radius, 8.0);
        let index = |key: &str| {
            elements
                .iter()
                .position(|e| e.key.as_deref() == Some(key))
                .unwrap()
        };
        assert!(index("radar-glow-0") < index("radar-car-2"));
        assert!(index("radar-car-2") < index("radar-player"));
        assert!(index("radar-player") < index("radar-phrase-bar"));
        assert!(rt.wake_deadline().is_none());
    }
}
