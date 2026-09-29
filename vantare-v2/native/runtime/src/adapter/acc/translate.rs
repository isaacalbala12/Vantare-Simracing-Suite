//! Fusión por señal. Los relojes de physics, graphics y cada coche UDP son
//! independientes; recibir un datagrama nunca refresca una página SHM vieja.
use std::collections::{BTreeMap, HashMap};
use std::f64::consts::{FRAC_PI_2, TAU};
use std::io;
use std::time::Duration;

use vantare_domain::{
    Capabilities, Capability, Car, CarId, Class, ClassId, Driver, DriverId, Flag, FlagKind,
    FlagScope, Fuel, Gap, Observation, Origin, Player, Pose, Quality, Session, SessionId,
    SessionKind, SessionState, Source, SourceKind, State, Telemetry,
};

use super::bytes::{f32_at, i32_at, invalid, wide_at};
use super::protocol::{self, CarUpdate, Entry, Lap, Message, SessionUpdate};

const SHM_TTL: Duration = Duration::from_millis(500);
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
    // CrewChief: no aceptar lapCount/best/last entre spline 0.93 y 0.07.
    stable: Option<(u16, Lap, Lap)>,
}

pub(super) struct Translator {
    kind: SourceKind,
    pages: [Option<Page>; 3],
    physics_zero: bool,
    player_laps: Option<(u32, Option<f64>, Option<f64>)>,
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
            kind,
            pages: [None, None, None],
            physics_zero: false,
            player_laps: None,
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
        self.session = None;
        self.track = None;
        self.shm_signature = None;
        self.udp_signature = None;
        self.request_entries = true;
        self.request_track = true;
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
        Ok(true)
    }

    pub(super) fn udp(&mut self, bytes: &[u8], at: Duration) -> io::Result<bool> {
        match protocol::parse(bytes)? {
            Message::Registration { id, success } => {
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
                self.cars.insert(
                    update.index,
                    Rival {
                        update: Timed { value: update, at },
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
                    self.entries.insert(entry.index, entry);
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
            }
            Message::Event => return Ok(false),
        }
        Ok(true)
    }

    fn page(&self, index: usize, now: Duration) -> Option<(&[u8], bool)> {
        let p = self.pages[index].as_ref()?;
        let stale = p.at < self.floor || now.saturating_sub(p.at) >= SHM_TTL;
        Some((&p.bytes, stale))
    }

    pub(super) fn observe(&mut self, now: Duration) -> Option<Observation> {
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
                player_car(
                    car,
                    g,
                    gs || paused,
                    self.page(0, now)
                        .map(|(p, stale)| (p, stale || self.physics_zero)),
                    self.track.as_ref(),
                );
                if let Some((laps, best, last)) = self.player_laps {
                    car.laps = quality(Some(laps), gs || paused);
                    car.best_lap_s = quality(best, gs || paused);
                    car.last_lap_s = quality(last, gs || paused);
                }
            }
        }
        let state = State {
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
        let mut player = Player {
            car: id,
            ..Player::default()
        };
        if let Some((p, stale)) = self.page(0, now) {
            let stale = stale || gs || self.physics_zero;
            player.telemetry = Telemetry {
                throttle: quality(fraction(f32_at(p, 4)), stale),
                brake: quality(fraction(f32_at(p, 8)), stale),
                clutch: quality(fraction(f32_at(p, 364)), stale),
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
            let level = f32_at(p, 12);
            let capacity = self.pages[2]
                .as_ref()
                .map_or(0.0, |s| f32_at(&s.bytes, 416));
            if level.is_finite()
                && capacity.is_finite()
                && capacity > 0.0
                && (0.0..=capacity).contains(&level)
            {
                // Litros según lectores de ACC; la unidad física no se demuestra con jugador parado.
                player.fuel = Fuel {
                    level_l: quality(Some(level), stale),
                    capacity_l: quality(Some(capacity), stale),
                    ..Fuel::default()
                };
            }
        }
        let delta = i32_at(g, 1360);
        let signed = f64::from(delta) / 1000.0 * if i32_at(g, 1400) == 1 { 1.0 } else { -1.0 };
        player.delta_best_s = quality(
            (delta != i32::MAX && signed.abs() < 10_000.0).then_some(signed),
            gs,
        );
        player
    }

    fn session_model(&self, s: &[u8], g: &[u8], gs: bool, now: Duration) -> Session {
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
            if inferred == Some(SessionState::Interrupted) || state.current().is_none() {
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
            // numberOfLaps ambiguo en ACC: no declarar una duración sin evidencia.
            ..Session::default()
        }
    }
}

fn player_car(
    car: &mut Car,
    g: &[u8],
    stale: bool,
    physics: Option<(&[u8], bool)>,
    track: Option<&(i32, String, f64)>,
) {
    car.position = quality(u32::try_from(i32_at(g, 136)).ok().filter(|p| *p > 0), stale);
    car.in_pits = quality(Some(i32_at(g, 160) == 1 || i32_at(g, 1236) == 1), stale);
    car.laps = quality(u32::try_from(i32_at(g, 132)).ok(), stale);
    car.last_lap_s = quality(lap_ms(i32_at(g, 144)), stale);
    car.best_lap_s = quality(lap_ms(i32_at(g, 148)), stale);
    car.lap_elapsed_s = quality(
        nonnegative(f64::from(i32_at(g, 140)) / 1000.0).filter(|_| i32_at(g, 140) != i32::MAX),
        stale,
    );
    car.current_sector = quality(u8::try_from(i32_at(g, 164)).ok().filter(|s| *s < 3), stale);
    car.gap_ahead = quality(
        lap_ms(i32_at(g, 1580)).map(|seconds| Gap::Time { seconds }),
        stale,
    );
    car.lap_distance_m = estimated(track.and_then(|t| distance(f32_at(g, 248), t.2)), stale);
    // No indexar por playerCarID: es un ID, no un hueco (especialmente online).
    let slot = (0..60).find(|slot| u32::try_from(i32_at(g, 976 + slot * 4)).ok() == Some(car.id.0));
    if let (Some(slot), Some((p, ps))) = (slot, physics) {
        car.pose = quality(
            pose(
                f32_at(g, 256 + slot * 12),
                f32_at(g, 264 + slot * 12),
                f32_at(p, 208),
            ),
            stale || ps,
        );
    }
}

fn lap_ms(ms: i32) -> Option<f64> {
    (ms > 0 && ms != i32::MAX).then(|| f64::from(ms) / 1000.0)
}
fn nonnegative(v: f64) -> Option<f64> {
    (v.is_finite() && v >= 0.0).then_some(v)
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
        driver_inputs: capability([p.telemetry.throttle, p.telemetry.brake, p.telemetry.clutch]),
        powertrain: capability([p.telemetry.speed_mps, p.telemetry.engine_speed_rad_s]),
        fuel: capability([p.fuel.level_l, p.fuel.capacity_l]),
        delta: capability([p.delta_best_s]),
        sectors: capability(s.cars.iter().map(|c| c.current_sector)),
        lap_progress: capability(
            s.cars
                .iter()
                .flat_map(|c| [c.lap_distance_m, c.lap_elapsed_s]),
        ),
    }
}
