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

    /// Cuerpo de la respuesta, o `None` si no hay una utilizable: juego cerrado,
    /// plazo vencido, código de error o redirección, cuerpo vacío o demasiado
    /// grande. Ninguna causa cambia qué hace el llamante, así que no se distinguen.
    pub(super) fn fetch(&self, endpoint: Endpoint) -> Option<Vec<u8>> {
        let url = format!("http://127.0.0.1:{}{}", self.port, endpoint.path());
        let mut response = self.agent.get(url).call().ok()?;
        if !response.status().is_success() {
            return None;
        }
        let mut body = Vec::new();
        let limit = (MAX_RESPONSE_BYTES + 1) as u64;
        response
            .body_mut()
            .as_reader()
            .take(limit)
            .read_to_end(&mut body)
            .ok()?;
        (body.len() <= MAX_RESPONSE_BYTES && !body.iter().all(u8::is_ascii_whitespace))
            .then_some(body)
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
        assert_eq!(
            Client::new(port).fetch(Endpoint::Standings),
            Some(b"[]".to_vec())
        );
        assert!(
            server
                .join()
                .unwrap()
                .starts_with("GET /rest/watch/standings ")
        );

        let (port, server) = serve_once("404 Not Found", b"missing");
        assert_eq!(Client::new(port).fetch(Endpoint::SessionInfo), None);
        assert!(
            server
                .join()
                .unwrap()
                .starts_with("GET /rest/watch/sessionInfo ")
        );

        let (port, server) = serve_once("200 OK", &vec![b'x'; MAX_RESPONSE_BYTES + 1]);
        assert_eq!(Client::new(port).fetch(Endpoint::Standings), None);
        server.join().unwrap();

        let (port, server) = serve_once("200 OK", b"  \n");
        assert_eq!(Client::new(port).fetch(Endpoint::Standings), None);
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
        assert_eq!(Client::new(port).fetch(Endpoint::Standings), None);
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
        assert_eq!(response, None);
    }

    #[test]
    fn a_closed_port_gives_no_response() {
        let port = {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            listener.local_addr().unwrap().port()
        };
        assert_eq!(Client::new(port).fetch(Endpoint::Standings), None);
    }

    /// Prueba física opt-in: `cargo test -- --ignored live_lmu_rest` con LMU en pista.
    #[test]
    #[ignore = "requiere LMU en marcha con su REST en 127.0.0.1:6397"]
    fn live_lmu_rest_endpoints_decode() {
        let client = Client::default();
        let standings = client.fetch(Endpoint::Standings).expect("standings");
        assert!(
            !super::super::decode_standings(&standings)
                .unwrap()
                .is_empty()
        );
        let session = client.fetch(Endpoint::SessionInfo).expect("sessionInfo");
        assert!(super::super::decode_session_info(&session).is_ok());
    }
}
