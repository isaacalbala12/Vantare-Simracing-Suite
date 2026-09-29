//! DTO explícito del `Snapshot`: es el formato del cable, no los tipos de
//! `domain` (que no son ABI). Añadir una señal al modelo exige añadirla aquí a
//! propósito; un campo que sobra en el cable se ignora, uno que falta es error.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use vantare_domain as d;

use crate::Error;

/// Versión del DTO. Se sube al cambiar el esquema de forma incompatible.
pub(crate) const VERSION: u32 = 2;

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct SnapshotDto {
    pub version: u32,
    pub epoch: u64,
    pub sequence: u64,
    origin: OriginDto,
    state: StateDto,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum QualityDto<T> {
    Reliable(T),
    Estimated(T),
    Stale(T),
    Unavailable,
}

#[derive(Debug, Serialize, Deserialize)]
struct OriginDto {
    simulator: String,
    kind: SourceKindDto,
    source_time: Option<Duration>,
    received_at: Duration,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum SourceKindDto {
    Live,
    Replay,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum CapabilityDto {
    Unsupported,
    Supported,
    WithData,
    Fresh,
}

#[derive(Debug, Serialize, Deserialize)]
struct CapabilitiesDto {
    session_clock: CapabilityDto,
    positions: CapabilityDto,
    lap_times: CapabilityDto,
    gaps: CapabilityDto,
    pit_status: CapabilityDto,
    flags: CapabilityDto,
    spatial: CapabilityDto,
    driver_inputs: CapabilityDto,
    powertrain: CapabilityDto,
    fuel: CapabilityDto,
    delta: CapabilityDto,
    sectors: CapabilityDto,
    lap_progress: CapabilityDto,
}

#[derive(Debug, Serialize, Deserialize)]
struct StateDto {
    capabilities: CapabilitiesDto,
    session: SessionDto,
    flags: QualityDto<Vec<FlagDto>>,
    cars: Vec<CarDto>,
    player: Option<PlayerDto>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SessionDto {
    id: u64,
    kind: QualityDto<SessionKindDto>,
    state: QualityDto<SessionStateDto>,
    elapsed_s: QualityDto<f64>,
    remaining_s: QualityDto<f64>,
    track_name: QualityDto<String>,
    laps_remaining: QualityDto<u32>,
    laps_total: QualityDto<u32>,
    track_length_m: QualityDto<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum SessionKindDto {
    Practice,
    Qualifying,
    Race,
    Other(String),
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum SessionStateDto {
    Preparing,
    Running,
    Interrupted,
    Finished,
}

#[derive(Debug, Serialize, Deserialize)]
struct FlagDto {
    kind: FlagKindDto,
    scope: FlagScopeDto,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum FlagKindDto {
    Green,
    Yellow,
    Blue,
    Red,
    White,
    Black,
    Checkered,
    Other(String),
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum FlagScopeDto {
    Session,
    Sector(u8),
    Car(u32),
}

#[derive(Debug, Serialize, Deserialize)]
struct CarDto {
    id: u32,
    number: String,
    driver_id: u32,
    driver_name: String,
    class: Option<(u32, String)>,
    position: QualityDto<u32>,
    class_position: QualityDto<u32>,
    laps: QualityDto<u32>,
    last_lap_s: QualityDto<f64>,
    best_lap_s: QualityDto<f64>,
    last_sectors_s: Vec<QualityDto<f64>>,
    gap_leader: QualityDto<GapDto>,
    gap_ahead: QualityDto<GapDto>,
    gap_class_leader: QualityDto<GapDto>,
    gap_class_ahead: QualityDto<GapDto>,
    lap_distance_m: QualityDto<f64>,
    lap_elapsed_s: QualityDto<f64>,
    current_sector: QualityDto<u8>,
    in_pits: QualityDto<bool>,
    pose: QualityDto<PoseDto>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum GapDto {
    Time { seconds: f64 },
    Laps { count: u32 },
}

#[derive(Debug, Serialize, Deserialize)]
struct PoseDto {
    x_m: f64,
    y_m: f64,
    yaw_rad: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct PlayerDto {
    car: u32,
    throttle: QualityDto<f64>,
    brake: QualityDto<f64>,
    clutch: QualityDto<f64>,
    gear: QualityDto<i8>,
    speed_mps: QualityDto<f64>,
    engine_speed_rad_s: QualityDto<f64>,
    fuel_level_l: QualityDto<f64>,
    fuel_capacity_l: QualityDto<f64>,
    fuel_per_lap_l: QualityDto<f64>,
    fuel_laps_left: QualityDto<f64>,
    delta_best_s: QualityDto<f64>,
}

// --- dominio → DTO ---------------------------------------------------------

fn q<T, U>(quality: &d::Quality<T>, f: impl FnOnce(&T) -> U) -> QualityDto<U> {
    match quality {
        d::Quality::Reliable(v) => QualityDto::Reliable(f(v)),
        d::Quality::Estimated(v) => QualityDto::Estimated(f(v)),
        d::Quality::Stale(v) => QualityDto::Stale(f(v)),
        d::Quality::Unavailable => QualityDto::Unavailable,
    }
}

fn copied<T: Copy>(v: &T) -> T {
    *v
}

fn cap(c: d::Capability) -> CapabilityDto {
    match c {
        d::Capability::Unsupported => CapabilityDto::Unsupported,
        d::Capability::Supported => CapabilityDto::Supported,
        d::Capability::WithData => CapabilityDto::WithData,
        d::Capability::Fresh => CapabilityDto::Fresh,
    }
}

fn gap(g: &d::Gap) -> GapDto {
    match *g {
        d::Gap::Time { seconds } => GapDto::Time { seconds },
        d::Gap::Laps { count } => GapDto::Laps { count },
    }
}

fn flag(f: &d::Flag) -> FlagDto {
    let kind = match &f.kind {
        d::FlagKind::Green => FlagKindDto::Green,
        d::FlagKind::Yellow => FlagKindDto::Yellow,
        d::FlagKind::Blue => FlagKindDto::Blue,
        d::FlagKind::Red => FlagKindDto::Red,
        d::FlagKind::White => FlagKindDto::White,
        d::FlagKind::Black => FlagKindDto::Black,
        d::FlagKind::Checkered => FlagKindDto::Checkered,
        d::FlagKind::Other(name) => FlagKindDto::Other(name.clone()),
    };
    let scope = match f.scope {
        d::FlagScope::Session => FlagScopeDto::Session,
        d::FlagScope::Sector(i) => FlagScopeDto::Sector(i),
        d::FlagScope::Car(id) => FlagScopeDto::Car(id.0),
    };
    FlagDto { kind, scope }
}

fn session(s: &d::Session) -> SessionDto {
    SessionDto {
        id: s.id.0,
        kind: q(&s.kind, |k| match k {
            d::SessionKind::Practice => SessionKindDto::Practice,
            d::SessionKind::Qualifying => SessionKindDto::Qualifying,
            d::SessionKind::Race => SessionKindDto::Race,
            d::SessionKind::Other(name) => SessionKindDto::Other(name.clone()),
        }),
        state: q(&s.state, |st| match st {
            d::SessionState::Preparing => SessionStateDto::Preparing,
            d::SessionState::Running => SessionStateDto::Running,
            d::SessionState::Interrupted => SessionStateDto::Interrupted,
            d::SessionState::Finished => SessionStateDto::Finished,
        }),
        elapsed_s: q(&s.elapsed_s, copied),
        remaining_s: q(&s.remaining_s, copied),
        track_name: q(&s.track_name, String::clone),
        laps_remaining: q(&s.laps_remaining, copied),
        laps_total: q(&s.laps_total, copied),
        track_length_m: q(&s.track_length_m, copied),
    }
}

fn car(c: &d::Car) -> CarDto {
    CarDto {
        id: c.id.0,
        number: c.number.clone(),
        driver_id: c.driver.id.0,
        driver_name: c.driver.name.clone(),
        class: c.class.as_ref().map(|k| (k.id.0, k.name.clone())),
        position: q(&c.position, copied),
        class_position: q(&c.class_position, copied),
        laps: q(&c.laps, copied),
        last_lap_s: q(&c.last_lap_s, copied),
        best_lap_s: q(&c.best_lap_s, copied),
        last_sectors_s: c.last_sectors_s.iter().map(|s| q(s, copied)).collect(),
        gap_leader: q(&c.gap_leader, gap),
        gap_ahead: q(&c.gap_ahead, gap),
        gap_class_leader: q(&c.gap_class_leader, gap),
        gap_class_ahead: q(&c.gap_class_ahead, gap),
        lap_distance_m: q(&c.lap_distance_m, copied),
        lap_elapsed_s: q(&c.lap_elapsed_s, copied),
        current_sector: q(&c.current_sector, copied),
        in_pits: q(&c.in_pits, copied),
        pose: q(&c.pose, |p| PoseDto {
            x_m: p.x_m,
            y_m: p.y_m,
            yaw_rad: p.yaw_rad,
        }),
    }
}

fn player(p: &d::Player) -> PlayerDto {
    let t = &p.telemetry;
    PlayerDto {
        car: p.car.0,
        throttle: q(&t.throttle, copied),
        brake: q(&t.brake, copied),
        clutch: q(&t.clutch, copied),
        gear: q(&t.gear, copied),
        speed_mps: q(&t.speed_mps, copied),
        engine_speed_rad_s: q(&t.engine_speed_rad_s, copied),
        fuel_level_l: q(&p.fuel.level_l, copied),
        fuel_capacity_l: q(&p.fuel.capacity_l, copied),
        fuel_per_lap_l: q(&p.fuel.per_lap_l, copied),
        fuel_laps_left: q(&p.fuel.laps_left, copied),
        delta_best_s: q(&p.delta_best_s, copied),
    }
}

impl From<&d::Snapshot> for SnapshotDto {
    fn from(s: &d::Snapshot) -> Self {
        let c = &s.state.capabilities;
        SnapshotDto {
            version: VERSION,
            epoch: s.epoch,
            sequence: s.sequence,
            origin: OriginDto {
                simulator: s.origin.source.simulator.to_owned(),
                kind: match s.origin.source.kind {
                    d::SourceKind::Live => SourceKindDto::Live,
                    d::SourceKind::Replay => SourceKindDto::Replay,
                },
                source_time: s.origin.source_time,
                received_at: s.origin.received_at,
            },
            state: StateDto {
                capabilities: CapabilitiesDto {
                    session_clock: cap(c.session_clock),
                    positions: cap(c.positions),
                    lap_times: cap(c.lap_times),
                    gaps: cap(c.gaps),
                    pit_status: cap(c.pit_status),
                    flags: cap(c.flags),
                    spatial: cap(c.spatial),
                    driver_inputs: cap(c.driver_inputs),
                    powertrain: cap(c.powertrain),
                    fuel: cap(c.fuel),
                    delta: cap(c.delta),
                    sectors: cap(c.sectors),
                    lap_progress: cap(c.lap_progress),
                },
                session: session(&s.state.session),
                flags: q(&s.state.flags, |fs| fs.iter().map(flag).collect()),
                cars: s.state.cars.iter().map(car).collect(),
                player: s.state.player.as_ref().map(player),
            },
        }
    }
}

// --- DTO → dominio ---------------------------------------------------------

fn uq<T, U>(quality: QualityDto<T>, f: impl FnOnce(T) -> U) -> d::Quality<U> {
    match quality {
        QualityDto::Reliable(v) => d::Quality::Reliable(f(v)),
        QualityDto::Estimated(v) => d::Quality::Estimated(f(v)),
        QualityDto::Stale(v) => d::Quality::Stale(f(v)),
        QualityDto::Unavailable => d::Quality::Unavailable,
    }
}

fn id<T>(v: T) -> T {
    v
}

fn ucap(c: CapabilityDto) -> d::Capability {
    match c {
        CapabilityDto::Unsupported => d::Capability::Unsupported,
        CapabilityDto::Supported => d::Capability::Supported,
        CapabilityDto::WithData => d::Capability::WithData,
        CapabilityDto::Fresh => d::Capability::Fresh,
    }
}

fn ugap(g: GapDto) -> d::Gap {
    match g {
        GapDto::Time { seconds } => d::Gap::Time { seconds },
        GapDto::Laps { count } => d::Gap::Laps { count },
    }
}

fn uflag(f: FlagDto) -> d::Flag {
    let kind = match f.kind {
        FlagKindDto::Green => d::FlagKind::Green,
        FlagKindDto::Yellow => d::FlagKind::Yellow,
        FlagKindDto::Blue => d::FlagKind::Blue,
        FlagKindDto::Red => d::FlagKind::Red,
        FlagKindDto::White => d::FlagKind::White,
        FlagKindDto::Black => d::FlagKind::Black,
        FlagKindDto::Checkered => d::FlagKind::Checkered,
        FlagKindDto::Other(name) => d::FlagKind::Other(name),
    };
    let scope = match f.scope {
        FlagScopeDto::Session => d::FlagScope::Session,
        FlagScopeDto::Sector(i) => d::FlagScope::Sector(i),
        FlagScopeDto::Car(id) => d::FlagScope::Car(d::CarId(id)),
    };
    d::Flag { kind, scope }
}

fn usession(s: SessionDto) -> d::Session {
    d::Session {
        id: d::SessionId(s.id),
        kind: uq(s.kind, |k| match k {
            SessionKindDto::Practice => d::SessionKind::Practice,
            SessionKindDto::Qualifying => d::SessionKind::Qualifying,
            SessionKindDto::Race => d::SessionKind::Race,
            SessionKindDto::Other(name) => d::SessionKind::Other(name),
        }),
        state: uq(s.state, |st| match st {
            SessionStateDto::Preparing => d::SessionState::Preparing,
            SessionStateDto::Running => d::SessionState::Running,
            SessionStateDto::Interrupted => d::SessionState::Interrupted,
            SessionStateDto::Finished => d::SessionState::Finished,
        }),
        elapsed_s: uq(s.elapsed_s, id),
        remaining_s: uq(s.remaining_s, id),
        track_name: uq(s.track_name, id),
        laps_remaining: uq(s.laps_remaining, id),
        laps_total: uq(s.laps_total, id),
        track_length_m: uq(s.track_length_m, id),
    }
}

fn ucar(c: CarDto) -> d::Car {
    d::Car {
        id: d::CarId(c.id),
        number: c.number,
        driver: d::Driver {
            id: d::DriverId(c.driver_id),
            name: c.driver_name,
        },
        class: c.class.map(|(id, name)| d::Class {
            id: d::ClassId(id),
            name,
        }),
        position: uq(c.position, id),
        class_position: uq(c.class_position, id),
        laps: uq(c.laps, id),
        last_lap_s: uq(c.last_lap_s, id),
        best_lap_s: uq(c.best_lap_s, id),
        last_sectors_s: c.last_sectors_s.into_iter().map(|s| uq(s, id)).collect(),
        gap_leader: uq(c.gap_leader, ugap),
        gap_ahead: uq(c.gap_ahead, ugap),
        gap_class_leader: uq(c.gap_class_leader, ugap),
        gap_class_ahead: uq(c.gap_class_ahead, ugap),
        lap_distance_m: uq(c.lap_distance_m, id),
        lap_elapsed_s: uq(c.lap_elapsed_s, id),
        current_sector: uq(c.current_sector, id),
        in_pits: uq(c.in_pits, id),
        pose: uq(c.pose, |p| d::Pose {
            x_m: p.x_m,
            y_m: p.y_m,
            yaw_rad: p.yaw_rad,
        }),
    }
}

fn uplayer(p: PlayerDto) -> d::Player {
    d::Player {
        car: d::CarId(p.car),
        telemetry: d::Telemetry {
            throttle: uq(p.throttle, id),
            brake: uq(p.brake, id),
            clutch: uq(p.clutch, id),
            gear: uq(p.gear, id),
            speed_mps: uq(p.speed_mps, id),
            engine_speed_rad_s: uq(p.engine_speed_rad_s, id),
        },
        fuel: d::Fuel {
            level_l: uq(p.fuel_level_l, id),
            capacity_l: uq(p.fuel_capacity_l, id),
            per_lap_l: uq(p.fuel_per_lap_l, id),
            laps_left: uq(p.fuel_laps_left, id),
        },
        delta_best_s: uq(p.delta_best_s, id),
    }
}

impl TryFrom<SnapshotDto> for d::Snapshot {
    type Error = Error;

    fn try_from(dto: SnapshotDto) -> Result<Self, Error> {
        if dto.version != VERSION {
            return Err(Error::Version { got: dto.version });
        }
        let (o, s) = (dto.origin, dto.state);
        let c = s.capabilities;
        Ok(d::Snapshot {
            epoch: dto.epoch,
            sequence: dto.sequence,
            origin: d::Origin {
                source: d::Source {
                    simulator: d::Source::known_simulator(&o.simulator),
                    kind: match o.kind {
                        SourceKindDto::Live => d::SourceKind::Live,
                        SourceKindDto::Replay => d::SourceKind::Replay,
                    },
                },
                source_time: o.source_time,
                received_at: o.received_at,
            },
            state: d::State {
                capabilities: d::Capabilities {
                    session_clock: ucap(c.session_clock),
                    positions: ucap(c.positions),
                    lap_times: ucap(c.lap_times),
                    gaps: ucap(c.gaps),
                    pit_status: ucap(c.pit_status),
                    flags: ucap(c.flags),
                    spatial: ucap(c.spatial),
                    driver_inputs: ucap(c.driver_inputs),
                    powertrain: ucap(c.powertrain),
                    fuel: ucap(c.fuel),
                    delta: ucap(c.delta),
                    sectors: ucap(c.sectors),
                    lap_progress: ucap(c.lap_progress),
                },
                session: usession(s.session),
                flags: uq(s.flags, |fs| fs.into_iter().map(uflag).collect()),
                cars: s.cars.into_iter().map(ucar).collect(),
                player: s.player.map(uplayer),
            },
        })
    }
}
