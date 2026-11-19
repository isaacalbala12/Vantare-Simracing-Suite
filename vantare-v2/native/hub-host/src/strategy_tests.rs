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
        // the name of the file is public now (`file`); its folder is not
        assert!(wire.contains(r#""file":{"name":"strategy-v2.json"}"#), "{wire}");
        for private in [
            "PRIVATE",
            "contractVersion",
            "1.2300",
            root.0.to_str().unwrap(),
        ] {
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
            current: Box::new(winner.clone())
        }
    );
    assert_eq!(fs::read(root.primary()).unwrap(), bytes);
    let wire = serde_json::to_string(&conflict).unwrap();
    assert!(!wire.contains("PRIVATE"));
    assert!(!wire.contains(root.0.to_str().unwrap()));
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
        state.create(&empty.revision, &fields(""), None, None, None, NOW),
        Err(HostError::Rejected)
    );
    assert_eq!(state.view(), empty);
    let mut form = fields("Fuji");
    form.team = "Local team".into();
    form.variant_note = "Reviewed".into();
    form.variant_mode = "wet".into();
    let draft = state
        .create(&empty.revision, &form, Some("90.472"), Some("1.83"), None, NOW)
        .unwrap();
    assert!(draft.dirty);
    assert_ne!(draft.revision, empty.revision);
    assert_eq!(draft.active_event_id.as_deref(), Some("native-event-1"));
    assert!(!root.primary().exists());
    assert_eq!(state.open(), Err(HostError::StrategyDirty));
    assert_eq!(
        state.create(&draft.revision, &form, None, None, None, NOW),
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
        state.confirm("event-1", "variant-1", &before.revision, &form, None),
        Err(HostError::StrategyInvalidInput { field: None })
    );
    assert_eq!(state.view(), before);
    form.variant_mode = "dry".into();
    let draft = state
        .confirm("event-1", "variant-1", &before.revision, &form, None)
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
        .confirm("event-1", "variant-1", &before.revision, &form, None)
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
    let a_draft = a.create(&r0, &fields("Winner"), None, None, None, NOW).unwrap();
    let b_draft = b.create(&r0, &fields("Other"), None, None, None, NOW).unwrap();
    let winner = a.save(&a_draft.revision).unwrap();
    let durable = fs::read(root.primary()).unwrap();
    assert_eq!(
        b.save(&b_draft.revision),
        Err(HostError::StrategyConflict {
            current: Box::new(winner.clone())
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
        .create(&recovered.revision, &fields("Recovered"), None, None, None, NOW)
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
        state.create(&protected.revision, &fields("Wrong"), None, None, None, NOW),
        Err(HostError::Protected)
    );
    assert_eq!(state.save(&protected.revision), Err(HostError::Protected));
    assert_eq!(fs::read(root.primary()).unwrap(), future);
}

#[test]
fn out_of_range_text_does_not_disappear_or_trigger_quarantine() {
    let root = Root::new();
    let mut state = root.state();
    let valid = String::from_utf8(document("2.1.0")).unwrap();
    let long_name = "é".repeat(257);
    for invalid in [
        valid.replace("Practice", &long_name),
        valid.replace("event-1", &"e".repeat(257)),
        valid.replace("variant-1", &"v".repeat(257)),
    ] {
        fs::write(root.primary(), &invalid).unwrap();
        assert_eq!(state.open(), Err(HostError::StrategyInvalidText));
        let view = state.view_opened().unwrap();
        assert_eq!(view.state, StrategyState::Protected);
        assert_eq!(view.revision, hash(invalid.as_bytes()));
        assert_eq!(view.events, Vec::<StrategyEventSummary>::new());
        assert!(!view.dirty);
        assert_eq!(fs::read(root.primary()).unwrap(), invalid.as_bytes());
        assert!(!root.0.join("strategy-v2.json.invalid").exists());
    }
    fs::remove_file(root.primary()).unwrap();
    let empty = state.open().unwrap();
    assert_eq!(
        state.create(&empty.revision, &fields(&long_name), None, None, None, NOW),
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

#[test]
fn a_failed_legacy_open_keeps_the_previously_open_document() {
    let root = Root::new();
    fs::write(root.primary(), document("2.1.0")).unwrap();
    let mut state = root.state();
    let before = state.open().unwrap();
    fs::remove_file(root.primary()).unwrap();
    let legacy = b"{broken";
    fs::write(root.legacy(), legacy).unwrap();
    assert_eq!(state.open(), Err(HostError::StrategyImportFailed));
    assert_eq!(state.view_opened().unwrap(), before);
    assert_eq!(fs::read(root.legacy()).unwrap(), legacy);
    assert!(!root.primary().exists());
}

#[test]
fn a_generation_change_discards_the_draft_and_requires_reopening() {
    let root = Root::new();
    let bytes = document("2.1.0");
    fs::write(root.primary(), &bytes).unwrap();
    let mut state = root.state();
    state.observe(Some("account-a"), true);
    let saved = state.open().unwrap();
    let draft = state
        .create(&saved.revision, &fields("Unsaved"), None, None, None, NOW)
        .unwrap();
    assert!(draft.dirty);
    state.observe(Some("account-a"), true);
    assert_eq!(state.view_opened().unwrap(), draft);

    state.observe(Some("account-b"), true);
    assert_eq!(state.view_opened(), Err(HostError::Denied));
    assert_eq!(state.save(&draft.revision), Err(HostError::Denied));
    assert_eq!(state.open().unwrap(), saved);
    assert_eq!(fs::read(root.primary()).unwrap(), bytes);
}

#[test]
fn a_dirty_document_rejects_confirmation_for_another_event() {
    let root = Root::new();
    let bytes = document("2.1.0");
    fs::write(root.primary(), &bytes).unwrap();
    let mut state = root.state();
    let opened = state.open().unwrap();
    let draft = state
        .confirm("event-1", "variant-1", &opened.revision, &fields("Edited"), None)
        .unwrap();
    assert!(draft.dirty);
    assert_eq!(
        state.confirm("event-2", "variant-1", &draft.revision, &fields("Other"), None),
        Err(HostError::StrategyDirty)
    );
    assert_eq!(state.view_opened().unwrap(), draft);
    assert_eq!(fs::read(root.primary()).unwrap(), bytes);
}

#[test]
fn a_contended_save_preserves_the_dirty_draft_for_a_retry() {
    let root = Root::new();
    let bytes = document("2.1.0");
    fs::write(root.primary(), &bytes).unwrap();
    let mut state = root.state();
    let opened = state.open().unwrap();
    let draft = state
        .create(&opened.revision, &fields("Unsaved"), None, None, None, NOW)
        .unwrap();
    let lock = fs::File::options()
        .write(true)
        .create_new(true)
        .open(root.0.join("strategy-v2.json.lock"))
        .unwrap();
    lock.try_lock().unwrap();
    assert_eq!(state.save(&draft.revision), Err(HostError::Busy));
    assert_eq!(state.view_opened().unwrap(), draft);
    assert_eq!(fs::read(root.primary()).unwrap(), bytes);
    drop(lock);
    assert!(!state.save(&draft.revision).unwrap().dirty);
}

#[test]
fn confirm_and_create_reject_control_characters_before_applying_changes() {
    let root = Root::new();
    let bytes = document("2.1.0");
    fs::write(root.primary(), &bytes).unwrap();
    let mut state = root.state();
    let opened = state.open().unwrap();
    let mut form = fields("Changed");
    form.variant_note = "one\ntwo".into();
    assert_eq!(
        state.confirm("event-1", "variant-1", &opened.revision, &form, None),
        Err(HostError::StrategyInvalidText)
    );
    for (pace, consumption) in [(Some("90.472\t"), None), (None, Some("1.83\r"))] {
        assert_eq!(
            state.create(&opened.revision, &fields("New"), pace, consumption, None, NOW),
            Err(HostError::StrategyInvalidText)
        );
    }
    assert_eq!(state.view_opened().unwrap(), opened);
    assert_eq!(fs::read(root.primary()).unwrap(), bytes);
}

#[test]
fn invalid_creation_leaves_the_existing_collection_byte_identical() {
    let root = Root::new();
    let bytes = document("2.1.0");
    fs::write(root.primary(), &bytes).unwrap();
    let mut state = root.state();
    let opened = state.open().unwrap();

    let cases = [
        (fields(""), None, None),
        (
            StrategyFields {
                duration_minutes: "0".into(),
                ..fields("New")
            },
            None,
            None,
        ),
        (
            StrategyFields {
                duration_minutes: "2.5".into(),
                ..fields("New")
            },
            None,
            None,
        ),
        (
            StrategyFields {
                fuel_capacity_liters: "-1".into(),
                ..fields("New")
            },
            None,
            None,
        ),
        (
            StrategyFields {
                pit_transit_seconds: "NaN".into(),
                ..fields("New")
            },
            None,
            None,
        ),
        (fields("New"), Some("0"), None),
        (fields("New"), None, Some("-2")),
        (
            StrategyFields {
                start_at: "2026-09-30 17:00".into(),
                ..fields("New")
            },
            None,
            None,
        ),
    ];
    for (form, pace, consumption) in cases {
        assert_eq!(
            state.create(&opened.revision, &form, pace, consumption, None, NOW),
            Err(HostError::Rejected)
        );
        assert_eq!(state.view_opened().unwrap(), opened);
        assert_eq!(fs::read(root.primary()).unwrap(), bytes);
    }
}

fn crowded_document(events: usize) -> Document {
    let mut doc = Document::empty(NOW).unwrap();
    for number in 0..events {
        let event = vantare_strategy::document::new_event(
            &format!("event-{number}"),
            "Practice",
            90,
            90.0,
            18.0,
        );
        doc.append_event(&event).unwrap();
    }
    doc
}

#[test]
fn an_additional_event_at_the_limit_rejects_the_proposal_without_protecting_the_file() {
    let root = Root::new();
    let doc = crowded_document(EVENT_LIMIT);
    fs::write(root.primary(), doc.bytes()).unwrap();
    let mut state = root.state();
    let opened = state.open().unwrap();
    assert_eq!(
        state.create(&opened.revision, &fields("One too many"), None, None, None, NOW),
        Err(HostError::StrategyInvalidText)
    );
    assert_eq!(state.view_opened().unwrap(), opened);
    assert_eq!(fs::read(root.primary()).unwrap(), doc.bytes());
}

#[test]
fn a_legacy_collection_over_the_limit_is_rejected_without_creating_a_primary() {
    let root = Root::new();
    let compact = serde_json::to_string(crowded_document(EVENT_LIMIT + 1).value()).unwrap();
    let source = legacy("strategy.repository.v2", &compact);
    fs::write(root.legacy(), &source).unwrap();
    let mut state = root.state();
    assert_eq!(state.open(), Err(HostError::StrategyInvalidText));
    assert_eq!(state.view_opened(), Err(HostError::Denied));
    assert!(!root.primary().exists());
    assert_eq!(fs::read(root.legacy()).unwrap(), source.as_bytes());
}

#[test]
fn a_switching_account_cancels_compute_and_keeps_its_prepared_document_private() {
    use std::sync::{atomic::Ordering, mpsc};

    let root = Root::new();
    let mut state = root.state();
    let original = document("2.1.0");
    fs::write(root.primary(), &original).unwrap();
    state.observe(Some("account-a"), true);
    let opened = state.open().unwrap();
    let (ready, started) = mpsc::sync_channel(1);
    let (release, wait) = mpsc::sync_channel(1);
    state
        .calculation
        .start(move |cancel| {
            ready.send(()).unwrap();
            wait.recv().unwrap();
            assert!(cancel.load(Ordering::Relaxed));
            Ok((
                Document::empty(NOW).unwrap(),
                StrategyPlanView::default(),
                None,
            ))
        })
        .unwrap();
    started.recv().unwrap();
    assert_eq!(state.view_opened().unwrap().revision, opened.revision);
    assert_eq!(
        state.view_opened().unwrap().plan.state,
        StrategyPlanState::Calculating
    );
    state.observe(Some("account-b"), true);
    assert_eq!(state.view_opened(), Err(HostError::Denied));
    release.send(()).unwrap();
    assert!(state.calculation.finish().is_none());
    assert_eq!(state.open().unwrap(), opened);
    assert_eq!(fs::read(root.primary()).unwrap(), original);
}

#[test]
fn a_licence_refresh_on_the_same_account_keeps_the_draft_and_the_running_calculation() {
    use std::sync::{atomic::Ordering, mpsc};

    let root = Root::new();
    let mut state = root.state();
    fs::write(root.primary(), document("2.1.0")).unwrap();
    assert!(state.observe(Some("account-a"), true));
    let saved = state.open().unwrap();
    let draft = state
        .create(&saved.revision, &fields("Unsaved"), None, None, None, NOW)
        .unwrap();
    let (ready, started) = mpsc::sync_channel(1);
    let (release, wait) = mpsc::sync_channel(1);
    state
        .calculation
        .start(move |cancel| {
            ready.send(()).unwrap();
            wait.recv().unwrap();
            assert!(!cancel.load(Ordering::Relaxed), "the refresh cancelled it");
            Ok((
                Document::empty(NOW).unwrap(),
                StrategyPlanView::default(),
                None,
            ))
        })
        .unwrap();
    started.recv().unwrap();
    let running = state.view_opened().unwrap();

    // access and identity are re-read around a refresh; each intermediate value
    // withholds service without discarding anything
    assert!(!state.observe(Some("account-a"), false));
    assert!(!state.observe(None, true));
    assert!(!state.observe(None, false));
    assert!(state.observe(Some("account-a"), true));
    assert_eq!(state.view_opened().unwrap(), running);
    assert!(state.view_opened().unwrap().dirty);
    assert_eq!(state.view_opened().unwrap().revision, draft.revision);

    release.send(()).unwrap();
    assert!(state.calculation.finish().is_some());
}
