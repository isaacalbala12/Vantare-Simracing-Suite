//! Lector interno; C2 será dueño de una instancia, fuera del hilo del puente.
//! Un helper por apertura y peticiones secuenciales mediante &mut self.
use serde_json::{Value, json};
use std::{
    fs,
    io::{self, BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    thread::JoinHandle,
    time::{Duration, Instant, SystemTime},
};
mod session_index;
mod session_reader;
mod types;
pub use session_index::{RecordingSessions, SessionIndex};
pub use types::{
    Chunk, Lap, LapTime, Sample, SessionEndReason, SessionKind, SessionSummary, Signal,
};

const MAX_RECORDINGS: usize = 256;
const MAX_FRAME: usize = 2 * 1024 * 1024;
pub type Cancel = Arc<AtomicBool>;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ErrorCode {
    Locked,
    Incompatible,
    Unreadable,
    Missing,
    Io,
    Cancelled,
    Deadline,
    Changed,
    Limit,
}
#[derive(Debug)]
pub struct Error {
    pub code: ErrorCode,
    pub diagnostic: String,
}
type Result<T> = std::result::Result<T, Error>;
fn error(code: ErrorCode, diagnostic: impl Into<String>) -> Error {
    Error {
        code,
        diagnostic: diagnostic.into(),
    }
}
fn invalid(e: impl Into<String>) -> Error {
    error(ErrorCode::Unreadable, e)
}

#[derive(Clone, Debug, PartialEq)]
struct Stamp {
    len: u64,
    created: SystemTime,
    modified: SystemTime,
}
fn regular_directory(root: &Path) -> Result<()> {
    // The catalog root is Args::recordings() (analysis/init.inc): the single
    // folder of the installation or, without it, the one inside the data.
    // Its parent is the installation root or that data directory, not AppData.
    // Check recordings itself and parents only through that boundary; a user may
    // relocate their profile/AppData with a junction above it.
    let data_dir = root
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or(root);
    let parents = root
        .ancestors()
        .skip(1)
        .take_while(|path| path.starts_with(data_dir));
    for component in std::iter::once(root).chain(parents) {
        let metadata = fs::symlink_metadata(component).map_err(|error| {
            self::error(
                if error.kind() == io::ErrorKind::NotFound {
                    ErrorCode::Missing
                } else {
                    ErrorCode::Io
                },
                error.to_string(),
            )
        })?;
        if !metadata.is_dir() || reparse(&metadata) {
            return Err(invalid("Directorio no regular"));
        }
    }
    Ok(())
}
fn stamp(path: &Path) -> Result<Stamp> {
    if let Some(parent) = path.parent() {
        regular_directory(parent)?;
    }
    let m = fs::symlink_metadata(path).map_err(|e| {
        error(
            if e.kind() == io::ErrorKind::NotFound {
                ErrorCode::Missing
            } else {
                ErrorCode::Io
            },
            e.to_string(),
        )
    })?;
    if !m.is_file() || reparse(&m) {
        return Err(invalid("Archivo no regular"));
    }
    Ok(Stamp {
        len: m.len(),
        created: m
            .created()
            .map_err(|e| error(ErrorCode::Io, e.to_string()))?,
        modified: m
            .modified()
            .map_err(|e| error(ErrorCode::Io, e.to_string()))?,
    })
}
fn reparse(m: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        m.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        m.file_type().is_symlink()
    }
}

/// Snapshot ligado a esta apertura; no acepta resúmenes de otro archivo.
#[derive(Clone, Debug)]
pub struct Summary {
    pub watermark: u64,
    pub finished: bool,
    pub attempted: u64,
    pub total: u64,
    pub laps: Vec<Lap>,
    /// Bloques que el Core descartó por carga antes de uno guardado (#2883).
    pub lost: u64,
}

impl Summary {
    /// La cola final que el Core descartó y nunca llegó a la base. Solo se
    /// sabe con `finished`: entonces `attempted` es el total intentado.
    pub fn lost_tail(&self) -> u64 {
        if self.finished {
            self.attempted.saturating_sub(self.watermark)
        } else {
            0
        }
    }

