//! Current GPUI map geometry and layers, retained in Rune without a clock.
use crate::{
    vantare::{
        Style, alpha,
        paint::{Face, font},
    },
    widget::Update,
};
use rune::{Align, Color, El, LineCap, Live, LiveText, Path, Shape, canvas, el, row, text};
use vantare_domain::{
    CarId,
    format::{Language, Preferences},
    track_map::{Point, ViewModel},
};

const SCALE: f32 = 188.0 / 220.0;
// Canonical GPUI sRGB colours expressed in Rune's linear sRGB.
const RED: Color = Color {
    r: 0.7529422,
    g: 0.06847817,
    b: 0.08865559,
    a: 1.0,
}; // #e14a54
const BLUE: Color = Color {
    r: 0.07818742,
    g: 0.2704978,
    b: 0.9301109,
    a: 1.0,
}; // #4f8ef7
const AMBER: Color = Color {
    r: 0.91309863,
    g: 0.34191442,
    b: 0.0033465358,
    a: 1.0,
}; // #f59e0b
const GREEN: Color = Color {
    r: 0.015996294,
    g: 0.5583404,
    b: 0.11193243,
    a: 1.0,
}; // #22c55e
const UNKNOWN: Color = Color {
    r: 0.14702727,
    g: 0.1682694,
    b: 0.2158605,
    a: 1.0,
}; // #6b7280
const ROAD: Color = Color {
    r: 0.3662526,
    g: 0.3231432,
    b: 0.33245152,
    a: 1.0,
}; // #a39a9c
const DARK: Color = Color {
    r: 0.0056053917,
    g: 0.0047769533,
    b: 0.0051815165,
    a: 1.0,
}; // #110f10

fn point(p: Point) -> [f32; 2] {
    [
        (320.0 - 320.0 * SCALE) / 2.0 + p.x as f32 * SCALE,
        32.0 + p.y as f32 * SCALE,
    ]
}

fn class_color(class: Option<&str>) -> Color {
    match class.unwrap_or_default().to_ascii_uppercase().as_str() {
        "HYPERCAR" => RED,
        "LMP2" => BLUE,
        "LMP3" => AMBER,
        "GT3" | "LMGT3" => GREEN,
        _ => UNKNOWN,
    }
}

fn circle(radius: f32) -> Path {
    let k = radius * 0.552_284_8;
    let p = |x, y| [10.0 + x, 10.0 + y];
    Path::new()
        .move_to(p(radius, 0.0))
        .cubic_to(p(radius, k), p(k, radius), p(0.0, radius))
        .cubic_to(p(-k, radius), p(-radius, k), p(-radius, 0.0))
        .cubic_to(p(-radius, -k), p(-k, -radius), p(0.0, -radius))
        .cubic_to(p(k, -radius), p(radius, -k), p(radius, 0.0))
        .close()
}

struct MarkerLive {
    position: Live<[f32; 2]>,
    shape: Shape,
}

#[derive(PartialEq)]
struct Structure {
    outline: Vec<Point>,
    markers: Vec<(CarId, bool, Option<String>)>,
    header: [String; 2],
}

pub(super) struct Painter {
    style: std::sync::Arc<Style>,
    transparent: bool,
    es: bool,
    structure: Option<Structure>,
    road: [Shape; 2],
    markers: Vec<MarkerLive>,
    empty: LiveText,
    footer: LiveText,
}

impl Painter {
    pub fn new(
        transparent: bool,
        scene: &ViewModel,
        labels: &[String; 3],
        prefs: Preferences,
    ) -> Self {
        let mut p = Self {
            style: Style::compiled(),
            transparent,
            es: prefs.language == Language::Es,
            structure: None,
            road: [Shape::new(), Shape::new()],
            markers: Vec::new(),
            empty: LiveText::new(""),
            footer: LiveText::new(""),
        };
        p.sync(scene, labels);
        p
    }

