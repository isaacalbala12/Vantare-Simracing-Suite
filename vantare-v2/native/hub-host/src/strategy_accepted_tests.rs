#![allow(clippy::unwrap_used)]
//! E5a: the accepted plan. It lives in the document (schema 2.2.0) with a copy of
//! the entries it came from, shows apart from the proposal (`plan.accepted`) and is
//! never deleted by a change of the data: it only becomes stale.
use super::*;
use crate::strategy::accepted::StrategyAcceptedPlan;
use std::fs;

const NOW: &str = "2026-11-19T18:42:00Z";

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

fn fields() -> StrategyFields {
    StrategyFields {
        name: "Fuji".into(),
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

/// A race of 24 laps with a tank of six: several stops, proven in milliseconds.
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

fn form(change: impl FnOnce(&mut StrategyComputeForm)) -> StrategyComputeForm {
    let mut form = StrategyComputeForm {
        fields: fields(),
        inputs: inputs(),
    };
    change(&mut form);
    form
}

fn compute(state: &mut State, form: &StrategyComputeForm) -> StrategyView {
    let view = state.view();
    state
        .compute(
            view.active_event_id.as_deref().unwrap(),
            view.active_strategy_id.as_deref().unwrap(),
            &view.revision,
            form,
        )
        .unwrap();
    state.test_join_calculation();
    state.view()
}

/// A saved event with its plan calculated: the proposal on screen, nothing accepted.
fn planned(root: &Root) -> (State, StrategyView) {
    let mut state = root.state();
    let empty = state.open().unwrap();
    let created = state
        .create(&empty.revision, &fields(), None, None, Some(&inputs()), NOW)
        .unwrap();
    state.save(&created.revision).unwrap();
    let view = compute(&mut state, &form(|_| {}));
    assert_eq!(view.plan.state, StrategyPlanState::Calculated);
    (state, view)
}

fn accept(state: &mut State) -> Result<StrategyView, HostError> {
    let view = state.view();
    state.accept(&view.revision, view.plan.compute_id.unwrap_or(0), NOW)
}

fn accepted(view: &StrategyView) -> &StrategyAcceptedView {
    view.plan.accepted.as_deref().expect("an accepted plan")
}

fn stored(state: &State) -> serde_json::Value {
    serde_json::from_slice(state.doc.as_ref().unwrap().bytes()).unwrap()
}

#[test]
fn accepting_keeps_the_plan_in_the_draft_and_the_proposal_on_screen() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    assert!(!proposal.dirty);
    assert!(proposal.plan.accepted.is_none());
    assert_eq!(proposal.events[0].accepted_plan, StrategyAcceptedMark::None);
    let view = accept(&mut state).unwrap();
    // «Sin guardar»: the plan is in the draft and not in the file
    assert!(view.dirty);
    assert_ne!(view.revision, proposal.revision);
    let on_disk = fs::read(root.primary()).unwrap();
    assert!(!String::from_utf8_lossy(&on_disk).contains("acceptedPlan"));
    // the proposal stays exactly as it was; the accepted plan is a sibling
    assert_eq!(view.plan.state, proposal.plan.state);
    assert_eq!(view.plan.compute_id, proposal.plan.compute_id);
    assert_eq!(view.plan.result, proposal.plan.result);
    assert_eq!(view.plan.edit, proposal.plan.edit);
    let plan = accepted(&view);
    assert_eq!(plan.state, StrategyAcceptedState::Accepted);
    assert_eq!(plan.accepted_at, NOW);
    assert!(!plan.saved);
    assert!(plan.changes.is_empty() && plan.unreachable.is_none());
    assert_eq!(plan.result, **proposal.plan.result.as_ref().unwrap());
    // the proposal is the same plan: same calendar, zero seconds apart
    let compare = plan.compare.as_ref().unwrap();
    assert!(compare.same);
    assert_eq!(compare.delta_seconds.as_f64(), Some(0.0));
    assert_eq!(view.events[0].accepted_plan, StrategyAcceptedMark::Accepted);
    // the document moved to the schema that has plans, and only for this
    let document = stored(&state);
    assert_eq!(document["schemaVersion"], "2.2.0");
    assert_eq!(
        document["events"][0]["strategies"][0]["acceptedPlan"]["acceptedAt"],
        NOW
    );
}

#[test]
fn the_accepted_plan_copies_the_entries_and_the_full_calendar_without_the_proof() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    accept(&mut state).unwrap();
    let variant = stored(&state)["events"][0]["strategies"][0].clone();
    let stored: StrategyAcceptedPlan =
        serde_json::from_value(variant["acceptedPlan"].clone()).unwrap();
    assert_eq!(stored.entries.inputs.race_laps, "24");
    assert_eq!(stored.entries.inputs.fuel_per_lap_liters, "1.83");
    assert_eq!(stored.entries.fields.driver_name, "Pilot");
    let timeline = stored.result.timeline.as_ref().unwrap();
    assert_eq!(timeline.stints.len(), timeline.pits.len() + 1);
    assert!(timeline.pits.len() >= 2);
    let pit = &timeline.pits[0];
    // transit 25 s plus the longest of 30 s of tyres and the fuel at 4 L/s
    let fuel = pit.fuel_liters.as_f64().unwrap();
    let expected = 25.0 + (fuel / 4.0).max(30.0);
    assert!((pit.pit_seconds.as_f64().unwrap() - expected).abs() < 1e-6);
    assert_eq!(pit.pinned, StrategyPitPinned::default());
    // nothing of the solver's internals: only these keys under the plan
    let keys = |value: &serde_json::Value| {
        let mut keys: Vec<_> = value.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        keys
    };
    assert_eq!(
        keys(&variant["acceptedPlan"]),
        ["acceptedAt", "entries", "result"]
    );
    assert_eq!(
        keys(&variant["acceptedPlan"]["result"]),
        ["certificate", "degraded", "metrics", "reason", "steps", "timeline"]
    );
}

#[test]
fn saving_and_reopening_keeps_the_accepted_plan_and_everything_else_byte_for_byte() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    let view = accept(&mut state).unwrap();
    let saved = state.save(&view.revision).unwrap();
    assert!(!saved.dirty);
    assert!(accepted(&saved).saved);
    let bytes = fs::read(root.primary()).unwrap();
    assert!(String::from_utf8_lossy(&bytes).contains("\"acceptedPlan\""));
    // a new session reads the same file: the plan is there, nothing is calculated
    let mut reopened = root.state();
    let opened = reopened.open().unwrap();
    assert_eq!(opened.plan.state, StrategyPlanState::Uncalculated);
    assert!(opened.plan.result.is_none());
    let plan = accepted(&opened);
    assert_eq!(plan.state, StrategyAcceptedState::Accepted);
    assert!(plan.saved && plan.compare.is_none());
    assert_eq!(plan.accepted_at, NOW);
    assert_eq!(opened.events[0].accepted_plan, StrategyAcceptedMark::Accepted);
    assert_eq!(opened.revision, saved.revision);
    assert!(!opened.dirty);
    // another edit does not rewrite the plan
    let confirmed = reopened
        .confirm(
            opened.active_event_id.as_deref().unwrap(),
            opened.active_strategy_id.as_deref().unwrap(),
            &opened.revision,
            &StrategyFields {
                variant_note: "una nota".into(),
                ..fields()
            },
            None,
        )
        .unwrap();
    let before = String::from_utf8(bytes).unwrap();
    let after = String::from_utf8(reopened.doc.as_ref().unwrap().bytes().to_vec()).unwrap();
    // the text of the `acceptedPlan` member, from its key to its closing brace
    let cut = |text: &str| {
        let start = text.find("\"acceptedPlan\":").unwrap();
        let open = start + text[start..].find('{').unwrap();
        let mut depth = 0;
        let end = text[open..]
            .char_indices()
            .find_map(|(index, character)| {
                match character {
                    '{' => depth += 1,
                    '}' => depth -= 1,
                    _ => {}
                }
                (depth == 0).then_some(open + index + 1)
            })
            .unwrap();
        text[start..end].to_owned()
    };
    assert_eq!(cut(&before), cut(&after));
    // a note is a label: the plan is not stale
    assert_eq!(accepted(&confirmed).state, StrategyAcceptedState::Accepted);
}

