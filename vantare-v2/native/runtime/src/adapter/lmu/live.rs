//! Adaptador en vivo: lee `LMU_Data` del proceso de LMU en marcha y el REST
//! local. Abre la fuente sin bloquear y la reabre sola si el juego se cierra.

use std::io;
use std::time::{Duration, Instant};

use vantare_domain::{Adapter, AdapterError, Observation, SourceKind};

use super::frame::OBJECT_OUT_SIZE;
use super::rest::Poller;
use super::shm::RunningSource;
use super::translate::Translator;

/// Periodo de lectura del frame: el simulador lo refresca a ~60 Hz.
/// Una lectura por periodo, con fase fija en el reloj del núcleo;
/// una llamada tardía salta periodos perdidos sin desplazar esa fase.
const READ_INTERVAL: Duration = Duration::from_nanos(1_000_000_000 / 60);
/// Espera entre intentos de abrir la fuente: recorrer los procesos no es barato.
const RETRY_INTERVAL: Duration = Duration::from_secs(1);

type ReadFrame = Box<dyn FnMut(&mut [u8], &mut [u8]) -> io::Result<()> + Send>;
type Open = Box<dyn FnMut() -> Result<Running, AdapterError> + Send>;

/// Fuente abierta: cómo leer un frame estable y la build verificada de LMU.
struct Running {
    read: ReadFrame,
    build: String,
}

pub struct Lmu {
    translator: Translator,
    /// `None` en las pruebas con REST simulado; en producción, el hilo REST.
    poller: Option<Poller>,
    open: Open,
    source: Option<Running>,
    frame: Vec<u8>,
    previous: Vec<u8>,
    scratch: Vec<u8>,
    next_read: Duration,
    retry_at: Duration,
    /// Último fallo de apertura; se repite mientras dura la espera entre intentos.
    failure: AdapterError,
}

impl Lmu {
    /// Arranca el hilo REST; la memoria compartida se abre en el primer `poll`.
    #[must_use]
    pub fn new() -> Self {
        Self::with_source(Box::new(open_running), Some(Poller::start()))
    }

    fn with_source(open: Open, poller: Option<Poller>) -> Self {
        Self {
            translator: Translator::new(SourceKind::Live),
            poller,
            open,
            source: None,
            frame: vec![0; OBJECT_OUT_SIZE],
            previous: vec![0; OBJECT_OUT_SIZE],
            scratch: vec![0; OBJECT_OUT_SIZE],
            next_read: Duration::ZERO,
            retry_at: Duration::ZERO,
            failure: AdapterError::Disconnected,
        }
    }

    fn connect(&mut self, now: Duration) -> Result<(), AdapterError> {
        if now < self.retry_at {
            return Err(self.failure.clone());
        }
        self.retry_at = now + RETRY_INTERVAL;
        match (self.open)() {
            Ok(running) => {
                self.source = Some(running);
                Ok(())
            }
            Err(error) => {
                self.failure = error.clone();
                Err(error)
            }
        }
    }

    /// Vuelca en la caché la ronda REST más reciente; `true` si trajo algo.
    fn take_rest(&mut self, now: Duration) -> bool {
        let Some(report) = self.poller.as_ref().and_then(Poller::take) else {
            return false;
        };
        // Los `Instant` del hilo REST pasan al reloj del núcleo por su antigüedad.
        let started = |at: Instant| now.saturating_sub(at.elapsed());
        let cache = &mut self.translator.rest;
        // Una respuesta REST rota deja la caché como estaba y envejece; REST es
        // auxiliar, así que no detiene al adaptador.
        let standings = report.standings.is_some_and(|body| {
            cache
                .accept_standings(&body, started(report.standings_started))
                .is_ok()
        });
        let session = report.session.is_some_and(|body| {
            cache
                .accept_session(&body, started(report.session_started))
                .is_ok()
        });
        standings || session
    }
}

impl Default for Lmu {
    fn default() -> Self {
        Self::new()
    }
}

