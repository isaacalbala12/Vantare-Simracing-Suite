//! ViewModel del radar: coches cercanos en el marco del jugador.

use crate::{Capability, CarId, Snapshot, SourceState};

/// Mitad del lado del cuadrado que cubre el radar.
pub const RANGE_M: f64 = 36.0;
/// Dos coches se solapan si están a menos de un largo en la marcha...
const OVERLAP_AHEAD_M: f64 = 5.0;
/// ...y como máximo a un carril de distancia lateral (incluye 4 m).
const OVERLAP_SIDE_M: f64 = 4.0;
const NEAR_M: f64 = 10.0;

#[derive(Clone, Debug, PartialEq)]
pub struct ViewModel {
    pub capability: Capability,
    pub available: bool,
    pub cars: Vec<Car>,
    pub overlap_left: bool,
    pub overlap_right: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Car {
    pub id: CarId,
    /// Metros por delante del jugador (negativo: detrás).
    pub ahead_m: f64,
    /// Metros a la derecha del jugador (negativo: a la izquierda).
    pub right_m: f64,
    pub overlap: bool,
    pub near: bool,
    /// Una vuelta completa detrás según progreso fresco; no solo el contador.
    pub lapped: bool,
}

pub fn project(snapshot: &Snapshot) -> ViewModel {
    let state = &snapshot.state;
    let mut vm = ViewModel {
        capability: state.capabilities.spatial,
        available: false,
        cars: Vec::new(),
        overlap_left: false,
        overlap_right: false,
    };
    if state.source_state != SourceState::Live {
        return vm;
    }
    let Some(me) = state.player_car() else {
        return vm;
    };
    let Some(&origin) = me.pose.current() else {
        return vm;
    };
    vm.available = state.capabilities.spatial >= Capability::WithData;
    let (sin, cos) = origin.yaw_rad.sin_cos();

    for car in state.cars.iter().filter(|car| car.id != me.id) {
        let Some(pose) = car.pose.current() else {
            continue;
        };
        let (dx, dy) = (pose.x_m - origin.x_m, pose.y_m - origin.y_m);
        let ahead_m = dx * cos + dy * sin;
        let right_m = dx * sin - dy * cos;
        if ahead_m.abs() > RANGE_M || right_m.abs() > RANGE_M {
            continue;
        }
        let overlap = ahead_m.abs() < OVERLAP_AHEAD_M && right_m.abs() <= OVERLAP_SIDE_M;
        vm.overlap_right |= overlap && right_m > 0.0;
        vm.overlap_left |= overlap && right_m < 0.0;
        vm.cars.push(Car {
            id: car.id,
            ahead_m,
            right_m,
            overlap,
            near: ahead_m.hypot(right_m) <= NEAR_M,
            lapped: lapped_by_player(me, car, state.session.track_length_m.current()),
        });
    }
    vm
}

// Mismo criterio de `overlayv2/builder_radar.go`: cruzar meta por sí solo
// no convierte al coche cercano en doblado. Sin progreso actual no se infiere.
fn lapped_by_player(me: &crate::Car, car: &crate::Car, length: Option<&f64>) -> bool {
    let (Some(&length), Some(&me_laps), Some(&laps), Some(&me_distance), Some(&distance)) = (
        length,
        me.laps.current(),
        car.laps.current(),
        me.lap_distance_m.current(),
        car.lap_distance_m.current(),
    ) else {
        return false;
    };
    length.is_finite()
        && length > 0.0
        && (0.0..length).contains(&me_distance)
        && (0.0..length).contains(&distance)
        && f64::from(me_laps) - f64::from(laps) + (me_distance - distance) / length >= 1.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Car as ModelCar, Player, Pose, Quality::Reliable, State};
    use std::f64::consts::FRAC_PI_2;

    fn car(id: u32, x_m: f64, y_m: f64, yaw_rad: f64) -> ModelCar {
        ModelCar {
            id: CarId(id),
            pose: Reliable(Pose { x_m, y_m, yaw_rad }),
            ..ModelCar::default()
        }
    }

