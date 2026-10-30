#![cfg(all(any(windows, unix), feature = "network"))]

// Cliente del supervisor: el Hub ya no posee ni arranca hijos.
use vantare_services::process as hub_client;

use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::Duration;
use vantare_ipc::transport::{Event, connect};
use vantare_services::protocol::{self, Command as RequestCommand, Request};

fn isolated_core() -> vantare_ipc::control::CoreLink {
    let id = vantare_services::random_id().expect("instancia test");
    #[cfg(windows)]
    let photo = format!("vantare-services-test-{id}");
    #[cfg(unix)]
    let photo = format!("vs-{}", &id[..12]);
    // Status no consulta el núcleo: el enlace solo aísla el endpoint del auxiliar
    // y ejercita el mismo bootstrap privado que utiliza el supervisor.
    vantare_ipc::control::CoreLink {
        pipe: vantare_ipc::control::pipe_name(&photo),
        image: std::env::current_exe().expect("imagen test"),
        nonce: vantare_services::random_id().expect("bootstrap test"),
    }
}

#[test]
fn actual_process_accepts_its_parent_and_rejects_false_peer_or_nonce() {
    let binary = Path::new(env!("CARGO_BIN_EXE_vantare-services"));
    let mut client =
        hub_client::Client::start_managed(binary, None, &isolated_core()).expect("servicio propio");
    assert!(matches!(
        client.request(protocol::Command::Status).expect("status"),
        protocol::Reply::Status {
            account_configured: false,
            ..
        }
    ));
    drop(client);

    for wrong_peer in [true, false] {
        let id = vantare_services::random_id().expect("test");
        #[cfg(windows)]
        let name = format!("vantare-services-test-{id}");
        #[cfg(unix)]
        let name = format!("vs-{}", &id[..12]);
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
        match connect(&name, stop, Duration::from_secs(2)) {
            Ok(mut pipe) => {
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
            }
            // El hijo puede rechazar al padre y salir antes de que connect
            // identifique su imagen (/proc/<pid>/exe en Linux).
            Err(error) if wrong_peer && error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => panic!("pipe test: {error}"),
        }
        assert!(!child.wait().expect("servicio rechaza par").success());
    }
}

#[test]
fn helper_exits_successfully_on_peer_eof_without_a_protocol_error_in_its_log() {
    let id = vantare_services::random_id().expect("fixture id");
    let name = format!("clean-helper-{}", &id[..12]);
    let root = std::env::temp_dir().join(format!("clean-helper-{id}"));
    let mut child = Command::new(env!("CARGO_BIN_EXE_vantare-services"))
        .arg(&name)
        .arg(std::process::id().to_string())
        .arg(std::env::current_exe().expect("parent image"))
        .arg(&root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("helper");
    let mut nonce = String::new();
    BufReader::new(child.stdout.take().expect("bootstrap").take(65))
        .read_line(&mut nonce)
        .expect("ready signal");
    let stop = Arc::new(Event::new().expect("event"));
    let pipe = connect(&name, stop, Duration::from_secs(2)).expect("parent pipe");
    // Child::wait_with_output closes its stdin. Hold it independently so only
    // the RPC peer EOF, rather than parent cancellation, ends this session.
    let parent_lifetime = child.stdin.take().expect("parent lifetime");
    drop(pipe); // Explicit peer EOF, no wall-clock wait for the idle deadline.
    let output = child.wait_with_output().expect("clean helper exit");
    drop(parent_lifetime);
    assert!(output.status.success());
    let log = String::from_utf8_lossy(&output.stderr);
    assert!(log.contains("services-disconnected"), "{log}");
    assert!(
        !log.contains("services-protocol-invalid") && !log.contains("services-channel "),
        "{log}"
    );
    if root.exists() {
        std::fs::remove_dir_all(root).expect("private fixture cleanup");
    }
}

#[test]
fn occupied_endpoint_rejects_second_child_and_keeps_owner_usable() {
    let binary = Path::new(env!("CARGO_BIN_EXE_vantare-services"));
    let core = isolated_core();
    let mut owner =
        hub_client::Client::start_managed(binary, None, &core).expect("servicio propio");
    assert!(hub_client::Client::start_managed(binary, None, &core).is_err());
    assert!(matches!(
        owner
            .request(RequestCommand::Status)
            .expect("dueño intacto"),
        protocol::Reply::Status { .. }
    ));
    drop(owner);
    let mut replacement =
        hub_client::Client::start_managed(binary, None, &core).expect("endpoint recuperado");
    assert!(matches!(
        replacement
            .request(RequestCommand::Status)
            .expect("nuevo dueño"),
        protocol::Reply::Status { .. }
    ));
}
