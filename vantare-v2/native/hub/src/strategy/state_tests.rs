use super::*;

// R9: preserve the current persistence behavior before replacing the repository.
struct R9Directory(PathBuf);

impl R9Directory {
    fn new() -> Self {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "vantare-r9-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).expect("fresh test directory");
        Self(path)
    }
}

impl Drop for R9Directory {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).expect("remove owned test directory");
    }
}

#[test]
fn r9_startup_prefers_saved_document_over_a_different_repository_draft() {
    let directory = R9Directory::new();
    let saved = Document::empty("2026-11-01T00:00:00Z").expect("saved document");
    let draft = Document::empty("2026-11-02T00:00:00Z").expect("different draft");
    let path = directory.0.join("strategy-v2.json");
    std::fs::write(&path, saved.bytes()).expect("saved file");
    let repository = application::repository::LocalRepository::open(&directory.0)
        .expect("characterization fixture");
    repository
        .save_documents(
            0,
            &[String::from_utf8(draft.bytes().to_vec()).expect("characterization fixture")],
            &[],
        )
        .expect("repository draft");
    let (editor, error) = open_editor(&directory.0);
    assert!(error.is_none());
    assert_eq!(
        editor
            .document
            .as_ref()
            .expect("characterization fixture")
            .bytes(),
        saved.bytes()
    );
    assert_eq!(editor.path, Some(path));
    assert!(!editor.dirty());
}

#[test]
fn r9_repository_only_startup_has_no_path_and_cannot_persist_an_edit() {
    let directory = R9Directory::new();
    let draft = Document::empty("2026-11-02T00:00:00Z").expect("characterization fixture");
    let repository = application::repository::LocalRepository::open(&directory.0)
        .expect("characterization fixture");
    repository
        .save_documents(
            0,
            &[String::from_utf8(draft.bytes().to_vec()).expect("characterization fixture")],
            &[],
        )
        .expect("characterization fixture");
    let (mut editor, error) = open_editor(&directory.0);
    assert!(error.is_none());
    assert!(editor.path.is_none());
    assert!(!editor.dirty());
    editor
        .document
        .as_mut()
        .expect("characterization fixture")
        .set("/generatedAt", &json!("2026-11-03T00:00:00Z"))
        .expect("characterization fixture");
    assert!(editor.dirty());
    assert!(editor.save().is_err());
    assert!(!directory.0.join("strategy-v2.json").exists());
}

#[test]
fn r9_corrupt_document_blocks_normal_save_and_preserves_original_bytes() {
    let directory = R9Directory::new();
    let path = directory.0.join("strategy-v2.json");
    std::fs::write(&path, b"{").expect("characterization fixture");
    let (mut editor, error) = open_editor(&directory.0);
    assert!(error.is_some());
    assert!(editor.document.is_none());
    editor.create().expect("characterization fixture");
    assert!(matches!(
        editor.save_as(path.clone()),
        Err(files::Error::Conflict { .. })
    ));
    assert!(editor.dirty());
    assert_eq!(std::fs::read(path).expect("characterization fixture"), b"{");
}

#[test]
fn r9_saving_repository_draft_keeps_document_dirty_and_saved_file_unchanged() {
    with_strategy("r9-draft", |this, _cx| {
        let directory = R9Directory::new();
        this.directory = directory.0.clone();
        this.editor.create().expect("characterization fixture");
        let path = directory.0.join("strategy-v2.json");
        this.editor
            .save_as(path.clone())
            .expect("characterization fixture");
        let saved = std::fs::read(&path).expect("characterization fixture");
        this.editor
            .document
            .as_mut()
            .expect("characterization fixture")
            .set("/generatedAt", &json!("2026-11-03T00:00:00Z"))
            .expect("characterization fixture");
        let edited = this
            .editor
            .document
            .as_ref()
            .expect("characterization fixture")
            .value()
            .clone();
        this.save_application_draft()
            .expect("characterization fixture");
        assert!(this.editor.dirty());
        assert_eq!(
            std::fs::read(path).expect("characterization fixture"),
            saved
        );
        let snapshot = application::repository::LocalRepository::open(&directory.0)
            .expect("characterization fixture")
            .load()
            .expect("characterization fixture");
        let draft = Document::parse(
            snapshot
                .drafts
                .last()
                .expect("characterization fixture")
                .as_bytes(),
        )
        .expect("characterization fixture");
        assert_eq!(draft.value(), &edited);
        this.directory = std::env::temp_dir();
    });
}

#[test]
fn r9_native_manual_document_has_no_automatic_preparation_and_is_unchanged() {
    with_strategy("r9-automatic", |this, cx| {
        let mut document =
            Document::empty("2026-11-02T00:00:00Z").expect("characterization fixture");
        document
            .append_event(&new_event("event", "Carrera", 120, 90.0, 60.0))
            .expect("characterization fixture");
        let bytes = document.bytes().to_vec();
        this.editor.document = Some(document);
        this.load_fields(cx);
        assert!(
            this.prepare_automatic()
                .expect("characterization fixture")
                .is_none()
        );
        assert_eq!(
            this.editor
                .document
                .as_ref()
                .expect("characterization fixture")
                .bytes(),
            bytes
        );
        assert!(this.automatic_preparation.is_none());
    });
}

#[test]
fn r9_strategy_persist_rejects_pending_form_and_unsaved_new_document() {
    with_strategy("r9-persist", |this, _cx| {
        this.editor.create().expect("characterization fixture");
        let bytes = this
            .editor
            .document
            .as_ref()
            .expect("characterization fixture")
            .bytes()
            .to_vec();
        this.form.dirty = true;
        assert!(this.persist().is_err());
        this.form.dirty = false;
        assert!(this.persist().is_err());
        assert_eq!(
            this.editor
                .document
                .as_ref()
                .expect("characterization fixture")
                .bytes(),
            bytes
        );
        assert!(this.editor.dirty());
    });
}

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
        crate::quit_headless_test(cx);
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
fn r9_imported_projection_is_preserved_and_still_rejected_by_manual_calculation() {
    with_strategy("r9-imported-projection", |this, cx| {
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
        let original = document.bytes().to_vec();
        this.editor.document = Some(document);
        this.load_fields(cx);
        assert!(this.prepare_input().is_err());
        assert_eq!(
            this.editor
                .document
                .as_ref()
                .expect("imported document")
                .bytes(),
            original
        );
        let path = this.directory.join("projection.json");
        this.editor
            .save_as(path.clone())
            .expect("save unchanged imported document");
        let mut reopened = Editor::default();
        reopened
            .open(path.clone())
            .expect("reopen imported document");
        assert_eq!(
            reopened.document.as_ref().expect("document").bytes(),
            original
        );
        std::fs::remove_file(path).expect("remove own document");
    });
}

#[test]
fn r9_manual_wizard_creates_an_event_without_automatic_projection() {
    with_strategy("r9-manual-wizard", |this, cx| {
        for (index, value) in ["Carrera", "120", "90", "60"].into_iter().enumerate() {
            this.fields[index] = value.into();
        }
        this.add_event(cx);
        assert!(this.error.is_none());
        assert_eq!(this.page, Page::Editor(EditorTab::Carrera));
        assert_eq!(this.manual_source_status, SourceStatus::Open);
        let event = this.current_event().expect("created event");
        assert_eq!(event["name"]["value"], "Carrera");
        assert!(event["planningInputs"]["projection"].is_null());
        assert!(event["strategies"][0]["overrides"]["nativeScalarInput"].is_null());
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