    fn snapshot(cars: Vec<ModelCar>) -> Snapshot {
        Snapshot {
            state: State {
                source_state: crate::SourceState::Live,
                cars,
                player: Some(Player {
                    car: CarId(1),
                    ..Player::default()
                }),
                ..State::default()
            },
            ..Snapshot::default()
        }
    }

    #[test]
    fn positions_are_relative_to_the_players_heading() {
        // El jugador mira hacia +y (yaw 90°): su derecha es +x, su frente +y.
        let vm = project(&snapshot(vec![
            car(1, 10.0, 10.0, FRAC_PI_2),
            car(2, 13.0, 30.0, 0.0),  // 20 m delante, 3 m a la derecha
            car(3, 10.0, 8.0, 0.0),   // 2 m detrás, mismo eje: solapa
            car(4, 8.0, 10.0, 0.0),   // 2 m a la izquierda, a la par: solapa
            car(5, 10.0, 100.0, 0.0), // fuera de rango
        ]));

        let by_id = |id| vm.cars.iter().find(|c| c.id == CarId(id));
        let (front, behind, left) = (by_id(2).unwrap(), by_id(3).unwrap(), by_id(4).unwrap());
        assert!((front.ahead_m - 20.0).abs() < 1e-9 && (front.right_m - 3.0).abs() < 1e-9);
        assert!((behind.ahead_m + 2.0).abs() < 1e-9);
        assert!((left.right_m + 2.0).abs() < 1e-9);
        assert!(!front.overlap && behind.overlap && left.overlap);
        assert!(vm.overlap_left);
        assert!(by_id(5).is_none() && by_id(1).is_none());
    }

    #[test]
    fn overlap_includes_the_car_four_metres_to_the_left() {
        let vm = project(&snapshot(vec![
            car(1, 0.0, 0.0, 0.0),
            car(2, 0.0, 4.0, 0.0),
        ]));
        assert!((vm.cars[0].right_m + 4.0).abs() < 1e-9);
        assert!(vm.cars[0].overlap && vm.overlap_left && !vm.overlap_right);
    }

    #[test]
    fn lapped_needs_a_full_lap_of_current_progress() {
        let mut snapshot = snapshot(vec![car(1, 0.0, 0.0, 0.0), car(2, 20.0, 2.0, 0.0)]);
        snapshot.state.session.track_length_m = Reliable(1000.0);
        snapshot.state.cars[0].laps = Reliable(2);
        snapshot.state.cars[0].lap_distance_m = Reliable(10.0);
        snapshot.state.cars[1].laps = Reliable(1);
        snapshot.state.cars[1].lap_distance_m = Reliable(990.0);
        assert!(!project(&snapshot).cars[0].lapped, "solo ha cruzado meta");
        snapshot.state.cars[1].lap_distance_m = Reliable(10.0);
        assert!(project(&snapshot).cars[0].lapped, "una vuelta completa");
        snapshot.state.cars[1].lap_distance_m = crate::Quality::Stale(10.0);
        assert!(!project(&snapshot).cars[0].lapped, "progreso obsoleto");
        snapshot.state.cars[1].lap_distance_m = Reliable(10.0);
        snapshot.state.session.track_length_m = Reliable(f64::NAN);
        assert!(!project(&snapshot).cars[0].lapped);
    }

    #[test]
    fn near_includes_ten_metres_but_not_diagonal_cars_further_away() {
        let vm = project(&snapshot(vec![
            car(1, 0.0, 0.0, 0.0),
            car(2, 10.0, 0.0, 0.0),
            car(3, 8.0, 8.0, 0.0),
        ]));
        assert!(vm.cars[0].near);
        assert!(!vm.cars[1].near);
    }

    #[test]
    fn without_a_player_pose_there_are_no_cars() {
        let mut snapshot = snapshot(vec![car(1, 0.0, 0.0, 0.0), car(2, 5.0, 0.0, 0.0)]);
        snapshot.state.cars[0].pose = crate::Quality::Unavailable;
        assert!(project(&snapshot).cars.is_empty());
    }
}
