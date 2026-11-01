//! Pipes reales de QA: cancelación del arranque y del saludo, sin servicios ni red.
use super::*;
use std::sync::mpsc;
use vantare_ipc::transport::Listener;

#[test]
fn v16_v17_hello_mismatch_stops_before_policy_or_any_revocation_command() {
    assert_eq!(protocol::VERSION, 17, "step-7 envelope contract");
    for (reader, writer) in [(17, 16), (16, 17)] {
        let name = format!("hub-hello-{reader}-{writer}-{}", std::process::id());
        let stop = Arc::new(Event::new().expect("event"));
        let mut listener = Listener::new(
            &format!("{name}-hub-services"),
            stop,
            Duration::from_secs(5),
        )
        .expect("listener");
        let mut pipe = listener.instance().expect("pipe");
        let server = std::thread::spawn(move || {
            pipe.accept().expect("accept");
            control::write(
                &mut pipe,
                &SupervisorHello {
                    version: writer,
                    nonce: "1".repeat(64),
                },
            )
            .expect("hello");
            let result: std::io::Result<Request> = protocol::read(&mut pipe);
            assert_eq!(
                result
                    .err()
                    .expect("no command after incompatible hello")
                    .kind(),
                std::io::ErrorKind::UnexpectedEof
            );
        });
        let image = std::env::current_exe().expect("image");
        let result = if reader == protocol::VERSION {
            Client::start(&image, &name, Arc::new(Event::new().expect("client event"))).map(|_| ())
        } else {
            // Frozen v16 handshake from the step-6 client: inspect the same
            // hello shape/version before nonce, requests or nested Policy.
            let stop = Arc::new(Event::new().expect("legacy event"));
            let mut pipe = control::connect_ready(
                &format!("{name}-hub-services"),
                &stop,
                Duration::from_secs(5),
            )
            .expect("legacy connection");
            assert!(pipe.server_peer().expect("peer").is_image(&image));
            let hello: SupervisorHello = control::read(&mut pipe).expect("legacy hello decoder");
            if hello.version == reader {
                Ok(())
            } else {
                Err(RequestError::Version.message())
            }
        };
        assert_eq!(
            result,
            Err(RequestError::Version.message()),
            "{reader} vs {writer}"
        );
        server
            .join()
            .expect("no Policy decoded; no Logout/Invalidate sent");
    }
}

#[test]
fn nested_policy_generation_mismatch_is_a_version_error_before_its_strict_schema() {
    for version in [control::VERSION - 1, control::VERSION + 1] {
        let name = format!("hub-policy-version-{}-{version}", std::process::id());
        let stop = Arc::new(Event::new().expect("event"));
        let mut listener = Listener::new(
            &format!("{name}-hub-services"),
            stop,
            Duration::from_secs(5),
        )
        .expect("listener");
        let mut pipe = listener.instance().expect("pipe");
        let server = std::thread::spawn(move || {
            pipe.accept().expect("accept");
            control::write(
                &mut pipe,
                &SupervisorHello {
                    version: protocol::VERSION,
                    nonce: "1".repeat(64),
                },
            )
            .expect("hello");
            let request: Request = protocol::read(&mut pipe).expect("probe");
            assert!(matches!(request.command, Command::Probe));
            protocol::write(
                &mut pipe,
                &serde_json::json!({"version":protocol::VERSION,
                "sequence":request.sequence,"reply":{"result":"License","message":"legacy",
                "policy":{"version":version,"field_from_other_generation":true}}}),
            )
            .expect("response");
        });
        let image = std::env::current_exe().expect("image");
        let result = Client::start(&image, &name, Arc::new(Event::new().expect("client event")))
            .and_then(|mut client| client.request(Command::LicenseStatus));
        assert!(matches!(result, Err(vantare_ipc::INCOMPATIBLE_COMPONENTS)));
        server.join().expect("fixture closed");
    }
}

