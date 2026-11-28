#![allow(clippy::unwrap_used)]
//! #2711: two rules for the same text. A document that is READ (opened, projected,
//! a stored plan) takes the line breaks U+2028/U+2029 and the bidirectional marks,
//! so a file saved before the rule never turns into «protegido»; what is WRITTEN
//! (create, confirm, compute, accept) refuses them. Export turns them into spaces.
use super::*;
use crate::strategy::accepted::{StrategyAcceptedPlan, plan_is_writable};
use serde_json::{Value, json};
use std::{fs, time::Instant};
use vantare_strategy::document::{manual, new_event};

const NOW: &str = "2026-11-19T18:42:00Z";

/// U+2028, U+2029, U+061C, U+200E/F, U+202A–202E and U+2066–2069.
const MARKS: [char; 14] = [
    '\u{2028}', '\u{2029}', '\u{061c}', '\u{200e}', '\u{200f}', '\u{202a}', '\u{202b}',
    '\u{202c}', '\u{202d}', '\u{202e}', '\u{2066}', '\u{2067}', '\u{2068}', '\u{2069}',
];

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
}
impl Drop for Root {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn fields(name: &str) -> StrategyFields {
    StrategyFields {
        name: name.into(),
        duration_minutes: "90".into(),
        fuel_capacity_liters: "12".into(),
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

fn inputs() -> StrategySolverFields {
    StrategySolverFields {
        base_pace_seconds: "90.5".into(),
        fuel_per_lap_liters: "1.83".into(),
        race_laps: "24".into(),
        ve_capacity_percent: "0".into(),
        ve_per_lap_percent: "0".into(),
        tyre_life_laps: "60".into(),
        degradation_seconds: "0".into(),
        refuel_rate: "4".into(),
        ve_rate: "2.5".into(),
        tyre_service_seconds: "30".into(),
        formation_seconds: "0".into(),
        fuel_step: "1".into(),
        ve_step: "1".into(),
        reserve_laps: "0".into(),
        service_mode: "parallel".into(),
    }
}

fn clean_form() -> StrategyComputeForm {
    StrategyComputeForm {
        fields: fields("Fuji"),
        inputs: inputs(),
    }
}

/// The form with `a<mark>b` in one of its 28 texts: `(where, form)`.
fn forms_with(mark: char) -> Vec<(String, StrategyComputeForm)> {
    let clean = serde_json::to_value(clean_form()).unwrap();
    let mut out = Vec::new();
    for section in ["fields", "inputs"] {
        for key in clean[section].as_object().unwrap().keys() {
            let mut value = clean.clone();
            value[section][key] = format!("a{mark}b").into();
            out.push((
                format!("{section}.{key}"),
                serde_json::from_value(value).unwrap(),
            ));
        }
    }
    assert_eq!(out.len(), 28);
    out
}

fn compute(state: &mut State, form: &StrategyComputeForm) -> Result<StrategyView, HostError> {
    let view = state.view();
    state.compute(
        view.active_event_id.as_deref().unwrap(),
        view.active_strategy_id.as_deref().unwrap(),
        &view.revision,
        form,
    )?;
    state.test_join_calculation();
    Ok(state.view())
}

/// A saved event with its plan calculated: the proposal on screen.
fn planned(root: &Root) -> (State, StrategyView) {
    let mut state = root.state();
    let empty = state.open().unwrap();
    let created = state
        .create(&empty.revision, &fields("Fuji"), None, None, Some(&inputs()), NOW)
        .unwrap();
    state.save(&created.revision).unwrap();
    let view = compute(&mut state, &clean_form()).unwrap();
    assert_eq!(view.plan.state, StrategyPlanState::Calculated);
    (state, view)
}

fn accept(state: &mut State) -> Result<StrategyView, HostError> {
    let view = state.view();
    state.accept(&view.revision, view.plan.compute_id.unwrap_or(0), NOW)
}

#[test]
fn the_read_rule_takes_the_marks_and_the_write_rule_refuses_them() {
    for mark in MARKS {
        let text = format!("a{mark}b");
        assert!(valid_text(&text), "reading takes {mark:?}");
        assert!(!writable_text(&text), "writing refuses {mark:?}");
        assert!(!writable_text(&mark.to_string()), "{mark:?} alone");
    }
    // the controls and the limit are the same on both sides
    for text in ["a\u{7}b", "a\nb", "a\u{85}b", &"a".repeat(TEXT_LIMIT + 1)] {
        assert!(!valid_text(text) && !writable_text(text), "{text:?}");
    }
    let exact = "é".repeat(TEXT_LIMIT / 2);
    assert!(valid_text(&exact) && writable_text(&exact));
    assert!(!writable_text(&format!("{exact}a")));
    // accents, ñ, emojis (a family joins them with U+200D) and other scripts stay
    for text in ["Ñandú café", "Gran Premio 🏁", "👨‍👩‍👧", "日本 · العربية", "a\u{200b}b", ""] {
        assert!(valid_text(text) && writable_text(text), "{text:?}");
    }
}

#[test]
fn a_new_text_with_a_mark_is_refused_in_each_of_the_28_entries_and_nothing_changes() {
    let root = Root::new();
    let mut state = root.state();
    let empty = state.open().unwrap();
    let base = state
        .create(&empty.revision, &fields("Fuji"), None, None, Some(&inputs()), NOW)
        .unwrap();
    let base = state.save(&base.revision).unwrap();
    let bytes = fs::read(root.primary()).unwrap();
    let (event, strategy) = (
        base.active_event_id.clone().unwrap(),
        base.active_strategy_id.clone().unwrap(),
    );
    for mark in MARKS {
        for (place, form) in forms_with(mark) {
            let case = format!("{mark:?} in {place}");
            assert_eq!(
                state.create(&base.revision, &form.fields, None, None, Some(&form.inputs), NOW),
                Err(HostError::StrategyInvalidText),
                "create with inputs: {case}"
            );
            assert_eq!(
                state.confirm(&event, &strategy, &base.revision, &form.fields, Some(&form.inputs)),
                Err(HostError::StrategyInvalidText),
                "confirm with inputs: {case}"
            );
            assert_eq!(
                state.compute(&event, &strategy, &base.revision, &form),
                Err(HostError::StrategyInvalidText),
                "compute: {case}"
            );
            if place.starts_with("fields.") {
                assert_eq!(
                    state.create(&base.revision, &form.fields, None, None, None, NOW),
                    Err(HostError::StrategyInvalidText),
                    "create: {case}"
                );
                assert_eq!(
                    state.confirm(&event, &strategy, &base.revision, &form.fields, None),
                    Err(HostError::StrategyInvalidText),
                    "confirm: {case}"
                );
            }
            assert_eq!(state.view(), base, "{case}: nothing changed");
        }
        // the loose pace and consumption of a creation without inputs
        let bad = format!("9{mark}0");
        for (pace, consumption) in [(Some(bad.as_str()), None), (None, Some(bad.as_str()))] {
            assert_eq!(
                state.create(&base.revision, &fields("New"), pace, consumption, None, NOW),
                Err(HostError::StrategyInvalidText),
                "{mark:?} loose"
            );
        }
        assert_eq!(state.view(), base);
    }
    assert_eq!(fs::read(root.primary()).unwrap(), bytes);
}

#[test]
fn clean_texts_and_the_limit_are_still_written() {
    let root = Root::new();
    let mut state = root.state();
    let empty = state.open().unwrap();
    let mut form = clean_form();
    form.fields.name = "Gran Premio de España · Ñandú 🏁 👨‍👩‍👧".into();
    form.fields.variant_note = "é".repeat(TEXT_LIMIT / 2);
    form.fields.team = "Équipe café".into();
    let created = state
        .create(&empty.revision, &form.fields, None, None, Some(&form.inputs), NOW)
        .unwrap();
    let (event, strategy) = (
        created.active_event_id.clone().unwrap(),
        created.active_strategy_id.clone().unwrap(),
    );
    let saved = state.save(&created.revision).unwrap();
    assert!(state
        .confirm(&event, &strategy, &saved.revision, &form.fields, Some(&form.inputs))
        .is_ok());
    let view = state.view();
    assert_eq!(view.form.as_ref().unwrap().fields.variant_note, form.fields.variant_note);
    assert!(compute(&mut state, &form).is_ok());
    // one byte over the limit is still refused
    form.fields.variant_note.push('a');
    assert_eq!(
        state.confirm(&event, &strategy, &state.view().revision, &form.fields, None),
        Err(HostError::StrategyInvalidText)
    );
}

/// A saved event whose texts all carry `mark`, written as a file saved before the rule.
fn hostile_event(id: &str, mark: char) -> Value {
    let text = |name: &str| manual(json!(format!("{name}{mark}x")));
    let mut event = new_event(id, "Practice", 90, 90.0, 18.0);
    event["name"] = text("Fuji");
    event["track"] = text("Track");
    event["cls"] = text("Class");
    event["team"] = text("Team");
    event["drivers"][0]["name"] = text("Driver");
    event["drivers"][0]["ini"] = text("DR");
    event["strategies"][0]["name"] = text("Base");
    event["strategies"][0]["note"] = text("Note");
    event["activeStrategyId"] = "variant-1".into();
    event
}

fn legacy_file(root: &Root, mark: char) -> Vec<u8> {
    let mut doc = Document::empty(NOW).unwrap();
    doc.append_event(&hostile_event("event-1", mark)).unwrap();
    let mut clean = new_event("event-2", "Clean", 90, 90.0, 18.0);
    clean["activeStrategyId"] = "variant-1".into();
    doc.append_event(&clean).unwrap();
    doc.put("/activeEventId", &"event-1".into()).unwrap();
    fs::write(root.primary(), doc.bytes()).unwrap();
    doc.bytes().to_vec()
}

#[test]
fn a_saved_document_with_a_mark_opens_ready_and_is_never_rewritten() {
    for mark in MARKS {
        let root = Root::new();
        let bytes = legacy_file(&root, mark);
        let mut state = root.state();
        let view = state.open().unwrap();
        assert_eq!(view.state, StrategyState::Ready, "{mark:?}: not «protegido»");
        assert_eq!(view.events.len(), 2, "{mark:?}");
        assert!(!view.dirty);
        // the form shows the stored text as it is
        let form = view.form.as_ref().expect("the form of a readable document");
        assert_eq!(form.fields.name, format!("Fuji{mark}x"), "{mark:?}");
        assert_eq!(form.fields.driver_name, format!("Driver{mark}x"), "{mark:?}");
        assert_eq!(fs::read(root.primary()).unwrap(), bytes);
        // a second read of the same file does the same
        assert_eq!(root.state().open().unwrap().state, StrategyState::Ready);
    }
}

#[test]
fn a_mark_that_is_already_stored_does_not_block_other_edits_but_is_not_written_again() {
    let mark = '\u{202e}';
    let root = Root::new();
    legacy_file(&root, mark);
    let mut state = root.state();
    let opened = state.open().unwrap();
    // the form as the screen would send it back: the stored text is not new text
    let form = opened.form.clone().unwrap();
    assert_eq!(
        state.confirm("event-1", "variant-1", &opened.revision, &form.fields, Some(&form.inputs)),
        Err(HostError::StrategyInvalidText)
    );
    assert_eq!(state.view(), opened);
    // another event of the same file confirms and saves, and the old one is kept
    let draft = state
        .confirm("event-2", "variant-1", &opened.revision, &fields("Clean 2"), None)
        .unwrap();
    assert_eq!(draft.state, StrategyState::Ready);
    let saved = state.save(&draft.revision).unwrap();
    assert!(!saved.dirty);
    assert!(String::from_utf8(fs::read(root.primary()).unwrap())
        .unwrap()
        .contains(mark));
    assert_eq!(root.state().open().unwrap().state, StrategyState::Ready);
    // the person fixes the text: with a clean one the same event is written
    assert!(state
        .confirm("event-1", "variant-1", &saved.revision, &fields("Fuji"), None)
        .is_ok());
}

#[test]
fn an_accepted_plan_that_is_not_writable_is_not_accepted() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    // the entries the plan would copy come from the draft: put a mark in one
    for mark in MARKS {
        let mut doc = state.doc.clone().unwrap();
        doc.put("/events/0/team", &manual(json!(format!("a{mark}b"))))
            .unwrap();
        state.apply_draft(doc);
        let before = state.view();
        assert_eq!(accept(&mut state), Err(HostError::StrategyInvalidText), "{mark:?}");
        assert_eq!(state.view(), before, "{mark:?}: nothing accepted");
    }
    // and with a clean text it is accepted
    let mut doc = state.doc.clone().unwrap();
    doc.put("/events/0/team", &manual(json!("Team"))).unwrap();
    state.apply_draft(doc);
    assert!(accept(&mut state).is_ok());
    assert!(proposal.plan.compute_id.is_some());
}

#[test]
fn the_plan_check_looks_at_the_28_entries_the_date_and_the_pilot() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    accept(&mut state).unwrap();
    let doc = state.doc.as_ref().unwrap();
    let plan = accepted::plan_of(doc, 0, 0).expect("an accepted plan");
    assert!(plan_is_writable(&plan));
    let broken = |change: &dyn Fn(&mut StrategyAcceptedPlan)| {
        let mut plan = plan.clone();
        change(&mut plan);
        plan_is_writable(&plan)
    };
    for mark in MARKS {
        assert!(!broken(&|p| p.accepted_at = format!("{}{mark}", p.accepted_at)), "{mark:?}");
        assert!(
            !broken(&|p| p.result.timeline.as_mut().unwrap().pilot = format!("a{mark}")),
            "{mark:?}"
        );
        for (place, form) in forms_with(mark) {
            assert!(!broken(&|p| p.entries = form.clone()), "{mark:?} in {place}");
        }
    }
    // the same plan with the marks is still a valid STORED plan (read rule)
    let mut stored = plan.clone();
    stored.result.timeline.as_mut().unwrap().pilot = "a\u{202e}b".into();
    stored.entries.fields.team = "a\u{2028}b".into();
    assert!(accepted::plan_is_valid(&stored));
}

/// The saved file of an accepted plan, with its texts replaced by hostile ones: what a
/// version before the rule could have written.
fn old_accepted_file(root: &Root) {
    let (mut state, _) = planned(root);
    let view = accept(&mut state).unwrap();
    state.save(&view.revision).unwrap();
    let text = fs::read_to_string(root.primary()).unwrap();
    let hostile = text
        .replace("Fuji", "Fu\u{2028}\u{202e}ji\u{2066}")
        .replace("Pilot", "Pi\u{200f}lot\u{061c}")
        .replace("GT3", "G\u{2029}T3\u{202a}")
        .replace("Base", "Ba\u{202b}se");
    assert_ne!(hostile, text);
    fs::write(root.primary(), hostile).unwrap();
}

fn forbidden(text: &str) -> Option<char> {
    text.chars().find(|c| MARKS.contains(c))
}

#[test]
fn an_old_accepted_plan_with_marks_opens_and_exports_them_as_spaces() {
    let root = Root::new();
    old_accepted_file(&root);
    let on_disk = fs::read(root.primary()).unwrap();
    let mut state = root.state();
    let view = state.open().unwrap();
    assert_eq!(view.state, StrategyState::Ready, "not «protegido»");
    assert_eq!(view.events[0].accepted_plan, StrategyAcceptedMark::Accepted);
    assert!(view.plan.accepted.is_some());
    assert!(forbidden(&view.form.as_ref().unwrap().fields.name).is_some());
    // the text
    let text = state
        .export_text(&view.revision, &StrategyExportTarget::Accepted {})
        .unwrap()
        .text;
    assert_eq!(forbidden(&text), None, "{text}");
    assert!(text.contains("Carrera: Fu  ji  · Estrategia: Ba se"), "{text}");
    // the CSV
    let target = root.0.join("plan.csv");
    let now = Instant::now();
    let id = 0x8000_0009;
    state
        .export_file(id, &view.revision, StrategyExportTarget::Accepted {}, now)
        .unwrap();
    state
        .picked(
            &StrategyFileSelection {
                id,
                path: Some(target.to_str().unwrap().to_owned()),
            },
            now,
        )
        .unwrap();
    let csv = String::from_utf8(fs::read(&target).unwrap()).unwrap();
    assert_eq!(forbidden(&csv), None, "{csv}");
    assert!(csv.contains("Fu  ji "), "{csv}");
    // exporting wrote nothing into the document
    assert_eq!(fs::read(root.primary()).unwrap(), on_disk);
}

#[test]
fn a_changed_text_with_a_mark_is_reported_without_its_value() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    let view = accept(&mut state).unwrap();
    state.save(&view.revision).unwrap();
    for mark in MARKS {
        let mut value: Value = serde_json::from_slice(&fs::read(root.primary()).unwrap()).unwrap();
        value["events"][0]["team"] = manual(json!(format!("a{mark}b")));
        fs::write(root.primary(), serde_json::to_vec(&value).unwrap()).unwrap();
        let view = root.state().open().unwrap();
        let accepted = view.plan.accepted.as_deref().expect("the accepted plan");
        let change = accepted
            .changes
            .iter()
            .find(|change| change.field == StrategyField::Team)
            .expect("the team changed");
        assert_eq!(change.before, Some(String::new()), "{mark:?}");
        assert_eq!(change.after, None, "{mark:?}: not shown");
    }
}

