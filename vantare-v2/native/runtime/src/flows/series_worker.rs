//! Cliente de proceso: todo I/O fuera de adquisición; `DuckDB` no se enlaza aquí.

use std::io::{self, BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use super::series_close::{self, CloseLimits, CloseProbe, Closed};
use super::{
    LapSummary, MAX_ANALYZED_LAPS, MAX_CHUNK_BYTES, SeriesAnalysis, SeriesChunk, SessionEvent,
};
use arc_swap::ArcSwap;
use serde_json::{Value, json};

const SESSION_QUEUE: usize = 64;

#[derive(Default)]
struct SessionDelivery {
    enabled: AtomicBool,
    dropped: AtomicU64,
}

struct SessionPump {
    receiver: mpsc::Receiver<SessionEvent>,
    delivery: Arc<SessionDelivery>,
    rejected_warned: bool,
    loss_warned: bool,
}

impl SessionPump {
    fn warn_loss(&mut self) {
        if !self.loss_warned && self.delivery.dropped.load(Ordering::Relaxed) > 0 {
            eprintln!("grabación: eventos de sesión descartados por cola llena/desconectada");
            self.loss_warned = true;
        }
    }

    fn drain(&mut self, pipe: &mut Pipe) -> io::Result<()> {
        self.warn_loss();
        for _ in 0..SESSION_QUEUE {
            let Ok(event) = self.receiver.try_recv() else {
                break;
            };
            if !self.delivery.enabled.load(Ordering::Acquire) {
                continue;
            }
            pipe.send(&event.command())?;
            let response = pipe.response()?;
            if response == event.acknowledgment() {
                continue;
            }
            match response.as_array().map(Vec::as_slice) {
                Some([Value::String(kind), Value::String(reason)])
                    if kind == "unsupported" && reason == "meta" =>
                {
                    self.delivery.enabled.store(false, Ordering::Release);
                }
                Some([Value::String(kind), Value::String(reason)]) if kind == "rejected" => {
                    if !self.rejected_warned {
                        eprintln!("grabación: evento de sesión rechazado: {reason}");
                        self.rejected_warned = true;
                    }
                }
                _ => return Err(invalid("ACK de sesión desconocido")),
            }
        }
        Ok(())
    }
}

pub const MAX_STORAGE_PAGE_CHUNKS: usize = 16;
const MAX_RESPONSE_BYTES: usize = MAX_CHUNK_BYTES * MAX_STORAGE_PAGE_CHUNKS + 128;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SeriesStorageState {
    pub watermark: u64,
    pub finished: bool,
    /// Conocido solo tras finish. EOF/caída conserva finished=false.
    pub attempted: u64,
}

impl SeriesStorageState {
    pub fn tail_lost(&self) -> Option<u64> {
        if self.finished {
            self.attempted.checked_sub(self.watermark)
        } else {
            None
        }
    }
}

/// Resúmenes del prefijo durable, latest-wins; no bloquean al consumidor.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct RecordedSeriesSummary {
    pub watermark: u64,
    pub active: Option<LapSummary>,
    pub recent: Vec<LapSummary>,
}

fn publish_analysis(
    latest: &ArcSwap<RecordedSeriesSummary>,
    analysis: &SeriesAnalysis,
    watermark: u64,
) {
    latest.store(Arc::new(RecordedSeriesSummary {
        watermark,
        active: analysis.active().cloned(),
        recent: analysis.recent().iter().cloned().collect(),
    }));
}

struct Pipe {
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    /// Respuestas completas leídas: el progreso que mira el cierre (#2871).
    progress: Arc<AtomicU64>,
}

impl Pipe {
    fn send(&mut self, command: &Value) -> io::Result<()> {
        let bytes = serde_json::to_vec(command)?;
        if bytes.len() > MAX_CHUNK_BYTES + 127 {
            return Err(invalid("petición fuera de límites"));
        }
        self.input.write_all(&bytes)?;
        self.input.write_all(b"\n")?;
        self.input.flush()
    }

