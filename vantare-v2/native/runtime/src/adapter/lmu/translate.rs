//! De un frame admitido y la caché REST a la `Observation` neutral. Aquí vive
//! todo el estado que el adaptador debe recordar entre lecturas: reloj de
//! frescura, identidad de sesión y de coches, y el REST más reciente.

use std::collections::HashMap;
use std::f64::consts::TAU;
use std::time::Duration;

use vantare_domain::{
    Capabilities, Capability, Car, CarId, Class, ClassId, Damage, Driver, DriverId, Flag, FlagKind,
    FlagScope, Fuel, Gap, Observation, Origin, Player, Quality, Session, SessionId, SessionKind,
    Source, SourceKind, State, Telemetry, Weather,
};

use super::frame::{self, Frame, Inputs, Kind, Rejection, Vehicle};
use super::gate::Gate;
use super::rest;

#[cfg(test)]
#[path = "signals_tests.rs"]
mod signals_tests;

/// Un hueco que reaparece con el mismo piloto y clase dentro de este número de
/// frames es el mismo coche (parpadeo de la parrilla); pasado, es otro.
const SLOT_GRACE_FRAMES: u64 = 30;
/// Tope de identidades de piloto y clase recordadas a la vez. Una carrera
/// legitima no pasa de 104 coches; el margen absorbe entradas y salidas.
const IDENTITY_BUDGET: usize = 512;

/// El reloj de sesión da la vuelta a las 24 h; un retroceso desde ahí a menos
/// de un minuto es ese giro, no una sesión nueva.
const CLOCK_WRAP_FROM: Duration = Duration::from_hours(24);
const CLOCK_WRAP_TO: Duration = Duration::from_mins(1);

struct Slot {
    car: CarId,
    driver: String,
    class: String,
    last_seen: u64,
}

pub(super) struct Translator {
    kind: SourceKind,
    gate: Gate,
    telemetry_gate: Gate,
    last_inputs: Option<Inputs>,
    emitted_telemetry_stale: bool,
    pub(super) rest: rest::Cache,
    /// Última `Observation` publicada con datos caducados.
    emitted_stale: bool,
    emitted_paused: bool,
    session: u64,
    signature: Option<(String, Kind)>,
    last_source_time: Option<Duration>,
    /// Instante del último cambio de sesión: el REST consultado antes no vale.
    floor: Duration,
    frame_count: u64,
    slots: HashMap<i32, Slot>,
    next_car: u32,
    drivers: HashMap<String, DriverId>,
    classes: HashMap<String, ClassId>,
}

impl Translator {
    pub(super) fn new(kind: SourceKind) -> Self {
        Self {
            kind,
            gate: Gate::default(),
            telemetry_gate: Gate::default(),
            last_inputs: None,
            emitted_telemetry_stale: false,
            rest: rest::Cache::default(),
            emitted_stale: false,
            emitted_paused: false,
            session: 0,
            signature: None,
            last_source_time: None,
            floor: Duration::ZERO,
            frame_count: 0,
            slots: HashMap::new(),
            next_car: 0,
            drivers: HashMap::new(),
            classes: HashMap::new(),
        }
    }

    /// El estado publicado dejaría de coincidir con la realidad aunque el
    /// frame no cambie (el reloj del simulador se ha parado o ha vuelto).
    #[cfg(any(windows, test))]
    pub(super) fn needs_refresh(&self, now: Duration) -> bool {
        self.gate.is_stale_at(now) != self.emitted_stale
            || (self.emitted_paused && self.rest.session_alive(now, self.floor).is_none())
            || (self.last_inputs.is_some()
                && self.telemetry_gate.is_stale_at(now) != self.emitted_telemetry_stale)
    }

