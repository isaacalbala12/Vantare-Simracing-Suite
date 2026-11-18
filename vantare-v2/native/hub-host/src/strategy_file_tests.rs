#![allow(clippy::unwrap_used)]
//! E4a: «Abrir otro archivo…» y «Guardar como…». The path comes from the main
//! process through a ticket; the renderer never names or sees a file.
use super::*;
use std::{
    fs,
    path::Path,
    time::{Duration, Instant},
};
use vantare_strategy::{
    application::{self, SourceStatus},
    solver::Input,
};

const NOW: &str = "2026-11-18T00:00:00Z";
/// The id of a request of the main process: the host only holds tickets for those.
const ID: u32 = 0x8000_0007;
const LIFETIME: Duration = Duration::from_secs(STRATEGY_PICK_LIFETIME_SECONDS);
const MILLISECOND_BEFORE: Duration = Duration::from_millis(STRATEGY_PICK_LIFETIME_SECONDS * 1000 - 1);
const SECOND_BEFORE: Duration = Duration::from_secs(STRATEGY_PICK_LIFETIME_SECONDS - 1);

struct Root(PathBuf);
impl Root {
    fn new() -> Self {
        // the way the dialog spells it: no short names, no links
        let temp = fs::canonicalize(std::env::temp_dir()).unwrap();
        let temp = temp
            .to_str()
            .unwrap()
            .strip_prefix(r"\\?\")
            .map_or(temp.clone(), PathBuf::from);
        let path = temp.join(vantare_services::random_id().unwrap());
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn state(&self) -> State {
        State::new(self.0.clone())
    }
    fn primary(&self) -> PathBuf {
        self.0.join(PRIMARY)
    }
    fn file(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
    fn text(&self, name: &str) -> String {
        self.file(name).to_str().unwrap().to_owned()
    }
}
impl Drop for Root {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn document(first_event: &str) -> Vec<u8> {
    let event = |id: &str| {
        let mut event = vantare_strategy::document::new_event(id, "Practice", 90, 90.0, 18.0);
        let mut variant = event["strategies"][0].clone();
        variant["id"] = "variant-2".into();
        event["strategies"].as_array_mut().unwrap().push(variant);
        event
    };
    format!(
        "{{\"contractVersion\":\"strategy.v2\",\"schemaVersion\":\"2.1.0\",\"generatedAt\":\"{NOW}\",\"events\":[{}],\"activeEventId\":\"{first_event}\",\"future\":{{\"gain\":1.2300}}}}\n",
        event(first_event)
    )
    .into_bytes()
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

/// The ticket the renderer's request opens, then what the main process answers.
fn pick(
    state: &mut State,
    mode: StrategyFileMode,
    now: Instant,
) -> Result<StrategyView, HostError> {
    let revision = state.view().revision;
    state.pick_file(ID, mode, &revision, now)
}
fn answer(state: &mut State, path: Option<&str>, now: Instant) -> Result<StrategyView, HostError> {
    state.picked_file(
        &StrategyFileSelection {
            id: ID,
            path: path.map(str::to_owned),
        },
        now,
    )
}
fn choose(
    state: &mut State,
    mode: StrategyFileMode,
    path: &str,
) -> Result<StrategyView, HostError> {
    let now = Instant::now();
    pick(state, mode, now)?;
    answer(state, Some(path), now)
}
/// A document open from the primary file, clean.
fn opened(root: &Root) -> (State, StrategyView) {
    fs::write(root.primary(), document("event-1")).unwrap();
    let mut state = root.state();
    let view = state.open().unwrap();
    (state, view)
}
/// A dirty document: one event created on top of the primary file.
fn dirty(state: &mut State) -> StrategyView {
    let revision = state.view().revision;
    state
        .create(&revision, &fields("Unsaved"), None, None, NOW)
        .unwrap()
}
fn fuji_edit() -> (application::PreparedCalculation, Document) {
    let mut input: Input =
        serde_json::from_str(include_str!("../../strategy/testdata/fuji-1450-input.json")).unwrap();
    input.extra.clear();
    input.budget.p95_millis = 60_000;
    input.budget.max_candidates = 250_000;
    input.race_laps = 24;
    input.fuel_capacity_liters.value = 12.0;
    input.ve_capacity_percent.value = 0.0;
    input.ve_per_lap_percent.value = 0.0;
    (
        application::prepare_manual(input).unwrap(),
        Document::empty(NOW).unwrap(),
    )
}
/// A feasible plan whose schedule was moved, so that the edit is pending.
fn pending_edit(state: &mut State) {
    let (prepared, document) = fuji_edit();
    let outcome = application::calculate(
        &prepared,
        SourceStatus::Open,
        &std::sync::atomic::AtomicBool::new(false),
    )
    .unwrap();
    let view = calculation::project(prepared.input(), &outcome, "Pilot").unwrap();
    let editing = editing::Editing::new(prepared.input(), &outcome, &view, "Pilot").unwrap();
    let plan = editing.plan_view(None);
    state
        .calculation
        .start(move |_| Ok((document, plan, Some(editing))))
        .unwrap();
    state.calculation.finish().unwrap();
    let id = state.calculation.view().compute_id.unwrap();
    let moved = (0..4).any(|index| {
        [1, -1].into_iter().any(|delta| {
            state
                .calculation
                .edit(id, |editing| editing.move_stop(index, delta))
                .is_ok_and(|done| done.is_some())
        })
    });
    assert!(moved && state.calculation.edit_pending());
}

// ---------------------------------------------------------------- the ticket

#[test]
fn the_request_is_acknowledged_with_the_current_view_and_keeps_one_ticket() {
    let root = Root::new();
    let (mut state, view) = opened(&root);
    let now = Instant::now();
    assert_eq!(
        state.pick_file(ID, StrategyFileMode::Open, &view.revision, now),
        Ok(view.clone())
    );
    // a second request is busy while the first one is alive
    assert_eq!(
        state.pick_file(ID + 1, StrategyFileMode::Open, &view.revision, now),
        Err(HostError::Busy)
    );
    assert_eq!(
        state.pick_file(
            ID + 1,
            StrategyFileMode::SaveAs,
            &view.revision,
            now + MILLISECOND_BEFORE
        ),
        Err(HostError::Busy)
    );
    // a dead ticket does not block the next one
    assert!(
        state
            .pick_file(ID + 1, StrategyFileMode::Open, &view.revision, now + LIFETIME)
            .is_ok()
    );
    assert_eq!(state.view(), view, "the request changes nothing");
}

#[test]
fn a_ticket_serves_one_answer_and_only_for_its_own_id() {
    let root = Root::new();
    let (mut state, view) = opened(&root);
    fs::write(root.file("other.json"), document("event-9")).unwrap();
    let now = Instant::now();
    pick(&mut state, StrategyFileMode::Open, now).unwrap();
    let other = StrategyFileSelection {
        id: ID + 1,
        path: Some(root.text("other.json")),
    };
    assert_eq!(state.picked_file(&other, now), Err(HostError::Denied));
    assert_eq!(state.view(), view, "a stranger's answer changed nothing");
    // the right id still works afterwards, once
    let done = answer(&mut state, Some(&root.text("other.json")), now).unwrap();
    assert_eq!(done.active_event_id.as_deref(), Some("event-9"));
    assert_eq!(
        answer(&mut state, Some(&root.text("other.json")), now),
        Err(HostError::Denied)
    );
}

#[test]
fn a_ticket_expires_after_120_seconds() {
    assert_eq!(STRATEGY_PICK_LIFETIME_SECONDS, 120);
    let root = Root::new();
    let (mut state, view) = opened(&root);
    fs::write(root.file("late.json"), document("event-9")).unwrap();
    let now = Instant::now();
    pick(&mut state, StrategyFileMode::Open, now).unwrap();
    assert_eq!(
        answer(
            &mut state,
            Some(&root.text("late.json")),
            now + LIFETIME
        ),
        Err(HostError::StrategyPickExpired)
    );
    assert_eq!(state.view(), view);
    // the expired ticket is gone: a second answer finds none
    assert_eq!(
        answer(&mut state, Some(&root.text("late.json")), now),
        Err(HostError::Denied)
    );
    // one second before the end it still works
    pick(&mut state, StrategyFileMode::Open, now).unwrap();
    assert!(
        answer(
            &mut state,
            Some(&root.text("late.json")),
            now + SECOND_BEFORE
        )
        .is_ok()
    );
}

#[test]
fn an_answer_without_a_ticket_is_ignored_and_creates_nothing() {
    let root = Root::new();
    let (mut state, view) = opened(&root);
    let target = root.text("never.json");
    assert_eq!(
        answer(&mut state, Some(&target), Instant::now()),
        Err(HostError::Denied)
    );
    assert_eq!(state.view(), view);
    assert!(!root.file("never.json").exists());
    // not even a saveAs ticket from before an account change survives it
    pick(&mut state, StrategyFileMode::SaveAs, Instant::now()).unwrap();
    assert!(state.observe(Some("account-a"), true));
    assert!(state.observe(Some("account-b"), true));
    assert_eq!(
        answer(&mut state, Some(&target), Instant::now()),
        Err(HostError::Denied)
    );
    assert!(!root.file("never.json").exists());
}

#[test]
fn cancelling_consumes_the_ticket_and_changes_nothing() {
    let root = Root::new();
    let (mut state, view) = opened(&root);
    let now = Instant::now();
    pick(&mut state, StrategyFileMode::Open, now).unwrap();
    assert_eq!(answer(&mut state, None, now), Ok(view.clone()));
    assert_eq!(answer(&mut state, None, now), Err(HostError::Denied));
    assert!(pick(&mut state, StrategyFileMode::SaveAs, now).is_ok());
}

#[test]
fn the_ticket_is_bound_to_the_revision_of_the_request_and_of_the_answer() {
    let root = Root::new();
    let (mut state, view) = opened(&root);
    let outdated = "0".repeat(64);
    let conflict = state.pick_file(ID, StrategyFileMode::Open, &outdated, Instant::now());
    assert_eq!(
        conflict,
        Err(HostError::StrategyConflict {
            current: Box::new(view.clone())
        })
    );
    assert_eq!(
        state.pick_file(ID, StrategyFileMode::Open, "not a revision", Instant::now()),
        Err(HostError::Rejected)
    );
    // the document changes between the request and the answer
    fs::write(root.file("other.json"), document("event-9")).unwrap();
    let now = Instant::now();
    pick(&mut state, StrategyFileMode::Open, now).unwrap();
    fs::write(root.primary(), document("event-5")).unwrap();
    let changed = state.discard(&view.revision).unwrap();
    assert_ne!(changed.revision, view.revision);
    assert_eq!(
        answer(&mut state, Some(&root.text("other.json")), now),
        Err(HostError::StrategyConflict {
            current: Box::new(changed.clone())
        })
    );
    assert_eq!(state.view(), changed, "the stale answer opened nothing");
}

#[test]
fn a_ticket_needs_an_open_session() {
    let root = Root::new();
    fs::write(root.primary(), document("event-1")).unwrap();
    let mut state = root.state();
    assert_eq!(
        state.pick_file(ID, StrategyFileMode::Open, &"0".repeat(64), Instant::now()),
        Err(HostError::Denied)
    );
}

// ------------------------------------------------------------- opening a file

#[test]
fn open_refuses_unsaved_changes_a_running_calculation_and_a_pending_edit() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    let draft = dirty(&mut state);
    let now = Instant::now();
    assert_eq!(
        pick(&mut state, StrategyFileMode::Open, now),
        Err(HostError::StrategyDirty)
    );
    state.save(&draft.revision).unwrap();

    pending_edit(&mut state);
    assert_eq!(
        pick(&mut state, StrategyFileMode::Open, now),
        Err(HostError::StrategyEditPending)
    );
    let id = state.calculation.view().compute_id.unwrap();
    state
        .reset_edit(&state.view().revision, id)
        .unwrap();
    assert!(pick(&mut state, StrategyFileMode::Open, now).is_ok());
}

#[test]
fn open_refuses_while_a_calculation_runs() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    let (release, wait) = std::sync::mpsc::sync_channel::<()>(1);
    state.test_start_calculation(move |_| {
        wait.recv().unwrap();
        Document::empty(NOW).unwrap()
    });
    assert_eq!(
        pick(&mut state, StrategyFileMode::Open, Instant::now()),
        Err(HostError::Busy)
    );
    release.send(()).unwrap();
    state.test_join_calculation();
}

#[test]
fn the_answer_rechecks_what_the_request_checked() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    fs::write(root.file("other.json"), document("event-9")).unwrap();
    let now = Instant::now();
    pick(&mut state, StrategyFileMode::Open, now).unwrap();
    // an unsaved draft appears in between (same revision is impossible: the
    // revision changes, and the answer is a conflict; the file stays closed)
    let draft = dirty(&mut state);
    let result = answer(&mut state, Some(&root.text("other.json")), now);
    assert!(
        matches!(
            result,
            Err(HostError::StrategyConflict { .. } | HostError::StrategyDirty)
        ),
        "{result:?}"
    );
    assert_eq!(state.view().revision, draft.revision);
    assert!(state.view().dirty);
    assert_eq!(state.view().active_event_id, draft.active_event_id);
}

#[test]
fn open_loads_the_other_file_discards_the_plan_and_leaves_the_primary_alone() {
    let root = Root::new();
    let (mut state, first) = opened(&root);
    let primary = fs::read(root.primary()).unwrap();
    let other = document("event-9");
    fs::write(root.file("carreras-2026.json"), &other).unwrap();
    assert_eq!(first.file, Some(StrategyFile { name: PRIMARY.into() }));
    let view = choose(
        &mut state,
        StrategyFileMode::Open,
        &root.text("carreras-2026.json"),
    )
    .unwrap();
    assert_eq!(view.file.as_ref().unwrap().name, "carreras-2026.json");
    assert_eq!(view.active_event_id.as_deref(), Some("event-9"));
    assert_eq!(view.state, StrategyState::Ready);
    assert!(!view.dirty);
    assert_eq!(view.plan, StrategyPlanView::default());
    assert_eq!(view.revision, vantare_services::content_hash(&other));
    assert_eq!(state.view(), view);
    assert_eq!(fs::read(root.primary()).unwrap(), primary);
    assert_eq!(fs::read(root.file("carreras-2026.json")).unwrap(), other);
}

#[test]
fn the_opened_file_is_where_the_document_lives_from_then_on() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    let primary = fs::read(root.primary()).unwrap();
    fs::write(root.file("a.json"), document("event-9")).unwrap();
    let view = choose(&mut state, StrategyFileMode::Open, &root.text("a.json")).unwrap();
    // select and save write the opened file, never the primary
    let selected = state
        .select("event-9", "variant-2", &view.revision)
        .unwrap();
    assert_eq!(selected.active_strategy_id.as_deref(), Some("variant-2"));
    assert_eq!(
        Document::parse(&fs::read(root.file("a.json")).unwrap())
            .unwrap()
            .value()["events"][0]["activeStrategyId"],
        "variant-2"
    );
    let draft = dirty(&mut state);
    state.save(&draft.revision).unwrap();
    assert!(
        String::from_utf8(fs::read(root.file("a.json")).unwrap())
            .unwrap()
            .contains("Unsaved")
    );
    assert_eq!(fs::read(root.primary()).unwrap(), primary);
    // discard reloads the opened file, and a screen opening again keeps it
    fs::write(root.file("a.json"), document("event-8")).unwrap();
    let discarded = state.discard(&state.view().revision.clone()).unwrap();
    assert_eq!(discarded.active_event_id.as_deref(), Some("event-8"));
    assert_eq!(discarded.file.unwrap().name, "a.json");
    let reopened = state.open().unwrap();
    assert_eq!(reopened.file.unwrap().name, "a.json");
    assert_eq!(reopened.active_event_id.as_deref(), Some("event-8"));
    // a conflict on that file answers with that file's view
    fs::write(root.file("a.json"), document("event-7")).unwrap();
    let draft = dirty(&mut state);
    let Err(HostError::StrategyConflict { current }) = state.save(&draft.revision) else {
        panic!("another writer changed the file");
    };
    assert_eq!(current.file.unwrap().name, "a.json");
    assert_eq!(current.active_event_id.as_deref(), Some("event-7"));
}

#[test]
fn a_new_account_goes_back_to_the_primary_file() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    assert!(state.observe(Some("account-a"), true));
    fs::write(root.file("a.json"), document("event-9")).unwrap();
    state.open().unwrap();
    choose(&mut state, StrategyFileMode::Open, &root.text("a.json")).unwrap();
    assert!(state.observe(Some("account-b"), true));
    assert_eq!(state.view_opened(), Err(HostError::Denied));
    assert_eq!(state.open().unwrap().file.unwrap().name, PRIMARY);
}