    fn response(&mut self) -> io::Result<Value> {
        let mut bytes = Vec::new();
        io::Read::take(&mut self.output, (MAX_RESPONSE_BYTES + 1) as u64)
            .read_until(b'\n', &mut bytes)?;
        if bytes.is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "storage terminó sin respuesta",
            ));
        }
        if bytes.len() > MAX_RESPONSE_BYTES || bytes.last() != Some(&b'\n') {
            return Err(invalid("respuesta truncada o fuera de límites"));
        }
        self.progress.fetch_add(1, Ordering::Release);
        Ok(serde_json::from_slice(&bytes)?)
    }

    fn state(&mut self, kind: &str) -> io::Result<SeriesStorageState> {
        let value = self.response()?;
        let fields = value.as_array().ok_or_else(|| invalid("estado inválido"))?;
        match fields.as_slice() {
            [
                Value::String(name),
                watermark,
                Value::Bool(finished),
                attempted,
            ] if name == kind => {
                let state = SeriesStorageState {
                    watermark: watermark
                        .as_u64()
                        .ok_or_else(|| invalid("watermark inválido"))?,
                    finished: *finished,
                    attempted: attempted
                        .as_u64()
                        .ok_or_else(|| invalid("intentos inválidos"))?,
                };
                if state.finished && state.attempted < state.watermark {
                    return Err(invalid("estado inconsistente"));
                }
                Ok(state)
            }
            _ => Err(invalid("protocolo de estado desconocido")),
        }
    }

    fn page(&mut self, after: u64, limit: usize, watermark: u64) -> io::Result<Vec<SeriesChunk>> {
        if !(1..=MAX_STORAGE_PAGE_CHUNKS).contains(&limit) {
            return Err(invalid("página fuera de límites"));
        }
        self.send(&json!(["page", after, limit]))?;
        let response = self.response()?;
        let fields = response
            .as_array()
            .ok_or_else(|| invalid("página inválida"))?;
        let [Value::String(kind), Value::Array(values)] = fields.as_slice() else {
            return Err(invalid("página inválida"));
        };
        if kind != "page" || values.len() > limit {
            return Err(invalid("página desconocida o excesiva"));
        }
        let mut chunks = Vec::with_capacity(values.len());
        let mut previous = after;
        for value in values {
            let chunk = SeriesChunk::from_bytes(&serde_json::to_vec(value)?)?;
            if chunk.index <= previous || chunk.index > watermark {
                return Err(invalid("página fuera del prefijo confirmado"));
            }
            previous = chunk.index;
            chunks.push(chunk);
        }
        Ok(chunks)
    }

    fn append(&mut self, chunk: &SeriesChunk) -> io::Result<u64> {
        let value: Value = serde_json::from_slice(&chunk.to_bytes()?)?;
        self.send(&json!(["append", value]))?;
        let value = self.response()?;
        match value.as_array().map(Vec::as_slice) {
            Some([Value::String(kind), index]) if kind == "ack" => {
                let watermark = index.as_u64().ok_or_else(|| invalid("ACK inválido"))?;
                if watermark < chunk.index {
                    return Err(invalid("ACK anterior al chunk"));
                }
                Ok(watermark)
            }
            _ => Err(invalid("ACK desconocido")),
        }
    }
}

struct Process {
    child: Child,
    pipe: Option<Pipe>,
}

impl Process {
    fn spawn(executable: &Path, database: &Path, mode: Option<&str>) -> io::Result<Self> {
        let mut command = Command::new(executable);
        command
            .arg(database)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        if let Some(mode) = mode {
            command.arg(mode);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt as _;
            command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: helper bajo demanda.
        }
        let child = command.spawn()?;
        let mut process = Self { child, pipe: None };
        let input = process
            .child
            .stdin
            .take()
            .ok_or_else(|| invalid("stdin ausente"))?;
        let output = BufReader::new(
            process
                .child
                .stdout
                .take()
                .ok_or_else(|| invalid("stdout ausente"))?,
        );
        process.pipe = Some(Pipe {
            input,
            output,
            progress: Arc::default(),
        });
        Ok(process)
    }

    fn pipe(&mut self) -> io::Result<&mut Pipe> {
        self.pipe
            .as_mut()
            .ok_or_else(|| invalid("pipes pertenecen al worker"))
    }

    fn abort(&mut self) -> io::Result<()> {
        if self.child.try_wait()?.is_none() {
            self.child.kill()?;
            self.child.wait()?;
        }
        Ok(())
    }
}

impl Drop for Process {
    fn drop(&mut self) {
        if let Err(error) = self.abort() {
            eprintln!("cerrar storage: {error}");
        }
    }
}

