//! Transporte REST solo a `127.0.0.1`. El host y el esquema son fijos: nadie
//! puede redirigir la adquisición fuera de la máquina.

use std::io::Read;
use std::time::Duration;

use super::MAX_RESPONSE_BYTES;

const DEFAULT_PORT: u16 = 6397;
const DEADLINE: Duration = Duration::from_millis(750);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum Endpoint {
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(in crate::adapter::lmu) enum Status {
    Fresh,
    Empty,
    Unsupported,
    Offline,
    Timeout,
    Malformed,
}

#[derive(Debug, PartialEq)]
pub(in crate::adapter::lmu) struct Response {
    pub status: Status,
    /// Vacío salvo con `Status::Fresh`.
    pub body: Vec<u8>,
}

impl Response {
    fn without_body(status: Status) -> Self {
        Self {
            status,
            body: Vec::new(),
        }
    }
}

pub(super) struct Client {
    agent: ureq::Agent,
    port: u16,
}

impl Default for Client {
    fn default() -> Self {
        Self::new(DEFAULT_PORT)
    }
}

impl Client {
    /// El puerto es inyectable para probar contra un servidor local aislado.
    pub(super) fn new(port: u16) -> Self {
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

    pub(super) fn fetch(&self, endpoint: Endpoint) -> Response {
        let url = format!("http://127.0.0.1:{}{}", self.port, endpoint.path());
        let mut response = match self.agent.get(url).call() {
            Ok(response) => response,
            Err(ureq::Error::Timeout(_)) => return Response::without_body(Status::Timeout),
            Err(_) => return Response::without_body(Status::Offline),
        };
        match response.status().as_u16() {
            404 | 405 | 501 => return Response::without_body(Status::Unsupported),
            500..=599 => return Response::without_body(Status::Offline),
            200..=299 => {}
            _ => return Response::without_body(Status::Malformed),
        }
        let mut body = Vec::new();
        let limit = (MAX_RESPONSE_BYTES + 1) as u64;
        match response
            .body_mut()
            .as_reader()
            .take(limit)
            .read_to_end(&mut body)
        {
            Ok(_) if body.iter().all(u8::is_ascii_whitespace) => {
                Response::without_body(Status::Empty)
            }
            Ok(_) if body.len() > MAX_RESPONSE_BYTES => Response::without_body(Status::Malformed),
            Ok(_) => Response {
                status: Status::Fresh,
                body,
            },
            Err(error) if error.kind() == std::io::ErrorKind::TimedOut => {
                Response::without_body(Status::Timeout)
            }
            Err(_) => Response::without_body(Status::Offline),
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
    fn fetches_only_the_fixed_loopback_endpoint_and_keeps_the_body_bounded() {
        let (port, server) = serve_once("200 OK", b"[]");
        let response = Client::new(port).fetch(Endpoint::Standings);
        assert_eq!(response.status, Status::Fresh);
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
            Status::Unsupported
        );
        assert!(
            server
                .join()
                .unwrap()
                .starts_with("GET /rest/watch/sessionInfo ")
        );

        let (port, server) = serve_once("200 OK", &vec![b'x'; MAX_RESPONSE_BYTES + 1]);
        let response = Client::new(port).fetch(Endpoint::Standings);
        assert_eq!(response, Response::without_body(Status::Malformed));
        server.join().unwrap();

        let (port, server) = serve_once("200 OK", b"  \n");
        assert_eq!(
            Client::new(port).fetch(Endpoint::Standings).status,
            Status::Empty
        );
        server.join().unwrap();
    }

    #[test]
    fn redirects_are_rejected_without_following_location() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            read_request_line(&socket);
            socket
                .write_all(b"HTTP/1.1 302 Found\r\nLocation: http://example.com/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                .unwrap();
        });
        let response = Client::new(port).fetch(Endpoint::Standings);
        assert_eq!(response.status, Status::Malformed);
        server.join().unwrap();
    }

    #[test]
    fn a_stalled_server_hits_the_request_deadline() {
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
        assert_eq!(response, Response::without_body(Status::Timeout));
    }

    #[test]
    fn a_closed_port_is_not_fresh() {
        let port = {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            listener.local_addr().unwrap().port()
        };
        // Windows reintenta el SYN a un puerto cerrado de loopback ~2 s, más que
        // el plazo: allí se ve `Timeout`; en otros sistemas, `Offline`.
        let response = Client::new(port).fetch(Endpoint::Standings);
        assert!(matches!(response.status, Status::Offline | Status::Timeout));
        assert!(response.body.is_empty());
    }

    /// Prueba física opt-in: `cargo test -- --ignored live_lmu_rest` con LMU en pista.
    #[test]
    #[ignore = "requiere LMU en marcha con su REST en 127.0.0.1:6397"]
    fn live_lmu_rest_endpoints_decode() {
        let client = Client::default();
        let standings = client.fetch(Endpoint::Standings);
        assert_eq!(standings.status, Status::Fresh);
        assert!(
            !super::super::decode_standings(&standings.body)
                .unwrap()
                .is_empty()
        );
        let session = client.fetch(Endpoint::SessionInfo);
        assert_eq!(session.status, Status::Fresh);
        assert!(super::super::decode_session_info(&session.body).is_ok());
    }
}