    pub(super) fn observe(
        &mut self,
        buffer: &[u8],
        build: &str,
        now: Duration,
    ) -> Result<Observation, Rejection> {
        let frame = frame::admit(buffer, build)?;
        // Reanudar una pausa confirmada no es recuperarse de una fuente colgada.
        if self.emitted_paused && frame.source_time != self.last_source_time {
            self.gate = Gate::default();
            let inputs = frame
                .player
                .and_then(|index| frame.vehicles[index].inputs.as_ref());
            if inputs.is_some_and(|inputs| {
                inputs.source_time.is_none()
                    || self
                        .last_inputs
                        .as_ref()
                        .is_none_or(|previous| previous.source_time != inputs.source_time)
            }) {
                self.telemetry_gate = Gate::default();
            }
        }
        let stale = self.gate.observe(now, frame.source_time);
        self.emitted_stale = stale;
        self.track_session(&frame, now, stale);
        let telemetry_stale = self.telemetry_stale(&frame, now);
        // No se deduce pausa de gamePhase/inRealtime: también describen garaje
        // y otras fases. SHM detenido + REST reciente de esta sesión + proceso
        // vivo (comprobado en cada read_stable) es la confirmación disponible.
        let paused = self.kind == SourceKind::Live
            && !frame.vehicles.is_empty()
            && frame.source_time.is_some()
            && self.gate.is_stalled_at(now)
            && self
                .rest
                .session_alive(now, self.floor)
                .is_some_and(|info| {
                    info.kind == frame.kind
                        && info
                            .track
                            .as_ref()
                            .is_none_or(|track| *track == frame.track)
                });
        self.emitted_paused = paused;
        let stale = stale && !paused;
        let telemetry_stale = telemetry_stale && !paused;
        self.frame_count += 1;
        let cars: Vec<Car> = frame
            .vehicles
            .iter()
            .map(|vehicle| {
                let id = self.car_id(vehicle);
                let number = self.car_number(vehicle, now);
                self.car(vehicle, id, number, stale)
            })
            .collect();
        let player = frame.player.map(|index| {
            player(
                &frame.vehicles[index],
                cars[index].id,
                stale,
                telemetry_stale,
            )
        });
        let rest_session = self.rest.session(now, self.floor);
        let flags = flags(rest_session);
        Ok(Observation {
            origin: Origin {
                source: Source {
                    simulator: "lmu",
                    kind: self.kind,
                },
                source_time: frame.source_time,
                received_at: now,
            },
            state: State {
                source_state: if frame.vehicles.is_empty() {
                    vantare_domain::SourceState::Waiting
                } else if paused {
                    vantare_domain::SourceState::Paused
                } else if stale {
                    vantare_domain::SourceState::Stale
                } else {
                    vantare_domain::SourceState::Live
                },
                capabilities: capabilities(
                    &frame,
                    &cars,
                    player.as_ref(),
                    &flags,
                    stale,
                    telemetry_stale,
                ),
                session: self.session(&frame, rest_session, stale),
                flags,
                cars,
                player,
            },
        })
    }

    fn telemetry_stale(&mut self, frame: &Frame, now: Duration) -> bool {
        let inputs = frame
            .player
            .and_then(|index| frame.vehicles[index].inputs.as_ref());
        let Some(inputs) = inputs else {
            self.last_inputs = None;
            self.telemetry_gate = Gate::default();
            self.emitted_telemetry_stale = false;
            return false;
        };
        // El scoring puede avanzar con la telemetría congelada. Usar su reloj
        // propio; sin él (fixtures sanitizados), vigilar el contenido admitido.
        let stale = if inputs.source_time.is_some() {
            self.telemetry_gate.observe(now, inputs.source_time)
        } else {
            self.telemetry_gate
                .observe_change(now, self.last_inputs.as_ref() != Some(inputs))
        };
        self.last_inputs = Some(inputs.clone());
        self.emitted_telemetry_stale = stale;
        stale
    }

    /// Número de carrera del coche, casado por hueco y por etiqueta: si la
    /// etiqueta REST no coincide con la del frame, el hueco se reutilizó.
    fn car_number(&self, vehicle: &Vehicle, now: Duration) -> String {
        self.rest
            .car_numbers(now, self.floor)
            .iter()
            .find(|entry| {
                entry.slot == vehicle.slot
                    && !entry.vehicle.is_empty()
                    && entry.vehicle == vehicle.name.trim()
            })
            .map_or_else(String::new, |entry| entry.number.clone())
    }

    /// Nueva sesión si el circuito o el tipo cambian con datos frescos, o si el
    /// reloj de sesión retrocede.
    fn track_session(&mut self, frame: &Frame, now: Duration, stale: bool) {
        let reset = match (self.last_source_time, frame.source_time) {
            (Some(previous), Some(current)) if previous > Duration::ZERO && current < previous => {
                !(previous >= CLOCK_WRAP_FROM && current < CLOCK_WRAP_TO)
            }
            _ => false,
        };
        if frame.source_time.is_some() {
            self.last_source_time = frame.source_time;
        }
        let signature = frame
            .kind
            .filter(|_| !stale && !frame.track.is_empty())
            .map(|kind| (frame.track.clone(), kind));
        let changed = signature
            .as_ref()
            .is_some_and(|new| self.signature.as_ref().is_some_and(|old| old != new));
        if signature.is_some() {
            self.signature = signature;
        }
        if self.session == 0 || reset || changed {
            if self.session > 0 {
                self.floor = now;
            }
            self.session += 1;
            self.frame_count = 0;
            self.slots.clear();
            // Las identidades de piloto y clase son POR SESION. Sin limpiarlas
            // aqui, los mapas crecian durante toda la vida del proceso: quien
            // pueda escribir la memoria del simulador acuna hasta MAX_VEHICLES
            // nombres nuevos por fotograma, a 60 Hz.
            self.drivers.clear();
            self.classes.clear();
        }
    }

