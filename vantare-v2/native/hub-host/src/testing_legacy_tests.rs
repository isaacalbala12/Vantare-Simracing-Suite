use super::*;
use std::os::windows::fs::OpenOptionsExt;
struct Root {
    path: PathBuf,
}
impl Root {
    fn new() -> Self {
        let base = std::env::var_os("VANTARE_HUB_QA_ROOT").map_or_else(
            || std::env::temp_dir().join("vantare-hub-qa"),
            PathBuf::from,
        );
        let path = base.join(vantare_services::random_id().expect("fixture id"));
        fs::create_dir_all(&path).expect("fixture root");
        Self { path }
    }
}
impl Drop for Root {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.path).expect("owned fixture cleanup");
    }
}
use vantare_ipc::services_protocol::report_document::Draft;

fn fields(title: &str) -> ReportFields {
    ReportFields {
        module: "hub".into(),
        action_text: title.into(),
        ..Default::default()
    }
}
fn editor(root: &Path, title: &str, time: u64) -> PathBuf {
    let path = root.join("testing-center/editor-draft.json");
    fs::create_dir_all(path.parent().expect("local draft fixture")).expect("local draft fixture");
    fs::write(
        &path,
        serde_json::to_vec(&serde_json::json!({"version":1,"fields":fields(title)}))
            .expect("local draft fixture"),
    )
    .expect("local draft fixture");
    fs::File::options()
        .write(true)
        .open(&path)
        .expect("local draft fixture")
        .set_times(
            fs::FileTimes::new()
                .set_modified(SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(time)),
        )
        .expect("local draft fixture");
    path
}
fn local(root: &Path, title: &str, time: u64) -> PathBuf {
    let path = root.join("testing-center/report-draft.json");
    fs::create_dir_all(path.parent().expect("local draft fixture")).expect("local draft fixture");
    fs::write(
        &path,
        serde_json::to_vec(
            &serde_json::json!({"schemaVersion":1,"module":"workshop","fields":[title,"","",""]}),
        )
        .expect("local draft fixture"),
    )
    .expect("local draft fixture");
    fs::File::options()
        .write(true)
        .open(&path)
        .expect("local draft fixture")
        .set_times(
            fs::FileTimes::new()
                .set_modified(SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(time)),
        )
        .expect("local draft fixture");
    path
}
fn reply(fields: Option<ReportFields>) -> Reply {
    Reply::Draft {
        draft: fields.map(|fields| Draft {
            schema_version: 1,
            idempotency_key: "private-core-key".into(),
            fields: fields.core(),
            screenshots: vec![],
        }),
        message: "Guardado".into(),
    }
}
fn import(state: &mut State) -> ReportFields {
    let Next::Import(Command::DraftSave { fields }) = state
        .complete(Operation::Load, reply(None))
        .expect("local draft fixture")
    else {
        panic!("expected protected import")
    };
    ReportFields::from(&fields)
}
#[test]
fn import_waits_for_core_confirmation_and_preserves_both_original_byte_streams() {
    let root = Root::new();
    let first = editor(&root.path, "editor private text", 100);
    let second = local(&root.path, "local private text", 101);
    let original = [
        fs::read(&first).expect("local draft fixture"),
        fs::read(&second).expect("local draft fixture"),
    ];
    let mut state = State::new(&root.path);
    state.begin(Operation::Load);
    let selected = import(&mut state);
    assert_eq!(selected.action_text, "local private text");
    assert_eq!(selected.module, "unknown");
    assert!(first.exists() && second.exists());
    assert!(matches!(
        state
            .complete(Operation::Load, reply(Some(selected)))
            .expect("local draft fixture"),
        Next::Complete(Reply::Draft { draft: Some(_), .. })
    ));
    assert_eq!(state.legacy, LegacyMigration::Imported);
    for (path, bytes) in [(&first, &original[0]), (&second, &original[1])] {
        assert!(!path.exists());
        assert_eq!(
            &fs::read(path.with_extension("json.imported")).expect("local draft fixture"),
            bytes
        );
    }
    state.begin(Operation::Load);
    assert!(matches!(
        state
            .complete(Operation::Load, reply(None))
            .expect("local draft fixture"),
        Next::Complete(Reply::Draft { draft: None, .. })
    ));
}
#[test]
fn existing_protected_draft_wins_without_being_written_or_changed() {
    let root = Root::new();
    let path = editor(&root.path, "old", 100);
    let mut state = State::new(&root.path);
    state.begin(Operation::Load);
    let expected = fields("protected newer value");
    let Next::Complete(Reply::Draft {
        draft: Some(saved), ..
    }) = state
        .complete(Operation::Load, reply(Some(expected.clone())))
        .expect("local draft fixture")
    else {
        panic!("keep protected draft")
    };
    assert_eq!(ReportFields::from(&saved.fields), expected);
    assert_eq!(saved.idempotency_key, "private-core-key");
    assert!(!path.exists());
    assert!(path.with_extension("json.imported").exists());
}
#[test]
fn failed_or_wrong_core_confirmation_never_archives_the_only_copy() {
    let root = Root::new();
    let path = editor(&root.path, "preserve", 100);
    let mut state = State::new(&root.path);
    state.begin(Operation::Load);
    import(&mut state);
    assert!(matches!(
        state
            .complete(
                Operation::Load,
                Reply::Error {
                    message: "private service failure".into()
                }
            )
            .expect("local draft fixture"),
        Next::Complete(Reply::Error { .. })
    ));
    assert!(path.exists());
    state.begin(Operation::Load);
    import(&mut state);
    assert!(matches!(
        state.complete(Operation::Load, reply(None)),
        Err(HostError::Rejected)
    ));
    assert!(path.exists());
    state.begin(Operation::Load);
    import(&mut state);
    assert!(matches!(
        state.complete(Operation::Load, reply(Some(fields("other result")))),
        Err(HostError::Rejected)
    ));
    assert!(path.exists());
    assert!(!path.with_extension("json.imported").exists());
}
#[test]
fn corrupt_future_and_oversized_documents_are_left_in_place() {
    let root = Root::new();
    let path = editor(&root.path, "original", 100);
    for bytes in [
        b"malformed".to_vec(),
        serde_json::to_vec(&serde_json::json!({"version":2,"fields":fields("future")}))
            .expect("local draft fixture"),
        vec![b'x'; usize::try_from(EDITOR_LIMIT).expect("fixture limit fits") + 1],
    ] {
        fs::write(&path, &bytes).expect("local draft fixture");
        let mut state = State::new(&root.path);
        state.begin(Operation::Load);
        let Next::Complete(Reply::Draft {
            draft: None,
            message,
        }) = state
            .complete(Operation::Load, reply(None))
            .expect("local draft fixture")
        else {
            panic!("no unsafe import")
        };
        assert!(message.contains("se conserva"));
        assert_eq!(fs::read(&path).expect("local draft fixture"), bytes);
    }
}
#[test]
fn changed_sources_and_conflicting_archives_remain_recoverable() {
    let root = Root::new();
    let path = editor(&root.path, "first", 100);
    let mut state = State::new(&root.path);
    state.begin(Operation::Load);
    let selected = import(&mut state);
    fs::write(&path, b"changed by another Hub").expect("local draft fixture");
    state
        .complete(Operation::Load, reply(Some(selected)))
        .expect("local draft fixture");
    assert_eq!(
        fs::read(&path).expect("local draft fixture"),
        b"changed by another Hub"
    );
    assert!(!path.with_extension("json.imported").exists());
    editor(&root.path, "second", 101);
    let mut state = State::new(&root.path);
    fs::write(path.with_extension("json.imported"), b"older archive").expect("local draft fixture");
    state.begin(Operation::Load);
    let selected = import(&mut state);
    state
        .complete(Operation::Load, reply(Some(selected)))
        .expect("local draft fixture");
    assert!(path.exists());
    assert_eq!(
        fs::read(path.with_extension("json.imported")).expect("local draft fixture"),
        b"older archive"
    );
}
#[test]
fn equal_mtime_prefers_editor_and_discard_without_import_confirmation_preserves_sources() {
    let root = Root::new();
    let first = editor(&root.path, "editor wins", 100);
    let second = local(&root.path, "local", 100);
    let mut state = State::new(&root.path);
    state.begin(Operation::Load);
    assert_eq!(import(&mut state).action_text, "editor wins");
    state.begin(Operation::Discard);
    assert!(first.exists() && second.exists());
    state
        .complete(Operation::Discard, reply(None))
        .expect("local draft fixture");
    assert!(first.exists() && second.exists());
    assert!(
        !first.with_extension("json.imported").exists()
            && !second.with_extension("json.imported").exists()
    );
}

