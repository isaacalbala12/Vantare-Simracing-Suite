//! De un frame admitido y la caché REST a la `Observation` neutral. Aquí vive
//! todo el estado que el adaptador debe recordar entre lecturas: reloj de
//! frescura, identidad de sesión y de coches, y el REST más reciente.

use std::collections::HashMap;
use std::f64::consts::TAU;
use std::time::Duration;

use vantare_domain::{
    Capabilities, Capability, Car, CarId, Class, ClassId, Driver, DriverId, Flag, FlagKind,
    FlagScope, Gap, Observation, Origin, Player, Quality, Session, SessionId, SessionKind,
    SessionState, Source, SourceKind, State, Telemetry,
};

use super::frame::{self, Frame, Kind, Phase, Rejection, Vehicle};
use super::gate::Gate;
use super::rest;

/// Un hueco que reaparece con el mismo piloto y clase dentro de este número de
/// frames es el mismo coche (parpadeo de la parrilla); pasado, es otro.
const SLOT_GRACE_FRAMES: u64 = 30;
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
    pub(super) rest: rest::Cache,
    /// Última `Observation` publicada con datos caducados.
    emitted_stale: bool,
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
            rest: rest::Cache::default(),
            emitted_stale: false,
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
    pub(super) fn needs_refresh(&self, now: Duration) -> bool {
        self.gate.is_stale_at(now) != self.emitted_stale
    }

    pub(super) fn observe(
        &mut self,
        buffer: &[u8],
        build: &str,
        now: Duration,
    ) -> Result<Observation, Rejection> {
        let frame = frame::admit(buffer, build)?;
        let stale = self.gate.observe(now, frame.source_time);
        self.emitted_stale = stale;
        self.track_session(&frame, now, stale);
        self.frame_count += 1;
        let car_ids: Vec<CarId> = frame
            .vehicles
            .iter()
            .map(|vehicle| self.car_id(vehicle))
            .collect();
        let numbers = self.car_numbers(&frame, now);
        let cars: Vec<Car> = frame
            .vehicles
            .iter()
            .zip(car_ids.iter().zip(numbers))
            .map(|(vehicle, (id, number))| self.car(vehicle, *id, number, stale))
            .collect();
        let player = frame
            .player
            .map(|index| player(&frame.vehicles[index], car_ids[index], stale));
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
                capabilities: capabilities(&frame, &cars, player.as_ref(), &flags, stale),
                session: self.session(&frame, rest_session, stale),
                flags,
                cars,
                player,
            },
        })
    }

    /// Número de carrera de cada coche, casado por hueco y por etiqueta: si la
    /// etiqueta REST no coincide con la del frame, el hueco se reutilizó.
    fn car_numbers(&self, frame: &Frame, now: Duration) -> Vec<String> {
        let entries = self.rest.car_numbers(now, self.floor);
        frame
            .vehicles
            .iter()
            .map(|vehicle| {
                entries
                    .iter()
                    .find(|entry| {
                        entry.slot == vehicle.slot
                            && !entry.vehicle.is_empty()
                            && entry.vehicle == vehicle.name.trim()
                    })
                    .map_or_else(String::new, |entry| entry.number.clone())
            })
            .collect()
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
            last_sectors_s: Vec::new(),
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
            state: quality(
                frame.phase.map(|phase| match phase {
                    Phase::Preparing => SessionState::Preparing,
                    Phase::Running => SessionState::Running,
                    Phase::Interrupted => SessionState::Interrupted,
                    Phase::Finished => SessionState::Finished,
                }),
                stale,
            ),
            elapsed_s: quality(elapsed, stale),
            remaining_s: quality(remaining, stale),
            track_name: track.map_or(Quality::Unavailable, |(track, stale)| {
                quality(Some(track), stale)
            }),
            // Lo estima el núcleo con el ritmo de la clase.
            laps_remaining: Quality::Unavailable,
        }
    }
}

fn player(vehicle: &Vehicle, car: CarId, stale: bool) -> Player {
    Player {
        car,
        telemetry: vehicle
            .inputs
            .as_ref()
            .map_or_else(Telemetry::default, |inputs| Telemetry {
                throttle: quality(inputs.throttle, stale),
                brake: quality(inputs.brake, stale),
                clutch: quality(inputs.clutch, stale),
                gear: quality(inputs.gear, stale),
                speed_mps: quality(inputs.speed_mps, stale),
                engine_speed_rad_s: quality(inputs.engine_rpm.map(|rpm| rpm * TAU / 60.0), stale),
            }),
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
        spatial: capability(cars.iter().any(|car| car.pose.current().is_some()), stale),
        driver_inputs: capability(
            telemetry.is_some_and(|t| {
                [t.throttle, t.brake, t.clutch]
                    .iter()
                    .any(|input| input.current().is_some())
            }),
            stale,
        ),
        powertrain: capability(
            telemetry.is_some_and(|t| {
                t.gear.current().is_some()
                    || t.speed_mps.current().is_some()
                    || t.engine_speed_rad_s.current().is_some()
            }),
            stale,
        ),
    }
}

fn quality<T>(value: Option<T>, stale: bool) -> Quality<T> {
    match value {
        Some(value) if stale => Quality::Stale(value),
        Some(value) => Quality::Reliable(value),
        None => Quality::Unavailable,
    }
}

fn capability(has_data: bool, stale: bool) -> Capability {
    match (has_data, stale) {
        (true, false) => Capability::Fresh,
        (true, true) => Capability::WithData,
        (false, _) => Capability::Supported,
    }
}