    fn car_id(&mut self, vehicle: &Vehicle) -> CarId {
        let frame_no = self.frame_count;
        if let Some(slot) = self.slots.get_mut(&vehicle.slot) {
            let gap = frame_no.wrapping_sub(slot.last_seen);
            let same_car = slot.driver == vehicle.driver && slot.class == vehicle.class;
            // Continuo: el mismo coche aunque cambie el piloto (relevo).
            if gap > 1 && !(gap <= SLOT_GRACE_FRAMES + 1 && same_car) {
                self.next_car += 1;
                slot.car = CarId(self.next_car);
            }
            slot.driver.clone_from(&vehicle.driver);
            slot.class.clone_from(&vehicle.class);
            slot.last_seen = frame_no;
            return slot.car;
        }
        self.next_car += 1;
        let car = CarId(self.next_car);
        self.slots.insert(
            vehicle.slot,
            Slot {
                car,
                driver: vehicle.driver.clone(),
                class: vehicle.class.clone(),
                last_seen: frame_no,
            },
        );
        car
    }

    fn car(&mut self, vehicle: &Vehicle, id: CarId, number: String, stale: bool) -> Car {
        // Tope de identidades recordadas. Una carrera legitima no pasa de
        // `frame::MAX_VEHICLES` pilotos; el margen absorbe entradas y salidas.
        // Sin tope, quien escriba la memoria del simulador acuna un nombre
        // nuevo por coche y fotograma y el mapa crece durante toda la sesion.
        // Al agotarse se vacia: solo pierde estabilidad de id quien esta
        // excediendo el maximo de coches de una carrera real.
        if self.drivers.len() >= IDENTITY_BUDGET {
            self.drivers.clear();
            self.classes.clear();
        }
        let next_driver = self.drivers.len();
        let driver = *self
            .drivers
            .entry(vehicle.driver.clone())
            .or_insert(DriverId(u32::try_from(next_driver).unwrap_or(u32::MAX)));
        let class = (!vehicle.class.is_empty()).then(|| {
            let next_class = self.classes.len();
            Class {
                id: *self
                    .classes
                    .entry(vehicle.class.clone())
                    .or_insert(ClassId(u32::try_from(next_class).unwrap_or(u32::MAX))),
                name: vehicle.class.clone(),
            }
        });
        let gap = |seconds: Option<f64>, laps: u32| {
            if laps > 0 {
                Some(Gap::Laps { count: laps })
            } else {
                seconds.map(|seconds| Gap::Time { seconds })
            }
        };
        Car {
            id,
            number,
            driver: Driver {
                id: driver,
                name: vehicle.driver.clone(),
            },
            class,
            position: quality(Some(vehicle.position), stale),
            // LMU no la trae en el frame: la deriva el núcleo con posición y clase.
            class_position: Quality::Unavailable,
            laps: quality(Some(vehicle.laps), stale),
            last_lap_s: quality(vehicle.last_lap_s, stale),
            best_lap_s: quality(vehicle.best_lap_s, stale),
            // LMU solo publica el sector en curso; los tiempos de sector no
            // están en el layout admitido.
            last_sectors_s: vehicle
                .last_sectors_s
                .iter()
                .map(|v| quality(*v, stale))
                .collect(),
            estimated_lap_s: estimate(vehicle.estimated_lap_s, stale),
            lap_distance_m: quality(vehicle.lap_distance_m, stale),
            lap_elapsed_s: quality(vehicle.lap_progress_s, stale),
            current_sector: quality(vehicle.sector, stale),
            gap_leader: quality(
                gap(vehicle.time_behind_leader_s, vehicle.laps_behind_leader),
                stale,
            ),
            gap_ahead: quality(
                gap(vehicle.time_behind_next_s, vehicle.laps_behind_next),
                stale,
            ),
            in_pits: quality(Some(vehicle.in_pit), stale),
            pose: quality(vehicle.pose, stale),
            velocity_mps: quality(vehicle.velocity_mps, stale),
            pending_penalties: quality(Some(vehicle.pending_penalties), stale),
            ..Car::default()
        }
    }