#[test]
fn a_stale_revision_or_another_compute_id_is_a_conflict_and_changes_nothing() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    let before = state.view();
    let id = proposal.plan.compute_id.unwrap();
    for (revision, compute_id) in [
        (proposal.revision.clone(), id + 1),
        (proposal.revision.clone(), 0),
        ("0".repeat(64), id),
    ] {
        let error = state.accept(&revision, compute_id, NOW).unwrap_err();
        assert!(
            matches!(error, HostError::StrategyConflict { .. }),
            "{revision} {compute_id}: {error:?}"
        );
    }
    assert_eq!(
        state.accept("not-a-revision", id, NOW),
        Err(HostError::Rejected)
    );
    assert_eq!(state.view(), before);
    // the conflict carries the current view so the screen can catch up
    let HostError::StrategyConflict { current } =
        state.accept(&"0".repeat(64), id, NOW).unwrap_err()
    else {
        panic!("a conflict");
    };
    assert_eq!(*current, before);
    // and the right pair still works afterwards
    accept(&mut state).unwrap();
}

#[test]
fn only_a_finished_plan_with_a_timeline_can_be_accepted() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    // without a plan on screen no compute id is valid
    state.show_accepted(&proposal.revision).unwrap_err();
    let mut fresh = root.state();
    fresh.open().unwrap();
    let revision = fresh.view().revision;
    assert!(matches!(
        fresh.accept(&revision, 1, NOW),
        Err(HostError::StrategyConflict { .. })
    ));
    // a plan with no solution has nothing to keep
    let impossible = form(|form| form.fields.fuel_capacity_liters = "1".into());
    let view = compute(&mut state, &impossible);
    assert_eq!(view.plan.state, StrategyPlanState::Calculated);
    assert!(view.plan.result.as_ref().unwrap().timeline.is_none());
    assert_eq!(accept(&mut state), Err(HostError::StrategyNotAcceptable));
    // a running calculation is busy, never accepted
    let view = state.view();
    state
        .compute(
            view.active_event_id.as_deref().unwrap(),
            view.active_strategy_id.as_deref().unwrap(),
            &view.revision,
            &form(|_| {}),
        )
        .unwrap();
    assert_eq!(accept(&mut state), Err(HostError::Busy));
    state.test_join_calculation();
    accept(&mut state).unwrap();
}

#[test]
fn an_edited_schedule_must_be_recalculated_before_it_is_accepted() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    let stop = proposal.plan.edit.as_ref().unwrap().stops[0].clone();
    let id = proposal.plan.compute_id.unwrap();
    let edited = state
        .move_stop(&proposal.revision, id, 0, if stop.lap < stop.max_lap { 1 } else { -1 })
        .unwrap();
    assert_eq!(edited.plan.state, StrategyPlanState::Edited);
    assert_eq!(accept(&mut state), Err(HostError::StrategyEditPending));
    state.reset_edit(&edited.revision, id).unwrap();
    accept(&mut state).unwrap();
}

#[test]
fn a_partial_plan_can_be_accepted_and_keeps_its_certificate_and_reason() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    // the search ended without proving it: the same plan, `partial`, not proven
    let mut partial = proposal.plan.clone();
    partial.state = StrategyPlanState::Partial;
    let result = partial.result.as_mut().unwrap();
    result.certificate = Some(StrategyCertificate::NotProven);
    result.reason = Some(StrategyReason::SearchBudgetExhausted);
    let document = state.doc.as_ref().unwrap().clone();
    state
        .calculation
        .start(move |_| Ok((document, partial, None)))
        .unwrap();
    let document = state.calculation.finish().unwrap();
    state.apply_draft(document);
    let view = accept(&mut state).unwrap();
    let plan = accepted(&view);
    assert_eq!(plan.state, StrategyAcceptedState::Accepted);
    assert_eq!(plan.result.certificate, Some(StrategyCertificate::NotProven));
    assert_eq!(plan.result.reason, Some(StrategyReason::SearchBudgetExhausted));
    // it is stored as it is and read back as it is
    let saved = state.save(&view.revision).unwrap();
    let reopened = root.state().open().unwrap();
    assert_eq!(accepted(&reopened).result, accepted(&saved).result);
    assert_eq!(accepted(&reopened).result, plan.result);
}

#[test]
fn unaccepting_removes_the_plan_marks_the_document_and_leaves_the_proposal() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    let view = accept(&mut state).unwrap();
    let saved = state.save(&view.revision).unwrap();
    let removed = state.unaccept(&saved.revision).unwrap();
    assert!(removed.plan.accepted.is_none());
    assert_eq!(removed.events[0].accepted_plan, StrategyAcceptedMark::None);
    assert!(removed.dirty, "removing it is also «Sin guardar»");
    assert_eq!(removed.plan.state, StrategyPlanState::Calculated);
    assert!(removed.plan.result.is_some());
    let document = stored(&state);
    assert!(document["events"][0]["strategies"][0]
        .get("acceptedPlan")
        .is_none());
    // the schema never goes back down
    assert_eq!(document["schemaVersion"], "2.2.0");
    // nothing to remove the second time, and a stale revision is a conflict
    assert_eq!(
        state.unaccept(&removed.revision),
        Err(HostError::StrategyNoAcceptedPlan)
    );
    assert!(matches!(
        state.unaccept(&"0".repeat(64)),
        Err(HostError::StrategyConflict { .. })
    ));
    // the file still holds the plan: discarding the change brings it back
    let discarded = state.discard(&removed.revision).unwrap();
    assert_eq!(accepted(&discarded).state, StrategyAcceptedState::Accepted);
    assert!(accepted(&discarded).saved && !discarded.dirty);
}

#[test]
fn replacing_a_plan_is_one_level_and_discard_brings_the_previous_one_back() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    let view = accept(&mut state).unwrap();
    let saved = state.save(&view.revision).unwrap();
    let first = accepted(&saved).result.clone();
    // a slower pace gives another plan; accept it over the first
    let slower = compute(&mut state, &form(|form| form.inputs.base_pace_seconds = "95".into()));
    let view = state
        .accept(
            &slower.revision,
            slower.plan.compute_id.unwrap(),
            "2026-11-19T19:00:00Z",
        )
        .unwrap();
    assert_eq!(accepted(&view).accepted_at, "2026-11-19T19:00:00Z");
    assert_eq!(accepted(&view).state, StrategyAcceptedState::Accepted);
    assert_ne!(accepted(&view).result, first);
    assert!(view.dirty && !accepted(&view).saved);
    let back = state.discard(&view.revision).unwrap();
    assert_eq!(accepted(&back).result, first);
    assert_eq!(accepted(&back).accepted_at, NOW);
    assert!(accepted(&back).saved);
}