#[test]
fn save_and_discard_without_successful_load_never_retire_unseen_sources() {
    for failed_load in [false, true] {
        for operation in [Operation::Save, Operation::Discard] {
            let root = Root::new();
            let path = editor(&root.path, "unseen", 100);
            let mut state = State::new(&root.path);
            if failed_load {
                state.begin(Operation::Load);
                import(&mut state);
                state
                    .complete(
                        Operation::Load,
                        Reply::Error {
                            message: "rejected".into(),
                        },
                    )
                    .unwrap();
            }
            state.begin(operation);
            state
                .complete(
                    operation,
                    reply(if matches!(operation, Operation::Save) {
                        Some(fields("new editor"))
                    } else {
                        None
                    }),
                )
                .unwrap();
            assert!(path.exists());
            assert!(!path.with_extension("json.imported").exists());
        }
    }
}
#[test]
fn cleaning_matches_gpui_and_archive_keeps_original_bytes() {
    let root = Root::new();
    let path = editor(
        &root.path,
        &("a\r\u{202e}b\n\t".to_owned() + &"\u{e9}".repeat(3000)),
        100,
    );
    let bytes = fs::read(&path).unwrap();
    let mut state = State::new(&root.path);
    state.begin(Operation::Load);
    let selected = import(&mut state);
    assert!(selected.action_text.starts_with("a b\n\t"));
    assert!(selected.action_text.len() <= FIELD_LIMITS[0]);
    assert!(selected.valid());
    state
        .complete(Operation::Load, reply(Some(selected)))
        .unwrap();
    assert_eq!(state.legacy, LegacyMigration::ImportedTrimmed);
    assert_eq!(
        fs::read(path.with_extension("json.imported")).unwrap(),
        bytes
    );
}
#[test]
fn protected_fields_are_not_revalidated_as_editor_input() {
    let root = Root::new();
    let mut state = State::new(&root.path);
    state.begin(Operation::Load);
    assert!(
        state
            .complete(Operation::Load, reply(Some(fields("already saved\r"))))
            .is_ok()
    );
}
#[test]
fn local_corrupt_and_oversize_sources_are_preserved_and_scan_is_cached() {
    for bytes in [
        b"broken".to_vec(),
        vec![b'x'; usize::try_from(LOCAL_LIMIT).expect("fixture limit fits") + 1],
    ] {
        let root = Root::new();
        let path = local(&root.path, "local", 100);
        fs::write(&path, &bytes).unwrap();
        let mut state = State::new(&root.path);
        state.begin(Operation::Load);
        state.complete(Operation::Load, reply(None)).unwrap();
        assert_eq!(state.legacy, LegacyMigration::Preserved);
        assert_eq!(fs::read(&path).unwrap(), bytes);
        local(&root.path, "now valid but not reread", 101);
        state.begin(Operation::Load);
        assert!(matches!(
            state.complete(Operation::Load, reply(None)).unwrap(),
            Next::Complete(_)
        ));
    }
}
#[test]
fn identical_archive_retries_and_partial_retirement_preserve_remaining_source() {
    let root = Root::new();
    let first = editor(&root.path, "selected", 101);
    let second = local(&root.path, "other", 100);
    let mut state = State::new(&root.path);
    state.begin(Operation::Load);
    let selected = import(&mut state);
    fs::hard_link(&first, first.with_extension("json.imported")).unwrap();
    // Deterministic Windows remove failure after hard_link, without timers.
    let held = fs::OpenOptions::new()
        .read(true)
        .share_mode(1 | 2)
        .open(&first)
        .unwrap();
    state
        .complete(Operation::Load, reply(Some(selected)))
        .unwrap();
    assert!(first.exists());
    assert!(!second.exists());
    assert!(second.with_extension("json.imported").exists());
    drop(held);
    // Next session recovers the selected source and accepts its identical archive.
    let mut retry = State::new(&root.path);
    retry.begin(Operation::Load);
    let selected = import(&mut retry);
    retry
        .complete(Operation::Load, reply(Some(selected)))
        .unwrap();
    assert!(!first.exists());
    assert!(first.with_extension("json.imported").exists());
}
#[test]
fn symbolic_source_is_never_followed() {
    let root = Root::new();
    let target = root.path.join("private.json");
    fs::write(&target, b"private untouched").unwrap();
    let path = root.path.join("testing-center/editor-draft.json");
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    if let Err(error) = std::os::windows::fs::symlink_file(&target, &path) {
        if error.raw_os_error() == Some(1314)
            || error.kind() == std::io::ErrorKind::PermissionDenied
        {
            eprintln!("SKIP: QA symlink requires developer mode or symlink privilege");
            return;
        }
        panic!("QA symlink failed: {error}");
    }
    let mut state = State::new(&root.path);
    state.begin(Operation::Load);
    state.complete(Operation::Load, reply(None)).unwrap();
    assert_eq!(state.legacy, LegacyMigration::Preserved);
    assert_eq!(fs::read(&target).unwrap(), b"private untouched");
    assert!(fs::symlink_metadata(path).unwrap().file_type().is_symlink());
}