    pub fn sync(&mut self, scene: &ViewModel, labels: &[String; 3]) -> Update {
        let next = Structure {
            outline: scene.outline.clone(),
            markers: scene
                .markers
                .iter()
                .map(|m| (m.id, m.is_player, m.class_name.clone()))
                .collect(),
            header: [labels[0].clone(), labels[1].clone()],
        };
        let mut pixels = self.empty.set(scene.empty_text.clone());
        pixels |= self
            .footer
            .set(if scene.markers.iter().any(|m| m.is_player) {
                labels[2].clone()
            } else if scene.outline.is_empty() {
                if self.es {
                    "Esperando trazado de la pista"
                } else {
                    "Waiting for track layout"
                }
                .into()
            } else {
                if self.es {
                    "Coches por clase"
                } else {
                    "Cars by class"
                }
                .into()
            });
        if self
            .structure
            .as_ref()
            .is_none_or(|old| old.outline != next.outline)
        {
            let mut path = Path::new();
            if let Some(first) = scene.outline.first() {
                path = path.move_to(point(*first));
                for &p in &scene.outline[1..] {
                    path = path.line_to(point(p));
                }
                path = path.close();
            }
            // Opaque stroke + element opacity avoids double alpha at Rune's segment joints.
            self.road = [
                Shape::new().stroke_path(
                    &path,
                    13.0,
                    LineCap::Round,
                    if self.transparent {
                        Color::BLACK
                    } else {
                        Color::WHITE
                    },
                ),
                Shape::new().stroke_path(&path, 5.0, LineCap::Round, ROAD),
            ];
        }
        if self
            .structure
            .as_ref()
            .is_none_or(|old| old.markers != next.markers)
        {
            self.markers = scene
                .markers
                .iter()
                .map(|m| {
                    let color = if m.is_player {
                        RED
                    } else {
                        class_color(m.class_name.as_deref())
                    };
                    let ring = circle(if m.is_player { 5.5 } else { 4.5 });
                    let mut shape = Shape::new();
                    if m.is_player {
                        shape = shape.fill_path(&circle(9.0), alpha(color, 0.25));
                    }
                    shape = shape.fill_path(&ring, color).stroke_path(
                        &ring,
                        if m.is_player { 2.0 } else { 1.5 },
                        LineCap::Round,
                        if m.is_player { Color::WHITE } else { DARK },
                    );
                    let [x, y] = point(m.point);
                    MarkerLive {
                        position: Live::new([x - 10.0, y - 10.0]),
                        shape,
                    }
                })
                .collect();
        } else {
            for (live, m) in self.markers.iter().zip(&scene.markers) {
                let [x, y] = point(m.point);
                pixels |= live.position.set([x - 10.0, y - 10.0]);
            }
        }
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
        // `new` fija la escena; sin ella no hay nada que pintar y no se abre un pánico.
        let Some(structure) = self.structure.as_ref() else {
            return el()
                .key("track-map")
                .size(320.0, 248.0)
                .motion(rune::Spring::NONE);
        };
        let mut root = el()
            .key("track-map")
            .size(320.0, 248.0)
            .motion(rune::Spring::NONE);
        if !self.transparent {
            let border = if v.border_accent > 0.0 {
                alpha(s.accents.red, v.border_accent)
            } else {
                v.border
            };
            root = root.child(
                el().key("map-panel")
                    .size(320.0, 248.0)
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
        }
        // GPUI paints five displaced shadows, then the text, including when transparent.
        for (index, dx, dy, color) in self.shadow_layers() {
            let key = if index == 5 {
                "map-header".into()
            } else {
                format!("map-header-shadow-{index}")
            };
            root = root.child(
                row()
                    .key(key)
                    .size(296.0, 18.0)
                    .gap(8.0)
                    .pin(Some(12.0 + dx), Some(10.0 + dy), None, None)
                    .child(
                        text(&structure.header[0])
                            .font(font(s, Face::Body, 10.0, 18.0, 0.3, s.fonts.regular_weight))
                            .color(color)
                            .key(format!("map-track-name-{index}"))
                            .h(18.0)
                            .grow(1.0)
                            .min_w(0.0)
                            .truncate(),
                    )
                    .child(
                        text(&structure.header[1])
                            .font(font(s, Face::Body, 10.0, 18.0, 0.3, s.fonts.regular_weight))
                            .key(format!("map-session-{index}"))
                            .color(color)
                            .h(18.0),
                    ),
            );
        }
        if structure.outline.is_empty() {
            root = root.child(self.shadowed(
                &self.empty,
                "map-empty",
                Face::Display,
                [22.0, 115.0, 276.0, 20.0],
                13.0,
                1.0,
            ));
        } else {
            root = root
                .child(
                    canvas(self.road[0].clone())
                        .key("map-road-outer")
                        .size(320.0, 248.0)
                        .opacity(if self.transparent { 0.55 } else { 0.07 })
                        .pin(Some(0.0), Some(0.0), None, None),
                )
                .child(
                    canvas(self.road[1].clone())
                        .key("map-road-inner")
                        .size(320.0, 248.0)
                        .pin(Some(0.0), Some(0.0), None, None),
                );
            for ((id, _, _), live) in structure.markers.iter().zip(&self.markers) {
                root = root.child(
                    canvas(live.shape.clone())
                        .key(format!("map-car-{}", id.0))
                        .size(20.0, 20.0)
                        .pin(Some(0.0), Some(0.0), None, None)
                        .live_offset(&live.position),
                );
            }
        }
        root.child(self.shadowed(
            &self.footer,
            "map-footer",
            Face::Body,
            [12.0, 222.0, 296.0, 18.0],
            11.0,
            0.0,
        ))
    }

    fn shadow_layers(&self) -> [(usize, f32, f32, Color); 6] {
        [
            (0, -1.0, 0.0, alpha(Color::BLACK, 0.35)),
            (1, 1.0, 0.0, alpha(Color::BLACK, 0.35)),
            (2, 0.0, -1.0, alpha(Color::BLACK, 0.35)),
            (3, 0.0, 2.0, alpha(Color::BLACK, 0.35)),
            (4, 0.0, 1.0, alpha(Color::BLACK, 0.9)),
            (5, 0.0, 0.0, self.style.colors.muted),
        ]
    }

    fn shadowed(
        &self,
        value: &LiveText,
        key: &str,
        face: Face,
        bounds: [f32; 4],
        size: f32,
        tracking: f32,
    ) -> El {
        let s = &self.style;
        let [x, y, w, h] = bounds;
        let baseline = if matches!(face, Face::Display) {
            s.fonts.display_baseline
        } else {
            0.0
        };
        let weight = if matches!(face, Face::Display) {
            600.0
        } else {
            s.fonts.regular_weight
        };
        let mut group = el().size(w, h).pin(Some(x), Some(y), None, None);
        for (index, dx, dy, color) in self.shadow_layers() {
            group = group.child(
                text(value.get().to_string())
                    .live_text(value)
                    .key(if index == 5 {
                        key.to_owned()
                    } else {
                        format!("{key}-shadow-{index}")
                    })
                    .font(font(s, face, size, h, tracking, weight))
                    .color(color)
                    .size(w, h)
                    .align(Align::Start)
                    .pin(Some(dx), Some(dy + baseline), None, None),
            );
        }
        group
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};
    use vantare_domain::{
        Car, Player, Pose, Quality, Snapshot, SourceState,
        track_map::{self, Geometry},
    };

    /// Cuantización del layout CPU de Rune (1/64 px).
    const QUANT: f32 = 1.0 / 64.0;

    fn scene() -> ViewModel {
        let mut photo = Snapshot::default();
        photo.state.source_state = SourceState::Live;
        photo.state.session.track_name = Quality::Reliable("test".into());
        photo.state.player = Some(Player {
            car: CarId(1),
            ..Default::default()
        });
        photo.state.cars = vec![
            Car {
                id: CarId(1),
                pose: Quality::Reliable(Pose::default()),
                ..Default::default()
            },
            Car {
                id: CarId(2),
                pose: Quality::Stale(Pose {
                    x_m: 100.0,
                    y_m: 50.0,
                    yaw_rad: 2.0,
                }),
                ..Default::default()
            },
            Car {
                id: CarId(3),
                pose: Quality::Estimated(Pose::default()),
                ..Default::default()
            },
        ];
        track_map::project_with_geometry(
            &photo,
            Preferences::default(),
            Some(&Geometry {
                track_name: "test",
                label: "test",
                points_m: &[(0.0, 0.0), (100.0, 0.0), (100.0, 100.0)],
                synthetic: true,
            }),
        )
    }

    fn runtime(p: Painter) -> Runtime<Painter> {
        Runtime::with_text(
            p,
            |p, _| p.view(),
            (320.0, 248.0),
            Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        )
    }

    #[test]
    fn class_palette_uses_exact_names_and_keeps_gte_unknown() {
        for (name, hex) in [
            (None, "#6b7280ff"),
            (Some("gte"), "#6b7280ff"),
            (Some(" GT3 "), "#6b7280ff"),
            (Some("hypercar"), "#e14a54ff"),
            (Some("LMP2"), "#4f8ef7ff"),
            (Some("lmp3"), "#f59e0bff"),
            (Some("GT3"), "#22c55eff"),
            (Some("LMGT3"), "#22c55eff"),
        ] {
            assert_eq!(class_color(name).hex(), hex);
        }
        assert_eq!(ROAD.hex(), "#a39a9cff");
        assert_eq!(DARK.hex(), "#110f10ff");
    }

    #[test]
    fn map_and_markers_share_uniform_coordinates_without_scaling_stroke_widths() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let vm = scene();
        assert_eq!(
            vm.markers.iter().map(|m| m.id).collect::<Vec<_>>(),
            [CarId(1), CarId(2)]
        );
        let origin = point(Point { x: 0.0, y: 0.0 });
        assert!(
            (origin[0] - 23.272_727).abs() < QUANT,
            "origen absoluto en x"
        );
        assert!((origin[1] - 32.0).abs() < QUANT, "origen absoluto en y");
        let x = point(Point { x: 100.0, y: 0.0 });
        let y = point(Point { x: 0.0, y: 100.0 });
        let scale = 100.0 * SCALE;
        assert!((x[0] - (origin[0] + scale)).abs() < QUANT, "x absoluta");
        assert!((y[1] - (origin[1] + scale)).abs() < QUANT, "y absoluta");
        let p = Painter::new(
            false,
            &vm,
            &["TRACK".into(), "RACE".into(), "Tú P1".into()],
            Preferences::default(),
        );
        let mut rt = runtime(p);
        rt.frame(0.0);
        for marker in &vm.markers {
            let key = format!("map-car-{}", marker.id.0);
            let rect = rt
                .elements()
                .into_iter()
                .find(|e| e.key.as_deref() == Some(&key))
                .unwrap()
                .rect;
            let [x, y] = point(marker.point);
            // El centro absoluto del marcador, con la cuantización del layout CPU.
            let projected = [rect[0] + 10.0, rect[1] + 10.0];
            assert!(
                (projected[0] - x).abs() <= QUANT && (projected[1] - y).abs() <= QUANT,
                "{key}: centro {projected:?} != {x}, {y}"
            );
        }
        for color in [RED, UNKNOWN, ROAD, DARK] {
            assert!(
                rt.instances
                    .iter()
                    .any(|i| (i.fill[0] - color.r).abs() < 1e-6
                        && (i.fill[1] - color.g).abs() < 1e-6
                        && (i.fill[2] - color.b).abs() < 1e-6),
                "la paleta pintada lleva {:?}",
                color.hex()
            );
        }
        let widths: Vec<_> = rt
            .instances
            .iter()
            .filter(|i| i.params[1] == rune::render::KIND_SEGMENT)
            .map(|i| i.params[0] * 2.0)
            .collect();
        for width in [13.0, 5.0, 2.0, 1.5] {
            assert!(widths.contains(&width));
        }
        let elements = rt.elements();
        let i = |key: &str| {
            elements
                .iter()
                .position(|e| e.key.as_deref() == Some(key))
                .unwrap()
        };
        assert!(i("map-road-outer") < i("map-road-inner"));
        assert!(
            i("map-car-1") < i("map-car-2"),
            "GPUI paints player in Snapshot order"
        );
    }

