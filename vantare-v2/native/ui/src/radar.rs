//! Radar aprobado: 220×220, 8 px/m y frases opcionales en la misma caja.
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::rect;
use crate::vantare::paint::{Face, Kit, round_rect};
use crate::vantare::style::{Color, Style};
use gpui::{App, BorderStyle, Corners, Edges, px, quad};
use std::{cell::RefCell, rc::Rc, sync::Arc};
type Glow = Rc<RefCell<[Option<Arc<gpui::RenderImage>>; 2]>>;
use vantare_domain::{CarId, radar::ViewModel};
pub const SIZE: (f32, f32) = (220.0, 220.0);
const CENTER: f32 = 110.0;
const SCALE: f32 = 8.0;

fn car(window: &mut Window, x: f32, y: f32, fill: Color, own: bool) {
    window.paint_quad(quad(
        rect(x - 8.0, y - 19.2, 16.0, 38.4),
        Corners::all(px(4.0)),
        fill.hsla(),
        Edges::all(px(if own { 2.5 } else { 0.0 })),
        Color(0xe14a54, 1.0).hsla(),
        BorderStyle::default(),
    ));
    round_rect(
        window,
        x - 5.0,
        y - 14.2,
        10.0,
        6.0,
        2.0,
        Color(0, 0.35).hsla(),
    );
}

fn paint_glow(vm: &ViewModel, cache: &Glow, window: &mut Window, cx: &App) {
    for (index, active) in [vm.overlap_left, vm.overlap_right].into_iter().enumerate() {
        if !active {
            continue;
        }
        let mut cache = cache.borrow_mut();
        if cache[index].is_none() {
            let center = if index == 0 { 0 } else { 220 };
            let svg = format!(
                r##"<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><defs><radialGradient id="g" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate({center} 110) scale(54 121)"><stop stop-color="#F25A5A" stop-opacity=".55"/><stop offset="1" stop-color="#F25A5A" stop-opacity="0"/></radialGradient></defs><rect width="220" height="220" fill="url(#g)"/></svg>"##
            );
            match cx.svg_renderer().render_single_frame(svg.as_bytes(), 2.0) {
                Ok(image) => cache[index] = Some(image),
                Err(error) => eprintln!("radar: luz: {error}"),
            }
        }
        if let Some(image) = &cache[index] {
            let bounds = rect(0.0, 0.0, 220.0, 220.0);
            if let Err(error) = window.paint_image(
                bounds,
                bounds,
                Corners::all(px(8.0)),
                image.clone(),
                0,
                false,
            ) {
                eprintln!("radar: luz: {error}");
            }
        }
    }
}

