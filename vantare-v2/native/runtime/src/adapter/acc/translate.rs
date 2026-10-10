//! Fusión por señal. Los relojes de physics, graphics y cada coche UDP son
//! independientes; recibir un datagrama nunca refresca una página SHM vieja.
use std::collections::{BTreeMap, HashMap};
use std::f64::consts::{FRAC_PI_2, TAU};
use std::io;
use std::time::Duration;

use vantare_domain::{
    Capabilities, Capability, Car, CarId, Class, ClassId, Driver, DriverId, Flag, FlagKind,
    FlagScope, Fuel, Gap, Observation, Origin, Player, Pose, Quality, Session, SessionId,
    SessionKind, SessionState, Source, SourceKind, State, Telemetry, Weather,
};

use super::bytes::{f32_at, i32_at, invalid, wide_at};
use super::protocol::{self, CarUpdate, Entry, Lap, Message, SessionUpdate};
use super::velocity::{Sample, Velocity};

/// Tope de identidades de piloto y clase recordadas a la vez. Una carrera
/// legitima no pasa de 104 coches; el margen absorbe entradas y salidas.
const IDENTITY_BUDGET: usize = 512;

const SHM_TTL: Duration = Duration::from_millis(500);

#[cfg(test)]
#[path = "../../../tests/acc/translation.rs"]
mod tests;
const UDP_TTL: Duration = Duration::from_secs(1);
pub(super) const PAGE_SIZES: [usize; 3] = [800, 1588, 820];

struct Page {
    bytes: Vec<u8>,
    at: Duration,
}
struct Timed<T> {
    value: T,
    at: Duration,
}
struct Rival {
    update: Timed<CarUpdate>,
    velocity: Velocity,
    // CrewChief: no aceptar lapCount/best/last entre spline 0.93 y 0.07.
    stable: Option<(u16, Lap, Lap)>,
}

pub(super) struct Translator {
    #[cfg(test)]
    pub(super) observations: usize,
    kind: SourceKind,
    pages: [Option<Page>; 3],
    physics_zero: bool,
    player_laps: Option<(u32, Option<f64>, Option<f64>)>,
    player_velocity: Velocity,
    cars: BTreeMap<u16, Rival>,
    entries: BTreeMap<u16, Entry>,
    list: Option<Vec<u16>>,
    drivers: HashMap<String, DriverId>,
    session: Option<Timed<SessionUpdate>>,
    track: Option<(i32, String, f64)>,
    shm_signature: Option<(String, i32, i32)>,
    udp_signature: Option<(u16, u16, u8)>,
    epoch: u64,
    floor: Duration,
    pub(super) connection: Option<i32>,
    // La grabadora se registró seis veces antes de recibir las listas.
    // Respuestas tardías de conexiones admitidas siguen siendo válidas.
    registered: Vec<i32>,
    pub(super) request_entries: bool,
    pub(super) request_track: bool,
}

impl Translator {
    pub(super) fn new(kind: SourceKind) -> Self {
        Self {
            #[cfg(test)]
            observations: 0,
            kind,
            pages: [None, None, None],
            physics_zero: false,
            player_laps: None,
            player_velocity: Velocity::default(),
            cars: BTreeMap::new(),
            entries: BTreeMap::new(),
            list: None,
            drivers: HashMap::new(),
            session: None,
            track: None,
            shm_signature: None,
            udp_signature: None,
            epoch: 1,
            floor: Duration::ZERO,
            connection: None,
            registered: Vec::new(),
            request_entries: false,
            request_track: false,
        }
    }

    fn reset_session(&mut self, at: Duration) {
        self.epoch += 1;
        self.floor = at;
        self.cars.clear();
        self.entries.clear();
        self.list = None;
        self.player_laps = None;
        self.player_velocity = Velocity::default();
        self.session = None;
        self.track = None;
        self.shm_signature = None;
        self.udp_signature = None;
        self.request_entries = true;
        self.request_track = true;
        // Las identidades son por sesion: sin esto el mapa de pilotos crecia
        // durante toda la vida del proceso con nombres elegidos por quien
        // escriba los datagramas.
        self.drivers.clear();
    }

    pub(super) fn shm(&mut self, kind: u8, bytes: Vec<u8>, at: Duration) -> io::Result<bool> {
        let index = usize::from(kind);
        if PAGE_SIZES.get(index).copied() != Some(bytes.len()) {
            return Err(invalid("página ACC de tipo o tamaño desconocido"));
        }
        if kind == 2 {
            if wide_at(&bytes, 0, 30) != "1.9" || wide_at(&bytes, 30, 30).is_empty() {
                return Err(invalid("layout ACC sin smVersion 1.9 inicializada"));
            }
            if self.pages[index].as_ref().is_some_and(|p| p.bytes == bytes) {
                return Ok(false);
            }
        } else if self.pages[index]
            .as_ref()
            .is_some_and(|p| p.bytes[..4] == bytes[..4])
        {
            return Ok(false); // packetId repetido no rejuvenece la fuente.
        }
        if kind == 0 {
            self.physics_zero = bytes[4..].iter().all(|b| *b == 0);
            if self.physics_zero {
                self.clear_velocities();
                return Ok(true);
            } // pausa: conservar último valor, obsoleto.
        }
        self.pages[index] = Some(Page { bytes, at });
        if let (Some(g), Some(s)) = (&self.pages[1], &self.pages[2]) {
            let signature = (
                wide_at(&s.bytes, 134, 66),
                i32_at(&g.bytes, 1320),
                i32_at(&g.bytes, 8),
            );
            if self
                .shm_signature
                .as_ref()
                .is_some_and(|old| *old != signature)
            {
                self.reset_session(at);
            }
            self.shm_signature = Some(signature);
        }
        if kind == 1
            && let Some(g) = &self.pages[1]
        {
            let spline = f32_at(&g.bytes, 248);
            if self.player_laps.is_none() || (0.07..=0.93).contains(&spline) {
                self.player_laps = u32::try_from(i32_at(&g.bytes, 132)).ok().map(|laps| {
                    (
                        laps,
                        lap_ms(i32_at(&g.bytes, 148)),
                        lap_ms(i32_at(&g.bytes, 144)),
                    )
                });
            }
        }
        if kind == 1 {
            self.update_player_velocity(at);
        }
        Ok(true)
    }