/// Every file of a folder with its bytes.
fn listing(dir: &Path) -> std::collections::BTreeMap<String, Vec<u8>> {
    fs::read_dir(dir)
        .unwrap()
        .map(|entry| {
            let entry = entry.unwrap();
            let bytes = fs::read(entry.path()).unwrap_or_default();
            (entry.file_name().to_string_lossy().into_owned(), bytes)
        })
        .collect()
}

#[test]
fn a_damaged_file_is_a_state_and_its_copy_goes_inside_the_data_directory_only() {
    let root = Root::new();
    let elsewhere = Root::new(); // the Desktop or Downloads of the user
    let (mut state, _) = opened(&root);
    let damaged = b"{ damaged";
    fs::write(elsewhere.file("broken.json"), damaged).unwrap();
    let before = listing(&elsewhere.0);
    let view = choose(
        &mut state,
        StrategyFileMode::Open,
        &elsewhere.text("broken.json"),
    )
    .unwrap();
    assert_eq!(view.state, StrategyState::Recovered);
    assert_eq!(view.file.as_ref().unwrap().name, "broken.json");
    assert_eq!(view.revision, vantare_services::content_hash(damaged));
    // nothing was written where the user chose the file: same files, same bytes
    assert_eq!(listing(&elsewhere.0), before);
    // the copy is in the data directory, named by the content and not by the path
    let copies: Vec<String> = listing(&root.0)
        .into_keys()
        .filter(|name| name.ends_with(".invalid"))
        .collect();
    assert_eq!(copies.len(), 1, "{copies:?}");
    assert_eq!(fs::read(root.file(&copies[0])).unwrap(), damaged);
    let folder = elsewhere.0.file_name().unwrap().to_str().unwrap();
    for leak in [folder, "broken", "Temp"] {
        assert!(!copies[0].contains(leak), "{leak} in {}", copies[0]);
    }
    // the same file opened again finds its copy and writes no second one
    choose(
        &mut state,
        StrategyFileMode::Open,
        &elsewhere.text("broken.json"),
    )
    .unwrap();
    let again: Vec<String> = listing(&root.0)
        .into_keys()
        .filter(|name| name.ends_with(".invalid"))
        .collect();
    assert_eq!(again, copies);
    assert_eq!(listing(&elsewhere.0), before);
    // and no warning text (it carries paths) reaches the view
    let wire = serde_json::to_string(&state.view()).unwrap();
    assert!(!wire.contains(folder), "{wire}");
}