#[test]
fn changed_data_make_the_plan_stale_and_say_what_changed_without_deleting_it() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    let view = accept(&mut state).unwrap();
    let saved = state.save(&view.revision).unwrap();
    let original = accepted(&saved).result.clone();
    // a slower pace still reaches the finish: stale, with the change listed
    let slower = compute(&mut state, &form(|form| form.inputs.base_pace_seconds = "91".into()));
    let plan = accepted(&slower);
    assert_eq!(plan.state, StrategyAcceptedState::Stale);
    assert_eq!(
        plan.changes,
        [StrategyChange {
            field: StrategyField::BasePaceSeconds,
            before: Some("90.5".into()),
            after: Some("91".into()),
        }]
    );
    assert!(plan.unreachable.is_none());
    assert_eq!(plan.result, original, "the plan itself is never touched");
    assert_eq!(slower.events[0].accepted_plan, StrategyAcceptedMark::Stale);
    // the proposal made with the new data is slower than the accepted plan: the
    // difference is the proposal MINUS the accepted plan, so it is positive
    let compare = plan.compare.as_ref().unwrap();
    assert!(!compare.same || compare.delta_seconds.as_f64().unwrap() > 0.0);
    let proposal = slower.plan.result.as_ref().unwrap().metrics.as_ref().unwrap();
    let kept = original.metrics.as_ref().unwrap();
    assert_eq!(
        compare.delta_seconds.as_f64().unwrap(),
        proposal.total_seconds.as_f64().unwrap() - kept.total_seconds.as_f64().unwrap()
    );
    assert!(compare.delta_seconds.as_f64().unwrap() > 0.0, "slower: positive");
    // and a faster pace gives a negative difference
    let faster = compute(&mut state, &form(|form| form.inputs.base_pace_seconds = "89".into()));
    assert!(accepted(&faster).compare.as_ref().unwrap().delta_seconds.as_f64().unwrap() < 0.0);
}

#[test]
fn a_plan_that_no_longer_reaches_the_finish_says_why_and_is_kept() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    let view = accept(&mut state).unwrap();
    let saved = state.save(&view.revision).unwrap();
    let original = accepted(&saved).result.clone();
    // The first lap the accepted plan cannot complete at 2.5 L per lap, counted
    // here lap by lap from the load it starts with and what each stop adds.
    let timeline = original.timeline.as_ref().unwrap();
    let mut fuel = timeline.fuel_start_liters.as_f64().unwrap();
    let mut dry_lap = None;
    'race: for (stint, laps) in timeline.stints.iter().enumerate() {
        for lap in laps.from_lap..=laps.to_lap {
            if fuel < 2.5 {
                dry_lap = Some(lap);
                break 'race;
            }
            fuel -= 2.5;
        }
        if let Some(pit) = timeline.pits.get(stint) {
            fuel += pit.fuel_liters.as_f64().unwrap();
        }
    }
    assert!(dry_lap.is_some(), "the thirstier car does run dry");
    let cases = [
        // thirstier: the fuel of the plan runs out, and the lap is known
        (
            form(|form| form.inputs.fuel_per_lap_liters = "2.5".into()),
            StrategyUnreachableCause::ResourceExhausted,
            StrategyField::FuelPerLapLiters,
            dry_lap,
        ),
        // a reserve the plan was not made for: it finishes, there is no lap
        (
            form(|form| form.inputs.reserve_laps = "3".into()),
            StrategyUnreachableCause::ReserveNotMet,
            StrategyField::ReserveLaps,
            None,
        ),
        // a longer race: the calendar does not cover it
        (
            form(|form| form.inputs.race_laps = "30".into()),
            StrategyUnreachableCause::ScheduleMismatch,
            StrategyField::RaceLaps,
            None,
        ),
    ];
    for (changed, cause, field, fail_lap) in cases {
        let view = state.view();
        let view = state
            .confirm(
                view.active_event_id.as_deref().unwrap(),
                view.active_strategy_id.as_deref().unwrap(),
                &view.revision,
                &changed.fields,
                Some(&changed.inputs),
            )
            .unwrap();
        let plan = accepted(&view);
        assert_eq!(plan.state, StrategyAcceptedState::StaleUnreachable, "{cause:?}");
        let unreachable = plan.unreachable.expect("a cause");
        assert_eq!(unreachable.cause, cause);
        // the lap of the failure is the one the replay of the crate names
        assert_eq!(unreachable.fail_lap, fail_lap, "{cause:?}");
        assert!(plan.changes.iter().any(|change| change.field == field));
        assert_eq!(plan.result, original);
        assert_eq!(view.events[0].accepted_plan, StrategyAcceptedMark::Stale);
        // back to the entries the plan was made with: accepted again, nothing lost
        let again = state.confirm(
            view.active_event_id.as_deref().unwrap(),
            view.active_strategy_id.as_deref().unwrap(),
            &view.revision,
            &fields(),
            Some(&inputs()),
        );
        assert_eq!(
            accepted(&again.unwrap()).state,
            StrategyAcceptedState::Accepted
        );
    }
}

#[test]
fn names_notes_and_the_spelling_of_a_number_do_not_make_the_plan_stale() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    let view = accept(&mut state).unwrap();
    let relabelled = StrategyFields {
        name: "Otro nombre".into(),
        variant_name: "Otra".into(),
        variant_note: "nota nueva".into(),
        ..fields()
    };
    let respelled = StrategySolverFields {
        fuel_per_lap_liters: "1.830".into(),
        base_pace_seconds: "90.50".into(),
        ..inputs()
    };
    let view = state
        .confirm(
            view.active_event_id.as_deref().unwrap(),
            view.active_strategy_id.as_deref().unwrap(),
            &view.revision,
            &relabelled,
            Some(&respelled),
        )
        .unwrap();
    assert_eq!(accepted(&view).state, StrategyAcceptedState::Accepted);
    assert_eq!(accepted(&view).changes, Vec::new());
    // a text field counts as written: "PI" to "P1" is a change
    let changed = state
        .confirm(
            view.active_event_id.as_deref().unwrap(),
            view.active_strategy_id.as_deref().unwrap(),
            &view.revision,
            &StrategyFields {
                driver_initials: "P1".into(),
                ..relabelled
            },
            Some(&respelled),
        )
        .unwrap();
    assert_eq!(accepted(&changed).state, StrategyAcceptedState::Stale);
    assert_eq!(accepted(&changed).changes[0].field, StrategyField::DriverInitials);
}

#[test]
fn a_changed_text_over_the_limit_is_reported_without_its_value_never_cut() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    let view = accept(&mut state).unwrap();
    let long = "x".repeat(STRATEGY_CHANGE_TEXT_LIMIT + 1);
    let exact = "y".repeat(STRATEGY_CHANGE_TEXT_LIMIT);
    for (text, shown) in [(long, None), (exact.clone(), Some(exact))] {
        let view = state
            .confirm(
                view.active_event_id.as_deref().unwrap(),
                view.active_strategy_id.as_deref().unwrap(),
                &state.view().revision,
                &StrategyFields {
                    team: text,
                    ..fields()
                },
                Some(&inputs()),
            )
            .unwrap();
        let change = &accepted(&view).changes[0];
        assert_eq!(change.field, StrategyField::Team);
        assert_eq!(change.before, Some(String::new()));
        assert_eq!(change.after, shown);
    }
}

