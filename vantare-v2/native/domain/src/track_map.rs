//! `TrackMap` Eficiencia: trazado y coches comparten la misma proyección.
//! El modelo aún no tiene geometría de circuito ni estado de conexión. Sin
//! geometría explícita no se dibuja un circuito a partir del nombre o los coches.

use crate::format::{Language, Preferences};
use crate::{CarId, Quality, Snapshot};

pub const VIEWPORT: (f64, f64) = (320.0, 220.0);
const PADDING: f64 = 12.0;

/// Geometría externa en el mismo plano SI que `Car::pose` (metros).
/// No es telemetría; la escena de paridad la suministra explícitamente.
pub struct Geometry<'a> {
    pub track_name: &'a str,
    pub label: &'a str,
    pub points_m: &'a [(f64, f64)],
    pub synthetic: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Marker {
    pub id: CarId,
    pub point: Point,
    pub is_player: bool,
    pub class_name: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ViewModel {
    pub outline: Vec<Point>,
    pub markers: Vec<Marker>,
    pub track_label: Option<String>,
    pub reference_text: Option<String>,
    pub empty_text: String,
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    project_with_geometry(snapshot, prefs, None)
}

/// El nombre debe coincidir exactamente (ignorando mayúsculas y espacios
/// exteriores). Nunca se elige un mapa parecido ni una geometría de reserva.
pub fn project_with_geometry(
    snapshot: &Snapshot,
    prefs: Preferences,
    geometry: Option<&Geometry<'_>>,
) -> ViewModel {
    let mut vm = ViewModel {
        outline: Vec::new(),
        markers: Vec::new(),
        track_label: None,
        reference_text: None,
        empty_text: match prefs.language {
            Language::Es => "PISTA SIN MAPA",
            Language::En => "TRACK NOT MAPPED",
        }
        .into(),
    };
    let name = match &snapshot.state.session.track_name {
        Quality::Reliable(name) | Quality::Estimated(name) | Quality::Stale(name) => name,
        Quality::Unavailable => return vm,
    };
    let Some(geometry) = geometry
        .filter(|g| !name.trim().is_empty() && name.trim().eq_ignore_ascii_case(g.track_name))
    else {
        return vm;
    };
    let Some(projection) = projection(geometry.points_m) else {
        return vm;
    };
    // No conservar texto oculto: cambiar el idioma no repinta un mapa sin aviso.
    vm.empty_text.clear();
    vm.outline = geometry
        .points_m
        .iter()
        .map(|&(x, y)| {
            let point = projection.point(x, y);
            // El path productivo congela cada coordenada con toFixed(2).
            Point {
                x: (point.x * 100.0).round() / 100.0,
                y: (point.y * 100.0).round() / 100.0,
            }
        })
        .collect();
    vm.track_label = Some(geometry.label.into());
    if geometry.synthetic {
        vm.reference_text = Some(
            match prefs.language {
                Language::Es => "REFERENCIA",
                Language::En => "REFERENCE",
            }
            .into(),
        );
    }
    // Stale se conserva como en el productivo; ausente o no finito se omite.
    // Estimated no equivale a groundPosition fresh/stale en ese contrato.
    vm.markers = snapshot
        .state
        .cars
        .iter()
        .filter_map(|car| {
            let pose = match &car.pose {
                Quality::Reliable(pose) | Quality::Stale(pose) => pose,
                Quality::Estimated(_) | Quality::Unavailable => return None,
            };
            if !pose.x_m.is_finite() || !pose.y_m.is_finite() {
                return None;
            }
            let point = projection.point(pose.x_m, pose.y_m);
            if !point.x.is_finite() || !point.y.is_finite() {
                return None;
            }
            Some(Marker {
                id: car.id,
                point,
                is_player: snapshot.state.player.is_some_and(|p| p.car == car.id),
                class_name: car.class.as_ref().map(|class| class.name.clone()),
            })
        })
        .collect();
    vm
}

struct Projection {
    scale: f64,
    offset_x: f64,
    offset_y: f64,
}

impl Projection {
    fn point(&self, x: f64, y: f64) -> Point {
        Point {
            x: x * self.scale + self.offset_x,
            y: y * self.scale + self.offset_y,
        }
    }
}

fn projection(points: &[(f64, f64)]) -> Option<Projection> {
    if points.len() < 3 || points.iter().any(|(x, y)| !x.is_finite() || !y.is_finite()) {
        return None;
    }
    let (mut min_x, mut min_y) = (f64::INFINITY, f64::INFINITY);
    let (mut max_x, mut max_y) = (f64::NEG_INFINITY, f64::NEG_INFINITY);
    for &(x, y) in points {
        min_x = min_x.min(x);
        min_y = min_y.min(y);
        max_x = max_x.max(x);
        max_y = max_y.max(y);
    }
    let (span_x, span_y) = (max_x - min_x, max_y - min_y);
    let (width, height) = (VIEWPORT.0 - PADDING * 2.0, VIEWPORT.1 - PADDING * 2.0);
    let scale = (if span_x > 0.0 {
        width / span_x
    } else {
        f64::INFINITY
    })
    .min(if span_y > 0.0 {
        height / span_y
    } else {
        f64::INFINITY
    });
    let offset_x = PADDING + (width - span_x * scale) / 2.0 - min_x * scale;
    let offset_y = PADDING + (height - span_y * scale) / 2.0 - min_y * scale;
    (scale.is_finite() && scale > 0.0 && offset_x.is_finite() && offset_y.is_finite()).then_some(
        Projection {
            scale,
            offset_x,
            offset_y,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Car, Class, ClassId, Player, Pose};

    const POINTS: &[(f64, f64)] = &[(0.0, 0.0), (100.0, 0.0), (100.0, 100.0)];

    fn geometry(points_m: &[(f64, f64)]) -> Geometry<'_> {
        Geometry {
            track_name: "test",
            label: "Test Circuit",
            points_m,
            synthetic: false,
        }
    }

    fn snapshot() -> Snapshot {
        let mut snapshot = Snapshot::default();
        snapshot.state.session.track_name = Quality::Reliable("test".into());
        snapshot
    }

    #[test]
    fn no_map_without_explicit_valid_geometry_and_matching_track() {
        for name in [
            Quality::Unavailable,
            Quality::Reliable(String::new()),
            Quality::Reliable("other".into()),
        ] {
            let mut snapshot = snapshot();
            snapshot.state.session.track_name = name;
            let vm =
                project_with_geometry(&snapshot, Preferences::default(), Some(&geometry(POINTS)));
            assert!(vm.outline.is_empty());
            assert!(vm.markers.is_empty());
            assert!(vm.track_label.is_none());
        }
        let vm = project(&snapshot(), Preferences::default());
        assert_eq!(vm.empty_text, "PISTA SIN MAPA");
        assert!(vm.outline.is_empty(), "un nombre no inventa un circuito");
        for points in [
            &[][..],
            &POINTS[..2],
            &[(1.0, 1.0); 3],
            &[(0.0, 0.0), (f64::NAN, 1.0), (1.0, 1.0)],
            &[(0.0, 0.0), (1.0, f64::INFINITY), (1.0, 1.0)],
            &[(-f64::MAX, 0.0), (f64::MAX, 0.0), (1.0, 1.0)],
        ] {
            assert!(
                project_with_geometry(&snapshot(), Preferences::default(), Some(&geometry(points)))
                    .outline
                    .is_empty()
            );
        }
    }

    #[test]
    fn outline_fits_uniformly_and_stale_track_keeps_the_map() {
        for name in [
            Quality::Reliable(" TEST ".into()),
            Quality::Estimated("test".into()),
            Quality::Stale("test".into()),
        ] {
            let mut snapshot = snapshot();
            snapshot.state.session.track_name = name;
            let vm =
                project_with_geometry(&snapshot, Preferences::default(), Some(&geometry(POINTS)));
            assert_eq!(
                vm.outline,
                [
                    Point { x: 62.0, y: 12.0 },
                    Point { x: 258.0, y: 12.0 },
                    Point { x: 258.0, y: 208.0 }
                ]
            );
            assert_eq!(vm.track_label.as_deref(), Some("Test Circuit"));
        }
        // Un eje sin extensión es válido; no lo es colapsar ambos.
        for points in [
            &[(0.0, 0.0), (1.0, 0.0), (2.0, 0.0)][..],
            &[(0.0, 0.0), (0.0, 1.0), (0.0, 2.0)],
        ] {
            assert_eq!(
                project_with_geometry(&snapshot(), Preferences::default(), Some(&geometry(points)))
                    .outline
                    .len(),
                3
            );
        }
    }

    #[test]
    fn marker_quality_identity_and_world_origin_are_preserved() {
        let pose = Pose {
            x_m: 0.0,
            y_m: 0.0,
            yaw_rad: f64::NAN,
        };
        for (quality, visible) in [
            (Quality::Reliable(pose), true),
            (Quality::Stale(pose), true),
            (Quality::Estimated(pose), false),
            (Quality::Unavailable, false),
            (
                Quality::Reliable(Pose {
                    x_m: f64::NAN,
                    ..pose
                }),
                false,
            ),
            (
                Quality::Stale(Pose {
                    y_m: f64::INFINITY,
                    ..pose
                }),
                false,
            ),
        ] {
            let mut snapshot = snapshot();
            snapshot.state.player = Some(Player {
                car: CarId(7),
                ..Player::default()
            });
            snapshot.state.cars.push(Car {
                id: CarId(7),
                pose: quality,
                class: Some(Class {
                    id: ClassId(2),
                    name: "LMP2".into(),
                }),
                ..Car::default()
            });
            let vm =
                project_with_geometry(&snapshot, Preferences::default(), Some(&geometry(POINTS)));
            assert_eq!(vm.markers.len(), usize::from(visible));
            if visible {
                let marker = &vm.markers[0];
                assert_eq!(marker.point, Point { x: 62.0, y: 12.0 });
                assert_eq!(marker.id, CarId(7));
                assert!(marker.is_player);
                assert_eq!(marker.class_name.as_deref(), Some("LMP2"));
                snapshot.state.player = None;
                snapshot.state.cars[0].class = None;
                let vm = project_with_geometry(
                    &snapshot,
                    Preferences::default(),
                    Some(&geometry(POINTS)),
                );
                assert!(!vm.markers[0].is_player);
                assert!(vm.markers[0].class_name.is_none());
            }
        }
    }

    #[test]
    fn labels_follow_language_and_synthetic_is_explicit() {
        for (language, empty, reference) in [
            (Language::Es, "PISTA SIN MAPA", "REFERENCIA"),
            (Language::En, "TRACK NOT MAPPED", "REFERENCE"),
        ] {
            let prefs = Preferences {
                language,
                ..Preferences::default()
            };
            assert_eq!(project(&Snapshot::default(), prefs).empty_text, empty);
            let mut geometry = geometry(POINTS);
            assert!(
                project_with_geometry(&snapshot(), prefs, Some(&geometry))
                    .reference_text
                    .is_none()
            );
            geometry.synthetic = true;
            assert_eq!(
                project_with_geometry(&snapshot(), prefs, Some(&geometry))
                    .reference_text
                    .as_deref(),
                Some(reference)
            );
        }
    }
}
