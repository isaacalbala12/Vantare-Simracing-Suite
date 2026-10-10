//! Named pipe Win32 real; datos sintéticos explícitos, sin simulador ni audio.
#![allow(clippy::unwrap_used)]
use super::{
    Cursor, Delivery, GapReason, RecordingStatus, client::EventClient, host::EventHost,
    tests::TestFile,
};
use crate::core::Core;
use std::sync::Arc;
use std::time::Duration;
use vantare_domain::{Car, CarId, Observation, Player, Quality, State};

fn photo(tick: u64) -> Observation {
    let mut photo = Observation {
        state: State {
            player: Some(Player {
                car: CarId(7),
                ..Player::default()
            }),
            cars: vec![Car {
                id: CarId(7),
                laps: Quality::Reliable(u32::try_from(tick - 1).unwrap()),
                ..Car::default()
            }],
            source_state: vantare_domain::SourceState::Live,
            ..State::default()
        },
        ..Observation::default()
    };
    photo.origin.received_at = Duration::from_millis(tick);
    photo
}
fn next(client: &EventClient) -> super::wire::Frame {
    client
        .next(Duration::from_secs(10))
        .unwrap()
        .expect("frame dentro del plazo")
}
fn advance(host: &mut EventHost, core: &mut Core, tick: u64) {
    core.observe(photo(tick)).unwrap();
    host.publish(Arc::clone(&core.snapshot()), core.events());
}
#[test]
fn server_rejects_ack_ahead_and_cancels_a_peer_waiting_without_ack() {
    use super::wire;
    use vantare_ipc::transport::{self, Event as Cancel, IO_TIMEOUT};
    let name = format!("vantare-events-ack-{}", std::process::id());
    let host = EventHost::start(&name, 1, None, |_| true).unwrap();
    let stop = Arc::new(Cancel::new().unwrap());
    let mut pipe = transport::connect(&name, Arc::clone(&stop), IO_TIMEOUT).unwrap();
    wire::write_hello(&mut pipe, None).unwrap();
    let frame = wire::read_frame(&mut pipe).unwrap().unwrap();
    wire::write_ack(
        &mut pipe,
        Cursor {
            epoch: frame.tail.epoch,
            index: frame.tail.index + 1,
        },
    )
    .unwrap();
    assert!(
        !matches!(wire::read_frame(&mut pipe), Ok(Some(_))),
        "ACK adelantado cierra conexión"
    );
    drop(pipe);
    let mut pipe = transport::connect(&name, stop, IO_TIMEOUT).unwrap();
    wire::write_hello(&mut pipe, None).unwrap();
    assert!(wire::read_frame(&mut pipe).unwrap().is_some());
    let began = std::time::Instant::now();
    drop(host); // Consumidor conectado sin ACK: cancelación Win32, no esperar 5 s.
    assert!(began.elapsed() < Duration::from_secs(2));
}
#[test]
fn real_pipe_checkpoints_reconnects_recording_switches_and_declares_slow_consumer_gap() {
    let name = format!("vantare-events-integration-{}", std::process::id());
    let file = TestFile::new();
    let image = std::env::current_exe().unwrap();
    let mut host = EventHost::start(&name, 1, None, {
        let image = image.clone();
        move |peer| peer.is_image(&image)
    })
    .unwrap();
    let mut core = Core::with_event_base(host.base()).unwrap();
    advance(&mut host, &mut core, 1);
    let client = EventClient::connect(&name, Some(Cursor { epoch: 1, index: 0 }), {
        let image = image.clone();
        move |peer| peer.is_image(&image)
    })
    .unwrap();
    let frame = next(&client);
    assert_eq!(frame.recording, RecordingStatus::Disabled);
    assert!(frame.delivery.is_none() && !file.0.exists());
    client.ack(frame.tail).unwrap();
    host.set_recording(Some(&file.0)).unwrap();
    advance(&mut host, &mut core, 2);
    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    let saved = loop {
        assert!(std::time::Instant::now() < deadline, "evento 1 no llegó");
        let frame = next(&client);
        let cursor = match frame.delivery {
            Some(Delivery::Fact(f)) => {
                assert_eq!(f.cursor.index, 1);
                assert_eq!(frame.recording, RecordingStatus::Active);
                assert_eq!(frame.durable, Some(f.cursor));
                f.cursor
            }
            None => frame.tail,
            other => panic!("{other:?}"),
        };
        client.ack(cursor).unwrap();
        if cursor.index == 1 {
            break cursor;
        }
    };
    drop(client);
    let prefix = std::fs::read(&file.0).unwrap();
    host.set_recording(None).unwrap();
    advance(&mut host, &mut core, 3);
    let client =
        EventClient::connect(&name, Some(saved), move |peer| peer.is_image(&image)).unwrap();
    let frame = loop {
        let frame = next(&client);
        if frame.delivery.is_some() {
            break frame;
        }
        client.ack(frame.tail).unwrap();
    };
    assert!(matches!(frame.delivery, Some(Delivery::Fact(f)) if f.cursor.index == 2));
    assert_eq!(frame.recording, RecordingStatus::Disabled);
    assert_eq!(std::fs::read(&file.0).unwrap(), prefix);
    // Sin ACK: el servidor no adelanta la entrega. Adquisición sigue avanzando.
    for tick in 4..=600 {
        advance(&mut host, &mut core, tick);
    }
    assert_eq!(core.snapshot().sequence, 600);
    client.ack(Cursor { epoch: 1, index: 2 }).unwrap();
    let frame = next(&client);
    assert!(
        matches!(frame.delivery, Some(Delivery::Gap { reason: GapReason::Retention, resume_at }) if resume_at == frame.tail)
    );
    client.ack(frame.tail).unwrap();
    drop(client); // Cancelar también cuando el servidor espera ACK/read.
    drop(host);
}
