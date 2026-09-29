//! A loopback-only REST transport. The bounded synchronous call is not yet
//! wired into the child runtime or its stop path.

use std::io::Read;
use std::time::Duration;

use super::{EndpointStatus, MAX_RESPONSE_BYTES};

const DEFAULT_PORT: u16 = 6397;
const DEADLINE: Duration = Duration::from_millis(750);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Endpoint {
    Standings,
    SessionInfo,
}

impl Endpoint {
    fn path(self) -> &'static str {
        match self {
            Self::Standings => "/rest/watch/standings",
            Self::SessionInfo => "/rest/watch/sessionInfo",
        }
    }
}

#[derive(Debug, PartialEq)]
pub struct Response {
    pub status: EndpointStatus,
    pub body: Vec<u8>,
}

pub struct Client {
    agent: ureq::Agent,
    port: u16,
}

impl Default for Client {
    fn default() -> Self {
        Self::new(DEFAULT_PORT)
    }
}

impl Client {
    /// Port is injectable for an isolated local test server. The host and
    /// scheme are fixed, so a caller cannot redirect acquisition off-host.
    pub fn new(port: u16) -> Self {
        let config = ureq::Agent::config_builder()
            .proxy(None)
            .max_redirects(0)
            .http_status_as_error(false)
            .timeout_global(Some(DEADLINE))
            .build();
        Self {
            agent: ureq::Agent::new_with_config(config),
            port,
        }
    }

