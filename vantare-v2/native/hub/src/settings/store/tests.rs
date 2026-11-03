use super::super::general::Density;
use super::*;
use crate::orbit::theme::{InterfaceFont, MonoFont, Palette, Scheme};
use std::{
    fs,
    sync::atomic::{AtomicU64, Ordering},
};

struct Root(PathBuf);
impl Root {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "vantare-step6-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
    fn write(&self, name: &str, bytes: &[u8]) {
        fs::write(self.0.join(name), bytes).unwrap();
    }
    fn read(&self, name: &str) -> Vec<u8> {
        fs::read(self.0.join(name)).unwrap()
    }
    fn load(&self) -> Store {
        Store::load(&self.0, false)
    }
}
impl Drop for Root {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
const GENERAL: &[u8] = include_bytes!("../../../fixtures/settings-v1/general.json");
const APPEARANCE: &[u8] = include_bytes!("../../../fixtures/settings-v1/appearance.json");
const ZOOM: &[u8] = include_bytes!("../../../fixtures/settings-v1/hub-zoom.json");

#[test]
fn step6_generated_v1_fixtures_migrate_without_touching_originals() {
    let root = Root::new();
    for (name, bytes) in [
        ("general.json", GENERAL),
        ("appearance.json", APPEARANCE),
        ("hub-zoom.json", ZOOM),
    ] {
        root.write(name, bytes);
    }
    let store = root.load();
    assert!(store.warning.is_none());
    assert_eq!(store.value.general.density, Density::Compact);
    assert!(store.value.general.minimized);
    assert_eq!(store.value.appearance.palette, Palette::Classic);
    assert!(store.value.appearance.reduced_motion);
    assert_eq!(store.value.zoom, 125);
    let bytes = root.read(FILE);
    assert_eq!(root.load().value, store.value);
    assert_eq!(root.read(FILE), bytes);
    for (name, bytes) in [
        ("general.json", GENERAL),
        ("appearance.json", APPEARANCE),
        ("hub-zoom.json", ZOOM),
    ] {
        assert_eq!(root.read(name), bytes);
    }
    let current: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(current["version"], 2);
    assert!(current["general"].get("startup").is_none());
    assert!(current["general"].get("onboarding_simulators").is_none());
}
#[test]
fn step6_pure_migration_preserves_retired_fields_onboarding_and_palette_semantics() {
    for (key, expected) in [
        ("vantare", Palette::Classic),
        ("classic", Palette::Vantare),
        ("ocean", Palette::Ocean),
    ] {
        for scheme in [Scheme::Dark, Scheme::Light] {
            let (doc, warnings) = migrate_v1(
                Some(
                    serde_json::json!({"startup":true,"onboarding_simulators":[false,true],"onboarding_automatic":true,"minimized":true}),
                ),
                Some(
                    serde_json::json!({"palette":key,"scheme":scheme,"contrast":255,"glassOpacity":0,"interfaceFont":"arial","monoFont":"consolas","reducedMotion":true}),
                ),
                Some(serde_json::json!(110)),
                false,
            );
            assert!(warnings.is_empty());
            assert!(doc.general.onboarding_completed);
            assert!(!doc.general.startup);
            assert!(doc.general.minimized);
            assert_eq!(doc.appearance.palette, expected);
            assert_eq!(doc.appearance.scheme, scheme);
            assert_eq!(
                (doc.appearance.contrast, doc.appearance.glass_opacity),
                (120, 50)
            );
            assert_eq!(doc.appearance.interface_font, InterfaceFont::Arial);
            assert_eq!(doc.appearance.mono_font, MonoFont::Consolas);
            assert!(doc.appearance.reduced_motion);
        }
    }
    assert_eq!(
        migrate_v1(None, Some(serde_json::json!({})), None, false)
            .0
            .appearance
            .palette,
        Palette::Vantare
    );
    assert_eq!(
        migrate_v1(
            None,
            Some(serde_json::json!({"paletteVersion":1,"palette":"classic"})),
            None,
            false
        )
        .0
        .appearance
        .palette,
        Palette::Classic
    );
    assert!(
        !migrate_v1(None, None, None, false)
            .0
            .general
            .onboarding_completed
    );
    assert!(
        migrate_v1(None, None, None, true)
            .0
            .general
            .onboarding_completed
    );
    assert!(
        !migrate_v1(
            Some(serde_json::json!({"onboarding_completed":false})),
            None,
            None,
            true
        )
        .0
        .general
        .onboarding_completed
    );
    assert_eq!(
        migrate_v1(
            Some(serde_json::json!({"unknown":true})),
            None,
            Some(serde_json::json!(99)),
            false
        )
        .1,
        [Legacy::General, Legacy::Zoom]
    );
}
#[test]
fn step6_each_corrupt_source_is_copied_and_does_not_block_saving() {
    for name in ["general.json", "appearance.json", "hub-zoom.json"] {
        let root = Root::new();
        root.write(name, b"{");
        let mut store = root.load();
        assert!(store.warning.as_ref().unwrap().contains(".invalid"));
        assert_eq!(root.read(&format!("{name}.invalid")), b"{");
        assert_eq!(root.read(name), b"{");
        assert_eq!(store.value.zoom, 100);
        store.save_zoom(110).unwrap();
        store.save_general(store.value.general).unwrap();
        store.save_appearance(store.value.appearance).unwrap();
        assert_eq!(root.load().value.zoom, 110);
        assert_eq!(root.read(&format!("{name}.invalid")), b"{");
        if name != "appearance.json" {
            assert_eq!(root.read(name), b"{");
        }
    }
}
#[test]
fn step6_invalid_zoom_values_use_default_and_remain_archived() {
    for bytes in [b"99".as_slice(), b"-1", b"\"100\"", b"null"] {
        let root = Root::new();
        root.write("hub-zoom.json", bytes);
        let mut store = root.load();
        assert_eq!(store.value.zoom, 100);
        assert!(store.warning.is_some());
        store.save_zoom(125).unwrap();
        assert_eq!(root.read("hub-zoom.json.invalid"), bytes);
        assert_eq!(root.read("hub-zoom.json"), bytes);
    }
}
#[test]
fn step6_zoom_general_and_appearance_share_one_cas_document() {
    let root = Root::new();
    let mut store = root.load();
    let mut stale = root.load();
    for percent in [90, 100, 110, 125] {
        store.save_zoom(percent).unwrap();
        assert_eq!(root.load().value.zoom, percent);
    }
    let before = stale.value.clone();
    assert!(stale.save_zoom(90).is_err());
    assert_ne!(stale.value, before);
    assert_eq!(stale.value, store.value);
    assert!(store.save_zoom(99).is_err());
    for palette in Palette::ALL {
        for scheme in [Scheme::System, Scheme::Dark, Scheme::Light] {
            store
                .save_appearance(AppearanceSettings {
                    palette,
                    scheme,
                    ..store.value.appearance
                })
                .unwrap();
            assert_eq!(root.load().value, store.value);
        }
    }
    let mut next = store.value.general;
    next.toasts = true;
    next.onboarding_completed = true;
    store.save_general(next).unwrap();
    assert_eq!(root.load().value.general, next);
    assert!(!root.0.join("general.json").exists());
    assert!(!root.0.join("hub-zoom.json").exists());
}
#[test]
fn step6_v2_wins_over_later_legacy_edits_without_second_general_load() {
    let root = Root::new();
    root.write("general.json", GENERAL);
    let store = root.load();
    root.write("general.json", b"corrupt later");
    root.write("hub-zoom.json", b"99");
    let loaded = root.load();
    assert_eq!(loaded.value, store.value);
    assert!(loaded.warning.is_none());
    assert!(!root.0.join("general.json.invalid").exists());
    assert!(!root.0.join("hub-zoom.json.invalid").exists());
}
#[test]
fn step6_unknown_versions_and_failed_quarantine_are_protected() {
    for (name, bytes) in [
        (FILE, br#"{"version":99,"future":true}"#.as_slice()),
        (
            "appearance.json",
            br#"{"paletteVersion":99,"palette":"future"}"#,
        ),
    ] {
        let root = Root::new();
        root.write(name, bytes);
        let mut store = root.load();
        assert!(store.warning.is_some());
        assert!(store.save_zoom(110).is_err());
        assert!(store.save_appearance(store.value.appearance).is_err());
        assert_eq!(root.read(name), bytes);
        assert!(!root.0.join(format!("{name}.invalid")).exists());
    }
    let root = Root::new();
    root.write("hub-zoom.json", b"{");
    let held = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(root.0.join("hub-zoom.json.lock"))
        .unwrap();
    held.lock().unwrap();
    let mut store = root.load();
    assert!(store.warning.is_some());
    assert!(store.save_zoom(110).is_err());
    assert_eq!(root.read("hub-zoom.json"), b"{");
    drop(held);
    let mut recovered = root.load();
    recovered.save_zoom(110).unwrap();
    assert_eq!(root.read("hub-zoom.json.invalid"), b"{");
}
#[test]
fn step6_failed_initial_publication_can_retry_without_touching_v1() {
    let root = Root::new();
    root.write("general.json", GENERAL);
    let held = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(root.0.join("hub-settings.json.lock"))
        .unwrap();
    held.lock().unwrap();
    let mut store = root.load();
    assert!(store.warning.is_some());
    assert!(!root.0.join(FILE).exists());
    assert_eq!(root.read("general.json"), GENERAL);
    drop(held);
    store.save_general(store.value.general).unwrap();
    assert_eq!(root.load().value, store.value);
}
#[test]
fn step6_mirror_is_readable_by_old_appearance_and_real_overlay_reader() {
    let root = Root::new();
    root.write("appearance.json", APPEARANCE);
    let mut store = root.load();
    assert_eq!(root.read("appearance.json"), APPEARANCE);
    for reduced_motion in [false, true, false] {
        let next = AppearanceSettings {
            reduced_motion,
            palette: Palette::Ocean,
            ..store.value.appearance
        };
        store.save_appearance(next).unwrap();
        assert!(store.mirror_warning.is_none());
        assert_eq!(
            vantare_ui::MotionPolicy::load(&root.0.join("appearance.json"))
                .unwrap()
                .0,
            reduced_motion
        );
        let value: Value = serde_json::from_slice(&root.read("appearance.json")).unwrap();
        assert_eq!(value["paletteVersion"], 1);
        // El tipo AppearanceSettings y el formato paletteVersion:1 no cambian en este PR.
        let old: AppearanceSettings = serde_json::from_value(value).unwrap();
        assert_eq!(old, next);
        assert_eq!(root.load().value.appearance, next);
    }
}
#[test]
fn step6_mirror_conflict_keeps_v2_and_external_bytes_and_reports_warning() {
    let root = Root::new();
    root.write("appearance.json", APPEARANCE);
    let mut store = root.load();
    assert_eq!(store.mirror_observed.as_deref(), Some(APPEARANCE));
    let foreign = br#"{"paletteVersion":1,"palette":"iris"}"#;
    root.write("appearance.json", foreign);
    let next = AppearanceSettings {
        reduced_motion: true,
        ..store.value.appearance
    };
    store.save_appearance(next).unwrap();
    assert!(
        store
            .mirror_warning
            .as_ref()
            .unwrap()
            .contains("appearance.json")
    );
    assert_eq!(store.value.appearance, next);
    assert_eq!(root.load().value.appearance, next);
    assert_eq!(root.read("appearance.json"), foreign);
    // Un fallo del v2 tampoco intenta modificar el espejo.
    root.write(FILE, b"external winner");
    assert!(
        store
            .save_appearance(AppearanceSettings::default())
            .is_err()
    );
    assert_eq!(root.read("appearance.json"), foreign);
    assert_eq!(root.read(FILE), b"external winner");
}
#[test]
fn step6_corrupt_v2_is_archived_and_future_fields_are_conservatively_archived() {
    for bytes in [
        b"{".as_slice(),
        br#"{"version":2,"general":{},"appearance":{},"zoom":100,"newField":true}"#,
    ] {
        let root = Root::new();
        root.write(FILE, bytes);
        let mut store = root.load();
        assert!(store.warning.is_some());
        assert_eq!(root.read(&format!("{FILE}.invalid")), bytes);
        store.save_zoom(110).unwrap();
        assert_eq!(root.load().value.zoom, 110);
    }
}
#[test]
fn step6_oversized_sources_remain_protected_without_loss() {
    for (name, limit) in [
        ("general.json", 4096),
        ("appearance.json", 16 * 1024),
        ("hub-zoom.json", 128),
        (FILE, usize::try_from(LIMIT).unwrap()),
    ] {
        let root = Root::new();
        let bytes = vec![b' '; limit + 1];
        root.write(name, &bytes);
        let mut store = root.load();
        assert!(store.warning.is_some());
        assert!(store.save_zoom(90).is_err());
        assert_eq!(root.read(name), bytes);
    }
}

#[test]
fn step6_concurrent_first_publication_loads_the_winner_instead_of_overwriting_it() {
    let root = Root::new();
    let pending = Store::empty(&root.0, Document::default(), None);
    let mut winner = root.load();
    winner.save_zoom(125).unwrap();
    let before = root.read(FILE);
    let adopted = pending.publish_migration(&root.0, Vec::new());
    assert_eq!(adopted.value.zoom, 125);
    assert_eq!(root.read(FILE), before);
}

#[test]
fn step8a_warning_clears_after_successful_repair() {
    let root = Root::new();
    root.write("general.json", b"{");
    let mut store = root.load();
    assert!(store.warning.is_some());
    store.save_general(store.value.general).unwrap();
    assert!(store.warning.is_none());
    assert_eq!(root.read("general.json.invalid"), b"{");
}

#[test]
fn step8a_bad_zoom_preserves_other_v2_sections() {
    for zoom in [
        serde_json::json!(99),
        serde_json::json!(-1),
        serde_json::json!("bad"),
        Value::Null,
    ] {
        let root = Root::new();
        let mut value = serde_json::to_value(Document::default()).unwrap();
        value["general"]["minimized"] = true.into();
        value["appearance"]["palette"] = "ocean".into();
        value["zoom"] = zoom;
        let original = serde_json::to_vec(&value).unwrap();
        root.write(FILE, &original);
        let mut store = root.load();
        assert!(store.value.general.minimized);
        assert_eq!(store.value.appearance.palette, Palette::Ocean);
        assert_eq!(store.value.zoom, 100);
        assert!(store.warning.is_some());
        assert_eq!(root.read(FILE), original);
        store.save_zoom(110).unwrap();
        assert_eq!(root.read("hub-settings.json.bak"), original);
        assert!(store.warning.is_none());
        assert!(root.load().value.general.minimized);
        assert_eq!(root.load().value.appearance.palette, Palette::Ocean);
    }
}

#[test]
fn step8a_cas_conflict_reloads_and_can_retry_without_restart() {
    let root = Root::new();
    let mut first = root.load();
    let mut stale = root.load();
    let mut general = first.value.general;
    general.minimized = true;
    first.save_general(general).unwrap();
    assert!(stale.save_zoom(125).is_err());
    assert!(stale.value.general.minimized);
    stale.save_zoom(125).unwrap();
    let current = root.load();
    assert!(current.value.general.minimized);
    assert_eq!(current.value.zoom, 125);
}

#[test]
fn step8a_protected_mirror_is_never_replaced_even_after_source_disappears() {
    for bytes in [
        br#"{"paletteVersion":99}"#.to_vec(),
        vec![b' '; 16 * 1024 + 1],
    ] {
        let root = Root::new();
        root.load();
        root.write("appearance.json", &bytes);
        let mut store = root.load();
        assert!(store.warning.is_some());
        fs::remove_file(root.0.join("appearance.json")).unwrap();
        let next = AppearanceSettings {
            reduced_motion: true,
            ..store.value.appearance
        };
        store.save_appearance(next).unwrap();
        assert!(!root.0.join("appearance.json").exists());
        assert!(store.mirror_warning.is_some());
        assert_eq!(root.load().value.appearance, next);
    }
}

#[test]
fn step8a_store_v3_bridge_protects_only_marked_section_without_creating_v3() {
    let root = Root::new();
    let mut value = serde_json::to_value(Document::default()).unwrap();
    value["version"] = 3.into();
    value["migrationPending"] = serde_json::json!(["appearance"]);
    root.write(FILE, &serde_json::to_vec(&value).unwrap());
    let mut store = root.load();
    assert!(store.save_appearance(store.value.appearance).is_err());
    store.save_zoom(110).unwrap();
    let current: Value = serde_json::from_slice(&root.read(FILE)).unwrap();
    assert_eq!(current["version"], 3);
    assert_eq!(
        current["migrationPending"],
        serde_json::json!(["appearance"])
    );
    let fresh = Root::new();
    fresh.load().save_zoom(125).unwrap();
    let current: Value = serde_json::from_slice(&fresh.read(FILE)).unwrap();
    assert_eq!(current["version"], 2);
    assert!(current.get("migrationPending").is_none());
}
#[test]
fn step8a_retry_rebases_only_edited_keys_and_retains_draft() {
    let root = Root::new();
    let mut stale = root.load();
    let mut winner = root.load();
    let mut foreign = winner.value.appearance;
    foreign.palette = Palette::Ocean;
    winner.save_appearance(foreign).unwrap();
    let wanted = AppearanceSettings {
        reduced_motion: true,
        ..stale.value.appearance
    };
    assert!(stale.save_appearance(wanted).is_err());
    assert!(stale.has_pending());
    stale.retry().unwrap();
    assert!(!stale.has_pending());
    assert!(stale.value.appearance.reduced_motion);
    assert_eq!(stale.value.appearance.palette, Palette::Ocean);
    assert_eq!(root.load().value, stale.value);
}
#[test]
fn step8a_unreadable_mirror_remains_protected_after_directory_disappears() {
    let root = Root::new();
    root.load();
    fs::create_dir(root.0.join("appearance.json")).unwrap();
    let mut store = root.load();
    fs::remove_dir(root.0.join("appearance.json")).unwrap();
    store.save_appearance(store.value.appearance).unwrap();
    assert!(!root.0.join("appearance.json").exists());
    assert!(store.mirror_warning.is_some());
    assert!(store.warning_text().is_some());
}
