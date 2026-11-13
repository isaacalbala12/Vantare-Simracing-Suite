//! VANTA-141: QPC común entre procesos; nunca confundir envío con pantalla.
use std::collections::BTreeMap;
use std::fs::{File, OpenOptions};
use std::io::{self, Write};
use std::path::Path;
use std::sync::{Mutex, OnceLock};

const LIMIT: usize = 131_072;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Stamp {
    pub phase: &'static str,
    pub qpc: u64,
    pub epoch: u64,
    pub sequence: u64,
    pub window: u64,
}

#[derive(Default)]
struct Buffer {
    rows: Vec<Stamp>,
    pending: BTreeMap<u64, (u64, u64)>,
    overflow: u64,
    active: bool,
}

static BUFFER: OnceLock<Mutex<Buffer>> = OnceLock::new();

/// Un descriptor por proceso, abierto antes de la ronda y escrito al cerrarla.
/// No activar en aguante: su memoria crece durante la ronda de 60 s.
pub struct Session(File);

impl Session {
    /// Abre la ruta explícita, si se activó el registro.
    /// # Errors
    /// Si la ruta ya existe o no se puede abrir.
    pub fn from_env() -> io::Result<Option<Self>> {
        std::env::var_os("VANTARE_LATENCY_FILE")
            .map(|path| Self::open(Path::new(&path)))
            .transpose()
    }

    /// Abre un archivo nuevo, sin sobrescribir evidencia.
    /// # Errors
    /// Si no se puede abrir o ya hay una sesión activa.
    pub fn open(path: &Path) -> io::Result<Self> {
        let file = OpenOptions::new().write(true).create_new(true).open(path)?;
        let mut buffer = BUFFER
            .get_or_init(Mutex::default)
            .lock()
            .map_err(|_| io::Error::other("traza de latencia dañada"))?;
        if buffer.active {
            return Err(io::Error::other("una sola sesión de latencia por proceso"));
        }
        *buffer = Buffer {
            active: true,
            ..Buffer::default()
        };
        Ok(Self(file))
    }

    /// Escribe una traza completa y sincroniza disco.
    /// # Errors
    /// Ante fallos de escritura o sincronización.
    pub fn finish(mut self) -> io::Result<()> {
        let mut buffer = BUFFER
            .get_or_init(Mutex::default)
            .lock()
            .map_err(|_| io::Error::other("traza de latencia dañada"))?;
        buffer.active = false;
        write_trace(
            &mut self.0,
            crate::frequency().unwrap_or(0),
            buffer.overflow,
            &buffer.rows,
        )?;
        self.0.sync_all()
    }
}

pub fn mark(phase: &'static str, epoch: u64, sequence: u64, window: u64) {
    let Some(buffer) = BUFFER.get() else { return };
    let Ok(mut buffer) = buffer.lock() else {
        return;
    };
    if !buffer.active {
        return;
    }
    let row = Stamp {
        phase,
        qpc: crate::clock().unwrap_or(0),
        epoch,
        sequence,
        window,
    };
    if buffer.rows.len() < LIMIT {
        buffer.rows.push(row);
    } else {
        buffer.overflow += 1;
    }
}

/// Se llama desde el canvas realmente pintado, con el HWND de ese canvas.
pub fn painted(window: u64, epoch: u64, sequence: u64) {
    if let Some(buffer) = BUFFER.get()
        && let Ok(mut buffer) = buffer.lock()
        && buffer.active
    {
        buffer.pending.insert(window, (epoch, sequence));
    }
}

/// Se llama inmediatamente antes de Present; no implica que Windows lo muestre.
pub fn submit(window: u64) {
    let photo = BUFFER
        .get()
        .and_then(|buffer| buffer.lock().ok()?.pending.remove(&window));
    if let Some((epoch, sequence)) = photo {
        mark("submit", epoch, sequence, window);
    }
}

/// Serializa la traza con cabecera y pie verificables.
/// # Errors
/// Si el destino falla al escribir.
pub fn write_trace(
    output: &mut impl Write,
    frequency: u64,
    overflow: u64,
    rows: &[Stamp],
) -> io::Result<()> {
    writeln!(
        output,
        "# latency-v1,frequency={frequency},overflow={overflow}"
    )?;
    writeln!(output, "phase,qpc,epoch,sequence,window")?;
    for row in rows {
        writeln!(
            output,
            "{},{},{},{},{}",
            row.phase, row.qpc, row.epoch, row.sequence, row.window
        )?;
    }
    writeln!(output, "# end,rows={}", rows.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trace_has_explicit_clock_overflow_and_complete_footer() {
        let mut output = Vec::new();
        write_trace(
            &mut output,
            10_000_000,
            2,
            &[Stamp {
                phase: "origin",
                qpc: 123,
                epoch: 42,
                sequence: 7,
                window: 0,
            }],
        )
        .unwrap();
        assert_eq!(
            String::from_utf8(output).unwrap(),
            "# latency-v1,frequency=10000000,overflow=2\nphase,qpc,epoch,sequence,window\norigin,123,42,7,0\n# end,rows=1\n"
        );
    }
}