fn paint(
    vm: &ViewModel,
    classes: &[(CarId, String)],
    glow: &Glow,
    settings: &Settings,
    prefs: Preferences,
    window: &mut Window,
    cx: &mut App,
) {
    let style = Style::compiled();
    let kit = Kit {
        style: &style,
        variant: &style.styles.neo,
        accent: style.accents.red,
        language: prefs.language,
        width: SIZE.0,
    };
    kit.panel(window, SIZE.1);
    paint_glow(vm, glow, window, cx);
    for radius in [40.0, 80.0] {
        window.paint_quad(quad(
            rect(CENTER - radius, CENTER - radius, radius * 2.0, radius * 2.0),
            Corners::all(px(radius)),
            Color(0, 0.0).hsla(),
            Edges::all(px(1.0)),
            Color(0xffffff, 0.07).hsla(),
            BorderStyle::default(),
        ));
    }
    round_rect(
        window,
        109.5,
        8.0,
        1.0,
        204.0,
        0.0,
        Color(0xffffff, 0.05).hsla(),
    );
    round_rect(
        window,
        8.0,
        109.5,
        204.0,
        1.0,
        0.0,
        Color(0xffffff, 0.05).hsla(),
    );
    let scale = kit.ink(Face::Mono, 9.0, 0.0, style.colors.column.hsla());
    kit.label(window, cx, "5", 153.0, None, 94.0, 13.0, Face::Mono, &scale);
    kit.label(
        window,
        cx,
        "10 m",
        193.0,
        None,
        94.0,
        13.0,
        Face::Mono,
        &scale,
    );
    if vm.available {
        for rival in &vm.cars {
            let x = CENTER + rival.right_m as f32 * SCALE;
            let y = CENTER - rival.ahead_m as f32 * SCALE;
            if !(8.0..=212.0).contains(&x) || !(20.0..=200.0).contains(&y) {
                continue;
            }
            let class = classes
                .iter()
                .find(|(id, _)| *id == rival.id)
                .map_or("", |(_, c)| c.as_str());
            let mut fill = style.class(class).dot;
            fill.1 = if rival.near { 0.92 } else { 0.35 };
            car(window, x, y, fill, false);
        }
        car(window, CENTER, CENTER, Color(0xf2eeee, 1.0), true);
    } else {
        window.paint_quad(quad(
            rect(102.0, 90.8, 16.0, 38.4),
            Corners::all(px(4.0)),
            Color(0, 0.0).hsla(),
            Edges::all(px(1.0)),
            style.colors.pulse.hsla(),
            BorderStyle::default(),
        ));
    }
    if settings.show_phrases || !vm.available {
        round_rect(
            window,
            1.0,
            190.0,
            218.0,
            29.0,
            0.0,
            Color(0x110f10, 0.92).hsla(),
        );
        paint_phrase(vm, &kit, |label| {
            let value = crate::efficiency::text::fit(window, label.value, &label.ink, 202.0);
            let fitted = crate::vantare::paint::Label {
                value: &value,
                x: label.x - crate::efficiency::text::width(window, &value, &label.ink) / 2.0,
                ..label
            };
            fitted.paint(&kit, window, cx);
        });
    }
}

fn paint_phrase(
    vm: &ViewModel,
    kit: &Kit<'_>,
    mut draw: impl FnMut(crate::vantare::paint::Label<'_>),
) {
    let value = phrase(vm, kit.es()).to_uppercase();
    let color = if vm.overlap_left || vm.overlap_right {
        Color(0xff8a8a, 1.0)
    } else {
        kit.style.colors.muted
    };
    draw(crate::vantare::paint::Label {
        value: &value,
        x: SIZE.0 / 2.0,
        right: None,
        top: 197.0,
        height: 16.0,
        face: Face::Display,
        ink: kit.ink(Face::Display, 11.0, 1.4, color.hsla()),
    });
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
    if vm.available && !vm.overlap_left && !vm.overlap_right {
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
    (match (vm.available, vm.overlap_left, vm.overlap_right, es) {
        (false, _, _, true) => "Esperando a LMU",
        (false, _, _, false) => "Waiting for LMU",
        (true, true, true, true) => "Tres en paralelo",
        (true, true, false, true) => "Coche a la izquierda",
        (true, false, true, true) => "Coche a la derecha",
        (true, true, true, false) => "Three wide",
        (true, true, false, false) => "Car left",
        (true, false, true, false) => "Car right",
        (_, _, _, true) => "Pista libre",
        (_, _, _, false) => "Clear track",
    })
    .into()
}

use crate::app::{Paint, Wake, replace_if_changed};
use vantare_domain::{Snapshot, format::Preferences};

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub show_phrases: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self { show_phrases: true }
    }
}
impl Settings {
    #[must_use]
    pub fn normalized(&self) -> Self {
        self.clone()
    }
}

impl Settings {
    /// `RadarFunctional` no ofrece ajustes visuales ni de contenido.
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
}

