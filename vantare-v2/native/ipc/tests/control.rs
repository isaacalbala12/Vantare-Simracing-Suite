//! RPC real de derechos: mismo encuadre, identidad y nonce en ambos transportes.
#![cfg(any(windows, unix))]
use std::io;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use vantare_ipc::control::{self, Command, CoreLink, Policy, Request, Response, VERSION};
use vantare_ipc::transport::{Event, IO_TIMEOUT, Listener};

fn link(tag: &str) -> CoreLink {
    CoreLink {
        pipe: format!("vantare-control-{tag}-{}", std::process::id()),
        image: std::env::current_exe().expect("imagen"),
        nonce: "solo-para-prueba-no-es-una-credencial".into(),
    }
}
#[test]
fn request_preserves_the_nonce_and_checks_the_response_sequence() {
    for (tag, sequence) in [("ok", 1), ("bad-sequence", 2)] {
        let link = link(tag);
        let nonce = link.nonce.clone();
        let mut listener = Listener::new(
            &link.pipe,
            Arc::new(Event::new().expect("evento")),
            IO_TIMEOUT,
        )
        .expect("listener");
        let server = thread::spawn(move || {
            let mut pipe = listener.instance().expect("instancia");
            pipe.accept().expect("accept");
            let request: Request = control::read(&mut pipe).expect("request");
            assert_eq!(request.version, VERSION);
            assert_eq!(request.sequence, 1);
            assert_eq!(request.nonce, nonce);
            assert!(matches!(request.command, Command::Invalidate));
            control::write(
                &mut pipe,
                &Response {
                    version: VERSION,
                    sequence,
                    policy: Policy {
                        version: VERSION,
                        ..Policy::default()
                    },
                    error: None,
                },
            )
            .expect("response");
        });
        let result = control::request(&link, Command::Invalidate);
        if sequence == 1 {
            assert_eq!(result.expect("policy").version, VERSION);
        } else {
            assert_eq!(
                result.expect_err("secuencia inválida").kind(),
                io::ErrorKind::InvalidData
            );
        }
        server.join().expect("servidor");
    }
}
#[test]
fn wrong_server_image_is_rejected_before_sending_the_nonce() {
    let mut link = link("image");
    let mut listener = Listener::new(
        &link.pipe,
        Arc::new(Event::new().expect("evento")),
        IO_TIMEOUT,
    )
    .expect("listener");
    let server = thread::spawn(move || {
        let mut pipe = listener.instance().expect("instancia");
        pipe.accept().expect("accept");
        assert!(control::read::<Request>(&mut pipe).is_err());
    });
    link.image = "/imagen/que/no/existe".into();
    assert_eq!(
        control::request(&link, Command::Invalidate)
            .expect_err("imagen ajena")
            .kind(),
        io::ErrorKind::PermissionDenied
    );
    server.join().expect("servidor");
}
#[test]
fn initial_feed_failure_denies_and_cancellation_finishes_promptly() {
    let link = link("missing");
    let feed = control::Feed::connect(&link.pipe, link.image).expect("feed");
    assert!(feed.wait_initial(Duration::from_secs(10)));
    assert_eq!(feed.policy(), Policy::default());
    let started = std::time::Instant::now();
    drop(feed);
    assert!(started.elapsed() < Duration::from_secs(1));
}