#[test]
fn show_accepted_drops_the_proposal_and_leaves_the_document_alone() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    let view = accept(&mut state).unwrap();
    let saved = state.save(&view.revision).unwrap();
    let before = state.doc.as_ref().unwrap().bytes().to_vec();
    let shown = state.show_accepted(&saved.revision).unwrap();
    assert_eq!(shown.plan.state, StrategyPlanState::Uncalculated);
    assert!(shown.plan.result.is_none() && shown.plan.compute_id.is_none());
    assert_eq!(accepted(&shown).state, StrategyAcceptedState::Accepted);
    assert!(accepted(&shown).compare.is_none());
    assert_eq!(shown.revision, saved.revision);
    assert!(!shown.dirty);
    assert_eq!(state.doc.as_ref().unwrap().bytes(), before);
    // with no accepted plan there is nothing to show; a stale revision conflicts
    let removed = state.unaccept(&shown.revision).unwrap();
    assert_eq!(
        state.show_accepted(&removed.revision),
        Err(HostError::StrategyNoAcceptedPlan)
    );
    assert!(matches!(
        state.show_accepted(&"0".repeat(64)),
        Err(HostError::StrategyConflict { .. })
    ));
}

#[test]
fn a_calculation_after_accepting_keeps_the_plan_and_compares_with_it() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    accept(&mut state).unwrap();
    // the same data again: the new proposal is the accepted plan
    let again = compute(&mut state, &form(|_| {}));
    let plan = accepted(&again);
    assert_eq!(plan.state, StrategyAcceptedState::Accepted);
    assert!(plan.compare.as_ref().unwrap().same);
    assert_eq!(plan.compare.as_ref().unwrap().delta_seconds.as_f64(), Some(0.0));
}

fn write_document(root: &Root, change: impl FnOnce(&mut serde_json::Value)) -> Vec<u8> {
    let (mut state, _) = planned(root);
    let view = accept(&mut state).unwrap();
    state.save(&view.revision).unwrap();
    let mut value: serde_json::Value =
        serde_json::from_slice(&fs::read(root.primary()).unwrap()).unwrap();
    change(&mut value);
    let bytes = serde_json::to_vec(&value).unwrap();
    fs::write(root.primary(), &bytes).unwrap();
    bytes
}

#[test]
fn a_document_with_a_malformed_plan_opens_protected_and_is_never_touched() {
    type Break = fn(&mut serde_json::Value);
    let cases: [(&str, Break); 16] = [
        ("an unknown key", |v| {
            v["events"][0]["strategies"][0]["acceptedPlan"]["extra"] = 1.into();
        }),
        ("a missing result", |v| {
            v["events"][0]["strategies"][0]["acceptedPlan"]
                .as_object_mut()
                .unwrap()
                .remove("result");
        }),
        ("no timeline", |v| {
            v["events"][0]["strategies"][0]["acceptedPlan"]["result"]["timeline"] =
                serde_json::Value::Null;
        }),
        ("a bad date", |v| {
            v["events"][0]["strategies"][0]["acceptedPlan"]["acceptedAt"] = "ayer".into();
        }),
        ("an unproven certificate with no reason", |v| {
            v["events"][0]["strategies"][0]["acceptedPlan"]["result"]["certificate"] =
                "not_proven".into();
        }),
        ("a stop off its stint", |v| {
            v["events"][0]["strategies"][0]["acceptedPlan"]["result"]["timeline"]["pits"][0]
                ["lap"] = 3.into();
        }),
        ("a negative amount", |v| {
            v["events"][0]["strategies"][0]["acceptedPlan"]["result"]["timeline"]["pits"][0]
                ["fuelLiters"] = (-1).into();
        }),
        ("a plan under a schema that has none", |v| {
            v["schemaVersion"] = "2.1.0".into();
        }),
        // what the renderer's validator would refuse must not open: the view built
        // from it would be rejected as a whole
        ("a date with a lower case t", |v| {
            v["events"][0]["strategies"][0]["acceptedPlan"]["acceptedAt"] =
                "2026-11-19t18:42:00Z".into();
        }),
        ("a date with a lower case z", |v| {
            v["events"][0]["strategies"][0]["acceptedPlan"]["acceptedAt"] =
                "2026-11-19T18:42:00z".into();
        }),
        ("a date with a space", |v| {
            v["events"][0]["strategies"][0]["acceptedPlan"]["acceptedAt"] =
                "2026-11-19 18:42:00Z".into();
        }),
        ("a negative fuel step", |v| {
            v["events"][0]["strategies"][0]["acceptedPlan"]["result"]["steps"]["fuelLiters"] =
                (-1).into();
        }),
        ("a negative energy step", |v| {
            v["events"][0]["strategies"][0]["acceptedPlan"]["result"]["steps"]["vePercent"] =
                (-0.5).into();
        }),
        ("an unproven plan whose reason is no feasible plan", |v| {
            let result = &mut v["events"][0]["strategies"][0]["acceptedPlan"]["result"];
            result["certificate"] = "not_proven".into();
            result["reason"] = "noFeasiblePlan".into();
        }),
        ("an unproven plan whose reason is unsatisfiable constraints", |v| {
            let result = &mut v["events"][0]["strategies"][0]["acceptedPlan"]["result"];
            result["certificate"] = "not_proven".into();
            result["reason"] = "constraintsUnsatisfiable".into();
        }),
        ("a race longer than the crate takes", |v| {
            let timeline =
                &mut v["events"][0]["strategies"][0]["acceptedPlan"]["result"]["timeline"];
            timeline["stints"] = serde_json::json!([{"fromLap": 1, "toLap": 100_001}]);
            timeline["pits"] = serde_json::json!([]);
        }),
    ];
    for (name, change) in cases {
        let root = Root::new();
        let bytes = write_document(&root, change);
        let mut state = root.state();
        assert_eq!(state.open().err(), Some(HostError::Protected), "{name}");
        let view = state.view();
        assert_eq!(view.state, StrategyState::Protected, "{name}");
        assert!(view.events.is_empty() && view.plan.accepted.is_none(), "{name}");
        assert_eq!(fs::read(root.primary()).unwrap(), bytes, "{name}: the file is not touched");
        assert_eq!(
            state.accept(&view.revision, 1, NOW),
            Err(HostError::Protected),
            "{name}"
        );
        let names: Vec<_> = fs::read_dir(&root.0)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert!(
            names.iter().all(|name| !name.ends_with(".invalid")),
            "{name}: nothing is moved aside: {names:?}"
        );
    }
}

#[test]
fn schemas_before_and_after_open_as_they_always_did() {
    // 2.2.0 without a plan, and the two older ones, are ordinary documents
    for schema in ["2.0.0", "2.1.0", "2.2.0"] {
        let root = Root::new();
        let bytes = String::from_utf8(planned_document(&root)).unwrap();
        let bytes = bytes.replace("\"schemaVersion\":\"2.1.0\"", &format!("\"schemaVersion\":\"{schema}\""));
        fs::write(root.primary(), &bytes).unwrap();
        let mut state = root.state();
        let view = state.open().unwrap();
        // a 2.0.0 file has no `rules`, which the fixture does not use
        assert_eq!(view.state, StrategyState::Ready, "{schema}");
        assert_eq!(view.events[0].accepted_plan, StrategyAcceptedMark::None);
        assert_eq!(fs::read(root.primary()).unwrap(), bytes.as_bytes());
    }
    // a schema from the future is protected, as before
    let root = Root::new();
    let bytes = String::from_utf8(planned_document(&root))
        .unwrap()
        .replace("\"schemaVersion\":\"2.1.0\"", "\"schemaVersion\":\"2.3.0\"");
    fs::write(root.primary(), &bytes).unwrap();
    let mut state = root.state();
    assert_eq!(state.open().unwrap().state, StrategyState::Protected);
    assert_eq!(fs::read(root.primary()).unwrap(), bytes.as_bytes());
}

