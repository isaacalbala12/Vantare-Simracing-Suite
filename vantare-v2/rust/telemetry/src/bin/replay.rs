//! Windows pipe integration harness. Never included in the production binary.

use std::fs::{self, OpenOptions};
use std::io::{self, Write};

use vantare_telemetry::assembly::{Assembler, FactReplay};
use vantare_telemetry::ipc::{self, Kind};
use vantare_telemetry::lmu::mapper::ClockChange;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [
        pipe_flag,
        pipe_name,
        nonce_flag,
        nonce_text,
        fixture_flag,
        fixture_path,
    ] = args.as_slice()
    else {
        eprintln!("replay helper requires pipe, nonce and audited fixture path");
        std::process::exit(2);
    };
    if pipe_flag != "--pipe" || nonce_flag != "--nonce" || fixture_flag != "--fixture" {
        std::process::exit(2);
    }
    if let Err(error) = run(pipe_name, nonce_text, fixture_path) {
        eprintln!("telemetry replay helper failed: {error}");
        std::process::exit(2);
    }
}

fn run(pipe_name: &str, nonce_text: &str, fixture_path: &str) -> io::Result<()> {
    let nonce = ipc::parse_nonce_hex(nonce_text)
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "invalid nonce"))?;
    let suffix = pipe_name.strip_prefix(r"\\.\pipe\vantare-telemetry-");
    if suffix.and_then(ipc::parse_nonce_hex) != Some(nonce) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "invalid pipe name",
        ));
    }
    let mut pipe = OpenOptions::new().read(true).write(true).open(pipe_name)?;
    ipc::write_frame(&mut pipe, Kind::Handshake, &ipc::handshake_payload(&nonce))
        .map_err(|error| io::Error::other(format!("handshake: {error:?}")))?;
    let mut assembly =
        Assembler::new(30, 15).map_err(|error| io::Error::other(format!("assembly: {error:?}")))?;
    let fixture = fs::read(fixture_path)?;
    for sequence in 1..=2 {
        let (kind, configuration) = ipc::read_frame(&mut pipe)
            .map_err(|error| io::Error::other(format!("configuration: {error:?}")))?;
        if kind != Kind::Configuration {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "expected Configuration",
            ));
        }
        let frame = ipc::encode(kind, &configuration)
            .map_err(|error| io::Error::other(format!("configuration frame: {error:?}")))?;
        assembly
            .configure(&frame)
            .map_err(|error| io::Error::other(format!("configure: {error:?}")))?;
        let frames = assembly
            .apply(
                &fixture,
                "1.3.0.0",
                100 * sequence,
                100 * sequence,
                100_000_000_000 + i64::try_from(sequence).unwrap(),
                ClockChange::Continuous,
            )
            .map_err(|error| io::Error::other(format!("apply: {error:?}")))?;
        for frame in frames {
            pipe.write_all(&frame)?;
        }
        if sequence == 1 {
            let (kind, payload) = ipc::read_frame(&mut pipe)
                .map_err(|error| io::Error::other(format!("replay request: {error:?}")))?;
            let request = ipc::encode(kind, &payload)
                .map_err(|error| io::Error::other(format!("replay request frame: {error:?}")))?;
            let cursor = ipc::fact_replay::decode_frame(&request)
                .map_err(|error| io::Error::other(format!("decode replay request: {error:?}")))?;
            let FactReplay::Frames(replay) = assembly
                .replay_fact_frames_after(cursor)
                .map_err(|error| io::Error::other(format!("replay fact: {error:?}")))?
            else {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "unexpected resync",
                ));
            };
            for frame in replay {
                pipe.write_all(frame)?;
            }
            let (kind, payload) = ipc::read_frame(&mut pipe)
                .map_err(|error| io::Error::other(format!("fact ACK: {error:?}")))?;
            let frame = ipc::encode(kind, &payload)
                .map_err(|error| io::Error::other(format!("fact ACK frame: {error:?}")))?;
            let acknowledged = assembly
                .acknowledge_fact_frame(&frame)
                .map_err(|error| io::Error::other(format!("acknowledge fact: {error:?}")))?;
            if acknowledged.stream != 15 || acknowledged.sequence != 1 {
                return Err(io::Error::new(io::ErrorKind::InvalidData, "wrong fact ACK"));
            }
        }
    }
    ipc::write_frame(&mut pipe, Kind::Stop, &[])
        .map_err(|error| io::Error::other(format!("end replay: {error:?}")))?;
    let (kind, payload) = ipc::read_frame(&mut pipe)
        .map_err(|error| io::Error::other(format!("wait Stop: {error:?}")))?;
    if kind != Kind::Stop || !payload.is_empty() {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "expected Stop"));
    }
    Ok(())
}
