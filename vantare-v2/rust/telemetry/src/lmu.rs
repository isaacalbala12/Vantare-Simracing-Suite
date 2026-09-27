//! Closed LMU 1.3 frame admission. A caller must supply independently verified
//! build evidence; buffer shape alone never promotes an unknown game build.

#[cfg(windows)]
pub mod reader;

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

#[derive(Debug, Eq, PartialEq)]
pub struct AdmittedGrid {
    pub source_ids: Vec<i32>,
    pub player_index: Option<usize>,
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
    if !reasonable_c_string(&buffer[1_632..1_696]) {
        return Err(AdmissionError::InvalidSessionString);
    }
    let count = count as usize;
    let mut telemetry_ids = Vec::with_capacity(count);
    for index in 0..count {
        let id = read_i32(buffer, TELEMETRY_BASE + index * TELEMETRY_STRIDE);
        if id < 0 || telemetry_ids.contains(&id) {
            return Err(AdmissionError::InvalidActiveGrid);
        }
        telemetry_ids.push(id);
    }
    let mut source_ids = Vec::with_capacity(count);
    let mut player_index = None;
    for index in 0..count {
        let base = SCORING_BASE + index * SCORING_STRIDE;
        let id = read_i32(buffer, base);
        let player = buffer[base + 196];
        let in_pit = buffer[base + 198];
        let valid = id >= 0
            && telemetry_ids.contains(&id)
            && !source_ids.contains(&id)
            && reasonable_c_string(&buffer[base + 4..base + 36])
            && reasonable_c_string(&buffer[base + 36..base + 100])
            && reasonable_c_string(&buffer[base + 200..base + 232])
            && player <= 1
            && in_pit <= 1
            && read_i16(buffer, base + 100) >= 0
            && (0..=2).contains(&(buffer[base + 102] as i8))
            && read_f64(buffer, base + 104).is_finite()
            && (1..=MAX_VEHICLES as u8).contains(&buffer[base + 199])
            && read_i16(buffer, base + 192) >= 0
            && read_i16(buffer, base + 194) >= 0
            && read_f64(buffer, base + 232).is_finite()
            && read_i32(buffer, base + 240) >= 0
            && read_f64(buffer, base + 244).is_finite()
            && read_i32(buffer, base + 252) >= 0
            && [144, 168, 472]
                .into_iter()
                .all(|offset| read_f64(buffer, base + offset).is_finite());
        if !valid || (player == 1 && player_index.replace(index).is_some()) {
            return Err(AdmissionError::InvalidActiveGrid);
        }
        source_ids.push(id);
    }
    Ok(AdmittedGrid {
        source_ids,
        player_index,
    })
}

fn reasonable_c_string(bytes: &[u8]) -> bool {
    let Some(end) = bytes.iter().position(|value| *value == 0) else {
        return false;
    };
    std::str::from_utf8(&bytes[..end]).is_ok_and(|text| text.chars().all(|ch| ch >= '\u{20}'))
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

    #[test]
    fn real_fixture_admits_44_bijective_rows_and_one_player() {
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        assert_eq!(grid.source_ids.len(), 44);
        assert_eq!(grid.player_index, Some(43));
        assert_eq!(
            admit_v13(REAL_44, "1.4.1.3"),
            Err(AdmissionError::UnsupportedBuild)
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
    }
}
