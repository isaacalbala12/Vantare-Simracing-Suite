//! Adaptador de reproducción: entrega, en el orden y a los instantes grabados,
//! frames de memoria compartida y respuestas REST. El reloj es el `now` que
//! inyecta el núcleo, así que la reproducción es determinista.

use std::iter::Peekable;
use std::time::Duration;

use vantare_domain::{Adapter, AdapterError, Observation, SourceKind};

use super::translate::Translator;

/// Un suceso grabado. `at` es el instante en el reloj del núcleo desde el que
/// puede entregarse.
pub enum ReplayEvent {
    /// Un frame completo de `LMU_Data`.
    Shm { at: Duration, frame: Vec<u8> },
    /// Una ronda REST completa, con el instante en que empezó cada consulta.
    Rest {
        at: Duration,
        standings: Vec<u8>,
        standings_started: Duration,
        session: Vec<u8>,
        session_started: Duration,
    },
}

impl ReplayEvent {
    fn at(&self) -> Duration {
        match self {
            Self::Shm { at, .. } | Self::Rest { at, .. } => *at,
        }
    }
}

pub struct Replay {
    build: String,
    events: Peekable<Box<dyn Iterator<Item = ReplayEvent> + Send>>,
    translator: Translator,
    /// Último frame de memoria compartida: una ronda REST se publica sobre él.
    latest: Option<Vec<u8>>,
}

impl Replay {
    /// `build`: versión de LMU con que se grabó (la admisión del frame la exige).
    /// Los eventos se leen bajo demanda: un corpus grande no se carga entero.
    pub fn new(
        build: impl Into<String>,
        events: impl IntoIterator<IntoIter: Send + 'static, Item = ReplayEvent>,
    ) -> Self {
        let events: Box<dyn Iterator<Item = ReplayEvent> + Send> = Box::new(events.into_iter());
        Self {
            build: build.into(),
            events: events.peekable(),
            translator: Translator::new(SourceKind::Replay),
            latest: None,
        }
    }
}

impl Adapter for Replay {
    /// Entrega como máximo un evento por llamada, el siguiente cuyo `at` ya ha
    /// llegado; sin más eventos devuelve `Ok(None)`.
    fn poll(&mut self, now: Duration) -> Result<Option<Observation>, AdapterError> {
        let Some(event) = self.events.next_if(|event| event.at() <= now) else {
            return Ok(None);
        };
        match event {
            ReplayEvent::Shm { frame, .. } => self.latest = Some(frame),
            ReplayEvent::Rest {
                standings,
                standings_started,
                session,
                session_started,
                ..
            } => {
                let standings = self
                    .translator
                    .rest
                    .accept_standings(&standings, standings_started);
                let session = self
                    .translator
                    .rest
                    .accept_session(&session, session_started);
                standings.and(session).map_err(|error| {
                    AdapterError::Rejected(format!("respuesta REST grabada inválida: {error:?}"))
                })?;
            }
        }
        let Some(frame) = &self.latest else {
            return Ok(None);
        };
        self.translator
            .observe(frame, &self.build, now)
            .map(Some)
            .map_err(|rejection| AdapterError::Rejected(rejection.to_string()))
    }
}