    fn clear_velocities(&mut self) {
        self.player_velocity = Velocity::default();
        for rival in self.cars.values_mut() {
            rival.velocity = Velocity::default();
        }
    }

    fn update_player_velocity(&mut self, at: Duration) {
        let Some(g) = self.pages[1].as_ref().map(|p| p.bytes.as_slice()) else {
            return;
        };
        if !matches!(i32_at(g, 4), 1 | 2) || self.physics_zero {
            self.clear_velocities();
            return;
        }
        let sample = (|| {
            if boolean(i32_at(g, 160))? || boolean(i32_at(g, 1236))? {
                return None;
            }
            let id = u32::try_from(i32_at(g, 1216)).ok()?;
            let lap = u32::try_from(i32_at(g, 132)).ok()?;
            let time = i32_at(g, 140);
            if time == i32::MAX {
                return None;
            }
            Some(Sample {
                position: graphics_position(g, CarId(id))?,
                clock: f64::from(time) / 1000.0,
                identity: (lap, id),
                at,
            })
        })();
        self.player_velocity.update(sample);
    }

    pub(super) fn udp(&mut self, bytes: &[u8], at: Duration) -> io::Result<bool> {
        match protocol::parse(bytes)? {
            Message::Registration { id, success } => {
                self.register(id, success)?;
                return Ok(false);
            }
            Message::Session(update) => {
                let signature = (update.event, update.index, update.kind);
                let rewind = self.session.as_ref().is_some_and(|old| {
                    update.elapsed.is_finite() && update.elapsed < old.value.elapsed
                });
                if rewind || self.udp_signature.is_some_and(|old| old != signature) {
                    self.reset_session(at);
                }
                self.udp_signature = Some(signature);
                self.session = Some(Timed { value: update, at });
            }
            Message::Car(update) => {
                let known = self.entries.get(&update.index).is_some_and(|e| {
                    e.drivers.len() == usize::from(update.driver_count)
                        && usize::from(update.driver) < e.drivers.len()
                });
                self.request_entries |= !known;
                if !self.cars.contains_key(&update.index) && self.cars.len() >= protocol::MAX_CARS {
                    return Err(invalid("demasiados carIndex ACC"));
                }
                if self
                    .list
                    .as_ref()
                    .is_some_and(|list| !list.contains(&update.index))
                {
                    return Ok(false);
                }
                let outside_line =
                    update.spline.is_finite() && (0.07..=0.93).contains(&update.spline);
                let stable = if outside_line || !self.cars.contains_key(&update.index) {
                    Some((update.laps, update.best.clone(), update.last.clone()))
                } else {
                    self.cars
                        .get(&update.index)
                        .and_then(|old| old.stable.clone())
                };
                let velocity = self.rival_velocity(&update, at);
                self.cars.insert(
                    update.index,
                    Rival {
                        update: Timed { value: update, at },
                        velocity,
                        stable,
                    },
                );
            }
            Message::List {
                connection,
                indices,
            } => {
                if !self.registered.contains(&connection) {
                    return Err(invalid("lista de otra conexión"));
                }
                self.cars.retain(|i, _| indices.contains(i));
                self.entries.retain(|i, _| indices.contains(i));
                self.list = Some(indices);
            }
            Message::Entry(entry) => {
                if self
                    .list
                    .as_ref()
                    .is_some_and(|list| list.contains(&entry.index))
                {
                    self.update_entry(entry);
                } else {
                    self.request_entries = true;
                    return Ok(false);
                }
            }
            Message::Track {
                connection,
                id,
                name,
                meters,
            } => {
                if !self.registered.contains(&connection) {
                    return Err(invalid("pista de otra conexión"));
                }
                if self.track.as_ref().is_some_and(|old| old.0 != id) {
                    self.reset_session(at);
                }
                self.track = Some((id, name, f64::from(meters)));
                self.request_track = false;
            }
            Message::Event => return Ok(false),
        }
        Ok(true)
    }

    fn update_entry(&mut self, entry: Entry) {
        if self
            .entries
            .get(&entry.index)
            .is_some_and(|old| *old != entry)
        {
            if let Some(car) = self.cars.get_mut(&entry.index) {
                car.velocity = Velocity::default();
            }
            if self.pages[1]
                .as_ref()
                .is_some_and(|g| i32_at(&g.bytes, 1216) == i32::from(entry.index))
            {
                self.player_velocity = Velocity::default();
            }
        }
        self.entries.insert(entry.index, entry);
    }

    fn rival_velocity(&self, update: &CarUpdate, at: Duration) -> Velocity {
        let mut velocity = self
            .cars
            .get(&update.index)
            .filter(|old| old.update.value.driver_count == update.driver_count)
            .map_or_else(Velocity::default, |old| old.velocity);
        let paused = self.physics_zero
            || self.pages[1]
                .as_ref()
                .is_some_and(|g| !matches!(i32_at(&g.bytes, 4), 1 | 2));
        let sample = (!paused && update.location == 1)
            .then(|| {
                update.current.time.map(|clock| Sample {
                    position: [update.x, update.y],
                    clock,
                    identity: (u32::from(update.laps), u32::from(update.driver)),
                    at,
                })
            })
            .flatten();
        velocity.update(sample);
        velocity
    }

