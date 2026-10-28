//! Optional native wire validation. It never connects to a product process.
use std::io::{self, BufRead};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut count = 0_u64;
    for path in std::env::args().skip(1) {
        let reader = io::BufReader::new(std::fs::File::open(&path)?);
        for (index, line) in reader.lines().enumerate() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }
            let snapshot = vantare_ipc::snapshot_from_json(&line).map_err(|error| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("{path}:{}: {error}", index + 1),
                )
            })?;
            let encoded = vantare_ipc::snapshot_to_json(&snapshot)?;
            let reparsed = vantare_ipc::snapshot_from_json(&encoded)?;
            if reparsed != snapshot {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!(
                        "{path}:{}: native roundtrip changed the snapshot",
                        index + 1
                    ),
                )
                .into());
            }
            count += 1;
        }
    }
    if count == 0 {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "no snapshots supplied").into());
    }
    println!("native SnapshotDto roundtrip: {count} PASS");
    Ok(())
}
