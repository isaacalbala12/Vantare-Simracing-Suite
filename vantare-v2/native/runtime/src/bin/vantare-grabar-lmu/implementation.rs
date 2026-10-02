//! Corpus real de LMU para #1425. Ejecutar en el PC del juego:
//! `vantare-grabar-lmu [--salida <dir nuevo>] [--segundos N] [--escenario <nombre>]`.
//!
//! Ctrl+C o el plazo cierran la captura y crean `corpus.tar.gz` en el directorio.
//! Los crudos quedan en disco incluso si falla el empaquetado. No se sanitizan:
//! contienen los nombres originales del juego; revisar antes de compartirlos.
//!
//! Conserva `vantare.lmu-temporal-high-rate.v1`: `events` contiene frames SHM
//! nuevos y rondas REST completas con JSON válido; el tar ordena manifest,
//! rondas REST, respuestas crudas y frames. Cada evento añade `t_rel_ns` y hash.
//! `responses` conserva CADA consulta, incluso HTTP no exitoso, timeout, cuerpo
//! truncado o conexión rechazada: status null significa que no llegaron headers.
//! `sourceEvents` conserva apertura, cierre y errores de SHM. Todos los tiempos
//! relativos comparten un Instant, UTC se deriva del inicio sin saltos de reloj.
//!
//! El replay actual ignora `responses` y `sourceEvents`: reproduce las rondas
//! completas y SHM, pero necesita ampliarse para reproducir fallos/desconexiones
//! y capturas sin SHM o que crucen medianoche. Aquí no se inventan datos para ello.

