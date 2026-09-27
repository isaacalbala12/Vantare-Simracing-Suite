//! Closed LMU 1.3 frame admission. A caller must supply independently verified
//! build evidence; buffer shape alone never promotes an unknown game build.

#[cfg(windows)]
pub mod reader;

use crate::quality::Field;

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
    pub vehicle_count: Field<u32>,
    pub player_present: Field<bool>,
    pub session: SessionFields,
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

pub fn admit_v13(buffer: &[u8], verified_build: &str) -> Result<AdmittedGrid, AdmissionError> {
    if buffer.len() < OBJECT_OUT_SIZE {
        return Err(AdmissionError::ShortBuffer);
    }
    if verified_build != "1.3.0.0" {
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
    let mut telemetry_ids = Vec::with_capacity(count);
    for index in 0..count {
        let id = read_i32(buffer, TELEMETRY_BASE + index * TELEMETRY_STRIDE);
        if id < 0 || telemetry_ids.contains(&id) {
            return Err(AdmissionError::InvalidActiveGrid);
        }
        telemetry_ids.push(id);
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
        let valid = id >= 0
            && telemetry_ids.contains(&id)
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
        vehicles.push(VehicleFields {
            source_id: id,
            driver_name: Field::observed(driver.to_owned()),
            vehicle_name: Field::observed(name.to_owned()),
            vehicle_class: Field::observed(class.to_owned()),
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
        });
    }
    normalize_lap_progress_evidence(&mut vehicles);
    Ok(AdmittedGrid {
        vehicles,
        player_index,
        vehicle_count: Field::observed(count as u32),
        player_present: Field::observed(player_index.is_some()),
        session,
    })
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
        assert_eq!(
            admit_v13(REAL_44, "1.4.1.3"),
            Err(AdmissionError::UnsupportedBuild)
        );
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
