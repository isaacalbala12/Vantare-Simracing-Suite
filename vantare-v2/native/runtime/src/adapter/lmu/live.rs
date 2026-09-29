//! Adaptador en vivo: lee `LMU_Data` del proceso de LMU en marcha y el REST
//! local. Abre la fuente sin bloquear y la reabre sola si el juego se cierra.

use std::io;
use std::time::{Duration, Instant};

use vantare_domain::{Adapter, AdapterError, Observation, SourceKind};

use super::frame::OBJECT_OUT_SIZE;
use super::rest::{self, Poller};
use super::shm::RunningSource;
use super::translate::Translator;

/// Intervalo mínimo entre lecturas del frame: el simulador lo refresca a ~60 Hz
/// y leer más rápido solo copia lo mismo. Es un mínimo, sin fase fija: el
/// ritmo real lo marca el núcleo al llamar a `poll`.
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
        let standings = report.standings.status == rest::Status::Fresh
            && cache
                .accept_standings(&report.standings.body, started(report.standings_started))
                .is_ok();
        let session = report.session.status == rest::Status::Fresh
            && cache
                .accept_session(&report.session.body, started(report.session_started))
                .is_ok();
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
        self.next_read = now + READ_INTERVAL;
        let rest_updated = self.take_rest(now);
        let Some(running) = &mut self.source else {
            return Err(AdapterError::Disconnected);
        };
        match (running.read)(&mut self.frame, &mut self.scratch) {
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
        let observation = self
            .translator
            .observe(&self.frame, build, now)
            .map_err(|rejection| AdapterError::Rejected(rejection.to_string()))?;
        std::mem::swap(&mut self.frame, &mut self.previous);
        Ok(Some(observation))
    }
}

fn open_running() -> Result<Running, AdapterError> {
    let source = RunningSource::open().map_err(|_| AdapterError::Disconnected)?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    const REAL_44: &[u8] = include_bytes!("../../../../../testdata/lmu-fixture.bin");
    const MENU: &[u8] = include_bytes!("../../../../../testdata/lmu-menu-fixture.bin");
    const MS: fn(u64) -> Duration = Duration::from_millis;

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
