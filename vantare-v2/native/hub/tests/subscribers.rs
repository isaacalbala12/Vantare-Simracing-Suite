#![cfg(windows)]
use std::{sync::Arc, time::Duration};
use vantare_domain::{Snapshot, SourceKind};
use vantare_ipc::{Publisher, Subscriber};

#[test]
fn hub_and_overlays_receive_the_same_publisher_without_sharing_a_cursor() {
    let name = format!("vantare-hub-two-subscribers-{}", std::process::id());
    let mut publisher = Publisher::new(&name, |_| true).expect("publisher local");
    let mut overlays = Subscriber::connect(&name, |_| true).expect("overlays");
    let mut hub = Subscriber::connect(&name, |_| true).expect("Hub");
    let wait = Duration::from_secs(10);
    let mut snapshot = Snapshot {
        epoch: 1,
        sequence: 1,
        ..Snapshot::default()
    };
    snapshot.origin.source.kind = SourceKind::Replay;
    publisher
        .publish(Arc::new(snapshot.clone()))
        .expect("replay");
    assert_eq!(*overlays.next(wait).expect("foto overlays"), snapshot);
    let previous = hub.next(wait).expect("foto Hub");
    assert!(!vantare_hub::lifecycle::should_close(None, &previous));
    snapshot.sequence += 1;
    snapshot.origin.source.kind = SourceKind::Live;
    publisher.publish(Arc::new(snapshot.clone())).expect("live");
    let received = hub.next(wait).expect("flanco Hub");
    assert!(vantare_hub::lifecycle::should_close(
        Some(previous.origin.source.kind),
        &received
    ));
    assert_eq!(
        *overlays.next(wait).expect("overlays sigue recibiendo"),
        snapshot
    );
    drop(hub);
    snapshot.sequence += 1;
    publisher
        .publish(Arc::new(snapshot.clone()))
        .expect("tras cerrar Hub");
    assert_eq!(
        *overlays.next(wait).expect("overlays independiente"),
        snapshot
    );
}
