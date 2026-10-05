//! Un hilo que consulta el REST local y deja la última ronda completa. Solo
//! interesa la más reciente (la caché guarda una sola por endpoint), así que
//! una ronda sin recoger se sustituye en lugar de acumularse.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use super::http::{Client, Endpoint};

const POLL_INTERVAL: Duration = Duration::from_millis(250);
const MAX_BACKOFF: Duration = Duration::from_secs(2);

/// Ronda de consultas: cada endpoint con su cuerpo (`None`: sin respuesta
/// utilizable) y el instante en que se inició.
pub(in crate::adapter::lmu) struct Report {
    pub standings: Option<Vec<u8>>,
    pub standings_started: Instant,
    pub session: Option<Vec<u8>>,
    pub session_started: Instant,
}

pub(in crate::adapter::lmu) struct Poller {
    latest: Arc<Mutex<Option<Report>>>,
    cancelled: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl Poller {
    pub(in crate::adapter::lmu) fn start() -> Self {
        Self::start_with(Client::default(), POLL_INTERVAL)
    }

    fn start_with(client: Client, interval: Duration) -> Self {
        let latest = Arc::new(Mutex::new(None));
        let cancelled = Arc::new(AtomicBool::new(false));
        let slot = Arc::clone(&latest);
        let stop = Arc::clone(&cancelled);
        let worker = thread::spawn(move || {
            let mut backoff = interval;
            while !stop.load(Ordering::Acquire) {
                #[cfg(feature = "paint-stats")]
                let span = crate::profiling::begin(crate::profiling::Stage::Rest);
                let standings_started = Instant::now();
                let standings = client.fetch(Endpoint::Standings);
                if stop.load(Ordering::Acquire) {
                    break;
                }
                let session_started = Instant::now();
                let session = client.fetch(Endpoint::SessionInfo);
                let complete = standings.is_some() && session.is_some();
                *slot.lock().unwrap_or_else(PoisonError::into_inner) = Some(Report {
                    standings,
                    standings_started,
                    session,
                    session_started,
                });
                #[cfg(feature = "paint-stats")]
                drop(span); // No incluir el park/backoff en la consulta REST.
                backoff = if complete {
                    interval
                } else {
                    backoff.saturating_mul(2).min(MAX_BACKOFF)
                };
                thread::park_timeout(backoff);
            }
        });
        Self {
            latest,
            cancelled,
            worker: Some(worker),
        }
    }

    /// La ronda más reciente aún no recogida.
    pub(in crate::adapter::lmu) fn take(&self) -> Option<Report> {
        self.latest
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take()
    }
}

impl Drop for Poller {
    fn drop(&mut self) {
        self.cancelled.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            worker.thread().unpark();
            // Un pánico del hilo ya se habría manifestado como falta de datos.
            let _ = worker.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;

    /// Atiende una ronda completa: una conexión por endpoint.
    fn serve_round(listener: TcpListener) -> JoinHandle<()> {
        thread::spawn(move || {
            for _ in 0..2 {
                let (mut socket, _) = listener.accept().unwrap();
                let mut reader = BufReader::new(&socket);
                let mut request = String::new();
                if reader.read_line(&mut request).is_err() {
                    continue;
                }
                loop {
                    let mut line = String::new();
                    if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                        break;
                    }
                }
                let body: &[u8] = if request.contains("standings") {
                    br#"[{"slotID":1,"carNumber":"7","vehicleName":"A"}]"#
                } else {
                    br#"{"session":"RACE1"}"#
                };
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                socket.write_all(header.as_bytes()).unwrap();
                socket.write_all(body).unwrap();
            }
        })
    }

    #[test]
    fn delivers_the_latest_round_once_and_stops_on_drop() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = serve_round(listener);
        // Intervalo largo: la segunda ronda no llega a empezar antes del drop.
        let poller = Poller::start_with(Client::new(port), Duration::from_secs(30));
        let report = loop {
            if let Some(report) = poller.take() {
                break report;
            }
            thread::sleep(Duration::from_millis(5));
        };
        assert!(report.standings.is_some() && report.session.is_some());
        assert!(report.standings_started <= report.session_started);
        assert!(poller.take().is_none(), "una ronda se entrega una sola vez");
        // `drop` despierta al hilo dormido: no espera los 30 s.
        drop(poller);
        server.join().unwrap();
    }

    #[test]
    fn an_unreachable_endpoint_is_reported_without_a_body() {
        let port = {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            listener.local_addr().unwrap().port()
        };
        let poller = Poller::start_with(Client::new(port), Duration::from_millis(10));
        let report = loop {
            if let Some(report) = poller.take() {
                break report;
            }
            thread::sleep(Duration::from_millis(5));
        };
        assert!(report.standings.is_none() && report.session.is_none());
    }
}