fn planned_document(root: &Root) -> Vec<u8> {
    let (state, _) = planned(root);
    state.doc.as_ref().unwrap().bytes().to_vec()
}

#[test]
fn a_changed_file_on_disk_is_a_conflict_when_saving_the_accepted_plan() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    let view = accept(&mut state).unwrap();
    // someone else rewrote the file after it was read
    let mut value: serde_json::Value =
        serde_json::from_slice(&fs::read(root.primary()).unwrap()).unwrap();
    value["future"] = serde_json::json!({"gain": 1.23});
    fs::write(root.primary(), serde_json::to_vec(&value).unwrap()).unwrap();
    let error = state.save(&view.revision).unwrap_err();
    assert!(matches!(error, HostError::StrategyConflict { .. }), "{error:?}");
    assert!(!String::from_utf8_lossy(&fs::read(root.primary()).unwrap()).contains("acceptedPlan"));
}

#[test]
fn the_wire_carries_no_path_and_refuses_one() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    let view = accept(&mut state).unwrap();
    let text = serde_json::to_string(&view).unwrap();
    let root_text = root.0.to_string_lossy().replace('\\', "\\\\");
    assert!(!text.contains(&root_text) && !text.contains("strategy-v2.json\\"));
    for request in [
        serde_json::json!({"method":"strategy.accept","revision":"a".repeat(64),"computeId":1}),
        serde_json::json!({"method":"strategy.unaccept","revision":"a".repeat(64)}),
        serde_json::json!({"method":"strategy.showAccepted","revision":"a".repeat(64)}),
    ] {
        serde_json::from_value::<crate::protocol::Request>(request.clone()).unwrap();
        for extra in ["path", "dataDir", "destination", "plan", "acceptedAt"] {
            let mut invalid = request.clone();
            invalid[extra] = "x".into();
            assert!(
                serde_json::from_value::<crate::protocol::Request>(invalid).is_err(),
                "{request} + {extra}"
            );
        }
    }
    // the stored plan keeps nothing of the solver's proof either
    assert!(!text.contains("proof") && !text.contains("lowerBound"));
}

#[test]
fn another_account_or_a_new_session_does_not_inherit_a_draft_plan() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    accept(&mut state).unwrap();
    state.retire();
    let view = state.open().unwrap();
    assert!(view.plan.accepted.is_none(), "the unsaved plan was only in memory");
    assert_eq!(view.events[0].accepted_plan, StrategyAcceptedMark::None);
}

#[test]
fn an_event_is_stale_when_any_of_its_variants_is() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    let view = accept(&mut state).unwrap();
    assert_eq!(view.events[0].accepted_plan, StrategyAcceptedMark::Accepted);
    // a second variant of the event with its own, stale plan
    let mut next = state.doc.as_ref().unwrap().clone();
    let variant = {
        let mut variant = next.value()["events"][0]["strategies"][0].clone();
        variant["id"] = "variant-2".into();
        variant["acceptedPlan"]["entries"]["inputs"]["raceLaps"] = "23".into();
        variant
    };
    let mut strategies = next.value()["events"][0]["strategies"].clone();
    strategies.as_array_mut().unwrap().push(variant);
    next.set("/events/0/strategies", &strategies).unwrap();
    state.apply_draft(next);
    let view = state.view();
    assert_eq!(view.events[0].strategies.len(), 2);
    assert_eq!(view.events[0].accepted_plan, StrategyAcceptedMark::Stale);
    // the active variant is still the first one, whose plan is accepted
    assert_eq!(accepted(&view).state, StrategyAcceptedState::Accepted);
}

#[test]
fn the_seconds_of_a_stop_match_the_replay_of_the_crate_and_add_up_to_the_plan() {
    use vantare_strategy::solver::{PitDecision, replay_decision_v2, solve_v2};
    let root = Root::new();
    let (state, view) = planned(&root);
    let doc = state.doc.as_ref().unwrap();
    let mut scratch = doc.clone();
    let input = ManualEvent::read(doc, 0, 0)
        .prepare(&mut scratch, 0, 0)
        .unwrap();
    let outcome = solve_v2(&input).unwrap();
    let pits: Vec<PitDecision> = outcome
        .result
        .pit_stops
        .iter()
        .map(|pit| PitDecision {
            lap: pit.lap,
            fuel_liters: pit.fuel_liters,
            ve_percent: pit.ve_percent,
            change_tyres: pit.change_tyres,
            ..PitDecision::default()
        })
        .collect();
    // every stop of the plan on the wire is priced as the solver prices it
    let shown = view
        .plan
        .result
        .as_ref()
        .and_then(|result| result.timeline.as_ref())
        .unwrap();
    assert_eq!(shown.pits.len(), pits.len());
    let total: f64 = shown
        .pits
        .iter()
        .map(|pit| pit.pit_seconds.as_f64().unwrap())
        .sum();
    assert!((total - outcome.result.expected.pit_seconds).abs() < 1e-6);
    // and as the replay of the crate prices it, in both service modes and with or
    // without new tyres
    for mode in ["parallel", "sequential"] {
        for change_tyres in [true, false] {
            let mut input = input.clone();
            input.pit_cost.service_mode = mode.into();
            // a plan the replay accepts: the tyres last the whole race
            input.tyre_life_laps.value = 0.0;
            let pits: Vec<PitDecision> = pits
                .iter()
                .map(|pit| PitDecision {
                    change_tyres,
                    ..pit.clone()
                })
                .collect();
            let decision = accepted::decision(&outcome.result.stints, &pits);
            let replay = replay_decision_v2(&input, &decision).unwrap();
            assert!(replay.feasible, "{mode} {change_tyres}: {:?}", replay.reasons);
            for (index, pit) in pits.iter().enumerate() {
                let expected = replay.stints[index].evaluation.pit_seconds;
                let ours = accepted::pit_seconds(&input, pit);
                assert!(
                    (ours - expected).abs() < 1e-9,
                    "{mode} {change_tyres} stop {index}: {ours} against {expected}"
                );
            }
        }
    }
}

#[test]
fn the_dates_the_renderer_accepts_still_open() {
    // the exact form of the validator: `T`, `Z` or a numeric offset, optional fraction
    for date in [
        "2026-11-19T18:42:00Z",
        "2026-11-19T18:42:00.123456789Z",
        "2026-11-19T18:42:00+01:00",
        "2026-11-19T18:42:00.5-05:30",
    ] {
        let root = Root::new();
        write_document(&root, |v| {
            v["events"][0]["strategies"][0]["acceptedPlan"]["acceptedAt"] = date.into();
        });
        let view = root.state().open().unwrap();
        assert_eq!(accepted(&view).accepted_at, date);
    }
}