impl Adapter for Lmu {
    fn poll(&mut self, now: Duration) -> Result<Option<Observation>, AdapterError> {
        if self.source.is_none() {
            self.connect(now)?;
        } else if now < self.next_read {
            return Ok(None);
        }
        let remaining = READ_INTERVAL.as_nanos() - now.as_nanos() % READ_INTERVAL.as_nanos();
        // El resto está acotado por READ_INTERVAL (menos de un segundo).
        let remaining =
            u64::try_from(remaining).expect("intervalo de lectura menor que u64 nanosegundos");
        self.next_read = now.saturating_add(Duration::from_nanos(remaining));
        let rest_updated = {
            #[cfg(feature = "paint-stats")]
            let _span = crate::profiling::begin(crate::profiling::Stage::RestCache);
            self.take_rest(now)
        };
        let Some(running) = &mut self.source else {
            return Err(AdapterError::Disconnected);
        };
        let read = {
            #[cfg(feature = "paint-stats")]
            let _span = crate::profiling::begin(crate::profiling::Stage::Shm);
            (running.read)(&mut self.frame, &mut self.scratch)
        };
        match read {
            Ok(()) => {}
            // El productor escribía a la vez: se reintenta en la próxima llamada.
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => return Ok(None),
            Err(_) => {
                self.source = None;
                self.failure = AdapterError::Disconnected;
                self.retry_at = now + RETRY_INTERVAL;
                return Err(AdapterError::Disconnected);
            }
        }
        if self.frame == self.previous && !rest_updated && !self.translator.needs_refresh(now) {
            return Ok(None);
        }
        let build = running.build.as_str();
        #[cfg(feature = "paint-stats")]
        let _span = crate::profiling::begin(crate::profiling::Stage::Translate);
        let observation = self
            .translator
            .observe(&self.frame, build, now)
            .map_err(|rejection| AdapterError::Rejected(rejection.to_string()))?;
        std::mem::swap(&mut self.frame, &mut self.previous);
        Ok(Some(observation))
    }

    fn next_poll(&self) -> Option<Duration> {
        Some(if self.source.is_some() {
            self.next_read
        } else {
            self.retry_at
        })
    }
}

fn open_running() -> Result<Running, AdapterError> {
    let source = RunningSource::open().map_err(|error| open_error(error.kind()))?;
    let build = source
        .build
        .exact_supported_build()
        .map(str::to_owned)
        .ok_or_else(|| {
            AdapterError::Rejected(format!(
                "build de LMU {} sin layout verificado",
                source.build.file_version()
            ))
        })?;
    Ok(Running {
        read: Box::new(move |destination, scratch| source.read_stable(destination, scratch)),
        build,
    })
}