/// Un receptor, un hilo de entrega y un proceso SQL. Start nunca espera ready.
/// El propietario debe parar adquisición y flush antes de llamar finish.
pub struct SeriesWorker {
    process: Arc<Mutex<Process>>,
    finish: mpsc::Sender<Option<u64>>,
    done: mpsc::Receiver<io::Result<SeriesStorageState>>,
    thread: Option<JoinHandle<()>>,
    analysis: Arc<ArcSwap<RecordedSeriesSummary>>,
    failed: Arc<AtomicBool>,
    cancelled: Arc<AtomicBool>,
    session_events: mpsc::SyncSender<SessionEvent>,
    session_delivery: Arc<SessionDelivery>,
    progress: Arc<AtomicU64>,
    pub(crate) database: Arc<ArcSwap<PathBuf>>,
}

/// Resultado de `close`: cómo terminó y el último prefijo confirmado por ACK.
#[derive(Debug)]
pub struct SeriesClose {
    pub closed: Closed,
    pub analysis: Arc<RecordedSeriesSummary>,
}

impl SeriesWorker {
    pub fn start(
        executable: &Path,
        database: &Path,
        receiver: mpsc::Receiver<SeriesChunk>,
    ) -> io::Result<Self> {
        Self::start_mode(executable, database, receiver, false)
    }

    /// DB nueva; como start, no espera ready ni SQL en el hilo del Core.
    pub fn start_new(
        executable: &Path,
        database: &Path,
        receiver: mpsc::Receiver<SeriesChunk>,
    ) -> io::Result<Self> {
        Self::start_mode(executable, database, receiver, true)
    }

    fn start_mode(
        executable: &Path,
        database: &Path,
        receiver: mpsc::Receiver<SeriesChunk>,
        create: bool,
    ) -> io::Result<Self> {
        let mut process = Process::spawn(executable, database, create.then_some("--create"))?;
        let mut pipe = process
            .pipe
            .take()
            .ok_or_else(|| invalid("pipes ausentes"))?;
        let progress = Arc::clone(&pipe.progress);
        let process = Arc::new(Mutex::new(process));
        let child = Arc::clone(&process);
        let executable = executable.to_owned();
        let database = database.to_owned();
        let (finish, control) = mpsc::channel();
        let (result, done) = mpsc::channel();
        let (session_events, event_receiver) = mpsc::sync_channel(SESSION_QUEUE);
        let session_delivery = Arc::new(SessionDelivery {
            enabled: AtomicBool::new(true),
            dropped: AtomicU64::new(0),
        });
        let mut sessions = SessionPump {
            receiver: event_receiver,
            delivery: Arc::clone(&session_delivery),
            rejected_warned: false,
            loss_warned: false,
        };
        let analysis = Arc::new(ArcSwap::from_pointee(RecordedSeriesSummary::default()));
        let summaries = Arc::clone(&analysis);
        let failed = Arc::new(AtomicBool::new(false));
        let failure = Arc::clone(&failed);
        let cancelled = Arc::new(AtomicBool::new(false));
        let cancellation = Arc::clone(&cancelled);
        let current_database = Arc::new(ArcSwap::from_pointee(database.clone()));
        let recording_database = current_database.clone();
        let task = thread::Builder::new()
            .name("series-storage".into())
            .spawn(move || {
                let outcome = (|| {
                    let mut ready = pipe.state("ready");
                    if create {
                        ready = retry_creation(
                            &child,
                            &mut pipe,
                            &executable,
                            &database,
                            &cancellation,
                            &recording_database,
                            ready,
                        );
                    }
                    pump(
                        &mut pipe,
                        &receiver,
                        &control,
                        &summaries,
                        ready?,
                        &mut sessions,
                    )
                })();
                sessions.warn_loss();
                failure.store(outcome.is_err(), Ordering::Release);
                // El propietario puede haber agotado su plazo; no hay receptor que avisar.
                if result.send(outcome).is_err() {
                    eprintln!("propietario de series ya no recibe cierre");
                }
            })?;
        Ok(Self {
            process,
            finish,
            done,
            thread: Some(task),
            analysis,
            failed,
            cancelled,
            session_events,
            session_delivery,
            progress,
            database: current_database,
        })
    }

    /// Nunca espera al helper ni a un hueco en la cola.
    pub fn try_session_event(&self, event: SessionEvent) -> bool {
        if !self.session_events_enabled() {
            return false;
        }
        if self.session_events.try_send(event).is_ok() {
            return true;
        }
        self.session_delivery
            .dropped
            .fetch_add(1, Ordering::Relaxed);
        false
    }