pub(crate) struct Widget {
    vm: ViewModel,
    classes: Vec<(CarId, String)>,
    glow: Glow,
    settings: Settings,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, _prefs: Preferences) -> Self {
        Self {
            vm: vantare_domain::radar::project(&Snapshot::default()),
            classes: Vec::new(),
            glow: Rc::default(),
            settings: settings.clone(),
        }
    }

    // Firma común del registro: este widget tiene tamaño fijo.
    #[allow(clippy::unused_self)]
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, _prefs: Preferences) -> bool {
        let vm = vantare_domain::radar::project(snapshot);
        let classes = vm
            .cars
            .iter()
            .filter_map(|r| {
                snapshot.state.cars.iter().find(|c| c.id == r.id).map(|c| {
                    (
                        c.id,
                        c.class
                            .as_ref()
                            .map_or_else(String::new, |c| c.name.clone()),
                    )
                })
            })
            .collect();
        let changed = replace_if_changed(&mut self.classes, classes);
        replace_if_changed(&mut self.vm, vm) || changed
    }

    pub(crate) fn frame(&mut self, prefs: Preferences, _reduced: bool) -> (Paint, Wake) {
        let vm = self.vm.clone();
        let classes = self.classes.clone();
        let glow = self.glow.clone();
        let settings = self.settings.clone();
        (
            Box::new(move |window, cx| paint(&vm, &classes, &glow, &settings, prefs, window, cx)),
            Wake::Idle,
        )
    }

    #[cfg(feature = "parity-capture")]
    #[allow(clippy::unused_self)] // Firma común; este widget no anima.
    pub(crate) fn animating(&self) -> bool {
        false
    }
}

impl Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{LapCount, LapProgress, Spatial, TrackLength, Velocity};
        crate::demand::signals(33, &[Spatial, Velocity, LapCount, LapProgress, TrackLength])
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn closing_phrase_uses_current_velocity_and_overlap_keeps_priority() {
        use vantare_domain::{Car, Player, Pose, Quality, SourceState};
        let mut snapshot = Snapshot {
            epoch: 1629,
            sequence: 1,
            ..Snapshot::default()
        };
        snapshot.state.source_state = SourceState::Live;
        snapshot.state.capabilities.spatial = vantare_domain::Capability::Fresh;
        snapshot.state.player = Some(Player {
            car: CarId(1),
            ..Player::default()
        });
        snapshot.state.cars = vec![
            Car {
                id: CarId(1),
                pose: Quality::Reliable(Pose::default()),
                velocity_mps: Quality::Reliable([40.0, 0.0]),
                ..Car::default()
            },
            Car {
                id: CarId(2),
                pose: Quality::Reliable(Pose {
                    x_m: -20.0,
                    ..Pose::default()
                }),
                velocity_mps: Quality::Reliable([50.0, 0.0]),
                ..Car::default()
            },
        ];
        assert_eq!(
            phrase(&vantare_domain::radar::project(&snapshot), true),
            "Se acerca detrás · +36 km/h"
        );
        // El DTO parcial debe conservar la frase, no solo el VM de una foto completa.
        let name = format!("radar-velocity-{}", std::process::id());
        let mut publisher = vantare_ipc::Publisher::new(&name, |_| true).expect("pipe");
        let demand = Settings::default().demand();
        let source = publisher.demand_source();
        let mut subscriber =
            vantare_ipc::Subscriber::connect_requested(&name, demand.clone(), |_| true)
                .expect("suscriptor");
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        while source.mask() != demand.mask() {
            assert!(std::time::Instant::now() < deadline, "demanda aceptada");
            std::thread::yield_now();
        }
        publisher.publish(Arc::new(snapshot.clone())).expect("foto");
        let filtered = subscriber
            .next_photo(std::time::Duration::from_secs(2))
            .expect("DTO v11");
        assert_eq!(
            phrase(&vantare_domain::radar::project(&filtered.snapshot), true),
            "Se acerca detrás · +36 km/h"
        );
        snapshot.state.cars[1].pose = Quality::Reliable(Pose {
            y_m: 2.0,
            ..Pose::default()
        });
        assert_eq!(
            phrase(&vantare_domain::radar::project(&snapshot), true),
            "Coche a la izquierda"
        );
        snapshot.state.cars[1].pose = Quality::Reliable(Pose {
            x_m: -20.0,
            ..Pose::default()
        });
        snapshot.state.cars[1].velocity_mps = Quality::Stale([50.0, 0.0]);
        assert_eq!(
            phrase(&vantare_domain::radar::project(&snapshot), true),
            "Pista libre"
        );
    }

    use super::*;
    use crate::source;

    #[test]
    fn parity_scene_keeps_the_reference_sides() {
        let snapshot = vantare_ipc::snapshot_from_fixture_json(include_str!(
            "../fixtures/radar.snapshot.json"
        ))
        .expect("escena Radar DTO v3 válida");
        let vm = vantare_domain::radar::project(&snapshot);
        let positions: Vec<_> = vm
            .cars
            .iter()
            .map(|car| (car.ahead_m, car.right_m))
            .collect();
        assert_eq!(positions, [(0.0, -4.0), (-12.0, 8.0), (20.0, -2.0)]);
        assert!(vm.overlap_left && !vm.overlap_right);
        let flags: Vec<_> = vm
            .cars
            .iter()
            .map(|car| (car.overlap, car.near, car.lapped))
            .collect();
        assert_eq!(
            flags,
            [
                (true, true, false),
                (false, false, false),
                (false, false, true)
            ]
        );
    }

    #[test]
    fn legacy_settings_and_approved_photos_keep_their_meaning() {
        let old: Settings = serde_json::from_str("{}").expect("ajustes anteriores");
        assert!(old.show_phrases);
        let photos = crate::workshop::snapshots_from_json(include_str!(
            "../fixtures/radar-design-system.sequence.json"
        ))
        .expect("ejemplo DTO");
        assert_eq!(photos.len(), 3);
        let first = vantare_domain::radar::project(&photos[0]);
        assert!(first.overlap_left && !first.overlap_right);
        let second = vantare_domain::radar::project(&photos[1]);
        assert!(second.overlap_left && second.overlap_right);
        assert_eq!(
            photos[1].origin.received_at,
            std::time::Duration::from_secs(1)
        );
        assert!(!vantare_domain::radar::project(&photos[2]).available);
    }

    #[test]
    fn phrases_are_saved_without_changing_the_box() {
        let settings = Settings {
            show_phrases: false,
        };
        let saved: Settings =
            serde_json::from_str(&serde_json::to_string(&settings).unwrap()).unwrap();
        assert_eq!(saved, settings);
        let mut widget = Widget::new(&saved, Preferences::default());
        for snapshot in [source::fixed(), Snapshot::default()] {
            widget.ingest(&snapshot, Preferences::default());
            assert_eq!(widget.size(), SIZE);
        }
    }

    #[test]
    fn repaint_only_on_a_new_view_model() {
        let mut widget = Widget::new(&Settings::default(), Preferences::default());
        assert!(widget.ingest(&source::synthetic(0), Preferences::default()));
        assert!(!widget.ingest(&source::synthetic(0), Preferences::default()));
        assert!(widget.ingest(&source::synthetic(300), Preferences::default()));
    }
}