    pub fn fetch(&self, endpoint: Endpoint) -> Response {
        let url = format!("http://127.0.0.1:{}{}", self.port, endpoint.path());
        let mut response = match self.agent.get(url).call() {
            Ok(response) => response,
            Err(error) => {
                let status = if matches!(error, ureq::Error::Timeout(_)) {
                    EndpointStatus::Timeout
                } else {
                    EndpointStatus::Offline
                };
                return Response {
                    status,
                    body: Vec::new(),
                };
            }
        };
        let code = response.status().as_u16();
        let status = match code {
            404 | 405 | 501 => EndpointStatus::Unsupported,
            500..=599 => EndpointStatus::Offline,
            200..=299 => EndpointStatus::Fresh,
            _ => EndpointStatus::Malformed,
        };
        if status != EndpointStatus::Fresh {
            return Response {
                status,
                body: Vec::new(),
            };
        }
        let mut body = Vec::new();
        let limit = (MAX_RESPONSE_BYTES + 1) as u64;
        let result = response
            .body_mut()
            .as_reader()
            .take(limit)
            .read_to_end(&mut body);
        match result {
            Ok(_) if body.iter().all(u8::is_ascii_whitespace) => Response {
                status: EndpointStatus::Empty,
                body: Vec::new(),
            },
            Ok(_) if body.len() > MAX_RESPONSE_BYTES => Response {
                status: EndpointStatus::Malformed,
                body: Vec::new(),
            },
            Ok(_) => Response {
                status: EndpointStatus::Fresh,
                body,
            },
            Err(error) => Response {
                status: if error.kind() == std::io::ErrorKind::TimedOut {
                    EndpointStatus::Timeout
                } else {
                    EndpointStatus::Offline
                },
                body: Vec::new(),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};
    use std::net::{TcpListener, TcpStream};

    fn read_request_line(socket: &TcpStream) -> String {
        let mut reader = BufReader::new(socket);
        let mut first = String::new();
        reader.read_line(&mut first).unwrap();
        loop {
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            if line == "\r\n" || line.is_empty() {
                break;
            }
        }
        first
    }

    fn serve_once(status: &str, body: &[u8]) -> (u16, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let status = status.to_owned();
        let body = body.to_vec();
        let handle = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let request = read_request_line(&socket);
            let header = format!(
                "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            socket.write_all(header.as_bytes()).unwrap();
            socket.write_all(&body).unwrap();
            request
        });
        (port, handle)
    }

    #[test]
    fn fetches_only_fixed_loopback_endpoint_and_keeps_body_bounded() {
        let (port, server) = serve_once("200 OK", b"[]");
        let response = Client::new(port).fetch(Endpoint::Standings);
        assert_eq!(response.status, EndpointStatus::Fresh);
        assert_eq!(response.body, b"[]");
        assert!(
            server
                .join()
                .unwrap()
                .starts_with("GET /rest/watch/standings ")
        );

        let (port, server) = serve_once("404 Not Found", b"missing");
        assert_eq!(
            Client::new(port).fetch(Endpoint::SessionInfo).status,
            EndpointStatus::Unsupported
        );
        assert!(
            server
                .join()
                .unwrap()
                .starts_with("GET /rest/watch/sessionInfo ")
        );

        let (port, server) = serve_once("200 OK", &vec![b'x'; MAX_RESPONSE_BYTES + 1]);
        let response = Client::new(port).fetch(Endpoint::Standings);
        assert_eq!(response.status, EndpointStatus::Malformed);
        assert!(response.body.is_empty());
        server.join().unwrap();
    }

    #[test]
    fn redirects_are_rejected_without_following_location() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            read_request_line(&socket);
            socket.write_all(b"HTTP/1.1 302 Found\r\nLocation: http://example.com/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
        });
        let response = Client::new(port).fetch(Endpoint::Standings);
        assert_eq!(response.status, EndpointStatus::Malformed);
        server.join().unwrap();
    }

    #[test]
    fn stalled_local_server_hits_the_request_deadline() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let (release, hold) = std::sync::mpsc::channel::<()>();
        let server = std::thread::spawn(move || {
            let (socket, _) = listener.accept().unwrap();
            read_request_line(&socket);
            hold.recv().unwrap();
        });
        let response = Client::new(port).fetch(Endpoint::Standings);
        release.send(()).unwrap();
        server.join().unwrap();
        assert_eq!(response.status, EndpointStatus::Timeout);
        assert!(response.body.is_empty());
    }

    #[test]
    fn one_poll_commits_both_decoded_endpoints() {
        use crate::lmu::rest::{RestCache, RestStatus};
        use crate::quality::Field;
        use std::sync::atomic::{AtomicU64, Ordering};

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            for _ in 0..2 {
                let (mut socket, _) = listener.accept().unwrap();
                let request = read_request_line(&socket);
                let body: &[u8] = if request.starts_with("GET /rest/watch/standings ") {
                    br#"[{"player":true,"position":3,"lapsCompleted":8,"pitstops":1}]"#
                } else {
                    assert!(request.starts_with("GET /rest/watch/sessionInfo "));
                    br#"{"trackName":"A","session":"RACE1","numberOfVehicles":21,"currentEventTime":42}"#
                };
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                socket.write_all(header.as_bytes()).unwrap();
                socket.write_all(body).unwrap();
            }
        });
        let clock = AtomicU64::new(100);
        let mut cache = RestCache::default();
        let status = cache.poll_once(
            &Client::new(port),
            || clock.fetch_add(1, Ordering::Relaxed),
            || false,
            2_000_000_000,
        );
        server.join().unwrap();
        assert_eq!(status, Some(RestStatus::Live));
        assert_eq!(
            cache.standings.as_ref().unwrap().player_position,
            Field::observed(3)
        );
        assert_eq!(
            cache.session.as_ref().unwrap().source_time_ns,
            Field::observed(42_000_000_000)
        );
    }

    #[test]
    fn cancelled_poll_does_not_request_second_endpoint() {
        use crate::lmu::rest::RestCache;
        use std::sync::atomic::{AtomicUsize, Ordering};

        let (port, server) = serve_once("200 OK", br#"[{"player":true}]"#);
        let checks = AtomicUsize::new(0);
        let mut cache = RestCache::default();
        let status = cache.poll_once(
            &Client::new(port),
            || 100,
            || checks.fetch_add(1, Ordering::Relaxed) > 0,
            2_000_000_000,
        );
        assert_eq!(status, None);
        assert!(
            server
                .join()
                .unwrap()
                .starts_with("GET /rest/watch/standings ")
        );
        assert!(cache.session.is_none());
    }

    #[test]
    fn live_lmu_rest_endpoints_decode_full_grid() {
        use crate::lmu::rest::{decode_session_info, decode_standings};
        use crate::quality::Field;

        if std::env::var_os("VANTARE_LMU_LIVE_REST_TEST").is_none() {
            return;
        }
        let client = Client::default();
        let standings = client.fetch(Endpoint::Standings);
        assert_eq!(standings.status, EndpointStatus::Fresh);
        let standings_rows = serde_json::from_slice::<serde_json::Value>(&standings.body)
            .expect("live standings JSON");
        let standings_count = standings_rows.as_array().expect("standings array").len();
        let standings = decode_standings(&standings.body).expect("live standings decode");
        let session = client.fetch(Endpoint::SessionInfo);
        assert_eq!(session.status, EndpointStatus::Fresh);
        let session = decode_session_info(&session.body).expect("live sessionInfo decode");
        let Field::Present {
            value: vehicles, ..
        } = session.vehicle_count
        else {
            panic!("live REST has no vehicle count");
        };
        assert!(vehicles >= 46, "live REST has {vehicles} vehicles");
        assert_eq!(standings_count, usize::try_from(vehicles).unwrap());
        assert_eq!(standings.player_present, Field::observed(true));
        assert!(matches!(session.source_time_ns, Field::Present { value, .. } if value > 0));
        eprintln!("live LMU REST: {vehicles} vehicles, both endpoints decoded");
    }
}
