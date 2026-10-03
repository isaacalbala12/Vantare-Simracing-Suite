//! Registro local de transiciones, fuera del núcleo puro y de los renderers.
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::time::{SystemTime, UNIX_EPOCH};

use vantare_domain::{Capability, Snapshot, SourceState};

pub fn state(snapshot: &Snapshot) -> (SourceState, Capability, Capability) {
    (
        snapshot.state.source_state,
        snapshot.state.capabilities.driver_inputs,
        snapshot.state.capabilities.positions,
    )
}

/// Una línea por cambio, sin telemetría ni identidad del piloto. Fallar al
/// escribir el diagnóstico nunca cambia la frescura ni detiene adquisición.
pub fn log_transition(
    component: &str,
    previous: (SourceState, Capability, Capability),
    snapshot: &Snapshot,
    reason: &str,
) {
    let current = state(snapshot);
    if previous == current {
        return;
    }
    let reason = if current.0 == SourceState::Live
        && current.1 == Capability::WithData
        && previous.1 != current.1
    {
        "adaptador: SHM jugador mElapsedTime (o contenido sin reloj) sin avance >=500ms; recuperación sostenida 2000ms"
    } else {
        reason
    };
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let line = format!(
        "{} pid={} {component} {:?}->{:?} inputs={:?}->{:?} positions={:?}->{:?} epoch={} seq={} source={:?} source_time={:?} received_at={:?} reason={reason}\n",
        stamp.as_secs(),
        std::process::id(),
        previous.0,
        snapshot.state.source_state,
        previous.1,
        current.1,
        previous.2,
        current.2,
        snapshot.epoch,
        snapshot.sequence,
        snapshot.origin.source,
        snapshot.origin.source_time,
        snapshot.origin.received_at,
    );
    eprint!("{line}");
    let root = std::env::var_os("LOCALAPPDATA")
        .map_or_else(std::env::temp_dir, std::path::PathBuf::from)
        .join("Vantare/native/logs");
    let append = || -> io::Result<()> {
        fs::create_dir_all(&root)?;
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(root.join("freshness.log"))?
            .write_all(line.as_bytes())
    };
    if let Err(error) = append() {
        eprintln!("registro de frescura: {error}");
    }
}

pub fn source_reason(state: SourceState) -> &'static str {
    match state {
        SourceState::Waiting => "sin sesión admitida",
        SourceState::Live => "reloj de fuente avanzando",
        SourceState::Paused => "SHM sin avance >=500ms; proceso vivo y REST de sesión <500ms",
        SourceState::Stale => {
            "reloj de fuente sin avance >=500ms sin pausa confirmada, o adaptador desconectado"
        }
        SourceState::Lost => "pipe sin actividad >=5000ms",
    }
}