#[test]
fn removing_the_plan_during_a_calculation_is_busy_and_the_plan_never_comes_back() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    let view = accept(&mut state).unwrap();
    let saved = state.save(&view.revision).unwrap();
    // a calculation clones the document, plan included
    let start = |state: &mut State| {
        let view = state.view();
        state
            .compute(
                view.active_event_id.as_deref().unwrap(),
                view.active_strategy_id.as_deref().unwrap(),
                &view.revision,
                &form(|_| {}),
            )
            .unwrap();
        state.view()
    };
    let running = start(&mut state);
    assert_eq!(running.plan.state, StrategyPlanState::Calculating);
    assert_eq!(
        state.unaccept(&running.revision),
        Err(HostError::Busy)
    );
    // nothing changed: when the calculation ends the plan is still there
    assert_eq!(state.view().revision, running.revision);
    state.test_join_calculation();
    let done = state.view();
    assert_eq!(accepted(&done).state, StrategyAcceptedState::Accepted);
    assert_eq!(done.events[0].accepted_plan, StrategyAcceptedMark::Accepted);
    // and once it ended, removing it works as ever
    let removed = state.unaccept(&done.revision).unwrap();
    assert!(removed.plan.accepted.is_none());
    assert!(saved.plan.accepted.is_some());
}

#[test]
fn showing_the_accepted_plan_during_a_calculation_discards_its_result_and_keeps_the_document() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    let view = accept(&mut state).unwrap();
    let saved = state.save(&view.revision).unwrap();
    let before = state.doc.as_ref().unwrap().bytes().to_vec();
    state
        .compute(
            saved.active_event_id.as_deref().unwrap(),
            saved.active_strategy_id.as_deref().unwrap(),
            &saved.revision,
            &form(|form| form.inputs.base_pace_seconds = "95".into()),
        )
        .unwrap();
    // the running calculation is dropped; its document never replaces the shown one
    let shown = state.show_accepted(&saved.revision).unwrap();
    assert_eq!(shown.plan.state, StrategyPlanState::Uncalculated);
    state.test_join_calculation();
    let after = state.view();
    assert_eq!(after.plan.state, StrategyPlanState::Uncalculated);
    assert_eq!(after.revision, saved.revision);
    assert_eq!(state.doc.as_ref().unwrap().bytes(), before);
    assert_eq!(accepted(&after).state, StrategyAcceptedState::Accepted);
}

#[test]
fn accepting_during_a_calculation_is_busy_or_a_conflict_never_a_second_plan() {
    let root = Root::new();
    let (mut state, proposal) = planned(&root);
    let old_id = proposal.plan.compute_id.unwrap();
    state
        .compute(
            proposal.active_event_id.as_deref().unwrap(),
            proposal.active_strategy_id.as_deref().unwrap(),
            &proposal.revision,
            &form(|form| form.inputs.base_pace_seconds = "95".into()),
        )
        .unwrap();
    let running = state.view();
    // the plan that is being calculated cannot be accepted yet...
    assert_eq!(
        state.accept(&running.revision, running.plan.compute_id.unwrap(), NOW),
        Err(HostError::Busy)
    );
    // ...and the one that was on screen is gone
    assert!(matches!(
        state.accept(&running.revision, old_id, NOW),
        Err(HostError::StrategyConflict { .. })
    ));
    state.test_join_calculation();
    assert!(state.view().plan.accepted.is_none());
}

#[test]
fn an_entry_that_is_not_finite_is_the_same_entry_when_it_is_written_the_same() {
    use vantare_strategy::application::ManualField;
    let copy = StrategyComputeForm {
        fields: fields(),
        inputs: StrategySolverFields {
            fuel_step: "inf".into(),
            ve_step: "NaN".into(),
            ..inputs()
        },
    };
    let now = copy.manual().unwrap();
    assert_eq!(accepted::changes(&copy, &now), Vec::new());
    let mut later = copy.manual().unwrap();
    later[ManualField::FuelStep] = "1".into();
    let changes = accepted::changes(&copy, &later);
    assert_eq!(changes.len(), 1);
    assert_eq!(changes[0].field, StrategyField::FuelStep);
}

#[test]
fn a_changed_text_with_a_control_character_is_reported_without_its_value() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    let view = accept(&mut state).unwrap();
    state.save(&view.revision).unwrap();
    // a document written by hand holds a team the form cannot show, nor a change
    let mut value: serde_json::Value =
        serde_json::from_slice(&fs::read(root.primary()).unwrap()).unwrap();
    value["events"][0]["team"] = vantare_strategy::document::manual("a\u{1}b".into());
    fs::write(root.primary(), serde_json::to_vec(&value).unwrap()).unwrap();
    let view = root.state().open().unwrap();
    let change = accepted(&view)
        .changes
        .iter()
        .find(|change| change.field == StrategyField::Team)
        .expect("the team changed");
    assert_eq!(change.before, Some(String::new()));
    assert_eq!(change.after, None);
    // a long text and a control are the same kind of thing: not shown
    assert_eq!(accepted(&view).state, StrategyAcceptedState::Stale);
}

// ---------------------------------------------------------------------------
// Fuel and energy fixed by hand (E5f, #2709): they live in the session and reach
// the document only inside an accepted plan.
// ---------------------------------------------------------------------------

/// A race of 20 laps calculated on top of `planned`, moved to stints of five
/// laps (5-5-5-5) and recalculated: the tank holds six, so every stop has room
/// for more than one amount.
fn roomy(state: &mut State) -> StrategyView {
    let calculated = compute(state, &form(|form| form.inputs.race_laps = "20".into()));
    assert_eq!(calculated.plan.edit.as_ref().unwrap().stops.len(), 3);
    for (index, lap) in [(0, 5), (1, 10), (2, 15)] {
        let view = state.view();
        state
            .move_boundary(&view.revision, view.plan.compute_id.unwrap(), index, lap)
            .unwrap();
    }
    recalculated(state)
}

fn recalculated(state: &mut State) -> StrategyView {
    let view = state.view();
    state
        .recalculate(&view.revision, view.plan.compute_id.unwrap())
        .unwrap();
    state.test_join_calculation();
    state.view()
}

fn number(value: f64) -> serde_json::Number {
    serde_json::Number::from_f64(value).unwrap()
}

/// Fixes one litre more than the plan loads in the first stop.
fn fix_first_stop(state: &mut State) -> (StrategyView, serde_json::Number) {
    let view = state.view();
    let planned = view.plan.edit.as_ref().unwrap().stops[0]
        .fuel_liters
        .as_f64()
        .unwrap();
    let amount = number(planned + 1.0);
    let fixed = state
        .set_stop_service(
            &view.revision,
            view.plan.compute_id.unwrap(),
            0,
            Some(&amount),
            None,
            None,
        )
        .unwrap();
    (fixed, amount)
}

#[test]
fn fixing_an_amount_is_of_the_session_and_never_touches_the_document() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    let before = roomy(&mut state);
    assert_eq!(before.plan.state, StrategyPlanState::Calculated);
    let on_disk = fs::read(root.primary()).unwrap();
    let draft = state.doc.as_ref().unwrap().bytes().to_vec();
    let (view, amount) = fix_first_stop(&mut state);
    assert_eq!(view.plan.state, StrategyPlanState::Edited);
    let edit = view.plan.edit.as_ref().unwrap();
    assert_eq!(edit.stops[0].fixed.fuel_liters, Some(amount));
    // neither the document, its revision, «Sin guardar» nor the file moved
    assert_eq!((view.revision.as_str(), view.dirty), (before.revision.as_str(), before.dirty));
    assert_eq!(state.doc.as_ref().unwrap().bytes(), draft);
    assert_eq!(fs::read(root.primary()).unwrap(), on_disk);
    assert_eq!(view.plan.result, before.plan.result);
    // «Volver todo a automático», and «Restablecer» after fixing again
    let cleared = state
        .clear_stop_services(&view.revision, view.plan.compute_id.unwrap())
        .unwrap();
    let stops = &cleared.plan.edit.as_ref().unwrap().stops;
    assert!(stops.iter().all(|stop| stop.fixed == StrategyStopFixed::default()));
    fix_first_stop(&mut state);
    let reset = state
        .reset_edit(&view.revision, view.plan.compute_id.unwrap())
        .unwrap();
    assert_eq!(reset.plan, before.plan);
    assert_eq!(state.doc.as_ref().unwrap().bytes(), draft);
    assert_eq!(fs::read(root.primary()).unwrap(), on_disk);
    // a new session knows nothing of what was fixed
    fix_first_stop(&mut state);
    state.retire();
    let reopened = state.open().unwrap();
    assert_eq!(reopened.plan.edit, None);
}

