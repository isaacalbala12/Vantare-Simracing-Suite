use std::io;
#[cfg(windows)]
use std::time::{Duration, Instant};

#[cfg(windows)]
use vantare_telemetry::delivery::OverlayPull;
#[cfg(windows)]
use vantare_telemetry::ipc::pipe_windows::DeadlinePipe;
#[cfg(windows)]
use vantare_telemetry::ipc::queue::WriterQueue;
#[cfg(windows)]
use vantare_telemetry::ipc::status::{self, RestState, State, Status};
#[cfg(windows)]
use vantare_telemetry::ipc::{self, Kind};
#[cfg(windows)]
use vantare_telemetry::lmu::rest::RestStatus;
#[cfg(windows)]
use vantare_telemetry::lmu::{
    acquisition::{Acquisition, AcquisitionError},
    cadence::TickCadence,
};

fn main() {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    if arguments == ["--version"] {
        println!("vantare-telemetry {}", env!("CARGO_PKG_VERSION"));
        return;
    }

    if let [pipe_flag, pipe_name, nonce_flag, nonce_text] = arguments.as_slice()
        && pipe_flag == "--candidate-pipe"
        && nonce_flag == "--candidate-nonce"
    {
        if let Err(error) = run_candidate_pipe(pipe_name, nonce_text, false) {
            eprintln!("vantare-telemetry: candidate IPC failed: {error}");
            std::process::exit(2);
        }
        return;
    }

    if let [pipe_flag, pipe_name, nonce_flag, nonce_text, codec_flag] = arguments.as_slice()
        && pipe_flag == "--candidate-pipe"
        && nonce_flag == "--candidate-nonce"
        && codec_flag == "--candidate-engineer-binary"
    {
        if let Err(error) = run_candidate_pipe(pipe_name, nonce_text, true) {
            eprintln!("vantare-telemetry: binary candidate IPC failed: {error}");
            std::process::exit(2);
        }
        return;
    }

    #[cfg(all(windows, feature = "bench-harness"))]
    if let [
        pipe_flag,
        pipe_name,
        nonce_flag,
        nonce_text,
        mapping_flag,
        mapping_name,
        port_flag,
        port_text,
        rest @ ..,
    ] = arguments.as_slice()
        && pipe_flag == "--bench-pipe"
        && nonce_flag == "--bench-nonce"
        && mapping_flag == "--bench-mapping"
        && port_flag == "--bench-rest-port"
        && (rest.is_empty() || rest == ["--candidate-engineer-binary"])
    {
        let result = port_text
            .parse::<u16>()
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "invalid benchmark port"))
            .and_then(|port| {
                run_candidate_with_source(pipe_name, nonce_text, !rest.is_empty(), |stream| {
                    Acquisition::open_bench(mapping_name, port, 30, stream).map_err(|error| {
                        io::Error::other(format!("open benchmark source: {error:?}"))
                    })
                })
            });
        if let Err(error) = result {
            eprintln!("vantare-telemetry: benchmark IPC failed: {error}");
            std::process::exit(2);
        }
        return;
    }

    if let [pipe_flag, pipe_name, nonce_flag, nonce_text] = arguments.as_slice()
        && pipe_flag == "--harness-pipe"
        && nonce_flag == "--harness-nonce"
    {
        if let Err(error) = run_pipe_harness(pipe_name, nonce_text) {
            eprintln!("vantare-telemetry: IPC harness failed: {error}");
            std::process::exit(2);
        }
        return;
    }

    eprintln!("vantare-telemetry: IPC runtime is not enabled");
    std::process::exit(2);
}

#[cfg(windows)]
fn run_pipe_harness(pipe_name: &str, nonce_text: &str) -> io::Result<()> {
    let mut pipe = connect_pipe(pipe_name, nonce_text)?;
    let stop = wait_for_frame(&mut pipe, Instant::now() + Duration::from_secs(2))?;
    ipc::status::decode_stop(ipc::decode(&stop).map_err(|_| io::ErrorKind::InvalidData)?)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "expected empty Stop frame"))
}

#[cfg(windows)]
fn connect_pipe(pipe_name: &str, nonce_text: &str) -> io::Result<DeadlinePipe> {
    let nonce = ipc::parse_nonce_hex(nonce_text)
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "invalid instance nonce"))?;
    let suffix = pipe_name.strip_prefix(r"\\.\pipe\vantare-telemetry-");
    if suffix.and_then(ipc::parse_nonce_hex) != Some(nonce) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "invalid pipe name",
        ));
    }
    let mut pipe = DeadlinePipe::open(pipe_name)?;
    let handshake = ipc::encode(Kind::Handshake, &ipc::handshake_payload(&nonce))
        .map_err(|error| io::Error::other(format!("encode handshake: {error:?}")))?;
    pipe.write_all_until(&handshake, Instant::now() + Duration::from_secs(2))?;
    Ok(pipe)
}