    fn register(&mut self, id: i32, success: bool) -> io::Result<()> {
        if self.connection != Some(id) || !success {
            self.clear_velocities();
        }
        self.connection = success.then_some(id);
        if success && !self.registered.contains(&id) {
            if self.registered.len() == 8 {
                self.registered.remove(0);
            }
            self.registered.push(id);
        }
        self.request_entries = success;
        self.request_track = success;
        if !success {
            return Err(invalid("registro UDP ACC rechazado"));
        }
        Ok(())
    }

    fn page(&self, index: usize, now: Duration) -> Option<(&[u8], bool)> {
        let p = self.pages[index].as_ref()?;
        let stale = p.at < self.floor || now.saturating_sub(p.at) >= SHM_TTL;
        Some((&p.bytes, stale))
    }

    /// Sin nueva fuente, solo las fronteras de frescura pueden cambiar la foto.
    /// Comprobar relojes y velocidades evita construir páginas, coches y nombres.
    #[cfg(windows)]
    pub(super) fn needs_refresh(&self, previous: Duration, now: Duration) -> bool {
        if now < previous {
            return true;
        }
        let expired = |at: Duration, ttl: Duration| {
            (now.saturating_sub(at) >= ttl) != (previous.saturating_sub(at) >= ttl)
        };
        self.pages[..2]
            .iter()
            .flatten()
            .any(|p| p.at >= self.floor && expired(p.at, SHM_TTL))
            || self
                .session
                .as_ref()
                .is_some_and(|s| expired(s.at, UDP_TTL))
            || self.player_velocity.quality(previous) != self.player_velocity.quality(now)
            || self.cars.values().any(|car| {
                expired(car.update.at, UDP_TTL)
                    || car.velocity.quality(previous) != car.velocity.quality(now)
            })
    }

    pub(super) fn observe(&mut self, now: Duration) -> Option<Observation> {
        #[cfg(test)]
        {
            self.observations += 1;
        }
        let s = self.pages[2].as_ref()?.bytes.clone();
        let graphics = self.page(1, now).map(|(b, stale)| (b.to_vec(), stale));
        let (g, gs) = graphics
            .as_ref()
            .map_or((&[][..], true), |(b, stale)| (b.as_slice(), *stale));
        let active = !g.is_empty() && i32_at(g, 4) != 0;
        let paused = !g.is_empty() && i32_at(g, 4) == 3;
        let player_id = active
            .then(|| i32_at(g, 1216))
            .and_then(|id| u32::try_from(id).ok())
            .map(CarId);
        let player = player_id.map(|id| self.player(id, g, gs || paused, now));
        let session = self.session_model(&s, g, gs, now);
        let flags = if active {
            flags(g, player_id, gs || paused)
        } else {
            Quality::Unavailable
        };
        let mut cars = Vec::with_capacity(self.cars.len());
        if active || (g.is_empty() && self.session.is_some()) {
            let indices: Vec<u16> = self.cars.keys().copied().collect();
            for index in indices {
                cars.push(self.car(index, now));
            }
        }
        if let Some(id) = player_id {
            if !cars.iter().any(|c| c.id == id) {
                let name = format!("{} {}", wide_at(&s, 200, 66), wide_at(&s, 266, 66))
                    .trim()
                    .to_owned();
                let driver = self.driver(&name);
                cars.push(Car {
                    id,
                    driver,
                    ..Car::default()
                });
            }
            if let Some(car) = cars.iter_mut().find(|car| car.id == id) {
                let shm_pose = player_car(
                    car,
                    g,
                    gs || paused,
                    self.page(0, now)
                        .map(|(p, stale)| (p, stale || self.physics_zero)),
                    self.track.as_ref(),
                );
                // La velocidad debe corresponder a la pose seleccionada. No
                // mezclar una diferencia UDP anterior con un teletransporte SHM.
                if shm_pose {
                    car.velocity_mps = self.player_velocity.quality(now);
                } else if !matches!(car.pose, Quality::Reliable(_)) || paused {
                    car.velocity_mps = Quality::Unavailable;
                }
                if let Some((laps, best, last)) = self.player_laps {
                    car.laps = prefer(quality(Some(laps), gs || paused), car.laps);
                    car.best_lap_s = prefer(quality(best, gs || paused), car.best_lap_s);
                    car.last_lap_s = prefer(quality(last, gs || paused), car.last_lap_s);
                }
            }
        }
        let state = State {
            source_state: if !active && (!g.is_empty() || self.session.is_none()) {
                vantare_domain::SourceState::Waiting
            } else if (gs || paused)
                && self
                    .session
                    .as_ref()
                    .is_none_or(|u| now.saturating_sub(u.at) >= UDP_TTL)
                && self
                    .cars
                    .values()
                    .all(|car| now.saturating_sub(car.update.at) >= UDP_TTL)
            {
                vantare_domain::SourceState::Stale
            } else {
                vantare_domain::SourceState::Live
            },
            session,
            flags,
            cars,
            player,
            ..State::default()
        };
        let capabilities = capabilities(&state);
        Some(Observation {
            origin: Origin {
                source: Source {
                    simulator: "acc",
                    kind: self.kind,
                },
                source_time: None,
                received_at: now,
            },
            state: State {
                capabilities,
                ..state
            },
        })
    }

