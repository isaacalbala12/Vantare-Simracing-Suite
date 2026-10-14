//! Rechazos reales por IPC: diagnóstico local sin contenido de la petición.
#![cfg(windows)]

use std::{path::PathBuf, process::Command, sync::Arc, time::Duration};
use vantare_ipc::{control, transport::Event};
use vantare_runtime::{
    rights::{Devices, host},
    services,
};
use vantare_services::protocol;

const PRIVATE: &str = "private-test-payload-must-not-be-logged";

#[test]
fn rejected_rights_and_services_requests_report_sanitized_local_diagnostics() {
    const CHILD: &str = "VANTARE_TEST_IPC_DIAGNOSTICS";
    if std::env::var_os(CHILD).is_none() {
        let output = Command::new(std::env::current_exe().expect("test"))
            .args([
                "--exact",
                "rejected_rights_and_services_requests_report_sanitized_local_diagnostics",
                "--nocapture",
            ])
            .env(CHILD, "1")
            .output()
            .expect("subproceso IPC");
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(output.status.success(), "{stderr}");
        assert!(
            stderr.contains("canal de derechos cerrado: InvalidData"),
            "{stderr}"
        );
        assert!(
            stderr.contains("canal de derechos cerrado: PermissionDenied"),
            "{stderr}"
        );
        assert!(
            stderr.contains("canal de servicios cerrado: PermissionDenied"),
            "{stderr}"
        );
        assert!(!stderr.contains(PRIVATE), "no registrar datos del peer");
        return;
    }
    exercise_rejected_requests();
}

fn exercise_rejected_requests() {
    let photo = format!("vantare-diagnostics-{}", std::process::id());
    let stop = Arc::new(Event::new().expect("evento"));
    let rights = host::Host::start(
        &photo,
        host::Options {
            root: std::env::temp_dir().join(&photo),
            keys: None, // No abrir credenciales ni almacenes reales.
            devices: Devices {
                legacy: String::new(),
                installation: String::new(),
            },
            epoch: 1,
            nonce: Some("expected-test-nonce".into()),
        },
        |_, _| true,
    )
    .expect("host derechos");
    for (version, sequence, command) in [
        (control::VERSION + 1, 1, control::Command::Read),
        (control::VERSION, 2, control::Command::Read),
        (
            control::VERSION,
            1,
            control::Command::Install {
                credential: PRIVATE.into(),
            },
        ),
    ] {
        let mut pipe =
            control::connect_ready(&control::pipe_name(&photo), &stop, Duration::from_secs(5))
                .expect("derechos");
        control::write(
            &mut pipe,
            &control::Request {
                version,
                sequence,
                nonce: PRIVATE.into(),
                command,
            },
        )
        .expect("petición inválida");
        assert!(
            control::read::<control::Response>(&mut pipe).is_err(),
            "rechazo sin conceder derechos"
        );
    }
    drop(rights); // Espera a los workers antes de comprobar stderr.

    let supervisor = services::Host::start_with_peer(
        &photo,
        services::Options {
            binary: PathBuf::from("never-start-services"),
            hub: std::env::current_exe().expect("imagen test"),
            core: control::CoreLink {
                pipe: "never-connect-core".into(),
                image: PathBuf::new(),
                nonce: String::new(),
            },
            root: None,
        },
        |_, _| true,
    )
    .expect("supervisor");
    for bad in 0..3 {
        let mut pipe =
            control::connect_ready(&services::pipe_name(&photo), &stop, Duration::from_secs(5))
                .expect("servicios");
        let hello: protocol::SupervisorHello = protocol::read(&mut pipe).expect("saludo");
        protocol::write(
            &mut pipe,
            &protocol::Request {
                version: protocol::VERSION + u32::from(bad == 0),
                sequence: if bad == 1 { 2 } else { 1 },
                nonce: if bad == 2 {
                    PRIVATE.into()
                } else {
                    hello.nonce
                },
                command: protocol::Command::Shutdown,
            },
        )
        .expect("petición inválida");
        assert!(
            protocol::read::<protocol::Response>(&mut pipe).is_err(),
            "rechazo de protocolo"
        );
    }
    drop(supervisor);
}
