//! Experimental LMU string stage. This is deliberately outside production.
//! The exported call batches every admitted C string in one Go/Rust crossing.

const OBJECT_SIZE: usize = 324_820;
const MAX_VEHICLES: usize = 104;
const SCORING_BASE: usize = 2_192;
const SCORING_STRIDE: usize = 584;
const RESULT_CAP: usize = 1 + 3 * MAX_VEHICLES;
const TELEMETRY_BASE: usize = 128_468;
const TELEMETRY_STRIDE: usize = 1_888;

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct CStringResult {
    pub len: u8,
    pub valid: u8,
}

#[repr(C)]
pub struct CStringFrame {
    pub count: u32,
    pub results: [CStringResult; RESULT_CAP],
}

/// Scoring-row order is preserved. Each entry identifies the matching
/// telemetry row, so Go can construct its canonical Observation unchanged.
#[repr(C)]
pub struct GridMap {
    pub count: u32,
    pub player_index: i32,
    pub telemetry_indices: [u8; MAX_VEHICLES],
}

impl Default for GridMap {
    fn default() -> Self {
        Self {
            count: 0,
            player_index: -1,
            telemetry_indices: [0; MAX_VEHICLES],
        }
    }
}

fn read_i32(data: &[u8], offset: usize) -> i32 {
    i32::from_le_bytes(data[offset..offset + 4].try_into().unwrap())
}

/// Returns 0 for a bijective grid, 1 for a short buffer, 2 for bad pointers
/// or count, and 3 when the active scoring/telemetry grid is incompatible.
/// # Safety
/// `input` must point to `len` readable bytes and `out` to a writable GridMap.
#[unsafe(no_mangle)]
pub unsafe extern "system" fn vantare_lmu_grid_map(
    input: *const u8,
    len: usize,
    out: *mut GridMap,
) -> u32 {
    if input.is_null() || out.is_null() {
        return 2;
    }
    if len < OBJECT_SIZE {
        return 1;
    }
    // SAFETY: pointers and length are checked above; the caller owns the buffers.
    let data = unsafe { std::slice::from_raw_parts(input, len) };
    let count = read_i32(data, 1_736);
    if !(0..=MAX_VEHICLES as i32).contains(&count) {
        return 2;
    }
    let count = count as usize;
    let mut telemetry_ids = [0_i32; MAX_VEHICLES];
    for index in 0..count {
        let id = read_i32(data, TELEMETRY_BASE + index * TELEMETRY_STRIDE);
        if id < 0 || telemetry_ids[..index].contains(&id) {
            return 3;
        }
        telemetry_ids[index] = id;
    }
    let mut scoring_ids = [0_i32; MAX_VEHICLES];
    let mut result = GridMap::default();
    result.count = count as u32;
    for index in 0..count {
        let base = SCORING_BASE + index * SCORING_STRIDE;
        let id = read_i32(data, base);
        if id < 0 || scoring_ids[..index].contains(&id) {
            return 3;
        }
        scoring_ids[index] = id;
        let Some(telemetry_index) = telemetry_ids[..count].iter().position(|item| *item == id)
        else {
            return 3;
        };
        result.telemetry_indices[index] = telemetry_index as u8;
        if data[base + 196] == 1 {
            if result.player_index >= 0 {
                return 3;
            }
            result.player_index = index as i32;
        }
    }
    // SAFETY: the caller guarantees a writable GridMap.
    unsafe { out.write(result) };
    0
}

impl Default for CStringFrame {
    fn default() -> Self {
        Self {
            count: 0,
            results: [CStringResult::default(); RESULT_CAP],
        }
    }
}

fn reasonable_c_string(bytes: &[u8]) -> CStringResult {
    let Some(end) = bytes.iter().position(|byte| *byte == 0) else {
        return CStringResult::default();
    };
    let Ok(value) = std::str::from_utf8(&bytes[..end]) else {
        return CStringResult::default();
    };
    if value.chars().any(|ch| ch < '\u{20}') {
        return CStringResult::default();
    }
    CStringResult {
        len: end as u8,
        valid: 1,
    }
}

/// Returns 0 on success, 1 for an incompatible buffer, 2 for invalid count/pointers.
/// # Safety
/// `input` must point to `len` readable bytes and `out` to a writable CStringFrame.
#[unsafe(no_mangle)]
pub unsafe extern "system" fn vantare_lmu_cstrings(
    input: *const u8,
    len: usize,
    out: *mut CStringFrame,
) -> u32 {
    if input.is_null() || out.is_null() {
        return 2;
    }
    if len < OBJECT_SIZE {
        return 1;
    }
    // SAFETY: checked pointers and length are guaranteed by the caller contract.
    let data = unsafe { std::slice::from_raw_parts(input, len) };
    let vehicle_count = i32::from_le_bytes(data[1736..1740].try_into().unwrap());
    if !(0..=MAX_VEHICLES as i32).contains(&vehicle_count) {
        return 2;
    }
    let mut frame = CStringFrame::default();
    frame.results[0] = reasonable_c_string(&data[1632..1696]);
    let mut index = 1;
    for row in 0..vehicle_count as usize {
        let base = SCORING_BASE + row * SCORING_STRIDE;
        for (offset, width) in [(4, 32), (36, 64), (200, 32)] {
            frame.results[index] = reasonable_c_string(&data[base + offset..base + offset + width]);
            index += 1;
        }
    }
    frame.count = index as u32;
    // SAFETY: the caller guarantees a writable CStringFrame.
    unsafe { out.write(frame) };
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn handles_empty_utf8_and_controls_like_go() {
        assert_eq!(reasonable_c_string(b"\0").valid, 1);
        assert_eq!(reasonable_c_string("Ñ\0".as_bytes()).len, 2);
        assert_eq!(reasonable_c_string(b"abc").valid, 0);
        assert_eq!(reasonable_c_string(b"\xff\0").valid, 0);
        assert_eq!(reasonable_c_string(b"a\n\0").valid, 0);
    }
}