#[cfg(windows)]
fn wait_for_frame(pipe: &mut DeadlinePipe, deadline: Instant) -> io::Result<Vec<u8>> {
    loop {
        if Instant::now() >= deadline {
            return Err(io::ErrorKind::TimedOut.into());
        }
        if let Some(frame) = pipe.read_frame_if_available(deadline)? {
            return Ok(frame);
        }
        std::thread::sleep(Duration::from_millis(1));
    }
}

#[cfg(windows)]
fn run_candidate_pipe(pipe_name: &str, nonce_text: &str, engineer_binary: bool) -> io::Result<()> {
    run_candidate_with_source(pipe_name, nonce_text, engineer_binary, |stream| {
        Acquisition::open(30, stream).map_err(|error| match error {
            AcquisitionError::Io(error) => error,
            other => io::Error::other(format!("open LMU: {other:?}")),
        })
    })
}

#[cfg(windows)]
fn run_candidate_with_source(
    pipe_name: &str,
    nonce_text: &str,
    engineer_binary: bool,
    mut open: impl FnMut(u64) -> io::Result<Acquisition>,
) -> io::Result<()> {
    let mut pipe = connect_pipe(pipe_name, nonce_text)?;
    let first = wait_for_frame(&mut pipe, Instant::now() + Duration::from_secs(2))?;
    if ipc::decode(&first)
        .map_err(|_| io::ErrorKind::InvalidData)?
        .kind
        != Kind::Configuration
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "expected Configuration",
        ));
    }
    ipc::configuration::decode_frame(&first)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid Configuration"))?;
    let nonce = ipc::parse_nonce_hex(nonce_text).expect("validated pipe nonce");
    let stream = u64::from_le_bytes(nonce[..8].try_into().expect("fixed nonce")).max(1);
    let mut overlay = OverlayPull::new();
    overlay
        .publish_status(
            1,
            br#"{"revision":1,"source":{"state":"detecting"},"frame":null}"#,
        )
        .map_err(|error| io::Error::other(format!("initial Overlay status: {error:?}")))?;
    let mut heartbeat = 0_u64;
    let mut next_open = Instant::now();
    let mut next_status = Instant::now();
    let mut acquisition = loop {
        if Instant::now() >= next_open {
            match open(stream) {
                Ok(acquisition) => break Some(acquisition),
                Err(error) if error.kind() == io::ErrorKind::NotFound => {
                    next_open = Instant::now() + Duration::from_millis(250);
                }
                Err(error) => return Err(error),
            }
        }
        if Instant::now() >= next_status {
            heartbeat = heartbeat
                .checked_add(1)
                .ok_or_else(|| io::Error::other("heartbeat exhausted"))?;
            let frame = status::encode(Status {
                heartbeat,
                state: State::Detecting,
                source_age_ns: None,
                shm_ticks: None,
                rest_reports: None,
                rest_batches: None,
                rest_http_fresh: None,
                rest_state: None,
            })
            .map_err(|error| io::Error::other(format!("encode detecting Status: {error:?}")))?;
            pipe.write_all_until(&frame, Instant::now() + Duration::from_secs(2))?;
            next_status = Instant::now() + Duration::from_millis(250);
        }
        if let Some(frame) =
            pipe.read_frame_if_available(Instant::now() + Duration::from_secs(2))?
        {
            let decoded = ipc::decode(&frame).map_err(|_| io::ErrorKind::InvalidData)?;
            match decoded.kind {
                Kind::Stop => {
                    ipc::status::decode_stop(decoded).map_err(|_| io::ErrorKind::InvalidData)?;
                    break None;
                }
                Kind::OverlayCommand => {
                    let reply = ipc::overlay::handle_frame(&mut overlay, &frame)
                        .map_err(|error| io::Error::other(format!("Overlay command: {error:?}")))?;
                    pipe.write_all_until(&reply, Instant::now() + Duration::from_secs(2))?;
                }
                _ => return Err(io::ErrorKind::InvalidData.into()),
            }
        }
        std::thread::sleep(Duration::from_millis(2));
    };
    let Some(ref mut acquisition) = acquisition else {
        let reply = ipc::encode(Kind::Stop, &[]).expect("fixed Stop frame");
        return pipe.write_all_until(&reply, Instant::now() + Duration::from_secs(2));
    };
    overlay
        .publish_status(
            2,
            br#"{"revision":2,"source":{"state":"connecting"},"frame":null}"#,
        )
        .map_err(|error| io::Error::other(format!("connected Overlay status: {error:?}")))?;
    acquisition.set_engineer_binary_candidate(engineer_binary);
    let result = run_candidate_loop(&mut pipe, acquisition, &mut overlay, heartbeat, first);
    let shutdown = acquisition
        .shutdown()
        .map_err(|error| io::Error::other(format!("close LMU: {error:?}")));
    result?;
    shutdown?;
    let reply = ipc::encode(Kind::Stop, &[]).expect("fixed Stop frame");
    pipe.write_all_until(&reply, Instant::now() + Duration::from_secs(2))
}

