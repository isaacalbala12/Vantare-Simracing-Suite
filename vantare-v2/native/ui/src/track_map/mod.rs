//! Mapa: marco fijo de 320 × 248, con transparencia opcional.
//! Sin geometría en `Snapshot` se muestra PISTA SIN MAPA, nunca un mapa ficticio.

mod scene;

use crate::efficiency::preview::PaintWindow as Window;
use gpui::{App, Hsla, PathBuilder, Pixels, Point, point, px};
use vantare_domain::format::Preferences;
use vantare_domain::{Snapshot, track_map};

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::text;
use crate::vantare::{
    paint::{Face, Kit},
    style::{Color, Style},
};

const WIDTH: f32 = 320.0;
// Mantener las proporciones de la proyección; el alto disponible es 188 px.
const SCALE: f32 = 188.0 / 220.0;
const SIZE: (f32, f32) = (320.0, 248.0);

#[cfg(test)]
mod projection_tests {
    #[test]
    fn equal_distances_keep_their_proportions_on_both_axes() {
        let origin = super::svg_point(vantare_domain::track_map::Point { x: 0.0, y: 0.0 });
        let horizontal = super::svg_point(vantare_domain::track_map::Point { x: 100.0, y: 0.0 });
        let vertical = super::svg_point(vantare_domain::track_map::Point { x: 0.0, y: 100.0 });
        let dx = f32::from(horizontal.x - origin.x);
        let dy = f32::from(vertical.y - origin.y);
        assert!((dx - dy).abs() < 0.001, "la pista no se estira en un eje");
    }
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub show_track_label: bool,
    pub transparent: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            show_track_label: true,
            transparent: false,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[(
        "showTrackLabel",
        "TrackMapFunctional dibuja el pie sin consultar showTrackLabel",
    )];
    #[must_use]
    pub fn normalized(&self) -> Self {
        self.clone()
    }
    #[allow(clippy::unused_self)] // El productivo conserva showTrackLabel, pero no lo aplica.
    fn project(
        &self,
        snapshot: &Snapshot,
        prefs: Preferences,
        geometry: Option<&track_map::Geometry<'_>>,
    ) -> track_map::ViewModel {
        track_map::project_with_geometry(snapshot, prefs, geometry)
    }
}

pub(crate) struct Widget {
    settings: Settings,
    vm: track_map::ViewModel,
    labels: [String; 3],
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        Self {
            labels: labels(&Snapshot::default(), prefs),
            settings: settings.clone(),
            vm: settings.project(&Snapshot::default(), prefs, None),
        }
    }

    pub(crate) fn size(&self) -> (f32, f32) {
        (WIDTH, height(&self.vm))
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        let geometry = scene::geometry(snapshot);
        let next = self.settings.project(snapshot, prefs, geometry.as_ref());
        let changed = replace_if_changed(&mut self.labels, labels(snapshot, prefs));
        replace_if_changed(&mut self.vm, next) || changed
    }

    pub(crate) fn frame(&mut self, prefs: Preferences, _reduced: bool) -> (Paint, Wake) {
        let vm = self.vm.clone();
        let transparent = self.settings.transparent;
        let labels = self.labels.clone();
        (
            Box::new(move |window, cx| paint(&vm, &labels, transparent, prefs, window, cx)),
            Wake::Idle,
        )
    }

    #[cfg(feature = "parity-capture")]
    #[allow(clippy::unused_self)] // El productivo no tiene animaciones ni avisos.
    pub(crate) fn animating(&self) -> bool {
        false
    }
}

fn height(_vm: &track_map::ViewModel) -> f32 {
    SIZE.1
}

fn svg_point(p: track_map::Point) -> Point<Pixels> {
    let (ox, oy) = text::origin();
    point(
        px(ox + (WIDTH - 320.0 * SCALE) / 2.0 + p.x as f32 * SCALE),
        px(oy + 32.0 + p.y as f32 * SCALE),
    )
}

/// Como el helper productivo: GTE usa unknown; solo GT3/LMGT3 usan verde.
fn class_color(class: Option<&str>) -> u32 {
    match class.unwrap_or_default().to_ascii_uppercase().as_str() {
        "HYPERCAR" => 0xe14a54,
        "LMP2" => 0x4f8ef7,
        "LMP3" => 0xf59e0b,
        "GT3" | "LMGT3" => 0x22c55e,
        _ => 0x6b7280,
    }
}

fn draw_path(window: &mut Window, builder: PathBuilder, color: Hsla) {
    match builder.build() {
        Ok(path) => window.paint_path(path, color),
        Err(error) => eprintln!("track-map: no se pudo trazar la geometría: {error}"),
    }
}