#[test]
fn accepting_copies_which_amounts_were_fixed_and_saving_and_reopening_keeps_them() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    roomy(&mut state);
    let (pending, amount) = fix_first_stop(&mut state);
    // what is fixed is not a plan until it is recalculated
    assert_eq!(
        state.accept(&pending.revision, pending.plan.compute_id.unwrap(), NOW),
        Err(HostError::StrategyEditPending)
    );
    let proposal = recalculated(&mut state);
    assert_eq!(proposal.plan.state, StrategyPlanState::Calculated);
    let pits = &proposal.plan.result.as_ref().unwrap().timeline.as_ref().unwrap().pits;
    assert_eq!(pits[0].fuel_liters, amount);
    assert!(pits[0].pinned.fuel_liters && !pits[0].pinned.ve_percent);
    // recalculating did not write anything either
    assert!(!String::from_utf8_lossy(state.doc.as_ref().unwrap().bytes()).contains("pinned"));
    let view = accept(&mut state).unwrap();
    assert_eq!(accepted(&view).result, **proposal.plan.result.as_ref().unwrap());
    let pinned = |document: &serde_json::Value| -> Vec<serde_json::Value> {
        document["events"][0]["strategies"][0]["acceptedPlan"]["result"]["timeline"]["pits"]
            .as_array()
            .unwrap()
            .iter()
            .map(|pit| pit["pinned"].clone())
            .collect()
    };
    let automatic =
        serde_json::json!({"fuelLiters": false, "vePercent": false, "changeTyres": false});
    let by_hand =
        serde_json::json!({"fuelLiters": true, "vePercent": false, "changeTyres": false});
    let mut expected = vec![automatic; pits.len()];
    expected[0] = by_hand;
    assert_eq!(pinned(&stored(&state)), expected);
    // the document keeps the plan, never the edit: no limits, no session state
    let text = String::from_utf8_lossy(state.doc.as_ref().unwrap().bytes()).into_owned();
    for key in ["\"limits\"", "\"fixed\"", "\"automatic\"", "\"cause\"", "\"edit\""] {
        assert!(!text.contains(key), "{key} in the document");
    }
    let saved = state.save(&view.revision).unwrap();
    assert!(accepted(&saved).saved);
    let on_disk: serde_json::Value =
        serde_json::from_slice(&fs::read(root.primary()).unwrap()).unwrap();
    assert_eq!(pinned(&on_disk), expected);
    let reopened = root.state().open().unwrap();
    assert_eq!(reopened.state, StrategyState::Ready);
    assert_eq!(accepted(&reopened).result, accepted(&saved).result);
    assert_eq!(accepted(&reopened).state, StrategyAcceptedState::Accepted);
}

#[test]
fn fixing_an_amount_answers_each_refusal_in_its_order_and_changes_nothing() {
    let root = Root::new();
    let mut state = root.state();
    let amount = number(7.0);
    let fix = |state: &mut State, revision: &str, compute_id: u32, index: u32| {
        state.set_stop_service(revision, compute_id, index, Some(&amount), None, None)
    };
    // not open yet
    assert_eq!(fix(&mut state, &"a".repeat(64), 1, 0), Err(HostError::Denied));
    assert_eq!(
        state.clear_stop_services(&"a".repeat(64), 1),
        Err(HostError::Denied)
    );
    drop(state);
    let (mut state, plain) = planned(&root);
    let view = roomy(&mut state);
    let id = view.plan.compute_id.unwrap();
    // a malformed revision, an outdated one, another plan
    assert_eq!(fix(&mut state, "not-a-revision", id, 0), Err(HostError::Rejected));
    for (revision, compute_id) in [
        ("f".repeat(64), id),
        (view.revision.clone(), id + 1),
        (view.revision.clone(), plain.plan.compute_id.unwrap()),
    ] {
        let conflict = fix(&mut state, &revision, compute_id, 0);
        assert!(
            matches!(conflict, Err(HostError::StrategyConflict { .. })),
            "{conflict:?}"
        );
        let conflict = state.clear_stop_services(&revision, compute_id);
        assert!(
            matches!(conflict, Err(HostError::StrategyConflict { .. })),
            "{conflict:?}"
        );
    }
    // a stop that does not exist, a number the calculation cannot take
    assert_eq!(fix(&mut state, &view.revision, id, 99), Err(HostError::Rejected));
    assert!(matches!(
        state.set_stop_service(&view.revision, id, 0, Some(&number(7.5)), None, None),
        Err(HostError::StrategyInvalidStopService { .. })
    ));
    assert_eq!(state.view(), view, "no refusal changed anything");
    // while a recalculation runs: busy with its id, a conflict with the old one
    fix(&mut state, &view.revision, id, 0).unwrap();
    let (release, wait) = std::sync::mpsc::sync_channel::<()>(1);
    state.test_start_recalculation(move |_| {
        let _ = wait.recv();
        Err(StrategyEditError::Failed)
    });
    let running = state.view();
    assert_eq!(running.plan.state, StrategyPlanState::Calculating);
    let running_id = running.plan.compute_id.unwrap();
    assert_eq!(fix(&mut state, &view.revision, running_id, 1), Err(HostError::Busy));
    assert_eq!(
        state.clear_stop_services(&view.revision, running_id),
        Err(HostError::Busy)
    );
    assert!(matches!(
        fix(&mut state, &view.revision, id, 1),
        Err(HostError::StrategyConflict { .. })
    ));
    assert_eq!(state.view(), running);
    release.send(()).unwrap();
    state.test_join_calculation();
    // without an editable plan there is nothing to fix
    let empty = Root::new();
    let mut fresh = empty.state();
    let opened = fresh.open().unwrap();
    assert!(matches!(
        fix(&mut fresh, &opened.revision, 1, 0),
        Err(HostError::StrategyConflict { .. })
    ));
}

#[test]
fn a_protected_document_fixes_nothing() {
    let root = Root::new();
    write_document(&root, |v| {
        v["events"][0]["strategies"][0]["acceptedPlan"]["extra"] = 1.into();
    });
    let mut state = root.state();
    assert_eq!(state.open().err(), Some(HostError::Protected));
    let view = state.view();
    assert_eq!(view.state, StrategyState::Protected);
    assert_eq!(
        state.set_stop_service(&view.revision, 1, 0, Some(&number(7.0)), None, None),
        Err(HostError::Protected)
    );
    assert_eq!(
        state.clear_stop_services(&view.revision, 1),
        Err(HostError::Protected)
    );
}

