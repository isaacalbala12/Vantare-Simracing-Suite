//! Fusión pura (sin I/O) de una observación con el snapshot previo.

use std::collections::HashSet;
use std::mem;

use vantare_domain::{
    Capabilities, Capability, Car, CarId, Gap, Observation, Pose, Quality, Session, Snapshot,
    State, Telemetry,
};

use super::derive::derive;

/// Observación que el núcleo no admite: no se publica y la revisión no avanza.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reject {
    /// Dos coches con el mismo id: las búsquedas por id serían ambiguas.
    DuplicateCar(CarId),
}

impl std::fmt::Display for Reject {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateCar(id) => write!(f, "coche duplicado: {}", id.0),
        }
    }
}

impl std::error::Error for Reject {}

/// Valida, sanea, deriva y numera. Numeración única: `sequence` cuenta todo lo
/// que se publica (observaciones y bajadas a obsoleto) de uno en uno dentro de
/// una `epoch`; `origin` se conserva.
///
/// Fusión mínima: no arrastra valores del snapshot previo. Cada observación es
/// el estado completo que declara el adaptador, así que un cambio de
/// `session.id` (sesión nueva del mismo productor) no puede heredar nada.
pub(super) fn merge(
    previous: Option<&Snapshot>,
    observation: Observation,
    epoch: u64,
) -> Result<Snapshot, Reject> {
    let Observation { origin, mut state } = observation;
    let mut seen = HashSet::with_capacity(state.cars.len());
    if let Some(car) = state.cars.iter().find(|car| !seen.insert(car.id)) {
        return Err(Reject::DuplicateCar(car.id));
    }
    sanitize(&mut state);
    derive(&mut state.cars);
    let sequence = match previous {
        Some(previous) if previous.epoch == epoch => previous.sequence + 1,
        _ => 1,
    };
    Ok(Snapshot {
        epoch,
        sequence,
        origin,
        state,
    })
}

/// Mismo contenido, siguiente revisión, con todo lo actual degradado a
/// obsoleto. Se publica cuando la fuente calla o se pierde.
pub(super) fn stale(previous: &Snapshot) -> Snapshot {
    let mut next = previous.clone();
    next.sequence += 1;
    degrade(&mut next.state);
    next
}

/// Lo actual pasa a obsoleto: los valores siguen ahí, ya no son "actuales".
///
/// Desestructura cada tipo sin `..`: una señal nueva en `domain` no compila
/// hasta que se decide aquí cómo se vuelve obsoleta.
pub(super) fn degrade(state: &mut State) {
    let State {
        capabilities,
        session,
        flags,
        cars,
        player,
    } = state;
    let Capabilities {
        session_clock,
        positions,
        lap_times,
        gaps,
        pit_status,
        flags: flags_capability,
        spatial,
        driver_inputs,
        powertrain,
    } = capabilities;
    for capability in [
        session_clock,
        positions,
        lap_times,
        gaps,
        pit_status,
        flags_capability,
        spatial,
        driver_inputs,
        powertrain,
    ] {
        if *capability == Capability::Fresh {
            *capability = Capability::WithData;
        }
    }
    let Session {
        id: _,
        kind,
        state,
        elapsed_s,
        remaining_s,
        track_name,
        laps_remaining,
    } = session;
    make_stale(kind);
    make_stale(state);
    make_stale(elapsed_s);
    make_stale(remaining_s);
    make_stale(track_name);
    make_stale(laps_remaining);
    make_stale(flags);
    for car in cars {
        let Car {
            id: _,
            number: _,
            driver: _,
            class: _,
            position,
            class_position,
            laps,
            last_lap_s,
            best_lap_s,
            last_sectors_s,
            gap_leader,
            gap_ahead,
            in_pits,
            pose,
        } = car;
        make_stale(position);
        make_stale(class_position);
        make_stale(laps);
        make_stale(last_lap_s);
        make_stale(best_lap_s);
        last_sectors_s.iter_mut().for_each(make_stale);
        make_stale(gap_leader);
        make_stale(gap_ahead);
        make_stale(in_pits);
        make_stale(pose);
    }
    if let Some(player) = player {
        let Telemetry {
            throttle,
            brake,
            clutch,
            gear,
            speed_mps,
            engine_speed_rad_s,
        } = &mut player.telemetry;
        make_stale(throttle);
        make_stale(brake);
        make_stale(clutch);
        make_stale(gear);
        make_stale(speed_mps);
        make_stale(engine_speed_rad_s);
    }
}

