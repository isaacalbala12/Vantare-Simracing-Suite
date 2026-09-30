//! Transporte entre el núcleo y el proceso de overlays (ADR 0099 §4).
//!
//! Un [`Publisher`] (núcleo) ofrece la última foto por un named pipe de
//! Windows; un [`Subscriber`] (overlays, Hub) la recibe. Los tipos de `domain`
//! no son ABI: el cable es un DTO versionado ([`dto`]) en JSON con marcos de
//! longitud. Un consumidor lento nunca frena al publicador: entre ambos hay
//! casillas latest-wins, y lo intermedio se pierde.
//!
//! **Revisión.** Cada foto lleva `(epoch, sequence)`. El publicador exige que
//! crezca; el suscriptor descarta lo que no supera su cursor dentro de la
//! misma época. Una época distinta significa productor nuevo: se acepta y el
//! cursor se reinicia. Al reconectar, el suscriptor presenta su cursor y el
//! publicador no reenvía lo que ya tiene.

#![deny(unsafe_code)]

mod codec;
mod dto;
mod latest;
#[cfg(windows)]
mod pipe;
#[cfg(windows)]
mod publisher;
#[cfg(windows)]
mod subscriber;

#[cfg(windows)]
pub use pipe::{Peer, default_pipe_name};
#[cfg(windows)]
pub use publisher::Publisher;
#[cfg(windows)]
pub use subscriber::Subscriber;

/// Primitivos del mismo transporte Win32 para el flujo ordenado de eventos.
/// ACL, identidad, E/S con plazo y cancelación compartidas con foto; el dueño
/// del protocolo decide codec y ACK. No es otro backend ni duplica Win32.
#[cfg(windows)]
pub mod transport {
    pub use crate::pipe::{Event, IO_TIMEOUT, Listener, Peer, Pipe, connect};
}

use std::fmt;

use vantare_domain::Snapshot;

/// La foto como la lleva el cable (DTO versionado, JSON): sirve para guardar una
/// escena fija, p. ej. una captura real para probar widgets sin núcleo.
///
/// # Errors
/// Nunca en la práctica: el DTO siempre se serializa; queda `Result` por la API.
pub fn snapshot_to_json(snapshot: &Snapshot) -> Result<String, Error> {
    Ok(serde_json::to_string(&dto::SnapshotDto::from(snapshot))?)
}

/// Lee una foto guardada con [`snapshot_to_json`].
///
/// # Errors
/// [`Error::Json`] si el texto no es un DTO, [`Error::Version`] si es de una
/// versión que este extremo no entiende, [`Error::Protocol`] si algún valor no
/// se admite.
pub fn snapshot_from_json(text: &str) -> Result<Snapshot, Error> {
    Snapshot::try_from(serde_json::from_str::<dto::SnapshotDto>(text)?)
}

#[derive(Debug)]
pub enum Error {
    Io(std::io::Error),
    Json(serde_json::Error),
    /// Mensaje por encima de 1 MiB (recibido o por enviar).
    TooLarge {
        len: usize,
    },
    /// Versión de DTO que este extremo no entiende.
    Version {
        got: u32,
    },
    /// El par no habla el protocolo (mensaje inesperado, valor no admitido).
    Protocol(&'static str),
    /// El par rechazó el saludo.
    Rejected(String),
    /// `accept_peer` rechazó la identidad del par.
    Peer,
    /// La foto publicada no supera la revisión anterior.
    NotNewer,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(e) => write!(f, "E/S: {e}"),
            Self::Json(e) => write!(f, "JSON: {e}"),
            Self::TooLarge { len } => write!(f, "mensaje de {len} bytes supera el límite"),
            Self::Version { got } => write!(f, "versión {got} no admitida"),
            Self::Protocol(what) => write!(f, "protocolo: {what}"),
            Self::Rejected(reason) => write!(f, "saludo rechazado: {reason}"),
            Self::Peer => f.write_str("par no admitido"),
            Self::NotNewer => f.write_str("la revisión no supera la anterior"),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(e) => Some(e),
            Self::Json(e) => Some(e),
            _ => None,
        }
    }
}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        Self::Json(e)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codec::tests::rich_snapshot;

    #[test]
    fn a_saved_snapshot_reads_back_identical() {
        let snapshot = rich_snapshot(7, 42);
        let text = snapshot_to_json(&snapshot).expect("serializa");
        assert_eq!(snapshot_from_json(&text).expect("lee"), snapshot);
    }

    #[test]
    fn v4_round_trips_every_source_state_and_rejects_oversized_fuel_history() {
        use vantare_domain::SourceState;
        for state in [
            SourceState::Waiting,
            SourceState::Live,
            SourceState::Stale,
            SourceState::Lost,
        ] {
            let mut snapshot = rich_snapshot(7, 42);
            snapshot.state.source_state = state;
            let text = snapshot_to_json(&snapshot).expect("serializa");
            assert!(text.contains("\"version\":4"));
            assert_eq!(snapshot_from_json(&text).expect("v4"), snapshot);
        }
        let mut json: serde_json::Value =
            serde_json::from_str(&snapshot_to_json(&rich_snapshot(7, 42)).expect("serializa"))
                .expect("JSON");
        json["state"]["player"]["fuel_history"] = serde_json::json!(vec![(1, 3.5); 11]);
        assert!(matches!(
            snapshot_from_json(&json.to_string()),
            Err(Error::Protocol(_))
        ));
    }

    #[test]
    fn every_workshop_scene_decodes_and_round_trips_at_the_current_version() {
        let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../ui/fixtures");
        let mut count = 0;
        for entry in std::fs::read_dir(directory).expect("directorio de escenas") {
            let path = entry.expect("escena").path();
            if !path.to_string_lossy().ends_with(".snapshot.json") {
                continue;
            }
            let text = std::fs::read_to_string(&path).expect("JSON de escena");
            let snapshot = snapshot_from_json(&text).expect("escena v4");
            assert_eq!(
                snapshot_from_json(&snapshot_to_json(&snapshot).expect("serializa"))
                    .expect("ida y vuelta"),
                snapshot
            );
            count += 1;
        }
        assert!(count > 0, "las escenas no pueden faltar");
    }

    #[test]
    fn workshop_scene_decodes_with_unavailable_weather_and_damage() {
        let scene = snapshot_from_json(include_str!("../../ui/fixtures/lmu47.snapshot.json"))
            .expect("escena migrada al DTO vigente");
        assert_eq!(scene.state.cars.len(), 47);
        assert_eq!(
            scene.state.session.weather,
            vantare_domain::Weather::default()
        );
        assert_eq!(
            scene.state.player.expect("jugador").damage,
            vantare_domain::Damage::default()
        );
        assert_eq!(
            scene.state.capabilities.weather,
            vantare_domain::Capability::Unsupported
        );
        assert_eq!(
            scene.state.capabilities.damage,
            vantare_domain::Capability::Unsupported
        );
    }

    #[test]
    fn text_that_is_not_a_snapshot_or_is_from_the_future_is_rejected() {
        assert!(matches!(snapshot_from_json("{}"), Err(Error::Json(_))));
        let future = snapshot_to_json(&rich_snapshot(1, 1))
            .expect("serializa")
            .replacen(
                &format!("\"version\":{}", crate::dto::VERSION),
                "\"version\":999",
                1,
            );
        assert!(matches!(
            snapshot_from_json(&future),
            Err(Error::Version { got: 999 })
        ));
    }
}
