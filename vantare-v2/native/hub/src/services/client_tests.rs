//! Pipes reales de QA: cancelación del arranque y del saludo, sin servicios ni red.
use super::*;
use std::sync::mpsc;
use vantare_ipc::transport::Listener;

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
    for hello_mismatch in [true, false] {
        let name = format!("hub-version-1530-{}-{hello_mismatch}", std::process::id());
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
                protocol::write(
                    &mut pipe,
                    &Response {
                        version: protocol::VERSION - 1,
                        sequence: request.sequence,
                        reply: Reply::Closed,
                    },
                )
                .expect("respuesta incompatible");
            }
        });
        let image = std::env::current_exe().expect("imagen");
        let stop = Arc::new(Event::new().expect("evento cliente"));
        let result = Client::start(&image, &name, stop)
            .and_then(|mut client| client.request(Command::Status));
        assert!(matches!(result, Err(vantare_ipc::INCOMPATIBLE_COMPONENTS)));
        server.join().expect("cerrar peer");
    }
}
