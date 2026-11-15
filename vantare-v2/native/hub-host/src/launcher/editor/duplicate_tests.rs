use super::*;
use crate::test_support::Root;
use vantare_launcher::discovery::{Availability, Detected};
fn fixture() -> (Root, std::path::PathBuf, Document, Vec<u8>) {
    let root = Root::new();
    let path = root.path.join("launcher.json");
    let mut document = Document::fresh_install();
    let source = &mut document.profiles[0];
    source.advanced = true;
    source.imported = true;
    source.favorite = true;
    source.hotkey = "ctrl+shift+1".into();
    source.launch_on_windows_startup = true;
    source.launch_count = 77;
    source.last_launched_at = Some("QA-only".into());
    source.avg_chain_duration_ms = 99;
    source.steps[0].args_override = Some(vec!["--qa-private-first".into()]);
    let mut repeated = source.steps[0].clone();
    repeated.args_override = Some(vec!["--qa-private-second".into()]);
    source.steps.push(repeated);
    let mut empty = source.steps[0].clone();
    empty.args_override = Some(Vec::new());
    source.steps.push(empty);
    let bytes = serde_json::to_vec(&document).expect("fixture");
    std::fs::write(&path, &bytes).expect("fixture");
    (root, path, document, bytes)
}
fn found(document: &Document) -> Discovery {
    Discovery {
        apps: document
            .apps
            .iter()
            .map(|app| Detected {
                id: app.id.clone(),
                executable: None,
                availability: Availability {
                    launchable: true,
                    ..Default::default()
                },
            })
            .collect(),
        ..Default::default()
    }
}
fn save_prepared(
    path: &Path,
    value: &PreparedDuplicate,
    keys: &StepKeys,
    document: &Document,
) -> Result<(), HostError> {
    save(
        path,
        &value.draft,
        &value.base_revision,
        &found(document),
        value.draft.id.as_deref(),
        Some(keys),
    )
}
#[test]
fn preparing_and_cancelling_do_not_create_a_profile_or_any_file() {
    let (_root, path, document, before) = fixture();
    let revision = vantare_services::content_hash(&before);
    let mut keys = StepKeys::default();
    let prepared = keys
        .prepare_duplicate(&path, &document.profiles[0].id, &revision)
        .expect("prepare");
    assert_eq!(prepared.base_revision, revision);
    assert_eq!(
        prepared.draft.name,
        format!("{} (copia)", document.profiles[0].name)
    );
    assert!(!prepared.draft.favorite);
    assert!(!prepared.draft.startup);
    assert_eq!(prepared.draft.hotkey, "");
    assert_ne!(
        prepared.draft.id.as_deref(),
        Some(document.profiles[0].id.as_str())
    );
    for step in &prepared.draft.steps {
        assert!(step.key.as_ref().is_some_and(|key| {
            key.len() == 64
                && key
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        }));
    }
    let json = serde_json::to_string(&prepared).expect("wire");
    assert!(!json.contains("qa-private"));
    assert!(!json.contains("args_override"));
    assert!(!json.contains("launchCount"));
    assert_eq!(std::fs::read(&path).expect("unchanged"), before);
    assert_eq!(
        std::fs::read_dir(path.parent().expect("parent"))
            .expect("entries")
            .count(),
        1
    );
    drop(keys); // Cancelling is local: the editor simply discards this read.
    assert_eq!(std::fs::read(&path).expect("cancelled"), before);
    assert_eq!(
        get(&path, prepared.draft.id.as_deref()),
        Err(HostError::Denied)
    );
}
#[test]
fn edited_copy_saves_once_with_private_steps_and_native_reset_rules() {
    let (_root, path, document, before) = fixture();
    let mut keys = StepKeys::default();
    let mut prepared = keys
        .prepare_duplicate(
            &path,
            &document.profiles[0].id,
            &vantare_services::content_hash(&before),
        )
        .expect("prepare");
    prepared.draft.name = "Mi copia editada".into();
    prepared.draft.notes = "Edición local".into();
    prepared.draft.steps.reverse();
    for step in &mut prepared.draft.steps {
        step.has_custom_arguments = false;
    }
    save_prepared(&path, &prepared, &keys, &document).expect("existing editor save");
    let saved = Document::from_bytes(&std::fs::read(&path).expect("saved")).expect("document");
    assert_eq!(saved.profiles.len(), document.profiles.len() + 1);
    assert_eq!(
        serde_json::to_value(&saved.profiles[0]).expect("source"),
        serde_json::to_value(&document.profiles[0]).expect("source")
    );
    let copy = saved
        .profiles
        .iter()
        .find(|profile| Some(&profile.id) == prepared.draft.id.as_ref())
        .expect("copy");
    assert_eq!(copy.name, "Mi copia editada");
    assert_eq!(copy.notes, "Edición local");
    assert!(copy.imported);
    assert!(!copy.favorite);
    assert!(!copy.launch_on_windows_startup);
    assert_eq!(copy.hotkey, "");
    assert_eq!(copy.launch_count, 0);
    assert_eq!(copy.last_launched_at, None);
    assert_eq!(copy.avg_chain_duration_ms, 0);
    let expected: Vec<_> = document.profiles[0]
        .steps
        .iter()
        .rev()
        .map(|step| step.args_override.clone())
        .collect();
    assert_eq!(
        copy.steps
            .iter()
            .map(|step| step.args_override.clone())
            .collect::<Vec<_>>(),
        expected
    );
    let bytes = std::fs::read(&path).expect("saved");
    assert_eq!(
        save_prepared(&path, &prepared, &keys, &document),
        Err(HostError::Rejected)
    );
    assert_eq!(std::fs::read(&path).expect("no replay"), bytes);
}
#[test]
fn stale_or_protected_origin_rejects_before_saving_the_private_snapshot() {
    let (_root, path, document, before) = fixture();
    let revision = vantare_services::content_hash(&before);
    let mut keys = StepKeys::default();
    let prepared = keys
        .prepare_duplicate(&path, &document.profiles[0].id, &revision)
        .expect("prepare");
    let mut changed = document.clone();
    changed.profiles[0].name = "Origen cambiado".into();
    let bytes = serde_json::to_vec(&changed).expect("changed");
    std::fs::write(&path, &bytes).expect("changed");
    assert_eq!(
        save_prepared(&path, &prepared, &keys, &document),
        Err(HostError::Rejected)
    );
    assert_eq!(std::fs::read(&path).expect("unchanged"), bytes);
    assert_eq!(
        keys.prepare_duplicate(&path, &document.profiles[0].id, &revision),
        Err(HostError::Rejected)
    );
    assert!(!keys.is_prepared_duplicate());
    std::fs::write(&path, b"{broken").expect("protected");
    assert_eq!(
        keys.prepare_duplicate(&path, &document.profiles[0].id, &revision),
        Err(HostError::Rejected)
    );
    assert_eq!(
        keys.prepare_duplicate(
            &path,
            &document.profiles[0].id,
            &vantare_services::content_hash(b"{broken")
        ),
        Err(HostError::Protected)
    );
    assert_eq!(std::fs::read(&path).expect("still protected"), b"{broken");
}
#[test]
fn borrowed_repeated_or_invalidated_capabilities_never_write() {
    let (_root, path, document, before) = fixture();
    let revision = vantare_services::content_hash(&before);
    let mut keys = StepKeys::default();
    let original = keys
        .open(&path, Some(&document.profiles[0].id))
        .expect("read");
    let mut prepared = keys
        .prepare_duplicate(&path, &document.profiles[0].id, &revision)
        .expect("prepare");
    let issued = prepared.clone();
    prepared.draft.steps[0]
        .key
        .clone_from(&original.draft.steps[0].key);
    assert_eq!(
        save_prepared(&path, &prepared, &keys, &document),
        Err(HostError::Denied)
    );
    let mut repeated = issued.clone();
    repeated.draft.steps[1]
        .key
        .clone_from(&issued.draft.steps[0].key);
    assert_eq!(
        save_prepared(&path, &repeated, &keys, &document),
        Err(HostError::Denied)
    );
    let mut forged = issued.clone();
    forged.draft.id = Some(document.profiles[0].id.clone());
    assert_eq!(
        save_prepared(&path, &forged, &keys, &document),
        Err(HostError::Denied)
    );
    keys.open(&path, Some(&document.profiles[0].id))
        .expect("another read");
    assert_eq!(
        save_prepared(&path, &issued, &keys, &document),
        Err(HostError::Denied)
    );
    assert_eq!(std::fs::read(&path).expect("no write"), before);
}
#[test]
fn preparing_again_replaces_the_reservation_and_failed_prepare_revokes_it() {
    let (_root, path, document, before) = fixture();
    let revision = vantare_services::content_hash(&before);
    let mut keys = StepKeys::default();
    let first = keys
        .prepare_duplicate(&path, &document.profiles[0].id, &revision)
        .expect("first");
    let second = keys
        .prepare_duplicate(&path, &document.profiles[0].id, &revision)
        .expect("second");
    assert_ne!(first.draft.id, second.draft.id);
    assert_eq!(
        save_prepared(&path, &first, &keys, &document),
        Err(HostError::Denied)
    );
    assert_eq!(
        keys.prepare_duplicate(&path, "missing", &revision),
        Err(HostError::Denied)
    );
    assert_eq!(
        save_prepared(&path, &second, &keys, &document),
        Err(HostError::Denied)
    );
    assert_eq!(std::fs::read(&path).expect("no write"), before);
}
#[test]
fn limits_and_deleted_origin_fail_closed_without_writes() {
    let (_root, path, mut document, _) = fixture();
    let source = document.profiles[0].id.clone();
    let mut keys = StepKeys::default();
    document.profiles[0].name = "x".repeat(NAME_MAX);
    let bytes = serde_json::to_vec(&document).expect("long name");
    std::fs::write(&path, &bytes).expect("long name");
    assert_eq!(
        keys.prepare_duplicate(&path, &source, &vantare_services::content_hash(&bytes)),
        Err(HostError::Denied)
    );
    assert_eq!(std::fs::read(&path).expect("no write"), bytes);
    document.profiles[0].name = "QA".into();
    while document.profiles.len() < crate::launcher::PROFILE_LIMIT {
        document
            .profiles
            .push(document.profiles[0].duplicate(format!("qa-{}", document.profiles.len())));
    }
    let bytes = serde_json::to_vec(&document).expect("full");
    std::fs::write(&path, &bytes).expect("full");
    assert_eq!(
        keys.prepare_duplicate(&path, &source, &vantare_services::content_hash(&bytes)),
        Err(HostError::Denied)
    );
    assert_eq!(std::fs::read(&path).expect("no write"), bytes);
    std::fs::remove_file(&path).expect("deleted origin");
    assert_eq!(
        keys.prepare_duplicate(&path, &source, &vantare_services::content_hash(&bytes)),
        Err(HostError::Rejected)
    );
    assert!(!path.exists());
}

#[test]
fn an_unprojectable_reply_does_not_leave_previous_prepared_capabilities_usable() {
    let (_root, path, mut document, before) = fixture();
    let revision = vantare_services::content_hash(&before);
    let mut keys = StepKeys::default();
    let prepared = keys
        .prepare_duplicate(&path, &document.profiles[0].id, &revision)
        .expect("first");
    document.profiles[0].notes = "x".repeat(crate::frame::LIMIT);
    let bytes = serde_json::to_vec(&document).expect("oversized");
    std::fs::write(&path, &bytes).expect("oversized");
    assert_eq!(
        keys.prepare_duplicate(
            &path,
            &document.profiles[0].id,
            &vantare_services::content_hash(&bytes)
        ),
        Err(HostError::Protected)
    );
    assert!(!keys.is_prepared_duplicate());
    assert_eq!(std::fs::read(&path).expect("no write"), bytes);
    std::fs::write(&path, &before).expect("restore original for replay check");
    let original = Document::from_bytes(&before).expect("original");
    assert_eq!(
        save_prepared(&path, &prepared, &keys, &original),
        Err(HostError::Denied)
    );
    assert_eq!(std::fs::read(&path).expect("no replay"), before);
}