#[test]
fn discard_of_a_damaged_opened_file_also_keeps_the_copy_in_the_data_directory() {
    let root = Root::new();
    let elsewhere = Root::new();
    let (mut state, _) = opened(&root);
    fs::write(elsewhere.file("a.json"), document("event-9")).unwrap();
    let view = choose(&mut state, StrategyFileMode::Open, &elsewhere.text("a.json")).unwrap();
    fs::write(elsewhere.file("a.json"), b"{ broke later").unwrap();
    let before = listing(&elsewhere.0);
    let view = state.discard(&view.revision).unwrap();
    assert_eq!(view.state, StrategyState::Recovered);
    assert_eq!(listing(&elsewhere.0), before);
    assert!(
        listing(&root.0)
            .keys()
            .any(|name| name.ends_with(".invalid"))
    );
}

#[test]
fn a_future_version_is_protected_and_cannot_be_saved_over() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    let future = String::from_utf8(document("event-9"))
        .unwrap()
        .replace("\"schemaVersion\":\"2.1.0\"", "\"schemaVersion\":\"9.0.0\"");
    fs::write(root.file("future.json"), &future).unwrap();
    let view = choose(&mut state, StrategyFileMode::Open, &root.text("future.json")).unwrap();
    assert_eq!(view.state, StrategyState::Protected);
    assert_eq!(view.file.unwrap().name, "future.json");
    assert_eq!(fs::read_to_string(root.file("future.json")).unwrap(), future);
    assert_eq!(
        state.save(&state.view().revision.clone()),
        Err(HostError::Protected)
    );
    // a protected document can still leave through «Abrir», not through «Guardar como»
    assert_eq!(
        pick(&mut state, StrategyFileMode::SaveAs, Instant::now()),
        Err(HostError::Protected)
    );
    assert!(pick(&mut state, StrategyFileMode::Open, Instant::now()).is_ok());
}

