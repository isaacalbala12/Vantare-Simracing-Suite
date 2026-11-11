use super::*;
use std::{fs, sync::Arc, time::Duration};
struct Root(PathBuf);
impl Root {
    fn new() -> Self {
        let root =
            std::env::temp_dir().join(format!("home-{}", vantare_services::random_id().unwrap()));
        fs::create_dir(&root).unwrap();
        Self(root)
    }
    fn reader(&self) -> Reader {
        Reader::new(self.0.join("launcher.json"), self.0.join("layout.json"))
    }
    fn document(&self) -> vantare_launcher::Document {
        let document = vantare_launcher::Document::fresh_install();
        fs::write(
            self.0.join("launcher.json"),
            serde_json::to_vec(&document).unwrap(),
        )
        .unwrap();
        document
    }
}
impl Drop for Root {
    fn drop(&mut self) {
        let _removed = fs::remove_dir_all(&self.0);
    }
}
#[test]
fn home_never_seeds_missing_files_and_retains_corrupt_bytes() {
    let root = Root::new();
    let reader = root.reader();
    let value = reader.view(HomeSim::default());
    assert!(value.profiles.is_empty() && !value.protected);
    assert!(!root.0.join("launcher.json").exists() && !root.0.join("layout.json").exists());
    fs::write(root.0.join("launcher.json"), b"broken").unwrap();
    assert!(reader.view(HomeSim::default()).protected);
    assert_eq!(fs::read(root.0.join("launcher.json")).unwrap(), b"broken");
}
#[test]
fn profiles_keep_the_read_revision_and_favorite_by_name_without_launch_details() {
    let root = Root::new();
    let mut document = root.document();
    for profile in &mut document.profiles {
        profile.favorite = false;
    }
    document.profiles[0].favorite = true;
    document.profiles[0].name = "Zeta".into();
    document.profiles[1].favorite = true;
    document.profiles[1].name = "Alfa".into();
    document.profiles[1].last_launched_at = Some("2026-11-11T08:00:00Z".into());
    let bytes = serde_json::to_vec(&document).unwrap();
    fs::write(root.0.join("launcher.json"), &bytes).unwrap();
    let value = root.reader().view(HomeSim::default());
    assert_eq!(
        value.favorite.as_deref(),
        Some(document.profiles[1].id.as_str())
    );
    assert_eq!(value.revision, vantare_services::content_hash(&bytes));
    assert_eq!(
        value.profiles[1].last_launched_at,
        document.profiles[1].last_launched_at
    );
    let json = serde_json::to_value(value).unwrap();
    assert!(json["profiles"][0].get("apps").is_none());
    assert!(json["profiles"][0].get("executablePath").is_none());
    assert!(json["profiles"][0].get("notes").is_none());
}
#[test]
fn watching_stops_when_hidden_and_uses_an_injected_clock() {
    let root = Root::new();
    let mut reader = root.reader();
    let now = Instant::now();
    assert!(reader.changed(false, now, HomeSim::default()).is_none());
    assert!(reader.signature.is_none() && reader.last_check.is_none());
    assert!(
        reader
            .changed(true, now, HomeSim::default())
            .unwrap()
            .profiles
            .is_empty()
    );
    root.document();
    assert!(
        reader
            .changed(
                true,
                now + Duration::from_millis(WATCH_MS - 1),
                HomeSim::default()
            )
            .is_none()
    );
    assert!(
        !reader
            .changed(
                true,
                now + Duration::from_millis(WATCH_MS),
                HomeSim::default()
            )
            .unwrap()
            .profiles
            .is_empty()
    );
    assert!(
        reader
            .changed(
                true,
                now + Duration::from_millis(WATCH_MS * 2),
                HomeSim::default()
            )
            .is_none()
    );
    let sim = HomeSim {
        connected: true,
        track: Some("Spa".into()),
    };
    assert!(
        reader
            .changed(true, now + Duration::from_millis(WATCH_MS * 3), sim)
            .unwrap()
            .sim
            .connected
    );
    assert!(reader.changed(false, now, HomeSim::default()).is_none());
    assert!(reader.signature.is_none() && reader.last_check.is_none());
}
#[test]
fn live_source_observation_is_not_a_core_heartbeat_or_replay() {
    use vantare_domain::{Quality, Snapshot, SourceKind, SourceState};
    for (kind, state, connected) in [
        (SourceKind::Live, SourceState::Live, true),
        (SourceKind::Live, SourceState::Paused, true),
        (SourceKind::Live, SourceState::Stale, true),
        (SourceKind::Live, SourceState::Waiting, false),
        (SourceKind::Live, SourceState::Lost, false),
        (SourceKind::Replay, SourceState::Live, false),
    ] {
        let mut snapshot = Snapshot::default();
        snapshot.origin.source.kind = kind;
        snapshot.state.source_state = state;
        snapshot.state.session.track_name = Quality::Reliable("Spa\n".into());
        let mut demand = vantare_ipc::Demand::default();
        demand.request(vantare_ipc::Signal::SessionInfo, 1000);
        demand.request(vantare_ipc::Signal::TrackName, 1000);
        let photo = vantare_ipc::Photo {
            snapshot: Arc::new(snapshot),
            demand,
        };
        let observed = HomeSim::from_photo(&photo);
        assert_eq!(observed.connected, connected);
        assert_eq!(observed.track.as_deref(), connected.then_some("Spa"));
        let heartbeat = vantare_ipc::Photo {
            demand: vantare_ipc::Demand::default(),
            ..photo
        };
        assert_eq!(HomeSim::from_photo(&heartbeat), HomeSim::default());
    }
}
#[cfg(windows)]
#[test]
fn preview_reuses_layout_validation_and_never_exposes_settings() {
    let root = Root::new();
    let path = root.0.join("layout.json");
    let bytes = br#"{"version":2,"instances":[{"x":20,"y":30,"opacity":0.5,"settings":{"kind":"standings","privatePath":"private"}},{"x":40,"y":50,"visible":false,"settings":{"kind":"radar"}}]}"#;
    fs::write(&path, bytes).unwrap();
    let value = crate::settings::layout::preview::read(&path);
    assert_eq!(value.state, HomePreviewState::Ready);
    assert_eq!(value.widgets.len(), 1);
    assert_eq!(value.widgets[0].opacity, 50);
    assert_eq!(value.widgets[0].x, 20);
    let natural = crate::widget_defaults::get("standings").unwrap().size;
    assert_eq!(
        (f64::from(value.widgets[0].w), f64::from(value.widgets[0].h)),
        (f64::from(natural.width), f64::from(natural.height))
    );
    let json = serde_json::to_string(&value).unwrap();
    assert!(!json.contains("settings") && !json.contains("private"));
    assert_eq!(fs::read(&path).unwrap(), bytes);
    fs::write(&path, br#"{"version":999,"instances":[]}"#).unwrap();
    assert_eq!(
        crate::settings::layout::preview::read(&path).state,
        HomePreviewState::Protected
    );
    fs::write(
        &path,
        br#"{"version":2,"instances":[{"x":1e100,"y":0,"settings":{"kind":"radar"}},{"x":0,"y":0,"settings":{"kind":"unknown"}},{"x":10,"y":20,"geometry":{"size":{"width":321,"height":123}},"settings":{"kind":"pedals"}}]}"#,
    )
    .unwrap();
    let projected = crate::settings::layout::preview::read(&path);
    assert_eq!(projected.state, HomePreviewState::Ready);
    assert_eq!(projected.widgets.len(), 1);
    assert_eq!((projected.widgets[0].w, projected.widgets[0].h), (321, 123));
}
