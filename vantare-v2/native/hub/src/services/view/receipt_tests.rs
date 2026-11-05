use super::remember_receipt;
use crate::services::protocol::report_document::{Fields, Receipt};

#[test]
fn legacy_files_are_archived_only_after_protected_draft_ack() {
    use super::*;
    let root = std::env::temp_dir().join(format!("vanta-13b-ack-{}", std::process::id()));
    let directory = root.join("testing-center");
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("editor-draft.json");
    let fields = Fields {
        action_text: "private-fixture".into(),
        module: "hub".into(),
        ..Default::default()
    };
    std::fs::write(
        &path,
        serde_json::json!({"version":1,"fields":fields}).to_string(),
    )
    .unwrap();
    let cleanup = root.clone();
    gpui_platform::headless().run(move |cx| {
        let (send, _requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| super::purchase_tests::fixture(cx, send, &root));
        remote.update(cx, |remote, cx| {
            let (loaded, editor) = legacy_editor(&root, cx);
            assert!(loaded.as_ref().is_ok_and(Option::is_some));
            assert!(!editor.dirty);
            remote.editor = crate::testing::Editor::new(fields.clone(), cx);
            remote.editor.dirty = true;
            remote.report_revision = Some(remote.editor.revision);
            remote.imported_draft(None, String::new(), cx);
            assert!(matches!(&remote.queued, Some(Command::DraftSave { fields: saved }) if saved == &fields));
            assert!(path.exists());
            assert!(!path.with_extension("json.imported").exists());
            remote.imported_draft(Some(super::super::protocol::report_document::Draft {
                schema_version: 1,
                idempotency_key: "draft_fixture".into(),
                fields: fields.clone(),
                screenshots: Vec::new(),
            }), "guardado".into(), cx);
            assert!(!path.exists());
            assert!(path.with_extension("json.imported").exists());
            assert!(remote.legacy_draft.as_ref().is_ok_and(Option::is_none));
        });
        crate::quit_headless_test(cx);
    });
    assert!(
        crate::testing::legacy_draft::LegacyDraft::load(&cleanup)
            .unwrap()
            .is_none()
    );
    std::fs::remove_dir_all(cleanup).unwrap();
}

#[test]
fn different_protected_draft_wins_and_archives_plaintext() {
    use super::*;
    let root = std::env::temp_dir().join(format!("vanta-13b-existing-{}", std::process::id()));
    let directory = root.join("testing-center");
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("editor-draft.json");
    let legacy = Fields {
        action_text: "legacy-private".into(),
        module: "hub".into(),
        ..Default::default()
    };
    let original = serde_json::json!({"version":1,"fields":legacy}).to_string();
    std::fs::write(&path, &original).unwrap();
    let cleanup = root.clone();
    gpui_platform::headless().run(move |cx| {
        let (send, _requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| super::purchase_tests::fixture(cx, send, &root));
        remote.update(cx, |remote, cx| {
            remote.editor = crate::testing::Editor::new(legacy.clone(), cx);
            remote.editor.dirty = true;
            remote.report_revision = Some(remote.editor.revision);
            assert!(remote.editor.dirty);
            assert_eq!(std::fs::read_to_string(&path).unwrap(), original);
            let protected = Fields {
                action_text: "protected-private".into(),
                module: "hub".into(),
                ..Default::default()
            };
            remote.imported_draft(
                Some(super::super::protocol::report_document::Draft {
                    schema_version: 1,
                    idempotency_key: "draft_fixture".into(),
                    fields: protected.clone(),
                    screenshots: Vec::new(),
                }),
                "loaded".into(),
                cx,
            );
            assert!(!path.exists());
            assert!(path.with_extension("json.imported").exists());
            assert_eq!(remote.editor.fields(cx).action_text, protected.action_text);
            assert_eq!(remote.editor.fields(cx).module, protected.module);
            assert_eq!(
                remote.editor.fields_snapshot(cx).context_text,
                "Tipo: Algo falla\n"
            );
            assert_eq!(
                std::fs::read_to_string(path.with_extension("json.imported")).unwrap(),
                original
            );
        });
        crate::quit_headless_test(cx);
    });
    std::fs::remove_dir_all(cleanup).unwrap();
}

#[test]
fn archive_failure_still_loads_protected_draft_and_keeps_both_files() {
    use super::*;
    let root = std::env::temp_dir().join(format!("vanta-13b-collision-{}", std::process::id()));
    let directory = root.join("testing-center");
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("editor-draft.json");
    std::fs::write(&path, serde_json::json!({"version":1,"fields": Fields { action_text: "legacy".into(), module: "hub".into(), ..Default::default() }}).to_string()).unwrap();
    std::fs::write(path.with_extension("json.imported"), b"unrelated archive").unwrap();
    let cleanup = root.clone();
    gpui_platform::headless().run(move |cx| {
        let (send, _requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| super::purchase_tests::fixture(cx, send, &root));
        remote.update(cx, |remote, cx| {
            remote.report_revision = Some(remote.editor.revision);
            remote.imported_draft(
                Some(super::super::protocol::report_document::Draft {
                    schema_version: 1,
                    idempotency_key: "draft_fixture".into(),
                    fields: Fields {
                        action_text: "protected".into(),
                        module: "hub".into(),
                        ..Default::default()
                    },
                    screenshots: Vec::new(),
                }),
                "loaded".into(),
                cx,
            );
            assert_eq!(remote.editor.fields(cx).action_text, "protected");
            assert!(remote.editor.message.contains("conserva"));
            assert!(path.exists());
            assert_eq!(
                std::fs::read(path.with_extension("json.imported")).unwrap(),
                b"unrelated archive"
            );
        });
        crate::quit_headless_test(cx);
    });
    std::fs::remove_dir_all(cleanup).unwrap();
}