    fn driver(&mut self, name: &str) -> Driver {
        // Tope de identidades recordadas: los nombres vienen de los datagramas,
        // asi que sin cota el mapa crece durante toda la vida del proceso. Al
        // agotarse se vacia, que solo cuesta estabilidad de id a quien exceda
        // el maximo de coches de una carrera real.
        if self.drivers.len() >= IDENTITY_BUDGET {
            self.drivers.clear();
        }
        // Asignación por nombre: sin colisiones de hash y estable en relevos/replays.
        let next = u32::try_from(self.drivers.len() + 1).unwrap_or(u32::MAX);
        let id = *self
            .drivers
            .entry(name.to_owned())
            .or_insert(DriverId(next));
        Driver {
            id,
            name: name.to_owned(),
        }
    }

    fn car(&mut self, index: u16, now: Duration) -> Car {
        let entry = self.entries.get(&index);
        let rival = &self.cars[&index];
        let update = &rival.update.value;
        let stale = now.saturating_sub(rival.update.at) >= UDP_TTL;
        let name = entry
            .and_then(|e| e.drivers.get(usize::from(update.driver)))
            .cloned()
            .unwrap_or_default();
        let class = entry.map(|e| Class {
            id: ClassId(u32::from(e.cup)),
            name: cup_name(e.cup),
        });
        let (laps, best, last) = rival
            .stable
            .as_ref()
            .map_or((None, None, None), |(n, b, l)| {
                (Some(u32::from(*n)), b.time, l.time)
            });
        let sectors = rival.stable.as_ref().map_or_else(Vec::new, |(_, _, l)| {
            l.splits.iter().map(|s| quality(*s, stale)).collect()
        });
        let current_sector = update
            .current
            .splits
            .iter()
            .position(Option::is_none)
            .and_then(|i| u8::try_from(i).ok());
        let pose = pose(update.x, update.y, update.yaw);
        let distance = self
            .track
            .as_ref()
            .and_then(|(_, _, m)| distance(update.spline, *m));
        let car = Car {
            id: CarId(u32::from(index)),
            number: entry
                .filter(|e| e.number >= 0)
                .map_or_else(String::new, |e| e.number.to_string()),
            class,
            position: quality(
                (update.position > 0).then(|| u32::from(update.position)),
                stale,
            ),
            class_position: quality(
                (update.cup_position > 0).then(|| u32::from(update.cup_position)),
                stale,
            ),
            laps: quality(laps, stale),
            best_lap_s: quality(best, stale),
            last_lap_s: quality(last, stale),
            last_sectors_s: sectors,
            in_pits: quality(location(update.location), stale),
            pose: quality(pose, stale),
            velocity_mps: rival.velocity.quality(now),
            lap_distance_m: estimated(distance, stale),
            lap_elapsed_s: quality(update.current.time, stale),
            current_sector: estimated(current_sector, stale),
            ..Car::default()
        };
        Car {
            driver: self.driver(&name),
            ..car
        }
    }

    fn player(&self, id: CarId, g: &[u8], gs: bool, now: Duration) -> Player {
        // SDK SHM 1.8.12: tyreWear y suspensionDamage NO se usan en ACC.
        // carDamage describe cinco zonas, sin escala ni separación aero/body:
        // no convertir sus ceros (ni otros valores) en integridad 0–1 inventada.
        // Los cuatro neumáticos, aero, body y suspension quedan Unavailable.
        let mut player = Player {
            car: id,
            ..Player::default()
        };
        if let Some((p, stale)) = self.page(0, now) {
            let stale = stale || gs || self.physics_zero;
            // SDK physics.pitLimiterOn @248: bool nativo, reloj de physics.
            player.pit_limiter_active = quality(boolean(i32_at(p, 248)), stale);
            player.telemetry = Telemetry {
                throttle: quality(fraction(f32_at(p, 4)), stale),
                brake: quality(fraction(f32_at(p, 8)), stale),
                clutch: quality(fraction(f32_at(p, 364)), stale),
                // Physics.steerAngle @24: -1..1 (izquierda a derecha), no radianes.
                steering: quality(steering(f32_at(p, 24)), stale),
                gear: quality(
                    i32_at(p, 16)
                        .checked_sub(1)
                        .and_then(|v| i8::try_from(v).ok())
                        .filter(|v| (-1..=8).contains(v)),
                    stale,
                ),
                speed_mps: quality(nonnegative(f32_at(p, 28) / 3.6), stale),
                engine_speed_rad_s: quality(
                    nonnegative(f64::from(i32_at(p, 20)) * TAU / 60.0),
                    stale,
                ),
            };
        }
        // SDK SHM: physics.fuel está documentado en kg; maxFuel no fija unidad.
        // No asumir litros ni densidad. Graphics sí documenta fuelXLap en litros.
        player.fuel = Fuel {
            per_lap_l: quality(positive(f32_at(g, 1284)), gs),
            laps_left: estimated(positive(f32_at(g, 1412)), gs),
            ..Fuel::default()
        };
        let delta = i32_at(g, 1360);
        let signed = f64::from(delta) / 1000.0 * if i32_at(g, 1400) == 1 { 1.0 } else { -1.0 };
        player.delta_best_s = quality(
            (delta != i32::MAX && signed.abs() < 10_000.0).then_some(signed),
            gs,
        );
        player
    }

