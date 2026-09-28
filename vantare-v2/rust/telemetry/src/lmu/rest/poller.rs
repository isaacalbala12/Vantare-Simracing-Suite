//! One loopback REST worker, with a latest-only result slot for the SHM loop.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use super::http::{Client, Endpoint, Response};
use super::{EndpointStatus, RestCache};
use crate::lmu::fusion::DEFAULT_REST_TTL_NS;

const POLL_INTERVAL: Duration = Duration::from_millis(250);
const MAX_BACKOFF: Duration = Duration::from_secs(2);

struct Report {
    standings: Response,
    standings_started_ns: u64,
    standings_received_ns: u64,
    session: Response,
    session_received_ns: u64,
}

pub struct Poller {
    latest: Arc<Mutex<Option<Report>>>,
    cancelled: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
    start: Instant,
}

impl Poller {
    pub fn start(start: Instant) -> Self {
        Self::start_with(Client::default(), start, POLL_INTERVAL, MAX_BACKOFF)
    }

    fn start_with(
        client: Client,
        start: Instant,
        interval: Duration,
        max_backoff: Duration,
    ) -> Self {
        let latest = Arc::new(Mutex::new(None));
        let cancelled = Arc::new(AtomicBool::new(false));
        let slot = Arc::clone(&latest);
        let stop = Arc::clone(&cancelled);
        let worker = thread::spawn(move || {
            let mut backoff = interval;
            while !stop.load(Ordering::Acquire) {
                let standings_started_ns = elapsed_ns(start);
                let standings = client.fetch(Endpoint::Standings);
                let standings_received_ns = elapsed_ns(start);
                if stop.load(Ordering::Acquire) {
                    break;
                }
                let session = client.fetch(Endpoint::SessionInfo);
                let session_received_ns = elapsed_ns(start);
                if stop.load(Ordering::Acquire) {
                    break;
                }
                let complete = standings.status == EndpointStatus::Fresh
                    && session.status == EndpointStatus::Fresh;
                *slot.lock().expect("REST result slot poisoned") = Some(Report {
                    standings,
                    standings_started_ns,
                    standings_received_ns,
                    session,
                    session_received_ns,
                });
                backoff = if complete {
                    interval
                } else {
                    backoff.saturating_mul(2).min(max_backoff)
                };
                thread::park_timeout(backoff);
            }
        });
        Self {
            latest,
            cancelled,
            worker: Some(worker),
            start,
        }
    }

    /// Move the latest completed REST poll into the canonical cache, then age
    /// the cache even when the endpoint is unavailable. The SHM loop never
    /// waits for HTTP or an unbounded queue.
    pub fn take_into(&self, cache: &mut RestCache) -> bool {
        let report = self
            .latest
            .lock()
            .expect("REST result slot poisoned")
            .take();
        let updated = if let Some(report) = report {
            if report.standings.status == EndpointStatus::Fresh {
                cache.accept_standings(
                    &report.standings.body,
                    report.standings_started_ns,
                    report.standings_received_ns,
                );
            } else {
                cache.standings_status = report.standings.status;
            }
            if report.session.status == EndpointStatus::Fresh {
                cache.accept_session(&report.session.body, report.session_received_ns);
            } else {
                cache.session_status = report.session.status;
            }
            true
        } else {
            false
        };
        cache.age(elapsed_ns(self.start), DEFAULT_REST_TTL_NS);
        updated
    }

    pub fn shutdown(&mut self) -> thread::Result<()> {
        self.cancelled.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            worker.thread().unpark();
            worker.join()
        } else {
            Ok(())
        }
    }
}

impl Drop for Poller {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

fn elapsed_ns(start: Instant) -> u64 {
    start.elapsed().as_nanos().min(u128::from(u64::MAX)) as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::assembly::Assembler;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    #[test]
    fn completed_poll_moves_both_endpoint_results_without_a_network_wait_in_consumer() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = thread::spawn(move || {
            for (expected, body) in [
                (
                    "/rest/watch/standings",
                    br#"[{"player":true,"position":3,"lapsCompleted":77}]"#.as_slice(),
                ),
                (
                    "/rest/watch/sessionInfo",
                    br#"{"numberOfVehicles":44,"session":"RACE","currentEventTime":112.6}"#
                        .as_slice(),
                ),
            ] {
                let (mut socket, _) = listener.accept().unwrap();
                let mut request = [0_u8; 1024];
                let count = socket.read(&mut request).unwrap();
                assert!(String::from_utf8_lossy(&request[..count]).contains(expected));
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                socket.write_all(header.as_bytes()).unwrap();
                socket.write_all(body).unwrap();
            }
        });
        let mut poller = Poller::start_with(
            Client::new(port),
            Instant::now(),
            Duration::from_secs(2),
            Duration::from_secs(2),
        );
        server.join().unwrap();
        let deadline = Instant::now() + Duration::from_secs(2);
        let mut assembler = Assembler::new(30, 7).unwrap();
        assembler
            .configure(include_bytes!(
                "../../../testdata/configuration-frame-go-v1.bin"
            ))
            .unwrap();
        while !poller.take_into(assembler.rest_cache_mut()) && Instant::now() < deadline {
            thread::yield_now();
        }
        assert_eq!(
            assembler.rest_cache_mut().standings_status,
            EndpointStatus::Fresh
        );
        assert_eq!(
            assembler.rest_cache_mut().session_status,
            EndpointStatus::Fresh
        );
        assert!(!poller.take_into(assembler.rest_cache_mut()));
        let frame = include_bytes!("../../../../../testdata/lmu-fixture.bin");
        let frames = assembler
            .apply(frame, "1.3.0.0", 0, 600_000_000, 1_000_000_000)
            .unwrap();
        assert!(!frames.is_empty());
        let batch = assembler.engine().current().unwrap();
        let player = batch
            .state
            .vehicles
            .iter()
            .find(|vehicle| Some(&vehicle.id) == batch.player_id.as_ref())
            .unwrap();
        assert_eq!(player.value.completed_laps.value(), Some(&77));
        poller.shutdown().unwrap();
        poller.shutdown().unwrap();
    }

    #[test]
    fn shutdown_interrupts_poll_sequence_after_stalled_endpoint_deadline() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let (accepted_tx, accepted_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let server = thread::spawn(move || {
            let (_socket, _) = listener.accept().unwrap();
            accepted_tx.send(()).unwrap();
            release_rx.recv().unwrap();
        });
        let mut poller = Poller::start_with(
            Client::new(port),
            Instant::now(),
            POLL_INTERVAL,
            MAX_BACKOFF,
        );
        accepted_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        let started = Instant::now();
        poller.shutdown().unwrap();
        assert!(started.elapsed() < Duration::from_secs(2));
        release_tx.send(()).unwrap();
        server.join().unwrap();
    }
}
