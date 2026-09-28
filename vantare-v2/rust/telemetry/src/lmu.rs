//! Closed LMU frame admission. A caller must supply independently verified
//! build evidence; buffer shape alone never promotes an unknown game build.

#[cfg(windows)]
pub mod acquisition;
pub mod freshness;
pub mod fusion;
pub mod mapper;
pub mod pipeline;
#[cfg(windows)]
pub mod process;
#[cfg(windows)]
pub mod reader;
pub mod rest;
#[cfg(windows)]
pub mod version;

use crate::quality::{Field, Freshness};

pub const OBJECT_OUT_SIZE: usize = 324_820;
const MAX_VEHICLES: usize = 104;
const SCORING_BASE: usize = 2_192;
const SCORING_STRIDE: usize = 584;
const TELEMETRY_BASE: usize = 128_468;
const TELEMETRY_STRIDE: usize = 1_888;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AdmissionError {
    ShortBuffer,
    UnsupportedBuild,
    InvalidVehicleCount,
    InvalidSessionString,
    InvalidActiveGrid,
}

#[derive(Debug, PartialEq)]
pub struct AdmittedGrid {
    pub vehicles: Vec<VehicleFields>,
    pub player_index: Option<usize>,
    pub vehicle_count: Field<i32>,
    pub player_present: Field<bool>,
    pub session: SessionFields,
}

