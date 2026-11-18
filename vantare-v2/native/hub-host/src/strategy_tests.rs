#![allow(clippy::unwrap_used)]
use super::*;
use std::{
    fs,
    time::{Duration, UNIX_EPOCH},
};

struct Root(PathBuf);
impl Root {
    fn new() -> Self {
        let path = std::env::temp_dir().join(vantare_services::random_id().unwrap());
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn state(&self) -> State {
        State::new(self.0.clone())
    }
    fn primary(&self) -> PathBuf {
        self.0.join(PRIMARY)
    }
    fn legacy(&self) -> PathBuf {
        self.0.join("strategy-repository.json")
    }
}
impl Drop for Root {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn document(schema: &str) -> Vec<u8> {
    let event = |id| {
        let mut event = vantare_strategy::document::new_event(id, "Practice", 90, 90.0, 18.0);
        let mut variant = event["strategies"][0].clone();
        variant["id"] = "variant-2".into();
        event["strategies"].as_array_mut().unwrap().push(variant);
        event["activeStrategyId"] = "variant-1".into();
        event
    };
    format!(
        "{{\n \"contractVersion\":\"strategy.v2\", \"schemaVersion\":\"{schema}\",\n \"generatedAt\":\"2026-11-18T00:00:00Z\", \"events\":[{},{}],\n \"activeEventId\":\"event-1\", \"future\": {{ \"gain\": 1.2300, \"path\": \"PRIVATE/test\" }}\n}}\n",
        event("event-1"), event("event-2")
    ).into_bytes()
}
fn legacy(version: &str, drafts: &str) -> String {
    let payload = format!(
        r#"{{"repositoryVersion":"{version}","hashAlgorithm":"sha256:strategy-repository-json-v1","generation":7,"drafts":[{drafts}],"revisions":[]}}"#
    );
    let hash = vantare_services::content_hash(payload.as_bytes());
    format!(
        r#"{},"contentHash":"{hash}"}}"#,
        &payload[..payload.len() - 1]
    )
}

#[test]
fn missing_and_valid_empty_are_read_only() {
    let root = Root::new();
    let mut state = root.state();
    let empty = state.open().unwrap();
    assert_eq!(empty.state, StrategyState::Empty);
    assert_eq!(empty.revision, vantare_services::content_hash(b""));
    assert_eq!(empty, state.view());
    assert!(!root.primary().exists());
    let bytes = br#"{"contractVersion":"strategy.v2","schemaVersion":"2.1.0","generatedAt":"2026-11-18T00:00:00Z","events":[]}"#;
    fs::write(root.primary(), bytes).unwrap();
    assert_eq!(state.open().unwrap().state, StrategyState::Empty);
    assert_eq!(state.view().revision, vantare_services::content_hash(bytes));
    assert_eq!(fs::read(root.primary()).unwrap(), bytes);
}

#[test]
fn selection_changes_only_the_two_spans_in_both_supported_schemas() {
    for schema in ["2.0.0", "2.1.0"] {
        let root = Root::new();
        let before = document(schema);
        fs::write(root.primary(), &before).unwrap();
        let mut state = root.state();
        let opened = state.open().unwrap();
        assert_eq!(opened.state, StrategyState::Ready);
        let selected = state
            .select("event-2", "variant-2", &opened.revision)
            .unwrap();
        assert_eq!(selected.active_event_id.as_deref(), Some("event-2"));
        assert_eq!(selected.active_strategy_id.as_deref(), Some("variant-2"));
        let expected = String::from_utf8(before).unwrap().replace(
            "\"activeEventId\":\"event-1\"",
            "\"activeEventId\":\"event-2\"",
        );
        let (head, tail) = expected
            .rsplit_once("\"activeStrategyId\":\"variant-1\"")
            .unwrap();
        assert_eq!(
            fs::read(root.primary()).unwrap(),
            format!("{head}\"activeStrategyId\":\"variant-2\"{tail}").as_bytes()
        );
        assert!(!selected.dirty);
        let wire = serde_json::to_string(&selected).unwrap();
        for private in ["PRIVATE", "strategy-v2.json", "contractVersion", "1.2300"] {
            assert!(!wire.contains(private), "{wire}");
        }
    }
}

#[test]
fn corruption_quarantined_and_future_or_oversized_originals_protected() {
    let root = Root::new();
    let mut state = root.state();
    let corrupt = b"{ damaged";
    fs::write(root.primary(), corrupt).unwrap();
    let opened = state.open().unwrap();
    assert_eq!(opened.state, StrategyState::Recovered);
    assert_eq!(opened.revision, vantare_services::content_hash(corrupt));
    assert_eq!(
        fs::read(root.0.join("strategy-v2.json.invalid")).unwrap(),
        corrupt
    );
    assert_eq!(fs::read(root.primary()).unwrap(), corrupt);

    for future in [
        String::from_utf8(document("9.0.0")).unwrap(),
        String::from_utf8(document("2.0.0"))
            .unwrap()
            .replace("strategy.v2", "strategy.v3"),
        " ".repeat(vantare_strategy::document::MAX_BYTES + 1),
    ] {
        fs::write(root.primary(), &future).unwrap();
        let opened = state.open().unwrap();
        assert_eq!(opened.state, StrategyState::Protected);
        assert_eq!(
            state.select("event-1", "variant-1", &opened.revision),
            Err(HostError::Protected)
        );
        assert_eq!(fs::read(root.primary()).unwrap(), future.as_bytes());
    }
}
#[test]
fn only_the_last_legacy_draft_is_imported_and_source_bytes_and_mtime_are_untouched() {
    let older = r#"{"contractVersion":"strategy.v2","schemaVersion":"2.0.0","generatedAt":"2026-11-18T00:00:00Z","events":[]}"#;
    let newer = older.replace("2.0.0", "2.1.0");
    for version in ["strategy.repository.v1", "strategy.repository.v2"] {
        let root = Root::new();
        let source = legacy(version, &format!("{older},{newer}"));
        fs::write(root.legacy(), &source).unwrap();
        fs::File::options()
            .write(true)
            .open(root.legacy())
            .unwrap()
            .set_modified(UNIX_EPOCH + Duration::from_secs(1_000_000_000))
            .unwrap();
        let before = fs::metadata(root.legacy()).unwrap().modified().unwrap();
        let mut state = root.state();
        assert_eq!(state.open().unwrap().state, StrategyState::ImportedLegacy);
        assert_eq!(fs::read(root.primary()).unwrap(), newer.as_bytes());
        assert_eq!(fs::read(root.legacy()).unwrap(), source.as_bytes());
        assert_eq!(
            fs::metadata(root.legacy()).unwrap().modified().unwrap(),
            before
        );
        fs::write(root.legacy(), b"unreadable JSON").unwrap();
        assert_eq!(root.state().open().unwrap().state, StrategyState::Empty);
        assert_eq!(fs::read(root.primary()).unwrap(), newer.as_bytes());
    }
}
#[test]
fn rejects_legacy_bad_hash_duplicate_keys_and_future_envelope_without_writes() {
    let draft = r#"{"contractVersion":"strategy.v2","schemaVersion":"2.1.0","generatedAt":"2026-11-18T00:00:00Z","events":[]}"#;
    let valid = legacy("strategy.repository.v2", draft);
    let hash = valid.rsplit_once("\"contentHash\":\"").unwrap().1;
    for source in [
        valid.replace(hash, &format!("{}\"}}", "0".repeat(64))),
        valid.replace("\"generation\":7", "\"generation\":7,\"generation\":7"),
        legacy("strategy.repository.v3", draft),
    ] {
        let root = Root::new();
        fs::write(root.legacy(), &source).unwrap();
        let mut state = root.state();
        assert_eq!(state.open(), Err(HostError::StrategyImportFailed));
        assert_eq!(state.view_opened(), Err(HostError::Denied));
        assert!(!root.primary().exists());
        assert_eq!(fs::read(root.legacy()).unwrap(), source.as_bytes());
    }
}
#[test]
fn two_hubs_compare_observed_bytes_and_only_explicit_retry_changes_the_winner() {
    let root = Root::new();
    fs::write(root.primary(), document("2.1.0")).unwrap();
    let mut a = root.state();
    let mut b = root.state();
    let r0 = a.open().unwrap();
    assert_eq!(r0, b.open().unwrap());
    let winner = a.select("event-2", "variant-2", &r0.revision).unwrap();
    let bytes = fs::read(root.primary()).unwrap();
    let conflict = b.select("event-1", "variant-2", &r0.revision).unwrap_err();
    assert_eq!(
        conflict,
        HostError::StrategyConflict {
            current: winner.clone()
        }
    );
    assert_eq!(fs::read(root.primary()).unwrap(), bytes);
    let wire = serde_json::to_string(&conflict).unwrap();
    assert!(!wire.contains("PRIVATE"));
    assert!(!wire.contains("strategy-v2.json"));
    assert_eq!(
        b.select("event-1", "variant-2", &winner.revision)
            .unwrap()
            .active_event_id
            .as_deref(),
        Some("event-1")
    );
}
#[test]
fn invalid_selection_and_busy_writer_preserve_document_and_view() {
    let root = Root::new();
    let bytes = document("2.1.0");
    fs::write(root.primary(), &bytes).unwrap();
    let mut state = root.state();
    let before = state.open().unwrap();
    for (event, strategy) in [
        ("missing", "variant-1"),
        ("event-1", "missing"),
        ("../event-2", "variant-1"),
    ] {
        assert_eq!(
            state.select(event, strategy, &before.revision),
            Err(HostError::Rejected)
        );
        assert_eq!(fs::read(root.primary()).unwrap(), bytes);
    }
    let lock = fs::File::options()
        .write(true)
        .create_new(true)
        .open(root.0.join("strategy-v2.json.lock"))
        .unwrap();
    lock.try_lock().unwrap();
    assert_eq!(
        state.select("event-2", "variant-1", &before.revision),
        Err(HostError::Busy)
    );
    assert_eq!(state.view(), before);
    assert_eq!(fs::read(root.primary()).unwrap(), bytes);
}

fn fields(name: &str) -> StrategyFields {
    StrategyFields {
        name: name.into(),
        duration_minutes: "90".into(),
        fuel_capacity_liters: "82".into(),
        pit_transit_seconds: "25".into(),
        track: "Fuji".into(),
        class: "GT3".into(),
        variant_name: "Base".into(),
        variant_mode: "dry".into(),
        driver_name: "Pilot".into(),
        driver_initials: "PI".into(),
        ..StrategyFields::default()
    }
}

const NOW: &str = "2026-11-18T00:00:00Z";

#[test]
fn creation_is_atomic_and_first_save_creates_a_restartable_primary() {
    let root = Root::new();
    let mut state = root.state();
    assert_eq!(state.view_opened(), Err(HostError::Denied));
    let empty = state.open().unwrap();
    assert_eq!(
        state.create(&empty.revision, &fields(""), None, None, NOW),
        Err(HostError::Rejected)
    );
    assert_eq!(state.view(), empty);
    let mut form = fields("Fuji");
    form.team = "Local team".into();
    form.variant_note = "Reviewed".into();
    form.variant_mode = "wet".into();
    let draft = state
        .create(&empty.revision, &form, Some("90.472"), Some("1.83"), NOW)
        .unwrap();
    assert!(draft.dirty);
    assert_ne!(draft.revision, empty.revision);
    assert_eq!(draft.active_event_id.as_deref(), Some("native-event-1"));
    assert!(!root.primary().exists());
    assert_eq!(state.open(), Err(HostError::StrategyDirty));
    assert_eq!(
        state.create(&draft.revision, &form, None, None, NOW),
        Err(HostError::StrategyDirty)
    );
    assert_eq!(
        state.select("native-event-1", "variant-1", &draft.revision),
        Err(HostError::StrategyDirty)
    );
    let saved = state.save(&draft.revision).unwrap();
    assert!(!saved.dirty);
    assert_eq!(root.state().open().unwrap(), saved);
    let bytes = fs::read(root.primary()).unwrap();
    let doc = Document::parse(&bytes).unwrap();
    let event = &doc.value()["events"][0];
    assert_eq!(event["drivers"][0]["ini"]["value"], "PI");
    assert_eq!(event["team"]["value"], "Local team");
    assert_eq!(event["strategies"][0]["mode"]["value"], "wet");
    assert_eq!(event["strategies"][0]["note"]["value"], "Reviewed");
    assert_eq!(
        event["planningInputs"]["overrides"]["fuel_per_lap_liters"]["value"],
        1.83
    );
}

#[test]
fn confirmation_keeps_unknown_bytes_and_discard_reloads_the_saved_document() {
    let root = Root::new();
    let bytes = document("2.1.0");
    fs::write(root.primary(), &bytes).unwrap();
    let mut state = root.state();
    let before = state.open().unwrap();
    let mut form = fields("Edited");
    form.variant_mode = "invalid".into();
    assert_eq!(
        state.confirm("event-1", "variant-1", &before.revision, &form),
        Err(HostError::Rejected)
    );
    assert_eq!(state.view(), before);
    form.variant_mode = "dry".into();
    let draft = state
        .confirm("event-1", "variant-1", &before.revision, &form)
        .unwrap();
    assert!(draft.dirty);
    assert_eq!(fs::read(root.primary()).unwrap(), bytes);
    assert!(matches!(
        state.discard(&before.revision),
        Err(HostError::StrategyConflict { .. })
    ));
    assert_eq!(state.view(), draft);
    assert_eq!(state.discard(&draft.revision).unwrap(), before);
    let draft = state
        .confirm("event-1", "variant-1", &before.revision, &form)
        .unwrap();
    state.save(&draft.revision).unwrap();
    let after = String::from_utf8(fs::read(root.primary()).unwrap()).unwrap();
    assert!(after.contains(r#""future": { "gain": 1.2300, "path": "PRIVATE/test" }"#));
}

#[test]
fn first_save_conflict_keeps_both_the_winner_and_the_losing_draft() {
    let root = Root::new();
    let mut a = root.state();
    let mut b = root.state();
    let r0 = a.open().unwrap().revision;
    assert_eq!(b.open().unwrap().revision, r0);
    let a_draft = a.create(&r0, &fields("Winner"), None, None, NOW).unwrap();
    let b_draft = b.create(&r0, &fields("Other"), None, None, NOW).unwrap();
    let winner = a.save(&a_draft.revision).unwrap();
    let durable = fs::read(root.primary()).unwrap();
    assert_eq!(
        b.save(&b_draft.revision),
        Err(HostError::StrategyConflict {
            current: winner.clone()
        })
    );
    assert_eq!(b.view(), b_draft);
    assert_eq!(fs::read(root.primary()).unwrap(), durable);
    assert_eq!(b.discard(&b_draft.revision).unwrap(), winner);
}

#[test]
fn a_recovered_document_can_be_saved_and_a_future_document_cannot() {
    let root = Root::new();
    let broken = b"{broken";
    fs::write(root.primary(), broken).unwrap();
    let mut state = root.state();
    let recovered = state.open().unwrap();
    assert_eq!(recovered.state, StrategyState::Recovered);
    let draft = state
        .create(&recovered.revision, &fields("Recovered"), None, None, NOW)
        .unwrap();
    state.save(&draft.revision).unwrap();
    assert_eq!(
        fs::read(root.0.join("strategy-v2.json.invalid")).unwrap(),
        broken
    );
    let future = document("9.0.0");
    fs::write(root.primary(), &future).unwrap();
    let protected = state.open().unwrap();
    assert_eq!(protected.state, StrategyState::Protected);
    assert_eq!(
        state.create(&protected.revision, &fields("Wrong"), None, None, NOW),
        Err(HostError::Protected)
    );
    assert_eq!(state.save(&protected.revision), Err(HostError::Protected));
    assert_eq!(fs::read(root.primary()).unwrap(), future);
}

#[test]
fn out_of_range_text_does_not_disappear_or_trigger_quarantine() {
    let root = Root::new();
    let mut state = root.state();
    let valid = document("2.1.0");
    let long_name = "é".repeat(257);
    let long = String::from_utf8(valid)
        .unwrap()
        .replace("Practice", &long_name);
    fs::write(root.primary(), &long).unwrap();
    assert_eq!(state.open(), Err(HostError::StrategyInvalidText));
    assert_eq!(fs::read(root.primary()).unwrap(), long.as_bytes());
    assert!(!root.0.join("strategy-v2.json.invalid").exists());
    fs::remove_file(root.primary()).unwrap();
    let empty = state.open().unwrap();
    assert_eq!(
        state.create(&empty.revision, &fields(&long_name), None, None, NOW),
        Err(HostError::StrategyInvalidText)
    );
    assert_eq!(state.view(), empty);
}

#[test]
fn the_import_lock_returns_busy_and_can_be_retried_without_touching_legacy() {
    let root = Root::new();
    let bytes = document("2.1.0");
    let compact = serde_json::to_string(Document::parse(&bytes).unwrap().value()).unwrap();
    let source = legacy("strategy.repository.v2", &compact);
    fs::write(root.legacy(), &source).unwrap();
    let lock = fs::File::options()
        .write(true)
        .create_new(true)
        .open(root.0.join("strategy-v2.json.lock"))
        .unwrap();
    lock.try_lock().unwrap();
    let mut state = root.state();
    assert_eq!(state.open(), Err(HostError::Busy));
    assert_eq!(state.view_opened(), Err(HostError::Denied));
    assert!(!root.primary().exists());
    drop(lock);
    assert_eq!(state.open().unwrap().state, StrategyState::ImportedLegacy);
    assert_eq!(fs::read(root.legacy()).unwrap(), source.as_bytes());
}