#[test]
fn a_file_over_twelve_mebibytes_is_too_large_and_the_document_stays() {
    let root = Root::new();
    let (mut state, view) = opened(&root);
    let big = fs::File::create(root.file("big.json")).unwrap();
    big.set_len(u64::try_from(vantare_strategy::document::MAX_BYTES).unwrap() + 1)
        .unwrap();
    drop(big);
    assert_eq!(
        choose(&mut state, StrategyFileMode::Open, &root.text("big.json")),
        Err(HostError::StrategyFileTooLarge)
    );
    assert_eq!(state.view(), view);
    assert!(!root.file("big.json.invalid").exists());
    // exactly at the limit it is read (and found damaged, which is a state)
    let at = fs::File::create(root.file("limit.json")).unwrap();
    at.set_len(u64::try_from(vantare_strategy::document::MAX_BYTES).unwrap())
        .unwrap();
    drop(at);
    assert_ne!(
        choose(&mut state, StrategyFileMode::Open, &root.text("limit.json")),
        Err(HostError::StrategyFileTooLarge)
    );
}

#[test]
fn a_file_that_cannot_be_read_is_unavailable_and_the_document_stays() {
    let root = Root::new();
    let (mut state, view) = opened(&root);
    fs::create_dir(root.file("folder.json")).unwrap();
    fs::write(root.file(".env.json"), document("event-9")).unwrap();
    for name in ["missing.json", "folder.json", ".env.json"] {
        assert_eq!(
            choose(&mut state, StrategyFileMode::Open, &root.text(name)),
            Err(HostError::StrategyFileUnavailable),
            "{name}"
        );
        assert_eq!(state.view(), view, "{name}");
    }
    assert!(!root.file("missing.json.invalid").exists());
}

#[test]
fn a_path_the_main_process_could_not_have_chosen_is_unavailable() {
    let root = Root::new();
    let (mut state, view) = opened(&root);
    // longer than any file system accepts, so nothing needs to exist
    let long = format!("{}.json", "n".repeat(300));
    let huge = format!("{}/{}", root.0.display(), "d".repeat(STRATEGY_PICK_PATH_MAX));
    for path in [
        "relative/file.json".to_owned(),
        "file.json".to_owned(),
        String::new(),
        format!("{}\0.json", root.text("x")),
        r"\\server\share\file.json".to_owned(),
        root.text(&long),
        huge,
    ] {
        assert_eq!(
            choose(&mut state, StrategyFileMode::Open, &path),
            Err(HostError::StrategyFileUnavailable),
            "{path:?}"
        );
        assert_eq!(state.view(), view);
    }
}

// ------------------------------------------------------------------ saving as

#[test]
fn save_as_writes_the_same_bytes_to_a_new_file_and_the_document_moves_there() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    let primary = fs::read(root.primary()).unwrap();
    let draft = dirty(&mut state);
    let doc_bytes = state.doc.as_ref().unwrap().bytes().to_vec();
    let view = choose(&mut state, StrategyFileMode::SaveAs, &root.text("copy.json")).unwrap();
    assert_eq!(fs::read(root.file("copy.json")).unwrap(), doc_bytes);
    assert_eq!(view.file.as_ref().unwrap().name, "copy.json");
    assert!(!view.dirty);
    assert_eq!(view.revision, draft.revision, "it is the same document");
    assert_eq!(view.events, draft.events);
    assert_eq!(view.active_event_id, draft.active_event_id);
    assert_eq!(fs::read(root.primary()).unwrap(), primary, "the primary is untouched");
    // the document lives in the new file now
    let next = state
        .select("native-event-1", "variant-1", &view.revision)
        .unwrap();
    assert!(!next.dirty);
    let again = dirty(&mut state);
    state.save(&again.revision).unwrap();
    assert!(
        String::from_utf8(fs::read(root.file("copy.json")).unwrap())
            .unwrap()
            .contains("Unsaved")
    );
    assert_eq!(fs::read(root.primary()).unwrap(), primary);
}

