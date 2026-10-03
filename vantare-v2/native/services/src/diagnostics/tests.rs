use super::*;

#[test]
fn usage_rejects_identifiers_outside_the_closed_catalog() {
    assert!(
        !Usage::LayoutWidgets {
            widget_types: vec!["personal-layout-name".into()]
        }
        .valid()
    );
    assert!(
        !Usage::LiveSessionStarted {
            simulator: "user@email.test".into()
        }
        .valid()
    );
    assert!(serde_json::from_str::<Usage>(r#"{"event":"app_started","properties":{"version":"1.0","channel":"beta","email":"private@example.test"}}"#).is_err());
}

pub(super) fn root() -> PathBuf {
    let path = std::env::temp_dir().join(format!("vantare-posthog-{}", uuid().expect("entropy")));
    fs::create_dir_all(&path).expect("test dir");
    path
}
#[test]
fn identifier_is_uuid_v4_stable_and_shared_by_concurrent_writers() {
    let root = root();
    let handles: Vec<_> = (0..8)
        .map(|_| {
            let path = root.clone();
            std::thread::spawn(move || anonymous_id(&path).expect("id"))
        })
        .collect();
    let id = anonymous_id(&root).expect("id");
    assert!(valid_uuid(&id));
    for handle in handles {
        assert_eq!(handle.join().expect("thread"), id);
    }
    fs::write(root.join("anonymous-id"), b"not-a-license-fingerprint").expect("corrupt");
    assert_eq!(anonymous_id(&root), Err(Error::Protocol));
    fs::remove_dir_all(root).expect("cleanup");
}
#[test]
fn paths_are_cleaned_case_insensitively_without_changing_other_frames() {
    assert_eq!(
        clean_paths("C:/Users/Alice/a.rs"),
        "C:/Users/[usuario]/a.rs"
    );
    assert_eq!(
        clean_paths(r"C:\Users\Alice\a.rs D:\USERS\Bob\b.rs"),
        r"C:\Users\[usuario]\a.rs D:\USERS\[usuario]\b.rs"
    );
    assert_eq!(clean_paths("frame 5: core::tick"), "frame 5: core::tick");
    assert_eq!(
        clean_paths(r"C:\\Users\\Alice\\a.rs"),
        r"C:\Users\[usuario]\a.rs"
    );
}
#[test]
fn queue_is_bounded_and_privacy_failures_are_closed() {
    let root = root();
    assert_eq!(Privacy::load(&root).expect("defaults"), Privacy::default());
    for _ in 0..QUEUE_LIMIT {
        write_crash(&root, "core", &"é".repeat(3000), &"trace".repeat(10000))
            .expect("bounded crash");
    }
    assert_eq!(
        write_crash(&root, "core", "panic", "trace"),
        Err(Error::TooLarge)
    );
    for slot in 0..QUEUE_LIMIT {
        assert!(
            fs::metadata(root.join(format!("crashes/{slot:02}.json")))
                .expect("file")
                .len()
                <= FILE_LIMIT
        );
    }
    fs::write(root.join(PRIVACY_FILE), b"invalid").expect("invalid config");
    assert_eq!(
        write_crash(&root, "core", "panic", "trace"),
        Err(Error::Protocol)
    );
    fs::remove_dir_all(root).expect("cleanup");
}
#[test]
fn panic_child() {
    if let Some(path) = std::env::var_os("VANTARE_TEST_CRASH_ROOT") {
        install_at(PathBuf::from(path), "test-child");
        panic!("test panic C:\\Users\\test-user\\file.rs");
    }
}
#[test]
fn real_hook_writes_a_small_sanitized_crash() {
    let root = root();
    let status = std::process::Command::new(std::env::current_exe().expect("test exe"))
        .args(["--exact", "diagnostics::tests::panic_child", "--nocapture"])
        .env("VANTARE_TEST_CRASH_ROOT", &root)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .expect("child");
    assert!(!status.success());
    let bytes = read_bounded(&root.join("crashes/00.json"), FILE_LIMIT).expect("hook file");
    let crash: Crash = serde_json::from_slice(&bytes).expect("crash");
    assert_eq!(crash.binary, "test-child");
    assert!(crash.message.contains("test panic"));
    assert!(!crash.message.contains("test-user"));
    assert!(!crash.backtrace.is_empty());
    assert!(crash.timestamp > 0);
    fs::remove_dir_all(root).expect("cleanup");
}