    pub fn session_events_dropped(&self) -> u64 {
        self.session_delivery.dropped.load(Ordering::Relaxed)
    }

    pub fn session_events_enabled(&self) -> bool {
        self.session_delivery.enabled.load(Ordering::Acquire)
    }

    /// Solo chunks cuyo ACK se recibió; la cola volátil no cuenta como durable.
    pub fn watermark(&self) -> u64 {
        self.analysis.load().watermark
    }

    pub fn analysis(&self) -> Arc<RecordedSeriesSummary> {
        self.analysis.load_full()
    }

    pub fn failed(&self) -> bool {
        self.failed.load(Ordering::Acquire)
    }

    #[cfg(all(test, windows))]
    pub(crate) fn kill_for_test(&self) {
        self.process
            .lock()
            .expect("proceso")
            .child
            .kill()
            .expect("matar helper real");
    }

    /// Plazo fijo para todo el cierre; error si storage no sale a tiempo.
    pub fn finish(
        self,
        attempted: u64,
        timeout: Duration,
    ) -> io::Result<(SeriesStorageState, Arc<RecordedSeriesSummary>)> {
        let close = self.close(attempted, CloseLimits::fixed(timeout), |_| {});
        match close.closed {
            Closed::Clean(state) => Ok((state, close.analysis)),
            Closed::ConfirmedUnclosed(_, error) | Closed::Unconfirmed(error) => Err(error),
        }
    }

    /// Cierre por progreso (#2871): `on_confirmed` corre en cuanto `finished`
    /// está en disco. Si hay que dejar de esperar, `Drop` mata a storage: lo
    /// confirmado por ACK sigue en la base (DuckDB lo conserva en su WAL).
    pub fn close(
        mut self,
        attempted: u64,
        limits: CloseLimits,
        on_confirmed: impl FnOnce(&SeriesStorageState),
    ) -> SeriesClose {
        let closed = if limits.stall.is_zero() || limits.cap.is_zero() {
            Closed::Unconfirmed(io::Error::new(
                io::ErrorKind::TimedOut,
                "plazo de cierre agotado",
            ))
        } else if self.finish.send(Some(attempted)).is_err() {
            Closed::Unconfirmed(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "worker terminó antes de finish",
            ))
        } else {
            series_close::run(
                &mut LiveClose(&mut self),
                &mut Instant::now,
                limits,
                on_confirmed,
            )
        };
        SeriesClose {
            closed,
            analysis: self.analysis.load_full(),
        }
    }
}

/// El cierre real: el hilo del pump y el proceso de storage.
struct LiveClose<'a>(&'a mut SeriesWorker);

impl CloseProbe for LiveClose<'_> {
    fn progress(&self) -> u64 {
        self.0.progress.load(Ordering::Acquire)
    }

    fn confirmation(&mut self, wait: Duration) -> Option<io::Result<SeriesStorageState>> {
        let result = match self.0.done.recv_timeout(wait) {
            Ok(result) => result,
            Err(mpsc::RecvTimeoutError::Timeout) => return None,
            Err(mpsc::RecvTimeoutError::Disconnected) => Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "worker de storage no confirmó cierre",
            )),
        };
        // El pump ya entregó su resultado: el hilo termina sin esperar a nadie.
        if let Some(task) = self.0.thread.take()
            && task.join().is_err()
        {
            return Some(Err(io::Error::other("worker de storage panicked")));
        }
        Some(result)
    }

    fn exit(&mut self, wait: Duration) -> Option<io::Result<()>> {
        let status = self
            .0
            .process
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .child
            .try_wait();
        match status {
            Ok(Some(status)) if status.success() => Some(Ok(())),
            Ok(Some(_)) => Some(Err(io::Error::other("storage terminó con error"))),
            Ok(None) => {
                thread::sleep(wait);
                None
            }
            Err(error) => Some(Err(error)),
        }
    }
}

impl Drop for SeriesWorker {
    fn drop(&mut self) {
        self.cancelled.store(true, Ordering::Release);
        // Cancelar también si el pump solo está esperando al productor.
        if self.finish.send(None).is_err() { /* El pump ya terminó. */ }
        // Cerrar pipes del hijo desbloquea read/write del pump, incluso sin ACK.
        if let Err(error) = self
            .process
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .abort()
        {
            eprintln!("parar worker de series: {error}");
        }
        if let Some(task) = self.thread.take()
            && task.join().is_err()
        {
            eprintln!("worker de series panicked al parar");
        }
    }
}