    fn session(
        &self,
        frame: &Frame,
        rest: Option<(&rest::SessionInfo, bool)>,
        stale: bool,
    ) -> Session {
        // El REST solo respalda lo que el frame no da, y solo si es actual.
        let rest = rest.filter(|(_, fresh)| *fresh).map(|(info, _)| info);
        let kind = frame.kind.map_or_else(
            || rest.and_then(|info| info.kind).map(|kind| (kind, false)),
            |kind| Some((kind, stale)),
        );
        let track = if frame.track.is_empty() {
            rest.and_then(|info| info.track.clone())
                .filter(|track| !track.is_empty())
                .map(|track| (track, false))
        } else {
            Some((frame.track.clone(), stale))
        };
        let elapsed = frame.source_time.map(|time| time.as_secs_f64());
        let remaining = elapsed
            .zip(frame.end_time_s)
            .map(|(elapsed, end)| end - elapsed)
            .filter(|remaining| *remaining >= 0.0);
        Session {
            id: SessionId(self.session),
            kind: kind.map_or(Quality::Unavailable, |(kind, stale)| {
                quality(
                    Some(match kind {
                        Kind::Practice => SessionKind::Practice,
                        Kind::Qualifying => SessionKind::Qualifying,
                        Kind::Race => SessionKind::Race,
                        Kind::Warmup => SessionKind::Other("warmup".to_owned()),
                    }),
                    stale,
                )
            }),
            // `mGamePhase` vale 0 en fixtures 1.4.x con la sesión en marcha;
            // REST tampoco aporta una fase verificada (evidencia en REVIEW.md).
            state: Quality::Unavailable,
            elapsed_s: quality(elapsed, stale),
            remaining_s: quality(remaining, stale),
            track_name: track.map_or(Quality::Unavailable, |(track, stale)| {
                quality(Some(track), stale)
            }),
            // Lo estima el núcleo con el ritmo de la clase.
            laps_remaining: Quality::Unavailable,
            laps_total: quality(frame.maximum_laps, stale),
            track_length_m: quality(frame.track_length_m, stale),
            weather: weather(frame.weather, stale),
        }
    }
}

fn player(vehicle: &Vehicle, car: CarId, stale: bool, telemetry_stale: bool) -> Player {
    let inputs = vehicle.inputs.as_ref();
    Player {
        car,
        telemetry: inputs.map_or_else(Telemetry::default, |inputs| Telemetry {
            throttle: quality(inputs.throttle, telemetry_stale),
            brake: quality(inputs.brake, telemetry_stale),
            clutch: quality(inputs.clutch, telemetry_stale),
            steering: quality(inputs.steering, telemetry_stale),
            gear: quality(inputs.gear, telemetry_stale),
            speed_mps: quality(inputs.speed_mps, telemetry_stale),
            engine_speed_rad_s: quality(
                inputs.engine_rpm.map(|rpm| rpm * TAU / 60.0),
                telemetry_stale,
            ),
        }),
        fuel: inputs.map_or_else(Fuel::default, |inputs| Fuel {
            level_l: quality(inputs.fuel_level_l, telemetry_stale),
            capacity_l: quality(inputs.fuel_capacity_l, telemetry_stale),
            ..Fuel::default()
        }),
        damage: inputs.map_or_else(Damage::default, |inputs| Damage {
            tyre_wear: inputs
                .damage
                .tyre_wear
                .map(|value| stale_quality(value, telemetry_stale)),
            ..Damage::default()
        }),
        pit_limiter_active: quality(inputs.and_then(|i| i.pit_limiter_active), telemetry_stale),
        pit_stop_stopped: quality(vehicle.pit_stop_stopped, stale),
        // LMU escribe 0 mientras no hay mejor vuelta: sin referencia no es un
        // delta, y un 0 fiable taparía el delta que deriva el núcleo.
        delta_best_s: quality(
            inputs
                .and_then(|inputs| inputs.delta_best_s)
                .filter(|delta| *delta != 0.0 || vehicle.best_lap_s.is_some()),
            telemetry_stale,
        ),
    }
}

fn stale_quality<T>(value: Quality<T>, stale: bool) -> Quality<T> {
    match value {
        Quality::Reliable(value) if stale => Quality::Stale(value),
        other => other,
    }
}

fn weather(value: Weather, stale: bool) -> Weather {
    Weather {
        air_temperature_k: stale_quality(value.air_temperature_k, stale),
        track_temperature_k: stale_quality(value.track_temperature_k, stale),
        wind_speed_mps: stale_quality(value.wind_speed_mps, stale),
        rain: stale_quality(value.rain, stale),
        track_wetness: stale_quality(value.track_wetness, stale),
        ..value
    }
}

/// Solo la evidencia positiva de amarillo global del REST; su ausencia no
/// prueba que no haya bandera.
fn flags(rest: Option<(&rest::SessionInfo, bool)>) -> Quality<Vec<Flag>> {
    match rest {
        Some((info, fresh)) if info.global_yellow => {
            let flags = vec![Flag {
                kind: FlagKind::Yellow,
                scope: FlagScope::Session,
            }];
            if fresh {
                Quality::Reliable(flags)
            } else {
                Quality::Stale(flags)
            }
        }
        _ => Quality::Unavailable,
    }
}

