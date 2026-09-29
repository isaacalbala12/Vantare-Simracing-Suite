//! Windows pipe integration harness. Never included in the production binary.

use std::fs::{self, OpenOptions};
use std::io::{self, Write};

use serde::Deserialize;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use vantare_telemetry::assembly::{Assembler, FactReplay};
use vantare_telemetry::ipc::{self, Kind};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let [pipe_flag, pipe_name, nonce_flag, nonce_text] = args.as_slice()
        && pipe_flag == "--candidate-pipe"
        && nonce_flag == "--candidate-nonce"
    {
        if let Err(error) = run_hung_candidate(pipe_name, nonce_text) {
            eprintln!("telemetry hung peer harness failed: {error}");
            std::process::exit(2);
        }
        return;
    }
    if let [
        pipe_flag,
        pipe_name,
        nonce_flag,
        nonce_text,
        corpus_flag,
        corpus_path,
        codec_flag,
    ] = args.as_slice()
        && pipe_flag == "--pipe"
        && nonce_flag == "--nonce"
        && corpus_flag == "--corpus"
        && codec_flag == "--engineer-binary"
    {
        if let Err(error) = run_corpus(pipe_name, nonce_text, corpus_path, true) {
            eprintln!("telemetry binary corpus replay failed: {error}");
            std::process::exit(2);
        }
        return;
    }
    if let [
        pipe_flag,
        pipe_name,
        nonce_flag,
        nonce_text,
        corpus_flag,
        corpus_path,
    ] = args.as_slice()
        && pipe_flag == "--pipe"
        && nonce_flag == "--nonce"
        && corpus_flag == "--corpus"
    {
        if let Err(error) = run_corpus(pipe_name, nonce_text, corpus_path, false) {
            eprintln!("telemetry corpus replay failed: {error}");
            std::process::exit(2);
        }
        return;
    }
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

// Test-only peer: handshake and accept Configuration, then stop responding.
// The supervisor must time out and close its kill-on-close job.
fn run_hung_candidate(pipe_name: &str, nonce_text: &str) -> io::Result<()> {
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
    let (kind, _) = ipc::read_frame(&mut pipe)
        .map_err(|error| io::Error::other(format!("configuration: {error:?}")))?;
    if kind != Kind::Configuration {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "expected Configuration",
        ));
    }
    loop {
        std::thread::park();
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CorpusManifest {
    build: String,
    samples: Vec<CorpusSample>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CorpusSample {
    index: usize,
    at_utc: String,
    source_ms: u64,
    shared_file: String,
}

fn run_corpus(
    pipe_name: &str,
    nonce_text: &str,
    corpus_path: &str,
    engineer_binary: bool,
) -> io::Result<()> {
    let nonce = ipc::parse_nonce_hex(nonce_text)
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "invalid nonce"))?;
    let suffix = pipe_name.strip_prefix(r"\\.\pipe\vantare-telemetry-");
    if suffix.and_then(ipc::parse_nonce_hex) != Some(nonce) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "invalid pipe name",
        ));
    }
    let corpus = std::path::Path::new(corpus_path);
    let manifest: CorpusManifest =
        serde_json::from_slice(&fs::read(corpus.join("manifest.json"))?)?;
    if !(8..=240).contains(&manifest.samples.len()) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "invalid sample count",
        ));
    }
    let mut pipe = OpenOptions::new().read(true).write(true).open(pipe_name)?;
    ipc::write_frame(&mut pipe, Kind::Handshake, &ipc::handshake_payload(&nonce))
        .map_err(|error| io::Error::other(format!("handshake: {error:?}")))?;
    let mut assembly =
        Assembler::new(30, 15).map_err(|error| io::Error::other(format!("assembly: {error:?}")))?;
    assembly.set_engineer_binary_candidate(engineer_binary);
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
    for (index, sample) in manifest.samples.iter().enumerate() {
        if sample.index != index || sample.shared_file != format!("{index:03}-shm.bin") {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "invalid sample entry",
            ));
        }
        let source_ns = sample
            .source_ms
            .checked_mul(1_000_000)
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "invalid source time"))?;
        let at = OffsetDateTime::parse(&sample.at_utc, &Rfc3339)
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid capture time"))?;
        let occurred_ns = i64::try_from(at.unix_timestamp_nanos())
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "capture time overflow"))?;
        let shared = fs::read(corpus.join(&sample.shared_file))?;
        let frames = assembly
            .apply(&shared, &manifest.build, source_ns, source_ns, occurred_ns)
            .map_err(|error| io::Error::other(format!("apply sample {index}: {error:?}")))?;
        for frame in frames {
            pipe.write_all(&frame)?;
        }
    }
    loop {
        let (kind, payload) = ipc::read_frame(&mut pipe)
            .map_err(|error| io::Error::other(format!("host completion: {error:?}")))?;
        match kind {
            Kind::FactAck => {
                let frame = ipc::encode(kind, &payload)
                    .map_err(|error| io::Error::other(format!("fact ACK: {error:?}")))?;
                assembly
                    .acknowledge_fact_frame(&frame)
                    .map_err(|error| io::Error::other(format!("acknowledge fact: {error:?}")))?;
            }
            Kind::Stop if payload.is_empty() => {
                ipc::write_frame(&mut pipe, Kind::Stop, &[])
                    .map_err(|error| io::Error::other(format!("Stop: {error:?}")))?;
                return Ok(());
            }
            _ => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "unexpected host frame",
                ));
            }
        }
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
            let FactReplay::Frames(replay) = assembly
                .replay_fact_request_frame(&request)
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
    let (kind, payload) = ipc::read_frame(&mut pipe)
        .map_err(|error| io::Error::other(format!("stale replay request: {error:?}")))?;
    let request = ipc::encode(kind, &payload)
        .map_err(|error| io::Error::other(format!("stale replay frame: {error:?}")))?;
    let FactReplay::Resync(boundary) = assembly
        .replay_fact_request_frame(&request)
        .map_err(|error| io::Error::other(format!("stale replay: {error:?}")))?
    else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "expected resync",
        ));
    };
    pipe.write_all(&boundary)?;
    ipc::write_frame(&mut pipe, Kind::Stop, &[])
        .map_err(|error| io::Error::other(format!("end replay: {error:?}")))?;
    let (kind, payload) = ipc::read_frame(&mut pipe)
        .map_err(|error| io::Error::other(format!("wait Stop: {error:?}")))?;
    if kind != Kind::Stop || !payload.is_empty() {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "expected Stop"));
    }
    Ok(())
}
