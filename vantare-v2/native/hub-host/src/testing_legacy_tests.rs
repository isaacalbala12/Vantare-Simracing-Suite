use super::*;
use crate::test_support::Root;
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
fn equal_mtime_prefers_editor_and_discard_archives_only_after_core_reply() {
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
    assert!(!first.exists() && !second.exists());
    assert!(
        first.with_extension("json.imported").exists()
            && second.with_extension("json.imported").exists()
    );
}