/// Right-to-left writing is a script, not a mark: Arabic and Hebrew names, Persian
/// with its zero-width non-joiner U+200C, a mix with Latin and the Arabic-Indic
/// digits are written as they are. Only the marks of the list are refused.
const RTL: [&str; 5] = [
    "محمد العلي",
    "יעקב כהן",
    "می\u{200c}خواهم",
    "Dubai Autodrome · דובאי · دبي",
    "٢٤ ساعة · GT3 ٠١٢٣٤٥٦٧٨٩",
];

#[test]
fn right_to_left_text_is_written_and_the_same_text_with_a_mark_is_not() {
    for text in RTL {
        assert!(writable_text(text), "{text:?}");
        for mark in MARKS {
            let marked = format!("{mark}{text}");
            assert!(valid_text(&marked) && !writable_text(&marked), "{mark:?} {text:?}");
        }
    }
    let root = Root::new();
    let mut state = root.state();
    let empty = state.open().unwrap();
    let mut form = clean_form();
    form.fields.driver_name = RTL[0].into();
    form.fields.team = RTL[1].into();
    form.fields.variant_note = RTL[2].into();
    form.fields.track = RTL[3].into();
    form.fields.name = RTL[4].into();
    let created = state
        .create(&empty.revision, &form.fields, None, None, Some(&form.inputs), NOW)
        .unwrap();
    let saved = state.save(&created.revision).unwrap();
    let shown = saved.form.unwrap().fields;
    assert_eq!((shown.driver_name.as_str(), shown.track.as_str()), (RTL[0], RTL[3]));
    assert!(compute(&mut state, &form).is_ok());
    assert!(accept(&mut state).is_ok(), "the plan takes a right-to-left pilot");
    let before = state.view();
    form.fields.driver_name = format!("\u{202e}{}", RTL[0]);
    assert_eq!(
        state.compute(
            before.active_event_id.as_deref().unwrap(),
            before.active_strategy_id.as_deref().unwrap(),
            &before.revision,
            &form,
        ),
        Err(HostError::StrategyInvalidText)
    );
    assert_eq!(state.view(), before);
}
