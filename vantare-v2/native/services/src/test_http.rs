//! Servidor de prueba local. Sin red real, sleep ni claves/credenciales reales.
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc::{self, Receiver};
use std::thread::JoinHandle;
use std::time::Duration;
use url::Url;

pub struct Server {
    pub base: Url,
    pub requests: Receiver<String>,
    thread: JoinHandle<()>,
}

impl Server {
    pub fn start(responses: Vec<(u16, String)>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("servidor test");
        let base = Url::parse(&format!(
            "http://{}/",
            listener.local_addr().expect("puerto test")
        ))
        .expect("URL test");
        let (tx, requests) = mpsc::channel();
        let thread = std::thread::spawn(move || {
            for (status, body) in responses {
                let (mut socket, _) = listener.accept().expect("aceptar test");
                socket
                    .set_read_timeout(Some(Duration::from_secs(3)))
                    .expect("plazo test");
                let mut bytes = Vec::new();
                let header_end = loop {
                    let mut byte = [0];
                    socket.read_exact(&mut byte).expect("cabecera test");
                    bytes.push(byte[0]);
                    assert!(bytes.len() < 64 * 1024);
                    if bytes.ends_with(b"\r\n\r\n") {
                        break bytes.len();
                    }
                };
                let headers = String::from_utf8_lossy(&bytes).to_lowercase();
                let len = headers
                    .lines()
                    .find_map(|line| {
                        line.strip_prefix("content-length:")
                            .and_then(|value| value.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                assert!(len < 128 * 1024);
                bytes.resize(header_end + len, 0);
                socket
                    .read_exact(&mut bytes[header_end..])
                    .expect("body test");
                tx.send(String::from_utf8(bytes).expect("request test"))
                    .expect("capture test");
                write!(socket, "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{body}", body.len()).expect("response test");
            }
        });
        Self {
            base,
            requests,
            thread,
        }
    }

    pub fn finish(self) {
        self.thread.join().expect("servidor termina");
    }
}

#[test]
fn http_does_not_retry_mutations_or_follow_redirects_and_bounds_response() {
    use crate::{
        Error,
        http::{Http, RESPONSE_LIMIT},
    };
    let server = Server::start(vec![
        (403, "{}".into()),
        (302, "{}".into()),
        (
            200,
            "x".repeat(usize::try_from(RESPONSE_LIMIT).expect("límite test") + 1),
        ),
    ]);
    let http = Http::default();
    assert!(matches!(
        http.post_json(&server.base, &serde_json::json!({}), None, None)
            .expect("HTTP")
            .success(),
        Err(Error::Denied)
    ));
    assert_eq!(
        http.get(&server.base, None, None).expect("HTTP").status,
        302
    );
    assert!(matches!(
        http.get(&server.base, None, None),
        Err(Error::TooLarge)
    ));
    for _ in 0..3 {
        server
            .requests
            .recv_timeout(Duration::from_secs(3))
            .expect("una petición por operación");
    }
    server.finish();
}
