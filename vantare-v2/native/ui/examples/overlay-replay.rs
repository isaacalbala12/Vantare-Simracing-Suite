//! Measurement preview only: recorded snapshots, production host and renderers.
//! Raw recordings use the production core/IPC; saved goldens are diagnostic only.
use std::{
    io::BufRead,
    sync::Arc,
    time::{Duration, Instant},
};
use vantare_domain::{Snapshot, format::Preferences};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if !matches!(args.len(), 2 | 3) {
        return Err(
            "usage: overlay-replay <recording.jsonl.gz|pipe:name> <1|4|22> [seconds]".into(),
        );
    }
    let count: usize = args[1].parse()?;
    if ![1, 4, 22].contains(&count) {
        return Err("widget count must be 1, 4 or 22".into());
    }
    if let Some(pipe) = args[0].strip_prefix("pipe:") {
        let seconds = args.get(2).map_or(Ok(60), |value| value.parse::<u64>())?;
        if pipe.is_empty() || !(10..=3600).contains(&seconds) {
            return Err("pipe name and replay duration are required".into());
        }
        return run_pipe(pipe, count, seconds);
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

fn run_pipe(pipe: &str, count: usize, seconds: u64) -> Result<(), Box<dyn std::error::Error>> {
    let mut demand = vantare_ipc::Demand::default();
    for index in 0..count {
        let kind = [
            vantare_ui::Kind::Standings,
            vantare_ui::Kind::Radar,
            vantare_ui::Kind::Pedals,
        ][index % 3];
        demand.union(&vantare_ui::Settings::default_for(kind).demand());
    }
    let handle = vantare_ui::source::DemandHandle::new(demand);
    let connection = handle.connection();
    let photos = vantare_ui::source::pipe_feed_observed(pipe, Some(handle))?;
    let (send, stop) = flume::bounded(1);
    let timer = std::thread::spawn(move || {
        // Fixed measurement window: recorded duration plus report/idle drain.
        std::thread::sleep(Duration::from_secs(seconds + 3));
        let _ = send.send(());
    });
    vantare_ui::run_with_connection(
        count,
        photos,
        Preferences::default(),
        None,
        Some(connection),
        Some(stop),
    );
    timer.join().map_err(|_| "replay timer panicked")?;
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