use std::fs::{self, File, OpenOptions};
use std::io::{self, BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use flate2::{Compression, write::GzEncoder};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

// Recompilar estos mismos módulos privados en la herramienta permite usar su
// pub(super) sin ampliar la API del runtime ni duplicar el acceso a LMU_Data.
#[cfg(windows)]
#[allow(dead_code)]
#[path = "../../adapter/lmu/frame.rs"]
mod frame;
#[cfg(windows)]
#[allow(dead_code)]
#[path = "../../adapter/lmu/shm.rs"]
mod shm;

const USAGE: &str =
    "uso: vantare-grabar-lmu [--salida <dir nuevo>] [--segundos N] [--escenario <nombre>]";
const SCHEMA: &str = "vantare.lmu-temporal-high-rate.v1";
const REST_SCHEMA: &str = "vantare.lmu-rest-bodies.v1";
const ENDPOINTS: [&str; 2] = ["/rest/watch/standings", "/rest/watch/sessionInfo"];
const MAX_BODY: usize = 1_048_576;
const REST_QUEUE_ROUNDS: usize = 2;
const REST_ROUNDS_PER_TICK: usize = 1;

#[derive(Debug, PartialEq, Eq)]
struct Args {
    salida: Option<PathBuf>,
    segundos: Option<u64>,
    escenario: String,
}

fn parse(args: &[String]) -> Result<Args, String> {
    let mut parsed = Args {
        salida: None,
        segundos: None,
        escenario: "sin-etiquetar".into(),
    };
    let mut args = args.iter();
    while let Some(flag) = args.next() {
        let value = args
            .next()
            .ok_or_else(|| format!("{flag} necesita un valor"))?;
        match flag.as_str() {
            "--salida" => parsed.salida = Some(PathBuf::from(value)),
            "--escenario" if !value.trim().is_empty() => parsed.escenario.clone_from(value),
            "--segundos" => {
                parsed.segundos = Some(
                    value
                        .parse::<u64>()
                        .ok()
                        .filter(|n| *n > 0)
                        .ok_or_else(|| format!("segundos no válidos: {value}"))?,
                );
            }
            _ => return Err(format!("argumento desconocido o valor vacío: {flag}")),
        }
    }
    Ok(parsed)
}

fn ns(start: Instant) -> u64 {
    u64::try_from(start.elapsed().as_nanos()).unwrap_or(u64::MAX)
}

// Fecha gregoriana y empaquetado ustar como en vantare-grabar-acc, sin nuevas
// dependencias. Aquí UTC incluye nanosegundos para el lector temporal de LMU.
fn utc(time: SystemTime) -> String {
    utc_elapsed(time.duration_since(UNIX_EPOCH).unwrap_or_default())
}

fn utc_elapsed(elapsed: Duration) -> String {
    let seconds = elapsed.as_secs();
    let days = i64::try_from(seconds / 86_400).unwrap_or(i64::MAX - 719_468) + 719_468;
    let era = days.div_euclid(146_097);
    let day = days.rem_euclid(146_097);
    let year = (day - day / 1_460 + day / 36_524 - day / 146_096) / 365;
    let doy = day - (365 * year + year / 4 - year / 100);
    let month = (5 * doy + 2) / 153;
    let date = doy - (153 * month + 2) / 5 + 1;
    let month = month + if month < 10 { 3 } else { -9 };
    let year = year + era * 400 + i64::from(month <= 2);
    let day_seconds = seconds % 86_400;
    format!(
        "{year:04}-{month:02}-{date:02}T{:02}:{:02}:{:02}.{:09}Z",
        day_seconds / 3_600,
        day_seconds % 3_600 / 60,
        day_seconds % 60,
        elapsed.subsec_nanos()
    )
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn sha256_file(path: &Path) -> io::Result<String> {
    let mut input = BufReader::new(File::open(path)?);
    let mut digest = Sha256::new();
    let mut buffer = vec![0; 65_536];
    loop {
        let count = input.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

struct Response {
    started: u64,
    finished: u64,
    status: Option<u16>,
    body: Vec<u8>,
    error: Option<String>,
}

/// Backpressure conserva cada ronda adquirida. Si se cancela con la cola
/// llena, el dueño recibe la pendiente en join y la persiste después de la cola.
fn send_round(
    send: &std::sync::mpsc::SyncSender<[Response; 2]>,
    mut round: [Response; 2],
    cancel: &std::sync::atomic::AtomicBool,
) -> Option<[Response; 2]> {
    use std::sync::{atomic::Ordering, mpsc::TrySendError};
    loop {
        if cancel.load(Ordering::Acquire) {
            return Some(round);
        }
        match send.try_send(round) {
            Ok(()) => return None,
            Err(TrySendError::Full(pending)) => round = pending,
            Err(TrySendError::Disconnected(pending)) => return Some(pending),
        }
        std::thread::park_timeout(Duration::from_millis(10));
    }
}

fn persist_rest_tick(
    capture: &mut Capture,
    rounds: &std::sync::mpsc::Receiver<[Response; 2]>,
) -> io::Result<()> {
    for round in rounds.try_iter().take(REST_ROUNDS_PER_TICK) {
        capture.rest(&round)?;
    }
    Ok(())
}

fn fetch(agent: &ureq::Agent, url: &str, start: Instant) -> Response {
    let mut record = Response {
        started: ns(start),
        finished: 0,
        status: None,
        body: Vec::new(),
        error: None,
    };
    match agent.get(url).call() {
        Ok(mut response) => {
            record.status = Some(response.status().as_u16());
            if let Err(error) = response
                .body_mut()
                .as_reader()
                .take((MAX_BODY + 1) as u64)
                .read_to_end(&mut record.body)
            {
                record.error = Some(error.to_string());
            }
            if record.body.len() > MAX_BODY {
                record.body.truncate(MAX_BODY);
                record.error = Some("cuerpo truncado: supera 1 MiB".into());
            }
        }
        Err(error) => record.error = Some(error.to_string()),
    }
    record.finished = ns(start);
    record
}

fn http_agent() -> ureq::Agent {
    ureq::Agent::new_with_config(
        ureq::Agent::config_builder()
            .proxy(None)
            .max_redirects(0)
            .http_status_as_error(false)
            .timeout_global(Some(Duration::from_millis(750)))
            .build(),
    )
}

struct Capture {
    dir: PathBuf,
    wall: SystemTime,
    escenario: String,
    build: Option<String>,
    events: Vec<Value>,
    responses: Vec<Value>,
    source_events: Vec<Value>,
    hashes: serde_json::Map<String, Value>,
    rests: Vec<String>,
    raw_responses: Vec<String>,
    frames: Vec<String>,
}

impl Capture {
    fn new(dir: PathBuf, wall: SystemTime, escenario: String) -> io::Result<Self> {
        // Nunca mezclar ni sobrescribir capturas anteriores.
        fs::create_dir(&dir)?;
        Ok(Self {
            dir,
            wall,
            escenario,
            build: None,
            events: Vec::new(),
            responses: Vec::new(),
            source_events: Vec::new(),
            hashes: serde_json::Map::new(),
            rests: Vec::new(),
            raw_responses: Vec::new(),
            frames: Vec::new(),
        })
    }

    fn at(&self, relative: u64) -> io::Result<String> {
        self.wall
            .duration_since(UNIX_EPOCH)
            .map_err(io::Error::other)?
            .checked_add(Duration::from_nanos(relative))
            .map(utc_elapsed)
            .ok_or_else(|| io::Error::other("instante fuera de rango"))
    }

    fn save(&mut self, name: &str, body: &[u8]) -> io::Result<()> {
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(self.dir.join(name))?;
        output.write_all(body)?;
        output.sync_all()?;
        self.hashes.insert(name.into(), json!(sha256(body)));
        Ok(())
    }

    fn shm(&mut self, relative: u64, bytes: &[u8]) -> io::Result<()> {
        let index = self.frames.len();
        let name = format!("shm-{index:06}.bin");
        self.save(&name, bytes)?;
        self.events
            .push(json!({ "kind": "shm", "index": index, "file": name,
            "atUtc": self.at(relative)?, "t_rel_ns": relative, "sha256": self.hashes[&name] }));
        self.frames.push(name);
        Ok(())
    }

    fn rest(&mut self, round: &[Response; 2]) -> io::Result<()> {
        for (endpoint, response) in ENDPOINTS.iter().zip(round) {
            let name = format!("http-{:06}.bin", self.responses.len());
            self.save(&name, &response.body)?;
            self.responses
                .push(json!({ "endpoint": endpoint, "file": name,
                "started_t_rel_ns": response.started, "t_rel_ns": response.finished,
                "startedUtc": self.at(response.started)?, "atUtc": self.at(response.finished)?,
                "http_status": response.status, "error": response.error,
                "sha256": self.hashes[&name] }));
            self.raw_responses.push(name);
        }
        // El lector antiguo solo sabe reproducir rondas completas. Los fallos
        // quedan íntegros en responses, sin convertirlos en JSON de éxito falso.
        let bodies: Option<Vec<Value>> = round
            .iter()
            .map(|response| {
                response
                    .status
                    .filter(|status| (200..300).contains(status))?;
                if response.error.is_some() {
                    return None;
                }
                serde_json::from_slice(&response.body).ok()
            })
            .collect();
        if let Some(bodies) = bodies {
            let index = self.rests.len();
            let name = format!("rest-{index:06}.json");
            let bytes = serde_json::to_vec(&json!({ "schema": REST_SCHEMA,
                "standings": bodies[0], "sessionInfo": bodies[1] }))?;
            self.save(&name, &bytes)?;
            self.events
                .push(json!({ "kind": "rest", "index": index, "file": name,
                "t_rel_ns": round[1].finished, "atUtc": self.at(round[1].finished)?,
                "standingsStartedUtc": self.at(round[0].started)?,
                "standingsFinishedUtc": self.at(round[0].finished)?,
                "sessionStartedUtc": self.at(round[1].started)?,
                "sessionFinishedUtc": self.at(round[1].finished)?, "sha256": self.hashes[&name] }));
            self.rests.push(name);
        }
        Ok(())
    }

    fn source(&mut self, relative: u64, state: &str, error: Option<&str>) -> io::Result<()> {
        self.source_events
            .push(json!({ "t_rel_ns": relative, "atUtc": self.at(relative)?,
            "state": state, "error": error }));
        Ok(())
    }

    fn manifest(&mut self, elapsed: Duration, error: Option<&str>, executable_hash: &str) -> Value {
        self.events
            .sort_by_key(|event| event["t_rel_ns"].as_u64().unwrap_or(0));
        json!({ "schema": SCHEMA, "recorder": "vantare-grabar-lmu", "recorderSha256": executable_hash,
            "build": self.build, "escenario": self.escenario, "startedUtc": utc(self.wall),
            "durationSeconds": elapsed.as_secs_f64(), "duration_ns": u64::try_from(elapsed.as_nanos()).unwrap_or(u64::MAX),
            "complete": error.is_none(), "error": error, "sanitized": false,
            "restBackpressure": { "queueRounds": REST_QUEUE_ROUNDS, "roundsPerTick": REST_ROUNDS_PER_TICK },
            "events": self.events, "responses": self.responses, "sourceEvents": self.source_events,
            "sha256": self.hashes,
            "counts": { "shm": self.frames.len(), "rest": self.rests.len(), "responses": self.responses.len() } })
    }

    fn finish(
        &mut self,
        elapsed: Duration,
        error: Option<&str>,
        executable_hash: &str,
    ) -> io::Result<PathBuf> {
        let manifest = serde_json::to_vec_pretty(&self.manifest(elapsed, error, executable_hash))?;
        self.save("manifest.json", &manifest)?;
        let archive = self.dir.join("corpus.tar.gz");
        let names = std::iter::once("manifest.json".to_owned())
            .chain(self.rests.clone())
            .chain(self.raw_responses.clone())
            .chain(self.frames.clone());
        pack(&archive, &self.dir, names)?;
        Ok(archive)
    }
}

fn octal(field: &mut [u8], number: u64) -> io::Result<()> {
    let digits = format!("{number:0width$o}", width = field.len() - 1);
    if digits.len() >= field.len() {
        return Err(io::Error::other("campo ustar fuera de rango"));
    }
    field[..digits.len()].copy_from_slice(digits.as_bytes());
    field[field.len() - 1] = 0;
    Ok(())
}

fn pack(path: &Path, dir: &Path, names: impl Iterator<Item = String>) -> io::Result<()> {
    let output = OpenOptions::new().write(true).create_new(true).open(path)?;
    let mut gzip = GzEncoder::new(BufWriter::new(output), Compression::fast());
    for name in names {
        if name.is_empty() || name.len() > 100 {
            return Err(io::Error::other("nombre ustar no válido"));
        }
        let mut file = File::open(dir.join(&name))?;
        let size = file.metadata()?.len();
        let mut header = [0; 512];
        header[..name.len()].copy_from_slice(name.as_bytes());
        octal(&mut header[100..108], 0o644)?;
        octal(&mut header[108..116], 0)?;
        octal(&mut header[116..124], 0)?;
        octal(&mut header[124..136], size)?;
        octal(&mut header[136..148], 0)?;
        header[156] = b'0';
        header[257..263].copy_from_slice(b"ustar\0");
        header[263..265].copy_from_slice(b"00");
        header[148..156].fill(b' ');
        let checksum: u64 = header.iter().map(|byte| u64::from(*byte)).sum();
        octal(&mut header[148..155], checksum)?;
        header[155] = b' ';
        gzip.write_all(&header)?;
        if io::copy(&mut file, &mut gzip)? != size {
            return Err(io::Error::other("fichero cambiado durante empaquetado"));
        }
        let padding = usize::try_from((512 - size % 512) % 512).map_err(io::Error::other)?;
        gzip.write_all(&[0; 512][..padding])?;
    }
    gzip.write_all(&[0; 1024])?;
    let mut output = gzip.finish()?;
    output.flush()?;
    output.get_ref().sync_all()
}

#[cfg(windows)]
fn record(
    capture: &mut Capture,
    start: Instant,
    seconds: Option<u64>,
    stop: &std::sync::atomic::AtomicBool,
    rounds: &std::sync::mpsc::Receiver<[Response; 2]>,
) -> io::Result<()> {
    use std::sync::atomic::Ordering;
    let mut source: Option<shm::RunningSource> = None;
    let mut retry = Duration::ZERO;
    let mut bytes = vec![0; frame::OBJECT_OUT_SIZE];
    let mut scratch = bytes.clone();
    let mut previous: Option<Vec<u8>> = None;
    while !stop.load(Ordering::Acquire)
        && seconds.is_none_or(|limit| start.elapsed() < Duration::from_secs(limit))
    {
        persist_rest_tick(capture, rounds)?;
        if source.is_none() && start.elapsed() >= retry {
            retry = start.elapsed() + Duration::from_secs(1);
            match shm::RunningSource::open() {
                Ok(running) => {
                    let build = running.build.exact_supported_build().ok_or_else(|| {
                        io::Error::other(format!(
                            "build {} sin layout verificado",
                            running.build.file_version()
                        ))
                    })?;
                    if capture
                        .build
                        .as_deref()
                        .is_some_and(|previous| previous != build)
                    {
                        return Err(io::Error::other("LMU cambió de build: usar otra captura"));
                    }
                    capture.build = Some(build.to_owned());
                    capture.source(ns(start), "connected", None)?;
                    source = Some(running);
                    previous = None;
                }
                Err(error) => capture.source(ns(start), "unavailable", Some(&error.to_string()))?,
            }
        }
        if let Some(running) = &source {
            match running.read_stable(&mut bytes, &mut scratch) {
                Ok(()) if previous.as_ref() != Some(&bytes) => {
                    let relative = ns(start); // disponibilidad, antes del I/O a disco
                    capture.shm(relative, &bytes)?;
                    previous
                        .get_or_insert_with(|| vec![0; bytes.len()])
                        .copy_from_slice(&bytes);
                }
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                    capture.source(ns(start), "unstable", Some(&error.to_string()))?;
                }
                Err(error) => {
                    capture.source(ns(start), "disconnected", Some(&error.to_string()))?;
                    source = None;
                    retry = start.elapsed() + Duration::from_secs(1);
                }
            }
        }
        std::thread::sleep(Duration::from_nanos(1_000_000_000 / 60));
    }
    Ok(())
}

#[cfg(windows)]
fn install_stop() -> io::Result<&'static std::sync::atomic::AtomicBool> {
    use std::sync::atomic::{AtomicBool, Ordering};
    use windows_sys::Win32::System::Console::SetConsoleCtrlHandler;
    static STOP: AtomicBool = AtomicBool::new(false);
    unsafe extern "system" fn signal(event: u32) -> i32 {
        if event > 1 {
            return 0;
        } // Ctrl+C y Ctrl+Break; otros cierres los gestiona Windows.
        STOP.store(true, Ordering::Release);
        1
    }
    // SAFETY: firma PHANDLER_ROUTINE, sin capturas ni punteros; STOP es estático.
    // A diferencia del núcleo no imponemos 4 s: comprimir el corpus puede tardar.
    if unsafe { SetConsoleCtrlHandler(Some(signal), 1) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(&STOP)
}

#[cfg(windows)]
fn run(args: Args) -> io::Result<()> {
    use std::sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc,
    };
    let stop = install_stop()?;
    let executable_hash = sha256_file(&std::env::current_exe()?)?;
    let wall = SystemTime::now();
    let start = Instant::now();
    let dir = args.salida.unwrap_or_else(|| {
        PathBuf::from(format!(
            "lmu-{}-{}",
            wall.duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            std::process::id()
        ))
    });
    let mut capture = Capture::new(dir, wall, args.escenario)?;
    eprintln!(
        "Grabando en {} (Ctrl+C para terminar); crudos sin sanitizar",
        capture.dir.display()
    );
    let cancelled = Arc::new(AtomicBool::new(false));
    let cancel = Arc::clone(&cancelled);
    let (send, rounds) = mpsc::sync_channel(REST_QUEUE_ROUNDS);
    let worker = std::thread::spawn(move || {
        let agent = http_agent();
        while !cancel.load(Ordering::Acquire) {
            let round =
                ENDPOINTS.map(|path| fetch(&agent, &format!("http://127.0.0.1:6397{path}"), start));
            if let Some(pending) = send_round(&send, round, &cancel) {
                return Some(pending);
            }
            std::thread::park_timeout(Duration::from_millis(250));
        }
        None
    });
    let mut result = record(&mut capture, start, args.segundos, stop, &rounds);
    cancelled.store(true, Ordering::Release);
    worker.thread().unpark();
    let pending = if let Ok(pending) = worker.join() {
        pending
    } else {
        if result.is_ok() {
            result = Err(io::Error::other("el hilo REST terminó con pánico"));
        }
        None
    };
    for round in rounds.try_iter().chain(pending) {
        if let Err(error) = capture.rest(&round) {
            if result.is_ok() {
                result = Err(error);
            }
            break;
        }
    }
    let error = result.as_ref().err().map(ToString::to_string);
    let archive = capture.finish(start.elapsed(), error.as_deref(), &executable_hash)?;
    eprintln!(
        "{}: {} frames, {} respuestas REST",
        archive.display(),
        capture.frames.len(),
        capture.responses.len()
    );
    result
}

pub(super) fn run_cli() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        println!("{USAGE}");
        return;
    }
    let args = match parse(&args) {
        Ok(args) => args,
        Err(error) => {
            eprintln!("{error}\n{USAGE}");
            std::process::exit(2);
        }
    };
    #[cfg(windows)]
    if let Err(error) = run(args) {
        eprintln!("grabación LMU: {error}");
        std::process::exit(1);
    }
    #[cfg(not(windows))]
    {
        let _ = args;
        eprintln!("la captura de LMU requiere Windows");
        std::process::exit(1);
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static ID: AtomicU64 = AtomicU64::new(0);
    struct Temp(PathBuf);
    impl Drop for Temp {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).expect("limpiar captura de prueba");
        }
    }
    fn capture() -> (Capture, Temp) {
        let dir = std::env::temp_dir().join(format!(
            "lmu-recorder-test-{}-{}",
            std::process::id(),
            ID.fetch_add(1, Ordering::Relaxed)
        ));
        (
            Capture::new(
                dir.clone(),
                UNIX_EPOCH + Duration::from_hours(497_412),
                "test".into(),
            )
            .unwrap(),
            Temp(dir),
        )
    }
    fn response(status: Option<u16>, body: &[u8], started: u64, finished: u64) -> Response {
        Response {
            status,
            body: body.to_vec(),
            started,
            finished,
            error: status.is_none().then(|| "conexión rechazada".into()),
        }
    }

    #[test]
    fn rest_backpressure_is_bounded_and_cancellation_preserves_pending_order() {
        use std::sync::{Arc, atomic::AtomicBool, mpsc};
        let (send, rounds) = mpsc::sync_channel(REST_QUEUE_ROUNDS);
        let round = |index| {
            [
                response(Some(200), b"[]", index, index),
                response(Some(200), b"{}", index, index),
            ]
        };
        for index in 0..u64::try_from(REST_QUEUE_ROUNDS).expect("cota de cola") {
            assert!(send.try_send(round(index)).is_ok());
        }
        let cancel = Arc::new(AtomicBool::new(false));
        let stopped = Arc::clone(&cancel);
        let worker = std::thread::spawn(move || send_round(&send, round(2), &stopped));
        // Disco detenido: cola llena y productor con una única ronda propia.
        // Cancelar sin drenar tiene que desbloquear join y conservar esa ronda.
        cancel.store(true, Ordering::Release);
        worker.thread().unpark();
        let pending = worker
            .join()
            .expect("cierre sin deadlock")
            .expect("ronda pendiente");
        let got: Vec<_> = rounds
            .try_iter()
            .chain([pending])
            .map(|round| round[0].started)
            .collect();
        assert_eq!(got, [0, 1, 2]);
    }

    #[test]
    fn each_rest_tick_leaves_work_for_the_next_shm_turn() {
        use std::sync::mpsc;
        let (send, rounds) = mpsc::sync_channel(REST_QUEUE_ROUNDS);
        for index in 0..2 {
            assert!(
                send.try_send([
                    response(Some(200), b"[]", index, index),
                    response(Some(200), b"{}", index, index)
                ])
                .is_ok()
            );
        }
        let (mut capture, _temp) = capture();
        persist_rest_tick(&mut capture, &rounds).expect("una vuelta");
        assert_eq!(capture.responses.len(), 2);
        assert_eq!(
            rounds.try_recv().expect("ronda para próxima vuelta")[0].started,
            1
        );
        assert!(rounds.try_recv().is_err());
    }

    #[test]
    fn arguments_require_positive_duration_and_preserve_the_scenario() {
        let args = |values: &[&str]| values.iter().map(|s| (*s).into()).collect::<Vec<_>>();
        let parsed = parse(&args(&[
            "--salida",
            "dir",
            "--segundos",
            "60",
            "--escenario",
            "REST caído",
        ]))
        .unwrap();
        assert_eq!(parsed.segundos, Some(60));
        assert_eq!(parsed.escenario, "REST caído");
        for values in [
            &["--segundos", "0"][..],
            &["--segundos", "-1"],
            &["--salida"],
            &["--escenario", " "],
            &["--otro", "1"],
        ] {
            assert!(parse(&args(values)).is_err());
        }
    }

    #[test]
    fn records_preserve_raw_bytes_times_http_errors_and_sha256() {
        let (mut capture, _temp) = capture();
        capture.shm(20, &[0, 255, 42]).unwrap();
        capture
            .rest(&[
                response(Some(503), b"service unavailable", 5, 10),
                response(None, b"", 11, 15),
            ])
            .unwrap();
        assert_eq!(
            fs::read(capture.dir.join("shm-000000.bin")).unwrap(),
            [0, 255, 42]
        );
        assert_eq!(capture.responses[0]["http_status"], 503);
        assert_eq!(capture.responses[0]["t_rel_ns"], 10);
        assert!(capture.responses[1]["http_status"].is_null());
        assert_eq!(capture.responses[1]["error"], "conexión rechazada");
        assert_eq!(
            fs::read(capture.dir.join("http-000000.bin")).unwrap(),
            b"service unavailable"
        );
        assert_eq!(
            capture.hashes["http-000001.bin"],
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert!(capture.rests.is_empty());
        assert_eq!(capture.events.len(), 1);
        assert!(Capture::new(capture.dir.clone(), UNIX_EPOCH, "x".into()).is_err());
    }

    #[test]
    fn manifest_orders_events_and_keeps_complete_rounds_in_the_legacy_format() {
        let (mut capture, _temp) = capture();
        capture.build = Some("1.4.2.0".into());
        capture.shm(30, &[7; 4]).unwrap();
        capture
            .rest(&[
                response(Some(200), b"[]", 1, 10),
                response(Some(200), b"{}", 11, 20),
            ])
            .unwrap();
        capture
            .source(40, "disconnected", Some("juego cerrado"))
            .unwrap();
        let manifest = capture.manifest(Duration::from_secs(1), None, "abc");
        assert_eq!(manifest["schema"], SCHEMA);
        assert_eq!(manifest["build"], "1.4.2.0");
        assert_eq!(manifest["events"][0]["kind"], "rest");
        assert_eq!(manifest["events"][1]["kind"], "shm");
        assert_eq!(
            manifest["counts"],
            json!({"shm": 1, "rest": 1, "responses": 2})
        );
        assert_eq!(manifest["sourceEvents"][0]["t_rel_ns"], 40);
        let round: Value =
            serde_json::from_slice(&fs::read(capture.dir.join("rest-000000.json")).unwrap())
                .unwrap();
        assert_eq!(
            round,
            json!({ "schema": REST_SCHEMA, "standings": [], "sessionInfo": {} })
        );
        for (name, hash) in manifest["sha256"].as_object().unwrap() {
            assert_eq!(*hash, sha256_file(&capture.dir.join(name)).unwrap());
        }
        let partial = capture.manifest(Duration::ZERO, Some("disco lleno"), "abc");
        assert_eq!(partial["complete"], false);
        assert_eq!(partial["error"], "disco lleno");
    }

    #[test]
    fn utc_preserves_nanoseconds_leap_days_and_day_rollover() {
        assert_eq!(utc(UNIX_EPOCH), "1970-01-01T00:00:00.000000000Z");
        assert_eq!(
            utc_elapsed(Duration::new(1_709_164_800, 123)),
            "2024-02-29T00:00:00.000000123Z"
        );
        assert_eq!(
            utc(UNIX_EPOCH + Duration::from_hours(24)),
            "1970-01-02T00:00:00.000000000Z"
        );
    }

    #[test]
    fn packaged_capture_replays_real_frames_and_keeps_every_file_hash() {
        use vantare_domain::Adapter;
        let (mut capture, _temp) = capture();
        let frame = include_bytes!("../../../../../testdata/lmu-fixture.bin");
        capture.build = Some("1.3.0.0".into());
        capture.shm(0, frame).unwrap();
        capture
            .rest(&[
                response(Some(200), b"[]", 1_000_000, 2_000_000),
                response(Some(200), b"{}", 3_000_000, 4_000_000),
            ])
            .unwrap();
        capture.shm(5_000_000, frame).unwrap();
        let path = capture
            .finish(Duration::from_millis(10), None, "hash")
            .unwrap();
        let mut replay = vantare_runtime::adapter::open_replay(&path, None).unwrap();
        assert_eq!(
            replay
                .poll(Duration::from_secs(1))
                .unwrap()
                .unwrap()
                .state
                .cars
                .len(),
            44
        );
        assert!(replay.poll(Duration::from_millis(1_004)).unwrap().is_some());
        assert!(replay.poll(Duration::from_millis(1_005)).unwrap().is_some());
        assert!(replay.poll(Duration::from_secs(2)).unwrap().is_none());
        // Auditar independientemente las cabeceras y contenido del tar producido.
        let mut tar = flate2::read::GzDecoder::new(File::open(path).unwrap());
        let mut found = Vec::new();
        loop {
            let mut header = [0; 512];
            tar.read_exact(&mut header).unwrap();
            if header.iter().all(|byte| *byte == 0) {
                break;
            }
            let name_end = header[..100].iter().position(|byte| *byte == 0).unwrap();
            let name = std::str::from_utf8(&header[..name_end]).unwrap().to_owned();
            let checksum =
                u64::from_str_radix(std::str::from_utf8(&header[148..154]).unwrap(), 8).unwrap();
            header[148..156].fill(b' ');
            assert_eq!(
                checksum,
                header.iter().map(|byte| u64::from(*byte)).sum::<u64>()
            );
            let size =
                usize::from_str_radix(std::str::from_utf8(&header[124..135]).unwrap(), 8).unwrap();
            let mut contents = vec![0; size];
            tar.read_exact(&mut contents).unwrap();
            assert_eq!(sha256(&contents), capture.hashes[&name]);
            let padding = (512 - size % 512) % 512;
            tar.read_exact(&mut [0; 512][..padding]).unwrap();
            found.push(name);
        }
        assert_eq!(
            found,
            [
                "manifest.json",
                "rest-000000.json",
                "http-000000.bin",
                "http-000001.bin",
                "shm-000000.bin",
                "shm-000001.bin"
            ]
        );
    }

    fn serve(
        status: &str,
        body: Vec<u8>,
        declared_length: usize,
    ) -> (String, std::thread::JoinHandle<()>) {
        use std::io::BufRead;
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!(
            "http://{}/rest/watch/standings",
            listener.local_addr().unwrap()
        );
        let status = status.to_owned();
        let worker = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(&socket);
            loop {
                let mut line = String::new();
                if reader.read_line(&mut line).unwrap() == 0 || line == "\r\n" {
                    break;
                }
            }
            write!(socket, "HTTP/1.1 {status}\r\nContent-Length: {declared_length}\r\nConnection: close\r\n\r\n").unwrap();
            // La grabadora puede cerrar al superar el límite de cuerpo.
            match socket.write_all(&body) {
                Ok(()) => {}
                Err(error)
                    if matches!(
                        error.kind(),
                        io::ErrorKind::BrokenPipe
                            | io::ErrorKind::ConnectionReset
                            | io::ErrorKind::ConnectionAborted
                    ) => {}
                Err(error) => panic!("respuesta de prueba: {error}"),
            }
        });
        (url, worker)
    }

    #[test]
    fn http_capture_preserves_non_success_status_partial_bodies_and_limits() {
        let agent = http_agent();
        let (url, worker) = serve("503 Unavailable", b"offline".to_vec(), 7);
        let start = Instant::now();
        let record = fetch(&agent, &url, start);
        worker.join().unwrap();
        assert_eq!(record.status, Some(503));
        assert_eq!(record.body, b"offline");
        assert!(record.error.is_none());
        assert!(record.finished >= record.started);

        let (url, worker) = serve("200 OK", b"partial".to_vec(), 100);
        let record = fetch(&agent, &url, start);
        worker.join().unwrap();
        assert_eq!(record.status, Some(200));
        assert_eq!(record.body, b"partial");
        assert!(record.error.is_some());

        let too_large = MAX_BODY + 1;
        let (url, worker) = serve("200 OK", vec![b'x'; too_large], too_large);
        let record = fetch(&agent, &url, start);
        worker.join().unwrap();
        assert_eq!(record.body.len(), MAX_BODY);
        assert!(record.error.is_some());
    }

    #[test]
    fn malformed_json_and_rest_transport_failure_are_recorded_without_fake_success() {
        let (mut capture, _temp) = capture();
        capture
            .rest(&[
                response(Some(200), b"not json", 0, 1),
                response(Some(200), b"{}", 2, 3),
            ])
            .unwrap();
        assert_eq!(capture.responses.len(), 2);
        assert!(capture.rests.is_empty());
        let url = {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            format!(
                "http://{}/rest/watch/sessionInfo",
                listener.local_addr().unwrap()
            )
        };
        let record = fetch(&http_agent(), &url, Instant::now());
        assert!(record.status.is_none());
        assert!(record.error.is_some());
        assert!(record.body.is_empty());
    }
}
