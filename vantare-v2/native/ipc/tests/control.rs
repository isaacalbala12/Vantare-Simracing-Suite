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

// Servidor de QA en otro proceso: la fixture solo se activa en el hijo de este test.
#[test]
fn old_contract_server_child() {
    let Ok(pipe_name) = std::env::var("VANTARE_IPC_VERSION_TEST_PIPE") else {
        return;
    };
    let mut listener = Listener::new(
        &pipe_name,
        Arc::new(Event::new().expect("evento")),
        IO_TIMEOUT,
    )
    .expect("listener");
    let mut pipe = listener.instance().expect("instancia");
    pipe.accept().expect("cliente");
    let request: Request = control::read(&mut pipe).expect("petición");
    assert_eq!(request.version, VERSION);
    control::write(
        &mut pipe,
        &Response {
            version: VERSION - 1,
            sequence: 1,
            policy: Policy {
                version: VERSION - 1,
                ..Policy::default()
            },
            error: None,
        },
    )
    .expect("respuesta de versión antigua");
}

#[test]
fn distinct_process_contract_versions_fail_explicitly_and_the_feed_shows_the_error() {
    for (tag, feed) in [("version-rpc", false), ("version-feed", true)] {
        let mut link = link(tag);
        let photo = link.pipe.clone();
        if feed {
            link.pipe = control::pipe_name(&photo);
        }
        let child = std::process::Command::new(&link.image)
            .args(["--exact", "old_contract_server_child", "--nocapture"])
            .env("VANTARE_IPC_VERSION_TEST_PIPE", &link.pipe)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .expect("servidor en otro proceso");
        let mut child = ChildGuard(child);
        if feed {
            let feed = control::Feed::connect(&photo, link.image.clone()).expect("feed");
            assert!(feed.wait_initial(Duration::from_secs(10)));
            let policy = feed.policy();
            assert!(
                policy.error.is_some(),
                "el error de versión debe llegar a la UI"
            );
            assert!(!policy.current());
            assert!(!policy.tester && !policy.overlays_advanced);
        } else {
            let error = control::request(&link, Command::Read).expect_err("versiones distintas");
            assert_eq!(error.kind(), io::ErrorKind::InvalidData);
            assert!(error.get_ref().is_some_and(
                <dyn std::error::Error + Send + Sync + 'static>::is::<control::VersionMismatch>
            ));
        }
        assert!(child.0.wait().expect("cerrar servidor").success());
    }
}

// Recolecta solo el servidor hijo de esta prueba, también si una aserción falla.
struct ChildGuard(std::process::Child);
impl Drop for ChildGuard {
    fn drop(&mut self) {
        if matches!(self.0.try_wait(), Ok(Some(_))) {
            return;
        }
        if let Err(error) = self.0.kill() {
            eprintln!("cerrar servidor QA: {error}");
        }
        if let Err(error) = self.0.wait() {
            eprintln!("recolectar servidor QA: {error}");
        }
    }
}
