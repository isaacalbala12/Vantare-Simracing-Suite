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
        if let Err(error) = std::fs::remove_dir_all(&self.0) {
            eprintln!("limpiar fixture R9: {error}");
        }
    }
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
        let mut fields = ManualEvent::default();
        for (index, value) in [
            (Field::Name, "Carrera"),
            (Field::DurationMinutes, "120"),
            (Field::FuelCapacityLiters, "90"),
            (Field::PitTransitSeconds, "60"),
            (Field::StartAt, "2026-09-30T17:00:00+02:00"),
            (Field::Team, "Equipo"),
            (Field::DriverName, "Piloto"),
            (Field::DriverInitials, "PI"),
        ] {
            fields[index] = value.into();
        }
        let mut document = Document::empty("2026-09-30T00:00:00Z").expect("document");
        append_manual_event(&mut document, &fields).expect("event");
        this.editor.document = Some(document);
        this.load_fields(cx);
        for (index, value) in [
            (Field::StartAt, "2026-10-10T18:00:00Z"),
            (Field::Team, "Equipo nuevo"),
            (Field::DriverName, "Piloto nuevo"),
            (Field::DriverInitials, "PN"),
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
        document.append_event(&event).expect("imported event");
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
        for (index, value) in [
            (Field::Name, "Carrera"),
            (Field::DurationMinutes, "120"),
            (Field::FuelCapacityLiters, "90"),
            (Field::PitTransitSeconds, "60"),
        ] {
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
fn r9_unknown_automatic_and_correction_fields_survive_open_and_normal_save() {
    let directory = R9Directory::new();
    for schema in ["2.0.0", "2.1.0"] {
        let path = directory.0.join(format!("unknown-{schema}.json"));
        let original = format!(
            r#"{{"contractVersion":"strategy.v2","schemaVersion":"{schema}","generatedAt":"2026-11-01T00:00:00Z","events":[], "automatic":{{ "future":1.2300 }},"corrections":[{{ "unknown":true,"note":"legacy" }}]}}"#
        );
        std::fs::write(&path, &original).expect("legacy extensions");
        let mut editor = Editor::default();
        editor.open(path.clone()).expect("open unknown extensions");
        assert_eq!(
            editor.document.as_ref().expect("document").bytes(),
            original.as_bytes()
        );
        editor
            .document
            .as_mut()
            .expect("document")
            .set("/generatedAt", &json!("2026-11-02T00:00:00Z"))
            .expect("edit a known field");
        editor.save().expect("normal save");
        let expected = original.replace("2026-11-01T00:00:00Z", "2026-11-02T00:00:00Z");
        assert_eq!(
            std::fs::read(&path).expect("saved extensions"),
            expected.as_bytes()
        );
        let mut reopened = Editor::default();
        reopened.open(path).expect("reopen extensions");
        assert_eq!(
            reopened.document.as_ref().expect("reopened").bytes(),
            expected.as_bytes()
        );
    }
}

#[test]
fn isa1544_optional_metadata_keeps_absence_and_invalid_date_is_atomic() {
    let mut doc = Document::empty("2026-09-30T00:00:00Z").expect("document");
    doc.append_event(&new_event("event", "Carrera", 120, 90.0, 60.0))
        .expect("event");
    let mut fields = ManualEvent::default();
    for (index, value) in [
        (Field::Name, "Carrera"),
        (Field::DurationMinutes, "120"),
        (Field::FuelCapacityLiters, "90"),
        (Field::PitTransitSeconds, "60"),
        (Field::VariantName, "Base"),
        (Field::VariantMode, "dry"),
    ] {
        fields[index] = value.into();
    }
    let original = doc.bytes().to_vec();
    confirm_metadata(&mut doc, 0, 0, &fields).expect("empty optional fields");
    assert_eq!(doc.bytes(), original);
    fields[Field::Name] = "Nombre editado".into();
    fields[Field::StartAt] = "2026-10-10 18:00".into();
    fields[Field::Team] = "Equipo editado".into();
    assert!(confirm_metadata(&mut doc, 0, 0, &fields).is_err());
    assert_eq!(doc.bytes(), original);
    fields[Field::StartAt] = "2026-10-10T18:00:00Z".into();
    fields[Field::DriverName] = "Nuevo piloto".into();
    fields[Field::DriverInitials] = "NP".into();
    confirm_metadata(&mut doc, 0, 0, &fields).expect("insert optional metadata");
    let event = &doc.value()["events"][0];
    assert_eq!(event["team"]["value"], "Equipo editado");
    assert_eq!(event["drivers"][0]["name"]["value"], "Nuevo piloto");
    assert_eq!(event["drivers"][0]["ini"]["value"], "NP");
    for field in [
        Field::StartAt,
        Field::Team,
        Field::DriverName,
        Field::DriverInitials,
    ] {
        fields[field].clear();
    }
    confirm_metadata(&mut doc, 0, 0, &fields).expect("clear optional metadata");
    let event = &doc.value()["events"][0];
    assert!(event["startAt"]["value"].is_null());
    assert_eq!(event["team"]["value"], "");
    assert_eq!(event["drivers"][0]["name"]["value"], "");
    assert_eq!(event["drivers"][0]["ini"]["value"], "");
}

// Frozen fixture hash is verified by the importer; no test uses a store writer.
const R9_NATIVE_REPOSITORY: &[u8] = br#"{"repositoryVersion":"strategy.repository.v2","hashAlgorithm":"sha256:strategy-repository-json-v1","generation":7,"drafts":[{"contractVersion":"strategy.v2","schemaVersion":"2.1.0","generatedAt":"2026-11-02T00:00:00Z","events":[]}],"revisions":[],"contentHash":"2d45eef82a1abe00512e21d5ddc81ae224b3074fafb8ca29dc675df8341a5039"}"#;

#[test]
fn r9_primary_document_wins_and_never_consults_the_legacy_repository() {
    let directory = R9Directory::new();
    let path = directory.0.join("strategy-v2.json");
    let saved = Document::empty("2026-11-01T00:00:00Z").expect("saved");
    std::fs::write(&path, saved.bytes()).expect("primary");
    let repository = directory.0.join("strategy-repository.json");
    std::fs::write(&repository, b"corrupt legacy source").expect("legacy source");
    let (editor, error) = open_editor(&directory.0);
    assert!(error.is_none());
    assert_eq!(
        editor.document.as_ref().expect("primary").bytes(),
        saved.bytes()
    );
    assert_eq!(editor.path, Some(path));
    assert!(!editor.dirty());
    assert_eq!(
        std::fs::read(repository).expect("untouched"),
        b"corrupt legacy source"
    );
}

#[test]
fn r9_import_creates_the_primary_once_and_keeps_the_legacy_bytes() {
    let directory = R9Directory::new();
    let repository = directory.0.join("strategy-repository.json");
    std::fs::write(&repository, R9_NATIVE_REPOSITORY).expect("legacy source");
    let path = directory.0.join("strategy-v2.json");
    let (mut editor, error) = open_editor(&directory.0);
    assert!(error.is_none(), "{error:?}");
    let imported = editor.document.as_ref().expect("imported").bytes().to_vec();
    assert_eq!(editor.path, Some(path.clone()));
    assert!(!editor.dirty());
    assert_eq!(std::fs::read(&path).expect("primary"), imported);
    assert_eq!(
        std::fs::read(&repository).expect("untouched"),
        R9_NATIVE_REPOSITORY
    );
    editor
        .document
        .as_mut()
        .expect("imported")
        .set("/generatedAt", &json!("2026-11-03T00:00:00Z"))
        .expect("edit");
    editor.save().expect("normal save after import");
    let edited = editor.document.as_ref().expect("edited").bytes().to_vec();
    let (restarted, error) = open_editor(&directory.0);
    assert!(error.is_none());
    assert_eq!(
        restarted.document.as_ref().expect("reopened").bytes(),
        edited
    );
    assert_eq!(
        std::fs::read(repository).expect("untouched after restart"),
        R9_NATIVE_REPOSITORY
    );
}

#[test]
fn r9_save_as_failure_after_import_preserves_pending_document_and_both_files() {
    let directory = R9Directory::new();
    let repository = directory.0.join("strategy-repository.json");
    std::fs::write(&repository, R9_NATIVE_REPOSITORY).expect("legacy source");
    let imported = application::repository::import_last_draft(&directory.0)
        .expect("verified import")
        .expect("draft");
    let mut editor = Editor {
        document: Some(Document::parse(&imported).expect("native draft")),
        ..Editor::default()
    };
    // The destination appears between importing and the first observed save.
    let path = directory.0.join("strategy-v2.json");
    std::fs::write(&path, b"appeared during import").expect("unobserved destination");
    let error = editor.save_as(path.clone()).expect_err("conflict");
    assert!(error.kind().is_conflict());
    assert!(editor.path.is_none());
    assert!(editor.saved.is_none());
    assert!(editor.dirty());
    assert_eq!(
        editor.document.as_ref().expect("retained draft").bytes(),
        imported
    );
    assert_eq!(
        std::fs::read(path).expect("destination"),
        b"appeared during import"
    );
    assert_eq!(
        std::fs::read(repository).expect("legacy source"),
        R9_NATIVE_REPOSITORY
    );
}

#[test]
fn r9_bad_legacy_hash_never_creates_a_primary_or_rewrites_the_source() {
    let directory = R9Directory::new();
    let repository = directory.0.join("strategy-repository.json");
    let bytes = String::from_utf8(R9_NATIVE_REPOSITORY.to_vec())
        .expect("fixture")
        .replace("2026-11-02", "2026-11-03");
    std::fs::write(&repository, &bytes).expect("corrupt hash");
    let (editor, error) = open_editor(&directory.0);
    assert!(error.is_some());
    assert!(editor.document.is_none());
    assert!(!directory.0.join("strategy-v2.json").exists());
    assert_eq!(
        std::fs::read(repository).expect("untouched"),
        bytes.as_bytes()
    );
}

#[test]
fn r9_import_never_invents_a_native_conversion_for_a_go_v1_draft() {
    let directory = R9Directory::new();
    let source = include_bytes!("../../../strategy/testdata/oracle/repository-v1-go.json");
    let repository = directory.0.join("strategy-repository.json");
    std::fs::write(&repository, source).expect("Go source");
    let (editor, error) = open_editor(&directory.0);
    assert!(error.is_some());
    assert!(editor.document.is_none());
    assert!(!directory.0.join("strategy-v2.json").exists());
    assert_eq!(std::fs::read(repository).expect("untouched"), source);
}

#[test]
fn r9_damaged_primary_is_archived_exactly_before_normal_save_can_recover() {
    let directory = R9Directory::new();
    let path = directory.0.join("strategy-v2.json");
    let damaged = b"{ damaged \xff";
    std::fs::write(&path, damaged).expect("damaged document");
    let (mut editor, warning) = open_editor(&directory.0);
    assert!(warning.is_some());
    assert!(editor.dirty());
    assert_eq!(editor.path, Some(path.clone()));
    assert_eq!(std::fs::read(&path).expect("original until save"), damaged);
    let archive = directory.0.join("strategy-v2.json.invalid");
    assert_eq!(std::fs::read(&archive).expect("durable archive"), damaged);
    let mut ui_editor = Editor::default();
    ui_editor
        .open(path.clone())
        .expect("recovered through the open action");
    let status = ui_editor.open_status();
    assert!(status.starts_with("Se empezó un documento vacío."));
    assert!(status.contains(archive.to_string_lossy().as_ref()));
    assert!(
        ui_editor.document.as_ref().expect("empty recovery").value()["events"]
            .as_array()
            .expect("events")
            .is_empty()
    );
    editor.save().expect("normal recovery save");
    assert!(!editor.dirty());
    let bytes = std::fs::read(&path).expect("saved default");
    Document::parse(&bytes).expect("valid recovered document");
    assert_eq!(std::fs::read(archive).expect("archive retained"), damaged);
}

#[test]
fn r9_recovery_save_checks_the_observed_damaged_bytes() {
    let directory = R9Directory::new();
    let path = directory.0.join("strategy-v2.json");
    std::fs::write(&path, b"{").expect("damaged");
    let (mut editor, warning) = open_editor(&directory.0);
    assert!(warning.is_some());
    std::fs::write(&path, b"external edit").expect("concurrent change");
    assert!(matches!(editor.save(), Err(files::Error::Conflict { .. })));
    assert!(editor.dirty());
    assert_eq!(std::fs::read(path).expect("protected"), b"external edit");
    assert_eq!(
        std::fs::read(directory.0.join("strategy-v2.json.invalid")).expect("archive"),
        b"{"
    );
}

#[test]
fn r9_future_versions_and_unavailable_archive_preserve_the_current_editor() {
    let directory = R9Directory::new();
    let path = directory.0.join("strategy-v2.json");
    let mut editor = Editor::default();
    editor.create().expect("current document");
    editor
        .save_as(directory.0.join("current.json"))
        .expect("current saved");
    let current = editor.document.as_ref().expect("current").bytes().to_vec();
    for (field, version) in [
        ("contractVersion", "strategy.v3"),
        ("schemaVersion", "9.0.0"),
    ] {
        let mut future = serde_json::from_slice::<Value>(&current).expect("fixture");
        future[field] = json!(version);
        let bytes = serde_json::to_vec(&future).expect("future document");
        std::fs::write(&path, &bytes).expect("future source");
        assert!(editor.open(path.clone()).is_err());
        assert_eq!(
            editor.document.as_ref().expect("current retained").bytes(),
            current
        );
        assert_eq!(std::fs::read(&path).expect("future retained"), bytes);
        assert!(!directory.0.join("strategy-v2.json.invalid").exists());
    }
    std::fs::write(&path, b"{").expect("damaged source");
    let lock =
        std::fs::File::create(directory.0.join("strategy-v2.json.lock")).expect("busy archive");
    lock.lock().expect("hold archive lock");
    assert!(editor.open(path.clone()).is_err());
    assert_eq!(
        editor.document.as_ref().expect("current retained").bytes(),
        current
    );
    assert_eq!(std::fs::read(path).expect("original retained"), b"{");
    assert!(!directory.0.join("strategy-v2.json.invalid").exists());
}
