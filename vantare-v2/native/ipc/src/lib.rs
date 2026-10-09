//! Transporte entre el núcleo y el proceso de overlays (ADR 0099 §4).
//!
//! Un [`Publisher`] (núcleo) ofrece la última foto por un named pipe de
//! Windows o un socket Unix local; un [`Subscriber`] (overlays, Hub) la recibe.
//! Los tipos de `domain`
//! no son ABI: el cable es un DTO versionado ([`dto`]) en JSON con marcos de
//! longitud. Un consumidor lento nunca frena al publicador: entre ambos hay
//! casillas latest-wins, y lo intermedio se pierde.
//!
//! **Revisión.** Cada foto lleva `(epoch, sequence)`. El publicador exige que
//! crezca; el suscriptor descarta lo que no supera su cursor dentro de la
//! misma época. Una época distinta significa productor nuevo: se acepta y el
//! cursor se reinicia. Al reconectar, el suscriptor presenta su cursor y el
//! publicador no reenvía lo que ya tiene. Una conexión con demanda inicia una
//! caché nueva y exige una primera entrega completa de lo pedido.

#![deny(unsafe_code)]

// Instrumentación compartida, inerte sin VANTARE_PROFILE_PHASES=1.
#[allow(dead_code)]
pub use vantare_profiling as profiling;

/// Contrato local de Engineer, independiente del worker.
pub mod engineer_control;
/// Identidad de producto compartida por todos los binarios.
pub mod product;
/// DTO del proceso de servicios, sin HTTP ni credenciales.
pub mod services_protocol;

mod codec;
mod demand;
pub use demand::{Demand, Photo, Signal, SignalState};
pub mod control;
mod dto;
pub mod freshness;
pub mod launcher;
/// Versión vigente del DTO de fotos (JSON).
pub use dto::VERSION as DTO_VERSION;
mod latest;
#[cfg(windows)]
mod pipe;
#[cfg(unix)]
#[path = "unix.rs"]
mod pipe;
#[cfg(any(windows, unix))]
mod publisher;
#[cfg(any(windows, unix))]
mod subscriber;

#[cfg(any(windows, unix))]
pub use pipe::{Peer, default_pipe_name};
#[cfg(any(windows, unix))]
pub use publisher::{DemandSource, Publisher};
#[cfg(any(windows, unix))]
pub use subscriber::{ConnectionStatus, INCOMPATIBLE_COMPONENTS, Subscriber};

/// Primitivos del transporte local para el flujo ordenado de eventos.
/// Permisos, identidad, E/S con plazo y cancelación compartidas con foto; el
/// dueño del protocolo decide codec y ACK.
#[cfg(any(windows, unix))]
pub mod transport {
    #[cfg(unix)]
    pub use crate::pipe::lock_endpoint;
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

/// Lee exclusivamente el DTO vigente del cable; no migra versiones antiguas.
///
/// # Errors
/// JSON inválido, versión incompatible o valores fuera del contrato.
pub fn snapshot_from_json(text: &str) -> Result<Snapshot, Error> {
    decode_snapshot(serde_json::from_str(text)?)
}

/// Lee datos guardados (Studio, Workshop o exportaciones) v7/v8/v9.
/// Nunca se usa en el pipe live ni en el canal de eventos.
///
/// # Errors
/// Conserva todas las validaciones del DTO y rechaza versiones desconocidas.
pub fn snapshot_from_saved_json(text: &str) -> Result<Snapshot, Error> {
    let mut dto = serde_json::from_str::<dto::SnapshotDto>(text)?;
    match dto.version {
        7 | 8 => dto.version = dto::VERSION,
        dto::VERSION => {}
        got => return Err(Error::Version { got }),
    }
    decode_snapshot(dto)
}

/// Helper explícito para fixtures históricas; comparte la lectura de datos guardados.
///
/// # Errors
/// Los mismos que [`snapshot_from_saved_json`].
pub fn snapshot_from_fixture_json(text: &str) -> Result<Snapshot, Error> {
    snapshot_from_saved_json(text)
}

fn decode_snapshot(mut dto: dto::SnapshotDto) -> Result<Snapshot, Error> {
    dto.restore(None, &Demand::all(), &Demand::all())?;
    Snapshot::try_from(dto)
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
    fn v9_round_trips_every_source_state_and_rejects_oversized_fuel_history() {
        use vantare_domain::SourceState;
        for state in [
            SourceState::Waiting,
            SourceState::Live,
            SourceState::Paused,
            SourceState::Stale,
            SourceState::Lost,
        ] {
            let mut snapshot = rich_snapshot(7, 42);
            snapshot.state.source_state = state;
            let text = snapshot_to_json(&snapshot).expect("serializa");
            assert!(text.contains(&format!("\"version\":{DTO_VERSION}")));
            assert_eq!(snapshot_from_json(&text).expect("v8"), snapshot);
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
    fn saved_photos_remain_readable_without_accepting_old_peers() {
        let snapshot = rich_snapshot(1, 1);
        let current = snapshot_to_json(&snapshot).expect("v9");
        for version in [7, 8] {
            let legacy = current.replacen("\"version\":9", &format!("\"version\":{version}"), 1);
            assert_eq!(
                snapshot_from_saved_json(&legacy).expect("dato guardado"),
                snapshot
            );
            assert_eq!(
                snapshot_from_fixture_json(&legacy).expect("fixture"),
                snapshot
            );
            assert!(
                matches!(snapshot_from_json(&legacy), Err(Error::Version { got }) if got == version)
            );
            assert!(!crate::codec::supports(version));
            assert_eq!(crate::codec::negotiate(version, version), None);
        }
        let future = current.replacen("\"version\":9", "\"version\":10", 1);
        assert!(matches!(
            snapshot_from_saved_json(&future),
            Err(Error::Version { got: 10 })
        ));
    }

    #[test]
    fn every_workshop_scene_decodes_and_round_trips_at_the_current_version() {
        fn snapshots(value: &serde_json::Value, count: &mut usize) {
            if value.get("state").is_some() && value.get("epoch").is_some() {
                let snapshot = snapshot_from_json(&value.to_string()).expect("escena DTO actual");
                assert_eq!(
                    snapshot_from_json(&snapshot_to_json(&snapshot).expect("serializa"))
                        .expect("ida y vuelta"),
                    snapshot
                );
                *count += 1;
            } else {
                match value {
                    serde_json::Value::Object(map) => {
                        map.values().for_each(|v| snapshots(v, count));
                    }
                    serde_json::Value::Array(list) => list.iter().for_each(|v| snapshots(v, count)),
                    _ => {}
                }
            }
        }
        fn directory(path: &std::path::Path, count: &mut usize) {
            for entry in std::fs::read_dir(path).expect("directorio de escenas") {
                let path = entry.expect("escena").path();
                if path.extension().is_some_and(|v| v == "json") {
                    let value: serde_json::Value =
                        serde_json::from_str(&std::fs::read_to_string(&path).expect("JSON"))
                            .expect("escena");
                    snapshots(&value, count);
                }
            }
        }
        let ui = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../ui");
        let mut fixtures = 0;
        directory(&ui.join("fixtures"), &mut fixtures);
        assert!(fixtures > 0, "las escenas no pueden faltar");
        let mut widgets = 0;
        for entry in std::fs::read_dir(ui.join("src")).expect("widgets") {
            let scenes = entry.expect("widget").path().join("scenes");
            if scenes.is_dir() {
                directory(&scenes, &mut widgets);
            }
        }
        assert!(widgets > 0, "las escenas de widgets no pueden faltar");
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
