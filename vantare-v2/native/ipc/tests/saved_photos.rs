//! Documentos históricos auténticos del repo; no versiones retocadas de un DTO actual.
use sha2::{Digest, Sha256};
use vantare_domain::{CarId, Quality, SessionTiming};
use vantare_ipc::{Error, snapshot_from_json, snapshot_from_saved_json, snapshot_to_json};

#[test]
fn frozen_v7_and_v10_documents_keep_values_and_are_not_live_peers() {
    for (version, text, digest) in [
        (
            7,
            include_str!("fixtures/saved-v8.snapshot.json"),
            "8630ac1645b1b1b3ea13dfdbc708198ef18be18b940daa2a5f9444887e319428",
        ),
        (
            10,
            include_str!("fixtures/saved-v10.snapshot.json"),
            "e22ad21d49491084ac41c3838a0c57596494f802646b7a253b6dfc48408b45d2",
        ),
    ] {
        assert_eq!(format!("{:x}", Sha256::digest(text.as_bytes())), digest);
        let raw: serde_json::Value = serde_json::from_str(text).unwrap();
        assert_eq!(raw["version"], version);
        let snapshot = snapshot_from_saved_json(text).expect("documento antiguo válido");
        assert_eq!(snapshot.state.cars.len(), 20);
        assert_eq!(snapshot.state.cars[0].driver.name, "André Lotterer");
        assert_eq!(
            snapshot.state.session.track_name,
            Quality::Reliable("Sebring".into())
        );
        assert_eq!(snapshot.state.session.timing, SessionTiming::default());
        let player = snapshot.state.player.as_ref().unwrap();
        assert_eq!(player.car, CarId(1));
        assert_eq!(player.telemetry.throttle, Quality::Reliable(0.75));
        assert_eq!(
            snapshot_from_json(&snapshot_to_json(&snapshot).unwrap()).unwrap(),
            snapshot
        );
        assert!(matches!(snapshot_from_json(text), Err(Error::Version { got }) if got == version));
    }
}