#[test]
fn pending_discard_and_existing_queue_do_not_import_legacy_draft() {
    use super::*;
    let root = std::env::temp_dir().join(format!("vanta-13b-queue-{}", std::process::id()));
    let directory = root.join("testing-center");
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("editor-draft.json");
    std::fs::write(&path, serde_json::json!({"version":1,"fields": Fields { action_text: "legacy".into(), module: "hub".into(), ..Default::default() }}).to_string()).unwrap();
    let cleanup = root.clone();
    gpui_platform::headless().run(move |cx| {
        let (send, _requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| super::purchase_tests::fixture(cx, send, &root));
        remote.update(cx, |remote, cx| {
            remote.queued = Some(Command::DraftDiscard);
            remote.report_revision = Some(remote.editor.revision);
            remote.imported_draft(None, "loaded".into(), cx);
            assert!(matches!(remote.queued, Some(Command::DraftDiscard)));
            remote.discard_pending = true;
            remote.imported_draft(None, "discarded".into(), cx);
            assert!(matches!(remote.queued, Some(Command::DraftDiscard)));
            assert!(path.exists());
        });
        crate::quit_headless_test(cx);
    });
    std::fs::remove_dir_all(cleanup).unwrap();
}

#[test]
fn protected_save_failure_leaves_legacy_source_intact() {
    use super::*;
    let root = std::env::temp_dir().join(format!("vanta-13b-dpapi-fail-{}", std::process::id()));
    let directory = root.join("testing-center");
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("editor-draft.json");
    let original = serde_json::json!({"version":1,"fields": Fields { action_text: "legacy".into(), module: "hub".into(), ..Default::default() }}).to_string();
    std::fs::write(&path, &original).unwrap();
    let cleanup = root.clone();
    gpui_platform::headless().run(move |cx| {
        let (send, _requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| super::purchase_tests::fixture(cx, send, &root));
        remote.update(cx, |remote, cx| {
            remote.active = Area::Report;
            remote.inflight = Inflight::User;
            remote.close_save_pending = true;
            remote.close_save_fields = Some(Fields {
                action_text: "legacy".into(),
                module: "hub".into(),
                ..Default::default()
            });
            remote.report_revision = Some(remote.editor.revision);
            remote.complete(
                Reply::Error {
                    message: "No se pudo proteger".into(),
                },
                cx,
            );
            assert_eq!(remote.take_close_save_result(), Some(false));
            assert_eq!(std::fs::read_to_string(&path).unwrap(), original);
            assert!(!path.with_extension("json.imported").exists());
        });
        crate::quit_headless_test(cx);
    });
    std::fs::remove_dir_all(cleanup).unwrap();
}

#[test]
fn final_save_acknowledges_only_the_requested_fields() {
    use super::*;
    gpui_platform::headless().run(move |cx| {
        let (send, _requests) = mpsc::sync_channel(8);
        let remote =
            cx.new(|cx| super::purchase_tests::fixture(cx, send, std::path::Path::new(".")));
        remote.update(cx, |remote, cx| {
            let fields = Fields {
                action_text: "editado".into(),
                context_text: "Tipo: Algo falla\n".into(),
                module: "hub".into(),
                ..Default::default()
            };
            remote.close_save_pending = true;
            remote.close_save_fields = Some(fields.clone());
            remote.report_revision = Some(remote.editor.revision);
            remote.active = Area::Report;
            remote.inflight = Inflight::User;
            remote.complete(
                Reply::Draft {
                    draft: Some(super::super::protocol::report_document::Draft {
                        schema_version: 1,
                        idempotency_key: "draft_fixture".into(),
                        fields: fields.clone(),
                        screenshots: Vec::new(),
                    }),
                    message: "guardado".into(),
                },
                cx,
            );
            assert_eq!(remote.take_close_save_result(), Some(true));
            assert_eq!(remote.editor.fields(cx), fields);
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn server_receipts_keep_identity_state_and_date_without_duplicating_retries() {
    let mut receipts = vec![];
    let fields = Fields {
        action_text: "Título enviado".into(),
        observed_text: "Texto privado".into(),
        module: "hub".into(),
        ..Default::default()
    };
    let receipt = Receipt {
        report_id: "report_0123456789abcdef".into(),
        report_state: "submitted".into(),
        idempotent: false,
        created_at: "2026-10-05T20:00:00Z".into(),
    };
    remember_receipt(&mut receipts, fields, receipt.clone());
    let mut retry = receipt.clone();
    retry.idempotent = true;
    remember_receipt(&mut receipts, Fields::default(), retry);
    assert_eq!(receipts.len(), 1);
    assert_eq!(receipts[0].0.action_text, "Título enviado");
    assert_eq!(receipts[0].0.module, "hub");
    assert!(receipts[0].0.observed_text.is_empty());
    assert_eq!(receipts[0].1.report_state, receipt.report_state);
    assert_eq!(receipts[0].1.created_at, receipt.created_at);
    assert!(receipts[0].1.idempotent);
}
