//! ViewModel del radar: coches cercanos en el marco del jugador.

use crate::{Capability, CarId, Snapshot};

/// Mitad del lado del cuadrado que cubre el radar.
pub const RANGE_M: f64 = 36.0;
/// Dos coches se solapan si están a menos de un largo en la marcha...
const OVERLAP_AHEAD_M: f64 = 5.0;
/// ...y a menos de un carril de distancia lateral.
const OVERLAP_SIDE_M: f64 = 4.0;

#[derive(Clone, Debug, PartialEq)]
pub struct ViewModel {
    pub capability: Capability,
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
}

pub fn project(snapshot: &Snapshot) -> ViewModel {
    let state = &snapshot.state;
    let mut vm = ViewModel {
        capability: state.capabilities.spatial,
        cars: Vec::new(),
        overlap_left: false,
        overlap_right: false,
    };
    let Some(me) = state.player_car() else {
        return vm;
    };
    let Some(&origin) = me.pose.current() else {
        return vm;
    };
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
        let overlap = ahead_m.abs() < OVERLAP_AHEAD_M && right_m.abs() < OVERLAP_SIDE_M;
        vm.overlap_right |= overlap && right_m > 0.0;
        vm.overlap_left |= overlap && right_m < 0.0;
        vm.cars.push(Car {
            id: car.id,
            ahead_m,
            right_m,
            overlap,
        });
    }
    vm
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
    fn without_a_player_pose_there_are_no_cars() {
        let mut snapshot = snapshot(vec![car(1, 0.0, 0.0, 0.0), car(2, 5.0, 0.0, 0.0)]);
        snapshot.state.cars[0].pose = crate::Quality::Unavailable;
        assert!(project(&snapshot).cars.is_empty());
    }
}
