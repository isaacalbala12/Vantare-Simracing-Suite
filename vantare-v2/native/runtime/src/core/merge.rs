//! Fusión pura (sin I/O) de una observación con el snapshot previo, más las
//! derivaciones que necesitan memoria entre fotos (combustible y delta).

use std::collections::HashSet;
use std::mem;

use vantare_domain::{
    Capabilities, Capability, Car, CarId, Damage, Fuel, Gap, Observation, Player, Pose, Quality,
    Session, SessionId, Snapshot, State, Telemetry, Weather,
};

use super::derive::derive;
use super::{delta, fuel};

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
    trackers: &mut Trackers,
) -> Result<Snapshot, Reject> {
    let Observation { origin, mut state } = observation;
    let mut seen = HashSet::with_capacity(state.cars.len());
    if let Some(car) = state.cars.iter().find(|car| !seen.insert(car.id)) {
        return Err(Reject::DuplicateCar(car.id));
    }
    sanitize(&mut state);
    derive(&mut state);
    trackers.derive(&mut state);
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

/// Derivaciones con memoria entre fotos: combustible y delta del jugador. El
/// estado no vive en `domain` porque no es una señal publicada, sino la
/// memoria de la derivación; lo posee el único escritor.
#[derive(Debug, Default)]
pub(super) struct Trackers {
    /// Sesión y coche de los que son los datos acumulados.
    identity: Option<(SessionId, CarId)>,
    fuel: fuel::Tracker,
    delta: delta::Tracker,
}

impl Trackers {
    fn derive(&mut self, state: &mut State) {
        let identity = state
            .player
            .as_ref()
            .map(|player| (state.session.id, player.car));
        if let Some(identity) = identity {
            if self.identity != Some(identity) {
                // Sesión o coche del jugador nuevos: nada es comparable.
                self.fuel.reset();
                self.delta.reset();
            }
            self.identity = Some(identity);
        }
        let State { cars, player, .. } = state;
        let Some(player) = player.as_mut() else {
            self.fuel.invalidate();
            self.delta.invalidate();
            return;
        };
        let Some(car) = cars.iter().find(|car| car.id == player.car) else {
            self.fuel.invalidate();
            self.delta.invalidate();
            return;
        };
        self.fuel.derive(player, car);
        self.delta.derive(player, car);
    }
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
        fuel,
        delta,
        sectors,
        lap_progress,
        weather,
        damage,
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
        fuel,
        delta,
        sectors,
        lap_progress,
        weather,
        damage,
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
        laps_total,
        track_length_m,
        weather,
    } = session;
    make_stale(kind);
    make_stale(state);
    make_stale(elapsed_s);
    make_stale(remaining_s);
    make_stale(track_name);
    make_stale(laps_remaining);
    make_stale(laps_total);
    make_stale(track_length_m);
    degrade_weather(weather);
    make_stale(flags);
    cars.iter_mut().for_each(degrade_car);
    if let Some(player) = player {
        degrade_player(player);
    }
}

fn degrade_car(car: &mut Car) {
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
        gap_class_leader,
        gap_class_ahead,
        lap_distance_m,
        lap_elapsed_s,
        current_sector,
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
    make_stale(gap_class_leader);
    make_stale(gap_class_ahead);
    make_stale(lap_distance_m);
    make_stale(lap_elapsed_s);
    make_stale(current_sector);
    make_stale(in_pits);
    make_stale(pose);
}

fn degrade_player(player: &mut Player) {
    let Player {
        car: _,
        telemetry,
        fuel,
        damage,
        delta_best_s,
    } = player;
    let Telemetry {
        throttle,
        brake,
        clutch,
        gear,
        speed_mps,
        engine_speed_rad_s,
    } = telemetry;
    make_stale(throttle);
    make_stale(brake);
    make_stale(clutch);
    make_stale(gear);
    make_stale(speed_mps);
    make_stale(engine_speed_rad_s);
    let Fuel {
        level_l,
        capacity_l,
        per_lap_l,
        laps_left,
    } = fuel;
    make_stale(level_l);
    make_stale(capacity_l);
    make_stale(per_lap_l);
    make_stale(laps_left);
    make_stale(delta_best_s);
    let Damage {
        aero,
        body,
        suspension,
        tyre_wear,
    } = damage;
    make_stale(aero);
    make_stale(body);
    make_stale(suspension);
    tyre_wear.iter_mut().for_each(make_stale);
}