/// Círculo SVG sin el ajuste a píxel de los rectángulos del kit.
fn circle(builder: &mut PathBuilder, center: Point<Pixels>, radius: f32) {
    let r = px(radius);
    let k = px(radius * 0.552_284_8);
    let p = |dx: Pixels, dy: Pixels| point(center.x + dx, center.y + dy);
    builder.move_to(p(r, px(0.0)));
    builder.cubic_bezier_to(p(px(0.0), r), p(r, k), p(k, r));
    builder.cubic_bezier_to(p(-r, px(0.0)), p(-k, r), p(-r, k));
    builder.cubic_bezier_to(p(px(0.0), -r), p(-r, -k), p(-k, -r));
    builder.cubic_bezier_to(p(r, px(0.0)), p(k, -r), p(r, -k));
    builder.close();
}

fn labels(snapshot: &Snapshot, prefs: Preferences) -> [String; 3] {
    let es = prefs.language == vantare_domain::format::Language::Es;
    let car = snapshot.state.player_car();
    let name = snapshot
        .state
        .session
        .track_name
        .current()
        .map_or(if es { "CIRCUITO" } else { "TRACK" }, String::as_str);
    let length = snapshot
        .state
        .session
        .track_length_m
        .current()
        .filter(|v| v.is_finite() && **v > 0.0)
        .map_or_else(String::new, |v| format!(" · {:.3} KM", v / 1000.0));
    let session = match (snapshot.state.session.kind.current(), es) {
        (Some(vantare_domain::SessionKind::Race), true) => "CARRERA",
        (Some(vantare_domain::SessionKind::Race), false) => "RACE",
        (Some(vantare_domain::SessionKind::Qualifying), true) => "CLASIFICACIÓN",
        (Some(vantare_domain::SessionKind::Qualifying), false) => "QUALIFYING",
        (Some(vantare_domain::SessionKind::Practice), true) => "PRÁCTICA",
        (Some(vantare_domain::SessionKind::Practice), false) => "PRACTICE",
        _ => "",
    };
    let lap = if snapshot
        .state
        .session
        .kind
        .current()
        .is_some_and(vantare_domain::SessionKind::ranks_by_best_lap)
    {
        snapshot
            .state
            .session
            .remaining_s
            .current()
            .filter(|v| v.is_finite() && **v >= 0.0)
            .map_or_else(
                || session.to_owned(),
                |seconds| {
                    let total = *seconds as u64;
                    format!("{session} · {:02}:{:02}", total / 60, total % 60)
                },
            )
    } else {
        car.and_then(|c| c.laps.current())
            .zip(snapshot.state.session.laps_total.current())
            .map_or_else(String::new, |(a, b)| {
                format!("{session} · {} {a}/{b}", if es { "V" } else { "L" })
            })
    };
    let player = car.and_then(|c| c.position.current()).map_or_else(
        || if es { "Tú" } else { "You" }.into(),
        |v| format!("{} P{v}", if es { "Tú" } else { "You" }),
    );
    [format!("{}{length}", name.to_uppercase()), lap, player]
}

fn paint(
    vm: &track_map::ViewModel,
    labels: &[String; 3],
    transparent: bool,
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
        width: WIDTH,
    };
    if !transparent {
        kit.panel(window, SIZE.1);
    }
    let header = kit.ink(Face::Body, 10.0, 0.3, style.colors.muted.hsla());
    kit.label_shadow(
        window,
        cx,
        &labels[0],
        12.0,
        None,
        10.0,
        18.0,
        Face::Body,
        &header,
    );
    kit.label_shadow(
        window,
        cx,
        &labels[1],
        0.0,
        Some(308.0),
        10.0,
        18.0,
        Face::Body,
        &header,
    );
    if let Some(first) = vm.outline.first() {
        for (stroke, color) in [
            (
                13.0,
                Color(
                    if transparent { 0x000000 } else { 0xffffff },
                    if transparent { 0.55 } else { 0.07 },
                ),
            ),
            (5.0, Color(0xa39a9c, 1.0)),
        ] {
            let mut path = PathBuilder::stroke(px(stroke));
            path.move_to(svg_point(*first));
            for &p in &vm.outline[1..] {
                path.line_to(svg_point(p));
            }
            path.close();
            draw_path(window, path, color.hsla());
        }
        for marker in &vm.markers {
            let center = svg_point(marker.point);
            let color = if marker.is_player {
                0xe14a54
            } else {
                class_color(marker.class_name.as_deref())
            };
            if marker.is_player {
                let mut halo = PathBuilder::fill();
                circle(&mut halo, center, 9.0);
                draw_path(window, halo, Color(color, 0.25).hsla());
            }
            let mut fill = PathBuilder::fill();
            circle(&mut fill, center, if marker.is_player { 5.5 } else { 4.5 });
            draw_path(window, fill, Color(color, 1.0).hsla());
            let mut border = PathBuilder::stroke(px(if marker.is_player { 2.0 } else { 1.5 }));
            circle(
                &mut border,
                center,
                if marker.is_player { 5.5 } else { 4.5 },
            );
            draw_path(
                window,
                border,
                Color(if marker.is_player { 0xffffff } else { 0x110f10 }, 1.0).hsla(),
            );
        }
    } else {
        let muted = kit.ink(Face::Display, 13.0, 1.0, style.colors.muted.hsla());
        kit.label_shadow(
            window,
            cx,
            &vm.empty_text,
            22.0,
            None,
            115.0,
            20.0,
            Face::Display,
            &muted,
        );
    }
    let foot = kit.ink(Face::Body, 11.0, 0.0, style.colors.muted.hsla());
    let message = if vm.markers.iter().any(|m| m.is_player) {
        labels[2].as_str()
    } else if vm.outline.is_empty() {
        if kit.es() {
            "Esperando trazado de la pista"
        } else {
            "Waiting for track layout"
        }
    } else {
        if kit.es() {
            "Coches por clase"
        } else {
            "Cars by class"
        }
    };
    kit.label_shadow(
        window,
        cx,
        message,
        12.0,
        None,
        222.0,
        18.0,
        Face::Body,
        &foot,
    );
}