impl AdmittedGrid {
    /// Expire every SHM observation together when the producer clock stalls.
    /// Missing and structurally invalid fields retain their original quality.
    pub fn mark_stale(&mut self) {
        self.vehicle_count.mark_stale();
        self.player_present.mark_stale();
        let session = &mut self.session;
        session.track_name.mark_stale();
        session.track_length.mark_stale();
        session.session_type.mark_stale();
        session.source_time_ns.mark_stale();
        session.end_time_seconds.mark_stale();
        session.maximum_laps.mark_stale();
        session.rain_fraction.mark_stale();
        for vehicle in &mut self.vehicles {
            vehicle.driver_name.mark_stale();
            vehicle.vehicle_name.mark_stale();
            vehicle.vehicle_class.mark_stale();
            vehicle.car_number.mark_stale();
            vehicle.player.mark_stale();
            vehicle.position.mark_stale();
            vehicle.completed_laps.mark_stale();
            vehicle.sector.mark_stale();
            vehicle.lap_distance.mark_stale();
            vehicle.lap_progress_time.mark_stale();
            vehicle.best_lap_time.mark_stale();
            vehicle.last_lap_time.mark_stale();
            vehicle.estimated_lap_time.mark_stale();
            vehicle.in_pit.mark_stale();
            vehicle.pit_stop_count.mark_stale();
            vehicle.penalty_count.mark_stale();
            vehicle.time_behind_next.mark_stale();
            vehicle.laps_behind_next.mark_stale();
            vehicle.time_behind_leader.mark_stale();
            vehicle.laps_behind_leader.mark_stale();
            vehicle.world_position.mark_stale();
            vehicle.local_velocity.mark_stale();
            vehicle.orientation.mark_stale();
            if let Some(fast) = vehicle.fast.as_mut() {
                fast.lap_number.mark_stale();
                fast.gear.mark_stale();
                fast.engine_rpm.mark_stale();
                fast.speed_mps.mark_stale();
                fast.throttle.mark_stale();
                fast.brake.mark_stale();
                fast.clutch.mark_stale();
                fast.fuel.mark_stale();
                fast.delta_best_seconds.mark_stale();
                fast.tyre_wear.mark_stale();
                fast.damage.mark_stale();
            }
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum Sector {
    One = 1,
    Two = 2,
    Three = 3,
}

#[derive(Debug, PartialEq)]
pub struct VehicleFields {
    pub source_id: i32,
    pub driver_name: Field<String>,
    pub vehicle_name: Field<String>,
    pub vehicle_class: Field<String>,
    pub car_number: Field<String>,
    pub player: Field<bool>,
    pub position: Field<i32>,
    pub completed_laps: Field<i32>,
    pub sector: Field<Sector>,
    pub lap_distance: Field<f64>,
    pub lap_progress_time: Field<f64>,
    pub best_lap_time: Field<f64>,
    pub last_lap_time: Field<f64>,
    pub estimated_lap_time: Field<f64>,
    pub in_pit: Field<bool>,
    pub pit_stop_count: Field<i32>,
    pub penalty_count: Field<i32>,
    pub time_behind_next: Field<f64>,
    pub laps_behind_next: Field<i32>,
    pub time_behind_leader: Field<f64>,
    pub laps_behind_leader: Field<i32>,
    pub world_position: Field<[f64; 3]>,
    pub local_velocity: Field<[f64; 3]>,
    pub orientation: Field<[[f64; 3]; 3]>,
    pub fast: Option<FastTelemetry>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Fuel {
    pub amount_liters: f64,
    pub capacity_liters: f64,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct Damage {
    pub dents: [u8; 8],
    pub overheating: bool,
    pub detached: bool,
    pub wheel_detached_count: u8,
}

#[derive(Debug, PartialEq)]
pub struct FastTelemetry {
    pub lap_number: Field<i32>,
    pub gear: Field<i32>,
    pub engine_rpm: Field<f64>,
    pub speed_mps: Field<f64>,
    pub throttle: Field<f64>,
    pub brake: Field<f64>,
    pub clutch: Field<f64>,
    pub fuel: Field<Fuel>,
    pub delta_best_seconds: Field<f64>,
    pub tyre_wear: Field<[f64; 4]>,
    pub damage: Field<Damage>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum SessionType {
    Unknown = 0,
    Practice = 1,
    Qualifying = 2,
    Race = 3,
    Warmup = 4,
    Endurance = 5,
}

#[derive(Debug, PartialEq)]
pub struct SessionFields {
    pub track_name: Field<String>,
    pub track_length: Field<f64>,
    pub session_type: Field<SessionType>,
    pub source_time_ns: Field<i64>,
    pub end_time_seconds: Field<f64>,
    pub maximum_laps: Field<i32>,
    pub rain_fraction: Field<f64>,
}

fn supports_build(build: &str) -> bool {
    matches!(build, "1.3.0.0" | "1.4.0.0" | "1.4.1.3")
}

pub fn admit_v13(buffer: &[u8], verified_build: &str) -> Result<AdmittedGrid, AdmissionError> {
    if buffer.len() < OBJECT_OUT_SIZE {
        return Err(AdmissionError::ShortBuffer);
    }
    if !supports_build(verified_build) {
        return Err(AdmissionError::UnsupportedBuild);
    }
    let count = read_i32(buffer, 1_736);
    if !(0..=MAX_VEHICLES as i32).contains(&count) {
        return Err(AdmissionError::InvalidVehicleCount);
    }
    let track = read_c_string(&buffer[1_632..1_696]).ok_or(AdmissionError::InvalidSessionString)?;
    let count = count as usize;
    let source_seconds = read_f64(buffer, 1_700);
    let end_seconds = read_f64(buffer, 1_708);
    let track_length = read_f64(buffer, 1_720);
    let maximum_laps = read_i32(buffer, 1_716);
    let session = SessionFields {
        track_name: Field::observed(track.trim().to_owned()),
        track_length: if track_length.is_finite() && track_length > 0.0 {
            Field::observed(track_length)
        } else if track_length == 0.0 {
            Field::Missing
        } else {
            Field::invalid_observed(0.0)
        },
        session_type: match read_i32(buffer, 1_696) {
            1..=4 => Field::observed(SessionType::Practice),
            5..=8 => Field::observed(SessionType::Qualifying),
            9 => Field::observed(SessionType::Warmup),
            10..=13 => Field::observed(SessionType::Race),
            _ => Field::invalid_observed(SessionType::Unknown),
        },
        source_time_ns: duration_from_seconds(source_seconds)
            .map_or_else(|| Field::invalid_observed(0), Field::observed),
        end_time_seconds: if end_seconds.is_finite()
            && (!source_seconds.is_finite() || end_seconds >= source_seconds)
        {
            Field::observed(end_seconds)
        } else {
            Field::invalid_observed(0.0)
        },
        maximum_laps: if maximum_laps >= 0 {
            Field::observed(maximum_laps)
        } else {
            Field::invalid_observed(0)
        },
        rain_fraction: if count == 0 {
            Field::Missing
        } else {
            let rain = read_f64(buffer, 1_852);
            if rain.is_finite() && (0.0..=1.0).contains(&rain) {
                Field::observed(rain)
            } else {
                Field::invalid_observed(0.0)
            }
        },
    };
    let mut telemetry_rows = Vec::with_capacity(count);
    for index in 0..count {
        let base = TELEMETRY_BASE + index * TELEMETRY_STRIDE;
        let id = read_i32(buffer, base);
        if id < 0 || telemetry_rows.iter().any(|(seen, _)| *seen == id) {
            return Err(AdmissionError::InvalidActiveGrid);
        }
        telemetry_rows.push((id, base));
    }
    let mut vehicles = Vec::with_capacity(count);
    let mut player_index = None;
    for index in 0..count {
        let base = SCORING_BASE + index * SCORING_STRIDE;
        let id = read_i32(buffer, base);
        let (Some(driver), Some(name), Some(class)) = (
            read_c_string(&buffer[base + 4..base + 36]),
            read_c_string(&buffer[base + 36..base + 100]),
            read_c_string(&buffer[base + 200..base + 232]),
        ) else {
            return Err(AdmissionError::InvalidActiveGrid);
        };
        let player = buffer[base + 196];
        let in_pit = buffer[base + 198];
        let sector = match buffer[base + 102] {
            0 => Sector::Three,
            1 => Sector::One,
            2 => Sector::Two,
            _ => return Err(AdmissionError::InvalidActiveGrid),
        };
        let distance = read_f64(buffer, base + 104);
        let time_next = read_f64(buffer, base + 232);
        let time_leader = read_f64(buffer, base + 244);
        let best = read_f64(buffer, base + 144);
        let last = read_f64(buffer, base + 168);
        let estimated = read_f64(buffer, base + 472);
        let Some((_, telemetry_base)) = telemetry_rows.iter().find(|(seen, _)| *seen == id) else {
            return Err(AdmissionError::InvalidActiveGrid);
        };
        let valid = id >= 0
            && !vehicles
                .iter()
                .any(|row: &VehicleFields| row.source_id == id)
            && player <= 1
            && in_pit <= 1
            && read_i16(buffer, base + 100) >= 0
            && distance.is_finite()
            && (1..=MAX_VEHICLES as u8).contains(&buffer[base + 199])
            && read_i16(buffer, base + 192) >= 0
            && read_i16(buffer, base + 194) >= 0
            && time_next.is_finite()
            && read_i32(buffer, base + 240) >= 0
            && time_leader.is_finite()
            && read_i32(buffer, base + 252) >= 0
            && best.is_finite()
            && last.is_finite()
            && estimated.is_finite();
        if !valid || (player == 1 && player_index.replace(index).is_some()) {
            return Err(AdmissionError::InvalidActiveGrid);
        }
        let progress = read_f64(buffer, base + 464);
        let scoring_position = read_vector_field(buffer, base + 264);
        let scoring_velocity = read_vector_field(buffer, base + 288);
        let scoring_orientation = read_orientation_field(buffer, base + 336);
        let (world_position, local_velocity, orientation) = if player == 1 {
            (
                prefer_fresh(
                    read_vector_field(buffer, *telemetry_base + 160),
                    scoring_position,
                ),
                prefer_fresh(
                    read_vector_field(buffer, *telemetry_base + 184),
                    scoring_velocity,
                ),
                prefer_fresh(
                    read_orientation_field(buffer, *telemetry_base + 232),
                    scoring_orientation,
                ),
            )
        } else {
            (scoring_position, scoring_velocity, scoring_orientation)
        };
        vehicles.push(VehicleFields {
            source_id: id,
            driver_name: Field::observed(driver.to_owned()),
            vehicle_name: Field::observed(name.to_owned()),
            vehicle_class: Field::observed(class.to_owned()),
            car_number: Field::Missing,
            player: Field::observed(player == 1),
            position: Field::observed(i32::from(buffer[base + 199])),
            completed_laps: Field::observed(i32::from(read_i16(buffer, base + 100))),
            sector: Field::observed(sector),
            lap_distance: if distance >= 0.0 {
                Field::observed(distance)
            } else {
                Field::Missing
            },
            lap_progress_time: if progress.is_finite() {
                Field::observed(progress)
            } else {
                Field::invalid_observed(0.0)
            },
            best_lap_time: positive_lap_time(best),
            last_lap_time: positive_lap_time(last),
            estimated_lap_time: positive_lap_time(estimated),
            in_pit: Field::observed(in_pit == 1),
            pit_stop_count: Field::observed(i32::from(read_i16(buffer, base + 192))),
            penalty_count: Field::observed(i32::from(read_i16(buffer, base + 194))),
            time_behind_next: nonnegative_or_missing(time_next),
            laps_behind_next: Field::observed(read_i32(buffer, base + 240)),
            time_behind_leader: nonnegative_or_missing(time_leader),
            laps_behind_leader: Field::observed(read_i32(buffer, base + 252)),
            world_position,
            local_velocity,
            orientation,
            fast: if player == 1 {
                Some(parse_fast_telemetry(buffer, *telemetry_base, best))
            } else {
                None
            },
        });
    }
    normalize_lap_progress_evidence(&mut vehicles);
    Ok(AdmittedGrid {
        vehicles,
        player_index,
        vehicle_count: Field::observed(count as i32),
        player_present: Field::observed(player_index.is_some()),
        session,
    })
}

fn read_vector_field(buffer: &[u8], base: usize) -> Field<[f64; 3]> {
    let value = [
        read_f64(buffer, base),
        read_f64(buffer, base + 8),
        read_f64(buffer, base + 16),
    ];
    if value.iter().all(|component| component.is_finite()) {
        Field::observed(value)
    } else {
        Field::invalid_observed([0.0; 3])
    }
}

fn read_orientation_field(buffer: &[u8], base: usize) -> Field<[[f64; 3]; 3]> {
    let rows = [0, 24, 48].map(|offset| {
        [
            read_f64(buffer, base + offset),
            read_f64(buffer, base + offset + 8),
            read_f64(buffer, base + offset + 16),
        ]
    });
    if !rows.iter().flatten().all(|value| value.is_finite()) {
        return Field::invalid_observed([[0.0; 3]; 3]);
    }
    let dot = |left: &[f64; 3], right: &[f64; 3]| {
        left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
    };
    const TOLERANCE: f64 = 1e-3;
    if rows
        .iter()
        .any(|row| (dot(row, row) - 1.0).abs() > TOLERANCE)
        || (dot(&rows[0], &rows[1])).abs() > TOLERANCE
        || (dot(&rows[0], &rows[2])).abs() > TOLERANCE
        || (dot(&rows[1], &rows[2])).abs() > TOLERANCE
    {
        return Field::invalid_observed([[0.0; 3]; 3]);
    }
    let determinant = rows[0][0] * (rows[1][1] * rows[2][2] - rows[1][2] * rows[2][1])
        - rows[0][1] * (rows[1][0] * rows[2][2] - rows[1][2] * rows[2][0])
        + rows[0][2] * (rows[1][0] * rows[2][1] - rows[1][1] * rows[2][0]);
    if (determinant - 1.0).abs() <= TOLERANCE {
        Field::observed(rows)
    } else {
        Field::invalid_observed([[0.0; 3]; 3])
    }
}

fn prefer_fresh<T>(preferred: Field<T>, fallback: Field<T>) -> Field<T> {
    if matches!(
        preferred,
        Field::Present {
            freshness: Freshness::Fresh,
            ..
        }
    ) {
        preferred
    } else {
        fallback
    }
}

fn parse_fast_telemetry(buffer: &[u8], base: usize, best_lap: f64) -> FastTelemetry {
    let lap = read_i32(buffer, base + 20);
    let rpm = read_f64(buffer, base + 356);
    let velocity = [
        read_f64(buffer, base + 184),
        read_f64(buffer, base + 192),
        read_f64(buffer, base + 200),
    ];
    let speed = if velocity.iter().all(|value| value.is_finite()) {
        let squared = velocity.iter().map(|value| value * value).sum::<f64>();
        let speed = squared.sqrt();
        if speed.is_finite() {
            Field::observed(speed)
        } else {
            Field::invalid_observed(0.0)
        }
    } else {
        Field::invalid_observed(0.0)
    };
    let fuel = Fuel {
        amount_liters: read_f64(buffer, base + 524),
        capacity_liters: read_f64(buffer, base + 608),
    };
    let fuel = if fuel.amount_liters.is_finite()
        && fuel.capacity_liters.is_finite()
        && fuel.capacity_liters > 0.0
        && fuel.amount_liters >= 0.0
        && fuel.amount_liters <= fuel.capacity_liters
    {
        Field::observed(fuel)
    } else {
        Field::invalid_observed(Fuel {
            amount_liters: 0.0,
            capacity_liters: 0.0,
        })
    };
    let delta = read_f64(buffer, base + 696);
    let delta_best_seconds = if !delta.is_finite() || delta.abs() >= 10_000.0 {
        Field::invalid_observed(0.0)
    } else if delta != 0.0 || best_lap > 0.0 {
        Field::observed(delta)
    } else {
        Field::Missing
    };
    let wear = [1000, 1260, 1520, 1780].map(|offset| read_f64(buffer, base + offset));
    let tyre_wear = if wear
        .iter()
        .all(|value| value.is_finite() && (0.0..=1.0).contains(value))
    {
        Field::observed(wear)
    } else {
        Field::invalid_observed([0.0; 4])
    };
    FastTelemetry {
        lap_number: if lap >= 0 {
            Field::observed(lap)
        } else {
            Field::invalid_observed(0)
        },
        gear: Field::observed(read_i32(buffer, base + 352)),
        engine_rpm: if rpm.is_finite() && rpm >= 0.0 {
            Field::observed(rpm)
        } else {
            Field::invalid_observed(0.0)
        },
        speed_mps: speed,
        throttle: ratio_or_invalid(read_f64(buffer, base + 420)),
        brake: ratio_or_invalid(read_f64(buffer, base + 428)),
        clutch: ratio_or_invalid(read_f64(buffer, base + 444)),
        fuel,
        delta_best_seconds,
        tyre_wear,
        damage: read_damage_field(buffer, base),
    }
}

fn read_damage_field(buffer: &[u8], base: usize) -> Field<Damage> {
    let overheating = buffer[base + 541];
    let detached = buffer[base + 542];
    let wheels = [1026, 1286, 1546, 1806].map(|offset| buffer[base + offset]);
    if overheating > 1 || detached > 1 || wheels.iter().any(|wheel| *wheel > 1) {
        return Field::invalid_observed(Damage::default());
    }
    let mut dents = [0_u8; 8];
    dents.copy_from_slice(&buffer[base + 544..base + 552]);
    Field::observed(Damage {
        dents,
        overheating: overheating == 1,
        detached: detached == 1,
        wheel_detached_count: wheels.iter().copied().sum(),
    })
}

fn ratio_or_invalid(value: f64) -> Field<f64> {
    if value.is_finite() && (0.0..=1.0).contains(&value) {
        Field::observed(value)
    } else {
        Field::invalid_observed(0.0)
    }
}

fn positive_lap_time(value: f64) -> Field<f64> {
    if value > 0.0 {
        Field::observed(value)
    } else {
        Field::Missing
    }
}

fn nonnegative_or_missing(value: f64) -> Field<f64> {
    if value >= 0.0 {
        Field::observed(value)
    } else {
        Field::Missing
    }
}

fn normalize_lap_progress_evidence(rows: &mut [VehicleFields]) {
    if rows.len() < 2
        || rows
            .iter()
            .any(|row| row.lap_progress_time != Field::observed(0.0))
    {
        return;
    }
    let mut first = None;
    let mut differs = false;
    for row in rows.iter() {
        if let Some(distance) = row.lap_distance.value() {
            if let Some(previous) = first {
                differs |= distance != previous;
            } else {
                first = Some(distance);
            }
        }
    }
    if differs {
        for row in rows {
            row.lap_progress_time = Field::Missing;
        }
    }
}

fn read_c_string(bytes: &[u8]) -> Option<&str> {
    let end = bytes.iter().position(|value| *value == 0)?;
    std::str::from_utf8(&bytes[..end])
        .ok()
        .filter(|text| text.chars().all(|ch| ch >= '\u{20}'))
}

fn duration_from_seconds(seconds: f64) -> Option<i64> {
    if !seconds.is_finite() || seconds < 0.0 {
        return None;
    }
    let whole = seconds.trunc();
    let max_whole = i64::MAX / 1_000_000_000;
    if whole > max_whole as f64 {
        return None;
    }
    let fractional_ns = ((seconds - whole) * 1_000_000_000.0) as i64;
    if whole == max_whole as f64 && fractional_ns > i64::MAX % 1_000_000_000 {
        return None;
    }
    Some((whole as i64) * 1_000_000_000 + fractional_ns)
}

fn read_i16(bytes: &[u8], at: usize) -> i16 {
    i16::from_le_bytes(bytes[at..at + 2].try_into().expect("admitted layout"))
}

fn read_i32(bytes: &[u8], at: usize) -> i32 {
    i32::from_le_bytes(bytes[at..at + 4].try_into().expect("admitted layout"))
}

fn read_f64(bytes: &[u8], at: usize) -> f64 {
    f64::from_le_bytes(bytes[at..at + 8].try_into().expect("admitted layout"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const REAL_44: &[u8] = include_bytes!("../../../testdata/lmu-fixture.bin");
    const REAL_MENU: &[u8] = include_bytes!("../../../testdata/lmu-menu-fixture.bin");
    const REAL_1413_TRACK: &[u8] =
        include_bytes!("../../../testdata/lmu-1.4.1.3-track-fixture.bin");
    const REAL_1413_MENU: &[u8] = include_bytes!("../../../testdata/lmu-1.4.1.3-menu-fixture.bin");
    const REAL_1400_TRACK: &[u8] = include_bytes!("../../../testdata/lmu-1.4-track-fixture.bin");
    const REAL_1400_MENU: &[u8] = include_bytes!("../../../testdata/lmu-1.4-menu-fixture.bin");

    #[test]
    fn pinned_1400_frames_admit_only_the_exact_build() {
        let track = admit_v13(REAL_1400_TRACK, "1.4.0.0").unwrap();
        assert!(!track.vehicles.is_empty());
        assert!(track.player_index.is_some());
        let menu = admit_v13(REAL_1400_MENU, "1.4.0.0").unwrap();
        assert!(menu.vehicles.is_empty());
        assert_eq!(menu.player_index, None);
        for build in ["1.4.0.1", "1.4.1.0", "1.4.2.0"] {
            assert_eq!(
                admit_v13(REAL_1400_TRACK, build),
                Err(AdmissionError::UnsupportedBuild)
            );
        }
    }

    #[test]
    fn pinned_1413_frames_admit_only_the_exact_build() {
        let track = admit_v13(REAL_1413_TRACK, "1.4.1.3").unwrap();
        assert_eq!(track.vehicles.len(), 18);
        assert!(track.player_index.is_some());
        let menu = admit_v13(REAL_1413_MENU, "1.4.1.3").unwrap();
        assert!(menu.vehicles.is_empty());
        assert_eq!(menu.player_index, None);
        for build in ["1.4.1.2", "1.4.1.4", "1.4.2.0"] {
            assert_eq!(
                admit_v13(REAL_1413_TRACK, build),
                Err(AdmissionError::UnsupportedBuild)
            );
        }
    }

    #[test]
    fn real_fixture_admits_44_bijective_rows_and_one_player() {
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        assert_eq!(grid.vehicles.len(), 44);
        assert_eq!(grid.player_index, Some(43));
        assert_eq!(grid.vehicle_count.value(), Some(&44));
        assert_eq!(grid.player_present.value(), Some(&true));
        assert!(grid.session.track_name.value().is_some());
        assert!(grid.session.source_time_ns.value().is_some());
        assert_eq!(grid.session.end_time_seconds.value(), Some(&3605.0));
        assert_eq!(grid.session.maximum_laps.value(), Some(&0));
        let player = &grid.vehicles[43];
        assert_eq!(player.player.value(), Some(&true));
        assert_eq!(player.completed_laps.value(), Some(&0));
        assert_eq!(player.pit_stop_count.value(), Some(&0));
        assert_eq!(player.penalty_count.value(), Some(&0));
        assert_eq!(player.in_pit.value(), Some(&false));
        assert_eq!(player.best_lap_time, Field::Missing);
        assert_eq!(player.last_lap_time, Field::Missing);
        assert_eq!(player.world_position.quality().1, Some(Freshness::Fresh));
        assert_eq!(player.local_velocity.quality().1, Some(Freshness::Fresh));
        assert_eq!(player.orientation.quality().1, Some(Freshness::Fresh));
        let fast = player
            .fast
            .as_ref()
            .expect("real fixture has player telemetry");
        assert_eq!(fast.lap_number.value(), Some(&0));
        assert_eq!(
            fast.fuel.value().map(|fuel| fuel.capacity_liters),
            Some(100.0)
        );
        assert_eq!(fast.damage.quality().1, Some(Freshness::Fresh));
        assert_eq!(
            grid.vehicles
                .iter()
                .filter(|row| row.fast.is_some())
                .count(),
            1
        );
    }

    #[test]
    fn stalled_source_expires_every_observation_without_losing_values() {
        macro_rules! check {
            ($before:expr, $after:expr) => {{
                let before = &$before;
                let after = &$after;
                assert_eq!(before.value(), after.value());
                let (provenance, freshness) = before.quality();
                let expected = match freshness {
                    Some(Freshness::Fresh | Freshness::Stale) => Some(Freshness::Stale),
                    other => other,
                };
                assert_eq!(after.quality(), (provenance, expected));
            }};
        }
        let before = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let mut after = admit_v13(REAL_44, "1.3.0.0").unwrap();
        after.mark_stale();
        check!(before.vehicle_count, after.vehicle_count);
        check!(before.player_present, after.player_present);
        let (a, b) = (&before.session, &after.session);
        check!(a.track_name, b.track_name);
        check!(a.track_length, b.track_length);
        check!(a.session_type, b.session_type);
        check!(a.source_time_ns, b.source_time_ns);
        check!(a.end_time_seconds, b.end_time_seconds);
        check!(a.maximum_laps, b.maximum_laps);
        check!(a.rain_fraction, b.rain_fraction);
        for (a, b) in before.vehicles.iter().zip(&after.vehicles) {
            check!(a.driver_name, b.driver_name);
            check!(a.vehicle_name, b.vehicle_name);
            check!(a.vehicle_class, b.vehicle_class);
            check!(a.car_number, b.car_number);
            check!(a.player, b.player);
            check!(a.position, b.position);
            check!(a.completed_laps, b.completed_laps);
            check!(a.sector, b.sector);
            check!(a.lap_distance, b.lap_distance);
            check!(a.lap_progress_time, b.lap_progress_time);
            check!(a.best_lap_time, b.best_lap_time);
            check!(a.last_lap_time, b.last_lap_time);
            check!(a.estimated_lap_time, b.estimated_lap_time);
            check!(a.in_pit, b.in_pit);
            check!(a.pit_stop_count, b.pit_stop_count);
            check!(a.penalty_count, b.penalty_count);
            check!(a.time_behind_next, b.time_behind_next);
            check!(a.laps_behind_next, b.laps_behind_next);
            check!(a.time_behind_leader, b.time_behind_leader);
            check!(a.laps_behind_leader, b.laps_behind_leader);
            check!(a.world_position, b.world_position);
            check!(a.local_velocity, b.local_velocity);
            check!(a.orientation, b.orientation);
            if let (Some(a), Some(b)) = (&a.fast, &b.fast) {
                check!(a.lap_number, b.lap_number);
                check!(a.gear, b.gear);
                check!(a.engine_rpm, b.engine_rpm);
                check!(a.speed_mps, b.speed_mps);
                check!(a.throttle, b.throttle);
                check!(a.brake, b.brake);
                check!(a.clutch, b.clutch);
                check!(a.fuel, b.fuel);
                check!(a.delta_best_seconds, b.delta_best_seconds);
                check!(a.tyre_wear, b.tyre_wear);
                check!(a.damage, b.damage);
            } else {
                assert!(a.fast.is_none() && b.fast.is_none());
            }
        }
        let mut menu = admit_v13(REAL_MENU, "1.3.0.0").unwrap();
        menu.mark_stale();
        assert_eq!(menu.vehicle_count.value(), Some(&0));
        assert_eq!(menu.player_present.value(), Some(&false));
        assert_eq!(menu.vehicle_count.quality().1, Some(Freshness::Stale));
        assert_eq!(menu.session.rain_fraction, Field::Missing);
    }

    #[test]
    fn real_menu_fixture_preserves_observed_zero_and_false() {
        let grid = admit_v13(REAL_MENU, "1.3.0.0").unwrap();
        assert!(grid.vehicles.is_empty());
        assert_eq!(grid.player_index, None);
        assert_eq!(grid.vehicle_count.value(), Some(&0));
        assert_eq!(grid.player_present.value(), Some(&false));
        assert_eq!(grid.session.rain_fraction, Field::Missing);
    }

    #[test]
    fn atypical_session_scalars_invalidate_fields_without_rejecting_grid() {
        let mut frame = REAL_44.to_vec();
        frame[1_700..1_708].copy_from_slice(&(-1.0_f64).to_le_bytes());
        frame[1_716..1_720].copy_from_slice(&(-1_i32).to_le_bytes());
        frame[1_852..1_860].copy_from_slice(&f64::NAN.to_le_bytes());
        let grid = admit_v13(&frame, "1.3.0.0").unwrap();
        assert_eq!(grid.vehicles.len(), 44);
        assert_eq!(grid.session.source_time_ns, Field::invalid_observed(0));
        assert_eq!(grid.session.maximum_laps, Field::invalid_observed(0));
        assert_eq!(
            grid.session.rain_fraction.quality().1,
            Some(crate::quality::Freshness::Invalid)
        );
    }

    #[test]
    fn duration_conversion_checks_integer_overflow_without_losing_zero() {
        assert_eq!(duration_from_seconds(0.0), Some(0));
        assert_eq!(duration_from_seconds(1.25), Some(1_250_000_000));
        assert_eq!(duration_from_seconds(-1.0), None);
        assert_eq!(duration_from_seconds(f64::NAN), None);
        assert_eq!(
            duration_from_seconds(i64::MAX as f64 / 1_000_000_000.0),
            None
        );
    }

    #[test]
    fn player_fast_fields_keep_invalid_and_absent_distinct() {
        let mut frame = REAL_44.to_vec();
        let player_base = TELEMETRY_BASE + 43 * TELEMETRY_STRIDE;
        frame[player_base + 356..player_base + 364].copy_from_slice(&f64::NAN.to_le_bytes());
        frame[player_base + 420..player_base + 428].copy_from_slice(&1.5_f64.to_le_bytes());
        frame[player_base + 696..player_base + 704].copy_from_slice(&(-0.245_f64).to_le_bytes());
        frame[player_base + 1026] = 2;
        let grid = admit_v13(&frame, "1.3.0.0").unwrap();
        let fast = grid.vehicles[43].fast.as_ref().unwrap();
        assert_eq!(fast.engine_rpm, Field::invalid_observed(0.0));
        assert_eq!(fast.throttle, Field::invalid_observed(0.0));
        assert_eq!(fast.delta_best_seconds, Field::observed(-0.245));
        assert_eq!(fast.damage, Field::invalid_observed(Damage::default()));
        assert!(grid.vehicles[0].fast.is_none());
    }

    #[test]
    fn player_spatial_fields_fall_back_to_scoring_when_fast_vector_is_invalid() {
        let mut frame = REAL_44.to_vec();
        let player_telemetry = TELEMETRY_BASE + 43 * TELEMETRY_STRIDE;
        frame[player_telemetry + 160..player_telemetry + 168]
            .copy_from_slice(&f64::NAN.to_le_bytes());
        let changed = admit_v13(&frame, "1.3.0.0").unwrap();
        let player = &changed.vehicles[43];
        assert_eq!(player.world_position.quality().1, Some(Freshness::Fresh));
        assert_eq!(
            player.world_position,
            read_vector_field(&frame, SCORING_BASE + 43 * SCORING_STRIDE + 264)
        );
        assert_eq!(
            player.fast.as_ref().unwrap().speed_mps.quality().1,
            Some(Freshness::Fresh)
        );
    }

    #[test]
    fn rejects_truncation_and_invalid_grid_before_publishing() {
        assert_eq!(
            admit_v13(&REAL_44[..OBJECT_OUT_SIZE - 1], "1.3.0.0"),
            Err(AdmissionError::ShortBuffer)
        );
        let mut frame = REAL_44.to_vec();
        frame[1_736..1_740].copy_from_slice(&105_i32.to_le_bytes());
        assert_eq!(
            admit_v13(&frame, "1.3.0.0"),
            Err(AdmissionError::InvalidVehicleCount)
        );
        frame.copy_from_slice(REAL_44);
        frame[TELEMETRY_BASE + TELEMETRY_STRIDE..TELEMETRY_BASE + TELEMETRY_STRIDE + 4]
            .copy_from_slice(&REAL_44[TELEMETRY_BASE..TELEMETRY_BASE + 4]);
        assert_eq!(
            admit_v13(&frame, "1.3.0.0"),
            Err(AdmissionError::InvalidActiveGrid)
        );
        frame.copy_from_slice(REAL_44);
        frame[1_632..1_696].fill(b'A');
        assert_eq!(
            admit_v13(&frame, "1.3.0.0"),
            Err(AdmissionError::InvalidSessionString)
        );
        frame.copy_from_slice(REAL_44);
        let first_player = 43;
        frame[SCORING_BASE + first_player * SCORING_STRIDE + 196] = 1;
        frame[SCORING_BASE + 196] = 1;
        assert_eq!(
            admit_v13(&frame, "1.3.0.0"),
            Err(AdmissionError::InvalidActiveGrid)
        );
        frame.copy_from_slice(REAL_44);
        frame[SCORING_BASE + 144..SCORING_BASE + 152].copy_from_slice(&f64::NAN.to_le_bytes());
        assert_eq!(
            admit_v13(&frame, "1.3.0.0"),
            Err(AdmissionError::InvalidActiveGrid)
        );
    }
}
