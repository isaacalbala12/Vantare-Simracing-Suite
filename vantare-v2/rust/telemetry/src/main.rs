use std::io;
#[cfg(windows)]
use std::time::{Duration, Instant};

#[cfg(windows)]
use vantare_telemetry::ipc::pipe_windows::{DeadlinePipe, PipeReadUntil};
use vantare_telemetry::ipc::{self, Kind};

fn main() {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    if arguments == ["--version"] {
        println!("vantare-telemetry {}", env!("CARGO_PKG_VERSION"));
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
    let (kind, payload) = ipc::read_frame(&mut PipeReadUntil {
        pipe: &mut pipe,
        deadline: Instant::now() + Duration::from_secs(2),
    })
    .map_err(|error| io::Error::other(format!("read stop: {error:?}")))?;
    if ipc::status::decode_stop(ipc::Frame {
        kind,
        payload: &payload,
    })
    .is_err()
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "expected empty Stop frame",
        ));
    }
    Ok(())
}

#[cfg(not(windows))]
fn run_pipe_harness(_: &str, _: &str) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Windows required",
    ))
}
