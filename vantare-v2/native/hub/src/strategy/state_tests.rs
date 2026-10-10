use super::*;

fn with_strategy(name: &str, test: impl FnOnce(&mut Strategy, &mut Context<Strategy>) + 'static) {
    let directory =
        std::env::temp_dir().join(format!("vantare-1544-{name}-{}", std::process::id()));
    gpui_platform::headless().run(move |cx| {
        orbit::theme::apply(
            orbit::theme::AppearanceSettings::default(),
            gpui::WindowAppearance::Dark,
            cx,
        );
        let strategy = cx.new(|cx| Strategy::new(directory, cx));
        strategy.update(cx, test);
        cx.quit();
    });
}

fn editable_plan(this: &mut Strategy, cx: &mut Context<Strategy>) {
    let input = capture_solver_input(crate::demo::CaptureStrategyPage::PlanCalculated)
        .expect("solver input");
    let prepared = application::prepare_manual(input.clone()).expect("prepared");
    this.result = Some(
        application::calculate(&prepared, SourceStatus::Open, &AtomicBool::new(false))
            .expect("baseline"),
    );
    this.last_input = Some(input);
    this.manual_source_status = SourceStatus::Open;
    this.begin_plan_edit(cx);
    this.move_plan_boundary(0, 22, cx);
    assert!(this.edit_dirty);
    this.running = true;
}

#[test]
fn isa1544_metadata_confirmation_preserves_edits_on_save_and_reload() {
    with_strategy("metadata", |this, cx| {
        let mut fields = vec![String::new(); FIELDS.len()];
        for (index, value) in [
            (0, "Carrera"),
            (1, "120"),
            (2, "90"),
            (3, "60"),
            (24, "2026-09-30T17:00:00+02:00"),
            (25, "Equipo"),
            (26, "Piloto"),
            (27, "PI"),
        ] {
            fields[index] = value.into();
        }
        let mut document = Document::empty("2026-09-30T00:00:00Z").expect("document");
        append_manual_event(&mut document, &fields).expect("event");
        this.editor.document = Some(document);
        this.load_fields(cx);
        for (index, value) in [
            (24, "2026-10-10T18:00:00Z"),
            (25, "Equipo nuevo"),
            (26, "Piloto nuevo"),
            (27, "PN"),
        ] {
            this.fields[index] = value.into();
        }
        this.form.dirty = true;
        this.confirm_event(cx);
        assert!(this.error.is_none());
        assert!(!this.form.dirty);
        let path = this.directory.join("confirmed.json");
        this.editor.save_as(path.clone()).expect("save");
        let mut restarted = Editor::default();
        restarted.open(path).expect("reload");
        let event = &restarted.document.as_ref().expect("document").value()["events"][0];
        for (pointer, value) in [
            ("/startAt/value", "2026-10-10T18:00:00Z"),
            ("/team/value", "Equipo nuevo"),
            ("/drivers/0/name/value", "Piloto nuevo"),
            ("/drivers/0/ini/value", "PN"),
        ] {
            assert_eq!(event.pointer(pointer), Some(&json!(value)), "{pointer}");
        }
    });
}

#[test]
fn isa1544_reset_rejects_late_recalculation_and_keeps_baseline() {
    with_strategy("reset", |this, cx| {
        editable_plan(this, cx);
        let pending_generation = this.generation;
        let pending_cancel = this.cancellation.clone();
        let edited = this.edited_plan.clone().expect("edited");
        let outcome = application::recalculate_edited_plan(
            this.last_input.as_ref().expect("input"),
            &edited,
            &AtomicBool::new(false),
        )
        .expect("recalculated");
        let baseline = this.baseline_edited_plan.clone().expect("baseline");
        this.reset_plan_edit(cx);
        this.finish_plan_recalculation(pending_generation, Ok((outcome, edited)), cx);
        assert_eq!(
            this.edited_plan.as_ref().expect("restored").stints,
            baseline.stints
        );
        assert!(pending_cancel.load(Ordering::Relaxed));
        assert!(!this.running);
        assert!(!this.edit_dirty);
    });
}

#[test]
fn isa1544_cancel_manual_recalculation_preserves_edits_inputs_and_baselines() {
    with_strategy("cancel", |this, cx| {
        editable_plan(this, cx);
        let pending_generation = this.generation;
        let pending_cancel = this.cancellation.clone();
        let edited = this.edited_plan.clone().expect("edited");
        let input = serde_json::to_value(&this.last_input).expect("input");
        let baseline = this.baseline_edited_plan.clone().expect("baseline");
        let result = serde_json::to_value(&this.result).expect("result");
        this.cancel_calculation(cx);
        this.finish_plan_recalculation(pending_generation, Err("late cancellation".into()), cx);
        assert_eq!(
            this.edited_plan.as_ref().expect("edits retained").stints,
            edited.stints
        );
        assert_eq!(
            serde_json::to_value(&this.last_input).expect("input"),
            input
        );
        assert_eq!(serde_json::to_value(&this.result).expect("result"), result);
        assert_eq!(
            this.baseline_edited_plan.as_ref().expect("baseline").stints,
            baseline.stints
        );
        assert!(this.baseline_result.is_some());
        assert!(this.edit_dirty);
        assert!(pending_cancel.load(Ordering::Relaxed));
        assert!(!this.running);
        assert!(this.edit_error.is_none());
    });
}