fn pump(
    pipe: &mut Pipe,
    receiver: &mpsc::Receiver<SeriesChunk>,
    control: &mpsc::Receiver<Option<u64>>,
    latest: &ArcSwap<RecordedSeriesSummary>,
    ready: SeriesStorageState,
    sessions: &mut SessionPump,
) -> io::Result<SeriesStorageState> {
    let mut analysis = SeriesAnalysis::new(MAX_ANALYZED_LAPS)?;
    let mut watermark = 0;
    while watermark < ready.watermark {
        let page = pipe.page(watermark, MAX_STORAGE_PAGE_CHUNKS, ready.watermark)?;
        if page.is_empty() {
            return Err(invalid("prefijo incompleto al reanudar"));
        }
        for chunk in page {
            analysis.consume(&chunk)?;
            watermark = chunk.index;
        }
    }
    publish_analysis(latest, &analysis, watermark);
    loop {
        match control.try_recv() {
            Ok(Some(attempted)) => {
                // El productor ya paró: como máximo 64 eventos, vueltas antes de Close.
                sessions.drain(pipe)?;
                while let Ok(chunk) = receiver.try_recv() {
                    let confirmed = pipe.append(&chunk)?;
                    if chunk.index > watermark {
                        analysis.consume(&chunk)?;
                    }
                    watermark = confirmed;
                    publish_analysis(latest, &analysis, watermark);
                }
                pipe.send(&json!(["finish", attempted]))?;
                let state = pipe.state("finished")?;
                pipe.send(&json!(["stop"]))?;
                return Ok(state);
            }
            Ok(None) | Err(mpsc::TryRecvError::Disconnected) => {
                return Err(io::Error::new(
                    io::ErrorKind::BrokenPipe,
                    "propietario desconectado",
                ));
            }
            Err(mpsc::TryRecvError::Empty) => {}
        }
        sessions.drain(pipe)?;
        match receiver.recv_timeout(Duration::from_millis(20)) {
            Ok(chunk) => {
                sessions.drain(pipe)?;
                let confirmed = pipe.append(&chunk)?;
                if chunk.index > watermark {
                    analysis.consume(&chunk)?;
                }
                watermark = confirmed;
                publish_analysis(latest, &analysis, watermark);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                return Err(io::Error::new(
                    io::ErrorKind::BrokenPipe,
                    "productor terminó sin finish",
                ));
            }
        }
    }
}

const MAX_CREATE_RETRIES: u128 = 3;
const EXIT_STATUS_TIMEOUT: Duration = Duration::from_millis(100);

// Solo antes del primer ready, nunca tras consumir índices del productor.
fn retry_creation(
    child: &Mutex<Process>,
    pipe: &mut Pipe,
    executable: &Path,
    database: &Path,
    cancellation: &AtomicBool,
    current_database: &ArcSwap<PathBuf>,
    mut ready: io::Result<SeriesStorageState>,
) -> io::Result<SeriesStorageState> {
    for attempt in 1..=MAX_CREATE_RETRIES {
        if ready.is_ok() {
            break;
        }
        if !ready
            .as_ref()
            .is_err_and(|error| error.kind() == io::ErrorKind::BrokenPipe)
        {
            break;
        }
        let mut process = child.lock().map_err(|_| invalid("proceso envenenado"))?;
        if cancellation.load(Ordering::Acquire) {
            return Err(io::Error::new(
                io::ErrorKind::Interrupted,
                "grabación cancelada",
            ));
        }
        let deadline = Instant::now() + EXIT_STATUS_TIMEOUT;
        let status = loop {
            if let Some(status) = process.child.try_wait()? {
                break Some(status);
            }
            if Instant::now() >= deadline {
                break None;
            }
            thread::sleep(Duration::from_millis(1));
        };
        if status.is_none_or(|status| status.code() != Some(3)) {
            break;
        }
        let path = database.with_file_name(format!(
            "series-{}-{}.duckdb",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(io::Error::other)?
                .as_nanos()
                + attempt,
            std::process::id()
        ));
        *process = Process::spawn(executable, &path, Some("--create"))?;
        current_database.store(Arc::new(path));
        let progress = Arc::clone(&pipe.progress);
        *pipe = process
            .pipe
            .take()
            .ok_or_else(|| invalid("pipes ausentes"))?;
        // El cierre sigue leyendo el mismo contador tras recrear el proceso.
        pipe.progress = progress;
        drop(process);
        ready = pipe.state("ready");
    }
    ready
}

