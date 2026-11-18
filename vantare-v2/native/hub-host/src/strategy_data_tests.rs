#![allow(clippy::unwrap_used)]
//! E4-datos: `hasInputs` in the event summary, `form` in the view and
//! `inputs` in `create`. The document keeps the confirmed inputs of a variant
//! (`overrides.nativeScalarInput`), not a plan: `hasInputs` says that a plan can
//! be calculated from them, never that one exists.
use super::*;
use std::fs;

const NOW: &str = "2026-11-18T00:00:00Z";

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

fn inputs() -> StrategySolverFields {
    StrategySolverFields {
        base_pace_seconds: "90.5".into(),
        fuel_per_lap_liters: "1.83".into(),
        race_laps: "10".into(),
        ve_capacity_percent: "0".into(),
        ve_per_lap_percent: "0".into(),
        tyre_life_laps: "30".into(),
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

fn empty_inputs() -> StrategySolverFields {
    StrategySolverFields {
        base_pace_seconds: String::new(),
        fuel_per_lap_liters: String::new(),
        race_laps: String::new(),
        ve_capacity_percent: String::new(),
        ve_per_lap_percent: String::new(),
        tyre_life_laps: String::new(),
        degradation_seconds: String::new(),
        refuel_rate: String::new(),
        ve_rate: String::new(),
        tyre_service_seconds: String::new(),
        formation_seconds: String::new(),
        fuel_step: String::new(),
        ve_step: String::new(),
        reserve_laps: String::new(),
        service_mode: String::new(),
    }
}

/// The strings of the solver inputs as numbers where they are numbers: the host
/// spells a number the way the document stores it (`0.0`, `82.0`), so two spellings
/// of one value are the same entry.
fn solver_values(inputs: &StrategySolverFields) -> Vec<String> {
    [
        &inputs.base_pace_seconds,
        &inputs.fuel_per_lap_liters,
        &inputs.race_laps,
        &inputs.ve_capacity_percent,
        &inputs.ve_per_lap_percent,
        &inputs.tyre_life_laps,
        &inputs.degradation_seconds,
        &inputs.refuel_rate,
        &inputs.ve_rate,
        &inputs.tyre_service_seconds,
        &inputs.formation_seconds,
        &inputs.fuel_step,
        &inputs.ve_step,
        &inputs.reserve_laps,
        &inputs.service_mode,
    ]
    .map(|text| {
        text.parse::<f64>()
            .map_or_else(|_| text.clone(), |number| number.to_string())
    })
    .to_vec()
}

fn same_inputs(a: &StrategySolverFields, b: &StrategySolverFields) -> bool {
    solver_values(a) == solver_values(b)
}

fn form_of(view: &StrategyView) -> &StrategyComputeForm {
    view.form.as_deref().expect("the view has a form")
}

fn create_with_inputs(state: &mut State, name: &str) -> StrategyView {
    // a state that is not open yet is opened first
    let revision = match state.view_opened() {
        Ok(view) => view.revision,
        Err(_) => state.open().unwrap().revision,
    };
    state
        .create(&revision, &fields(name), None, None, Some(&inputs()), NOW)
        .unwrap()
}

fn compute_form(state: &mut State, view: &StrategyView, form: &StrategyComputeForm) {
    state
        .compute(
            view.active_event_id.as_deref().unwrap(),
            view.active_strategy_id.as_deref().unwrap(),
            &view.revision,
            form,
        )
        .unwrap();
    state.test_join_calculation();
}

// ---- hasInputs ----

#[test]
fn an_event_has_inputs_only_when_a_variant_keeps_valid_confirmed_ones() {
    use vantare_strategy::{document::new_event, solver::Input};
    let mut valid: Input =
        serde_json::from_str(include_str!("../../strategy/testdata/fuji-1450-input.json")).unwrap();
    valid.extra.clear();
    valid.validate().unwrap();
    let mut zero_laps = valid.clone();
    zero_laps.race_laps = 0;
    assert!(zero_laps.validate().is_err());
    let valid = serde_json::to_value(&valid).unwrap();
    let invalid = serde_json::to_value(&zero_laps).unwrap();
    let with = |id: &str, stored: &[serde_json::Value]| {
        let mut event = new_event(id, "Practice", 90, 90.0, 18.0);
        let template = event["strategies"][0].clone();
        let mut variants = vec![];
        for (index, input) in stored.iter().enumerate() {
            let mut variant = template.clone();
            variant["id"] = format!("variant-{}", index + 1).into();
            if !input.is_null() {
                variant["overrides"] = serde_json::json!({ "nativeScalarInput": input });
            }
            variants.push(variant);
        }
        event["strategies"] = variants.into();
        event["activeStrategyId"] = "variant-1".into();
        event
    };
    let mut doc = Document::empty(NOW).unwrap();
    for event in [
        with("none", &[serde_json::Value::Null]),
        with("valid", std::slice::from_ref(&valid)),
        with("invalid", std::slice::from_ref(&invalid)),
        with("unreadable", &[serde_json::json!({ "junk": 1 })]),
        // any variant counts, not only the active one
        with("second", &[serde_json::Value::Null, valid.clone()]),
        with("both-bad", &[invalid, serde_json::json!("text")]),
    ] {
        doc.append_event(&event).unwrap();
    }
    let root = Root::new();
    fs::write(root.primary(), doc.bytes()).unwrap();
    let mut state = root.state();
    let view = state.open().unwrap();
    let flags: Vec<_> = view
        .events
        .iter()
        .map(|event| (event.id.as_str(), event.has_inputs))
        .collect();
    assert_eq!(
        flags,
        [
            ("none", false),
            ("valid", true),
            ("invalid", false),
            ("unreadable", false),
            ("second", true),
            ("both-bad", false),
        ]
    );
}

#[test]
fn has_inputs_follows_the_draft_the_saved_file_and_a_discard() {
    let root = Root::new();
    let mut state = root.state();
    let empty = state.open().unwrap();
    let without = state
        .create(&empty.revision, &fields("Plain"), None, None, None, NOW)
        .unwrap();
    assert!(!without.events[0].has_inputs);
    let saved = state.save(&without.revision).unwrap();
    let draft = create_with_inputs(&mut state, "Calculable");
    assert_eq!(
        draft.events.iter().map(|e| e.has_inputs).collect::<Vec<_>>(),
        [false, true],
        "the draft counts before it is saved"
    );
    assert_eq!(state.discard(&draft.revision).unwrap(), saved);
    assert!(!state.view().events[0].has_inputs);
    let draft = create_with_inputs(&mut state, "Calculable");
    state.save(&draft.revision).unwrap();
    assert!(
        root.state()
            .open()
            .unwrap()
            .events
            .iter()
            .any(|event| event.name == "Calculable" && event.has_inputs)
    );
}

#[test]
fn a_calculation_confirms_the_inputs_of_its_event_and_nothing_more() {
    let root = Root::new();
    let mut state = root.state();
    let empty = state.open().unwrap();
    let plain = state
        .create(&empty.revision, &fields("Plain"), None, None, None, NOW)
        .unwrap();
    assert!(!plain.events[0].has_inputs);
    let form = StrategyComputeForm {
        fields: fields("Plain"),
        inputs: inputs(),
    };
    compute_form(&mut state, &plain, &form);
    let view = state.view();
    assert_eq!(view.plan.state, StrategyPlanState::Calculated);
    assert!(view.events[0].has_inputs, "confirmed by the calculation");
    // a calculation that ends with no plan also confirms its inputs: the document
    // does not know the outcome, so the flag is not about a plan
    assert!(form_of(&view).inputs.race_laps.parse::<u32>().is_ok());
}

// ---- form ----

#[test]
fn the_form_is_null_without_an_active_event_and_variant() {
    use vantare_strategy::document::new_event;
    let root = Root::new();
    let mut state = root.state();
    assert_eq!(state.open().unwrap().form, None, "an empty document");
    // events but none active
    let mut doc = Document::empty(NOW).unwrap();
    doc.append_event(&new_event("event-1", "Practice", 90, 90.0, 18.0))
        .unwrap();
    fs::write(root.primary(), doc.bytes()).unwrap();
    let view = root.state().open().unwrap();
    assert_eq!(view.events.len(), 1);
    assert_eq!(view.active_event_id, None);
    assert_eq!(view.form, None);
    // an active event with no active variant (the document allows it)
    let mut event = new_event("event-1", "Practice", 90, 90.0, 18.0);
    event.as_object_mut().unwrap().remove("activeStrategyId");
    let mut doc = Document::empty(NOW).unwrap();
    doc.append_event(&event).unwrap();
    doc.put("/activeEventId", &"event-1".into()).unwrap();
    fs::write(root.primary(), doc.bytes()).unwrap();
    let view = root.state().open().unwrap();
    assert_eq!(view.active_event_id.as_deref(), Some("event-1"));
    assert_eq!(view.active_strategy_id, None);
    assert_eq!(view.form, None);
}

#[test]
fn without_stored_inputs_the_form_has_the_fields_and_empty_inputs() {
    let root = Root::new();
    let mut state = root.state();
    let empty = state.open().unwrap();
    let mut written = fields("Fuji");
    written.team = "Local team".into();
    written.variant_note = "Reviewed".into();
    let draft = state
        .create(&empty.revision, &written, None, None, None, NOW)
        .unwrap();
    let form = form_of(&draft);
    assert_eq!(form.fields.name, "Fuji");
    assert_eq!(form.fields.track, "Fuji");
    assert_eq!(form.fields.class, "GT3");
    assert_eq!(form.fields.duration_minutes, "90");
    assert_eq!(form.fields.team, "Local team");
    assert_eq!(form.fields.variant_name, "Base");
    assert_eq!(form.fields.variant_note, "Reviewed");
    assert_eq!(form.fields.variant_mode, "dry");
    assert_eq!(form.fields.driver_name, "Pilot");
    assert_eq!(form.fields.driver_initials, "PI");
    assert_eq!(form.fields.fuel_capacity_liters.parse::<f64>(), Ok(82.0));
    assert_eq!(form.fields.pit_transit_seconds.parse::<f64>(), Ok(25.0));
    assert_eq!(form.inputs, empty_inputs());
    assert!(!draft.events[0].has_inputs);

    // the pace and consumption an event holds are inputs even without a stored calculation
    let paced = {
        let mut state = root.state();
        let empty = state.open().unwrap();
        state
            .create(&empty.revision, &fields("Paced"), Some("90.472"), Some("1.83"), None, NOW)
            .unwrap()
    };
    let inputs = &form_of(&paced).inputs;
    assert_eq!(inputs.base_pace_seconds, "90.472");
    assert_eq!(inputs.fuel_per_lap_liters, "1.83");
    assert_eq!(
        StrategySolverFields {
            base_pace_seconds: String::new(),
            fuel_per_lap_liters: String::new(),
            ..inputs.clone()
        },
        empty_inputs()
    );
}

#[test]
fn create_with_inputs_leaves_the_confirmed_inputs_in_the_draft() {
    let root = Root::new();
    let mut state = root.state();
    let empty = state.open().unwrap();
    let draft = state
        .create(&empty.revision, &fields("Fuji"), None, None, Some(&inputs()), NOW)
        .unwrap();
    assert!(draft.dirty, "created, not saved");
    assert_ne!(draft.revision, empty.revision);
    assert_eq!(draft.state, StrategyState::Ready);
    assert_eq!(draft.active_event_id.as_deref(), Some("native-event-1"));
    assert_eq!(draft.active_strategy_id.as_deref(), Some("variant-1"));
    assert!(draft.events[0].has_inputs);
    assert_eq!(draft.plan.state, StrategyPlanState::Uncalculated, "nothing was calculated");
    assert!(!root.primary().exists(), "not written before Save");
    let form = form_of(&draft);
    assert!(same_inputs(&form.inputs, &inputs()), "{:?}", form.inputs);
    assert_eq!(form.fields.name, "Fuji");
    assert_eq!(form.fields.variant_mode, "dry");
    assert_eq!(state.view(), draft);

    // Save writes it, and a restart reads the same form from the file
    let saved = state.save(&draft.revision).unwrap();
    assert!(!saved.dirty);
    let reopened = root.state().open().unwrap();
    assert_eq!(reopened, saved);
    assert_eq!(reopened.form, draft.form);
    let doc = Document::parse(&fs::read(root.primary()).unwrap()).unwrap();
    assert_eq!(
        doc.value()["events"][0]["strategies"][0]["overrides"]["nativeScalarInput"]["raceLaps"],
        10
    );
}

#[test]
fn the_same_inputs_to_compute_change_nothing_in_the_form() {
    let root = Root::new();
    let mut state = root.state();
    let draft = create_with_inputs(&mut state, "Fuji");
    let form = draft.form.clone().unwrap();
    compute_form(&mut state, &draft, &form);
    let view = state.view();
    assert_eq!(view.plan.state, StrategyPlanState::Calculated);
    assert_eq!(view.form, draft.form, "one source of truth: create and compute agree");
    assert_eq!(view.revision, draft.revision, "the document is the same bytes");
}

#[test]
fn the_form_follows_create_confirm_and_compute() {
    let root = Root::new();
    let mut state = root.state();
    let created = create_with_inputs(&mut state, "Fuji");

    // confirm writes the fields; the inputs stay
    let mut edited = fields("Edited");
    edited.team = "Local team".into();
    edited.driver_name = "Other".into();
    edited.driver_initials = "OT".into();
    edited.variant_note = "New note".into();
    let confirmed = state
        .confirm("native-event-1", "variant-1", &created.revision, &edited)
        .unwrap();
    let form = form_of(&confirmed);
    assert_eq!(form.fields.name, "Edited");
    assert_eq!(form.fields.team, "Local team");
    assert_eq!(form.fields.driver_name, "Other");
    assert_eq!(form.fields.driver_initials, "OT");
    assert_eq!(form.fields.variant_note, "New note");
    assert_eq!(form.inputs, form_of(&created).inputs);
    assert_eq!(confirmed.events[0].name, "Edited");

    // compute writes the fields and the inputs it was given
    let mut next = form.clone();
    next.fields.name = "Computed".into();
    next.inputs.race_laps = "12".into();
    next.inputs.base_pace_seconds = "91.25".into();
    next.inputs.reserve_laps = "1".into();
    next.inputs.service_mode = "sequential".into();
    compute_form(&mut state, &confirmed, &next);
    let computed = state.view();
    assert_eq!(computed.plan.state, StrategyPlanState::Calculated);
    let form = form_of(&computed);
    assert_eq!(form.fields.name, "Computed");
    assert!(same_inputs(&form.inputs, &next.inputs), "{:?}", form.inputs);
    assert_eq!(computed.events[0].name, "Computed");
    assert!(computed.events[0].has_inputs);
}

#[test]
fn the_form_shows_the_running_draft_and_not_the_saved_file() {
    let root = Root::new();
    let mut state = root.state();
    let created = create_with_inputs(&mut state, "Fuji");
    let saved = state.save(&created.revision).unwrap();
    let mut edited = fields("Unsaved");
    edited.team = "Draft team".into();
    let draft = state
        .confirm("native-event-1", "variant-1", &saved.revision, &edited)
        .unwrap();
    assert!(draft.dirty);
    assert_eq!(form_of(&draft).fields.team, "Draft team");
    // the file still says what it said
    let on_disk = root.state().open().unwrap();
    assert_eq!(on_disk.form, saved.form);
    assert_ne!(on_disk.form, draft.form);
}

#[test]
fn discard_and_a_new_account_bring_the_form_back_to_what_is_saved() {
    let root = Root::new();
    let mut state = root.state();
    state.observe(Some("account-a"), true);
    let created = create_with_inputs(&mut state, "Fuji");
    // nothing saved yet: a discard leaves no event, so no form
    let discarded = state.discard(&created.revision).unwrap();
    assert_eq!(discarded.form, None);
    assert_eq!(discarded.events.len(), 0);

    let created = create_with_inputs(&mut state, "Fuji");
    let saved = state.save(&created.revision).unwrap();
    let mut edited = fields("Unsaved");
    edited.variant_note = "draft".into();
    let draft = state
        .confirm("native-event-1", "variant-1", &saved.revision, &edited)
        .unwrap();
    assert_ne!(draft.form, saved.form);
    assert_eq!(state.discard(&draft.revision).unwrap().form, saved.form);

    // an unsaved draft, then another account: the new account reads the file
    let draft = state
        .confirm("native-event-1", "variant-1", &saved.revision, &edited)
        .unwrap();
    assert_ne!(draft.form, saved.form);
    state.observe(Some("account-b"), true);
    assert_eq!(state.view_opened(), Err(HostError::Denied));
    assert_eq!(state.open().unwrap().form, saved.form);
    // and with nothing saved the form is null again
    state.observe(Some("account-c"), true);
    fs::remove_file(root.primary()).unwrap();
    assert_eq!(state.open().unwrap().form, None);
}

#[test]
fn a_stored_text_over_the_limit_or_with_a_control_makes_the_form_null_without_changing_it() {
    use vantare_strategy::document::new_event;
    let long = "é".repeat(TEXT_LIMIT / 2 + 1); // one byte over the limit
    assert_eq!(long.len(), TEXT_LIMIT + 2);
    let exact = "a".repeat(TEXT_LIMIT);
    for (case, value, ok) in [
        ("exactly at the limit", exact.as_str(), true),
        ("over the limit", long.as_str(), false),
        ("a control character", "bell\u{7}", false),
        ("a line break", "two\nlines", false),
    ] {
        for place in ["team", "note", "driver", "initials"] {
            let mut event = new_event("event-1", "Practice", 90, 90.0, 18.0);
            match place {
                "team" => event["team"] = vantare_strategy::document::manual(value.into()),
                "note" => event["strategies"][0]["note"] = vantare_strategy::document::manual(value.into()),
                "driver" => event["drivers"][0]["name"] = vantare_strategy::document::manual(value.into()),
                _ => event["drivers"][0]["ini"] = vantare_strategy::document::manual(value.into()),
            }
            event["activeStrategyId"] = "variant-1".into();
            let mut doc = Document::empty(NOW).unwrap();
            doc.append_event(&event).unwrap();
            doc.put("/activeEventId", &"event-1".into()).unwrap();
            let root = Root::new();
            fs::write(root.primary(), doc.bytes()).unwrap();
            let mut state = root.state();
            let view = state.open().unwrap();
            assert_eq!(view.state, StrategyState::Ready, "{case} in {place}: still readable");
            assert_eq!(view.events.len(), 1, "{case} in {place}");
            assert_eq!(view.form.is_some(), ok, "{case} in {place}");
            assert_eq!(fs::read(root.primary()).unwrap(), doc.bytes(), "{case}: never rewritten");
            assert!(!view.dirty);
        }
    }
}

// ---- create with inputs ----

#[test]
fn invalid_inputs_create_nothing() {
    let root = Root::new();
    let mut state = root.state();
    let empty = state.open().unwrap();
    let good = fields("New");
    let cases: Vec<(&str, StrategyFields, StrategySolverFields)> = {
        let bad = |change: fn(&mut StrategySolverFields)| {
            let mut value = inputs();
            change(&mut value);
            value
        };
        vec![
            ("empty pace", good.clone(), bad(|v| v.base_pace_seconds.clear())),
            ("zero pace", good.clone(), bad(|v| v.base_pace_seconds = "0".into())),
            ("pace not a number", good.clone(), bad(|v| v.base_pace_seconds = "NaN".into())),
            ("laps not whole", good.clone(), bad(|v| v.race_laps = "2.5".into())),
            ("laps text", good.clone(), bad(|v| v.race_laps = "diez".into())),
            ("zero laps", good.clone(), bad(|v| v.race_laps = "0".into())),
            ("negative fuel", good.clone(), bad(|v| v.fuel_per_lap_liters = "-1".into())),
            ("unknown service mode", good.clone(), bad(|v| v.service_mode = "other".into())),
            ("empty step", good.clone(), bad(|v| v.fuel_step.clear())),
            ("empty reserve", good.clone(), bad(|v| v.reserve_laps.clear())),
            // the form of a calculation is dry only (the same check as compute)
            ("wet variant", StrategyFields { variant_mode: "wet".into(), ..good.clone() }, inputs()),
            ("no variant mode", StrategyFields { variant_mode: String::new(), ..good.clone() }, inputs()),
            ("no name", fields(""), inputs()),
        ]
    };
    for (case, form, solver) in cases {
        assert_eq!(
            state.create(&empty.revision, &form, None, None, Some(&solver), NOW),
            Err(HostError::Rejected),
            "{case}"
        );
        assert_eq!(state.view_opened().unwrap(), empty, "{case}");
        assert!(!root.primary().exists(), "{case}");
    }
}

#[test]
fn an_invalid_text_in_the_inputs_is_invalid_text_and_creates_nothing() {
    let root = Root::new();
    let mut state = root.state();
    let empty = state.open().unwrap();
    for (case, value) in [
        ("over the limit", "9".repeat(TEXT_LIMIT + 1)),
        ("a control character", "1\u{7}".to_owned()),
        ("a line break", "1\n".to_owned()),
    ] {
        let mut solver = inputs();
        solver.degradation_seconds = value;
        assert_eq!(
            state.create(&empty.revision, &fields("New"), None, None, Some(&solver), NOW),
            Err(HostError::StrategyInvalidText),
            "{case}"
        );
        assert_eq!(state.view_opened().unwrap(), empty, "{case}");
    }
}

#[test]
fn invalid_inputs_leave_an_existing_collection_byte_identical() {
    let root = Root::new();
    let mut state = root.state();
    let first = create_with_inputs(&mut state, "First");
    let saved = state.save(&first.revision).unwrap();
    let bytes = fs::read(root.primary()).unwrap();
    let mut solver = inputs();
    solver.race_laps = "0".into();
    assert_eq!(
        state.create(&saved.revision, &fields("Second"), None, None, Some(&solver), NOW),
        Err(HostError::Rejected)
    );
    assert_eq!(state.view_opened().unwrap(), saved);
    assert_eq!(fs::read(root.primary()).unwrap(), bytes);
}

#[test]
fn inputs_with_the_loose_pace_or_consumption_are_rejected() {
    let root = Root::new();
    let mut state = root.state();
    let empty = state.open().unwrap();
    for (pace, consumption) in [
        (Some("90.5"), None),
        (None, Some("1.83")),
        (Some("90.5"), Some("1.83")),
        // even equal to the inputs, and even empty: the pair goes inside `inputs`
        (Some(""), None),
    ] {
        assert_eq!(
            state.create(&empty.revision, &fields("New"), pace, consumption, Some(&inputs()), NOW),
            Err(HostError::Rejected),
            "{pace:?} {consumption:?}"
        );
        assert_eq!(state.view_opened().unwrap(), empty);
    }
    // the loose pair alone, and inputs alone, are accepted
    assert!(state
        .create(&empty.revision, &fields("A"), Some("90.5"), Some("1.83"), None, NOW)
        .is_ok());
}

#[test]
fn create_with_inputs_keeps_the_usual_guards() {
    let root = Root::new();
    let mut state = root.state();
    let empty = state.open().unwrap();
    // a stale revision is a conflict and creates nothing
    let unknown_revision = "0".repeat(64);
    assert!(matches!(
        state.create(&unknown_revision, &fields("New"), None, None, Some(&inputs()), NOW),
        Err(HostError::StrategyConflict { .. })
    ));
    assert_eq!(state.view(), empty);
    // an unsaved draft blocks another create, as before
    let draft = create_with_inputs(&mut state, "One");
    assert_eq!(
        state.create(&draft.revision, &fields("Two"), None, None, Some(&inputs()), NOW),
        Err(HostError::StrategyDirty)
    );
    assert_eq!(state.view(), draft);
    // a protected document cannot take new events
    let future = String::from_utf8(
        br#"{"contractVersion":"strategy.v2","schemaVersion":"9.0.0","events":[]}"#.to_vec(),
    )
    .unwrap();
    fs::write(root.primary(), &future).unwrap();
    let mut other = root.state();
    let protected = other.open().unwrap();
    assert_eq!(protected.state, StrategyState::Protected);
    assert_eq!(
        other.create(&protected.revision, &fields("New"), None, None, Some(&inputs()), NOW),
        Err(HostError::Protected)
    );
    assert_eq!(fs::read(root.primary()).unwrap(), future.as_bytes());
    // a collection at its limit still protects itself
    let mut crowded = Document::empty(NOW).unwrap();
    for number in 0..EVENT_LIMIT {
        crowded
            .append_event(&vantare_strategy::document::new_event(
                &format!("event-{number}"),
                "Practice",
                90,
                90.0,
                18.0,
            ))
            .unwrap();
    }
    fs::write(root.primary(), crowded.bytes()).unwrap();
    let mut full = root.state();
    let opened = full.open().unwrap();
    assert_eq!(
        full.create(&opened.revision, &fields("One too many"), None, None, Some(&inputs()), NOW),
        Err(HostError::StrategyInvalidText)
    );
    assert_eq!(full.view_opened().unwrap(), opened);
}

#[test]
fn a_second_event_with_inputs_becomes_the_active_one_and_the_plan_starts_over() {
    let root = Root::new();
    let mut state = root.state();
    let empty = state.open().unwrap();
    let draft = state
        .create(&empty.revision, &fields("One"), None, None, Some(&inputs()), NOW)
        .unwrap();
    state.save(&draft.revision).unwrap();
    let saved = state.view();
    let created = state
        .create(&saved.revision, &fields("Two"), None, None, Some(&inputs()), NOW)
        .unwrap();
    // the new event is the active one; the plan is not
    assert_eq!(created.active_event_id.as_deref(), Some("native-event-2"));
    assert_eq!(created.plan.state, StrategyPlanState::Uncalculated);
    assert_eq!(created.events.iter().map(|e| e.has_inputs).collect::<Vec<_>>(), [true, true]);
}

#[test]
fn the_form_and_the_flag_never_put_a_path_or_the_document_on_the_wire() {
    let root = Root::new();
    let mut state = root.state();
    let draft = create_with_inputs(&mut state, "Fuji");
    let wire = serde_json::to_string(&draft).unwrap();
    assert!(wire.contains(r#""hasInputs":true"#), "{wire}");
    assert!(wire.contains(r#""form":{"fields":{"#), "{wire}");
    for private in [
        root.0.to_str().unwrap(),
        "nativeScalarInput",
        "contractVersion",
        "planningInputs",
        "overrides",
    ] {
        assert!(!wire.contains(private), "{private} in {wire}");
    }
    // the request, as the renderer sends it
    let request: crate::protocol::Request = serde_json::from_value(serde_json::json!({
        "method": "strategy.create",
        "revision": "a".repeat(64),
        "fields": fields("Fuji"),
        "basePaceSeconds": null,
        "fuelPerLapLiters": null,
        "inputs": inputs(),
    }))
    .unwrap();
    assert!(matches!(
        request,
        crate::protocol::Request::StrategyCreate { inputs: Some(_), .. }
    ));
    for extra in ["path", "dataDir", "file"] {
        let mut value = serde_json::json!({
            "method": "strategy.create",
            "revision": "a".repeat(64),
            "fields": fields("Fuji"),
            "basePaceSeconds": null,
            "fuelPerLapLiters": null,
            "inputs": null,
        });
        value[extra] = "C:/x".into();
        assert!(serde_json::from_value::<crate::protocol::Request>(value).is_err());
    }
    // `inputs` has the exact shape of the compute inputs: nothing else, nothing less
    let mut unknown = serde_json::to_value(inputs()).unwrap();
    unknown["extra"] = "x".into();
    let mut missing = serde_json::to_value(inputs()).unwrap();
    missing.as_object_mut().unwrap().remove("serviceMode");
    for bad in [unknown, missing] {
        assert!(
            serde_json::from_value::<crate::protocol::Request>(serde_json::json!({
                "method": "strategy.create",
                "revision": "a".repeat(64),
                "fields": fields("Fuji"),
                "basePaceSeconds": null,
                "fuelPerLapLiters": null,
                "inputs": bad,
            }))
            .is_err()
        );
    }
}
