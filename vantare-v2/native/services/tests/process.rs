#![cfg(windows)]

// Misma fuente del cliente Hub, sin copiar DTO ni añadir dependencias al Hub.
#[allow(dead_code)] // El test usa el cliente, no la ubicación instalada del binario.
#[path = "../../hub/src/services/mod.rs"]
mod hub_services;

use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::Duration;
use vantare_ipc::transport::{Event, connect};
use vantare_services::protocol::{self, Command as RequestCommand, Request};

#[test]
fn actual_process_accepts_its_parent_and_rejects_false_peer_or_nonce() {
    let binary = Path::new(env!("CARGO_BIN_EXE_vantare-services"));
    let mut client = hub_services::client::Client::start(binary).expect("servicio propio");
    assert!(matches!(
        client
            .request(hub_services::protocol::Command::Status)
            .expect("status"),
        hub_services::protocol::Reply::Status {
            account_configured: false,
            ..
        }
    ));
    drop(client);

    for wrong_peer in [true, false] {
        let name = format!(
            "vantare-services-test-{}",
            vantare_services::random_id().expect("test")
        );
        let parent = std::env::current_exe().expect("imagen test");
        let parent_pid = if wrong_peer { 0 } else { std::process::id() };
        let mut child = Command::new(binary)
            .arg(&name)
            .arg(parent_pid.to_string())
            .arg(parent)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("proceso test");
        let mut nonce = String::new();
        BufReader::new(child.stdout.take().expect("bootstrap").take(65))
            .read_line(&mut nonce)
            .expect("bootstrap");
        assert_eq!(nonce.trim().len(), 64);
        let stop = Arc::new(Event::new().expect("event"));
        let mut pipe = connect(&name, stop, Duration::from_secs(2)).expect("pipe test");
        let sent = protocol::write(
            &mut pipe,
            &Request {
                version: protocol::VERSION,
                sequence: 1,
                nonce: "wrong-bootstrap".into(),
                command: RequestCommand::Status,
            },
        );
        if !wrong_peer {
            sent.expect("request test");
        }
        assert!(protocol::read::<vantare_services::protocol::Response>(&mut pipe).is_err());
        assert!(!child.wait().expect("servicio rechaza par").success());
    }
}