    /// «Completa» es verdad solo si storage confirmó el final y no se perdió
    /// ningún bloque, ni en medio ni al final (#2883).
    pub fn complete(&self) -> bool {
        self.finished && self.lost == 0 && self.lost_tail() == 0
    }
}
/// El cursor se conserva en el host, nunca se reconstruye a partir del renderer.
pub struct Cursor {
    opening: Arc<()>,
    lap: Lap,
    after: u64,
    offset: usize,
    done: bool,
}
impl Cursor {
    pub fn done(&self) -> bool {
        self.done
    }
}
/// None rompe continuidad. En un chunk con hueco se aíslan todos sus puntos.
pub struct Page {
    pub chunks: usize,
    pub samples: Vec<Option<Sample>>,
}

pub struct Reader {
    child: Child,
    input: ChildStdin,
    output: mpsc::Receiver<Result<Value>>,
    pump: Option<JoinHandle<()>>,
    cancel: Cancel,
    timeout: Duration,
    opening: Arc<()>,
    path: PathBuf,
    stamp: Stamp,
    summary: Summary,
    closed: bool,
}
impl Reader {
    /// Solo acepta rutas devueltas por `recordings()` y comprueba sus padres.
    pub fn open(exe: &Path, db: &Path, cancel: Cancel) -> Result<Self> {
        Self::open_with_timeout(exe, db, cancel, Duration::from_secs(30))
    }
    fn open_with_timeout(exe: &Path, db: &Path, cancel: Cancel, timeout: Duration) -> Result<Self> {
        Self::open_until(exe, db, cancel, Instant::now() + timeout, timeout)
    }
    fn open_until(
        exe: &Path,
        db: &Path,
        cancel: Cancel,
        deadline: Instant,
        timeout: Duration,
    ) -> Result<Self> {
        if Instant::now() >= deadline {
            return Err(error(ErrorCode::Deadline, "Plazo de storage agotado"));
        }
        let original = stamp(db)?;
        if cancel.load(Ordering::Acquire) {
            return Err(error(ErrorCode::Cancelled, "Lectura cancelada"));
        }
        let mut command = Command::new(exe);
        command
            .arg(db)
            .arg("--read-only")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        let mut child = command
            .spawn()
            .map_err(|e| error(ErrorCode::Io, e.to_string()))?;
        // Piped handles are guaranteed by Command. No fallible work before ownership.
        let input = child.stdin.take().expect("piped stdin");
        let output = child.stdout.take().expect("piped stdout");
        let (sender, receiver) = mpsc::sync_channel(1);
        let pump = std::thread::Builder::new()
            .name("host-analysis-reader".into())
            .spawn(move || {
                let mut reader = BufReader::new(output);
                loop {
                    let frame = read_response(&mut reader);
                    let failed = frame.is_err();
                    // Never block shutdown on an unsolicited stream of frames.
                    if sender.try_send(frame).is_err() || failed {
                        break;
                    }
                }
            })
            .map_err(|e| {
                let _ = child.kill();
                let _ = child.wait();
                error(ErrorCode::Io, e.to_string())
            })?;
        let mut reader = Self {
            child,
            input,
            output: receiver,
            pump: Some(pump),
            cancel,
            timeout,
            opening: Arc::new(()),
            path: db.to_owned(),
            stamp: original,
            closed: false,
            summary: Summary {
                watermark: 0,
                finished: false,
                attempted: 0,
                total: 0,
                laps: vec![],
                lost: 0,
            },
        };
        let result = (|| {
            let ready = reader.receive(deadline)?;
            let (watermark, finished, attempted) = state(&ready, "ready")?;
            reader.summary.watermark = watermark;
            reader.summary.finished = finished;
            reader.summary.attempted = attempted;
            Ok(())
        })();
        reader.finish_result(result)?;
        Ok(reader)
    }
    fn receive(&self, deadline: Instant) -> Result<Value> {
        loop {
            if self.cancel.load(Ordering::Acquire) {
                return Err(error(ErrorCode::Cancelled, "Lectura cancelada"));
            }
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return Err(error(ErrorCode::Deadline, "Plazo de storage agotado"));
            }
            match self
                .output
                .recv_timeout(left.min(Duration::from_millis(20)))
            {
                Ok(frame) => {
                    let frame = frame?;
                    if frame[0] == "error" {
                        let code = match frame[1].as_str() {
                            Some("locked") => ErrorCode::Locked,
                            Some("incompatible") => ErrorCode::Incompatible,
                            Some("missing") => ErrorCode::Missing,
                            _ => ErrorCode::Unreadable,
                        };
                        return Err(error(code, frame[2].as_str().unwrap_or("sin diagnóstico")));
                    }
                    return Ok(frame);
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err(invalid("Storage desconectado"));
                }
            }
        }
    }
    fn request(&mut self, command: &Value, deadline: Instant) -> Result<Value> {
        if self.closed {
            return Err(error(ErrorCode::Cancelled, "Lector cerrado"));
        }
        if Instant::now() >= deadline {
            return Err(error(ErrorCode::Deadline, "Plazo de storage agotado"));
        }
        serde_json::to_writer(&mut self.input, command).map_err(|e| invalid(e.to_string()))?;
        self.input
            .write_all(b"\n")
            .and_then(|()| self.input.flush())
            .map_err(|e| error(ErrorCode::Io, e.to_string()))?;
        self.receive(deadline)
    }
    fn unchanged(&mut self, deadline: Instant) -> Result<()> {
        if stamp(&self.path)? != self.stamp {
            return Err(error(ErrorCode::Changed, "Archivo sustituido"));
        }
        let value = self.request(&json!(["status"]), deadline)?;
        if state(&value, "status")?
            != (
                self.summary.watermark,
                self.summary.finished,
                self.summary.attempted,
            )
        {
            return Err(error(ErrorCode::Changed, "Watermark cambiado"));
        }
        Ok(())
    }
    pub fn summaries(&mut self) -> Result<Summary> {
        self.summaries_until(Instant::now() + self.timeout)
    }
    fn summaries_until(&mut self, deadline: Instant) -> Result<Summary> {
        let result = (|| {
            self.unchanged(deadline)?;
            let frame = self.request(&json!(["summaries"]), deadline)?;
            if frame[0] != "summaries" || frame[1] != vantare_ipc::series::ANALYSIS_VERSION {
                return Err(error(ErrorCode::Incompatible, "Versión de resúmenes"));
            }
            let total = frame[2].as_u64().ok_or_else(|| invalid("Total inválido"))?;
            let laps: Vec<Lap> =
                serde_json::from_value(frame[3].clone()).map_err(|e| invalid(e.to_string()))?;
            if laps.len() > MAX_RECORDINGS {
                return Err(error(ErrorCode::Limit, "Más de 256 resúmenes"));
            }
            let lost = frame[4]
                .as_u64()
                .ok_or_else(|| invalid("Bloques perdidos inválidos"))?;
            self.unchanged(deadline)?;
            self.summary.total = total;
            self.summary.laps = laps;
            self.summary.lost = lost;
            Ok(self.summary.clone())
        })();
        self.finish_result(result)
    }
    pub fn cursor(&self, lap: &Lap) -> Result<Cursor> {
        if lap.first_chunk == 0 {
            return Err(invalid("Primer chunk inválido: índice cero"));
        }
        if !self.summary.laps.contains(lap) {
            return Err(error(ErrorCode::Changed, "Resumen de otra apertura"));
        }
        Ok(Cursor {
            opening: self.opening.clone(),
            lap: lap.clone(),
            after: lap.first_chunk - 1,
            offset: 0,
            done: false,
        })
    }
    pub fn page(&mut self, cursor: &mut Cursor, limit: usize) -> Result<Page> {
        let deadline = Instant::now() + self.timeout;
        let result = self.read_page(cursor, limit, deadline);
        self.finish_result(result)
    }
    fn read_page(&mut self, cursor: &mut Cursor, limit: usize, deadline: Instant) -> Result<Page> {
        if !(1..=16).contains(&limit) {
            return Err(error(ErrorCode::Limit, "Página: 1..16 chunks"));
        }
        if !Arc::ptr_eq(&self.opening, &cursor.opening) || !self.summary.laps.contains(&cursor.lap)
        {
            return Err(error(ErrorCode::Changed, "Identidad cambiada"));
        }
        self.unchanged(deadline)?;
        let mut page = Page {
            chunks: 0,
            samples: vec![],
        };
        if cursor.done {
            return Ok(page);
        }
        let frame = self.request(&json!(["plot-page", cursor.after, limit]), deadline)?;
        if frame[0] != "plot-page" || frame[1] != "series-plot.v1" {
            return Err(error(ErrorCode::Incompatible, "Versión de muestras"));
        }
        let chunks: Vec<Chunk> =
            serde_json::from_value(frame[2].clone()).map_err(|e| invalid(e.to_string()))?;
        if chunks.len() > limit || (chunks.is_empty() && cursor.after < self.summary.watermark) {
            return Err(invalid("Página truncada/fuera de límites"));
        }
        for chunk in chunks {
            if chunk.index <= cursor.after
                || chunk.index > self.summary.watermark
                || chunk.samples.len() > vantare_ipc::series::MAX_CHUNK_SAMPLES
            {
                return Err(invalid("Orden/límite de chunks"));
            }
            if cursor
                .lap
                .next_chunk
                .is_some_and(|next| chunk.index >= next)
            {
                cursor.done = true;
                break;
            }
            if (chunk.epoch, chunk.session, chunk.car, chunk.lap)
                != (
                    cursor.lap.epoch,
                    cursor.lap.session,
                    cursor.lap.car,
                    cursor.lap.lap,
                )
            {
                return Err(error(ErrorCode::Changed, "Identidad cambiada"));
            }
            if chunk.gap || chunk.index != cursor.after + 1 || chunk.offset != cursor.offset {
                page.samples.push(None);
            }
            cursor.after = chunk.index;
            cursor.offset = chunk
                .offset
                .checked_add(chunk.samples.len())
                .ok_or_else(|| invalid("Offset inválido"))?;
            page.chunks += 1;
            for sample in chunk.samples {
                page.samples.push(Some(sample));
                if chunk.gap {
                    page.samples.push(None);
                }
            }
        }
        cursor.done |= cursor.after >= self.summary.watermark;
        self.unchanged(deadline)?;
        Ok(page)
    }
    fn finish_result<T>(&mut self, result: Result<T>) -> Result<T> {
        if result.is_err() {
            self.close();
        }
        result
    }
    /// Cancelación y cierre recogen el proceso y unen el único hilo de lectura.
    pub fn close(&mut self) {
        if self.closed {
            return;
        }
        self.closed = true;
        let _ = self.child.kill();
        let _ = self.child.wait();
        if let Some(pump) = self.pump.take() {
            let _ = pump.join();
        }
    }
}
impl Drop for Reader {
    fn drop(&mut self) {
        self.close();
    }
}
fn read_response(reader: &mut dyn BufRead) -> Result<Value> {
    let mut bytes = Vec::new();
    match reader
        .take((MAX_FRAME + 1) as u64)
        .read_until(b'\n', &mut bytes)
    {
        Ok(n) if n > 0 && n <= MAX_FRAME && bytes.last() == Some(&b'\n') => {
            serde_json::from_slice(&bytes).map_err(|e| invalid(e.to_string()))
        }
        _ => Err(invalid("Respuesta truncada o fuera de límites")),
    }
}
fn state(value: &Value, tag: &str) -> Result<(u64, bool, u64)> {
    if value[0] != tag {
        return Err(error(ErrorCode::Incompatible, "Estado incompatible"));
    }
    Ok((
        value[1]
            .as_u64()
            .ok_or_else(|| invalid("Watermark inválido"))?,
        value[2]
            .as_bool()
            .ok_or_else(|| invalid("Estado inválido"))?,
        value[3]
            .as_u64()
            .ok_or_else(|| invalid("Intentos inválidos"))?,
    ))
}
/// Catálogo plano; nunca crea la raíz ni sigue enlaces/reparse points.
pub fn recordings(root: &Path) -> Result<Vec<PathBuf>> {
    match regular_directory(root) {
        Ok(()) => {}
        Err(error) if error.code == ErrorCode::Missing => return Ok(vec![]),
        Err(error) => return Err(error),
    }
    let mut paths = vec![];
    for entry in fs::read_dir(root).map_err(|e| error(ErrorCode::Io, e.to_string()))? {
        let entry = entry.map_err(|e| error(ErrorCode::Io, e.to_string()))?;
        let m =
            fs::symlink_metadata(entry.path()).map_err(|e| error(ErrorCode::Io, e.to_string()))?;
        if m.is_file()
            && !reparse(&m)
            && entry
                .path()
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("duckdb"))
        {
            paths.push(entry.path());
            if paths.len() > MAX_RECORDINGS {
                return Err(error(ErrorCode::Limit, "Más de 256 grabaciones"));
            }
        }
    }
    paths.sort();
    Ok(paths)
}
#[cfg(test)]
mod tests;

#[path = "../protocol/modules/analysis/state.rs"]
pub mod catalog;

pub mod projection;

pub mod status;