impl Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{
            LapCount, Positions, SessionClock, SessionInfo, Spatial, TrackLength, TrackName,
        };
        crate::demand::signals(
            33,
            &[
                Spatial,
                TrackName,
                TrackLength,
                LapCount,
                SessionInfo,
                SessionClock,
                Positions,
            ],
        )
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn approved_demo_is_explicit_and_cannot_supply_geometry_to_live() {
        let photos = crate::workshop::snapshots_from_json(include_str!(
            "../../fixtures/track-map-design-system.sequence.json"
        ))
        .expect("demo DTO");
        let snapshot = &photos[0];
        let mut widget = Widget::new(&Settings::default(), Preferences::default());
        widget.ingest(snapshot, Preferences::default());
        assert!(!widget.vm.outline.is_empty());
        assert_eq!(widget.vm.markers.len(), 14);
        assert!(widget.vm.markers.iter().any(|m| m.is_player));
        assert_eq!(widget.size(), SIZE);
        for (photo, markers, clock) in [(&photos[1], 5, "08:42"), (&photos[2], 4, "42:10")] {
            widget.ingest(photo, Preferences::default());
            assert_eq!(widget.vm.markers.len(), markers);
            assert!(widget.labels[1].ends_with(clock));
            let mut altered = photo.clone();
            altered.epoch += 1;
            assert!(scene::geometry(&altered).is_none());
            altered = photo.clone();
            altered.origin.source.kind = vantare_domain::SourceKind::Live;
            assert!(scene::geometry(&altered).is_none());
        }
        let mut live = snapshot.clone();
        live.origin.source.kind = vantare_domain::SourceKind::Live;
        assert!(scene::geometry(&live).is_none());
        widget.ingest(&live, Preferences::default());
        assert!(widget.vm.outline.is_empty());
        assert_eq!(widget.size(), SIZE);
        let transparent = Settings {
            transparent: true,
            ..Settings::default()
        };
        assert_eq!(
            serde_json::from_str::<Settings>(
                &serde_json::to_string(&transparent).expect("guardar")
            )
            .expect("leer")
            .normalized(),
            transparent
        );
    }

    #[test]
    fn unsupported_track_label_setting_preserves_the_productive_footer() {
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = vantare_domain::SourceState::Live;
        snapshot.state.session.track_name = vantare_domain::Quality::Reliable("test".into());
        let geometry = track_map::Geometry {
            track_name: "test",
            label: "TEST",
            points_m: &[(0.0, 0.0), (20.0, 0.0), (20.0, 20.0)],
            synthetic: true,
        };
        let visible =
            Settings::default().project(&snapshot, Preferences::default(), Some(&geometry));
        let hidden = Settings {
            show_track_label: false,
            ..Settings::default()
        }
        .project(&snapshot, Preferences::default(), Some(&geometry));
        assert!(visible.track_label.is_some());
        assert_eq!(hidden, visible);
        assert_eq!(height(&hidden), SIZE.1);
    }

    use super::*;
    use vantare_domain::format::Language;

    #[test]
    fn repaint_tracks_only_visible_changes_and_empty_is_idle() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = vantare_domain::SourceState::Live;
        assert!(
            widget.ingest(&snapshot, prefs),
            "pasa de sin telemetría a pista sin mapa"
        );
        snapshot.sequence += 1;
        assert!(!widget.ingest(&snapshot, prefs));
        snapshot.state.session.track_name = vantare_domain::Quality::Reliable("Sebring".into());
        assert!(
            widget.ingest(&snapshot, prefs),
            "el nombre de pista de la cabecera cambia aun sin geometría"
        );
        let english = Preferences {
            language: Language::En,
            ..prefs
        };
        assert!(widget.ingest(&snapshot, english));
        assert!(!widget.ingest(&snapshot, english));
        assert_eq!(widget.size(), (WIDTH, SIZE.1));
        assert_eq!(widget.frame(english, false).1, Wake::Idle);
        #[cfg(feature = "parity-capture")]
        assert!(!widget.animating());
    }

    #[test]
    fn class_colors_match_the_productive_helper() {
        for (class, expected) in [
            (None, 0x6b7280),
            (Some("gte"), 0x6b7280),
            (Some("hypercar"), 0xe14a54),
            (Some("LMP2"), 0x4f8ef7),
            (Some("lmp3"), 0xf59e0b),
            (Some("GT3"), 0x22c55e),
            (Some("LMGT3"), 0x22c55e),
        ] {
            assert_eq!(class_color(class), expected);
        }
    }

    #[cfg(not(feature = "parity-capture"))]
    #[test]
    fn reference_data_never_supplies_a_fake_live_outline() {
        let snapshot = reference_snapshot();
        let mut widget = Widget::new(&Settings::default(), Preferences::default());
        assert!(
            widget.ingest(&snapshot, Preferences::default()),
            "la fuente pasa de Waiting a Live sin inventar un trazado"
        );
        assert!(!widget.ingest(&snapshot, Preferences::default()));
        assert!(widget.vm.outline.is_empty());
        assert!(widget.vm.markers.is_empty());
        assert_eq!(widget.vm.empty_text, "PISTA SIN MAPA");
        assert_eq!(widget.size(), (WIDTH, SIZE.1));
    }

    fn reference_snapshot() -> Snapshot {
        vantare_ipc::snapshot_from_fixture_json(include_str!("../../fixtures/track-map.snapshot.json"))
            .expect("fixture DTO v4 reconstruida del frame congelado")
    }

    #[cfg(feature = "parity-capture")]
    #[test]
    fn reference_draws_nineteen_available_positions_and_settles_immediately() {
        let mut snapshot = reference_snapshot();
        assert_eq!(snapshot.state.cars.len(), 20);
        assert_eq!(
            snapshot.state.player_car().expect("jugador").pose,
            vantare_domain::Quality::Unavailable
        );
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        assert!(widget.ingest(&snapshot, prefs));
        assert_eq!(widget.size(), (WIDTH, SIZE.1));
        assert_eq!(
            widget.vm.track_label.as_deref(),
            Some("Sebring International Raceway")
        );
        assert_eq!(widget.vm.outline.len(), 582);
        assert_eq!(widget.vm.markers.len(), 19);
        assert!(widget.vm.markers.iter().all(|marker| !marker.is_player));
        let first = &widget.vm.markers[0];
        assert!((first.point.x - 151.297_679_112_008_07).abs() < 1e-12);
        assert!((first.point.y - 54.127_144_298_688_194).abs() < 1e-12);
        assert!(
            widget.vm.reference_text.is_none(),
            "trazado del pack, escena de coches demo"
        );
        assert!(!widget.ingest(&snapshot, prefs));
        snapshot.sequence += 1;
        assert!(!widget.ingest(&snapshot, prefs));
        let english = Preferences {
            language: Language::En,
            ..prefs
        };
        assert!(
            widget.ingest(&snapshot, english),
            "la cabecera visible cambia de idioma"
        );
        assert!(widget.labels[1].contains("RACE"));
        assert!(!widget.ingest(&snapshot, english));
        assert_eq!(widget.frame(prefs, false).1, Wake::Idle);
        assert!(!widget.animating());
    }

    #[cfg(feature = "parity-capture")]
    #[test]
    fn capture_geometry_cannot_leak_into_another_source_epoch_or_state() {
        let reference = reference_snapshot();
        let mut live = reference.clone();
        live.origin.source.kind = vantare_domain::SourceKind::Live;
        let mut next_epoch = reference.clone();
        next_epoch.epoch += 1;
        let mut without_position = reference.clone();
        without_position.state.cars[1].pose = vantare_domain::Quality::Unavailable;
        for snapshot in [live, next_epoch, without_position] {
            assert!(scene::geometry(&snapshot).is_none());
            let mut widget = Widget::new(&Settings::default(), Preferences::default());
            assert!(widget.ingest(&reference, Preferences::default()));
            assert!(widget.ingest(&snapshot, Preferences::default()));
            assert_eq!(widget.size(), (WIDTH, SIZE.1));
            assert!(widget.vm.outline.is_empty());
            assert_eq!(widget.frame(Preferences::default(), false).1, Wake::Idle);
            assert!(!widget.animating());
        }
    }
}
