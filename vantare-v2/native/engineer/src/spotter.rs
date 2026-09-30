//! Geometría Go portada sobre los ejes neutrales del radar (ahead/right).
//! Poses fiables y vectores actuales: nativos o estimados por el adaptador.
//! Nunca se estima velocidad desde las fotos coalescidas del consumidor.

use crate::radio::Intent;
use vantare_domain::{Quality, Snapshot, SourceState};

/// Ocupación actual; el ACK de presentación conserva la histéresis geométrica.
pub fn evaluate(snapshot: &Snapshot, existing: Option<Intent>) -> Option<Intent> {
    if snapshot.state.source_state != SourceState::Live {
        return None;
    }
    let player = snapshot.state.player.as_ref()?;
    let car = snapshot.state.player_car()?;
    let (
        Quality::Reliable(pose),
        Quality::Reliable([vx, vy]) | Quality::Estimated([vx, vy]),
        Quality::Reliable(false),
        Quality::Reliable(speed),
    ) = (
        car.pose,
        car.velocity_mps,
        car.in_pits,
        player.telemetry.speed_mps,
    )
    else {
        return None;
    };
    if !speed.is_finite()
        || speed < 10.0
        || vx.hypot(vy) < 10.0
        || ![pose.x_m, pose.y_m, pose.yaw_rad, vx, vy]
            .iter()
            .all(|v| v.is_finite())
    {
        return None;
    }
    let (sin, cos) = pose.yaw_rad.sin_cos();
    let (mut left, mut right) = (false, false);
    for rival in &snapshot.state.cars {
        if rival.id == car.id {
            continue;
        }
        let (
            Quality::Reliable(position),
            Quality::Reliable([rx, ry]) | Quality::Estimated([rx, ry]),
            Quality::Reliable(false),
        ) = (rival.pose, rival.velocity_mps, rival.in_pits)
        else {
            continue;
        };
        if ![position.x_m, position.y_m, rx, ry]
            .iter()
            .all(|v| v.is_finite())
        {
            continue;
        }
        let dx = position.x_m - pose.x_m;
        let dy = position.y_m - pose.y_m;
        let ahead = dx * cos + dy * sin;
        let across = dx * sin - dy * cos;
        let occupied = matches!(
            (existing, across < 0.0),
            (Some(Intent::ThreeWide), _)
                | (Some(Intent::CarLeft), true)
                | (Some(Intent::CarRight), false)
        );
        // Umbral Go: diferencia estrictamente menor de 12 m/s por componente
        // en el mundo. La histéresis conserva un solape ya comunicado.
        if !occupied && ((vx - rx).abs() >= 12.0 || (vy - ry).abs() >= 12.0) {
            continue;
        }
        match classify_position(ahead, across, occupied) {
            Some(Side::Left) => left = true,
            Some(Side::Right) => right = true,
            None => {}
        }
    }
    match (left, right) {
        (true, true) => Some(Intent::ThreeWide),
        (true, false) => Some(Intent::CarLeft),
        (false, true) => Some(Intent::CarRight),
        (false, false) => None,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Left,
    Right,
}

pub fn classify_position(ahead_m: f64, right_m: f64, existing_overlap: bool) -> Option<Side> {
    if !ahead_m.is_finite() || !right_m.is_finite() || right_m.abs() <= 1.8 || right_m.abs() > 20.0
    {
        return None;
    }
    let length = if existing_overlap {
        5.0
    } else if ahead_m > 0.0 {
        4.9
    } else {
        4.5
    };
    if ahead_m.abs() >= length {
        return None;
    }
    Some(if right_m < 0.0 {
        Side::Left
    } else {
        Side::Right
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        Applied,
        radio::{Families, Locale, Message, Queue},
        worker::RadioWorker,
    };
    use std::time::Duration;
    use vantare_domain::{Car, CarId, Player, Pose, Telemetry};

    fn photo() -> Snapshot {
        let mut s = Snapshot {
            epoch: 1,
            sequence: 1,
            ..Snapshot::default()
        };
        s.state.source_state = SourceState::Live;
        s.state.player = Some(Player {
            car: CarId(1),
            telemetry: Telemetry {
                speed_mps: Quality::Reliable(40.0),
                ..Telemetry::default()
            },
            ..Player::default()
        });
        s.state.cars = vec![
            Car {
                id: CarId(1),
                pose: Quality::Reliable(Pose::default()),
                velocity_mps: Quality::Reliable([40.0, 0.0]),
                in_pits: Quality::Reliable(false),
                ..Car::default()
            },
            Car {
                id: CarId(2),
                pose: Quality::Reliable(Pose {
                    y_m: 3.0,
                    ..Pose::default()
                }),
                velocity_mps: Quality::Reliable([40.0, 0.0]),
                in_pits: Quality::Reliable(false),
                ..Car::default()
            },
        ];
        s
    }

    #[test]
    fn left_right_three_wide_and_rotated_player_use_world_axes() {
        let mut s = photo();
        assert_eq!(evaluate(&s, None), Some(Intent::CarLeft));
        s.state.cars[1].pose = Quality::Reliable(Pose {
            y_m: -3.0,
            ..Pose::default()
        });
        assert_eq!(evaluate(&s, None), Some(Intent::CarRight));
        let mut rival = s.state.cars[1].clone();
        rival.id = CarId(3);
        rival.pose = Quality::Reliable(Pose {
            y_m: 3.0,
            ..Pose::default()
        });
        s.state.cars.push(rival);
        assert_eq!(evaluate(&s, None), Some(Intent::ThreeWide));
        s.state.cars.pop();
        s.state.cars[0].pose = Quality::Reliable(Pose {
            yaw_rad: std::f64::consts::FRAC_PI_2,
            ..Pose::default()
        });
        s.state.cars[1].pose = Quality::Reliable(Pose {
            x_m: -3.0,
            ..Pose::default()
        });
        assert_eq!(evaluate(&s, None), Some(Intent::CarLeft));
    }

    #[test]
    fn closing_filter_is_strict_in_each_world_component_and_overlap_has_hysteresis() {
        let mut s = photo();
        for velocity in [[28.0, 0.0], [40.0, 12.0], [52.0, 0.0], [40.0, -12.0]] {
            s.state.cars[1].velocity_mps = Quality::Reliable(velocity);
            assert_eq!(evaluate(&s, None), None);
        }
        s.state.cars[1].velocity_mps = Quality::Reliable([28.1, 11.9]);
        assert_eq!(evaluate(&s, None), Some(Intent::CarLeft));
        s.state.cars[1].pose = Quality::Reliable(Pose {
            x_m: 4.95,
            y_m: 3.0,
            ..Pose::default()
        });
        assert_eq!(evaluate(&s, None), None);
        assert_eq!(evaluate(&s, Some(Intent::CarLeft)), Some(Intent::CarLeft));
    }

    #[test]
    fn unavailable_stale_pit_and_low_speed_do_not_announce() {
        for index in [0, 1] {
            for q in [
                Quality::Unavailable,
                Quality::Estimated([f64::NAN, 0.0]),
                Quality::Stale([40.0, 0.0]),
                Quality::Reliable([f64::NAN, 0.0]),
            ] {
                let mut s = photo();
                s.state.cars[index].velocity_mps = q;
                assert_eq!(evaluate(&s, Some(Intent::CarLeft)), None);
            }
            let mut s = photo();
            s.state.cars[index].in_pits = Quality::Reliable(true);
            assert_eq!(evaluate(&s, None), None);
            s.state.cars[index].in_pits = Quality::Unavailable;
            assert_eq!(evaluate(&s, None), None);
        }
        let mut s = photo();
        s.state
            .player
            .as_mut()
            .expect("jugador")
            .telemetry
            .speed_mps = Quality::Reliable(9.9);
        assert_eq!(evaluate(&s, None), None);
        let mut s = photo();
        s.state.source_state = SourceState::Stale;
        assert_eq!(evaluate(&s, None), None);
    }

    #[test]
    fn estimated_vectors_announce_but_other_estimated_evidence_does_not() {
        let mut s = photo();
        for c in &mut s.state.cars {
            c.velocity_mps = Quality::Estimated([40.0, 0.0]);
        }
        assert_eq!(evaluate(&s, None), Some(Intent::CarLeft));
        for index in [0, 1] {
            let mut missing = s.clone();
            missing.state.cars[index].velocity_mps = Quality::Stale([40.0, 0.0]);
            assert_eq!(evaluate(&missing, Some(Intent::CarLeft)), None);
            missing = s.clone();
            missing.state.cars[index].pose =
                Quality::Estimated(*missing.state.cars[index].pose.current().expect("pose"));
            assert_eq!(evaluate(&missing, None), None);
            missing = s.clone();
            missing.state.cars[index].in_pits = Quality::Estimated(false);
            assert_eq!(evaluate(&missing, None), None);
        }
    }

    #[test]
    fn ack_deduplicates_and_queue_revalidates_quality_and_epoch() {
        let mut s = photo();
        let mut families = Families::default();
        let (messages, _) = families.evaluate(&s, &Applied::default(), Locale::Es, Duration::ZERO);
        assert_eq!(messages.len(), 1);
        families.started(&messages[0]);
        s.sequence += 1;
        assert!(
            families
                .evaluate(&s, &Applied::default(), Locale::Es, Duration::ZERO)
                .0
                .is_empty()
        );
        let mut queue = Queue::default();
        assert!(queue.submit(messages[0].clone()));
        s.state.cars[1].velocity_mps = Quality::Unavailable;
        queue.refresh(&s);
        assert!(queue.select(Duration::ZERO).is_none());
        s = photo();
        let message =
            Message::new(Intent::CarLeft, Locale::Es, &s, Duration::ZERO).expect("mensaje");
        s.epoch += 1;
        assert!(!message.is_current(&s));
    }

    #[test]
    fn worker_delivers_spotter_without_audio_and_retires_missing_evidence() {
        let mut s = photo();
        for car in &mut s.state.cars {
            car.velocity_mps = Quality::Estimated([40.0, 0.0]);
        }
        let mut worker = RadioWorker::new(Locale::Es, None).expect("worker");
        let mut out = Vec::new();
        worker
            .ingest(&s, &Applied::default(), Duration::ZERO, &mut out)
            .expect("radio");
        let lines: Vec<serde_json::Value> = std::str::from_utf8(&out)
            .expect("UTF8")
            .lines()
            .map(|v| serde_json::from_str(v).expect("JSON"))
            .collect();
        assert!(
            lines
                .iter()
                .any(|v| v["intent"] == "spotter.car_left" && v["voice"] == "disabled")
        );
        out.clear();
        s.sequence += 1;
        worker
            .ingest(&s, &Applied::default(), Duration::from_millis(1), &mut out)
            .expect("estable");
        assert!(out.is_empty());
        s.sequence += 1;
        s.state.cars[1].velocity_mps = Quality::Unavailable;
        worker
            .ingest(&s, &Applied::default(), Duration::from_millis(2), &mut out)
            .expect("retirar");
        assert!(
            std::str::from_utf8(&out)
                .expect("UTF8")
                .contains("\"clear\":true")
        );
    }
}