#[cfg(windows)]
fn run_candidate_loop(
    pipe: &mut DeadlinePipe,
    acquisition: &mut Acquisition,
    overlay: &mut OverlayPull,
    initial_heartbeat: u64,
    first: Vec<u8>,
) -> io::Result<()> {
    let mut queue = WriterQueue::new();
    let mut overlay_status_revision = 2_u64;
    let mut last_overlay_state = State::Connecting;
    acquisition
        .handle_control_frame(&first, &mut queue)
        .map_err(|error| io::Error::other(format!("configure LMU: {error:?}")))?;
    let mut cadence = TickCadence::new(Instant::now());
    let mut next_status = Instant::now() + Duration::from_millis(250);
    let mut heartbeat = initial_heartbeat;
    let mut shm_ticks = 0_u64;
    let mut rest_reports = 0_u64;
    let mut rest_batches = 0_u64;
    let mut rest_http_fresh = 0_u64;
    loop {
        for _ in 0..8 {
            let Some(frame) =
                pipe.read_frame_if_available(Instant::now() + Duration::from_secs(2))?
            else {
                break;
            };
            let decoded = ipc::decode(&frame).map_err(|_| io::ErrorKind::InvalidData)?;
            if decoded.kind == Kind::Stop {
                ipc::status::decode_stop(decoded).map_err(|_| io::ErrorKind::InvalidData)?;
                return Ok(());
            }
            if decoded.kind == Kind::OverlayCommand {
                let reply = ipc::overlay::handle_frame(overlay, &frame)
                    .map_err(|error| io::Error::other(format!("Overlay command: {error:?}")))?;
                pipe.write_all_until(&reply, Instant::now() + Duration::from_secs(2))?;
                continue;
            }
            acquisition
                .handle_control_frame(&frame, &mut queue)
                .map_err(|error| io::Error::other(format!("host control: {error:?}")))?;
        }
        // Preserve each completed REST poll as its own canonical delivery.
        // Drain and write each batch before the SHM tick can replace state.
        for _ in 0..16 {
            let Some(frames) = acquisition
                .poll_rest_event()
                .map_err(|error| io::Error::other(format!("LMU REST: {error:?}")))?
            else {
                break;
            };
            rest_reports = rest_reports
                .checked_add(1)
                .ok_or_else(|| io::Error::other("REST report counter exhausted"))?;
            if acquisition.last_rest_http_fresh() {
                rest_http_fresh = rest_http_fresh
                    .checked_add(1)
                    .ok_or_else(|| io::Error::other("fresh REST counter exhausted"))?;
            }
            if !frames.is_empty() {
                rest_batches = rest_batches
                    .checked_add(1)
                    .ok_or_else(|| io::Error::other("REST batch counter exhausted"))?;
            }
            let frames = route_overlay_frames(overlay, frames)?;
            queue
                .push_batch(frames)
                .map_err(|error| io::Error::other(format!("queue REST: {error:?}")))?;
            while let Some(batch) = queue.pop_batch() {
                for frame in batch {
                    pipe.write_all_until(&frame, Instant::now() + Duration::from_secs(2))?;
                }
            }
        }
        if let Some(frames) = acquisition
            .tick_if_due(&mut cadence, Instant::now())
            .map_err(|error| io::Error::other(format!("LMU tick: {error:?}")))?
        {
            shm_ticks = shm_ticks
                .checked_add(1)
                .ok_or_else(|| io::Error::other("SHM tick counter exhausted"))?;
            let frames = route_overlay_frames(overlay, frames)?;
            queue
                .push_batch(frames)
                .map_err(|error| io::Error::other(format!("queue LMU tick: {error:?}")))?;
        }
        if Instant::now() >= next_status {
            heartbeat = heartbeat
                .checked_add(1)
                .ok_or_else(|| io::Error::other("heartbeat exhausted"))?;
            let (state, source_age_ns) = match acquisition.source_health() {
                None => (State::Connecting, None),
                Some((age, true)) => (State::Stale, Some(age)),
                Some((age, false)) => (State::Live, Some(age)),
            };
            if state != last_overlay_state {
                overlay_status_revision = overlay_status_revision
                    .checked_add(1)
                    .ok_or_else(|| io::Error::other("Overlay status revision exhausted"))?;
                let update = serde_json::json!({
                    "revision": overlay_status_revision,
                    "source": {"state": state, "ageMs": source_age_ns.unwrap_or(0) / 1_000_000},
                    "frame": null,
                });
                let json = serde_json::to_vec(&update)
                    .map_err(|error| io::Error::other(format!("encode Overlay status: {error}")))?;
                overlay
                    .publish_status(overlay_status_revision, &json)
                    .map_err(|error| {
                        io::Error::other(format!("publish Overlay status: {error:?}"))
                    })?;
                last_overlay_state = state;
            }
            let frame = status::encode(Status {
                heartbeat,
                state,
                source_age_ns,
                shm_ticks: Some(shm_ticks),
                rest_reports: Some(rest_reports),
                rest_batches: Some(rest_batches),
                rest_http_fresh: Some(rest_http_fresh),
                rest_state: Some(match acquisition.rest_status() {
                    RestStatus::Live => RestState::Live,
                    RestStatus::Partial => RestState::Partial,
                    RestStatus::Unsupported => RestState::Unsupported,
                    RestStatus::Offline => RestState::Offline,
                    RestStatus::Timeout => RestState::Timeout,
                    RestStatus::Stale => RestState::Stale,
                }),
            })
            .map_err(|error| io::Error::other(format!("encode Status: {error:?}")))?;
            queue
                .push_batch(vec![frame])
                .map_err(|error| io::Error::other(format!("queue Status: {error:?}")))?;
            next_status = Instant::now() + Duration::from_millis(250);
        }
        while let Some(batch) = queue.pop_batch() {
            for frame in batch {
                pipe.write_all_until(&frame, Instant::now() + Duration::from_secs(2))?;
            }
        }
        let wait = cadence.deadline().saturating_duration_since(Instant::now());
        if !wait.is_zero() {
            std::thread::sleep(wait.min(Duration::from_millis(2)));
        }
    }
}

