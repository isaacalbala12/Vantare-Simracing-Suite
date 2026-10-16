//! Evidencia numérica acotada; una proyección cambiante no prueba conducción.
use std::collections::{BTreeMap, BTreeSet};

use serde_json::{Value, json};
use vantare_domain::{Quality, Snapshot};

#[derive(Default)]
struct Range {
    samples: u64,
    min: Option<f64>,
    max: Option<f64>,
}
impl Range {
    fn observe(&mut self, value: &Quality<f64>) {
        if let Quality::Reliable(value) = value
            && value.is_finite()
        {
            self.samples += 1;
            self.min = Some(self.min.map_or(*value, |old| old.min(*value)));
            self.max = Some(self.max.map_or(*value, |old| old.max(*value)));
        }
    }
    fn report(&self) -> Value {
        json!({"reliable_samples":self.samples,"min":self.min,"max":self.max})
    }
}

#[derive(Default)]
pub(super) struct Motion {
    player_speed: Range,
    player_laps: Range,
    inputs: BTreeMap<&'static str, Range>,
    moving_opponents: BTreeSet<u32>,
    opponents_max_speed_mps: f64,
    opponent_moving_samples: u64,
    identity_limit_reached: bool,
}
impl Motion {
    pub(super) fn observe(&mut self, snapshot: &Snapshot) {
        let player = snapshot.state.player.as_ref();
        if let Some(player) = player {
            let t = &player.telemetry;
            self.player_speed.observe(&t.speed_mps);
            for (key, value) in [
                ("throttle", &t.throttle),
                ("brake", &t.brake),
                ("clutch", &t.clutch),
                ("steering", &t.steering),
            ] {
                self.inputs.entry(key).or_default().observe(value);
            }
        }
        for car in &snapshot.state.cars {
            if player.is_some_and(|p| p.car == car.id) {
                if let Quality::Reliable(laps) = car.laps {
                    self.player_laps
                        .observe(&Quality::Reliable(f64::from(laps)));
                }
            } else if let Quality::Reliable([x, y]) = car.velocity_mps {
                let speed = x.hypot(y);
                if speed.is_finite() {
                    self.opponents_max_speed_mps = self.opponents_max_speed_mps.max(speed);
                    if speed > 0.1 {
                        self.opponent_moving_samples += 1;
                        // Memoria independiente de duración/rotación de parrilla.
                        if self.moving_opponents.len() < 512 {
                            self.moving_opponents.insert(car.id.0);
                        } else if !self.moving_opponents.contains(&car.id.0) {
                            self.identity_limit_reached = true;
                        }
                    }
                }
            }
        }
    }
    pub(super) fn report(&self) -> Value {
        let inputs: BTreeMap<_, _> = self.inputs.iter().map(|(k, v)| (*k, v.report())).collect();
        json!({"player_speed_mps":self.player_speed.report(),"player_completed_laps":self.player_laps.report(),
            "player_inputs":inputs,"opponents_max_speed_mps":self.opponents_max_speed_mps,
            "opponent_moving_samples":self.opponent_moving_samples,"moving_opponent_ids":self.moving_opponents.len(),
            "identity_limit_reached":self.identity_limit_reached,
            "note":"Solo valores Reliable del DTO; umbral IA >0.1 m/s. Contar fotos no cuenta muestras independientes del simulador. No acredita conducción del jugador ni transiciones."})
    }
}

#[test]
fn moving_opponents_do_not_prove_player_driving_and_stale_is_not_motion_evidence() {
    use vantare_domain::{Car, CarId, Player, Telemetry};
    let mut snapshot = Snapshot::default();
    snapshot.state.player = Some(Player {
        car: CarId(1),
        telemetry: Telemetry {
            speed_mps: Quality::Reliable(0.0),
            throttle: Quality::Reliable(0.0),
            ..Telemetry::default()
        },
        ..Player::default()
    });
    snapshot.state.cars = vec![
        Car {
            id: CarId(1),
            laps: Quality::Reliable(0),
            ..Car::default()
        },
        Car {
            id: CarId(2),
            velocity_mps: Quality::Reliable([3.0, 4.0]),
            ..Car::default()
        },
        Car {
            id: CarId(3),
            velocity_mps: Quality::Stale([30.0, 40.0]),
            ..Car::default()
        },
    ];
    let mut motion = Motion::default();
    motion.observe(&snapshot);
    let report = motion.report();
    assert_eq!(report["player_speed_mps"]["max"], 0.0);
    assert_eq!(report["player_completed_laps"]["max"], 0.0);
    assert_eq!(report["moving_opponent_ids"], 1);
    assert_eq!(report["opponents_max_speed_mps"], 5.0);
    assert_eq!(Range::default().report()["min"], Value::Null);
}
