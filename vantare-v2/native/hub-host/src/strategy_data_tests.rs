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

// The host writes what a calculation was given only when it collects a valid result.
// Cancelling drops the result, so the data given to `compute` are NOT kept: the
// screen has to confirm them first if cancelling must not lose them.
#[test]
fn cancelling_a_calculation_keeps_none_of_the_form_it_was_given() {
    let root = Root::new();
    let mut state = root.state();
    let before = create_with_inputs(&mut state, "Fuji");
    let mut other = form_of(&before).clone();
    other.fields.name = "Typed and cancelled".into();
    other.inputs.race_laps = "12".into();
    let started = state
        .compute(
            before.active_event_id.as_deref().unwrap(),
            before.active_strategy_id.as_deref().unwrap(),
            &before.revision,
            &other,
        )
        .unwrap();
    assert_eq!(started.plan.state, StrategyPlanState::Calculating);
    let id = started.plan.compute_id.unwrap();
    let cancelled = state.cancel_calculation(id).unwrap();
    assert_eq!(cancelled.plan.state, StrategyPlanState::Uncalculated);
    // the worker may still end; its result is discarded
    state.test_join_calculation();
    let after = state.view();
    assert_eq!(after.plan.state, StrategyPlanState::Uncalculated);
    assert_eq!(after.form, before.form, "the typed values are gone");
    assert_eq!(after.dirty, before.dirty);
    assert_eq!(after.revision, before.revision);
    assert_eq!(after.events, before.events);
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
        .confirm("native-event-1", "variant-1", &created.revision, &edited, None)
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
        .confirm("native-event-1", "variant-1", &saved.revision, &edited, None)
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
        .confirm("native-event-1", "variant-1", &saved.revision, &edited, None)
        .unwrap();
    assert_ne!(draft.form, saved.form);
    assert_eq!(state.discard(&draft.revision).unwrap().form, saved.form);

    // an unsaved draft, then another account: the new account reads the file
    let draft = state
        .confirm("native-event-1", "variant-1", &saved.revision, &edited, None)
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

// ---- review of E4-datos: each entry in its own place, honest spelling, guards ----

/// Thirteen different fields (a real RFC 3339 `startAt` among them): a swapped
/// mapping cannot hide behind equal values.
fn distinct_fields() -> StrategyFields {
    StrategyFields {
        name: "Fuji 6 h".into(),
        duration_minutes: "360".into(),
        fuel_capacity_liters: "82.5".into(),
        pit_transit_seconds: "27.5".into(),
        track: "Fuji".into(),
        class: "GT3".into(),
        variant_name: "Plan A".into(),
        variant_note: "Plan largo".into(),
        variant_mode: "dry".into(),
        start_at: "2026-11-20T10:30:00+01:00".into(),
        team: "Equipo Uno".into(),
        driver_name: "Ana Pérez".into(),
        driver_initials: "AP".into(),
    }
}

/// Fifteen different inputs.
fn distinct_inputs() -> StrategySolverFields {
    StrategySolverFields {
        base_pace_seconds: "91.25".into(),
        fuel_per_lap_liters: "2.5".into(),
        race_laps: "12".into(),
        ve_capacity_percent: "80".into(),
        ve_per_lap_percent: "4".into(),
        tyre_life_laps: "25".into(),
        degradation_seconds: "0.05".into(),
        refuel_rate: "3.5".into(),
        ve_rate: "2.25".into(),
        tyre_service_seconds: "28".into(),
        formation_seconds: "7".into(),
        fuel_step: "2".into(),
        ve_step: "5".into(),
        reserve_laps: "1.5".into(),
        service_mode: "sequential".into(),
    }
}

#[test]
fn each_entry_is_written_to_and_read_from_its_own_place() {
    use vantare_strategy::solver::Input;
    let root = Root::new();
    let mut state = root.state();
    let empty = state.open().unwrap();
    let draft = state
        .create(
            &empty.revision,
            &distinct_fields(),
            None,
            None,
            Some(&distinct_inputs()),
            NOW,
        )
        .unwrap();
    // read back field by field, with no help from a normalising comparison
    assert_eq!(form_of(&draft).fields, distinct_fields());
    assert_eq!(form_of(&draft).inputs, distinct_inputs());

    // and the document itself, read by hand, says each value where it belongs
    let saved = state.save(&draft.revision).unwrap();
    let doc = Document::parse(&fs::read(root.primary()).unwrap()).unwrap();
    let event = &doc.value()["events"][0];
    assert_eq!(event["name"]["value"], "Fuji 6 h");
    assert_eq!(event["durationMin"]["value"], 360);
    assert_eq!(event["tankLiters"]["value"], 82.5);
    assert_eq!(event["pitLossSeconds"]["value"], 27.5);
    assert_eq!(event["track"]["value"], "Fuji");
    assert_eq!(event["cls"]["value"], "GT3");
    assert_eq!(event["startAt"]["value"], "2026-11-20T10:30:00+01:00");
    assert_eq!(event["team"]["value"], "Equipo Uno");
    assert_eq!(event["drivers"][0]["name"]["value"], "Ana Pérez");
    assert_eq!(event["drivers"][0]["ini"]["value"], "AP");
    let variant = &event["strategies"][0];
    assert_eq!(variant["name"]["value"], "Plan A");
    assert_eq!(variant["note"]["value"], "Plan largo");
    assert_eq!(variant["mode"]["value"], "dry");
    let input: Input =
        serde_json::from_value(variant["overrides"]["nativeScalarInput"].clone()).unwrap();
    assert_eq!(input.race_laps, 12);
    assert_eq!(input.base_lap_seconds.value, 91.25);
    assert_eq!(input.fuel_per_lap_liters.value, 2.5);
    assert_eq!(input.ve_capacity_percent.value, 80.0);
    assert_eq!(input.ve_per_lap_percent.value, 4.0);
    assert_eq!(input.tyre_life_laps.value, 25.0);
    assert_eq!(input.degradation_per_lap_seconds.value, 0.05);
    assert_eq!(input.pit_cost.refuel_rate_l_per_s.value, 3.5);
    assert_eq!(input.pit_cost.ve_rate_p_per_s.value, 2.25);
    assert_eq!(input.pit_cost.tyre_seconds.value, 28.0);
    assert_eq!(input.pit_cost.transit_seconds.value, 27.5);
    assert_eq!(input.formation.seconds.value, 7.0);
    assert_eq!(input.discretization.fuel_liters, 2.0);
    assert_eq!(input.discretization.ve_percent, 5.0);
    assert_eq!(input.fuel_capacity_liters.value, 82.5);
    assert_eq!(input.fuel_reserve["laps"]["value"], 1.5);
    assert_eq!(input.pit_cost.service_mode, "sequential");
    assert_eq!(root.state().open().unwrap().form, saved.form);

    // a calculation with the same form is a no-op on the document and the form
    let form = draft.form.clone().unwrap();
    compute_form(&mut state, &saved, &form);
    let computed = state.view();
    assert!(computed.plan.result.is_some(), "{:?}", computed.plan.state);
    assert_eq!(computed.form, draft.form);
    assert_eq!(computed.revision, draft.revision);
}

#[test]
fn numbers_are_spelled_as_each_source_spells_them() {
    // The confirmed inputs come out as plain numbers; the entries the event
    // itself holds (tank, pit loss, the reserve laps, and the pace and consumption
    // when no confirmed inputs hold them) as the document stores them: a whole
    // number keeps its ".0".
    let root = Root::new();
    let mut state = root.state();
    let empty = state.open().unwrap();
    let confirmed = state
        .create(
            &empty.revision,
            &fields("Whole"),
            None,
            None,
            Some(&inputs()),
            NOW,
        )
        .unwrap();
    let form = form_of(&confirmed);
    assert_eq!(form.fields.duration_minutes, "90");
    assert_eq!(form.fields.fuel_capacity_liters, "82.0");
    assert_eq!(form.fields.pit_transit_seconds, "25.0");
    assert_eq!(form.inputs.base_pace_seconds, "90.5");
    assert_eq!(form.inputs.race_laps, "10");
    assert_eq!(form.inputs.ve_capacity_percent, "0");
    assert_eq!(form.inputs.tyre_life_laps, "30");
    assert_eq!(form.inputs.fuel_step, "1");
    assert_eq!(form.inputs.reserve_laps, "0.0");

    let mut other = root.state();
    other.open().unwrap();
    let loose = {
        let revision = other.view().revision;
        other
            .create(&revision, &fields("Loose"), Some("90"), Some("2"), None, NOW)
            .unwrap()
    };
    assert_eq!(form_of(&loose).inputs.base_pace_seconds, "90.0");
    assert_eq!(form_of(&loose).inputs.fuel_per_lap_liters, "2.0");
}

#[test]
fn a_calculation_normalises_a_document_that_is_not_canonical_in_the_draft_only() {
    use vantare_strategy::document::{manual, new_event};
    // numbers as whole JSON integers (the older Hub wrote them so) and texts with
    // spaces around them
    let mut event = new_event("event-1", "Practice", 90, 90.0, 18.0);
    event["tankLiters"]["value"] = serde_json::json!(82);
    event["pitLossSeconds"]["value"] = serde_json::json!(18);
    event["team"] = manual(" Local team ".into());
    event["activeStrategyId"] = "variant-1".into();
    let mut doc = Document::empty(NOW).unwrap();
    doc.append_event(&event).unwrap();
    doc.put("/activeEventId", &"event-1".into()).unwrap();
    let root = Root::new();
    fs::write(root.primary(), doc.bytes()).unwrap();
    let mut state = root.state();
    let opened = state.open().unwrap();
    assert!(!opened.dirty);
    // the form says what the document holds
    let form = form_of(&opened);
    assert_eq!(form.fields.fuel_capacity_liters, "82");
    assert_eq!(form.fields.pit_transit_seconds, "18");
    assert_eq!(form.fields.team, " Local team ");
    // KNOWN: `ManualEvent::confirm` (the crate, untouched here) compares a stored
    // whole integer with the number it parses (a float) and a stored text with its
    // trimmed form, so a calculation with the form as it is normalises the spelling:
    // the draft becomes «Sin guardar» with «82.0» and «Local team». The file is not
    // touched until Save; the pantalla can say it (E4c).
    let mut calculate = form.clone();
    calculate.inputs = inputs();
    compute_form(&mut state, &opened, &calculate);
    let view = state.view();
    assert!(view.plan.result.is_some());
    assert_eq!(fs::read(root.primary()).unwrap(), doc.bytes());
    assert!(view.dirty);
    let written = form_of(&view);
    assert_eq!(written.fields.team, "Local team");
    assert_eq!(written.fields.fuel_capacity_liters, "82.0");
    // and a second calculation with what it now shows changes nothing more
    let again = view.clone();
    compute_form(&mut state, &again, written);
    assert_eq!(state.view().revision, again.revision);
}

fn with_text(fields: &StrategyFields, key: &str, text: &str) -> StrategyFields {
    let mut value = serde_json::to_value(fields).unwrap();
    value[key] = text.into();
    serde_json::from_value(value).unwrap()
}

fn with_input_text(inputs: &StrategySolverFields, key: &str, text: &str) -> StrategySolverFields {
    let mut value = serde_json::to_value(inputs).unwrap();
    value[key] = text.into();
    serde_json::from_value(value).unwrap()
}

#[test]
fn a_text_out_of_range_in_any_of_the_28_entries_creates_nothing() {
    let root = Root::new();
    let mut state = root.state();
    let empty = state.open().unwrap();
    let bad = [
        ("over the limit", "x".repeat(TEXT_LIMIT + 1)),
        ("a control character", "a\u{7}b".to_owned()),
        ("a line break", "a\nb".to_owned()),
    ];
    let field_keys: Vec<String> = serde_json::to_value(fields("x"))
        .unwrap()
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect();
    let input_keys: Vec<String> = serde_json::to_value(inputs())
        .unwrap()
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect();
    assert_eq!((field_keys.len(), input_keys.len()), (13, 15));
    for (case, text) in &bad {
        for key in &field_keys {
            assert_eq!(
                state.create(
                    &empty.revision,
                    &with_text(&fields("New"), key, text),
                    None,
                    None,
                    Some(&inputs()),
                    NOW
                ),
                Err(HostError::StrategyInvalidText),
                "{case} in field {key}"
            );
        }
        for key in &input_keys {
            assert_eq!(
                state.create(
                    &empty.revision,
                    &fields("New"),
                    None,
                    None,
                    Some(&with_input_text(&inputs(), key, text)),
                    NOW
                ),
                Err(HostError::StrategyInvalidText),
                "{case} in input {key}"
            );
        }
        assert_eq!(state.view_opened().unwrap(), empty, "{case}");
        assert!(!root.primary().exists(), "{case}");
    }
}

/// A saved document with one event whose stored entries `change` rewrites.
fn stored_with(root: &Root, change: impl FnOnce(&mut serde_json::Value)) {
    let mut state = root.state();
    let draft = create_with_inputs(&mut state, "Stored");
    state.save(&draft.revision).unwrap();
    let bytes = fs::read(root.primary()).unwrap();
    let mut value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    change(&mut value["events"][0]);
    fs::write(root.primary(), serde_json::to_vec(&value).unwrap()).unwrap();
}

#[test]
fn a_stored_text_out_of_range_in_any_entry_makes_the_form_null() {
    type Change = fn(&mut serde_json::Value, &str);
    let long = "x".repeat(TEXT_LIMIT + 1);
    let exact = "x".repeat(TEXT_LIMIT);
    // `startAt` and `variantMode` cannot exceed the limit: the crate refuses a
    // document whose start is not RFC 3339 or whose mode is not one of four
    let places: [(&str, Change); 3] = [
        ("service mode", |event, text| {
            event["strategies"][0]["overrides"]["nativeScalarInput"]["pitCost"]["serviceMode"] =
                text.into();
        }),
        ("reserve laps", |event, text| {
            event["strategies"][0]["overrides"]["nativeScalarInput"]["fuelReserve"]["laps"]
                ["value"] = text.into();
        }),
        ("name", |event, text| {
            event["name"]["value"] = text.into();
        }),
    ];
    let mut checked = 0;
    for (place, change) in places {
        for (case, text, ok) in [
            ("at the limit", exact.as_str(), true),
            ("over the limit", long.as_str(), false),
            ("a control character", "a\u{7}", false),
        ] {
            let root = Root::new();
            stored_with(&root, |event| change(event, text));
            let bytes = fs::read(root.primary()).unwrap();
            let mut state = root.state();
            // a text the host cannot project (an event name) protects the file
            // instead; the others leave it readable and only drop the form
            let Ok(view) = state.open() else {
                assert!(place == "name" && !ok, "{place}, {case}");
                continue;
            };
            assert_eq!(view.form.is_some(), ok, "{place}, {case}");
            assert_eq!(
                fs::read(root.primary()).unwrap(),
                bytes,
                "{place}, {case}: never rewritten"
            );
            checked += 1;
        }
    }
    assert!(checked >= 7, "{checked} cases ran");
}

#[test]
fn has_inputs_is_about_plain_stored_inputs_and_a_form_with_invalid_ones_is_still_filled() {
    // stored inputs that read as an input but do not validate: the form shows them
    // (the user can correct them), and the event does not count as having inputs
    let root = Root::new();
    stored_with(&root, |event| {
        event["strategies"][0]["overrides"]["nativeScalarInput"]["raceLaps"] = 0.into();
    });
    let view = root.state().open().unwrap();
    assert!(!view.events[0].has_inputs);
    assert_eq!(form_of(&view).inputs.race_laps, "0");
    assert_eq!(form_of(&view).inputs.base_pace_seconds, "90.5");
    // inputs with an extended dimension are not plain stored inputs
    let root = Root::new();
    stored_with(&root, |event| {
        event["strategies"][0]["overrides"]["nativeScalarInput"]["futureDimension"] =
            serde_json::json!([1]);
    });
    assert!(!root.state().open().unwrap().events[0].has_inputs);
}

#[test]
fn a_calculation_with_no_solution_confirms_its_inputs_and_a_failed_one_confirms_nothing() {
    let root = Root::new();
    let mut state = root.state();
    let empty = state.open().unwrap();
    let plain = state
        .create(&empty.revision, &fields("Plain"), None, None, None, NOW)
        .unwrap();
    // a tank smaller than a lap's fuel: valid inputs, and no plan
    let mut infeasible = StrategyComputeForm {
        fields: fields("Plain"),
        inputs: inputs(),
    };
    infeasible.fields.fuel_capacity_liters = "1".into();
    infeasible.inputs.fuel_per_lap_liters = "5".into();

    // a failed calculation (an invalid input) does not touch the draft
    let mut invalid = infeasible.clone();
    invalid.inputs.race_laps = "diez".into();
    compute_form(&mut state, &plain, &invalid);
    let failed = state.view();
    assert_eq!(failed.plan.state, StrategyPlanState::Error);
    assert!(!failed.events[0].has_inputs);
    assert_eq!(failed.form, plain.form);
    assert_eq!(failed.revision, plain.revision);

    compute_form(&mut state, &plain, &infeasible);
    let none = state.view();
    assert_eq!(none.plan.state, StrategyPlanState::Calculated);
    assert_eq!(
        none.plan.result.as_ref().unwrap().certificate,
        Some(StrategyCertificate::NoSolution)
    );
    assert!(
        none.events[0].has_inputs,
        "the document does not know the outcome"
    );
    assert_eq!(form_of(&none).inputs.fuel_per_lap_liters, "5");
}

#[test]
fn the_guards_of_create_run_in_a_fixed_order() {
    // dirty, protected, not open, a malformed revision, a stale one, the inputs
    // with the loose pair, a text, the checks of the crate, and last the limit
    let root = Root::new();
    let mut state = root.state();
    let empty = state.open().unwrap();
    let outdated = "0".repeat(64);
    let create = |state: &mut State,
                  revision: &str,
                  form: &StrategyFields,
                  pace: Option<&str>,
                  solver: &StrategySolverFields| {
        state.create(revision, form, pace, None, Some(solver), NOW)
    };

    // 1. a draft first: dirty beats a stale revision
    let draft = state
        .create(&empty.revision, &fields("One"), None, None, None, NOW)
        .unwrap();
    assert_eq!(
        create(&mut state, &outdated, &fields("Two"), None, &inputs()),
        Err(HostError::StrategyDirty)
    );
    state.discard(&draft.revision).unwrap();

    // 2. a malformed revision is `rejected`, a well formed stale one a conflict
    assert_eq!(
        create(&mut state, "short", &fields("Two"), None, &inputs()),
        Err(HostError::Rejected)
    );
    assert!(matches!(
        create(&mut state, &outdated, &fields("Two"), None, &inputs()),
        Err(HostError::StrategyConflict { .. })
    ));
    // 3. the revision beats the inputs with the loose pair
    assert!(matches!(
        create(&mut state, &outdated, &fields("Two"), Some("90"), &inputs()),
        Err(HostError::StrategyConflict { .. })
    ));
    // 4. the pair beats a text
    let long = with_input_text(&inputs(), "serviceMode", &"x".repeat(TEXT_LIMIT + 1));
    assert_eq!(
        create(&mut state, &empty.revision, &fields("Two"), Some("90"), &long),
        Err(HostError::Rejected)
    );
    // 5. a text beats the checks of the crate (a zero pace as well)
    let mut both = long;
    both.base_pace_seconds = "0".into();
    assert_eq!(
        create(&mut state, &empty.revision, &fields("Two"), None, &both),
        Err(HostError::StrategyInvalidText)
    );
    // 6. the checks of the crate beat the limit of events
    let mut zero = inputs();
    zero.base_pace_seconds = "0".into();
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
        create(&mut full, &opened.revision, &fields("Two"), None, &zero),
        Err(HostError::Rejected)
    );
    assert_eq!(
        create(&mut full, &opened.revision, &fields("Two"), None, &inputs()),
        Err(HostError::StrategyInvalidText)
    );
    // 7. protected beats the revision; and a state that is not open is `denied`
    let future = br#"{"contractVersion":"strategy.v2","schemaVersion":"9.0.0","events":[]}"#;
    fs::write(root.primary(), future).unwrap();
    let mut protected = root.state();
    protected.open().unwrap();
    assert_eq!(
        create(&mut protected, &outdated, &fields("Two"), None, &inputs()),
        Err(HostError::Protected)
    );
    let mut closed = root.state();
    assert_eq!(
        create(&mut closed, "short", &fields("Two"), None, &inputs()),
        Err(HostError::Denied)
    );
}

