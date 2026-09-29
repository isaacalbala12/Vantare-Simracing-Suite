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

#[cfg(test)]
mod tests {
    use super::*;

    const REAL_44: &[u8] = include_bytes!("../../../../../testdata/lmu-fixture.bin");
    const fn ms(value: u64) -> Duration {
        Duration::from_millis(value)
    }

    fn rest(at: Duration, standings: &[u8]) -> ReplayEvent {
        ReplayEvent::Rest {
            at,
            standings: standings.to_vec(),
            standings_started: at,
            session: b"{}".to_vec(),
            session_started: at,
        }
    }

    #[test]
    fn events_are_delivered_one_per_poll_and_only_once_their_instant_has_arrived() {
        let frame = || ReplayEvent::Shm {
            at: ms(100),
            frame: REAL_44.to_vec(),
        };
        let mut replay = Replay::new("1.3.0.0", [rest(ms(50), b"[]"), frame()]);
        // Una ronda REST sin frame previo no publica nada.
        assert_eq!(replay.poll(ms(50)), Ok(None));
        assert_eq!(replay.poll(ms(99)), Ok(None), "el frame aún no ha llegado");
        let observation = replay.poll(ms(100)).unwrap().unwrap();
        assert_eq!(observation.origin.received_at, ms(100));
        assert_eq!(observation.origin.source.kind, SourceKind::Replay);
        assert_eq!(replay.poll(ms(1_000)), Ok(None), "sin más eventos");
    }

    #[test]
    fn a_rest_round_republishes_the_latest_frame_with_its_numbers() {
        let body = br#"[{"slotID":1,"carNumber":"7","vehicleName":"DKR Engineering #3:ELMS25"}]"#;
        let mut replay = Replay::new(
            "1.3.0.0",
            [
                ReplayEvent::Shm {
                    at: ms(0),
                    frame: REAL_44.to_vec(),
                },
                rest(ms(20), body),
            ],
        );
        assert!(
            replay.poll(ms(0)).unwrap().unwrap().state.cars[0]
                .number
                .is_empty()
        );
        let joined = replay.poll(ms(20)).unwrap().unwrap();
        assert_eq!(joined.state.cars[0].number, "7");
        assert_eq!(joined.origin.received_at, ms(20));
    }

    #[test]
    fn a_broken_recorded_rest_body_or_frame_is_rejected_and_replay_continues() {
        let mut replay = Replay::new(
            "1.3.0.0",
            [
                ReplayEvent::Shm {
                    at: ms(0),
                    frame: vec![0; 10],
                },
                rest(ms(10), b"not json"),
                ReplayEvent::Shm {
                    at: ms(20),
                    frame: REAL_44.to_vec(),
                },
            ],
        );
        assert!(matches!(replay.poll(ms(0)), Err(AdapterError::Rejected(_))));
        assert!(matches!(
            replay.poll(ms(10)),
            Err(AdapterError::Rejected(_))
        ));
        assert!(replay.poll(ms(20)).unwrap().is_some());
    }
}
