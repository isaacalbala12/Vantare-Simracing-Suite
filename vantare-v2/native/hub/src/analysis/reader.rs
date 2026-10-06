//! Cliente del proceso de storage. Consultas fuera del hilo de render; sin SQL.
use super::model::{Chunk, Lap, MAX_SAMPLES, Sample};
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    thread::JoinHandle,
    time::Duration,
};

const MAX_FRAME: usize = 2 * 1024 * 1024;
pub type Cancel = Arc<AtomicBool>;

pub struct Reader {
    child: Child,
    input: ChildStdin,
    output: mpsc::Receiver<Result<Value, String>>,
    pump: Option<JoinHandle<()>>,
    cancel: Cancel,
    pub watermark: u64,
    pub finished: bool,
    pub attempted: u64,
}

impl Reader {
    pub fn open(exe: &Path, db: &Path, cancel: Cancel) -> Result<Self, String> {
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
            command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: helper sin consola visible.
        }
        let mut child = command
            .spawn()
            .map_err(|e| format!("Lector de storage no disponible: {e}"))?;
        let input = child.stdin.take().ok_or("storage sin stdin")?;
        let output = child.stdout.take().ok_or("storage sin stdout")?;
        let (sender, receiver) = mpsc::channel();
        let pump = std::thread::Builder::new()
            .name("hub-analysis-reader".into())
            .spawn(move || {
                let mut reader = BufReader::new(output);
                loop {
                    let mut bytes = Vec::new();
                    let result = (&mut reader)
                        .take((MAX_FRAME + 1) as u64)
                        .read_until(b'\n', &mut bytes);
                    let frame = match result {
                        Ok(count)
                            if count > 0 && count <= MAX_FRAME && bytes.last() == Some(&b'\n') =>
                        {
                            serde_json::from_slice(&bytes)
                                .map_err(|e| format!("Respuesta inválida: {e}"))
                        }
                        _ => Err("Lector cerrado, respuesta truncada o fuera de límites".into()),
                    };
                    let failed = frame.is_err();
                    if sender.send(frame).is_err() || failed {
                        break;
                    }
                }
            })
            .map_err(|e| {
                if let Err(error) = child.kill() {
                    eprintln!("cerrar storage: {error}");
                }
                if let Err(error) = child.wait() {
                    eprintln!("esperar storage: {error}");
                }
                format!("Iniciar lectura: {e}")
            })?;
        let mut reader = Self {
            child,
            input,
            output: receiver,
            pump: Some(pump),
            cancel,
            watermark: 0,
            finished: false,
            attempted: 0,
        };
        let ready = reader.receive()?;
        if ready[0] != "ready" {
            return Err("Versión del lector incompatible".into());
        }
        reader.watermark = ready[1].as_u64().ok_or("watermark inválido")?;
        reader.finished = ready[2].as_bool().ok_or("estado inválido")?;
        reader.attempted = ready[3].as_u64().ok_or("intentos inválidos")?;
        Ok(reader)
    }

    fn receive(&self) -> Result<Value, String> {
        let deadline = std::time::Instant::now() + Duration::from_secs(30);
        loop {
            if self.cancel.load(Ordering::Acquire) {
                return Err("Lectura cancelada".into());
            }
            if std::time::Instant::now() >= deadline {
                return Err(
                    "Storage no responde (30 s); vuelve a intentarlo fuera de carrera".into(),
                );
            }
            match self.output.recv_timeout(Duration::from_millis(100)) {
                Ok(result) => {
                    let frame = result?;
                    if frame[0] == "error" {
                        let message = match frame[1].as_str() {
                            Some("locked") => {
                                "Base bloqueada por el writer; termina la grabación antes de abrirla"
                            }
                            Some("incompatible") => {
                                "Esta versión no puede abrir el formato de la grabación"
                            }
                            _ => "Base ilegible; conserva el original para diagnóstico",
                        };
                        return Err(format!(
                            "{message}: {}",
                            frame[2].as_str().unwrap_or("sin diagnóstico")
                        ));
                    }
                    return Ok(frame);
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err("Lector de storage desconectado".into());
                }
            }
        }
    }

    fn request(&mut self, command: &Value) -> Result<Value, String> {
        serde_json::to_writer(&mut self.input, command).map_err(|e| e.to_string())?;
        self.input
            .write_all(b"\n")
            .and_then(|()| self.input.flush())
            .map_err(|e| e.to_string())?;
        self.receive()
    }

    pub fn summaries(&mut self) -> Result<(u64, Vec<Lap>), String> {
        let frame = self.request(&json!(["summaries"]))?;
        if frame[0] != "summaries" || frame[1] != "series-summary.v1" {
            return Err("Versión de análisis incompatible".into());
        }
        let total = frame[2].as_u64().ok_or("total inválido")?;
        let laps: Vec<Lap> = serde_json::from_value(frame[3].clone()).map_err(|e| e.to_string())?;
        if laps.len() > 256 {
            return Err("Resumen fuera de límites".into());
        }
        Ok((total, laps))
    }

    pub fn samples(&mut self, lap: &Lap) -> Result<Vec<Option<Sample>>, String> {
        let mut after = lap.first_chunk.checked_sub(1).ok_or("índice inválido")?;
        let mut offset = 0;
        let mut samples = Vec::new();
        while after < self.watermark {
            let frame = self.request(&json!(["plot-page", after, 16]))?;
            if frame[0] != "plot-page" || frame[1] != "series-plot.v1" {
                return Err("Versión de series incompatible".into());
            }
            let chunks: Vec<Chunk> =
                serde_json::from_value(frame[2].clone()).map_err(|e| e.to_string())?;
            if chunks.is_empty() {
                return Err("Grabación truncada antes del watermark".into());
            }
            for chunk in chunks {
                if lap.next_chunk.is_some_and(|next| chunk.index >= next) {
                    return Ok(samples);
                }
                if (chunk.epoch, chunk.session, chunk.car, chunk.lap)
                    != (lap.epoch, lap.session, lap.car, lap.lap)
                {
                    return Err("La identidad de la grabación cambió; recarga los resúmenes".into());
                }
                if chunk.index <= after || chunk.index > self.watermark || chunk.samples.len() > 64
                {
                    return Err("Página de series fuera de orden/límites".into());
                }
                let gap = chunk.gap || chunk.index != after + 1 || chunk.offset != offset;
                if samples.len() + chunk.samples.len() + usize::from(gap) > MAX_SAMPLES {
                    return Err("Vuelta demasiado grande para esta vista (máximo 1.000.000 muestras); sin truncamiento silencioso".into());
                }
                if gap {
                    samples.push(None);
                }
                after = chunk.index;
                offset = chunk.offset + chunk.samples.len();
                samples.extend(chunk.samples.into_iter().map(Some));
            }
        }
        Ok(samples)
    }
}

impl Drop for Reader {
    fn drop(&mut self) {
        // Mata solo el helper propio y une el pump, incluso tras timeout/cancelación.
        if let Err(error) = self.child.kill() {
            eprintln!("cerrar reader: {error}");
        }
        if let Err(error) = self.child.wait() {
            eprintln!("esperar reader: {error}");
        }
        if let Some(pump) = self.pump.take()
            && pump.join().is_err()
        {
            eprintln!("pump reader terminó con panic");
        }
    }
}

/// Descubrimiento de grabaciones propias: carpeta explícita, sin recursión/symlinks.
pub fn recordings(root: &Path) -> Result<Vec<PathBuf>, String> {
    let entries = match std::fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("Leer grabaciones: {error}")),
    };
    let mut paths = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map_err(|e| e.to_string())?.is_file()
            && entry
                .path()
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("duckdb"))
        {
            paths.push(entry.path());
            if paths.len() > 256 {
                return Err("Más de 256 grabaciones; usa un directorio más acotado".into());
            }
        }
    }
    paths.sort();
    Ok(paths)
}