fn make_stale<T>(quality: &mut Quality<T>) {
    *quality = match mem::take(quality) {
        Quality::Reliable(value) | Quality::Estimated(value) => Quality::Stale(value),
        other => other,
    };
}

/// Frontera de confianza: un `NaN` o infinito del simulador se vuelve ausente,
/// no se propaga a gaps, radar ni formato.
// ponytail: lista explícita de campos numéricos; una señal `f64` nueva hay que
// añadirla aquí (si no, pasa sin sanear). Sustituir por un recorrido común solo
// si las señales numéricas crecen.
fn sanitize(state: &mut State) {
    let session = &mut state.session;
    finite(&mut session.elapsed_s);
    finite(&mut session.remaining_s);
    for car in &mut state.cars {
        finite(&mut car.last_lap_s);
        finite(&mut car.best_lap_s);
        car.last_sectors_s.iter_mut().for_each(finite);
        keep_if(&mut car.gap_leader, finite_gap);
        keep_if(&mut car.gap_ahead, finite_gap);
        keep_if(&mut car.pose, |pose: &Pose| {
            [pose.x_m, pose.y_m, pose.yaw_rad]
                .iter()
                .all(|v| v.is_finite())
        });
    }
    if let Some(player) = &mut state.player {
        let telemetry = &mut player.telemetry;
        finite(&mut telemetry.throttle);
        finite(&mut telemetry.brake);
        finite(&mut telemetry.clutch);
        finite(&mut telemetry.speed_mps);
        finite(&mut telemetry.engine_speed_rad_s);
    }
}

fn finite_gap(gap: &Gap) -> bool {
    !matches!(gap, Gap::Time { seconds } if !seconds.is_finite())
}

fn finite(quality: &mut Quality<f64>) {
    keep_if(quality, |value| value.is_finite());
}

fn keep_if<T>(quality: &mut Quality<T>, ok: impl Fn(&T) -> bool) {
    let (Quality::Reliable(value) | Quality::Estimated(value) | Quality::Stale(value)) = quality
    else {
        return;
    };
    if !ok(value) {
        *quality = Quality::Unavailable;
    }
}

#[cfg(test)]
mod tests {
    use vantare_domain::{Player, SessionId, Source};

    use super::*;

    fn car(id: u32, position: u32) -> Car {
        Car {
            id: CarId(id),
            position: Quality::Reliable(position),
            ..Car::default()
        }
    }

    fn observation(cars: Vec<Car>) -> Observation {
        Observation {
            state: State {
                capabilities: Capabilities {
                    gaps: Capability::Fresh,
                    positions: Capability::Supported,
                    ..Capabilities::default()
                },
                cars,
                ..State::default()
            },
            ..Observation::default()
        }
    }

    #[test]
    fn revision_is_one_counter_per_epoch_and_origin_is_kept() {
        let mut obs = observation(vec![car(1, 1)]);
        obs.origin.source = Source {
            simulator: "test",
            ..Source::default()
        };
        let first = merge(None, obs.clone(), 7).unwrap();
        assert_eq!((first.epoch, first.sequence), (7, 1));
        assert_eq!(first.origin, obs.origin);
        let second = merge(Some(&first), obs.clone(), 7).unwrap();
        assert_eq!(second.sequence, 2);
        let old = stale(&second);
        assert_eq!(old.sequence, 3, "la bajada a obsoleto comparte contador");
        assert_eq!(merge(Some(&old), obs.clone(), 7).unwrap().sequence, 4);
        // Época nueva: la secuencia vuelve a 1.
        assert_eq!(merge(Some(&old), obs, 8).unwrap().sequence, 1);
    }

    #[test]
    fn duplicate_cars_are_rejected() {
        let obs = observation(vec![car(1, 1), car(2, 2), car(1, 3)]);
        assert_eq!(merge(None, obs, 1), Err(Reject::DuplicateCar(CarId(1))));
    }