#[test]
fn save_as_keeps_the_plan_it_is_a_copy_of_the_same_document() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    pending_edit(&mut state);
    let before = state.view().plan;
    let view = choose(&mut state, StrategyFileMode::SaveAs, &root.text("copy.json")).unwrap();
    assert_eq!(view.plan, before);
}

#[test]
fn save_as_never_overwrites_an_unobserved_file() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    let draft = dirty(&mut state);
    let theirs = b"someone else's bytes";
    fs::write(root.file("theirs.json"), theirs).unwrap();
    assert_eq!(
        choose(&mut state, StrategyFileMode::SaveAs, &root.text("theirs.json")),
        Err(HostError::StrategyTargetExists)
    );
    assert_eq!(fs::read(root.file("theirs.json")).unwrap(), theirs);
    // nothing moved: still the unsaved draft of the primary file
    let view = state.view();
    assert_eq!(view.file.unwrap().name, PRIMARY);
    assert!(view.dirty);
    assert_eq!(view.revision, draft.revision);
}

#[test]
fn save_as_the_current_file_is_a_normal_save() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    let draft = dirty(&mut state);
    let view = choose(&mut state, StrategyFileMode::SaveAs, &root.text(PRIMARY)).unwrap();
    assert!(!view.dirty);
    assert_eq!(view.file.as_ref().unwrap().name, PRIMARY);
    assert_eq!(view.revision, draft.revision);
    assert_eq!(
        fs::read(root.primary()).unwrap(),
        state.doc.as_ref().unwrap().bytes()
    );
    // and so does a clean document: nothing is written, nothing breaks
    let clean = choose(&mut state, StrategyFileMode::SaveAs, &root.text(PRIMARY)).unwrap();
    assert_eq!(clean, view);
}

#[cfg(windows)]
#[test]
fn save_as_the_current_file_found_through_another_spelling_is_still_a_normal_save() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    dirty(&mut state);
    let spelled = root.text(&PRIMARY.to_uppercase()).replace('\\', "/");
    assert!(choose(&mut state, StrategyFileMode::SaveAs, &spelled).is_ok());
    assert!(!state.view().dirty);
}

#[test]
fn another_document_never_overwrites_the_primary_file() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    let primary = fs::read(root.primary()).unwrap();
    fs::write(root.file("other.json"), document("event-9")).unwrap();
    choose(&mut state, StrategyFileMode::Open, &root.text("other.json")).unwrap();
    let draft = dirty(&mut state);
    // the primary exists: a file the host has not observed
    assert_eq!(
        choose(&mut state, StrategyFileMode::SaveAs, &root.text(PRIMARY)),
        Err(HostError::StrategyTargetExists)
    );
    assert_eq!(fs::read(root.primary()).unwrap(), primary);
    // and a primary that is missing is not created from another document either
    fs::remove_file(root.primary()).unwrap();
    assert_eq!(
        choose(&mut state, StrategyFileMode::SaveAs, &root.text(PRIMARY)),
        Err(HostError::StrategyTargetExists)
    );
    assert!(!root.primary().exists());
    let view = state.view();
    assert_eq!(view.file.unwrap().name, "other.json");
    assert!(view.dirty);
    assert_eq!(view.revision, draft.revision);
}

#[test]
fn save_as_needs_a_writable_document() {
    let root = Root::new();
    let mut state = root.state();
    state.open().unwrap();
    // nothing to save: no document yet
    assert_eq!(
        pick(&mut state, StrategyFileMode::SaveAs, Instant::now()),
        Err(HostError::Rejected)
    );
}

#[test]
fn a_target_that_cannot_be_written_is_unavailable_and_nothing_moves() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    let draft = dirty(&mut state);
    // a folder with that name: the host cannot write a file there
    fs::create_dir(root.file("folder.json")).unwrap();
    let result = choose(&mut state, StrategyFileMode::SaveAs, &root.text("folder.json"));
    assert!(
        matches!(
            result,
            Err(HostError::StrategyFileUnavailable | HostError::StrategyTargetExists)
        ),
        "{result:?}"
    );
    let view = state.view();
    assert_eq!(view.file.unwrap().name, PRIMARY);
    assert!(view.dirty);
    assert_eq!(view.revision, draft.revision);
}

// ----------------------------------------------------------------- on the wire

#[test]
fn no_path_goes_over_the_wire_only_the_last_segment() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    fs::write(root.file("carreras-2026.json"), document("event-9")).unwrap();
    let view = choose(
        &mut state,
        StrategyFileMode::Open,
        &root.text("carreras-2026.json"),
    )
    .unwrap();
    let wire = serde_json::to_string(&view).unwrap();
    assert!(wire.contains(r#""file":{"name":"carreras-2026.json"}"#), "{wire}");
    for private in [
        root.0.to_str().unwrap(),
        &root.0.to_str().unwrap().replace('\\', "\\\\"),
        "Temp",
        "/",
    ] {
        assert!(!wire.contains(private), "{private}: {wire}");
    }
    // the acknowledgement carries the same view, hence no path either
    let ack = pick(&mut state, StrategyFileMode::SaveAs, Instant::now()).unwrap();
    assert_eq!(ack, view);
    assert_eq!(serde_json::to_string(&ack).unwrap(), wire);
}

#[test]
fn the_name_is_one_short_segment_without_separators_or_controls() {
    for name in ["a.json", "carreras 2026 (final).json", "ñandú.json"] {
        assert!(valid_file_name(name), "{name}");
    }
    // the same table is in the contract test of the web side (strategy-file-contract)
    for name in [
        "x".repeat(256),
        "ñ".repeat(128),
        "a b (1).json".to_owned(),
        "a.b.c".to_owned(),
    ] {
        assert!(valid_file_name(&name), "{name:?}");
    }
    for name in [
        String::new(),
        ".".into(),
        "..".into(),
        "a/b.json".into(),
        "a\\b.json".into(),
        "a:b.json".into(),
        "a\u{0}b.json".into(),
        "a\nb.json".into(),
        "a\u{7f}b.json".into(),
        "a\u{85}b.json".into(),
        "a\u{202e}b.json".into(),
        "a\u{2067}b.json".into(),
        "a\u{200f}b.json".into(),
        "x".repeat(257),
        "ñ".repeat(129),
    ] {
        assert!(!valid_file_name(&name), "{name:?}");
    }
}

#[test]
fn the_wire_names_are_the_documented_ones() {
    assert_eq!(
        serde_json::to_value([StrategyFileMode::Open, StrategyFileMode::SaveAs]).unwrap(),
        serde_json::json!(["open", "saveAs"])
    );
    for sent in [
        serde_json::json!({"id":1,"path":null,"command":"x"}),
        serde_json::json!({"id":1}), // a missing path is not a cancelled dialog
        serde_json::json!({"path":null}),
    ] {
        assert!(
            serde_json::from_value::<StrategyFileSelection>(sent.clone()).is_err(),
            "{sent}"
        );
    }
    assert_eq!(
        serde_json::from_value::<StrategyFileSelection>(serde_json::json!({"id":1,"path":null}))
            .unwrap(),
        StrategyFileSelection { id: 1, path: None }
    );
    assert_eq!(STRATEGY_PICK_COOLDOWN_MS, 1500);
    assert_eq!(STRATEGY_PICK_LIFETIME_SECONDS, 120);
    assert_eq!(
        serde_json::to_value(StrategyFile { name: "a.json".into() }).unwrap(),
        serde_json::json!({"name":"a.json"})
    );
    for (error, kind) in [
        (HostError::StrategyFileUnavailable, "strategyFileUnavailable"),
        (HostError::StrategyFileTooLarge, "strategyFileTooLarge"),
        (HostError::StrategyTargetExists, "strategyTargetExists"),
        (HostError::StrategyPickExpired, "strategyPickExpired"),
    ] {
        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({ "kind": kind })
        );
    }
}