#[test]
fn every_field_uses_its_gpui_byte_limit_without_splitting_utf8() {
    for limit in FIELD_LIMITS {
        let cleaned = clean_field(&"\u{e9}".repeat(limit), limit);
        assert!(cleaned.len() <= limit);
        assert!(cleaned.len() + 2 > limit);
        assert_eq!(clean_field(&cleaned, limit), cleaned);
    }
    assert_eq!(clean_field("a\0b\r\nc\td\u{200b}e", 4096), "a b \nc\tde");
}

#[test]
fn failed_archiving_is_not_retried_by_autosave_or_discard_until_load() {
    let root = Root::new();
    let path = editor(&root.path, "old", 100);
    let archive = path.with_extension("json.imported");
    fs::write(&archive, b"conflicting old archive").unwrap();
    let mut state = State::new(&root.path);
    state.begin(Operation::Load);
    state
        .complete(Operation::Load, reply(Some(fields("protected"))))
        .unwrap();
    fs::remove_file(&archive).unwrap();
    for operation in [Operation::Save, Operation::Save, Operation::Discard] {
        state.begin(operation);
        state
            .complete(
                operation,
                reply(if matches!(operation, Operation::Discard) {
                    None
                } else {
                    Some(fields("protected"))
                }),
            )
            .unwrap();
        assert!(
            path.exists() && !archive.exists(),
            "no filesystem retry until an explicit Load"
        );
    }
    state.begin(Operation::Load);
    state
        .complete(Operation::Load, reply(Some(fields("protected"))))
        .unwrap();
    assert!(!path.exists() && archive.exists());
    assert!(state.warning.is_none());
    assert_eq!(state.legacy, LegacyMigration::Archived);
}