    #[test]
    fn positions_and_fixed_labels_stay_live_and_only_structure_rebuilds() {
        let mut vm = scene();
        let mut labels = ["TRACK".into(), "RACE".into(), "Tú P1".into()];
        let mut p = Painter::new(false, &vm, &labels, Preferences::default());
        vm.markers[1].point.x += 2.0;
        let update = p.sync(&vm, &labels);
        assert!(!update.build && update.pixels);
        labels[2] = "Tú P2".into();
        let update = p.sync(&vm, &labels);
        assert!(!update.build && update.pixels);
        let update = p.sync(&vm, &labels);
        assert!(!update.build && !update.pixels);
        vm.reference_text = Some("NOT PAINTED BY GPUI".into());
        assert!(!p.sync(&vm, &labels).pixels);
        vm.markers[1].class_name = Some("LMP2".into());
        assert!(p.sync(&vm, &labels).build);
        vm.outline[1].x += 1.0;
        assert!(p.sync(&vm, &labels).build);
    }

    #[test]
    fn transparency_and_long_header_keep_the_gpui_box_and_text_shadows() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        for transparent in [false, true] {
            let labels = [
                "AUTODROMO INTERNAZIONALE ENZO E DINO FERRARI · 4.909 KM".into(),
                "CLASIFICACIÓN · 09:21".into(),
                "Tú P1".into(),
            ];
            let mut rt = runtime(Painter::new(
                transparent,
                &scene(),
                &labels,
                Preferences::default(),
            ));
            rt.frame(0.0);
            assert_eq!(rt.find("map-panel").is_some(), !transparent);
            let elements = rt.elements();
            let e = |key: &str| {
                elements
                    .iter()
                    .find(|e| e.key.as_deref() == Some(key))
                    .unwrap()
            };
            assert_eq!(e("track-map").rect, [0.0, 0.0, 320.0, 248.0]);
            assert_eq!(
                e("map-road-outer").opacity,
                if transparent { 0.55 } else { 0.07 }
            );
            let name = e("map-track-name-5").rect;
            let session = e("map-session-5").rect;
            assert!(name[0] + name[2] + 8.0 <= session[0] + QUANT);
            assert!((session[0] + session[2] - 308.0).abs() <= QUANT);
            assert_eq!(e("map-footer").rect[1], 222.0);
            for n in 0..5 {
                assert!(rt.find(&format!("map-footer-shadow-{n}")).is_some());
            }
            assert!(
                elements
                    .iter()
                    .filter_map(|e| e.text.as_deref())
                    .all(|t| t != "REFERENCE" && t != "REFERENCIA")
            );
            assert!(rt.wake_deadline().is_none());
        }
    }
}