// ----------------------------------------------- review of the security tests

fn both_modes() -> [StrategyFileMode; 2] {
    [StrategyFileMode::Open, StrategyFileMode::SaveAs]
}

#[test]
fn a_path_is_a_plain_file_on_a_disk_for_open_and_save_as_alike() {
    let root = Root::new();
    let (mut state, view) = opened(&root);
    let before = listing(&root.0);
    let unique = "vantare-e4a-relative-check.json";
    let mut paths = vec![
        unique.to_owned(),
        format!("sub/{unique}"),
        format!("{}/../{unique}", root.0.display()),
        format!("{}/sub/../x.json", root.0.display()),
        root.text("a.json."),
        root.text("a.json "),
        root.text("a.json:stream"),
        root.text("a.json::$DATA"),
        root.text("strategy-v2.json:x"),
        root.text(".env"),
        root.text(".ENV.local"),
        root.text(".env.json"),
        root.text("CON.json"),
        root.text("con"),
        root.text("NUL"),
        root.text("nul.txt"),
        root.text("Com1.json"),
        root.text("LPT9"),
        root.text("AUX.json"),
        root.text("PRN"),
    ];
    if cfg!(windows) {
        paths.extend([
            format!(r"\\?\{}", root.text("a.json")),
            r"\\.\pipe\vantare-e4a".to_owned(),
            r"\\.\C:\x.json".to_owned(),
            r"\\server\share\a.json".to_owned(),
            "C:e4a-drive-relative.json".to_owned(),
            r"\e4a-rooted.json".to_owned(),
        ]);
    }
    for mode in both_modes() {
        for path in &paths {
            assert_eq!(
                choose(&mut state, mode, path),
                Err(HostError::StrategyFileUnavailable),
                "{mode:?} {path:?}"
            );
            assert_eq!(state.view(), view, "{mode:?} {path:?}");
        }
    }
    assert_eq!(listing(&root.0), before, "nothing was created");
    assert!(!Path::new(unique).exists(), "nothing in the working directory");
}

#[test]
fn a_device_name_never_reaches_the_file_system() {
    // CON would hang the read; NUL would swallow the write
    let root = Root::new();
    let (mut state, _) = opened(&root);
    for name in ["CON", "con.json", "PRN.txt", "aux", "NUL", "COM1", "com9.json", "LPT1", "lpt9.json"] {
        for mode in both_modes() {
            assert_eq!(
                choose(&mut state, mode, &root.text(name)),
                Err(HostError::StrategyFileUnavailable),
                "{mode:?} {name}"
            );
        }
    }
}

#[cfg(windows)]
fn junction(link: &Path, target: &Path) {
    let status = std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(link)
        .arg(target)
        .output()
        .unwrap();
    assert!(status.status.success(), "{status:?}");
}

#[cfg(windows)]
#[test]
fn a_file_reached_through_a_junction_is_refused() {
    let root = Root::new();
    let elsewhere = Root::new();
    let (mut state, view) = opened(&root);
    fs::write(root.file("real.json"), document("event-9")).unwrap();
    junction(&elsewhere.file("link"), &root.0);
    let through = elsewhere.file("link").join("real.json");
    assert_eq!(
        choose(&mut state, StrategyFileMode::Open, through.to_str().unwrap()),
        Err(HostError::StrategyFileUnavailable)
    );
    assert_eq!(state.view(), view);
}

#[cfg(unix)]
#[test]
fn a_symbolic_link_is_refused_even_when_it_points_at_a_good_file() {
    let root = Root::new();
    let (mut state, view) = opened(&root);
    fs::write(root.file("real.json"), document("event-9")).unwrap();
    std::os::unix::fs::symlink(root.file("real.json"), root.file("a.json")).unwrap();
    std::os::unix::fs::symlink(root.file("real.json"), root.file("b.env")).unwrap();
    for name in ["a.json", "b.env"] {
        assert_eq!(
            choose(&mut state, StrategyFileMode::Open, &root.text(name)),
            Err(HostError::StrategyFileUnavailable),
            "{name}"
        );
    }
    assert_eq!(state.view(), view);
}

/// The ways the primary file can be spelled from a document that lives elsewhere.
fn primary_spellings(root: &Root, elsewhere: &Root) -> Vec<(String, bool)> {
    let mut spellings = vec![
        (root.text(PRIMARY), true),
        // `.` and `..` segments are refused outright
        (format!("{}/./{PRIMARY}", root.0.display()), false),
        (format!("{}/sub/../{PRIMARY}", root.0.display()), false),
    ];
    if cfg!(windows) {
        spellings.push((root.text(&PRIMARY.to_uppercase()), true));
        spellings.push((root.text(PRIMARY).replace('\\', "/"), true));
    }
    #[cfg(windows)]
    {
        junction(&elsewhere.file("link"), &root.0);
        spellings.push((elsewhere.file("link").join(PRIMARY).to_str().unwrap().to_owned(), true));
    }
    let _ = elsewhere;
    spellings
}

