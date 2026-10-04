#![cfg(windows)]
use std::{sync::Arc, time::Duration};
use vantare_domain::{Snapshot, SourceKind, SourceState};
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
    snapshot.origin.source.kind = SourceKind::Live;
    snapshot.state.source_state = SourceState::Waiting;
    publisher
        .publish(Arc::new(snapshot.clone()))
        .expect("waiting");
    assert_eq!(*overlays.next(wait).expect("foto overlays"), snapshot);
    let previous = hub.next(wait).expect("foto Hub");
    assert!(!vantare_hub::lifecycle::should_close(
        None, &previous, false
    ));
    snapshot.sequence += 1;
    snapshot.state.source_state = SourceState::Live;
    publisher.publish(Arc::new(snapshot.clone())).expect("live");
    let received = hub.next(wait).expect("flanco Hub");
    assert!(vantare_hub::lifecycle::should_close(
        Some(vantare_hub::lifecycle::is_live(&previous)),
        &received,
        false
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