// ---- confirm with inputs (#2662) ----

/// A saved event made with `fields("Fuji")` and no inputs, as the old flow leaves
/// it: the confirmation has something to add.
fn saved_without_inputs(state: &mut State) -> StrategyView {
    let empty = state.open().unwrap();
    let draft = state
        .create(&empty.revision, &fields("Fuji"), None, None, None, NOW)
        .unwrap();
    state.save(&draft.revision).unwrap()
}

/// A saved event with inputs, so a failed confirmation has something to damage.
fn saved_with(state: &mut State) -> StrategyView {
    let created = create_with_inputs(state, "Fuji");
    state.save(&created.revision).unwrap()
}

fn confirm_with(
    state: &mut State,
    view: &StrategyView,
    form: &StrategyFields,
    solver: Option<&StrategySolverFields>,
) -> Result<StrategyView, HostError> {
    state.confirm(
        view.active_event_id.as_deref().unwrap(),
        view.active_strategy_id.as_deref().unwrap(),
        &view.revision,
        form,
        solver,
    )
}

fn document_bytes(state: &State) -> Vec<u8> {
    state.doc.as_ref().unwrap().bytes().to_vec()
}

#[test]
fn confirm_with_inputs_keeps_them_in_the_draft_without_writing_the_file() {
    let root = Root::new();
    let mut state = root.state();
    let saved = saved_without_inputs(&mut state);
    assert!(!saved.events[0].has_inputs);
    let file = fs::read(root.primary()).unwrap();

    let draft = confirm_with(&mut state, &saved, &distinct_fields(), Some(&distinct_inputs()))
        .unwrap();
    assert!(draft.dirty);
    assert_ne!(draft.revision, saved.revision);
    assert!(draft.events[0].has_inputs);
    assert_eq!(draft.plan.state, StrategyPlanState::Uncalculated, "nothing was calculated");
    // field by field, with no normalising comparison
    assert_eq!(form_of(&draft).fields, distinct_fields());
    assert_eq!(form_of(&draft).inputs, distinct_inputs());
    assert_eq!(draft.events[0].name, "Fuji 6 h");
    assert_eq!(state.view(), draft);
    assert_eq!(fs::read(root.primary()).unwrap(), file, "not written before Save");

    // Save writes it and a restart reads the same
    let written = state.save(&draft.revision).unwrap();
    assert!(!written.dirty);
    let reopened = root.state().open().unwrap();
    assert_eq!(reopened, written);
    assert_eq!(form_of(&reopened).inputs, distinct_inputs());

    // and discard returns to the saved file
    let mut other = root.state();
    let again = other.open().unwrap();
    let draft = confirm_with(&mut other, &again, &distinct_fields(), Some(&inputs())).unwrap();
    assert_eq!(other.discard(&draft.revision).unwrap(), again);
}