    fn session_model(&self, s: &[u8], g: &[u8], gs: bool, now: Duration) -> Session {
        if !g.is_empty() && i32_at(g, 4) == 0 {
            return Session {
                id: SessionId(self.epoch),
                track_name: quality(Some(wide_at(s, 134, 66)), false),
                ..Session::default()
            };
        }
        let udp = self.session.as_ref();
        let us = udp.is_none_or(|u| now.saturating_sub(u.at) >= UDP_TTL);
        let kind = if g.is_empty() {
            Quality::Unavailable
        } else {
            quality(Some(shm_kind(i32_at(g, 8))), gs)
        };
        let kind = if kind.current().is_some() {
            kind
        } else {
            udp.map_or(kind, |u| quality(Some(udp_kind(u.value.kind)), us))
        };
        let mut state = udp.map_or(Quality::Unavailable, |u| quality(phase(u.value.phase), us));
        if !g.is_empty() {
            let status = i32_at(g, 4);
            let inferred = if i32_at(g, 1528) == 1 || status == 3 {
                Some(SessionState::Interrupted)
            } else if i32_at(g, 1524) == 1 {
                Some(SessionState::Finished)
            } else if matches!(status, 1 | 2) {
                Some(SessionState::Running)
            } else {
                None
            };
            if (inferred == Some(SessionState::Interrupted) && !gs) || state.current().is_none() {
                state = estimated(inferred, gs);
            }
        }
        let elapsed = udp.and_then(|u| nonnegative(u.value.elapsed));
        let mut remaining = udp
            // En el corpus ambos relojes suman 3600 s: el SDK llama
            // SessionEndTime al tiempo RESTANTE, no al instante de final.
            .and_then(|u| nonnegative(u.value.end))
            .map_or(Quality::Unavailable, |v| quality(Some(v), us));
        if !g.is_empty() && !gs {
            remaining = quality(nonnegative(f32_at(g, 152) / 1000.0), false);
        }
        let track = self.track.as_ref();
        let name = wide_at(s, 134, 66);
        Session {
            id: SessionId(self.epoch),
            kind,
            state,
            elapsed_s: quality(elapsed, us),
            remaining_s: remaining,
            track_name: quality(
                (!name.is_empty())
                    .then_some(name)
                    .or_else(|| track.map(|t| t.1.clone())),
                false,
            ),
            track_length_m: quality(track.and_then(|t| (t.2 > 0.0).then_some(t.2)), false),
            weather: self.weather(g, gs, now),
            // numberOfLaps ambiguo en ACC: no declarar una duración sin evidencia.
            ..Session::default()
        }
    }

    fn weather(&self, g: &[u8], gs: bool, now: Duration) -> Weather {
        let paused = !g.is_empty() && i32_at(g, 4) == 3;
        let mut weather = Weather::default();
        if let Some((p, stale)) = self.page(0, now) {
            let stale = stale || paused || self.physics_zero;
            // physics.airTemp/roadTemp son °C; SI = °C + 273.15, sin ceros de relleno.
            weather.air_temperature_k = quality(nonnegative(f32_at(p, 288) + 273.15), stale);
            weather.track_temperature_k = quality(nonnegative(f32_at(p, 292) + 273.15), stale);
        }
        if !g.is_empty() {
            // graphics.windSpeed ya está en m/s (SDK SHM 1.8.12).
            weather.wind_speed_mps = quality(nonnegative(f32_at(g, 1248)), gs || paused);
            // rainIntensity es ordinal 0..5, NO una fracción: solo NO_RAIN (0)
            // tiene equivalencia exacta. No dividir por 5 ni usar los pronósticos.
            if i32_at(g, 1560) == 0 {
                weather.rain = quality(Some(0.0), gs || paused);
            }
        }
        if let Some(u) = &self.session {
            let stale = now.saturating_sub(u.at) >= UDP_TTL || paused;
            // Physics tiene más precisión; un UDP actual gana a physics obsoleta.
            weather.air_temperature_k = prefer(
                weather.air_temperature_k,
                quality(Some(u.value.air_temperature_k), stale),
            );
            weather.track_temperature_k = prefer(
                weather.track_temperature_k,
                quality(Some(u.value.track_temperature_k), stale),
            );
            // Fracciones nativas del SDK UDP; su reloj no refresca physics/graphics.
            let rain = quality(fraction(u.value.rain), stale);
            if rain.current().is_some() || weather.rain.current().is_none() {
                weather.rain = rain;
            }
            weather.track_wetness = quality(fraction(u.value.wetness), stale);
        }
        // windDirection (@1252) está en radianes, pero el SDK no fija norte,
        // sentido ni procedencia: no prometer la convención meteorológica común.
        // trackGripStatus (@1556) mezcla goma/grip y humedad: no es wetness 0–1.
        // pressure no existe; airDensity no se usa. Static no aporta clima live.
        weather
    }
}

