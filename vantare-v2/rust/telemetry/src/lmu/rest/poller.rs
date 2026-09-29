//! One loopback REST worker with bounded, ordered completed reports.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use super::http::{Client, Endpoint, Response};
use super::{EndpointStatus, RestCache};
use crate::lmu::fusion::DEFAULT_REST_TTL_NS;

const POLL_INTERVAL: Duration = Duration::from_millis(250);
const MAX_BACKOFF: Duration = Duration::from_secs(2);
const MAX_PENDING_REPORTS: usize = 16;

#[derive(Debug, Eq, PartialEq)]
pub enum PollerError {
    BacklogOverflow,
}

#[derive(Default)]
struct PendingReports {
    reports: VecDeque<Report>,
    overflowed: bool,
}

impl PendingReports {
    fn push(&mut self, report: Report) {
        if self.reports.len() == MAX_PENDING_REPORTS {
            self.overflowed = true;
        } else {
            self.reports.push_back(report);
        }
    }

    fn pop(&mut self) -> Result<Option<Report>, PollerError> {
        if self.overflowed {
            return Err(PollerError::BacklogOverflow);
        }
        Ok(self.reports.pop_front())
    }
}

struct Report {
    standings: Response,
    standings_started_ns: u64,
    standings_received_ns: u64,
    session: Response,
    session_received_ns: u64,
}

pub struct Poller {
    pending: Arc<Mutex<PendingReports>>,
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
        let pending = Arc::new(Mutex::new(PendingReports::default()));
        let cancelled = Arc::new(AtomicBool::new(false));
        let reports = Arc::clone(&pending);
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
                reports
                    .lock()
                    .expect("REST result queue poisoned")
                    .push(Report {
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
            pending,
            cancelled,
            worker: Some(worker),
            start,
        }
    }

    /// Move the oldest completed REST poll into the canonical cache, then age
    /// it. A backlog overflow is fatal to this instance, never silent loss.
    pub fn take_into(&self, cache: &mut RestCache) -> Result<Option<u64>, PollerError> {
        let report = self
            .pending
            .lock()
            .expect("REST result queue poisoned")
            .pop()?;
        let updated = if let Some(report) = report {
            let received_ns = report.session_received_ns;
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
            Some(received_ns)
        } else {
            None
        };
        cache.age(elapsed_ns(self.start), DEFAULT_REST_TTL_NS);
        Ok(updated)
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
        while poller
            .take_into(assembler.rest_cache_mut())
            .unwrap()
            .is_none()
            && Instant::now() < deadline
        {
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
        assert!(
            poller
                .take_into(assembler.rest_cache_mut())
                .unwrap()
                .is_none()
        );
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

    #[test]
    fn completed_reports_remain_ordered_and_overflow_fails_closed() {
        fn report(received_ns: u64) -> Report {
            Report {
                standings: Response {
                    status: EndpointStatus::Offline,
                    body: Vec::new(),
                },
                standings_started_ns: received_ns,
                standings_received_ns: received_ns,
                session: Response {
                    status: EndpointStatus::Offline,
                    body: Vec::new(),
                },
                session_received_ns: received_ns,
            }
        }

        let mut pending = PendingReports::default();
        pending.push(report(1));
        pending.push(report(2));
        assert_eq!(pending.pop().unwrap().unwrap().session_received_ns, 1);
        assert_eq!(pending.pop().unwrap().unwrap().session_received_ns, 2);
        assert!(pending.pop().unwrap().is_none());

        for index in 0..=MAX_PENDING_REPORTS {
            pending.push(report(index as u64));
        }
        assert_eq!(pending.pop().err(), Some(PollerError::BacklogOverflow));
        assert_eq!(pending.reports.len(), MAX_PENDING_REPORTS);
    }

    #[test]
    fn live_lmu_poller_cadence_diagnostic_opt_in() {
        if std::env::var_os("VANTARE_LMU_LIVE_REST_CADENCE_TEST").is_none() {
            return;
        }
        let mut poller = Poller::start(Instant::now());
        let mut cache = RestCache::default();
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut total = 0;
        let mut live = 0;
        let mut last = None;
        while Instant::now() < deadline {
            if poller.take_into(&mut cache).unwrap().is_some() {
                total += 1;
                if cache.status() == super::super::RestStatus::Live {
                    live += 1;
                }
                last = Some((cache.standings_status, cache.session_status));
            }
            // The physical REST worker polls independently of this test.
            thread::sleep(Duration::from_millis(5));
        }
        poller.shutdown().unwrap();
        eprintln!("LMU REST poller diagnostic: total={total} live={live} last={last:?}");
        assert!(total > 0, "no LMU REST report completed");
    }
}