fn capabilities(
    frame: &Frame,
    cars: &[Car],
    player: Option<&Player>,
    flags: &Quality<Vec<Flag>>,
    stale: bool,
    telemetry_stale: bool,
) -> Capabilities {
    let has_cars = !cars.is_empty();
    let telemetry = player.map(|player| &player.telemetry);
    Capabilities {
        session_clock: capability(frame.source_time.is_some(), stale),
        positions: capability(has_cars, stale),
        lap_times: capability(has_cars, stale),
        gaps: capability(has_cars, stale),
        pit_status: capability(has_cars, stale),
        flags: capability(
            !matches!(flags, Quality::Unavailable),
            matches!(flags, Quality::Stale(_)),
        ),
        spatial: capability(cars.iter().any(|car| has(&car.pose)), stale),
        driver_inputs: capability(
            telemetry.is_some_and(|t| {
                has(&t.throttle) || has(&t.brake) || has(&t.clutch) || has(&t.steering)
            }),
            telemetry_stale,
        ),
        powertrain: capability(
            telemetry
                .is_some_and(|t| has(&t.gear) || has(&t.speed_mps) || has(&t.engine_speed_rad_s)),
            telemetry_stale,
        ),
        fuel: capability(
            player.is_some_and(|player| has(&player.fuel.level_l) || has(&player.fuel.capacity_l)),
            telemetry_stale,
        ),
        delta: capability(
            player.is_some_and(|player| has(&player.delta_best_s)),
            telemetry_stale,
        ),
        sectors: capability(cars.iter().any(|car| has(&car.current_sector)), stale),
        lap_progress: capability(
            cars.iter()
                .any(|car| has(&car.lap_distance_m) || has(&car.lap_elapsed_s)),
            stale,
        ),
        weather: capability(
            [
                frame.weather.air_temperature_k,
                frame.weather.track_temperature_k,
                frame.weather.wind_speed_mps,
                frame.weather.rain,
                frame.weather.track_wetness,
            ]
            .iter()
            .any(has),
            stale,
        ),
        damage: capability(
            player.is_some_and(|p| p.damage.tyre_wear.iter().any(has)),
            telemetry_stale,
        ),
    }
}

fn estimate<T>(value: Option<T>, stale: bool) -> Quality<T> {
    match value {
        Some(value) if !stale => Quality::Estimated(value),
        _ => quality(value, stale),
    }
}

fn quality<T>(value: Option<T>, stale: bool) -> Quality<T> {
    match value {
        Some(value) if stale => Quality::Stale(value),
        Some(value) => Quality::Reliable(value),
        None => Quality::Unavailable,
    }
}

/// Hay valor, aunque esté caducado.
fn has<T>(quality: &Quality<T>) -> bool {
    !matches!(quality, Quality::Unavailable)
}