#[test]
fn confirm_with_inputs_replaces_the_stored_ones_and_null_keeps_them() {
    let root = Root::new();
    let mut state = root.state();
    let created = saved_with(&mut state);
    assert!(same_inputs(&form_of(&created).inputs, &inputs()));

    // inputs null: the fields only, the stored inputs stay (as before)
    let kept = confirm_with(&mut state, &created, &fields("Renamed"), None).unwrap();
    assert!(same_inputs(&form_of(&kept).inputs, &inputs()));

    // inputs given: every one of the 15 is the new one
    let replaced =
        confirm_with(&mut state, &kept, &distinct_fields(), Some(&distinct_inputs())).unwrap();
    assert_eq!(form_of(&replaced).inputs, distinct_inputs());
    let doc = Document::parse(&document_bytes(&state)).unwrap();
    let stored = &doc.value()["events"][0]["strategies"][0]["overrides"]["nativeScalarInput"];
    assert_eq!(stored["raceLaps"], 12);
}

#[test]
fn confirm_with_inputs_is_idempotent_and_agrees_with_compute() {
    let root = Root::new();
    let mut state = root.state();
    let saved = saved_without_inputs(&mut state);
    let first =
        confirm_with(&mut state, &saved, &distinct_fields(), Some(&distinct_inputs())).unwrap();
    let bytes = document_bytes(&state);
    // the same data again changes nothing: not the revision, not the document
    let second =
        confirm_with(&mut state, &first, &distinct_fields(), Some(&distinct_inputs())).unwrap();
    assert_eq!(second, first);
    assert_eq!(document_bytes(&state), bytes);
    // a calculation of the same form finds nothing more to confirm
    compute_form(&mut state, &second, form_of(&second));
    assert_eq!(state.view().revision, first.revision);
    assert_eq!(document_bytes(&state), bytes);
}