#[cfg(test)]
mod capability_render_tests {
    #[test]
    fn unavailable_radar_paints_the_spatial_reason_in_both_languages() {
        use vantare_domain::{Capability, Snapshot, format::Language};
        for (capability, es, en) in [
            (
                Capability::Unsupported,
                "SIN POSICIÓN ESPACIAL",
                "SPATIAL POSITION UNAVAILABLE",
            ),
            (
                Capability::Supported,
                "ESPERANDO POSICIÓN ESPACIAL",
                "WAITING FOR SPATIAL POSITION",
            ),
            (
                Capability::WithData,
                "DATOS ESPACIALES ANTIGUOS",
                "SPATIAL DATA OUT OF DATE",
            ),
            (
                Capability::Fresh,
                "ESPERANDO POSICIÓN PROPIA",
                "WAITING FOR PLAYER POSITION",
            ),
        ] {
            let mut vm = vantare_domain::radar::project(&Snapshot::default());
            vm.capability = capability;
            for (language, expected) in [(Language::Es, es), (Language::En, en)] {
                crate::paint_tests::with_kit(super::SIZE.0, language, |kit| {
                    let painted =
                        crate::paint_tests::observe(|draw| super::paint_phrase(&vm, kit, draw));
                    assert_eq!(painted[0].value, expected);
                });
            }
        }
    }
}
