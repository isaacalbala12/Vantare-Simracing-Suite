//! Measurement preview only: recorded snapshots, production host and renderers.
//! No transport, account, simulator, or changes to installed user data.
use std::{
    io::BufRead,
    sync::Arc,
    time::{Duration, Instant},
};
use vantare_domain::{Snapshot, format::Preferences};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 2 {
        return Err("usage: overlay-replay <recording.jsonl.gz> <1|4|22>".into());
    }
    let count: usize = args[1].parse()?;
    if ![1, 4, 22].contains(&count) {
        return Err("widget count must be 1, 4 or 22".into());
    }
    let file = std::fs::File::open(&args[0])?;
    let mut lines = std::io::BufReader::new(flate2::read::GzDecoder::new(file)).lines();
    let first_photo =
        vantare_ipc::snapshot_from_saved_json(&lines.next().ok_or("empty recording")??)?;
    let first = first_photo
        .origin
        .source_time
        .ok_or("recording has no source clock")?;
    let (send, receive) = flume::bounded(1);
    let (stop, stopped) = flume::bounded(1);
    let producer = std::thread::spawn(move || -> Result<(), String> {
        let result = (|| -> Result<(), String> {
            // Give the real host time to create its windows. This is a measurement
            // warmup, not a synchronization assertion or a product cadence.
            std::thread::sleep(Duration::from_secs(2));
            let start = Instant::now();
            let photos = std::iter::once(Ok(first_photo)).chain(lines.map(|line| {
                let line = line.map_err(|error| error.to_string())?;
                vantare_ipc::snapshot_from_saved_json(&line).map_err(|error| error.to_string())
            }));
            for photo in photos {
                let photo: Snapshot = photo?;
                let at = replay_offset(&photo, first)?;
                if let Some(wait) = (start + at).checked_duration_since(Instant::now()) {
                    std::thread::sleep(wait);
                }
                if send.send(Arc::new(photo)).is_err() {
                    return Ok(());
                }
            }
            // Drain final reports and observe idle presentation after recording.
            std::thread::sleep(Duration::from_secs(3));
            Ok(())
        })();
        let _ = stop.send(());
        result
    });
    vantare_ui::run_with_connection(
        count,
        receive,
        Preferences::default(),
        None,
        None,
        Some(stopped),
    );
    producer.join().map_err(|_| "replay producer panicked")??;
    Ok(())
}

fn replay_offset(photo: &Snapshot, first: Duration) -> Result<Duration, String> {
    photo
        .origin
        .source_time
        .and_then(|time| time.checked_sub(first))
        .ok_or_else(|| "missing or regressed source clock in recording".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recorded_source_clock_controls_replay_even_when_received_clock_is_frozen() {
        let mut photo = Snapshot::default();
        let first = Duration::from_secs(10);
        photo.origin.received_at = Duration::from_secs(61);
        photo.origin.source_time = Some(first + Duration::from_millis(20));
        assert_eq!(replay_offset(&photo, first), Ok(Duration::from_millis(20)));
        photo.origin.source_time = None;
        assert!(replay_offset(&photo, first).is_err());
        photo.origin.source_time = Some(Duration::from_secs(9));
        assert!(replay_offset(&photo, first).is_err());
    }
}