/// Consultas históricas read-only, fuera de adquisición. Un proceso por lector.
/// Opening/queries son síncronos; no llamarlos desde Core ni renderizado.
pub struct SeriesReader {
    process: Process,
    state: SeriesStorageState,
}

impl SeriesReader {
    pub fn open(executable: &Path, database: &Path) -> io::Result<Self> {
        let mut process = Process::spawn(executable, database, Some("--read-only"))?;
        let state = process.pipe()?.state("ready")?;
        Ok(Self { process, state })
    }

    pub fn state(&self) -> SeriesStorageState {
        self.state
    }

    pub fn page(&mut self, after: u64, limit: usize) -> io::Result<Vec<SeriesChunk>> {
        self.process
            .pipe()?
            .page(after, limit, self.state.watermark)
    }

    pub fn analyze(&mut self, retention: usize) -> io::Result<SeriesAnalysis> {
        let mut analysis = SeriesAnalysis::new(retention)?;
        let mut after = 0;
        loop {
            let page = self.page(after, MAX_STORAGE_PAGE_CHUNKS)?;
            if page.is_empty() {
                break;
            }
            for chunk in page {
                analysis.consume(&chunk)?;
                after = chunk.index;
            }
        }
        if after != self.state.watermark {
            return Err(invalid("histórico incompleto frente al watermark"));
        }
        Ok(analysis)
    }
}

fn invalid(message: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

#[cfg(all(test, windows))]
mod poison_tests {
    use super::*;

    #[test]
    fn drop_reaps_child_and_unblocks_reader_even_with_poisoned_process_mutex() {
        use std::os::windows::process::CommandExt;
        let mut child = Command::new("pwsh")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "[Console]::In.ReadToEnd() | Out-Null",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .creation_flags(0x0800_0000)
            .spawn()
            .expect("hijo real esperando EOF");
        let mut pipe = Pipe {
            input: child.stdin.take().expect("stdin"),
            output: BufReader::new(child.stdout.take().expect("stdout")),
            progress: Arc::default(),
        };
        let process = Arc::new(Mutex::new(Process { child, pipe: None }));
        let (finish, _control) = mpsc::channel();
        let (_result, done) = mpsc::channel();
        // El reader conserva stdin abierto mientras espera ready: solo matar
        // al hijo puede desbloquearlo. El hijo no emite ninguna respuesta.
        let task = thread::spawn(move || {
            let _response = pipe.state("ready");
        });
        let worker = SeriesWorker {
            process: Arc::clone(&process),
            finish,
            done,
            thread: Some(task),
            analysis: Arc::new(ArcSwap::from_pointee(RecordedSeriesSummary::default())),
            failed: Arc::new(AtomicBool::new(false)),
            cancelled: Arc::new(AtomicBool::new(false)),
            session_events: mpsc::sync_channel(SESSION_QUEUE).0,
            session_delivery: Arc::new(SessionDelivery::default()),
            progress: Arc::default(),
            database: Arc::new(ArcSwap::from_pointee(PathBuf::new())),
        };
        let poisoned = Arc::clone(&process);
        assert!(
            thread::spawn(move || {
                let _guard = poisoned.lock().expect("mutex aún sano");
                panic!("envenenamiento deliberado");
            })
            .join()
            .is_err()
        );
        assert!(process.is_poisoned());
        let (closed, completion) = mpsc::channel();
        let dropper = thread::spawn(move || {
            drop(worker);
            closed.send(()).expect("confirmar Drop");
        });
        let outcome = completion.recv_timeout(Duration::from_secs(5));
        if outcome.is_err() {
            // Limpiar también en la regresión: no dejar un hijo/hilo bloqueado
            // al fallar la prueba. Esta guarda no convierte el timeout en éxito.
            process
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .abort()
                .expect("limpieza de emergencia");
        }
        dropper.join().expect("Drop sin panic");
        assert!(outcome.is_ok(), "Drop se quedó esperando con el hijo vivo");
        assert!(
            process
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .child
                .try_wait()
                .expect("estado del hijo")
                .is_some()
        );
    }
}

#[cfg(all(test, windows))]
#[path = "series_session_transport_tests.rs"]
mod session_transport_tests;