fn open_error(kind: io::ErrorKind) -> AdapterError {
    if kind == io::ErrorKind::AlreadyExists {
        AdapterError::Rejected(
            "hay varios procesos LMU; no se puede elegir una fuente única".into(),
        )
    } else {
        AdapterError::Disconnected
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    const REAL_44: &[u8] = include_bytes!("../../../../../testdata/lmu-fixture.bin");
    const MENU: &[u8] = include_bytes!("../../../../../testdata/lmu-menu-fixture.bin");
    const MS: fn(u64) -> Duration = Duration::from_millis;

    #[test]
    fn ambiguous_lmu_processes_are_rejected_and_keep_the_diagnosis_during_retry() {
        let mut lmu = Lmu::with_source(
            Box::new(|| Err(open_error(io::ErrorKind::AlreadyExists))),
            None,
        );
        for now in [MS(0), MS(10), MS(1_000)] {
            let error = lmu.poll(now).expect_err("varios procesos no son ausencia");
            assert!(
                matches!(error, AdapterError::Rejected(ref cause) if cause.contains("varios procesos LMU"))
            );
        }
        assert_eq!(
            open_error(io::ErrorKind::NotFound),
            AdapterError::Disconnected
        );
    }

    /// Fuente simulada: `next` es el frame que devolverá la próxima lectura, o
    /// el error con que fallará.
    type Script = Arc<Mutex<Result<Vec<u8>, io::ErrorKind>>>;

    fn scripted(opens: Arc<Mutex<u32>>, script: Script) -> Open {
        Box::new(move || {
            *opens.lock().unwrap() += 1;
            let script = Arc::clone(&script);
            Ok(Running {
                read: Box::new(move |destination, _| match &*script.lock().unwrap() {
                    Ok(frame) => {
                        destination.copy_from_slice(frame);
                        Ok(())
                    }
                    Err(kind) => Err(io::Error::from(*kind)),
                }),
                build: "1.3.0.0".to_owned(),
            })
        })
    }

    #[test]
    fn late_reads_keep_the_phase_and_skip_missed_frames() {
        let opens = Arc::new(Mutex::new(0));
        let script = Arc::new(Mutex::new(Ok(REAL_44.to_vec())));
        let mut lmu = Lmu::with_source(scripted(opens, script), None);
        lmu.poll(Duration::ZERO).unwrap();
        lmu.poll(READ_INTERVAL + MS(2)).unwrap();
        assert_eq!(lmu.next_read, READ_INTERVAL * 2);
        assert_eq!(lmu.next_poll(), Some(READ_INTERVAL * 2));
        lmu.poll(READ_INTERVAL * 10 + MS(3)).unwrap();
        assert_eq!(lmu.next_read, READ_INTERVAL * 11);
        assert_eq!(lmu.poll(READ_INTERVAL * 10 + MS(4)), Ok(None));
    }

    #[test]
    fn a_frozen_clock_with_live_rest_preserves_data_until_rest_also_stops() {
        let opens = Arc::new(Mutex::new(0));
        let script: Script = Arc::new(Mutex::new(Ok(REAL_44.to_vec())));
        let mut lmu = Lmu::with_source(scripted(opens, script), None);
        let mut core = crate::core::Core::new(1);
        lmu.translator
            .rest
            .accept_session(
                br#"{"inRealtime":true,"gamePhase":5,"session":"PRACTICE1"}"#,
                MS(0),
            )
            .unwrap();
        core.step(&mut lmu, MS(0)).unwrap();
        let original = core.snapshot().state.clone();
        for at in (250..=6000).step_by(250) {
            lmu.translator
                .rest
                .accept_session(
                    br#"{"inRealtime":false,"gamePhase":5,"session":"PRACTICE1"}"#,
                    MS(at),
                )
                .unwrap();
            // Una ronda REST recibida provoca observe aunque SHM sea idéntico
            // (take_rest devuelve true en producción, sin otro consumidor IPC).
            core.observe(lmu.translator.observe(REAL_44, "1.3.0.0", MS(at)).unwrap())
                .unwrap();
            core.tick(MS(at));
            if at >= 500 {
                let snapshot = core.snapshot();
                assert_eq!(
                    snapshot.state.source_state,
                    vantare_domain::SourceState::Paused,
                    "en {at} ms"
                );
                let mut preserved = snapshot.state.clone();
                assert_eq!(
                    preserved.driving_situation,
                    if at >= 750 {
                        vantare_domain::DrivingSituation::Paused
                    } else {
                        original.driving_situation
                    },
                    "situación tras 250 ms de pausa confirmada"
                );
                preserved.source_state = original.source_state;
                preserved.driving_situation = original.driving_situation;
                assert_eq!(
                    preserved, original,
                    "no cambia ningún dato durante la pausa"
                );
            }
        }
        core.step(&mut lmu, MS(6499)).unwrap();
        assert_eq!(
            core.snapshot().state.source_state,
            vantare_domain::SourceState::Paused
        );
        core.step(&mut lmu, MS(6500)).unwrap();
        assert_eq!(
            core.snapshot().state.source_state,
            vantare_domain::SourceState::Stale
        );
        assert!(matches!(
            core.snapshot().state.cars[0].position,
            vantare_domain::Quality::Stale(_)
        ));
    }

    #[test]
    fn resuming_a_confirmed_pause_is_immediate_and_unrelated_rest_cannot_confirm_it() {
        for (session, expected) in [
            ("PRACTICE1", vantare_domain::SourceState::Paused),
            ("RACE1", vantare_domain::SourceState::Stale),
        ] {
            let script: Script = Arc::new(Mutex::new(Ok(REAL_44.to_vec())));
            let mut lmu =
                Lmu::with_source(scripted(Arc::new(Mutex::new(0)), Arc::clone(&script)), None);
            let mut core = crate::core::Core::new(1);
            core.step(&mut lmu, MS(0)).unwrap();
            let body = format!(r#"{{"session":"{session}","inRealtime":false}}"#);
            lmu.translator
                .rest
                .accept_session(body.as_bytes(), MS(500))
                .unwrap();
            core.step(&mut lmu, MS(500)).unwrap();
            assert_eq!(core.snapshot().state.source_state, expected);
            if expected == vantare_domain::SourceState::Paused {
                let mut advanced = REAL_44.to_vec();
                advanced[1700..1708].copy_from_slice(&112.8_f64.to_le_bytes());
                *script.lock().unwrap() = Ok(advanced);
                core.step(&mut lmu, MS(520)).unwrap();
                assert_eq!(
                    core.snapshot().state.source_state,
                    vantare_domain::SourceState::Live
                );
                assert!(core.snapshot().state.cars[0].position.current().is_some());
            }
        }
    }

    #[test]
    fn resuming_scoring_does_not_hide_a_player_clock_that_remains_frozen() {
        let mut frame = REAL_44.to_vec();
        let player_clock = 128_468 + 43 * 1_888 + 12;
        frame[player_clock..player_clock + 8].copy_from_slice(&112.6_f64.to_le_bytes());
        let script: Script = Arc::new(Mutex::new(Ok(frame.clone())));
        let mut lmu =
            Lmu::with_source(scripted(Arc::new(Mutex::new(0)), Arc::clone(&script)), None);
        let mut core = crate::core::Core::new(1);
        core.step(&mut lmu, MS(0)).unwrap();
        lmu.translator
            .rest
            .accept_session(br#"{"session":"PRACTICE1"}"#, MS(500))
            .unwrap();
        core.step(&mut lmu, MS(500)).unwrap();
        assert_eq!(
            core.snapshot().state.source_state,
            vantare_domain::SourceState::Paused
        );
        frame[1700..1708].copy_from_slice(&112.8_f64.to_le_bytes());
        *script.lock().unwrap() = Ok(frame);
        core.step(&mut lmu, MS(520)).unwrap();
        let snapshot = core.snapshot();
        assert_eq!(
            snapshot.state.source_state,
            vantare_domain::SourceState::Live
        );
        assert_eq!(
            snapshot.state.capabilities.driver_inputs,
            vantare_domain::Capability::WithData
        );
        assert!(matches!(
            snapshot.state.player.as_ref().unwrap().telemetry.throttle,
            vantare_domain::Quality::Stale(_)
        ));
    }

    #[test]
    fn independently_stalled_clocks_keep_latest_scoring_and_last_valid_player_when_paused() {
        let mut frame = REAL_44.to_vec();
        let player_clock = 128_468 + 43 * 1_888 + 12;
        frame[player_clock..player_clock + 8].copy_from_slice(&112.6_f64.to_le_bytes());
        let script: Script = Arc::new(Mutex::new(Ok(frame.clone())));
        let mut lmu =
            Lmu::with_source(scripted(Arc::new(Mutex::new(0)), Arc::clone(&script)), None);
        let mut core = crate::core::Core::new(1);
        core.step(&mut lmu, MS(0)).unwrap();
        let player = core.snapshot().state.player;
        frame[1700..1708].copy_from_slice(&113.0_f64.to_le_bytes());
        *script.lock().unwrap() = Ok(frame);
        core.step(&mut lmu, MS(500)).unwrap();
        let latest = core.snapshot();
        assert_eq!(latest.state.source_state, vantare_domain::SourceState::Live);
        assert_eq!(
            latest.state.capabilities.driver_inputs,
            vantare_domain::Capability::WithData
        );
        lmu.translator
            .rest
            .accept_session(br#"{"session":"PRACTICE1"}"#, MS(1000))
            .unwrap();
        core.step(&mut lmu, MS(1000)).unwrap();
        let paused = core.snapshot();
        assert_eq!(
            paused.state.source_state,
            vantare_domain::SourceState::Paused
        );
        assert_eq!(paused.state.cars, latest.state.cars);
        assert_eq!(paused.state.session, latest.state.session);
        assert_eq!(paused.state.player, player);
        assert_eq!(
            paused.state.capabilities.driver_inputs,
            vantare_domain::Capability::Fresh
        );
    }

    #[test]
    fn an_absent_game_is_disconnected_and_probed_once_per_retry_interval() {
        let opens = Arc::new(Mutex::new(0));
        let mut lmu = Lmu::with_source(
            Box::new({
                let opens = Arc::clone(&opens);
                move || {
                    *opens.lock().unwrap() += 1;
                    Err(AdapterError::Disconnected)
                }
            }),
            None,
        );
        for at in [0, 16, 500, 999] {
            assert_eq!(lmu.poll(MS(at)), Err(AdapterError::Disconnected));
        }
        assert_eq!(*opens.lock().unwrap(), 1);
        assert_eq!(lmu.poll(MS(1_000)), Err(AdapterError::Disconnected));
        assert_eq!(*opens.lock().unwrap(), 2);
    }

    #[test]
    fn publishes_changes_and_stalls_but_not_repeats_and_reconnects_after_a_failure() {
        let opens = Arc::new(Mutex::new(0));
        let script: Script = Arc::new(Mutex::new(Ok(REAL_44.to_vec())));
        let mut lmu = Lmu::with_source(scripted(Arc::clone(&opens), Arc::clone(&script)), None);

        let first = lmu.poll(MS(0)).unwrap().expect("primer frame");
        assert_eq!(first.state.cars.len(), 44);
        assert_eq!(first.origin.source.kind, SourceKind::Live);
        assert_eq!(first.origin.received_at, MS(0));
        // Antes del intervalo mínimo no se lee.
        assert_eq!(lmu.poll(MS(5)), Ok(None));
        // Mismo frame y reloj del simulador sin cambio pero aún no caducado.
        assert_eq!(lmu.poll(MS(20)), Ok(None));
        // Pasado el límite, el reloj parado caduca el estado aunque no cambie el frame.
        let stale = lmu.poll(MS(600)).unwrap().expect("estado caducado");
        assert!(stale.state.cars[0].position.current().is_none());
        assert!(matches!(
            stale.state.cars[0].position,
            vantare_domain::Quality::Stale(_)
        ));
        assert_eq!(lmu.poll(MS(700)), Ok(None), "ya publicado como caducado");
        // Un frame distinto se publica.
        let mut changed = REAL_44.to_vec();
        changed[128_468 + 43 * 1_888 + 420..][..8].copy_from_slice(&0.5_f64.to_le_bytes());
        *script.lock().unwrap() = Ok(changed);
        assert!(lmu.poll(MS(720)).unwrap().is_some());

        // Menú principal: un frame válido sin coches.
        *script.lock().unwrap() = Ok(MENU.to_vec());
        assert!(lmu.poll(MS(740)).unwrap().unwrap().state.cars.is_empty());
        // Lectura que no se estabiliza: se reintenta sin cerrar la fuente.
        *script.lock().unwrap() = Err(io::ErrorKind::WouldBlock);
        assert_eq!(lmu.poll(MS(760)), Ok(None));
        assert_eq!(*opens.lock().unwrap(), 1);
        // El proceso muere: desconectado, y se reabre pasado el intervalo.
        *script.lock().unwrap() = Err(io::ErrorKind::NotConnected);
        assert_eq!(lmu.poll(MS(780)), Err(AdapterError::Disconnected));
        *script.lock().unwrap() = Ok(REAL_44.to_vec());
        assert_eq!(lmu.poll(MS(900)), Err(AdapterError::Disconnected));
        assert_eq!(*opens.lock().unwrap(), 1);
        assert!(lmu.poll(MS(1_780)).unwrap().is_some());
        assert_eq!(*opens.lock().unwrap(), 2);
    }

    #[test]
    fn a_build_without_verified_layout_is_rejected_not_mistaken_for_absent() {
        let mut lmu = Lmu::with_source(
            Box::new(|| Err(AdapterError::Rejected("build".to_owned()))),
            None,
        );
        assert_eq!(
            lmu.poll(MS(0)),
            Err(AdapterError::Rejected("build".to_owned()))
        );
        assert_eq!(
            lmu.poll(MS(10)),
            Err(AdapterError::Rejected("build".to_owned()))
        );
    }
}
