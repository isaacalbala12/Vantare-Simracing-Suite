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
    std::fs::remove_dir_all(cleanup).unwrap();
}

#[test]
fn different_protected_draft_preserves_both_versions_and_close_writes_no_plaintext() {
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
            assert!(remote.persist(cx).is_err());
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
            assert!(path.exists());
            assert!(!path.with_extension("json.imported").exists());
            assert_eq!(remote.editor.fields(cx).action_text, protected.action_text);
            assert_eq!(remote.editor.fields(cx).module, protected.module);
            assert!(remote.editor.diagnostic_fields(cx).context_text.is_empty());
            assert_eq!(std::fs::read_to_string(&path).unwrap(), original);
        });
        crate::quit_headless_test(cx);
    });
    std::fs::remove_dir_all(cleanup).unwrap();
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
