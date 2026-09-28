use std::io;
#[cfg(windows)]
use std::time::{Duration, Instant};

#[cfg(windows)]
use vantare_telemetry::ipc::pipe_windows::DeadlinePipe;
#[cfg(windows)]
use vantare_telemetry::ipc::queue::WriterQueue;
use vantare_telemetry::ipc::{self, Kind};
#[cfg(windows)]
use vantare_telemetry::lmu::{acquisition::Acquisition, cadence::TickCadence};

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
        if let Err(error) = run_candidate_pipe(pipe_name, nonce_text) {
            eprintln!("vantare-telemetry: candidate IPC failed: {error}");
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
fn run_candidate_pipe(pipe_name: &str, nonce_text: &str) -> io::Result<()> {
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
    let mut acquisition = Acquisition::open(30, stream)
        .map_err(|error| io::Error::other(format!("open LMU: {error:?}")))?;
    let result = run_candidate_loop(&mut pipe, &mut acquisition, first);
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
    first: Vec<u8>,
) -> io::Result<()> {
    let mut queue = WriterQueue::new();
    acquisition
        .handle_control_frame(&first, &mut queue)
        .map_err(|error| io::Error::other(format!("configure LMU: {error:?}")))?;
    let mut cadence = TickCadence::new(Instant::now());
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
            acquisition
                .handle_control_frame(&frame, &mut queue)
                .map_err(|error| io::Error::other(format!("host control: {error:?}")))?;
        }
        acquisition
            .tick_into_queue_if_due(&mut cadence, Instant::now(), &mut queue)
            .map_err(|error| io::Error::other(format!("LMU tick: {error:?}")))?;
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

#[cfg(not(windows))]
fn run_pipe_harness(_: &str, _: &str) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Windows required",
    ))
}

#[cfg(not(windows))]
fn run_candidate_pipe(_: &str, _: &str) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Windows required",
    ))
}
