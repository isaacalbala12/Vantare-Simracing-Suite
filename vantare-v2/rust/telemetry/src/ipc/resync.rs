//! Explicit fact history loss across the local process boundary.

use serde::Serialize;

use super::{FrameError, Kind};

pub const MAX_RESYNC_PAYLOAD: usize = 128;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ResyncError {
    InvalidRange,
    TooLarge,
    Json,
    Frame(FrameError),
}

#[derive(Serialize)]
struct Wire {
    stream: u64,
    first: u64,
    next: u64,
}

pub fn encode(stream: u64, first: u64, next: u64) -> Result<Vec<u8>, ResyncError> {
    if stream == 0 || first == 0 || next < first {
        return Err(ResyncError::InvalidRange);
    }
    let payload = serde_json::to_vec(&Wire {
        stream,
        first,
        next,
    })
    .map_err(|_| ResyncError::Json)?;
    if payload.len() > MAX_RESYNC_PAYLOAD {
        return Err(ResyncError::TooLarge);
    }
    super::encode(Kind::ResyncRequired, &payload).map_err(ResyncError::Frame)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rust_resync_range_matches_go_wire_fixture() {
        for (stream, first, next) in [(0, 3, 67), (15, 0, 67), (15, 4, 3)] {
            assert_eq!(encode(stream, first, next), Err(ResyncError::InvalidRange));
        }
        let frame = encode(15, 3, 67).unwrap();
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/testdata/resync-frame-rust-v1.bin"
        );
        if std::env::var("VANTARE_IPC_ORACLE_UPDATE").as_deref() == Ok("1") {
            std::fs::write(path, &frame).unwrap();
        }
        assert_eq!(std::fs::read(path).unwrap(), frame);
    }
}