#[test]
fn isa1544_revisions_render_performs_no_repository_io() {
    with_strategy("revisions", |this, cx| {
        revisions_view::REPOSITORY_READS.set(0);
        let _ = this.revisions_page(cx);
        let _ = this.revisions_page(cx);
        assert_eq!(
            revisions_view::REPOSITORY_READS.get(),
            0,
            "render must not open/load the repository"
        );
    });
}

#[test]
fn isa1544_automatic_sessions_prepare_once_until_inputs_change() {
    with_strategy("automatic", |this, cx| {
        this.automatic = true;
        let mut projection: Value = serde_json::from_str(include_str!(
            "../../../strategy/testdata/oracle/strategyinputprojection-v2-go.json"
        ))
        .expect("Analysis projection fixture");
        projection["sourceRevisions"] = json!(["sess-026", "sess-125"].map(|session| {
            application::AnalysisRevisionRef {
                session_id: session.into(),
                base_digest: "a".repeat(64),
                revision_id: "b".repeat(64),
                snapshot_id: "c".repeat(64),
            }
        }));
        let mut event = new_event("event", "Carrera", 120, 90.0, 60.0);
        event["planningInputs"] = json!({"projection": projection});
        event["combination"] = json!({"combinationId":"fuji-classic-hypercar", "sessions": [
            {"sessionId":"sess-026", "included":true},
            {"sessionId":"sess-125", "included":true}
        ]});
        let mut document = Document::empty("2026-09-30T00:00:00Z").expect("document");
        document.append_event(&event).expect("automatic event");
        this.editor.document = Some(document);
        assert!(
            this.prepare_automatic()
                .expect("prepared projection")
                .is_some()
        );
        assistant::AUTOMATIC_PREPARATIONS.set(0);
        let _ = this.session_sources(cx);
        let _ = this.session_sources(cx);
        assert_eq!(
            assistant::AUTOMATIC_PREPARATIONS.get(),
            1,
            "unchanged render repeats preparation"
        );
        this.invalidate();
        let _ = this.session_sources(cx);
        assert_eq!(
            assistant::AUTOMATIC_PREPARATIONS.get(),
            2,
            "changed inputs must prepare again"
        );
    });
}

#[test]
fn isa1544_optional_metadata_keeps_absence_and_invalid_date_is_atomic() {
    let mut doc = Document::empty("2026-09-30T00:00:00Z").expect("document");
    doc.append_event(&new_event("event", "Carrera", 120, 90.0, 60.0))
        .expect("event");
    let mut fields = vec![String::new(); FIELDS.len()];
    for (index, value) in [
        (0, "Carrera"),
        (1, "120"),
        (2, "90"),
        (3, "60"),
        (6, "Base"),
        (8, "dry"),
    ] {
        fields[index] = value.into();
    }
    let original = doc.bytes().to_vec();
    confirm_metadata(&mut doc, 0, 0, &fields).expect("empty optional fields");
    assert_eq!(doc.bytes(), original);
    fields[0] = "Nombre editado".into();
    fields[24] = "2026-10-10 18:00".into();
    fields[25] = "Equipo editado".into();
    assert!(confirm_metadata(&mut doc, 0, 0, &fields).is_err());
    assert_eq!(doc.bytes(), original);
    fields[24] = "2026-10-10T18:00:00Z".into();
    fields[26] = "Nuevo piloto".into();
    fields[27] = "NP".into();
    confirm_metadata(&mut doc, 0, 0, &fields).expect("insert optional metadata");
    let event = &doc.value()["events"][0];
    assert_eq!(event["team"]["value"], "Equipo editado");
    assert_eq!(event["drivers"][0]["name"]["value"], "Nuevo piloto");
    assert_eq!(event["drivers"][0]["ini"]["value"], "NP");
    for field in &mut fields[24..28] {
        field.clear();
    }
    confirm_metadata(&mut doc, 0, 0, &fields).expect("clear optional metadata");
    let event = &doc.value()["events"][0];
    assert!(event["startAt"]["value"].is_null());
    assert_eq!(event["team"]["value"], "");
    assert_eq!(event["drivers"][0]["name"]["value"], "");
    assert_eq!(event["drivers"][0]["ini"]["value"], "");
}

#[test]
fn isa1544_revision_load_discards_stale_results_and_keeps_read_error() {
    with_strategy("revision-state", |this, cx| {
        this.revisions.generation = 2;
        this.finish_revisions_load(2, Err("repository invalid".into()), cx);
        let snapshot = application::repository::RepositorySnapshot {
            generation: 1,
            drafts: vec![],
            revisions: vec![],
        };
        this.finish_revisions_load(1, Ok(snapshot.clone()), cx);
        assert_eq!(
            this.revisions.snapshot,
            Some(Err("repository invalid".into()))
        );
        this.revisions.generation = 3;
        this.finish_revisions_load(3, Ok(snapshot.clone()), cx);
        assert_eq!(this.revisions.snapshot, Some(Ok(snapshot)));
        revisions_view::REPOSITORY_READS.set(0);
        let _ = this.revisions_page(cx);
        assert_eq!(revisions_view::REPOSITORY_READS.get(), 0);
    });
}