fn degrade_weather(weather: &mut Weather) {
    let Weather {
        air_temperature_k,
        track_temperature_k,
        wind_speed_mps,
        wind_direction_rad,
        rain,
        track_wetness,
        pressure_pa,
    } = weather;
    make_stale(air_temperature_k);
    make_stale(track_temperature_k);
    make_stale(wind_speed_mps);
    make_stale(wind_direction_rad);
    make_stale(rain);
    make_stale(track_wetness);
    make_stale(pressure_pa);
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
    finite(&mut session.track_length_m);
    sanitize_weather(&mut session.weather);
    for car in &mut state.cars {
        finite(&mut car.last_lap_s);
        finite(&mut car.best_lap_s);
        car.last_sectors_s.iter_mut().for_each(finite);
        keep_if(&mut car.gap_leader, finite_gap);
        keep_if(&mut car.gap_ahead, finite_gap);
        keep_if(&mut car.gap_class_leader, finite_gap);
        keep_if(&mut car.gap_class_ahead, finite_gap);
        finite(&mut car.lap_distance_m);
        finite(&mut car.lap_elapsed_s);
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
        finite(&mut player.fuel.level_l);
        finite(&mut player.fuel.capacity_l);
        finite(&mut player.fuel.per_lap_l);
        finite(&mut player.fuel.laps_left);
        finite(&mut player.delta_best_s);
        let Damage {
            aero,
            body,
            suspension,
            tyre_wear,
        } = &mut player.damage;
        fraction(aero);
        fraction(body);
        fraction(suspension);
        tyre_wear.iter_mut().for_each(fraction);
    }
}

fn sanitize_weather(weather: &mut Weather) {
    let Weather {
        air_temperature_k,
        track_temperature_k,
        wind_speed_mps,
        wind_direction_rad,
        rain,
        track_wetness,
        pressure_pa,
    } = weather;
    for quality in [
        air_temperature_k,
        track_temperature_k,
        wind_speed_mps,
        pressure_pa,
    ] {
        keep_if(quality, |v| v.is_finite() && *v >= 0.0);
    }
    keep_if(wind_direction_rad, |v| {
        (0.0..std::f64::consts::TAU).contains(v)
    });
    fraction(rain);
    fraction(track_wetness);
}

