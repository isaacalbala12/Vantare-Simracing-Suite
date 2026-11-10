use super::*;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
struct Root(PathBuf);
impl Root {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let base = std::env::var_os("VANTARE_HUB_QA_ROOT").map_or_else(
            || std::env::temp_dir().join("vantare-hub-settings"),
            PathBuf::from,
        );
        let root = base.join(format!(
            "{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).expect("QA root");
        Self(root)
    }
    fn settings(&self) -> Settings {
        Settings {
            store: store::Store::load(&self.0, false),
            #[cfg(windows)]
            layout: layout::Layout::open(self.0.join("layout.json")),
            root: self.0.clone(),
            layout_preexisted: false,
            installation: None,
        }
    }
}
impl Drop for Root {
    fn drop(&mut self) {
        let target = self.0.canonicalize().expect("owned QA root");
        let parent = self
            .0
            .parent()
            .expect("QA parent")
            .canonicalize()
            .expect("QA base");
        assert!(target.starts_with(&parent) && target != parent);
        fs::remove_dir_all(target).expect("remove owned QA root");
    }
}
#[test]
fn frozen_fixtures_are_compatible_without_changing_their_legacy_documents() {
    let root = Root::new();
    for (name, bytes) in [
        (
            "general.json",
            include_bytes!("../../../hub/fixtures/settings-v1/general.json").as_slice(),
        ),
        (
            "appearance.json",
            include_bytes!("../../../hub/fixtures/settings-v1/appearance.json").as_slice(),
        ),
        (
            "hub-zoom.json",
            include_bytes!("../../../hub/fixtures/settings-v1/hub-zoom.json").as_slice(),
        ),
    ] {
        fs::write(root.0.join(name), bytes).expect("fixture");
    }
    let view = root.settings().view();
    assert_eq!(view.general.density, Density::Compact);
    assert_eq!(view.appearance.palette, Palette::Classic);
    assert_eq!(view.zoom, 125);
    assert_eq!(
        fs::read(root.0.join("appearance.json")).expect("legacy"),
        include_bytes!("../../../hub/fixtures/settings-v1/appearance.json").as_slice()
    );
}
#[test]
fn retry_preserves_the_other_writers_decision_and_commits_the_requested_field() {
    let root = Root::new();
    let mut settings = root.settings();
    let revision = settings.view().revision;
    let path = root.0.join("hub-settings.json");
    let mut external: serde_json::Value =
        serde_json::from_slice(&fs::read(&path).expect("document")).expect("json");
    external["general"]["updates"] = false.into();
    fs::write(
        &path,
        serde_json::to_vec(&external).expect("external writer"),
    )
    .expect("write");
    let Err(SaveError::Conflict(current)) =
        settings.update(SettingsPatch::Minimized(true), &revision)
    else {
        panic!("conflict expected")
    };
    assert!(current.can_retry);
    assert!(!current.general.updates);
    let saved = settings.retry().expect("retry");
    assert!(saved.general.minimized);
    assert!(!saved.general.updates);
    let persisted: serde_json::Value =
        serde_json::from_slice(&fs::read(path).expect("saved")).expect("json");
    assert_eq!(persisted["general"]["updates"], false);
    assert_eq!(persisted["general"]["minimized"], true);
}
#[test]
fn future_document_is_protected_and_remains_byte_exact_after_attempted_save() {
    let root = Root::new();
    let path = root.0.join("hub-settings.json");
    let original = br#"{"version":999}"#;
    fs::write(&path, original).expect("future document");
    let mut settings = root.settings();
    let view = settings.view();
    assert!(view.protected);
    assert!(matches!(
        settings.update(SettingsPatch::Zoom(125), &view.revision),
        Err(SaveError::Protected)
    ));
    assert_eq!(
        fs::read(path).expect("protected preserved"),
        original.as_slice()
    );
}
#[test]
fn web_settings_scenes_follow_the_rust_view_contract() {
    for scene in [
        include_str!("../../../../hub-web/fixtures/settings-base.json"),
        include_str!("../../../../hub-web/fixtures/settings-protected.json"),
    ] {
        let view: SettingsView = serde_json::from_str(scene).expect("scene");
        assert_eq!(view.zoom, 100);
    }
}

#[test]
fn discarding_a_conflict_forgets_only_the_pending_intent_and_preserves_the_winner() {
    let root = Root::new();
    let mut settings = root.settings();
    let revision = settings.view().revision;
    let mut external = root.settings();
    external
        .update(SettingsPatch::Updates(false), &revision)
        .expect("external winner");
    assert!(matches!(
        settings.update(SettingsPatch::Minimized(true), &revision),
        Err(SaveError::Conflict(_))
    ));
    let path = root.0.join("hub-settings.json");
    let before = fs::read(&path).expect("winner");
    let discarded = settings.discard();
    assert!(!discarded.can_retry);
    assert!(!discarded.general.minimized);
    assert!(!discarded.general.updates);
    assert_eq!(fs::read(path).expect("unchanged"), before);
    assert_eq!(settings.retry().expect("no old intent"), discarded);
}

#[cfg(windows)]
#[test]
fn existing_layout_owns_motion_and_conflicts_preserve_other_overlay_preferences() {
    let root = Root::new();
    let path = root.0.join("layout.json");
    let initial = serde_json::json!({"version":2,"instances":[],"reducedMotion":true,"extensions":{"qa":"preserve me"}});
    fs::write(&path, serde_json::to_vec(&initial).expect("layout")).expect("fixture");
    let mut settings = root.settings();
    assert!(settings.view().appearance.reduced_motion);
    let revision = settings.view().revision;
    let preferences = root.0.join("hub-settings.json");
    let untouched = fs::read(&preferences).expect("migrated preferences");
    let mut external = initial;
    external["hideOffTrack"] = true.into();
    fs::write(&path, serde_json::to_vec(&external).expect("winner")).expect("concurrent write");
    assert!(matches!(
        settings.update(SettingsPatch::ReducedMotion(false), &revision),
        Err(SaveError::Conflict(_))
    ));
    let saved = settings.retry().expect("motion retry");
    assert!(!saved.appearance.reduced_motion);
    let document: serde_json::Value =
        serde_json::from_slice(&fs::read(path).expect("persisted")).expect("layout");
    assert_eq!(document["hideOffTrack"], true);
    assert_eq!(document["reducedMotion"], false);
    assert_eq!(document["extensions"]["qa"], "preserve me");
    assert_eq!(
        fs::read(preferences).expect("preferences preserved"),
        untouched
    );
}

#[test]
fn mock_scene_matches_the_native_default_projection() {
    let mut fixture: SettingsView = serde_json::from_str(include_str!(
        "../../../../hub-web/fixtures/settings-base.json"
    ))
    .expect("view fixture");
    let default = crate::protocol::bindings::settings_sample();
    // Build identity varies by channel; all preferences and view defaults must match.
    fixture.version.clone_from(&default.version);
    assert_eq!(fixture, default);
}

#[cfg(windows)]
#[test]
fn motion_only_changes_its_field_and_preserves_opaque_layout_bytes() {
    let root = Root::new();
    let path = root.0.join("layout.json");
    let original=br#"{"version":2,"instances":[],"reducedMotion":true,"extensions":{ "precise" : 1.000000000000000000001, "opaque" : [true, null] }}"#;
    fs::write(&path, original).expect("opaque fixture");
    let mut settings = root.settings();
    let revision = settings.view().revision;
    settings
        .update(SettingsPatch::ReducedMotion(false), &revision)
        .expect("save motion");
    let saved = String::from_utf8(fs::read(path).expect("saved")).expect("utf8");
    assert!(saved.contains(r#"{ "precise" : 1.000000000000000000001, "opaque" : [true, null] }"#));
    assert!(saved.contains(r#""reducedMotion":false"#));
}
#[cfg(windows)]
#[test]
fn malformed_or_future_layouts_stay_byte_exact_after_attempted_motion_save() {
    let root = Root::new();
    let path = root.0.join("layout.json");
    for original in [
        br#"{"version":999,"instances":[],"reducedMotion":true}"#.as_slice(),
        br#"{"version":1,"instances":[],"reducedMotion":true}"#.as_slice(),
        br#"{"version":2,"instances":[],"reducedMotion":"true"}"#.as_slice(),
        br#"{"version":2,"version":2,"instances":[],"reducedMotion":true}"#.as_slice(),
        br#"{"version":2,"instances":[],"extensions":{},"extensions":{},"reducedMotion":true}"#
            .as_slice(),
    ] {
        fs::write(&path, original).expect("protected fixture");
        let mut settings = root.settings();
        let revision = settings.view().revision;
        assert!(matches!(
            settings.update(SettingsPatch::ReducedMotion(false), &revision),
            Err(SaveError::Protected)
        ));
        assert_eq!(fs::read(&path).expect("protected bytes"), original);
    }
}