#[test]
fn another_document_never_writes_the_primary_by_any_spelling_existing_or_not() {
    for primary_exists in [true, false] {
        let root = Root::new();
        let elsewhere = Root::new();
        let (mut state, _) = opened(&root);
        let primary = fs::read(root.primary()).unwrap();
        fs::write(elsewhere.file("other.json"), document("event-9")).unwrap();
        choose(
            &mut state,
            StrategyFileMode::Open,
            &elsewhere.text("other.json"),
        )
        .unwrap();
        let draft = dirty(&mut state);
        if !primary_exists {
            fs::remove_file(root.primary()).unwrap();
        }
        let before = listing(&root.0);
        for (spelling, same_file) in primary_spellings(&root, &elsewhere) {
            let result = choose(&mut state, StrategyFileMode::SaveAs, &spelling);
            if same_file {
                assert_eq!(
                    result,
                    Err(HostError::StrategyTargetExists),
                    "{spelling} (exists: {primary_exists})"
                );
            } else {
                assert!(result.is_err(), "{spelling}");
            }
            assert_eq!(listing(&root.0), before, "{spelling} (exists: {primary_exists})");
            let view = state.view();
            assert_eq!(view.file.unwrap().name, "other.json");
            assert!(view.dirty);
            assert_eq!(view.revision, draft.revision);
        }
        if primary_exists {
            assert_eq!(fs::read(root.primary()).unwrap(), primary);
        } else {
            assert!(!root.primary().exists());
        }
    }
}

#[cfg(windows)]
#[test]
fn the_short_8_3_name_of_the_primary_is_the_primary() {
    let root = Root::new();
    let elsewhere = Root::new();
    let (mut state, _) = opened(&root);
    fs::write(elsewhere.file("other.json"), document("event-9")).unwrap();
    choose(&mut state, StrategyFileMode::Open, &elsewhere.text("other.json")).unwrap();
    dirty(&mut state);
    let short = std::process::Command::new("cmd")
        .arg("/C")
        .arg(format!("for %I in (\"{}\") do @echo %~sI", root.text(PRIMARY)))
        .output()
        .unwrap();
    let short = String::from_utf8_lossy(&short.stdout).trim().to_owned();
    if short.is_empty() || short.eq_ignore_ascii_case(&root.text(PRIMARY)) {
        return; // this volume has no 8.3 names
    }
    let before = listing(&root.0);
    assert!(choose(&mut state, StrategyFileMode::SaveAs, &short).is_err());
    assert_eq!(listing(&root.0), before);
}

#[test]
fn save_as_the_current_file_checks_the_revision_like_save() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    let draft = dirty(&mut state);
    // another writer changes the file after it was observed
    let theirs = document("event-5");
    fs::write(root.primary(), &theirs).unwrap();
    let result = choose(&mut state, StrategyFileMode::SaveAs, &root.text(PRIMARY));
    let Err(HostError::StrategyConflict { current }) = result else {
        panic!("not a conflict: {result:?}");
    };
    assert_eq!(current.active_event_id.as_deref(), Some("event-5"));
    assert_eq!(fs::read(root.primary()).unwrap(), theirs, "not overwritten");
    let view = state.view();
    assert!(view.dirty, "the draft is still there");
    assert_eq!(view.revision, draft.revision);
}

// ---- a ticket answered after the situation changed

#[test]
fn a_calculation_started_after_the_ticket_makes_the_answer_busy() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    fs::write(root.file("other.json"), document("event-9")).unwrap();
    let now = Instant::now();
    pick(&mut state, StrategyFileMode::Open, now).unwrap();
    let (release, wait) = std::sync::mpsc::sync_channel::<()>(1);
    state.test_start_calculation(move |_| {
        wait.recv().unwrap();
        Document::empty(NOW).unwrap()
    });
    let before = state.view();
    assert_eq!(
        answer(&mut state, Some(&root.text("other.json")), now),
        Err(HostError::Busy)
    );
    assert_eq!(state.view(), before);
    release.send(()).unwrap();
    state.test_join_calculation();
}

#[test]
fn an_edit_pending_after_the_ticket_is_exactly_edit_pending() {
    let root = Root::new();
    let (mut state, view) = opened(&root);
    fs::write(root.file("other.json"), document("event-9")).unwrap();
    let now = Instant::now();
    pick(&mut state, StrategyFileMode::Open, now).unwrap();
    pending_edit(&mut state);
    assert_eq!(state.view().revision, view.revision, "the same revision");
    assert_eq!(
        answer(&mut state, Some(&root.text("other.json")), now),
        Err(HostError::StrategyEditPending)
    );
    assert_eq!(state.view().file.unwrap().name, PRIMARY);
}

#[test]
fn an_unsaved_draft_after_the_ticket_is_a_conflict_for_open_and_for_save_as() {
    for mode in both_modes() {
        let root = Root::new();
        let (mut state, _) = opened(&root);
        fs::write(root.file("other.json"), document("event-9")).unwrap();
        let now = Instant::now();
        pick(&mut state, mode, now).unwrap();
        let draft = dirty(&mut state);
        let result = answer(&mut state, Some(&root.text("other.json")), now);
        let Err(HostError::StrategyConflict { current }) = result else {
            panic!("{mode:?}: {result:?}");
        };
        assert_eq!(current.revision, draft.revision);
        assert_eq!(state.view().file.unwrap().name, PRIMARY, "{mode:?}");
    }
}

#[test]
fn a_save_as_ticket_is_bound_to_its_revision_and_creates_nothing_when_stale() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    let now = Instant::now();
    pick(&mut state, StrategyFileMode::SaveAs, now).unwrap();
    dirty(&mut state);
    let before = listing(&root.0);
    assert!(matches!(
        answer(&mut state, Some(&root.text("new.json")), now),
        Err(HostError::StrategyConflict { .. })
    ));
    assert_eq!(listing(&root.0), before);
}

#[test]
fn an_expired_save_as_ticket_creates_nothing() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    dirty(&mut state);
    let now = Instant::now();
    pick(&mut state, StrategyFileMode::SaveAs, now).unwrap();
    let before = listing(&root.0);
    assert_eq!(
        answer(&mut state, Some(&root.text("late.json")), now + LIFETIME),
        Err(HostError::StrategyPickExpired)
    );
    assert_eq!(listing(&root.0), before);
    assert!(state.view().dirty);
}