fn fraction(quality: &mut Quality<f64>) {
    keep_if(quality, |v| (0.0..=1.0).contains(v));
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
            in_pits: Quality::Reliable(false),
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
        let mut trackers = Trackers::default();
        let mut obs = observation(vec![car(1, 1)]);
        obs.origin.source = Source {
            simulator: "test",
            ..Source::default()
        };
        let first = merge(None, obs.clone(), 7, &mut trackers).unwrap();
        assert_eq!((first.epoch, first.sequence), (7, 1));
        assert_eq!(first.origin, obs.origin);
        let second = merge(Some(&first), obs.clone(), 7, &mut trackers).unwrap();
        assert_eq!(second.sequence, 2);
        let old = stale(&second);
        assert_eq!(old.sequence, 3, "la bajada a obsoleto comparte contador");
        assert_eq!(
            merge(Some(&old), obs.clone(), 7, &mut trackers)
                .unwrap()
                .sequence,
            4
        );
        // Época nueva: la secuencia vuelve a 1.
        assert_eq!(
            merge(Some(&old), obs, 8, &mut trackers).unwrap().sequence,
            1
        );
    }

    #[test]
    fn duplicate_cars_are_rejected() {
        let obs = observation(vec![car(1, 1), car(2, 2), car(1, 3)]);
        assert_eq!(
            merge(None, obs, 1, &mut Trackers::default()),
            Err(Reject::DuplicateCar(CarId(1)))
        );
    }

    #[test]
    fn session_change_carries_nothing_over() {
        let mut trackers = Trackers::default();
        let mut first = observation(vec![car(1, 1)]);
        first.state.session.id = SessionId(1);
        first.state.cars[0].last_lap_s = Quality::Reliable(90.0);
        let before = merge(None, first, 1, &mut trackers).unwrap();
        let mut next = observation(vec![car(1, 1)]);
        next.state.session.id = SessionId(2);
        let after = merge(Some(&before), next, 1, &mut trackers).unwrap();
        assert_eq!(after.sequence, 2, "misma época, sesión nueva");
        assert_eq!(after.state.cars[0].last_lap_s, Quality::Unavailable);
    }

    #[test]
    fn accumulated_trackers_reset_on_session_or_player_change() {
        let mut trackers = Trackers::default();
        let mut first = observation(vec![car(1, 1)]);
        first.state.session.id = SessionId(1);
        first.state.cars[0].laps = Quality::Reliable(1);
        first.state.player = Some(Player {
            car: CarId(1),
            fuel: Fuel {
                level_l: Quality::Reliable(100.0),
                ..Fuel::default()
            },
            ..Player::default()
        });
        merge(None, first.clone(), 1, &mut trackers).unwrap();
        let mut second = first.clone();
        second.state.cars[0].laps = Quality::Reliable(2);
        second.state.player.as_mut().unwrap().fuel.level_l = Quality::Reliable(96.0);
        let snapshot = merge(None, second, 1, &mut trackers).unwrap();
        assert_eq!(
            snapshot.state.player.unwrap().fuel.per_lap_l,
            Quality::Estimated(4.0),
            "misma sesión: la vuelta medida se conserva"
        );

        let mut other_session = first.clone();
        other_session.state.session.id = SessionId(2);
        let snapshot = merge(None, other_session, 1, &mut trackers).unwrap();
        assert_eq!(
            snapshot.state.player.unwrap().fuel.per_lap_l,
            Quality::Unavailable,
            "sesión nueva: la memoria se descarta"
        );

        let mut other_car = first;
        other_car.state.player.as_mut().unwrap().car = CarId(2);
        other_car.state.cars.push(car(2, 2));
        let snapshot = merge(None, other_car, 1, &mut trackers).unwrap();
        assert_eq!(
            snapshot.state.player.unwrap().fuel.per_lap_l,
            Quality::Unavailable,
            "coche de jugador nuevo: la memoria se descarta"
        );
    }

    #[test]
    fn weather_and_damage_defaults_are_unavailable() {
        let mut obs = observation(vec![car(1, 1)]);
        obs.state.player = Some(Player::default());
        let snapshot = merge(None, obs, 1, &mut Trackers::default()).unwrap();
        assert_eq!(snapshot.state.session.weather, Weather::default());
        assert_eq!(snapshot.state.player.unwrap().damage, Damage::default());
        assert_eq!(snapshot.state.capabilities.weather, Capability::Unsupported);
        assert_eq!(snapshot.state.capabilities.damage, Capability::Unsupported);
    }

    fn weather_with(value: Quality<f64>) -> Weather {
        Weather {
            air_temperature_k: value,
            track_temperature_k: value,
            wind_speed_mps: value,
            wind_direction_rad: value,
            rain: value,
            track_wetness: value,
            pressure_pa: value,
        }
    }

    fn damage_with(value: Quality<f64>) -> Damage {
        Damage {
            aero: value,
            body: value,
            suspension: value,
            tyre_wear: [value; 4],
        }
    }

    #[test]
    fn weather_and_damage_degrade_all_fields_without_losing_values() {
        for quality in [
            Quality::Reliable(0.5),
            Quality::Estimated(0.5),
            Quality::Stale(0.5),
            Quality::Unavailable,
        ] {
            let mut obs = observation(vec![car(1, 1)]);
            obs.state.capabilities.weather = Capability::Fresh;
            obs.state.capabilities.damage = Capability::Fresh;
            obs.state.session.weather = weather_with(quality);
            obs.state.player = Some(Player {
                damage: damage_with(quality),
                ..Player::default()
            });
            let fresh = merge(None, obs, 1, &mut Trackers::default()).unwrap();
            let old = stale(&fresh);
            let expected = match quality {
                Quality::Unavailable => Quality::Unavailable,
                _ => Quality::Stale(0.5),
            };
            assert_eq!(old.state.session.weather, weather_with(expected));
            assert_eq!(old.state.player.unwrap().damage, damage_with(expected));
            assert_eq!(old.state.capabilities.weather, Capability::WithData);
            assert_eq!(old.state.capabilities.damage, Capability::WithData);
            assert_eq!(fresh.state.session.weather, weather_with(quality));
            assert_eq!(fresh.state.player.unwrap().damage, damage_with(quality));
        }
    }

    #[test]
    fn invalid_weather_and_damage_are_absent_in_every_quality() {
        for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, -1.0] {
            for quality in [
                Quality::Reliable(value),
                Quality::Estimated(value),
                Quality::Stale(value),
            ] {
                let mut obs = observation(vec![car(1, 1)]);
                obs.state.session.weather = weather_with(quality);
                obs.state.player = Some(Player {
                    damage: damage_with(quality),
                    ..Player::default()
                });
                let snapshot = merge(None, obs, 1, &mut Trackers::default()).unwrap();
                assert_eq!(snapshot.state.session.weather, Weather::default());
                assert_eq!(snapshot.state.player.unwrap().damage, Damage::default());
            }
        }
    }

    #[test]
    fn weather_and_damage_bounds_reject_without_clamping() {
        for value in [0.0, 1.0, 1.01] {
            let quality = Quality::Reliable(value);
            let mut obs = observation(vec![car(1, 1)]);
            obs.state.session.weather = weather_with(quality);
            obs.state.player = Some(Player {
                damage: damage_with(quality),
                ..Player::default()
            });
            let snapshot = merge(None, obs, 1, &mut Trackers::default()).unwrap();
            let expected = if value <= 1.0 {
                quality
            } else {
                Quality::Unavailable
            };
            let weather = snapshot.state.session.weather;
            assert_eq!(weather.rain, expected);
            assert_eq!(weather.track_wetness, expected);
            assert_eq!(weather.air_temperature_k, quality);
            assert_eq!(weather.track_temperature_k, quality);
            assert_eq!(weather.wind_speed_mps, quality);
            assert_eq!(weather.wind_direction_rad, quality);
            assert_eq!(weather.pressure_pa, quality);
            assert_eq!(snapshot.state.player.unwrap().damage, damage_with(expected));
        }
        for value in [std::f64::consts::TAU, 7.0] {
            let mut weather = weather_with(Quality::Reliable(0.5));
            weather.wind_direction_rad = Quality::Reliable(value);
            sanitize_weather(&mut weather);
            assert_eq!(weather.wind_direction_rad, Quality::Unavailable);
            assert_eq!(weather.rain, Quality::Reliable(0.5));
        }
    }

    #[test]
    fn non_finite_numbers_become_unavailable() {
        let mut trackers = Trackers::default();
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
            ..Player::default()
        });
        let snapshot = merge(None, obs, 1, &mut trackers).unwrap();
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
        let mut trackers = Trackers::default();
        let mut obs = observation(vec![car(1, 1), car(2, 2)]);
        obs.state.cars[1].gap_leader = Quality::Reliable(Gap::Time { seconds: 4.0 });
        let snapshot = merge(None, obs, 1, &mut trackers).unwrap();
        assert_eq!(
            snapshot.state.cars[1].gap_ahead,
            Quality::Estimated(Gap::Time { seconds: 4.0 })
        );
    }

    #[test]
    fn stale_downgrades_current_data_and_capabilities_only() {
        let mut trackers = Trackers::default();
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
            ..Player::default()
        });
        let fresh = merge(None, obs, 1, &mut trackers).unwrap();
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