#[cfg(windows)]
fn route_overlay_frames(
    overlay: &mut OverlayPull,
    frames: Vec<Vec<u8>>,
) -> io::Result<Vec<Vec<u8>>> {
    if !overlay.has_consumers() {
        return Ok(frames);
    }
    let mut host_frames = Vec::with_capacity(frames.len());
    for frame in frames {
        let retained = ipc::overlay::retain_snapshot_frame(overlay, &frame)
            .map_err(|error| io::Error::other(format!("retain Overlay snapshot: {error:?}")))?;
        if !retained {
            host_frames.push(frame);
        }
    }
    Ok(host_frames)
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use vantare_telemetry::delivery::PullRequest;

    #[test]
    fn rust_pull_keeps_overlay_snapshot_out_of_go_receiver() {
        let snapshot = include_bytes!("../testdata/overlay-snapshot-frame-rust-v1.bin").to_vec();
        let status = ipc::encode(Kind::Status, b"host-status").unwrap();
        let mut overlay = OverlayPull::new();
        assert_eq!(
            route_overlay_frames(&mut overlay, vec![snapshot.clone(), status.clone()]).unwrap(),
            vec![snapshot.clone(), status.clone()]
        );
        overlay
            .pull(
                "studio",
                PullRequest {
                    session_id: "session",
                    ack: 0,
                    sections: 0,
                },
            )
            .unwrap();
        assert_eq!(
            route_overlay_frames(&mut overlay, vec![snapshot, status.clone()]).unwrap(),
            vec![status]
        );
        let response = overlay
            .pull(
                "studio",
                PullRequest {
                    session_id: "session",
                    ack: 0,
                    sections: 0,
                },
            )
            .unwrap()
            .unwrap();
        assert_eq!(response.events[0].name, "telemetry:overlay-v2:snapshot");
    }
}

#[cfg(not(windows))]
fn run_pipe_harness(_: &str, _: &str) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Windows required",
    ))
}

#[cfg(not(windows))]
fn run_candidate_pipe(_: &str, _: &str, _: bool) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Windows required",
    ))
}