fn player_car(
    car: &mut Car,
    g: &[u8],
    stale: bool,
    physics: Option<(&[u8], bool)>,
    track: Option<&(i32, String, f64)>,
) -> bool {
    // Graphics 1.9: penalty @1228 es un enum, NO un contador; penaltyTime
    // @1220 es tiempo de espera, NO cantidad. DT/SG indican al menos una
    // sanción pendiente (Estimated(1)); no sabemos si hay varias en cola.
    // DSQ, vuelta borrada y tiempo post-carrera no prueban servicio pendiente.
    let penalty = match i32_at(g, 1228) {
        0 if f32_at(g, 1220) == 0.0 => Quality::Reliable(0),
        1..=4 | 7..=10 | 19 => Quality::Estimated(1),
        _ => Quality::Unavailable,
    };
    car.pending_penalties = if stale {
        match penalty {
            Quality::Reliable(v) | Quality::Estimated(v) => Quality::Stale(v),
            other => other,
        }
    } else {
        penalty
    };
    // Broadcasting solo ofrece km/h escalar. Ni velocidad vectorial de
    // rivales ni contador de sanciones: permanecen Unavailable.
    car.position = prefer(
        quality(u32::try_from(i32_at(g, 136)).ok().filter(|p| *p > 0), stale),
        car.position,
    );
    car.in_pits = prefer(
        quality(Some(i32_at(g, 160) == 1 || i32_at(g, 1236) == 1), stale),
        car.in_pits,
    );
    car.laps = prefer(quality(u32::try_from(i32_at(g, 132)).ok(), stale), car.laps);
    car.last_lap_s = prefer(quality(lap_ms(i32_at(g, 144)), stale), car.last_lap_s);
    car.best_lap_s = prefer(quality(lap_ms(i32_at(g, 148)), stale), car.best_lap_s);
    car.lap_elapsed_s = prefer(
        quality(
            nonnegative(f64::from(i32_at(g, 140)) / 1000.0).filter(|_| i32_at(g, 140) != i32::MAX),
            stale,
        ),
        car.lap_elapsed_s,
    );
    // iEstimatedLapTime @1396: ms; MAX/0/negativos son marcadores.
    car.estimated_lap_s = estimated(lap_ms(i32_at(g, 1396)), stale);
    car.current_sector = prefer(
        quality(u8::try_from(i32_at(g, 164)).ok().filter(|s| *s < 3), stale),
        car.current_sector,
    );
    let gap = i32_at(g, 1580);
    car.gap_ahead = prefer(
        quality(
            (gap >= 0
                && gap != i32::MAX
                && i32_at(g, 136) > 1
                && car.in_pits.current() == Some(&false))
            .then(|| Gap::Time {
                seconds: f64::from(gap) / 1000.0,
            }),
            stale,
        ),
        car.gap_ahead,
    );
    car.lap_distance_m = prefer(
        estimated(track.and_then(|t| distance(f32_at(g, 248), t.2)), stale),
        car.lap_distance_m,
    );
    // No indexar por playerCarID: es un ID, no un hueco (especialmente online).
    if let (Some([x, y]), Some((p, ps))) = (graphics_position(g, car.id), physics) {
        let shm_pose = quality(pose(x, y, f32_at(p, 208)), stale || ps);
        let current = shm_pose.current().is_some();
        car.pose = prefer(shm_pose, car.pose);
        current
    } else {
        false
    }
}

fn graphics_position(g: &[u8], id: CarId) -> Option<[f64; 2]> {
    let slot = (0..60).find(|slot| u32::try_from(i32_at(g, 976 + slot * 4)).ok() == Some(id.0))?;
    let position = [f32_at(g, 256 + slot * 12), f32_at(g, 264 + slot * 12)];
    position.iter().all(|v| v.is_finite()).then_some(position)
}

fn boolean(value: i32) -> Option<bool> {
    match value {
        0 => Some(false),
        1 => Some(true),
        _ => None,
    }
}

fn lap_ms(ms: i32) -> Option<f64> {
    (ms > 0 && ms != i32::MAX).then(|| f64::from(ms) / 1000.0)
}
fn nonnegative(v: f64) -> Option<f64> {
    (v.is_finite() && v >= 0.0).then_some(v)
}
fn positive(v: f64) -> Option<f64> {
    nonnegative(v).filter(|v| *v > 0.0)
}
// Preferencia por señal: SHM actual, UDP actual, SHM obsoleta, UDP obsoleta.
fn prefer<T>(shm: Quality<T>, udp: Quality<T>) -> Quality<T> {
    if shm.current().is_some() || (udp.current().is_none() && !matches!(shm, Quality::Unavailable))
    {
        shm
    } else {
        udp
    }
}
fn fraction(v: f64) -> Option<f64> {
    (v.is_finite() && (0.0..=1.0).contains(&v)).then_some(v)
}
fn distance(spline: f64, meters: f64) -> Option<f64> {
    (spline.is_finite() && (0.0..=1.0).contains(&spline) && meters.is_finite() && meters > 0.0)
        .then_some(spline * meters)
}
fn pose(x: f64, y: f64, yaw: f64) -> Option<Pose> {
    (x.is_finite() && y.is_finite() && yaw.is_finite()).then_some(Pose {
        x_m: x,
        y_m: y,
        yaw_rad: FRAC_PI_2 + yaw,
    })
}
fn location(v: u8) -> Option<bool> {
    match v {
        1 => Some(false),
        2..=4 => Some(true),
        _ => None,
    }
}
fn quality<T>(v: Option<T>, stale: bool) -> Quality<T> {
    match v {
        Some(v) if stale => Quality::Stale(v),
        Some(v) => Quality::Reliable(v),
        None => Quality::Unavailable,
    }
}
fn estimated<T>(v: Option<T>, stale: bool) -> Quality<T> {
    match v {
        Some(v) if stale => Quality::Stale(v),
        Some(v) => Quality::Estimated(v),
        None => Quality::Unavailable,
    }
}
fn cup_name(cup: u8) -> String {
    match cup {
        0 => "Pro".into(),
        1 => "ProAm".into(),
        2 => "Am".into(),
        3 => "Silver".into(),
        4 => "National".into(),
        _ => format!("cupCategory:{cup}"),
    }
}
fn shm_kind(kind: i32) -> SessionKind {
    match kind {
        0 => SessionKind::Practice,
        1 | 8 => SessionKind::Qualifying,
        2 => SessionKind::Race,
        _ => SessionKind::Other(format!("session:{kind}")),
    }
}
fn udp_kind(kind: u8) -> SessionKind {
    match kind {
        0 => SessionKind::Practice,
        4 | 9 => SessionKind::Qualifying,
        10 => SessionKind::Race,
        _ => SessionKind::Other(format!("sessionType:{kind}")),
    }
}
fn phase(v: u8) -> Option<SessionState> {
    match v {
        1..=4 => Some(SessionState::Preparing),
        5 => Some(SessionState::Running),
        6..=8 => Some(SessionState::Finished),
        _ => None,
    }
}

