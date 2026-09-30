//! Publicador y suscriptor sobre un named pipe real, cada uno en sus hilos.

#![cfg(windows)]

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use vantare_domain::{Quality, Snapshot};
use vantare_ipc::{Error, Peer, Publisher, Subscriber};

const WAIT: Duration = Duration::from_secs(10);

fn unique_name(tag: &str) -> String {
    static NEXT: AtomicU32 = AtomicU32::new(0);
    format!(
        "vantare-it-{tag}-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    )
}

fn snapshot(epoch: u64, sequence: u64) -> Arc<Snapshot> {
    let mut snapshot = Snapshot {
        epoch,
        sequence,
        ..Snapshot::default()
    };
    snapshot.state.session.track_name = Quality::Reliable(format!("pista {epoch}/{sequence}"));
    Arc::new(snapshot)
}

fn revision(snapshot: &Snapshot) -> (u64, u64) {
    (snapshot.epoch, snapshot.sequence)
}

fn any_peer(_: &Peer) -> bool {
    true
}

/// Lo siguiente que entregue el suscriptor, o falla si tarda demasiado.
fn next(subscriber: &mut Subscriber) -> (u64, u64) {
    revision(
        &subscriber
            .next(WAIT)
            .expect("el suscriptor debía recibir una foto"),
    )
}

#[test]
fn snapshots_arrive_in_order() {
    let name = unique_name("basic");
    let mut publisher = Publisher::new(&name, any_peer).unwrap();
    let mut subscriber = Subscriber::connect(&name, any_peer).unwrap();

    // Publicada antes de que el suscriptor conecte: se le sirve al conectar.
    publisher.publish(snapshot(1, 1)).unwrap();
    assert_eq!(next(&mut subscriber), (1, 1));
    publisher.publish(snapshot(1, 2)).unwrap();
    assert_eq!(next(&mut subscriber), (1, 2));
    assert!(subscriber.next(Duration::from_millis(100)).is_none());
}

#[test]
fn slow_consumer_sees_the_latest_and_never_blocks_the_publisher() {
    const LAST: u64 = 1500;
    let name = unique_name("slow");
    let mut publisher = Publisher::new(&name, any_peer).unwrap();
    let mut subscriber = Subscriber::connect(&name, any_peer).unwrap();

    let producer = thread::spawn(move || {
        let mut slowest = Duration::ZERO;
        for sequence in 1..=LAST {
            let began = Instant::now();
            publisher.publish(snapshot(1, sequence)).unwrap();
            slowest = slowest.max(began.elapsed());
            thread::sleep(Duration::from_millis(1));
        }
        // El publicador vive hasta que el consumidor termina.
        (publisher, slowest)
    });
    let consumer = thread::spawn(move || {
        let mut seen = Vec::new();
        while seen.last() != Some(&LAST) {
            let (_, sequence) = next(&mut subscriber);
            seen.push(sequence);
            thread::sleep(Duration::from_millis(40)); // mucho más lento que el productor
        }
        seen
    });

    let seen = consumer.join().unwrap();
    let (_publisher, slowest) = producer.join().unwrap();
    assert!(
        seen.windows(2).all(|w| w[0] < w[1]),
        "revisiones crecientes: {seen:?}"
    );
    assert!(
        seen.len() < 375, // un cuarto de las publicadas
        "el consumidor lento debía saltarse fotos, vio {}",
        seen.len()
    );
    assert!(
        slowest < Duration::from_millis(100),
        "publish no debe esperar al consumidor: {slowest:?}"
    );
}

#[test]
fn reconnection_keeps_the_cursor_and_a_new_epoch_starts_over() {
    let name = unique_name("reconnect");
    let mut subscriber = Subscriber::connect(&name, any_peer).unwrap();

    // Productor 1, época 7.
    let mut first = Publisher::new(&name, any_peer).unwrap();
    first.publish(snapshot(7, 3)).unwrap();
    assert_eq!(next(&mut subscriber), (7, 3));
    drop(first); // el suscriptor pierde la conexión

    // Mismo productor lógico (misma época) tras la caída: el cursor sigue
    // siendo válido, así que no se le repite (7, 3) y sí se le entrega (7, 4).
    let mut second = Publisher::new(&name, any_peer).unwrap();
    second.publish(snapshot(7, 3)).unwrap();
    assert!(
        subscriber.next(Duration::from_millis(1200)).is_none(),
        "(7, 3) ya estaba entregada"
    );
    second.publish(snapshot(7, 4)).unwrap();
    assert_eq!(next(&mut subscriber), (7, 4));
    drop(second);

    // Productor reiniciado: época nueva, y su secuencia vuelve a empezar.
    let mut third = Publisher::new(&name, any_peer).unwrap();
    third.publish(snapshot(8, 1)).unwrap();
    assert_eq!(next(&mut subscriber), (8, 1));
    third.publish(snapshot(8, 2)).unwrap();
    assert_eq!(next(&mut subscriber), (8, 2));
}

#[test]
fn publisher_refuses_revisions_that_do_not_grow() {
    let name = unique_name("revision");
    let mut publisher = Publisher::new(&name, any_peer).unwrap();
    publisher.publish(snapshot(2, 5)).unwrap();
    for (epoch, sequence) in [(2, 5), (2, 4), (1, 9)] {
        assert!(matches!(
            publisher.publish(snapshot(epoch, sequence)),
            Err(Error::NotNewer)
        ));
    }
    publisher.publish(snapshot(2, 6)).unwrap();
    publisher.publish(snapshot(3, 1)).unwrap(); // época nueva: la secuencia reinicia
}

#[test]
fn a_taken_pipe_name_is_refused() {
    let name = unique_name("taken");
    let _first = Publisher::new(&name, any_peer).unwrap();
    assert!(Publisher::new(&name, any_peer).is_err());
}

#[test]
fn peers_are_identified_and_can_be_refused() {
    let name = unique_name("peers");
    let seen_by_publisher = Arc::new(Mutex::new(Vec::new()));
    let seen_by_subscriber = Arc::new(Mutex::new(Vec::new()));
    let mut publisher = {
        let seen = Arc::clone(&seen_by_publisher);
        Publisher::new(&name, move |peer| {
            seen.lock().unwrap().push(peer.clone());
            true
        })
        .unwrap()
    };
    let mut subscriber = {
        let seen = Arc::clone(&seen_by_subscriber);
        Subscriber::connect(&name, move |peer| {
            seen.lock().unwrap().push(peer.clone());
            true
        })
        .unwrap()
    };
    publisher.publish(snapshot(1, 1)).unwrap();
    assert_eq!(next(&mut subscriber), (1, 1));

    let exe = std::env::current_exe().unwrap();
    for seen in [seen_by_publisher, seen_by_subscriber] {
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].pid, std::process::id());
        assert!(
            seen[0]
                .image
                .to_string_lossy()
                .eq_ignore_ascii_case(&exe.to_string_lossy())
        );
    }
}

#[test]
fn a_refused_peer_receives_nothing() {
    let name = unique_name("refused");
    let mut publisher = Publisher::new(&name, |_| false).unwrap();
    let mut subscriber = Subscriber::connect(&name, any_peer).unwrap();
    publisher.publish(snapshot(1, 1)).unwrap();
    assert!(subscriber.next(Duration::from_millis(800)).is_none());
    drop(publisher);

    // Y al revés: el suscriptor no confía en el servidor.
    let name = unique_name("distrust");
    let mut publisher = Publisher::new(&name, any_peer).unwrap();
    let mut subscriber = Subscriber::connect(&name, |_| false).unwrap();
    publisher.publish(snapshot(1, 1)).unwrap();
    assert!(subscriber.next(Duration::from_millis(800)).is_none());
}