#[test]
fn confirm_with_the_form_a_creation_with_inputs_gave_changes_nothing() {
    let root = Root::new();
    let mut state = root.state();
    let created = create_with_inputs(&mut state, "Fuji");
    let again = confirm_with(&mut state, &created, &fields("Fuji"), Some(&inputs())).unwrap();
    assert_eq!(again, created);
}

type Case = (&'static str, StrategyFields, StrategySolverFields, HostError);

fn invalid_cases() -> Vec<Case> {
    use StrategyField as F;
    let good = distinct_fields();
    let bad = |change: fn(&mut StrategySolverFields)| {
        let mut value = distinct_inputs();
        change(&mut value);
        value
    };
    let big = "9".repeat(TEXT_LIMIT + 1);
    let rejected = |name, form: &StrategyFields, solver, field| -> Case {
        (name, form.clone(), solver, HostError::StrategyInvalidInput { field })
    };
    let text = |name, form: StrategyFields, solver| -> Case {
        (name, form, solver, HostError::StrategyInvalidText)
    };
    vec![
        rejected("empty pace", &good, bad(|v| v.base_pace_seconds.clear()), Some(F::BasePaceSeconds)),
        rejected("zero pace", &good, bad(|v| v.base_pace_seconds = "0".into()), Some(F::BasePaceSeconds)),
        rejected("laps not whole", &good, bad(|v| v.race_laps = "2.5".into()), Some(F::RaceLaps)),
        rejected("zero laps", &good, bad(|v| v.race_laps = "0".into()), Some(F::RaceLaps)),
        rejected("empty step", &good, bad(|v| v.fuel_step.clear()), Some(F::FuelStep)),
        rejected("negative step", &good, bad(|v| v.ve_step = "-1".into()), Some(F::VeStep)),
        rejected("service mode", &good, bad(|v| v.service_mode = "other".into()), Some(F::ServiceMode)),
        rejected(
            "wet variant",
            &StrategyFields { variant_mode: "wet".into(), ..good.clone() },
            distinct_inputs(),
            None,
        ),
        rejected(
            "no name",
            &StrategyFields { name: String::new(), ..good.clone() },
            distinct_inputs(),
            None,
        ),
        text(
            "input over the limit",
            good.clone(),
            with_input_text(&distinct_inputs(), "degradationSeconds", &big),
        ),
        text(
            "input control",
            good.clone(),
            with_input_text(&distinct_inputs(), "reserveLaps", "1\u{7}"),
        ),
        text(
            "input line break",
            good.clone(),
            with_input_text(&distinct_inputs(), "serviceMode", "parallel\n"),
        ),
        text("field over the limit", with_text(&good, "team", &big), distinct_inputs()),
        text("field control", with_text(&good, "variantNote", "a\u{1b}b"), distinct_inputs()),
    ]
}

#[test]
fn confirm_with_invalid_inputs_changes_nothing_not_even_the_fields() {
    let root = Root::new();
    let mut state = root.state();
    let saved = saved_with(&mut state);
    let file = fs::read(root.primary()).unwrap();
    let bytes = document_bytes(&state);
    for (case, form, solver, error) in invalid_cases() {
        assert_eq!(confirm_with(&mut state, &saved, &form, Some(&solver)), Err(error), "{case}");
        assert_eq!(state.view_opened().unwrap(), saved, "{case}");
        assert_eq!(document_bytes(&state), bytes, "{case}");
        assert_eq!(fs::read(root.primary()).unwrap(), file, "{case}");
    }
    // over an unsaved draft the draft stays as it was
    let draft = confirm_with(&mut state, &saved, &fields("Draft"), None).unwrap();
    let bytes = document_bytes(&state);
    for (case, form, solver, error) in invalid_cases() {
        assert_eq!(confirm_with(&mut state, &draft, &form, Some(&solver)), Err(error), "{case}");
        assert_eq!(state.view(), draft, "{case}");
        assert_eq!(document_bytes(&state), bytes, "{case}");
    }
}

#[test]
fn confirm_with_inputs_on_a_missing_event_or_variant_is_rejected_as_ever() {
    let root = Root::new();
    let mut state = root.state();
    let saved = saved_with(&mut state);
    let long = with_input_text(&distinct_inputs(), "serviceMode", &"x".repeat(TEXT_LIMIT + 1));
    for (event, variant) in [("event-9", "variant-1"), ("native-event-1", "variant-9"), ("", "")] {
        for solver in [distinct_inputs(), long.clone()] {
            assert_eq!(
                state.confirm(event, variant, &saved.revision, &distinct_fields(), Some(&solver)),
                Err(HostError::Rejected),
                "{event}/{variant}"
            );
        }
    }
    assert_eq!(state.view(), saved);
}

#[test]
fn the_guards_of_confirm_run_in_a_fixed_order() {
    // protected, not open, a malformed revision, a stale one, no event or variant,
    // changes pending in another event, a text, and last the checks of the crate
    let root = Root::new();
    let mut state = root.state();
    let saved = saved_with(&mut state);
    let outdated = "0".repeat(64);
    let long = with_input_text(&distinct_inputs(), "serviceMode", &"x".repeat(TEXT_LIMIT + 1));
    let mut zero = distinct_inputs();
    zero.base_pace_seconds = "0".into();
    let confirm = |state: &mut State, event: &str, revision: &str, solver: &StrategySolverFields| {
        state.confirm(event, "variant-1", revision, &distinct_fields(), Some(solver))
    };

    // a malformed revision is `rejected`; a stale one a conflict
    assert_eq!(confirm(&mut state, "native-event-1", "short", &long), Err(HostError::Rejected));
    assert!(matches!(
        confirm(&mut state, "event-9", &outdated, &long),
        Err(HostError::StrategyConflict { .. })
    ));
    // a missing event beats the texts
    assert_eq!(confirm(&mut state, "event-9", &saved.revision, &long), Err(HostError::Rejected));
    // a text beats the checks of the crate (a zero pace as well)
    let mut both = long;
    both.base_pace_seconds = "0".into();
    assert_eq!(
        confirm(&mut state, "native-event-1", &saved.revision, &both),
        Err(HostError::StrategyInvalidText)
    );
    assert_eq!(
        confirm(&mut state, "native-event-1", &saved.revision, &zero),
        Err(HostError::StrategyInvalidInput { field: Some(StrategyField::BasePaceSeconds) })
    );

    // pending changes in the active event 2 beat the texts for event 1
    let second = state
        .create(&saved.revision, &fields("Second"), None, None, Some(&inputs()), NOW)
        .unwrap();
    assert!(second.dirty);
    assert_eq!(
        confirm(&mut state, "native-event-1", &second.revision, &both),
        Err(HostError::StrategyDirty)
    );
    assert_eq!(state.view(), second);
    // while the active event takes the confirmation over its own draft
    assert!(confirm(&mut state, "native-event-2", &second.revision, &distinct_inputs()).is_ok());

    // protected beats the revision; a state that is not open is `denied`
    let future = br#"{"contractVersion":"strategy.v2","schemaVersion":"9.0.0","events":[]}"#;
    fs::write(root.primary(), future).unwrap();
    let mut protected = root.state();
    protected.open().unwrap();
    assert_eq!(
        confirm(&mut protected, "native-event-1", &outdated, &distinct_inputs()),
        Err(HostError::Protected)
    );
    let mut closed = root.state();
    assert_eq!(
        confirm(&mut closed, "native-event-1", "short", &distinct_inputs()),
        Err(HostError::Denied)
    );
}

#[test]
fn confirm_with_inputs_on_an_event_the_solver_cannot_take_is_rejected_and_changes_nothing() {
    // an event with two drivers is outside what the scalar solver admits: the same
    // answer as compute, and the document stays as it was
    let root = Root::new();
    stored_with(&root, |event| {
        let mut driver = event["drivers"][0].clone();
        // a second driver of its own: a copy with the same id is no valid document
        driver["id"] = serde_json::json!("driver-2");
        driver["order"] = serde_json::json!(1);
        event["drivers"].as_array_mut().unwrap().push(driver);
    });
    let mut reopened = root.state();
    let opened = reopened.open().unwrap();
    assert_eq!(
        reopened.confirm(
            "native-event-1",
            "variant-1",
            &opened.revision,
            &distinct_fields(),
            Some(&distinct_inputs())
        ),
        Err(HostError::StrategyInvalidInput { field: None })
    );
    assert_eq!(reopened.view_opened().unwrap(), opened);
}

// ---- confirm answers like compute (#2677) ----

/// What `compute` says of a form: its `invalidInput` and the field it points at.
fn compute_verdict(
    state: &mut State,
    view: &StrategyView,
    form: &StrategyComputeForm,
) -> (Option<StrategyPlanError>, Option<StrategyField>) {
    compute_form(state, view, form);
    let plan = state.view().plan;
    (plan.error, plan.error_field)
}

/// One entry of the form turned bad, and the field both answers must name.
type ScalarCase = (&'static str, StrategySolverFields, Option<StrategyField>);

fn scalar_cases() -> Vec<ScalarCase> {
    use StrategyField as F;
    let change = |apply: fn(&mut StrategySolverFields)| {
        let mut value = distinct_inputs();
        apply(&mut value);
        value
    };
    vec![
        ("zero pace", change(|v| v.base_pace_seconds = "0".into()), Some(F::BasePaceSeconds)),
        ("negative pace", change(|v| v.base_pace_seconds = "-3".into()), Some(F::BasePaceSeconds)),
        ("text pace", change(|v| v.base_pace_seconds = "rápido".into()), Some(F::BasePaceSeconds)),
        ("zero laps", change(|v| v.race_laps = "0".into()), Some(F::RaceLaps)),
        ("too many laps", change(|v| v.race_laps = "100001".into()), Some(F::RaceLaps)),
        ("zero refuel rate", change(|v| v.refuel_rate = "0".into()), Some(F::RefuelRate)),
        ("zero VE rate", change(|v| v.ve_rate = "0".into()), Some(F::VeRate)),
        ("negative fuel per lap", change(|v| v.fuel_per_lap_liters = "-1".into()), Some(F::FuelPerLapLiters)),
        ("VE capacity over 100", change(|v| v.ve_capacity_percent = "101".into()), Some(F::VeCapacityPercent)),
        ("negative VE per lap", change(|v| v.ve_per_lap_percent = "-1".into()), Some(F::VePerLapPercent)),
        ("tyre life not whole", change(|v| v.tyre_life_laps = "10.5".into()), Some(F::TyreLifeLaps)),
        ("negative degradation", change(|v| v.degradation_seconds = "-1".into()), Some(F::DegradationSeconds)),
        ("negative tyre service", change(|v| v.tyre_service_seconds = "-1".into()), Some(F::TyreServiceSeconds)),
        ("negative formation", change(|v| v.formation_seconds = "-1".into()), Some(F::FormationSeconds)),
        ("negative fuel step", change(|v| v.fuel_step = "-1".into()), Some(F::FuelStep)),
        ("negative VE step", change(|v| v.ve_step = "-1".into()), Some(F::VeStep)),
        ("unknown service mode", change(|v| v.service_mode = "turbo".into()), Some(F::ServiceMode)),
    ]
}

#[test]
fn confirm_names_the_same_field_as_compute_for_every_scalar() {
    let root = Root::new();
    let mut state = root.state();
    let saved = saved_with(&mut state);
    for (case, solver, field) in scalar_cases() {
        let form = StrategyComputeForm { fields: distinct_fields(), inputs: solver.clone() };
        let (error, computed) = compute_verdict(&mut state, &saved, &form);
        assert_eq!(error, Some(StrategyPlanError::InvalidInput), "{case}");
        assert_eq!(computed, field, "compute: {case}");
        let confirmed = confirm_with(&mut state, &saved, &distinct_fields(), Some(&solver));
        assert_eq!(
            confirmed,
            Err(HostError::StrategyInvalidInput { field }),
            "confirm: {case}"
        );
    }
}

type FieldCase = (&'static str, fn(&mut StrategyFields), Option<StrategyField>);

#[test]
fn confirm_without_inputs_points_only_at_the_fields_it_confirms() {
    let root = Root::new();
    let mut state = root.state();
    let saved = saved_with(&mut state);
    let bytes = document_bytes(&state);
    let cases: [FieldCase; 4] = [
        ("duration", |f| f.duration_minutes = "mucho".into(), Some(StrategyField::DurationMinutes)),
        ("tank", |f| f.fuel_capacity_liters = "lleno".into(), Some(StrategyField::FuelCapacityLiters)),
        ("pit", |f| f.pit_transit_seconds = "x".into(), Some(StrategyField::PitTransitSeconds)),
        // a date the crate does not take is not a number: no field is named
        ("start", |f| f.start_at = "mañana".into(), None),
    ];
    for (case, apply, field) in cases {
        let mut form = distinct_fields();
        apply(&mut form);
        assert_eq!(
            confirm_with(&mut state, &saved, &form, None),
            Err(HostError::StrategyInvalidInput { field }),
            "{case}"
        );
        assert_eq!(document_bytes(&state), bytes, "{case}");
        assert_eq!(state.view(), saved, "{case}");
    }
}

#[test]
fn a_tank_smaller_than_a_lap_is_no_invalid_input_for_confirm_or_compute() {
    // the crate does not reject it: the search finds no plan, which is a result
    let root = Root::new();
    let mut state = root.state();
    let saved = saved_with(&mut state);
    let mut solver = distinct_inputs();
    solver.fuel_per_lap_liters = "100".into();
    let mut fields = distinct_fields();
    fields.fuel_capacity_liters = "50".into();
    let confirmed = confirm_with(&mut state, &saved, &fields, Some(&solver)).unwrap();
    assert!(confirmed.dirty);
    let form = StrategyComputeForm { fields, inputs: solver };
    let (error, field) = compute_verdict(&mut state, &confirmed, &form);
    assert_ne!(error, Some(StrategyPlanError::InvalidInput));
    assert_eq!(field, None);
}

#[test]
fn a_rejected_confirmation_leaves_the_plan_and_the_view_alone() {
    let root = Root::new();
    let mut state = root.state();
    let saved = saved_with(&mut state);
    let before = state.view();
    let bytes = document_bytes(&state);
    let mut zero = distinct_inputs();
    zero.base_pace_seconds = "0".into();
    assert!(confirm_with(&mut state, &saved, &distinct_fields(), Some(&zero)).is_err());
    assert_eq!(state.view(), before);
    assert_eq!(document_bytes(&state), bytes);
    assert!(confirm_with(&mut state, &saved, &distinct_fields(), Some(&distinct_inputs())).is_ok());
}

// ---- review of #2678 ----

#[test]
fn a_stored_negative_step_does_not_block_confirm_or_compute_with_the_corrected_form() {
    // saved before steps were checked: the stored inputs hold a negative VE step
    let root = Root::new();
    stored_with(&root, |event| {
        event["strategies"][0]["overrides"]["nativeScalarInput"]["serviceDiscretization"]
            ["vePercent"] = serde_json::json!(-1.0);
    });
    let mut state = root.state();
    let opened = state.open().unwrap();
    let confirmed =
        confirm_with(&mut state, &opened, &distinct_fields(), Some(&distinct_inputs())).unwrap();
    assert!(same_inputs(&form_of(&confirmed).inputs, &distinct_inputs()));
    let form = StrategyComputeForm { fields: distinct_fields(), inputs: distinct_inputs() };
    let (error, field) = compute_verdict(&mut state, &confirmed, &form);
    assert_ne!(error, Some(StrategyPlanError::InvalidInput));
    assert_eq!(field, None);
    // a form that is still wrong is refused with its own field
    let mut still = distinct_inputs();
    still.ve_step = "-1".into();
    assert_eq!(
        confirm_with(&mut state, &confirmed, &distinct_fields(), Some(&still)),
        Err(HostError::StrategyInvalidInput { field: Some(StrategyField::VeStep) })
    );
}

type FieldsCase = (&'static str, fn(&mut StrategyFields), StrategyField);

#[test]
fn confirm_names_the_same_field_as_compute_for_the_two_scalars_that_live_in_fields() {
    // a swap of FuelCapacity and PitTransit in the translation would show here
    let cases: [FieldsCase; 4] = [
        ("tank text", |f| f.fuel_capacity_liters = "lleno".into(), StrategyField::FuelCapacityLiters),
        ("tank negative", |f| f.fuel_capacity_liters = "-5".into(), StrategyField::FuelCapacityLiters),
        ("pit text", |f| f.pit_transit_seconds = "x".into(), StrategyField::PitTransitSeconds),
        ("pit negative", |f| f.pit_transit_seconds = "-1".into(), StrategyField::PitTransitSeconds),
    ];
    let root = Root::new();
    let mut state = root.state();
    let saved = saved_with(&mut state);
    for (case, apply, field) in cases {
        let mut fields = distinct_fields();
        apply(&mut fields);
        let form = StrategyComputeForm { fields: fields.clone(), inputs: distinct_inputs() };
        let (error, computed) = compute_verdict(&mut state, &saved, &form);
        assert_eq!(error, Some(StrategyPlanError::InvalidInput), "{case}");
        assert_eq!(computed, Some(field), "compute: {case}");
        assert_eq!(
            confirm_with(&mut state, &saved, &fields, Some(&distinct_inputs())),
            Err(HostError::StrategyInvalidInput { field: Some(field) }),
            "confirm: {case}"
        );
    }
}

#[test]
fn with_several_bad_entries_a_text_that_is_not_a_number_goes_first_in_the_order_of_the_form() {
    // the order of `ManualField::ALL`: the laps come before the pace; a text that
    // is not a number beats a limit of the crate whatever the position
    let root = Root::new();
    let mut state = root.state();
    let saved = saved_with(&mut state);
    for (case, change, field) in [
        (
            "laps and pace texts",
            (|v: &mut StrategySolverFields| {
                v.base_pace_seconds = "x".into();
                v.race_laps = "y".into();
            }) as fn(&mut StrategySolverFields),
            StrategyField::RaceLaps,
        ),
        (
            "text late, limit early",
            |v| {
                v.base_pace_seconds = "0".into();
                v.service_mode = "turbo".into();
                v.reserve_laps = "z".into();
            },
            StrategyField::ReserveLaps,
        ),
    ] {
        let mut solver = distinct_inputs();
        change(&mut solver);
        let form = StrategyComputeForm { fields: distinct_fields(), inputs: solver.clone() };
        let (_, computed) = compute_verdict(&mut state, &saved, &form);
        assert_eq!(computed, Some(field), "compute: {case}");
        assert_eq!(
            confirm_with(&mut state, &saved, &distinct_fields(), Some(&solver)),
            Err(HostError::StrategyInvalidInput { field: Some(field) }),
            "confirm: {case}"
        );
    }
}