#[test]
fn first_request_after_an_idle_disconnect_reconnects_without_replaying_the_action() {
    let name = format!("hub-idle-reconnect-{}", std::process::id());
    let stop = Arc::new(Event::new().expect("server stop"));
    let mut listener = Listener::new(
        &format!("{name}-hub-services"),
        stop,
        Duration::from_secs(5),
    )
    .expect("listener");
    let first = listener.instance().expect("first pipe");
    let (close, closing) = mpsc::channel();
    let (closed, disconnected) = mpsc::channel();
    let server = std::thread::spawn(move || {
        let mut first = first;
        first.accept().expect("first connection");
        control::write(
            &mut first,
            &SupervisorHello {
                version: protocol::VERSION,
                nonce: "1".repeat(64),
            },
        )
        .expect("hello");
        closing
            .recv_timeout(Duration::from_secs(3))
            .expect("explicit idle expiry");
        drop(first);
        closed.send(()).expect("closed acknowledgement");
        let mut pipe = listener.instance().expect("reconnect pipe");
        pipe.accept().expect("reconnect");
        control::write(
            &mut pipe,
            &SupervisorHello {
                version: protocol::VERSION,
                nonce: "2".repeat(64),
            },
        )
        .expect("fresh hello");
        let request: Request = protocol::read(&mut pipe).expect("first user action");
        assert!(matches!(request.command, Command::LicenseRenew));
        assert_eq!(request.sequence, 1, "new connection uses a fresh sequence");
        protocol::write(
            &mut pipe,
            &Response {
                version: protocol::VERSION,
                sequence: request.sequence,
                reply: Reply::License {
                    policy: control::Policy {
                        version: control::VERSION,
                        revision: 1,
                        state: vantare_ipc::control::AccessState::Active,
                        ..control::Policy::default()
                    },
                    message: String::new(),
                },
            },
        )
        .expect("verified reply");
    });
    let image = std::env::current_exe().expect("peer image");
    let mut client = Client::start(&image, &name, Arc::new(Event::new().expect("client stop")))
        .expect("initial channel");
    close.send(()).expect("expire idle channel");
    disconnected
        .recv_timeout(Duration::from_secs(3))
        .expect("server closed before user action");
    assert!(
        matches!(client.request(Command::LicenseRenew), Ok(Reply::License { policy, .. }) if policy.state.permits_access())
    );
    server
        .join()
        .expect("no five minute sleep and no duplicate action");
}

#[test]
fn cancellation_is_available_before_an_absent_supervisor_connects() {
    let stop = Arc::new(Event::new().expect("evento"));
    stop.set();
    let (sent, received) = mpsc::channel();
    let thread = std::thread::spawn(move || {
        let image = std::env::current_exe().expect("imagen propia");
        sent.send(
            Client::start(
                &image,
                &format!("hub-cancel-absent-{}", std::process::id()),
                stop,
            )
            .is_err(),
        )
        .expect("resultado");
    });
    assert!(
        received
            .recv_timeout(Duration::from_secs(1))
            .expect("cancelar sin esperar 30 segundos")
    );
    thread.join().expect("worker terminó");
}

#[test]
fn cancellation_interrupts_a_peer_that_never_sends_hello() {
    let name = format!("hub-cancel-hello-{}", std::process::id());
    let server_stop = Arc::new(Event::new().expect("evento servidor"));
    let mut listener = Listener::new(
        &format!("{name}-hub-services"),
        server_stop.clone(),
        Duration::from_secs(5),
    )
    .expect("listener privado");
    let mut pipe = listener.instance().expect("instancia");
    let (accepted, connected) = mpsc::channel();
    let server_event = server_stop.clone();
    let server = std::thread::spawn(move || {
        pipe.accept().expect("conectar");
        accepted.send(()).expect("avisar");
        server_event.wait(Duration::from_secs(5));
    });
    let stop = Arc::new(Event::new().expect("evento cliente"));
    let client_stop = stop.clone();
    let (sent, received) = mpsc::channel();
    let client = std::thread::spawn(move || {
        let image = std::env::current_exe().expect("imagen propia");
        sent.send(Client::start(&image, &name, client_stop).is_err())
            .expect("resultado");
    });
    connected
        .recv_timeout(Duration::from_secs(2))
        .expect("peer conectado, sin saludo");
    stop.set();
    let result = received.recv_timeout(Duration::from_secs(1));
    // Limpiar también antes del assert fallido cuando se prueba la versión anterior.
    server_stop.set();
    server.join().expect("cerrar peer");
    client.join().expect("worker terminó");
    assert!(result.expect("cancelar saludo pendiente sin esperar 30 segundos"));
}

