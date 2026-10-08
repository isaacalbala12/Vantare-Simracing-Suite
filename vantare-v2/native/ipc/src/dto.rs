//! DTO explícito del `Snapshot`: es el formato del cable, no los tipos de
//! `domain` (que no son ABI). Añadir una señal al modelo exige añadirla aquí a
//! propósito. En fotos completas o señales declaradas entregadas, un campo de
//! calidad que falta es error; la foto parcial omite únicamente lo no entregado.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use vantare_domain as d;

use crate::Error;

/// Versión del DTO. Se sube al cambiar el esquema de forma incompatible.
pub const VERSION: u32 = 8;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct SnapshotDto {
    pub version: u32,
    pub epoch: u64,
    pub sequence: u64,
    origin: OriginDto,
    state: StateDto,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum QualityDto<T> {
    #[default]
    NotRequested,
    Reliable(T),
    Estimated(T),
    Stale(T),
    Unavailable,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct OriginDto {
    simulator: String,
    kind: SourceKindDto,
    source_time: Option<Duration>,
    received_at: Duration,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
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

#[derive(Clone, Debug, Serialize, Deserialize)]
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
    weather: CapabilityDto,
    damage: CapabilityDto,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum SourceStateDto {
    Waiting,
    Live,
    Paused,
    Stale,
    Lost,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct StateDto {
    source_state: SourceStateDto,
    capabilities: CapabilitiesDto,
    session: SessionDto,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    flags: QualityDto<Vec<FlagDto>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    cars: Vec<CarDto>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    player: Option<PlayerDto>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct SessionDto {
    id: u64,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    kind: QualityDto<SessionKindDto>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    state: QualityDto<SessionStateDto>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    elapsed_s: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    remaining_s: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    track_name: QualityDto<String>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    laps_remaining: QualityDto<u32>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    laps_total: QualityDto<u32>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    track_length_m: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    weather_air_temperature_k: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    weather_track_temperature_k: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    weather_wind_speed_mps: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    weather_wind_direction_rad: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    weather_rain: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    weather_track_wetness: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    weather_pressure_pa: QualityDto<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum SessionKindDto {
    Practice,
    Qualifying,
    Race,
    Other(String),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum SessionStateDto {
    Preparing,
    Running,
    Interrupted,
    Finished,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct FlagDto {
    kind: FlagKindDto,
    scope: FlagScopeDto,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum FlagScopeDto {
    Session,
    Sector(u8),
    Car(u32),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct CarDto {
    id: u32,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    number: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    vehicle: String,
    #[serde(default, skip_serializing_if = "zero")]
    driver_id: u32,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    driver_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    class: Option<(u32, String)>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    position: QualityDto<u32>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    class_position: QualityDto<u32>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    laps: QualityDto<u32>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    last_lap_s: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    best_lap_s: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    estimated_lap_s: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    last_sectors_s: Vec<QualityDto<f64>>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    gap_leader: QualityDto<GapDto>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    gap_ahead: QualityDto<GapDto>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    gap_class_leader: QualityDto<GapDto>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    gap_class_ahead: QualityDto<GapDto>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    relative_s: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    relative_laps: QualityDto<i32>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    lap_distance_m: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    lap_elapsed_s: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    current_sector: QualityDto<u8>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    in_pits: QualityDto<bool>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    pose: QualityDto<PoseDto>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    velocity_mps: QualityDto<[f64; 2]>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    pending_penalties: QualityDto<u32>,
    // Señales de #1497, ausentes en fotos anteriores: si faltan valen
    // Unavailable y no se escriben mientras no haya dato (las fotos existentes
    // conservan sus bytes).
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    grid_position: QualityDto<u32>,
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    pit_stops: QualityDto<u32>,
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    tyre_compound: QualityDto<TyreCompoundDto>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    best_sectors_s: Vec<QualityDto<f64>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    current_sectors_s: Vec<QualityDto<f64>>,
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    driver_rating: QualityDto<DriverRatingDto>,
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    safety_rating: QualityDto<f64>,
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    relative_trend_s_per_lap: QualityDto<f64>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum DriverRatingDto {
    Bronze,
    Silver,
    Gold,
    Platinum,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum TyreCompoundDto {
    Soft,
    Medium,
    Hard,
    Wet,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum GapDto {
    Time { seconds: f64 },
    Laps { count: u32 },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct PoseDto {
    x_m: f64,
    y_m: f64,
    yaw_rad: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct PlayerDto {
    car: u32,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    throttle: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    brake: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    clutch: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    steering: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    gear: QualityDto<i8>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    speed_mps: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    engine_speed_rad_s: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    fuel_level_l: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    fuel_capacity_l: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    fuel_per_lap_l: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    fuel_laps_left: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    fuel_history: Vec<(u32, f64)>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    delta_best_s: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    pit_limiter_active: QualityDto<bool>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    pit_stop_stopped: QualityDto<bool>,
    // #1497: opcional, como las señales nuevas de los coches.
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    pit_loss_s: QualityDto<f64>,
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    fuel_energy: QualityDto<f64>,
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    fuel_energy_per_lap: QualityDto<f64>,
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    fuel_lap_projection_l: QualityDto<f64>,
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    pit_refuel_target_l: QualityDto<f64>,
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    pit_refuel_added_l: QualityDto<f64>,
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    pit_service_remaining_s: QualityDto<f64>,
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    pit_tyres: QualityDto<u8>,
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    stint_laps: QualityDto<u32>,
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    stint_elapsed_s: QualityDto<f64>,
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    delta_optimal_s: QualityDto<f64>,
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    delta_leader_s: QualityDto<f64>,
    #[serde(
        default = "QualityDto::unavailable",
        skip_serializing_if = "QualityDto::absent"
    )]
    lap_invalid: QualityDto<bool>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    damage_aero: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    damage_body: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "QualityDto::not_requested")]
    damage_suspension: QualityDto<f64>,
    #[serde(default, skip_serializing_if = "unrequested_tyres")]
    damage_tyre_wear: [QualityDto<f64>; 4],
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
        weather_air_temperature_k: q(&s.weather.air_temperature_k, copied),
        weather_track_temperature_k: q(&s.weather.track_temperature_k, copied),
        weather_wind_speed_mps: q(&s.weather.wind_speed_mps, copied),
        weather_wind_direction_rad: q(&s.weather.wind_direction_rad, copied),
        weather_rain: q(&s.weather.rain, copied),
        weather_track_wetness: q(&s.weather.track_wetness, copied),
        weather_pressure_pa: q(&s.weather.pressure_pa, copied),
    }
}

fn car(c: &d::Car) -> CarDto {
    CarDto {
        id: c.id.0,
        number: c.number.clone(),
        vehicle: c.vehicle.clone(),
        driver_id: c.driver.id.0,
        driver_name: c.driver.name.clone(),
        class: c.class.as_ref().map(|k| (k.id.0, k.name.clone())),
        position: q(&c.position, copied),
        class_position: q(&c.class_position, copied),
        laps: q(&c.laps, copied),
        last_lap_s: q(&c.last_lap_s, copied),
        best_lap_s: q(&c.best_lap_s, copied),
        estimated_lap_s: q(&c.estimated_lap_s, copied),
        last_sectors_s: c.last_sectors_s.iter().map(|s| q(s, copied)).collect(),
        gap_leader: q(&c.gap_leader, gap),
        gap_ahead: q(&c.gap_ahead, gap),
        gap_class_leader: q(&c.gap_class_leader, gap),
        gap_class_ahead: q(&c.gap_class_ahead, gap),
        relative_s: q(&c.relative_s, copied),
        relative_laps: q(&c.relative_laps, copied),
        lap_distance_m: q(&c.lap_distance_m, copied),
        lap_elapsed_s: q(&c.lap_elapsed_s, copied),
        current_sector: q(&c.current_sector, copied),
        in_pits: q(&c.in_pits, copied),
        pose: q(&c.pose, |p| PoseDto {
            x_m: p.x_m,
            y_m: p.y_m,
            yaw_rad: p.yaw_rad,
        }),
        velocity_mps: q(&c.velocity_mps, copied),
        pending_penalties: q(&c.pending_penalties, copied),
        grid_position: q(&c.grid_position, copied),
        pit_stops: q(&c.pit_stops, copied),
        tyre_compound: q(&c.tyre_compound, |t| match t {
            d::TyreCompound::Soft => TyreCompoundDto::Soft,
            d::TyreCompound::Medium => TyreCompoundDto::Medium,
            d::TyreCompound::Hard => TyreCompoundDto::Hard,
            d::TyreCompound::Wet => TyreCompoundDto::Wet,
        }),
        best_sectors_s: c.best_sectors_s.iter().map(|s| q(s, copied)).collect(),
        current_sectors_s: c.current_sectors_s.iter().map(|s| q(s, copied)).collect(),
        driver_rating: q(&c.driver_rating, |r| match r {
            d::DriverRating::Bronze => DriverRatingDto::Bronze,
            d::DriverRating::Silver => DriverRatingDto::Silver,
            d::DriverRating::Gold => DriverRatingDto::Gold,
            d::DriverRating::Platinum => DriverRatingDto::Platinum,
        }),
        safety_rating: q(&c.safety_rating, copied),
        relative_trend_s_per_lap: q(&c.relative_trend_s_per_lap, copied),
    }
}

fn player(p: &d::Player) -> PlayerDto {
    let t = &p.telemetry;
    PlayerDto {
        car: p.car.0,
        throttle: q(&t.throttle, copied),
        brake: q(&t.brake, copied),
        clutch: q(&t.clutch, copied),
        steering: q(&t.steering, copied),
        gear: q(&t.gear, copied),
        speed_mps: q(&t.speed_mps, copied),
        engine_speed_rad_s: q(&t.engine_speed_rad_s, copied),
        fuel_level_l: q(&p.fuel.level_l, copied),
        fuel_capacity_l: q(&p.fuel.capacity_l, copied),
        fuel_per_lap_l: q(&p.fuel.per_lap_l, copied),
        fuel_laps_left: q(&p.fuel.laps_left, copied),
        fuel_history: p.fuel.history.iter().flatten().copied().collect(),
        delta_best_s: q(&p.delta_best_s, copied),
        pit_limiter_active: q(&p.pit_limiter_active, copied),
        pit_stop_stopped: q(&p.pit_stop_stopped, copied),
        pit_loss_s: q(&p.pit_loss_s, copied),
        fuel_energy: q(&p.fuel.energy, copied),
        fuel_energy_per_lap: q(&p.fuel.energy_per_lap, copied),
        fuel_lap_projection_l: q(&p.fuel.lap_projection_l, copied),
        pit_refuel_target_l: q(&p.pit_service.refuel_target_l, copied),
        pit_refuel_added_l: q(&p.pit_service.refuel_added_l, copied),
        pit_service_remaining_s: q(&p.pit_service.remaining_s, copied),
        pit_tyres: q(&p.pit_service.tyres, copied),
        stint_laps: q(&p.stint.laps, copied),
        stint_elapsed_s: q(&p.stint.elapsed_s, copied),
        delta_optimal_s: q(&p.delta_optimal_s, copied),
        delta_leader_s: q(&p.delta_leader_s, copied),
        lap_invalid: q(&p.lap_invalid, copied),
        damage_aero: q(&p.damage.aero, copied),
        damage_body: q(&p.damage.body, copied),
        damage_suspension: q(&p.damage.suspension, copied),
        damage_tyre_wear: p.damage.tyre_wear.map(|v| q(&v, copied)),
    }
}

impl From<&d::Snapshot> for SnapshotDto {
    fn from(s: &d::Snapshot) -> Self {
        Self::encode(s, true, true)
    }
}

impl SnapshotDto {
    pub(crate) fn selected(s: &d::Snapshot, delivered: &crate::Demand) -> Result<Self, Error> {
        // No construir y borrar 47 filas cuando solo vencen los pedales o el reloj.
        let mut dto = Self::encode(s, delivered.car_data(), delivered.player_data());
        dto.filter(delivered)?;
        Ok(dto)
    }

    fn encode(s: &d::Snapshot, cars: bool, has_player: bool) -> Self {
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
                source_state: match s.state.source_state {
                    d::SourceState::Waiting => SourceStateDto::Waiting,
                    d::SourceState::Live => SourceStateDto::Live,
                    d::SourceState::Paused => SourceStateDto::Paused,
                    d::SourceState::Stale => SourceStateDto::Stale,
                    d::SourceState::Lost => SourceStateDto::Lost,
                },
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
                    weather: cap(c.weather),
                    damage: cap(c.damage),
                },
                session: session(&s.state.session),
                flags: q(&s.state.flags, |fs| fs.iter().map(flag).collect()),
                cars: if cars {
                    s.state.cars.iter().map(car).collect()
                } else {
                    Vec::new()
                },
                player: if has_player {
                    s.state.player.as_ref().map(player)
                } else {
                    None
                },
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
        QualityDto::Unavailable | QualityDto::NotRequested => d::Quality::Unavailable,
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
        weather: d::Weather {
            air_temperature_k: uq(s.weather_air_temperature_k, id),
            track_temperature_k: uq(s.weather_track_temperature_k, id),
            wind_speed_mps: uq(s.weather_wind_speed_mps, id),
            wind_direction_rad: uq(s.weather_wind_direction_rad, id),
            rain: uq(s.weather_rain, id),
            track_wetness: uq(s.weather_track_wetness, id),
            pressure_pa: uq(s.weather_pressure_pa, id),
        },
    }
}

fn ucar(c: CarDto) -> d::Car {
    d::Car {
        id: d::CarId(c.id),
        number: c.number,
        vehicle: c.vehicle,
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
        estimated_lap_s: uq(c.estimated_lap_s, id),
        last_sectors_s: c.last_sectors_s.into_iter().map(|s| uq(s, id)).collect(),
        gap_leader: uq(c.gap_leader, ugap),
        gap_ahead: uq(c.gap_ahead, ugap),
        gap_class_leader: uq(c.gap_class_leader, ugap),
        gap_class_ahead: uq(c.gap_class_ahead, ugap),
        relative_s: uq(c.relative_s, id),
        relative_laps: uq(c.relative_laps, id),
        lap_distance_m: uq(c.lap_distance_m, id),
        lap_elapsed_s: uq(c.lap_elapsed_s, id),
        current_sector: uq(c.current_sector, id),
        in_pits: uq(c.in_pits, id),
        pose: uq(c.pose, |p| d::Pose {
            x_m: p.x_m,
            y_m: p.y_m,
            yaw_rad: p.yaw_rad,
        }),
        velocity_mps: uq(c.velocity_mps, id),
        pending_penalties: uq(c.pending_penalties, id),
        grid_position: uq(c.grid_position, id),
        pit_stops: uq(c.pit_stops, id),
        tyre_compound: uq(c.tyre_compound, |t| match t {
            TyreCompoundDto::Soft => d::TyreCompound::Soft,
            TyreCompoundDto::Medium => d::TyreCompound::Medium,
            TyreCompoundDto::Hard => d::TyreCompound::Hard,
            TyreCompoundDto::Wet => d::TyreCompound::Wet,
        }),
        best_sectors_s: c.best_sectors_s.into_iter().map(|s| uq(s, id)).collect(),
        current_sectors_s: c.current_sectors_s.into_iter().map(|s| uq(s, id)).collect(),
        driver_rating: uq(c.driver_rating, |r| match r {
            DriverRatingDto::Bronze => d::DriverRating::Bronze,
            DriverRatingDto::Silver => d::DriverRating::Silver,
            DriverRatingDto::Gold => d::DriverRating::Gold,
            DriverRatingDto::Platinum => d::DriverRating::Platinum,
        }),
        safety_rating: uq(c.safety_rating, id),
        relative_trend_s_per_lap: uq(c.relative_trend_s_per_lap, id),
    }
}

fn uplayer(p: PlayerDto) -> d::Player {
    let mut history = [None; 10];
    for (slot, value) in history.iter_mut().zip(p.fuel_history) {
        *slot = Some(value);
    }
    d::Player {
        car: d::CarId(p.car),
        telemetry: d::Telemetry {
            throttle: uq(p.throttle, id),
            brake: uq(p.brake, id),
            clutch: uq(p.clutch, id),
            steering: uq(p.steering, id),
            gear: uq(p.gear, id),
            speed_mps: uq(p.speed_mps, id),
            engine_speed_rad_s: uq(p.engine_speed_rad_s, id),
        },
        fuel: d::Fuel {
            level_l: uq(p.fuel_level_l, id),
            capacity_l: uq(p.fuel_capacity_l, id),
            per_lap_l: uq(p.fuel_per_lap_l, id),
            laps_left: uq(p.fuel_laps_left, id),
            history,
            energy: uq(p.fuel_energy, id),
            energy_per_lap: uq(p.fuel_energy_per_lap, id),
            lap_projection_l: uq(p.fuel_lap_projection_l, id),
        },
        pit_service: d::PitService {
            refuel_target_l: uq(p.pit_refuel_target_l, id),
            refuel_added_l: uq(p.pit_refuel_added_l, id),
            remaining_s: uq(p.pit_service_remaining_s, id),
            tyres: uq(p.pit_tyres, id),
        },
        stint: d::Stint {
            laps: uq(p.stint_laps, id),
            elapsed_s: uq(p.stint_elapsed_s, id),
        },
        delta_optimal_s: uq(p.delta_optimal_s, id),
        delta_leader_s: uq(p.delta_leader_s, id),
        lap_invalid: uq(p.lap_invalid, id),
        delta_best_s: uq(p.delta_best_s, id),
        pit_limiter_active: uq(p.pit_limiter_active, id),
        pit_stop_stopped: uq(p.pit_stop_stopped, id),
        pit_loss_s: uq(p.pit_loss_s, id),
        damage: d::Damage {
            aero: uq(p.damage_aero, id),
            body: uq(p.damage_body, id),
            suspension: uq(p.damage_suspension, id),
            tyre_wear: p.damage_tyre_wear.map(|v| uq(v, id)),
        },
    }
}

impl TryFrom<SnapshotDto> for d::Snapshot {
    type Error = Error;

    fn try_from(dto: SnapshotDto) -> Result<Self, Error> {
        if dto.version != VERSION {
            return Err(Error::Version { got: dto.version });
        }
        let (o, s) = (dto.origin, dto.state);
        if s.player.as_ref().is_some_and(|p| p.fuel_history.len() > 10) {
            return Err(Error::Protocol("más de diez vueltas de combustible"));
        }
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
                source_state: match s.source_state {
                    SourceStateDto::Waiting => d::SourceState::Waiting,
                    SourceStateDto::Live => d::SourceState::Live,
                    SourceStateDto::Paused => d::SourceState::Paused,
                    SourceStateDto::Stale => d::SourceState::Stale,
                    SourceStateDto::Lost => d::SourceState::Lost,
                },
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
                    weather: ucap(c.weather),
                    damage: ucap(c.damage),
                },
                session: usession(s.session),
                flags: uq(s.flags, |fs| fs.into_iter().map(uflag).collect()),
                cars: s.cars.into_iter().map(ucar).collect(),
                player: s.player.map(uplayer),
            },
        })
    }
}

impl<T> QualityDto<T> {
    fn not_requested(&self) -> bool {
        matches!(self, Self::NotRequested)
    }
    fn unavailable() -> Self {
        Self::Unavailable
    }
    fn absent(&self) -> bool {
        matches!(self, Self::NotRequested | Self::Unavailable)
    }
}
fn unrequested_tyres(values: &[QualityDto<f64>; 4]) -> bool {
    values.iter().all(QualityDto::not_requested)
}

#[allow(clippy::trivially_copy_pass_by_ref)] // Firma requerida por serde skip_serializing_if.
fn zero(value: &u32) -> bool {
    *value == 0
}

trait DeliveryField {
    fn omitted(&self) -> bool;
}
impl<T> DeliveryField for QualityDto<T> {
    fn omitted(&self) -> bool {
        self.not_requested()
    }
}
impl DeliveryField for String {
    fn omitted(&self) -> bool {
        false
    }
}
impl DeliveryField for u32 {
    fn omitted(&self) -> bool {
        false
    }
}
impl<T> DeliveryField for Option<T> {
    fn omitted(&self) -> bool {
        false
    }
}
impl<T> DeliveryField for Vec<T> {
    fn omitted(&self) -> bool {
        false
    }
}
impl<T, const N: usize> DeliveryField for [QualityDto<T>; N] {
    fn omitted(&self) -> bool {
        self.iter().any(QualityDto::not_requested)
    }
}

impl SnapshotDto {
    pub(crate) fn same_scope(&self, old: &Self, delivered: &crate::Demand) -> bool {
        self.epoch == old.epoch
            && self.state.session.id == old.state.session.id
            && self.state.source_state == old.state.source_state
            && (!delivered.player_data()
                || self.state.player.as_ref().map(|p| p.car)
                    == old.state.player.as_ref().map(|p| p.car))
            && (!delivered.car_data()
                || (self.state.cars.len() == old.state.cars.len()
                    && self
                        .state
                        .cars
                        .iter()
                        .all(|car| old.state.cars.iter().any(|other| other.id == car.id))))
    }

    pub(crate) fn filter(&mut self, delivered: &crate::Demand) -> Result<(), Error> {
        self.restore(None, &crate::Demand::default(), delivered)?;
        if !delivered.car_data() {
            self.state.cars.clear();
        }
        if !delivered.player_data() {
            self.state.player = None;
        }
        Ok(())
    }

    /// Restaura solo lo pedido y no entregado por cadencia. La identidad de
    /// coches se busca por ID; nunca por índice tras reordenar la clasificación.
    pub(crate) fn restore(
        &mut self,
        previous: Option<&Self>,
        requested: &crate::Demand,
        delivered: &crate::Demand,
    ) -> Result<(), Error> {
        use crate::Signal;
        fn retain<T: Clone + Default>(target: &mut T, old: Option<&T>, wanted: bool) {
            *target = if wanted {
                old.cloned().unwrap_or_default()
            } else {
                T::default()
            };
        }
        macro_rules! fields {
            ($target:expr, $old:expr, $wanted:expr, $sent:expr; $($signal:ident => [$($field:ident),+]),+ $(,)?) => {
                $(if $sent & Signal::$signal.bit() != 0 {
                    $(if $target.$field.omitted() { return Err(Error::Protocol("señal entregada marcada como no pedida")); })+
                } else {
                    $(retain(&mut $target.$field, $old.map(|old| &old.$field), $wanted & Signal::$signal.bit() != 0);)+
                })+
            };
        }
        let requested_mask = requested.mask();
        let delivered_mask = delivered.mask();
        if requested.car_data() && !delivered.car_data() {
            self.state.cars = previous.map_or_else(Vec::new, |old| old.state.cars.clone());
        }
        if requested.player_data() && !delivered.player_data() {
            self.state.player = previous.and_then(|old| old.state.player.clone());
        }
        fields!(self.state, previous.map(|old| &old.state), requested_mask, delivered_mask; Flags => [flags]);
        fields!(self.state.session, previous.map(|old| &old.state.session), requested_mask, delivered_mask;
            SessionInfo => [kind, state, laps_total], SessionClock => [elapsed_s, remaining_s],
            TrackName => [track_name], TrackLength => [track_length_m], LapsRemaining => [laps_remaining],
            Weather => [weather_air_temperature_k, weather_track_temperature_k, weather_wind_speed_mps,
                weather_wind_direction_rad, weather_rain, weather_track_wetness, weather_pressure_pa]);
        for car in &mut self.state.cars {
            let old = previous.and_then(|old| old.state.cars.iter().find(|old| old.id == car.id));
            fields!(car, old, requested_mask, delivered_mask;
                Cars => [number, vehicle, driver_id, driver_name, class, driver_rating, safety_rating],
                Positions => [position, class_position, grid_position], LapCount => [laps],
                LapTimes => [last_lap_s, best_lap_s, estimated_lap_s],
                Sectors => [last_sectors_s, current_sector, best_sectors_s, current_sectors_s],
                Gaps => [gap_leader, gap_ahead], ClassGaps => [gap_class_leader, gap_class_ahead],
                Relative => [relative_s, relative_laps, relative_trend_s_per_lap], LapProgress => [lap_distance_m, lap_elapsed_s],
                PitStatus => [in_pits, pit_stops, tyre_compound], Spatial => [pose], Velocity => [velocity_mps],
                Penalties => [pending_penalties]);
        }
        if let Some(player) = &mut self.state.player {
            let old = previous
                .and_then(|old| old.state.player.as_ref())
                .filter(|old| old.car == player.car);
            fields!(player, old, requested_mask, delivered_mask;
                Pedals => [throttle, brake], Clutch => [clutch], Steering => [steering],
                Powertrain => [gear, speed_mps, engine_speed_rad_s], FuelLevel => [fuel_level_l, fuel_capacity_l, fuel_energy],
                FuelEstimate => [fuel_per_lap_l, fuel_laps_left, fuel_history, fuel_energy_per_lap, fuel_lap_projection_l],
                Delta => [delta_best_s, delta_optimal_s, delta_leader_s, lap_invalid],
                PitStatus => [pit_limiter_active, pit_stop_stopped, pit_loss_s, pit_refuel_target_l,
                    pit_refuel_added_l, pit_service_remaining_s, pit_tyres, stint_laps, stint_elapsed_s],
                Damage => [damage_aero, damage_body, damage_suspension, damage_tyre_wear]);
        }
        Ok(())
    }
}

#[cfg(test)]
mod demand_tests {
    use super::*;
    use crate::{Demand, Signal};

    #[test]
    fn sparse_wire_distinguishes_unrequested_from_unavailable_and_restores_held_values() {
        let source = crate::codec::tests::rich_snapshot(1, 1);
        let mut requested = Demand::default();
        requested.request(Signal::Pedals, 16);
        requested.request(Signal::Weather, 500);
        let mut first = SnapshotDto::from(&source);
        first.filter(&requested).expect("selección");
        let json = serde_json::to_string(&first).expect("JSON");
        assert!(!json.contains("gap_leader"));
        assert!(!json.contains("fuel_history"));
        assert!(json.contains("weather_rain"));
        let mut next = SnapshotDto::from(&source);
        next.sequence = 2;
        let mut due = Demand::default();
        due.request(Signal::Pedals, 16);
        next.filter(&due).expect("selección");
        next.restore(Some(&first), &requested, &due)
            .expect("restauración");
        let restored = d::Snapshot::try_from(next).expect("foto parcial hidratada");
        assert_eq!(restored.state.session.weather, source.state.session.weather);
        assert!(restored.state.cars.is_empty());
        assert_eq!(
            restored.state.player.expect("jugador").telemetry.throttle,
            source.state.player.expect("jugador").telemetry.throttle
        );
        assert!(
            serde_json::to_string(&SnapshotDto::from(&source))
                .expect("JSON completo")
                .len()
                > json.len()
        );
    }

    #[test]
    fn held_values_follow_car_ids_and_are_cleared_when_a_signal_is_no_longer_requested() {
        let source = crate::codec::tests::rich_snapshot(1, 1);
        let previous = SnapshotDto::from(&source);
        let mut next = SnapshotDto::from(&source);
        next.state.cars.reverse();
        let mut requested = Demand::default();
        requested.request(Signal::Gaps, 250);
        let mut delivered = Demand::default();
        delivered.request(Signal::Cars, 250);
        next.filter(&delivered).expect("selección");
        next.restore(Some(&previous), &requested, &delivered)
            .expect("restauración");
        let decoded = d::Snapshot::try_from(next).expect("orden diferente");
        assert_eq!(
            decoded.state.cars[0].gap_leader,
            source.state.cars.last().expect("coche").gap_leader
        );
        assert_eq!(decoded.state.cars[0].best_lap_s, d::Quality::Unavailable);
        let mut changed = SnapshotDto::from(&source);
        changed.state.session.id ^= 1;
        assert!(
            !changed.same_scope(&previous, &Demand::all()),
            "sesión nueva no hereda valores"
        );
    }
    #[test]
    fn an_omitted_signal_cannot_be_claimed_as_delivered_unavailable() {
        let source = crate::codec::tests::rich_snapshot(1, 1);
        let mut dto = SnapshotDto::from(&source);
        dto.filter(&Demand::default()).expect("sin señales");
        let mut demand = Demand::default();
        demand.request(Signal::Weather, 500);
        assert!(matches!(
            dto.restore(None, &demand, &demand),
            Err(Error::Protocol(_))
        ));
    }
}
