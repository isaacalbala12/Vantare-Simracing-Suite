//! Cliente de proceso: todo I/O fuera de adquisición; `DuckDB` no se enlaza aquí.

use std::io::{self, BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, mpsc};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use super::{LapSummary, MAX_ANALYZED_LAPS, MAX_CHUNK_BYTES, SeriesAnalysis, SeriesChunk};
use arc_swap::ArcSwap;
use serde_json::{Value, json};

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
    fn spawn(executable: &Path, database: &Path, read_only: bool) -> io::Result<Self> {
        let mut command = Command::new(executable);
        command
            .arg(database)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        if read_only {
            command.arg("--read-only");
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
        process.pipe = Some(Pipe { input, output });
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

    fn wait_until(&mut self, deadline: Instant) -> io::Result<()> {
        loop {
            if Instant::now() >= deadline {
                return Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "cierre de storage agotó plazo",
                ));
            }
            if let Some(status) = self.child.try_wait()? {
                return if status.success() {
                    Ok(())
                } else {
                    Err(io::Error::other("storage terminó con error"))
                };
            }
            thread::sleep(Duration::from_millis(5));
        }
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
    process: Process,
    finish: mpsc::Sender<Option<u64>>,
    done: mpsc::Receiver<io::Result<SeriesStorageState>>,
    thread: Option<JoinHandle<()>>,
    analysis: Arc<ArcSwap<RecordedSeriesSummary>>,
    failed: Arc<AtomicBool>,
}

impl SeriesWorker {
    pub fn start(
        executable: &Path,
        database: &Path,
        receiver: mpsc::Receiver<SeriesChunk>,
    ) -> io::Result<Self> {
        let mut process = Process::spawn(executable, database, false)?;
        let mut pipe = process
            .pipe
            .take()
            .ok_or_else(|| invalid("pipes ausentes"))?;
        let (finish, control) = mpsc::channel();
        let (result, done) = mpsc::channel();
        let analysis = Arc::new(ArcSwap::from_pointee(RecordedSeriesSummary::default()));
        let summaries = Arc::clone(&analysis);
        let failed = Arc::new(AtomicBool::new(false));
        let failure = Arc::clone(&failed);
        let task = thread::Builder::new()
            .name("series-storage".into())
            .spawn(move || {
                let outcome = pump(&mut pipe, &receiver, &control, &summaries);
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
        })
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

    pub fn finish(
        mut self,
        attempted: u64,
        timeout: Duration,
    ) -> io::Result<(SeriesStorageState, Arc<RecordedSeriesSummary>)> {
        let deadline = Instant::now()
            .checked_add(timeout)
            .ok_or_else(|| invalid("plazo inválido"))?;
        self.finish.send(Some(attempted)).map_err(|_| {
            io::Error::new(io::ErrorKind::BrokenPipe, "worker terminó antes de finish")
        })?;
        let state = self.done.recv_timeout(timeout).map_err(|error| {
            io::Error::new(
                if matches!(error, mpsc::RecvTimeoutError::Timeout) {
                    io::ErrorKind::TimedOut
                } else {
                    io::ErrorKind::BrokenPipe
                },
                "worker de storage no confirmó cierre",
            )
        })??;
        if let Some(task) = self.thread.take() {
            task.join()
                .map_err(|_| io::Error::other("worker de storage panicked"))?;
        }
        self.process.wait_until(deadline)?;
        Ok((state, self.analysis.load_full()))
    }
}

impl Drop for SeriesWorker {
    fn drop(&mut self) {
        // Cancelar también si el pump solo está esperando al productor.
        if self.finish.send(None).is_err() { /* El pump ya terminó. */ }
        // Cerrar pipes del hijo desbloquea read/write del pump, incluso sin ACK.
        if let Err(error) = self.process.abort() {
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
) -> io::Result<SeriesStorageState> {
    let ready = pipe.state("ready")?;
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
        match receiver.recv_timeout(Duration::from_millis(20)) {
            Ok(chunk) => {
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

/// Consultas históricas read-only, fuera de adquisición. Un proceso por lector.
/// Opening/queries son síncronos; no llamarlos desde Core ni renderizado.
pub struct SeriesReader {
    process: Process,
    state: SeriesStorageState,
}

impl SeriesReader {
    pub fn open(executable: &Path, database: &Path) -> io::Result<Self> {
        let mut process = Process::spawn(executable, database, true)?;
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