fn flags(g: &[u8], player: Option<CarId>, stale: bool) -> Quality<Vec<Flag>> {
    let mut flags = Vec::new();
    for (offset, kind) in [
        (1528, FlagKind::Red),
        (1500, FlagKind::Yellow),
        (1524, FlagKind::Checkered),
        (1516, FlagKind::White),
        (1520, FlagKind::Green),
    ] {
        if i32_at(g, offset) == 1 {
            flags.push(Flag {
                kind,
                scope: FlagScope::Session,
            });
        }
    }
    for sector in 0_u8..3 {
        if i32_at(g, 1504 + usize::from(sector) * 4) == 1 {
            flags.push(Flag {
                kind: FlagKind::Yellow,
                scope: FlagScope::Sector(sector),
            });
        }
    }
    let code = i32_at(g, 1224);
    if let Some(id) = player.filter(|_| code != 0) {
        let kind = match code {
            1 => FlagKind::Blue,
            2 => FlagKind::Yellow,
            3 => FlagKind::Black,
            4 => FlagKind::White,
            5 => FlagKind::Checkered,
            7 => FlagKind::Green,
            6 => FlagKind::Other("penalty".into()),
            8 => FlagKind::Other("orange".into()),
            _ => FlagKind::Other(format!("flag:{code}")),
        };
        flags.push(Flag {
            kind,
            scope: FlagScope::Car(id),
        });
    }
    quality(Some(flags), stale)
}

fn capability<T>(values: impl IntoIterator<Item = Quality<T>>) -> Capability {
    values
        .into_iter()
        .fold(Capability::Supported, |best, value| {
            best.max(match value {
                Quality::Reliable(_) | Quality::Estimated(_) => Capability::Fresh,
                Quality::Stale(_) => Capability::WithData,
                Quality::Unavailable => Capability::Supported,
            })
        })
}

fn capabilities(s: &State) -> Capabilities {
    let p = s.player.unwrap_or_default();
    Capabilities {
        session_clock: capability([s.session.elapsed_s, s.session.remaining_s]),
        positions: capability(s.cars.iter().map(|c| c.position)),
        lap_times: capability(s.cars.iter().flat_map(|c| [c.best_lap_s, c.last_lap_s])),
        gaps: capability(s.cars.iter().map(|c| c.gap_ahead)),
        pit_status: capability(s.cars.iter().map(|c| c.in_pits)),
        flags: capability([s.flags.clone()]),
        spatial: capability(s.cars.iter().map(|c| c.pose)),
        driver_inputs: capability([
            p.telemetry.throttle,
            p.telemetry.brake,
            p.telemetry.clutch,
            p.telemetry.steering,
        ]),
        powertrain: capability([p.telemetry.speed_mps, p.telemetry.engine_speed_rad_s]),
        fuel: capability([
            p.fuel.level_l,
            p.fuel.capacity_l,
            p.fuel.per_lap_l,
            p.fuel.laps_left,
        ]),
        delta: capability([p.delta_best_s]),
        sectors: capability(s.cars.iter().map(|c| c.current_sector)),
        lap_progress: capability(
            s.cars
                .iter()
                .flat_map(|c| [c.lap_distance_m, c.lap_elapsed_s]),
        ),
        weather: capability([
            s.session.weather.air_temperature_k,
            s.session.weather.track_temperature_k,
            s.session.weather.wind_speed_mps,
            s.session.weather.rain,
            s.session.weather.track_wetness,
        ]),
        // Ninguna señal de daño tiene conversión fiable al contrato de integridad.
        damage: Capability::Unsupported,
    }
}

fn steering(value: f64) -> Option<f64> {
    (-1.0..=1.0).contains(&value).then_some(value)
}

#[cfg(test)]
mod steering_tests {
    use super::*;

    #[test]
    fn physics_steering_is_normalized_and_keeps_its_own_freshness() {
        for (raw, expected) in [
            (-1.0_f32, Quality::Reliable(-1.0)),
            (-0.5, Quality::Reliable(-0.5)),
            (0.0, Quality::Reliable(0.0)),
            (0.5, Quality::Reliable(0.5)),
            (1.0, Quality::Reliable(1.0)),
            (-1.01, Quality::Unavailable),
            (1.01, Quality::Unavailable),
            (f32::NAN, Quality::Unavailable),
            (f32::INFINITY, Quality::Unavailable),
        ] {
            let mut translator = Translator::new(SourceKind::Live);
            let mut physics = vec![0; PAGE_SIZES[0]];
            physics[24..28].copy_from_slice(&raw.to_le_bytes());
            translator.pages[0] = Some(Page {
                bytes: physics,
                at: Duration::ZERO,
            });
            let graphics = vec![0; PAGE_SIZES[1]];
            let fresh = translator.player(CarId(1), &graphics, false, Duration::ZERO);
            assert_eq!(fresh.telemetry.steering, expected);
            let old = translator.player(CarId(1), &graphics, false, SHM_TTL);
            assert_eq!(
                old.telemetry.steering,
                match expected {
                    Quality::Reliable(v) => Quality::Stale(v),
                    _ => Quality::Unavailable,
                }
            );
            let state = State {
                player: Some(fresh),
                ..State::default()
            };
            assert_eq!(capabilities(&state).driver_inputs, Capability::Fresh);
        }
    }
}