#[test]
fn dropping_a_connection_does_not_cancel_the_owner_or_poison_reconnect() {
    use std::io::Read;
    let name = format!("hub-cancel-reconnect-{}", std::process::id());
    let server_stop = Arc::new(Event::new().expect("evento servidor"));
    let mut listener = Listener::new(
        &format!("{name}-hub-services"),
        server_stop,
        Duration::from_secs(5),
    )
    .expect("listener");
    let first = listener.instance().expect("instancia inicial");
    let server = std::thread::spawn(move || {
        let mut first = Some(first);
        for _ in 0..2 {
            let mut pipe = first
                .take()
                .unwrap_or_else(|| listener.instance().expect("reconexión"));
            pipe.accept().expect("conectar");
            control::write(
                &mut pipe,
                &SupervisorHello {
                    version: protocol::VERSION,
                    nonce: "1".repeat(64),
                },
            )
            .expect("saludo");
            assert!(
                pipe.read_exact(&mut [0]).is_err(),
                "el cliente cierra su transporte"
            );
        }
    });
    let stop = Arc::new(Event::new().expect("evento propietario"));
    let image = std::env::current_exe().expect("imagen propia");
    for _ in 0..2 {
        drop(Client::start(&image, &name, stop.clone()).expect("conexión admitida"));
        assert!(!stop.is_set(), "solo el propietario cancela el worker");
    }
    server.join().expect("peer terminó");
}
#[test]
fn mismatched_service_hello_and_response_are_actionable_connection_errors() {
    for (hello_mismatch, cancel) in [(true, false), (false, false), (true, true), (false, true)] {
        let name = format!(
            "hub-version-1530-{}-{hello_mismatch}-{cancel}",
            std::process::id()
        );
        let server_stop = Arc::new(Event::new().expect("evento"));
        let mut listener = Listener::new(
            &format!("{name}-hub-services"),
            server_stop,
            Duration::from_secs(5),
        )
        .expect("listener");
        let mut pipe = listener.instance().expect("instancia");
        let server = std::thread::spawn(move || {
            pipe.accept().expect("conectar");
            control::write(
                &mut pipe,
                &SupervisorHello {
                    version: protocol::VERSION - u32::from(hello_mismatch),
                    nonce: "1".repeat(64),
                },
            )
            .expect("saludo");
            if !hello_mismatch {
                let request: Request = protocol::read(&mut pipe).expect("petición");
                assert!(
                    matches!(request.command, Command::Probe),
                    "version check precedes Cancel/Logout dispatch"
                );
                protocol::write(
                    &mut pipe,
                    // v15 Account has no Session. Version is checked before
                    // decoding the new strict shape, with no fabricated state.
                    &serde_json::json!({"version":protocol::VERSION - 1,
                        "sequence":request.sequence,"reply":{"result":"Account",
                        "signed_in":true,"pending":false,"expires_at":1000,
                        "message":"old generation","error":null}}),
                )
                .expect("respuesta incompatible");
            }
        });
        let image = std::env::current_exe().expect("imagen");
        let stop = Arc::new(Event::new().expect("evento cliente"));
        let result = Client::start(&image, &name, stop).and_then(|mut client| {
            client.request(if cancel {
                Command::AccountCancel
            } else {
                Command::Status
            })
        });
        assert!(matches!(result, Err(vantare_ipc::INCOMPATIBLE_COMPONENTS)));
        server.join().expect("cerrar peer");
    }
}

#[test]
fn a_lost_purchase_response_returns_an_error_without_sending_the_action_again() {
    let name = format!(
        "hub-lost-action-{}",
        vantare_services::random_id().expect("pipe")
    );
    let server_stop = Arc::new(Event::new().expect("server stop"));
    let mut listener = Listener::new(
        &format!("{name}-hub-services"),
        Arc::clone(&server_stop),
        RESPONSE_IO_TIMEOUT,
    )
    .expect("listener");
    let first = listener.instance().expect("first");
    let (actions, observed) = mpsc::channel();
    let (closed, closure) = mpsc::channel();
    let server = std::thread::spawn(move || {
        let mut first = Some(first);
        for sequence in 0..2 {
            let mut pipe = first
                .take()
                .unwrap_or_else(|| listener.instance().expect("next"));
            if pipe.accept().is_err() {
                break;
            }
            protocol::write(
                &mut pipe,
                &SupervisorHello {
                    version: protocol::VERSION,
                    nonce: "1".repeat(64),
                },
            )
            .expect("hello");
            let probe: Request = protocol::read(&mut pipe).expect("probe");
            assert!(matches!(probe.command, Command::Probe));
            protocol::write(
                &mut pipe,
                &Response {
                    version: protocol::VERSION,
                    sequence: probe.sequence,
                    reply: Reply::Status {
                        account_configured: false,
                        message: String::new(),
                    },
                },
            )
            .expect("probe ACK");
            let action: Request = protocol::read(&mut pipe).expect("action");
            assert!(matches!(action.command, Command::Purchase { .. }));
            actions.send(sequence).expect("action observed");
            // Publish a state transition, not a wall-clock deadline. The error
            // must accompany a real peer close after Purchase was received.
            drop(pipe);
            closed.send(sequence).expect("peer close observed");
        }
    });
    let image = std::env::current_exe().expect("image");
    let mut client =
        Client::start(&image, &name, Arc::new(Event::new().expect("cancel"))).expect("client");
    // Completion is ordered by the real EOF after the peer observes Purchase.
    // A separate recv_timeout would measure CPU scheduling, not replay safety.
    // The real client's transport/cancellation guard remains active.
    let result = client.request(Command::Purchase {
        product: protocol::BillingProduct::ProMonthly,
    });
    assert_eq!(
        closure.recv().expect("peer closed after receiving action"),
        0
    );
    server_stop.set();
    server.join().expect("server exits");
    assert!(result.is_err());
    assert_eq!(observed.try_iter().collect::<Vec<_>>(), vec![0]);
}