fn capability(has_data: bool, stale: bool) -> Capability {
    match (has_data, stale) {
        (true, false) => Capability::Fresh,
        (true, true) => Capability::WithData,
        (false, _) => Capability::Supported,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const REAL_44: &[u8] = include_bytes!("../../../../../testdata/lmu-fixture.bin");
    const BUILD: &str = "1.3.0.0";
    const SCORING_BASE: usize = 2_192;
    /// Fila de telemetría del jugador en `lmu-fixture.bin` (43).
    const PLAYER_TELEMETRY: usize = 128_468 + 43 * 1_888;

    const fn ms(value: u64) -> Duration {
        Duration::from_millis(value)
    }

    fn translator() -> Translator {
        Translator::new(SourceKind::Replay)
    }

    fn observe(translator: &mut Translator, frame: &[u8], at: Duration) -> Observation {
        translator.observe(frame, BUILD, at).unwrap()
    }

    fn with_time(seconds: f64) -> Vec<u8> {
        let mut frame = REAL_44.to_vec();
        frame[1_700..1_708].copy_from_slice(&seconds.to_le_bytes());
        frame
    }

    fn with_cars(count: i32) -> Vec<u8> {
        let mut frame = REAL_44.to_vec();
        frame[1_736..1_740].copy_from_slice(&count.to_le_bytes());
        frame
    }

    fn ids(observation: &Observation) -> Vec<CarId> {
        observation.state.cars.iter().map(|car| car.id).collect()
    }

    fn reliable<T: Copy>(quality: Quality<T>) -> T {
        match quality {
            Quality::Reliable(value) => value,
            _ => panic!("se esperaba un valor fiable"),
        }
    }

    #[test]
    fn a_new_track_or_a_clock_reset_starts_a_session_but_the_24h_wrap_does_not() {
        let mut t = translator();
        let first = observe(&mut t, REAL_44, ms(0));
        assert_eq!(first.state.session.id, SessionId(1));
        let again = observe(&mut t, REAL_44, ms(20));
        assert_eq!(again.state.session.id, SessionId(1));
        assert_eq!(ids(&again), ids(&first));

        let mut other_track = REAL_44.to_vec();
        other_track[1_632..1_640].copy_from_slice(b"Otro\0\0\0\0");
        let second = observe(&mut t, &other_track, ms(40));
        assert_eq!(second.state.session.id, SessionId(2));
        assert!(ids(&second).iter().all(|id| !ids(&first).contains(id)));

        // Vuelve a Barcelona: otra sesión (3). Después el reloj retrocede sin
        // cambiar de circuito: otra más (4).
        observe(&mut t, &with_time(10_000.0), ms(60));
        let third = observe(&mut t, &with_time(50.0), ms(80));
        assert_eq!(third.state.session.id, SessionId(4));

        // Pasado el día, el reloj vuelve a empezar: misma sesión.
        let mut t = translator();
        observe(&mut t, &with_time(86_400.5), ms(0));
        let wrapped = observe(&mut t, &with_time(10.0), ms(20));
        assert_eq!(wrapped.state.session.id, SessionId(1));
    }

    #[test]
    fn a_slot_keeps_its_car_through_a_short_blink_and_a_driver_swap_but_not_a_long_absence() {
        let mut t = translator();
        let full = observe(&mut t, REAL_44, ms(0));
        let last = full.state.cars[43].id;
        let short = with_cars(43);
        observe(&mut t, &short, ms(20));
        let back = observe(&mut t, REAL_44, ms(40));
        assert_eq!(back.state.cars[43].id, last, "parpadeo dentro de la gracia");

        // Relevo de piloto sin interrupción: mismo coche.
        let mut swap = REAL_44.to_vec();
        swap[SCORING_BASE + 4..SCORING_BASE + 10].copy_from_slice(b"Nuevo\0");
        let swapped = observe(&mut t, &swap, ms(60));
        assert_eq!(swapped.state.cars[0].id, full.state.cars[0].id);
        assert_eq!(swapped.state.cars[0].driver.name, "Nuevo");
        assert_ne!(
            swapped.state.cars[0].driver.id,
            full.state.cars[0].driver.id
        );

        for step in 0..=SLOT_GRACE_FRAMES {
            observe(&mut t, &short, ms(80 + step));
        }
        let long = observe(&mut t, REAL_44, ms(200));
        assert_ne!(long.state.cars[43].id, last, "otra ocupación del hueco");
        assert_eq!(long.state.cars[0].id, full.state.cars[0].id);
    }

    /// Cuerpo REST con un número por coche del frame.
    fn standings(frame: &[u8], label: impl Fn(&Vehicle) -> String) -> Vec<u8> {
        let grid = frame::admit(frame, BUILD).unwrap();
        let rows: Vec<String> = grid
            .vehicles
            .iter()
            .map(|vehicle| {
                format!(
                    r#"{{"slotID":{},"carNumber":"{}","vehicleName":"{}"}}"#,
                    vehicle.slot,
                    vehicle.slot % 1000,
                    label(vehicle)
                )
            })
            .collect();
        format!("[{}]", rows.join(",")).into_bytes()
    }

    #[test]
    fn car_numbers_join_by_slot_and_label_and_expire_with_the_rest_ttl() {
        let mut t = translator();
        let body = standings(REAL_44, |vehicle| vehicle.name.clone());
        t.rest.accept_standings(&body, ms(100)).unwrap();
        let joined = observe(&mut t, REAL_44, ms(200));
        let expected: Vec<String> = frame::admit(REAL_44, BUILD)
            .unwrap()
            .vehicles
            .iter()
            .map(|vehicle| (vehicle.slot % 1000).to_string())
            .collect();
        let numbers: Vec<_> = joined
            .state
            .cars
            .iter()
            .map(|car| car.number.clone())
            .collect();
        assert_eq!(numbers, expected);
        // 2 s después de iniciar la consulta, los números caducan y no se congelan.
        let later = observe(&mut t, REAL_44, ms(2_101));
        assert!(later.state.cars.iter().all(|car| car.number.is_empty()));

        // Etiqueta distinta a la del frame: el hueco se reutilizó, no se asigna número.
        let mut t = translator();
        let body = standings(REAL_44, |_| "Otro coche".to_owned());
        t.rest.accept_standings(&body, ms(100)).unwrap();
        let mismatched = observe(&mut t, REAL_44, ms(200));
        assert!(
            mismatched
                .state
                .cars
                .iter()
                .all(|car| car.number.is_empty())
        );
    }

    #[test]
    fn rest_started_before_a_session_change_cannot_name_the_new_sessions_cars() {
        let mut t = translator();
        let body = standings(REAL_44, |vehicle| vehicle.name.clone());
        t.rest.accept_standings(&body, ms(100)).unwrap();
        assert!(
            !observe(&mut t, REAL_44, ms(200)).state.cars[0]
                .number
                .is_empty()
        );
        let mut other_track = REAL_44.to_vec();
        other_track[1_632..1_640].copy_from_slice(b"Otro\0\0\0\0");
        let changed = observe(&mut t, &other_track, ms(300));
        assert!(changed.state.cars.iter().all(|car| car.number.is_empty()));
        // Una consulta iniciada tras el cambio sí vale.
        t.rest.accept_standings(&body, ms(310)).unwrap();
        assert!(
            !observe(&mut t, &other_track, ms(320)).state.cars[0]
                .number
                .is_empty()
        );
    }

    #[test]
    fn rest_backs_up_only_what_the_frame_lacks_and_reports_positive_yellow_evidence() {
        let mut t = translator();
        let mut frame = REAL_44.to_vec();
        frame[1_632] = 0; // circuito vacío
        frame[1_696..1_700].copy_from_slice(&99_i32.to_le_bytes()); // tipo desconocido
        let bare = observe(&mut t, &frame, ms(0));
        assert!(matches!(
            bare.state.session.track_name,
            Quality::Unavailable
        ));
        assert!(matches!(bare.state.session.kind, Quality::Unavailable));
        assert_eq!(bare.state.capabilities.flags, Capability::Supported);

        t.rest
            .accept_session(
                br#"{"trackName":"Track-01","session":"RACE1","yellowFlagState":4}"#,
                ms(10),
            )
            .unwrap();
        let backed = observe(&mut t, &frame, ms(20));
        assert!(
            matches!(&backed.state.session.track_name, Quality::Reliable(name) if name == "Track-01")
        );
        assert!(matches!(
            backed.state.session.kind,
            Quality::Reliable(SessionKind::Race)
        ));
        assert!(matches!(&backed.state.flags, Quality::Reliable(flags) if flags.len() == 1));
        assert_eq!(backed.state.capabilities.flags, Capability::Fresh);

        // Dato REST caducado: la bandera queda como último valor conocido.
        let old = observe(&mut t, REAL_44, ms(2_500));
        assert!(matches!(&old.state.flags, Quality::Stale(_)));
        assert_eq!(old.state.capabilities.flags, Capability::WithData);
    }

    #[test]
    fn fuel_and_delta_carry_the_native_validity_rules() {
        let observation = observe(&mut translator(), REAL_44, ms(0));
        let player = observation.state.player.expect("jugador");
        assert!((reliable(player.fuel.level_l) - 99.586_573_277_723_69).abs() < 1e-9);
        assert!((reliable(player.fuel.capacity_l) - 100.0).abs() < 1e-9);
        // `per_lap_l` y `laps_left` los deriva el núcleo.
        assert!(matches!(player.fuel.per_lap_l, Quality::Unavailable));
        assert!(matches!(player.fuel.laps_left, Quality::Unavailable));
        // El fixture trae delta 0 sin mejor vuelta: no es un delta.
        assert!(matches!(player.delta_best_s, Quality::Unavailable));
        let caps = observation.state.capabilities;
        assert_eq!(
            (caps.fuel, caps.delta),
            (Capability::Fresh, Capability::Supported)
        );

        // Nivel por encima de la capacidad: el par entero es inválido.
        let mut frame = REAL_44.to_vec();
        frame[PLAYER_TELEMETRY + 524..PLAYER_TELEMETRY + 532]
            .copy_from_slice(&150.0_f64.to_le_bytes());
        let observation = observe(&mut translator(), &frame, ms(0));
        let player = observation.state.player.unwrap();
        assert!(matches!(
            (player.fuel.level_l, player.fuel.capacity_l),
            (Quality::Unavailable, Quality::Unavailable)
        ));
        assert_eq!(observation.state.capabilities.fuel, Capability::Supported);

        // Delta fuera de ±10 000 s o no finito: sin dato.
        for delta in [10_000.0_f64, -10_000.0, f64::NAN, f64::INFINITY] {
            let mut frame = REAL_44.to_vec();
            frame[PLAYER_TELEMETRY + 696..PLAYER_TELEMETRY + 704]
                .copy_from_slice(&delta.to_le_bytes());
            let observation = observe(&mut translator(), &frame, ms(0));
            let player = observation.state.player.unwrap();
            assert!(
                matches!(player.delta_best_s, Quality::Unavailable),
                "{delta}"
            );
            assert_eq!(observation.state.capabilities.delta, Capability::Supported);
        }
        // Un delta real (negativo = más rápido) sí viaja.
        let mut frame = REAL_44.to_vec();
        frame[PLAYER_TELEMETRY + 696..PLAYER_TELEMETRY + 704]
            .copy_from_slice(&(-3.5_f64).to_le_bytes());
        let observation = observe(&mut translator(), &frame, ms(0));
        assert!(
            matches!(observation.state.player.unwrap().delta_best_s, Quality::Reliable(delta) if (delta + 3.5).abs() < f64::EPSILON)
        );
    }

    #[test]
    fn cars_and_session_publish_sector_distance_progress_and_limits() {
        let observation = observe(&mut translator(), REAL_44, ms(0));
        let car = observation.state.player_car().expect("coche del jugador");
        assert_eq!(reliable(car.current_sector), 0);
        assert!((reliable(car.lap_distance_m) - 1_068.229_614_257_812_5).abs() < 1e-9);
        // Cronómetro todo a cero con distancias distintas: sin dato.
        assert!(matches!(car.lap_elapsed_s, Quality::Unavailable));
        // `mMaximumLaps` 0 = sesión por tiempo.
        assert!(matches!(
            observation.state.session.laps_total,
            Quality::Unavailable
        ));
        assert!(
            (reliable(observation.state.session.track_length_m) - 4_655.109_863_281_25).abs()
                < 1e-9
        );
        let caps = observation.state.capabilities;
        assert_eq!(
            (caps.sectors, caps.lap_progress),
            (Capability::Fresh, Capability::Fresh)
        );

        // Carrera por vueltas: `mMaximumLaps` llega tal cual.
        let mut frame = REAL_44.to_vec();
        frame[1_716..1_720].copy_from_slice(&30_i32.to_le_bytes());
        let observation = observe(&mut translator(), &frame, ms(0));
        assert!(matches!(
            observation.state.session.laps_total,
            Quality::Reliable(30)
        ));
    }

    #[test]
    fn a_stalled_session_clock_marks_everything_stale_and_declares_data_without_freshness() {
        let mut t = translator();
        let fresh = observe(&mut t, REAL_44, ms(0));
        assert_eq!(fresh.state.source_state, vantare_domain::SourceState::Live);
        assert!(!t.needs_refresh(ms(499)));
        assert!(t.needs_refresh(ms(500)));
        let stale = observe(&mut t, REAL_44, ms(600));
        assert_eq!(stale.state.source_state, vantare_domain::SourceState::Stale);
        assert!(!t.needs_refresh(ms(700)));
        assert!(matches!(stale.state.cars[0].position, Quality::Stale(_)));
        assert!(matches!(stale.state.session.elapsed_s, Quality::Stale(_)));
        let telemetry = stale.state.player.unwrap().telemetry;
        assert!(matches!(telemetry.gear, Quality::Stale(1)));
        let caps = stale.state.capabilities;
        for declared in [
            caps.session_clock,
            caps.positions,
            caps.spatial,
            caps.driver_inputs,
            caps.powertrain,
            caps.fuel,
            caps.sectors,
            caps.lap_progress,
        ] {
            assert_eq!(declared, Capability::WithData);
        }
        // Sin mejor vuelta, el delta nunca tuvo dato.
        assert_eq!(caps.delta, Capability::Supported);
        // Los valores no cambian, solo su calidad.
        assert_eq!(ids(&stale), ids(&fresh));
        assert_eq!(stale.state.cars[0].pose.current(), None);
        assert!(matches!(stale.state.cars[0].pose, Quality::Stale(_)));
    }

    #[test]
    fn an_unusable_frame_is_rejected_without_touching_the_state() {
        let mut t = translator();
        let good = observe(&mut t, REAL_44, ms(0));
        assert_eq!(
            t.observe(&REAL_44[..100], BUILD, ms(20)).unwrap_err(),
            Rejection::ShortBuffer
        );
        assert_eq!(
            t.observe(REAL_44, "9.9.9.9", ms(20)).unwrap_err(),
            Rejection::UnsupportedBuild
        );
        let after = observe(&mut t, REAL_44, ms(40));
        assert_eq!(ids(&after), ids(&good));
        assert_eq!(after.state.session.id, good.state.session.id);
    }

    #[test]
    fn menu_frames_are_valid_observations_with_supported_but_dataless_signals() {
        let menu = include_bytes!("../../../../../testdata/lmu-menu-fixture.bin");
        let observation = observe(&mut translator(), menu, ms(0));
        assert_eq!(
            observation.state.source_state,
            vantare_domain::SourceState::Waiting
        );
        assert!(observation.state.cars.is_empty() && observation.state.player.is_none());
        let caps = observation.state.capabilities;
        for dataless in [
            caps.positions,
            caps.fuel,
            caps.delta,
            caps.sectors,
            caps.lap_progress,
        ] {
            assert_eq!(dataless, Capability::Supported);
        }
        assert_eq!(caps.session_clock, Capability::Fresh);
    }

    /// Los nombres de piloto vienen de la memoria del simulador, asi que los
    /// mapas de identidad son superficie de crecimiento. Sin cota, quien pueda
    /// escribir esa memoria acuna un nombre nuevo por fotograma y los mapas
    /// crecen durante toda la sesion.
    #[test]
    fn mutated_driver_names_cannot_grow_the_identity_maps_without_bound() {
        let mut translator = translator();
        // El reloj AVANZA a proposito: asi no cuenta como sesion nueva y el
        // unico limite posible es el presupuesto de identidades.
        for round in 0..2_000_u32 {
            let mut frame = REAL_44.to_vec();
            frame[1_700..1_708].copy_from_slice(&f64::from(round).to_le_bytes());
            let name = format!("p{round:08}");
            let at = SCORING_BASE + 4;
            frame[at..at + name.len()].copy_from_slice(name.as_bytes());
            frame[at + name.len()] = 0;
            let _ = translator.observe(&frame, BUILD, ms(u64::from(round) * 16));
        }
        assert!(
            translator.drivers.len() <= IDENTITY_BUDGET,
            "el mapa de pilotos debe quedar acotado, y tiene {}",
            translator.drivers.len()
        );
        assert!(translator.classes.len() <= IDENTITY_BUDGET);
    }
}
