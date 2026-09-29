//! Windows pipe integration harness. Never included in the production binary.

use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::Path;
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::Value;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use vantare_telemetry::assembly::{Assembler, FactReplay};
use vantare_telemetry::ipc::{self, Kind};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let [
        pipe_flag,
        pipe_name,
        nonce_flag,
        nonce_text,
        corpus_flag,
        corpus_path,
        paced_flag,
    ] = args.as_slice()
        && pipe_flag == "--pipe"
        && nonce_flag == "--nonce"
        && corpus_flag == "--high-rate-corpus"
        && paced_flag == "--paced"
    {
        if let Err(error) = run_high_rate_corpus(pipe_name, nonce_text, corpus_path, false, true) {
            eprintln!("telemetry paced high-rate replay failed: {error}");
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
        paced_flag,
    ] = args.as_slice()
        && pipe_flag == "--pipe"
        && nonce_flag == "--nonce"
        && corpus_flag == "--high-rate-corpus"
        && codec_flag == "--engineer-binary"
        && paced_flag == "--paced"
    {
        if let Err(error) = run_high_rate_corpus(pipe_name, nonce_text, corpus_path, true, true) {
            eprintln!("telemetry paced high-rate binary replay failed: {error}");
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
        && corpus_flag == "--high-rate-corpus"
    {
        if let Err(error) = run_high_rate_corpus(pipe_name, nonce_text, corpus_path, false, false) {
            eprintln!("telemetry high-rate pipe replay failed: {error}");
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
        && corpus_flag == "--high-rate-corpus"
        && codec_flag == "--engineer-binary"
    {
        if let Err(error) = run_high_rate_corpus(pipe_name, nonce_text, corpus_path, true, false) {
            eprintln!("telemetry high-rate binary pipe replay failed: {error}");
            std::process::exit(2);
        }
        return;
    }
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HighRateManifest {
    schema: String,
    build: String,
    vehicles: usize,
    shm_ticks: usize,
    rest_reports: usize,
    events: Vec<HighRateEvent>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HighRateEvent {
    kind: String,
    index: usize,
    at_utc: String,
    file: String,
    standings_started_utc: Option<String>,
    standings_completed_utc: Option<String>,
    session_started_utc: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HighRateRestBodies {
    schema: String,
    standings: Value,
    session_info: Value,
}

fn high_rate_utc_ns(value: &str) -> io::Result<i128> {
    OffsetDateTime::parse(value, &Rfc3339)
        .map(|at| at.unix_timestamp_nanos())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid event time"))
}

fn high_rate_elapsed_ns(first: i128, value: &str) -> io::Result<u64> {
    u64::try_from(high_rate_utc_ns(value)? - first + 1_000_000_000)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid elapsed time"))
}

// A test-only proof of the full Rust encode -> Windows pipe -> Go receive path.
// Optional wall-clock pacing diagnoses the receiver at the captured cadence.
// Neither mode includes the production acquisition adapters or proves the CPU gate.
fn run_high_rate_corpus(
    pipe_name: &str,
    nonce_text: &str,
    corpus_path: &str,
    engineer_binary: bool,
    paced: bool,
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
    let corpus = Path::new(corpus_path);
    let manifest: HighRateManifest =
        serde_json::from_slice(&fs::read(corpus.join("manifest.json"))?)?;
    if manifest.schema != "vantare.lmu-temporal-high-rate.v1"
        || manifest.build != "1.4.2.0"
        || manifest.vehicles != 47
        || manifest.shm_ticks != 3600
        || manifest.rest_reports != 239
        || manifest.events.len() != 3839
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "invalid high-rate manifest",
        ));
    }
    let first = high_rate_utc_ns(&manifest.events[0].at_utc)?;
    let mut pipe = OpenOptions::new().read(true).write(true).open(pipe_name)?;
    ipc::write_frame(&mut pipe, Kind::Handshake, &ipc::handshake_payload(&nonce))
        .map_err(|error| io::Error::other(format!("handshake: {error:?}")))?;
    let (kind, configuration) = ipc::read_frame(&mut pipe)
        .map_err(|error| io::Error::other(format!("configuration: {error:?}")))?;
    if kind != Kind::Configuration {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "expected Configuration",
        ));
    }
    let mut assembly =
        Assembler::new(30, 15).map_err(|error| io::Error::other(format!("assembly: {error:?}")))?;
    assembly.set_engineer_binary_candidate(engineer_binary);
    let configuration_frame = ipc::encode(kind, &configuration)
        .map_err(|error| io::Error::other(format!("configuration frame: {error:?}")))?;
    assembly
        .configure(&configuration_frame)
        .map_err(|error| io::Error::other(format!("configure: {error:?}")))?;
    let mut latest_shm = Vec::new();
    let mut latest_shm_ns = 0;
    let mut last_ns = 0;
    let mut shm = 0;
    let mut rest = 0;
    let started = Instant::now();
    for event in &manifest.events {
        let now_ns = high_rate_elapsed_ns(first, &event.at_utc)?;
        if now_ns < last_ns {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "event clock reversed",
            ));
        }
        last_ns = now_ns;
        if paced {
            let due = Duration::from_nanos(now_ns - 1_000_000_000);
            if let Some(remaining) = due.checked_sub(started.elapsed()) {
                std::thread::sleep(remaining);
            }
        }
        let occurred_ns = i64::try_from(high_rate_utc_ns(&event.at_utc)?)
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "event time overflow"))?;
        match event.kind.as_str() {
            "shm" if event.index == shm && event.file == format!("shm-{shm:05}.bin") => {
                latest_shm = fs::read(corpus.join(&event.file))?;
                latest_shm_ns = now_ns;
                shm += 1;
            }
            "rest" if event.index == rest && event.file == format!("rest-{rest:05}.json") => {
                if latest_shm.is_empty() {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "REST before SHM",
                    ));
                }
                let started = high_rate_elapsed_ns(
                    first,
                    event.standings_started_utc.as_deref().ok_or_else(|| {
                        io::Error::new(io::ErrorKind::InvalidData, "REST start missing")
                    })?,
                )?;
                let standings_done = high_rate_elapsed_ns(
                    first,
                    event.standings_completed_utc.as_deref().ok_or_else(|| {
                        io::Error::new(io::ErrorKind::InvalidData, "REST completion missing")
                    })?,
                )?;
                let session_started = high_rate_elapsed_ns(
                    first,
                    event.session_started_utc.as_deref().ok_or_else(|| {
                        io::Error::new(io::ErrorKind::InvalidData, "session start missing")
                    })?,
                )?;
                if !(started <= standings_done
                    && standings_done <= session_started
                    && session_started <= now_ns)
                {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "REST time order invalid",
                    ));
                }
                let bodies: HighRateRestBodies =
                    serde_json::from_slice(&fs::read(corpus.join(&event.file))?)?;
                if bodies.schema != "vantare.lmu-rest-bodies.v1" {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "REST schema invalid",
                    ));
                }
                let cache = assembly.rest_cache_mut();
                cache.accept_standings(
                    &serde_json::to_vec(&bodies.standings)?,
                    started,
                    standings_done,
                );
                cache.accept_session(&serde_json::to_vec(&bodies.session_info)?, now_ns);
                rest += 1;
            }
            _ => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "invalid high-rate event",
                ));
            }
        }
        let frames = assembly
            .apply(
                &latest_shm,
                &manifest.build,
                latest_shm_ns,
                now_ns,
                occurred_ns,
            )
            .map_err(|error| io::Error::other(format!("apply event: {error:?}")))?;
        for frame in frames {
            pipe.write_all(&frame)?;
        }
    }
    if shm != manifest.shm_ticks || rest != manifest.rest_reports {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "incomplete high-rate replay",
        ));
    }
    loop {
        let (kind, payload) = ipc::read_frame(&mut pipe)
            .map_err(|error| io::Error::other(format!("host completion: {error:?}")))?;
        match kind {
            Kind::FactAck => {
                let frame = ipc::encode(kind, &payload)
                    .map_err(|error| io::Error::other(format!("fact ACK frame: {error:?}")))?;
                assembly
                    .acknowledge_fact_frame(&frame)
                    .map_err(|error| io::Error::other(format!("fact ACK: {error:?}")))?;
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