    #[test]
    fn session_change_carries_nothing_over() {
        let mut first = observation(vec![car(1, 1)]);
        first.state.session.id = SessionId(1);
        first.state.cars[0].last_lap_s = Quality::Reliable(90.0);
        let before = merge(None, first, 1).unwrap();
        let mut next = observation(vec![car(1, 1)]);
        next.state.session.id = SessionId(2);
        let after = merge(Some(&before), next, 1).unwrap();
        assert_eq!(after.sequence, 2, "misma época, sesión nueva");
        assert_eq!(after.state.cars[0].last_lap_s, Quality::Unavailable);
    }

    #[test]
    fn non_finite_numbers_become_unavailable() {
        let mut obs = observation(vec![car(1, 1), car(2, 2)]);
        obs.state.cars[0].last_lap_s = Quality::Reliable(f64::NAN);
        obs.state.cars[0].best_lap_s = Quality::Reliable(91.0);
        obs.state.cars[1].gap_leader = Quality::Reliable(Gap::Time {
            seconds: f64::INFINITY,
        });
        obs.state.cars[1].pose = Quality::Stale(Pose {
            x_m: 0.0,
            y_m: f64::NAN,
            yaw_rad: 0.0,
        });
        obs.state.player = Some(Player {
            car: CarId(1),
            telemetry: Telemetry {
                throttle: Quality::Reliable(f64::NEG_INFINITY),
                brake: Quality::Reliable(0.5),
                ..Telemetry::default()
            },
        });
        let snapshot = merge(None, obs, 1).unwrap();
        let cars = &snapshot.state.cars;
        assert_eq!(cars[0].last_lap_s, Quality::Unavailable);
        assert_eq!(cars[0].best_lap_s, Quality::Reliable(91.0));
        // El gap infinito no se usa para derivar nada.
        assert_eq!(cars[1].gap_leader, Quality::Unavailable);
        assert_eq!(cars[1].pose, Quality::Unavailable);
        let telemetry = snapshot.state.player.unwrap().telemetry;
        assert_eq!(telemetry.throttle, Quality::Unavailable);
        assert_eq!(telemetry.brake, Quality::Reliable(0.5));
    }

    #[test]
    fn merge_derives_before_publishing() {
        let mut obs = observation(vec![car(1, 1), car(2, 2)]);
        obs.state.cars[1].gap_leader = Quality::Reliable(Gap::Time { seconds: 4.0 });
        let snapshot = merge(None, obs, 1).unwrap();
        assert_eq!(
            snapshot.state.cars[1].gap_ahead,
            Quality::Estimated(Gap::Time { seconds: 4.0 })
        );
    }

    #[test]
    fn stale_downgrades_current_data_and_capabilities_only() {
        let mut obs = observation(vec![car(1, 1)]);
        obs.state.cars[0].best_lap_s = Quality::Estimated(90.0);
        obs.state.cars[0].last_sectors_s = vec![Quality::Reliable(30.0), Quality::Unavailable];
        obs.state.flags = Quality::Reliable(Vec::new());
        obs.state.player = Some(Player {
            car: CarId(1),
            telemetry: Telemetry {
                throttle: Quality::Reliable(1.0),
                ..Telemetry::default()
            },
        });
        let fresh = merge(None, obs, 1).unwrap();
        let old = stale(&fresh);
        let state = &old.state;
        assert_eq!(state.capabilities.gaps, Capability::WithData);
        assert_eq!(state.capabilities.positions, Capability::Supported);
        assert_eq!(state.cars[0].position, Quality::Stale(1));
        assert_eq!(state.cars[0].best_lap_s, Quality::Stale(90.0));
        assert_eq!(
            state.cars[0].last_sectors_s,
            [Quality::Stale(30.0), Quality::Unavailable]
        );
        assert_eq!(state.flags, Quality::Stale(Vec::new()));
        assert_eq!(
            state.player.as_ref().unwrap().telemetry.throttle,
            Quality::Stale(1.0)
        );
        assert_eq!(state.cars[0].last_lap_s, Quality::Unavailable);
        assert_eq!(fresh.state.cars[0].position, Quality::Reliable(1));
    }
}