#[test]
fn the_requests_that_fix_a_stop_carry_no_path_and_state_the_whole_stop() {
    let set = serde_json::json!({
        "method": "strategy.setStopService",
        "revision": "a".repeat(64),
        "computeId": 1,
        "index": 0,
        "fuelLiters": 60,
        "vePercent": null,
        "changeTyres": null
    });
    let clear = serde_json::json!({
        "method": "strategy.clearStopServices",
        "revision": "a".repeat(64),
        "computeId": 1
    });
    for request in [&set, &clear] {
        serde_json::from_value::<crate::protocol::Request>(request.clone()).unwrap();
        for extra in [
            "path",
            "dataDir",
            "destination",
            "changeTyres",
            "serviceMode",
            "pinned",
        ] {
            let mut invalid = request.clone();
            invalid[extra] = "x".into();
            assert!(
                serde_json::from_value::<crate::protocol::Request>(invalid).is_err(),
                "{request} + {extra}"
            );
        }
    }
    // the whole stop is stated every time: a missing key is not «automatic»
    for missing in [
        "fuelLiters",
        "vePercent",
        "changeTyres",
        "index",
        "computeId",
        "revision",
    ] {
        let mut invalid = set.clone();
        invalid.as_object_mut().unwrap().remove(missing);
        assert!(
            serde_json::from_value::<crate::protocol::Request>(invalid).is_err(),
            "without {missing}"
        );
    }
    // an amount is a number or null, never a text
    for bad in [
        serde_json::json!("60"),
        serde_json::json!(true),
        serde_json::json!([60]),
        serde_json::json!({"liters": 60}),
    ] {
        let mut invalid = set.clone();
        invalid["fuelLiters"] = bad.clone();
        assert!(
            serde_json::from_value::<crate::protocol::Request>(invalid).is_err(),
            "{bad}"
        );
    }
    // decimals and null travel as they are
    let mut decimal = set.clone();
    decimal["fuelLiters"] = serde_json::Value::Null;
    decimal["vePercent"] = serde_json::json!(97.5);
    assert_eq!(
        serde_json::from_value::<crate::protocol::Request>(decimal).unwrap(),
        crate::protocol::Request::StrategySetStopService {
            revision: "a".repeat(64),
            compute_id: 1,
            index: 0,
            fuel_liters: None,
            ve_percent: Some(number(97.5)),
            change_tyres: None,
        }
    );
    // and the view of a plan with fixed amounts names no path
    let root = Root::new();
    let (mut state, _) = planned(&root);
    roomy(&mut state);
    let (view, _) = fix_first_stop(&mut state);
    let text = serde_json::to_string(&view).unwrap();
    let root_text = root.0.to_string_lossy().replace('\\', "\\\\");
    assert!(!text.contains(&root_text) && !text.contains("strategy-v2.json\\"));
}

// ---------------------------------------------------------------------------
// Tyres kept by hand (E5h, #2743): of the session until the plan is accepted.
// ---------------------------------------------------------------------------

/// Keeps the tyres in the first stop of `roomy` (stints 5-5-5-5, tyres that
/// last 60 laps): ten laps on the same set.
fn keep_first_tyres(state: &mut State) -> StrategyView {
    let view = state.view();
    state
        .set_stop_service(
            &view.revision,
            view.plan.compute_id.unwrap(),
            0,
            None,
            None,
            Some(false),
        )
        .unwrap()
}

#[test]
fn kept_tyres_reach_the_document_only_when_the_plan_is_accepted_and_survive_reopening() {
    let root = Root::new();
    let (mut state, _) = planned(&root);
    let before = roomy(&mut state);
    let on_disk = fs::read(root.primary()).unwrap();
    let draft = state.doc.as_ref().unwrap().bytes().to_vec();
    let pending = keep_first_tyres(&mut state);
    assert_eq!(pending.plan.state, StrategyPlanState::Edited);
    let stop = &pending.plan.edit.as_ref().unwrap().stops[0];
    assert_eq!(stop.fixed.change_tyres, Some(false));
    assert_eq!((stop.tyres.arrival_laps, stop.tyres.kept_laps), (5, 10));
    // neither the document, its revision, «Sin guardar» nor the file moved
    assert_eq!(
        (pending.revision.as_str(), pending.dirty),
        (before.revision.as_str(), before.dirty)
    );
    assert_eq!(state.doc.as_ref().unwrap().bytes(), draft);
    assert_eq!(fs::read(root.primary()).unwrap(), on_disk);
    assert_eq!(
        state.accept(&pending.revision, pending.plan.compute_id.unwrap(), NOW),
        Err(HostError::StrategyEditPending)
    );
    let proposal = recalculated(&mut state);
    assert_eq!(proposal.plan.state, StrategyPlanState::Calculated);
    assert_eq!(state.doc.as_ref().unwrap().bytes(), draft, "recalculating writes nothing");
    let view = accept(&mut state).unwrap();
    let tyres = |document: &serde_json::Value| -> Vec<(bool, bool)> {
        document["events"][0]["strategies"][0]["acceptedPlan"]["result"]["timeline"]["pits"]
            .as_array()
            .unwrap()
            .iter()
            .map(|pit| {
                (
                    pit["changeTyres"].as_bool().unwrap(),
                    pit["pinned"]["changeTyres"].as_bool().unwrap(),
                )
            })
            .collect()
    };
    let expected = [(false, true), (true, false), (true, false)];
    assert_eq!(tyres(&stored(&state)), expected);
    let saved = state.save(&view.revision).unwrap();
    let on_disk: serde_json::Value =
        serde_json::from_slice(&fs::read(root.primary()).unwrap()).unwrap();
    assert_eq!(tyres(&on_disk), expected);
    let reopened = root.state().open().unwrap();
    assert_eq!(reopened.state, StrategyState::Ready);
    assert_eq!(accepted(&reopened).result, accepted(&saved).result);
    assert_eq!(accepted(&reopened).state, StrategyAcceptedState::Accepted);
}

#[test]
fn the_request_that_fixes_a_stop_states_its_tyres_as_true_false_or_null() {
    use crate::protocol::Request;
    let set = serde_json::json!({
        "method": "strategy.setStopService",
        "revision": "a".repeat(64),
        "computeId": 1,
        "index": 0,
        "fuelLiters": 60,
        "vePercent": null,
        "changeTyres": null
    });
    for (stated, change_tyres) in [
        (serde_json::Value::Null, None),
        (true.into(), Some(true)),
        (false.into(), Some(false)),
    ] {
        let mut tyres = set.clone();
        tyres["changeTyres"] = stated;
        assert_eq!(
            serde_json::from_value::<Request>(tyres).unwrap(),
            Request::StrategySetStopService {
                revision: "a".repeat(64),
                compute_id: 1,
                index: 0,
                fuel_liters: Some(60.into()),
                ve_percent: None,
                change_tyres,
            }
        );
    }
    // never anything else
    for bad in [
        serde_json::json!("false"),
        serde_json::json!(0),
        serde_json::json!([false]),
        serde_json::json!({"change": false}),
    ] {
        let mut invalid = set.clone();
        invalid["changeTyres"] = bad.clone();
        assert!(serde_json::from_value::<Request>(invalid).is_err(), "{bad}");
    }
    // and only this request states them
    let clear = serde_json::json!({
        "method": "strategy.clearStopServices",
        "revision": "a".repeat(64),
        "computeId": 1,
        "changeTyres": false
    });
    assert!(serde_json::from_value::<Request>(clear).is_err());
}