#[test]
fn only_requests_of_the_main_process_hold_a_ticket() {
    let root = Root::new();
    let (mut state, view) = opened(&root);
    let now = Instant::now();
    for id in [0, 7, 0x7fff_ffff, u32::MAX] {
        assert_eq!(
            state.pick_file(id, StrategyFileMode::Open, &view.revision, now),
            Err(HostError::Denied),
            "{id:#x}"
        );
    }
    // and an answer for a renderer-range id is denied even with a live ticket
    pick(&mut state, StrategyFileMode::Open, now).unwrap();
    assert_eq!(
        state.picked_file(
            &StrategyFileSelection {
                id: 7,
                path: Some(root.text("strategy-v2.json")),
            },
            now
        ),
        Err(HostError::Denied)
    );
    assert!(answer(&mut state, None, now).is_ok(), "the real ticket is intact");
}

#[test]
fn losing_access_or_the_account_consumes_the_ticket() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    assert!(state.observe(Some("account-a"), true));
    fs::write(root.file("other.json"), document("event-9")).unwrap();
    state.open().unwrap();
    let now = Instant::now();
    pick(&mut state, StrategyFileMode::Open, now).unwrap();
    // no access (blocked, not verified, closing...) for a moment: the ticket is gone
    assert!(!state.observe(Some("account-a"), false));
    assert!(state.observe(Some("account-a"), true));
    assert_eq!(
        answer(&mut state, Some(&root.text("other.json")), now),
        Err(HostError::Denied)
    );
    assert_eq!(state.view().file.unwrap().name, PRIMARY);
}

// ---- opening reads once, and a failed open changes nothing

#[test]
fn a_failed_open_leaves_a_calculated_plan_untouched() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    let plan = StrategyPlanView {
        state: StrategyPlanState::Calculated,
        ..StrategyPlanView::default()
    };
    let shown = plan.clone();
    state
        .calculation
        .start(move |_| Ok((Document::empty(NOW).unwrap(), shown, None)))
        .unwrap();
    state.calculation.finish().unwrap();
    let before = state.view();
    assert_eq!(before.plan.state, StrategyPlanState::Calculated);
    fs::File::create(root.file("big.json"))
        .unwrap()
        .set_len(u64::try_from(vantare_strategy::document::MAX_BYTES).unwrap() + 1)
        .unwrap();
    for name in ["missing.json", "big.json"] {
        assert!(choose(&mut state, StrategyFileMode::Open, &root.text(name)).is_err());
        assert_eq!(state.view(), before, "{name}");
    }
}

#[test]
fn a_collection_over_the_limits_is_an_error_and_the_document_stays() {
    let root = Root::new();
    let (mut state, view) = opened(&root);
    let mut doc = Document::empty(NOW).unwrap();
    for number in 0..=EVENT_LIMIT {
        doc.append_event(&vantare_strategy::document::new_event(
            &format!("event-{number}"),
            "Practice",
            90,
            90.0,
            18.0,
        ))
        .unwrap();
    }
    fs::write(root.file("crowded.json"), doc.bytes()).unwrap();
    assert!(choose(&mut state, StrategyFileMode::Open, &root.text("crowded.json")).is_err());
    assert_eq!(state.view(), view);
}

// ---- writing the new file

#[test]
fn a_target_that_cannot_be_created_is_unavailable_with_nothing_left_behind() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    let draft = dirty(&mut state);
    fs::write(root.file("a_file.json"), b"not a folder").unwrap();
    let before = listing(&root.0);
    assert_eq!(
        choose(
            &mut state,
            StrategyFileMode::SaveAs,
            &root.text("a_file.json/b.json")
        ),
        Err(HostError::StrategyFileUnavailable)
    );
    assert_eq!(listing(&root.0), before);
    assert_eq!(state.view().revision, draft.revision);
    assert!(state.view().dirty);
}

#[test]
fn a_target_another_writer_holds_is_busy() {
    let root = Root::new();
    let (mut state, _) = opened(&root);
    dirty(&mut state);
    // the writer lock of the target, taken by someone else
    let lock = fs::File::create(root.file("held.json.lock")).unwrap();
    lock.lock().unwrap();
    assert_eq!(
        choose(&mut state, StrategyFileMode::SaveAs, &root.text("held.json")),
        Err(HostError::Busy)
    );
    assert!(!root.file("held.json").exists());
    drop(lock);
    assert!(choose(&mut state, StrategyFileMode::SaveAs, &root.text("held.json")).is_ok());
}

#[test]
fn a_new_file_is_created_not_replaced_even_when_it_appears_after_the_check() {
    // `Mode::Observed(None)` is create-if-absent under the writer lock: a file
    // that exists when the host writes is a conflict, whatever it saw before.
    let root = Root::new();
    let (mut state, _) = opened(&root);
    dirty(&mut state);
    fs::write(root.file("race.json"), b"theirs").unwrap();
    assert_eq!(
        choose(&mut state, StrategyFileMode::SaveAs, &root.text("race.json")),
        Err(HostError::StrategyTargetExists)
    );
    assert_eq!(fs::read(root.file("race.json")).unwrap(), b"theirs");
}

// ------------------------------------------------------- what the view shows

#[test]
fn the_file_is_null_without_a_session_or_a_nameable_file() {
    let root = Root::new();
    assert_eq!(root.state().view().file, None);
    assert_eq!(file::file_of(Path::new("/")), None);
    assert_eq!(file::file_of(Path::new("")), None);
    assert_eq!(
        file::file_of(Path::new("/a/b.json")),
        Some(StrategyFile {
            name: "b.json".into()
        })
    );
}

#[test]
fn the_selection_hides_its_path_when_debug_printed() {
    let selection = StrategyFileSelection {
        id: 1,
        path: Some("C:/Users/isaac/secreto/carreras.json".into()),
    };
    for text in [
        format!("{selection:?}"),
        format!("{:?}", crate::protocol::UiToHost::PickedStrategyFile(selection.clone())),
    ] {
        assert!(!text.contains("secreto") && !text.contains("carreras"), "{text}");
        assert!(text.contains("id: 1"), "{text}");
    }
}