#[cfg(test)]
mod second_round_tests {
    use super::*;

    #[test]
    fn penalty_enum_is_not_a_counter_or_a_duration_and_rival_velocity_is_absent() {
        for (code, time, expected) in [
            (0_i32, 0.0_f32, Quality::Reliable(0)),
            (1, 0.0, Quality::Estimated(1)),
            (4, 30.0, Quality::Estimated(1)),
            (7, 0.0, Quality::Estimated(1)),
            (10, 30.0, Quality::Estimated(1)),
            (19, 0.0, Quality::Estimated(1)),
            (0, 5.0, Quality::Unavailable),
            (14, 30.0, Quality::Unavailable),
            (5, 0.0, Quality::Unavailable),
            (6, 0.0, Quality::Unavailable),
            (-1, 0.0, Quality::Unavailable),
            (22, 0.0, Quality::Unavailable),
            (99, 0.0, Quality::Unavailable),
            (0, f32::NAN, Quality::Unavailable),
        ] {
            let mut g = vec![0_u8; PAGE_SIZES[1]];
            g[1228..1232].copy_from_slice(&code.to_le_bytes());
            g[1220..1224].copy_from_slice(&time.to_le_bytes());
            let mut car = Car::default();
            player_car(&mut car, &g, false, None, None);
            assert_eq!(car.pending_penalties, expected, "enum {code}");
            assert_eq!(car.velocity_mps, Quality::Unavailable);
            player_car(&mut car, &g, true, None, None);
            let stale = match expected {
                Quality::Reliable(v) | Quality::Estimated(v) => Quality::Stale(v),
                other => other,
            };
            assert_eq!(car.pending_penalties, stale);
        }
    }
}

#[cfg(test)]
mod pit_signals_tests {
    use super::*;

    fn int(bytes: &mut [u8], at: usize, value: i32) {
        bytes[at..at + 4].copy_from_slice(&value.to_le_bytes());
    }
    fn translator(limiter: i32, estimate: i32) -> Translator {
        let mut t = Translator::new(SourceKind::Replay);
        let mut p = vec![0; PAGE_SIZES[0]];
        let mut g = vec![0; PAGE_SIZES[1]];
        int(&mut p, 0, 1);
        int(&mut p, 248, limiter);
        // Evitar la página cero de pausa, incluso con limitador apagado.
        p[4..8].copy_from_slice(&0.1_f32.to_le_bytes());
        int(&mut g, 0, 1);
        int(&mut g, 4, 2);
        int(&mut g, 1396, estimate);
        t.shm(0, p, Duration::ZERO).expect("physics");
        t.shm(1, g, Duration::ZERO).expect("graphics");
        t
    }
    #[test]
    fn real_acc_replay_has_a_native_limiter_and_no_positive_estimate() {
        use vantare_domain::Adapter;
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../testdata/acc/acc-sesion-udp-20260929.tar.gz");
        let mut replay = super::super::replay::open_acc_replay(&path).expect("corpus obligatorio");
        let mut found = false;
        for _ in 0..10_000 {
            if let Some(obs) = replay.poll(Duration::from_secs(2)).expect("replay")
                && let Some(p) = obs.state.player
                && p.pit_limiter_active.current().is_some()
            {
                assert_eq!(p.pit_limiter_active, Quality::Reliable(true));
                assert_eq!(
                    obs.state.player_car().expect("jugador").estimated_lap_s,
                    Quality::Unavailable
                );
                found = true;
                break;
            }
        }
        assert!(found, "el test no puede pasar sin foto del jugador real");
    }

    #[test]
    fn limiter_is_strict_boolean_and_udp_or_graphics_cannot_refresh_physics() {
        for (raw, expected) in [
            (0, Quality::Reliable(false)),
            (1, Quality::Reliable(true)),
            (-1, Quality::Unavailable),
            (2, Quality::Unavailable),
        ] {
            let t = translator(raw, 90123);
            let g = &t.pages[1].as_ref().expect("graphics").bytes;
            let p = t.player(CarId(1), g, false, Duration::ZERO);
            assert_eq!(p.pit_limiter_active, expected);
            assert_eq!(p.pit_stop_stopped, Quality::Unavailable);
        }
        let mut t = translator(1, 90123);
        let mut g = t.pages[1].as_ref().expect("graphics").bytes.clone();
        int(&mut g, 0, 2);
        t.shm(1, g.clone(), Duration::from_millis(500))
            .expect("graphics actual");
        assert_eq!(
            t.player(CarId(1), &g, false, Duration::from_millis(500))
                .pit_limiter_active,
            Quality::Stale(true)
        );
        assert_eq!(
            t.player(CarId(1), &g, true, Duration::ZERO)
                .pit_limiter_active,
            Quality::Stale(true)
        );
    }
    #[test]
    fn estimate_ms_is_not_measured_and_markers_are_unavailable() {
        for (ms, expected) in [
            (90123, Quality::Estimated(90.123)),
            (0, Quality::Unavailable),
            (-1, Quality::Unavailable),
            (i32::MAX, Quality::Unavailable),
        ] {
            let t = translator(0, ms);
            let g = &t.pages[1].as_ref().expect("graphics").bytes;
            let mut car = Car::default();
            player_car(&mut car, g, false, None, None);
            assert_eq!(car.estimated_lap_s, expected);
            player_car(&mut car, g, true, None, None);
            assert_eq!(
                car.estimated_lap_s,
                if ms == 90123 {
                    Quality::Stale(90.123)
                } else {
                    Quality::Unavailable
                }
            );
        }
    }
}
